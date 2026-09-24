import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface IncrementalIndexResult {
  graph: { files: string[] };
  indexing: {
    mode: 'incremental' | 'full';
    changedInputs: string[];
    analyzedSourcePaths: string[];
    reusedSourcePaths: string[];
    fullRebuildReason?: string;
  };
  operations: {
    analyzedSourceFiles: number;
    reusedSourceFiles: number;
  };
}

async function writeOperations(
  operations: Record<string, number> | undefined,
): Promise<void> {
  const reportPath = process.env.MUSUBIX_OPERATION_REPORT;
  if (
    !reportPath ||
    !operations ||
    !Object.values(operations).every(Number.isInteger)
  ) {
    return;
  }
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(operations)}\n`);
}

function withoutGeneratedAt(value: Record<string, unknown>): Record<string, unknown> {
  const { generatedAt: _, ...rest } = value;
  return rest;
}

describe('CHANGE-0005 CodeGraph performance', () => {
  /** @id TEST-M5-GRAPH-INCREMENTAL-001
   * @verifies REQ-M5-GRAPH-001
   */
  it('TEST-M5-GRAPH-INCREMENTAL-001 reanalyzes only a modified leaf and its importer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'musubix5-codegraph-incremental-'));
    try {
      const sources: Record<string, string> = {
        'leaf.ts': 'export const leaf = 1;\n',
        'parent.ts': "import { leaf } from './leaf.js';\nexport const parent = leaf;\n",
        'standalone-a.ts': 'export const standaloneA = 1;\n',
        'standalone-b.ts': 'export const standaloneB = 1;\n',
        'standalone-c.ts': 'export const standaloneC = 1;\n',
        'standalone-d.ts': 'export const standaloneD = 1;\n',
      };
      await Promise.all(
        Object.entries(sources).map(([path, text]) => writeFile(join(root, path), text)),
      );

      const { indexGraph } = await import('../packages/analysis/src/graph.js');
      const runIndex = indexGraph as unknown as (
        root: string,
        options: { persist: boolean; refresh: boolean },
      ) => Promise<IncrementalIndexResult>;

      await runIndex(root, { persist: true, refresh: false });
      await writeFile(join(root, 'leaf.ts'), 'export const leaf = 2;\n');

      const incremental = await runIndex(root, { persist: true, refresh: true });
      await writeOperations(incremental.operations);
      const incrementalCache = JSON.parse(
        await readFile(join(root, '.musubix', 'cache', 'codegraph.json'), 'utf8'),
      ) as Record<string, unknown>;

      await runIndex(root, { persist: true, refresh: false });
      const cleanFullCache = JSON.parse(
        await readFile(join(root, '.musubix', 'cache', 'codegraph.json'), 'utf8'),
      ) as Record<string, unknown>;

      expect(incremental.indexing).toEqual({
        mode: 'incremental',
        changedInputs: ['leaf.ts'],
        analyzedSourcePaths: ['leaf.ts', 'parent.ts'],
        reusedSourcePaths: [
          'standalone-a.ts',
          'standalone-b.ts',
          'standalone-c.ts',
          'standalone-d.ts',
        ],
      });
      expect(incremental.operations).toEqual({
        analyzedSourceFiles: 2,
        reusedSourceFiles: 4,
      });
      expect(withoutGeneratedAt(incrementalCache)).toEqual(withoutGeneratedAt(cleanFullCache));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  /** @id TEST-M5-GRAPH-TRAVERSAL-001
   * @verifies REQ-M5-GRAPH-002
   */
  it('TEST-M5-GRAPH-TRAVERSAL-001 prepares linear adjacency indexes once', async () => {
    const graph = {
      files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'],
      imports: [
        { from: 'a.ts', to: 'c.ts', specifier: './c.js', kind: 'import' as const, line: 1, external: false },
        { from: 'b.ts', to: 'c.ts', specifier: './c.js', kind: 'import' as const, line: 1, external: false },
        { from: 'c.ts', to: 'd.ts', specifier: './d.js', kind: 'import' as const, line: 1, external: false },
        { from: 'c.ts', to: 'e.ts', specifier: './e.js', kind: 'import' as const, line: 2, external: false },
        { from: 'e.ts', to: 'f.ts', specifier: './f.js', kind: 'import' as const, line: 1, external: false },
        { from: 'd.ts', to: 'f.ts', specifier: './f.js', kind: 'import' as const, line: 1, external: false },
        { from: 'b.ts', to: 'e.ts', specifier: './e.js', kind: 'import' as const, line: 2, external: false },
      ],
      symbols: [],
    };
    const analysis = await import('../packages/analysis/src/graph.js');
    const counters = {
      forwardAdjacencyVisits: 0,
      reverseAdjacencyVisits: 0,
      completeImportScans: 0,
    };
    const graphImpactWithCounters = analysis.graphImpact as unknown as (
      input: typeof graph,
      query: string,
      operations: typeof counters,
    ) => Array<{ path: string; via: string[] }>;

    const impact = graphImpactWithCounters(graph, 'f.ts', counters);
    await writeOperations(counters);

    expect(impact).toEqual([
      { path: 'a.ts', via: ['f.ts', 'e.ts', 'c.ts', 'a.ts'] },
      { path: 'b.ts', via: ['f.ts', 'e.ts', 'b.ts'] },
      { path: 'c.ts', via: ['f.ts', 'e.ts', 'c.ts'] },
      { path: 'd.ts', via: ['f.ts', 'd.ts'] },
      { path: 'e.ts', via: ['f.ts', 'e.ts'] },
      { path: 'f.ts', via: ['f.ts'] },
    ]);
    expect(counters).toEqual({
      forwardAdjacencyVisits: 13,
      reverseAdjacencyVisits: 13,
      completeImportScans: 0,
    });
  });

  /** @id TEST-M5-GRAPH-CYCLES-001
   * @verifies REQ-M5-GRAPH-002
   */
  it('TEST-M5-GRAPH-CYCLES-001 preserves cycle detection and excludes external edges', async () => {
    const { cycles } = await import('../packages/analysis/src/graph.js');
    expect(cycles({
      files: ['a.ts', 'b.ts', 'c.ts', 'self.ts', 'external-self.ts'],
      imports: [
        { from: 'a.ts', to: 'b.ts', specifier: './b.js', kind: 'import', line: 1, external: false },
        { from: 'b.ts', to: 'c.ts', specifier: './c.js', kind: 'import', line: 1, external: false },
        { from: 'c.ts', to: 'a.ts', specifier: './a.js', kind: 'import', line: 1, external: false },
        { from: 'self.ts', to: 'self.ts', specifier: './self.js', kind: 'import', line: 1, external: false },
        { from: 'a.ts', to: 'npm:external', specifier: 'external', kind: 'import', line: 2, external: true },
        { from: 'external-self.ts', to: 'external-self.ts', specifier: './external-self.js', kind: 'import', line: 1, external: true },
      ],
    })).toEqual([
      ['a.ts', 'b.ts', 'c.ts'],
      ['self.ts'],
    ]);
  });

  /** @id TEST-M5-GRAPH-GATE-SCAN-001
   * @verifies REQ-M5-GRAPH-002
   */
  it('TEST-M5-GRAPH-GATE-SCAN-001 counts one complete import scan per architecture rule', async () => {
    const { graphGate } = await import('../packages/analysis/src/graph.js');
    const graph = {
      schemaVersion: 1 as const,
      generatedAt: '2026-01-01T00:00:00.000Z',
      files: ['src/a.ts', 'restricted/b.ts'],
      unsupportedFiles: [],
      imports: [
        { from: 'src/a.ts', to: 'restricted/b.ts', specifier: '../restricted/b.js', kind: 'import' as const, line: 3, external: false },
      ],
      entrypoints: [],
      symbols: [],
      calls: [],
      diagnostics: [],
      fingerprints: {},
    };
    const counters = {
      forwardAdjacencyVisits: 0,
      reverseAdjacencyVisits: 0,
      completeImportScans: 0,
    };

    const result = graphGate(graph, {
      forbidCycles: true,
      rules: [{ name: 'restricted boundary', from: 'src/**', disallow: ['restricted/**'] }],
    }, { mode: 'compatible' }, counters);

    expect(counters.completeImportScans).toBe(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'GRAPH_ARCHITECTURE',
        path: 'src/a.ts',
        line: 3,
      }),
    ]);
  });

  /** @id TEST-M5-GRAPH-GATE-ORDER-001
   * @verifies REQ-M5-GRAPH-002
   */
  it('TEST-M5-GRAPH-GATE-ORDER-001 preserves rule-major architecture diagnostic order', async () => {
    const { graphGate } = await import('../packages/analysis/src/graph.js');
    const graph = {
      schemaVersion: 1 as const,
      generatedAt: '2026-01-01T00:00:00.000Z',
      files: ['src/a.ts', 'src/b.ts', 'restricted/x.ts', 'forbidden/y.ts'],
      unsupportedFiles: [],
      imports: [
        { from: 'src/a.ts', to: 'restricted/x.ts', specifier: '../restricted/x.js', kind: 'import' as const, line: 1, external: false },
        { from: 'src/b.ts', to: 'forbidden/y.ts', specifier: '../forbidden/y.js', kind: 'import' as const, line: 2, external: false },
      ],
      entrypoints: [],
      symbols: [],
      calls: [],
      diagnostics: [],
      fingerprints: {},
    };

    const result = graphGate(graph, {
      forbidCycles: false,
      rules: [
        { name: 'forbidden rule', from: 'src/**', disallow: ['forbidden/**'] },
        { name: 'restricted rule', from: 'src/**', disallow: ['restricted/**'] },
      ],
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'forbidden rule: src/b.ts must not depend on forbidden/y.ts.',
      'restricted rule: src/a.ts must not depend on restricted/x.ts.',
    ]);
  });
});
