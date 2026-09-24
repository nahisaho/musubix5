import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  indexGraph,
  informationalChangedFiles,
  loadGraph,
  type CodeGraphIndexResult,
} from '../packages/analysis/src/graph.js';
import type { Runner } from '../packages/analysis/src/process.js';

async function fixture(files: Record<string, string>): Promise<string> {
  const root = join(process.cwd(), '.test-work', `codegraph-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  await Promise.all(Object.entries(files).map(async ([path, text]) => {
    const target = join(root, path);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, text);
  }));
  return root;
}

async function cleanup(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

function reason(result: CodeGraphIndexResult): string | undefined {
  return result.indexing.fullRebuildReason;
}

describe('CHANGE-0005 incremental CodeGraph regressions', () => {
  /** @id TEST-M5-GRAPH-INCREMENTAL-NOCHANGE-001
   * @verifies REQ-M5-GRAPH-001
   */
  it('TEST-M5-GRAPH-INCREMENTAL-NOCHANGE-001 preserves an unchanged cache without rewriting it', async () => {
    const root = await fixture({ 'index.ts': 'export const value = 1;\n' });
    try {
      await indexGraph(root, { persist: true, refresh: false });
      const before = await readFile(join(root, '.musubix/cache/codegraph.json'));
      const cachedGeneratedAt = (JSON.parse(before.toString()) as { generatedAt: string }).generatedAt;
      const refreshed = await indexGraph(root, { persist: true, refresh: true });
      const after = await readFile(join(root, '.musubix/cache/codegraph.json'));

      expect(refreshed.indexing).toEqual({
        mode: 'incremental',
        changedInputs: [],
        analyzedSourcePaths: [],
        reusedSourcePaths: ['index.ts'],
      });
      expect(refreshed.operations).toEqual({ analyzedSourceFiles: 0, reusedSourceFiles: 1 });
      expect(refreshed.graph.generatedAt).toBe(cachedGeneratedAt);
      expect(after).toEqual(before);
      expect(await loadGraph(root)).not.toHaveProperty('analysisVersion');
      expect(await loadGraph(root)).not.toHaveProperty('phaseUnits');
    } finally {
      await cleanup(root);
    }
  });

  /** @id TEST-M5-GRAPH-INCREMENTAL-FALLBACK-001
   * @verifies REQ-M5-GRAPH-001
   */
  it('TEST-M5-GRAPH-INCREMENTAL-FALLBACK-001 selects deterministic full rebuild reasons and precedence', async () => {
    const root = await fixture({
      'a.ts': 'export const a = 1;\n',
      'b.ts': 'export const b = 1;\n',
    });
    try {
      expect(reason(await indexGraph(root, { persist: true, refresh: false }))).toBe('FULL_REQUESTED');

      await writeFile(join(root, 'global.d.ts'), 'declare const ambientValue: string;\n');
      expect(reason(await indexGraph(root, { persist: true, refresh: true }))).toBe('DECLARATION_CHANGED');

      await indexGraph(root, { persist: true, refresh: false });
      await writeFile(join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
      expect(reason(await indexGraph(root, { persist: true, refresh: true }))).toBe('CONFIG_CHANGED');

      await indexGraph(root, { persist: true, refresh: false });
      await rm(join(root, 'b.ts'));
      await writeFile(join(root, 'c.ts'), 'export const c = 1;\n');
      expect(reason(await indexGraph(root, { persist: true, refresh: true }))).toBe('DELETED_FILES');

      const cachePath = join(root, '.musubix/cache/codegraph.json');
      const cache = JSON.parse(await readFile(cachePath, 'utf8')) as Record<string, unknown>;
      cache.analysisVersion = 'obsolete';
      await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
      await writeFile(join(root, 'package.json'), '{}\n');
      expect(reason(await indexGraph(root, { persist: false, refresh: true }))).toBe('ANALYSIS_VERSION_MISMATCH');
    } finally {
      await cleanup(root);
    }
  });

  /** @id TEST-M5-GRAPH-INCREMENTAL-GIT-001
   * @verifies REQ-M5-GRAPH-001
   */
  it('TEST-M5-GRAPH-INCREMENTAL-GIT-001 treats unavailable Git metadata as informational', async () => {
    const root = await fixture({ 'index.ts': 'export const value = 1;\n' });
    const unavailable: Runner = async () => ({
      status: 'missing',
      exitCode: null,
      stdout: '',
      stderr: 'git unavailable',
      durationMs: 0,
    });
    try {
      await indexGraph(root, { persist: true, refresh: false });
      expect(await informationalChangedFiles(root, unavailable)).toBeNull();
      const refreshed = await indexGraph(root, {
        persist: true,
        refresh: true,
        runner: unavailable,
      });
      expect(refreshed.indexing.mode).toBe('incremental');
      expect(refreshed.indexing.changedInputs).toEqual([]);
      expect(refreshed.operations).toEqual({ analyzedSourceFiles: 0, reusedSourceFiles: 1 });
    } finally {
      await cleanup(root);
    }
  });

  /** @id TEST-M5-GRAPH-CACHE-WRITE-001
   * @verifies REQ-M5-GRAPH-001
   */
  it('TEST-M5-GRAPH-CACHE-WRITE-001 preserves the previous cache when the writer fails', async () => {
    const root = await fixture({ 'index.ts': 'export const value = 1;\n' });
    try {
      await indexGraph(root, { persist: true, refresh: false });
      const cachePath = join(root, '.musubix/cache/codegraph.json');
      const before = await readFile(cachePath);
      await writeFile(join(root, 'index.ts'), 'export const value = 2;\n');

      await expect(indexGraph(root, {
        persist: true,
        refresh: true,
        writer: async () => {
          throw new Error('deterministic writer failure');
        },
      })).rejects.toThrow('CACHE_WRITE_FAILED');
      expect(await readFile(cachePath)).toEqual(before);
    } finally {
      await cleanup(root);
    }
  });

  it('does not execute source extraction for reused phase units', async () => {
    const root = await fixture({
      'leaf.ts': 'export const leaf = 1;\n',
      'parent.ts': "import { leaf } from './leaf.js';\nexport const parent = leaf;\n",
      'reused.ts': 'export const reused = 1;\n',
    });
    try {
      await indexGraph(root, { persist: true, refresh: false });
      await writeFile(join(root, 'leaf.ts'), 'export const leaf = 2;\n');
      const extracted: string[] = [];

      const result = await indexGraph(root, {
        persist: true,
        refresh: true,
        onSourceExtraction: ({ path, phase }) => extracted.push(`${phase}:${path}`),
      });

      expect(result.indexing.analyzedSourcePaths).toEqual(['leaf.ts', 'parent.ts']);
      expect(result.indexing.reusedSourcePaths).toEqual(['reused.ts']);
      expect(extracted).toEqual([
        'symbols:leaf.ts',
        'symbols:parent.ts',
        'relations:leaf.ts',
        'relations:parent.ts',
      ]);
      expect(extracted.some((entry) => entry.endsWith(':reused.ts'))).toBe(false);
    } finally {
      await cleanup(root);
    }
  });

  it('treats a refused external manifest as CONFIG_CHANGED while preserving missing as absent', async () => {
    const root = await fixture({
      'index.ts': "import value from 'external-package';\nexport { value };\n",
    });
    try {
      await indexGraph(root, { persist: true, refresh: false });
      const cachePath = join(root, '.musubix/cache/codegraph.json');
      const cache = JSON.parse(await readFile(cachePath, 'utf8')) as {
        resolutionEnvironment: { manifests: Record<string, string> };
      };
      expect(cache.resolutionEnvironment.manifests).toEqual({
        'node_modules/external-package/package.json': 'absent',
      });

      await mkdir(join(root, 'node_modules/external-package/package.json'), { recursive: true });
      const refused = await indexGraph(root, { persist: false, refresh: true });
      expect(reason(refused)).toBe('CONFIG_CHANGED');
      expect(refused.indexing.changedInputs).toContain('node_modules/external-package/package.json');
    } finally {
      await cleanup(root);
    }
  });

  it('rebuilds declaration maps from reused symbol units before changed relations', async () => {
    const root = await fixture({
      'src/A.java': 'package example;\npublic class A {}\n',
      'src/B.java': 'package example;\nimport example.A;\npublic class B { A value; }\n',
      'src/C.java': 'package example;\npublic class C {}\n',
    });
    try {
      await indexGraph(root, { persist: true, refresh: false });
      await writeFile(
        join(root, 'src/B.java'),
        'package example;\nimport example.A;\npublic class B { A value; int changed; }\n',
      );
      const extracted: string[] = [];

      const incremental = await indexGraph(root, {
        persist: true,
        refresh: true,
        onSourceExtraction: ({ path, phase }) => extracted.push(`${phase}:${path}`),
      });
      const incrementalCache = JSON.parse(await readFile(join(root, '.musubix/cache/codegraph.json'), 'utf8')) as Record<string, unknown>;
      await indexGraph(root, { persist: true, refresh: false });
      const fullCache = JSON.parse(await readFile(join(root, '.musubix/cache/codegraph.json'), 'utf8')) as Record<string, unknown>;

      expect(incremental.indexing.mode).toBe('incremental');
      expect(incremental.indexing.analyzedSourcePaths).toEqual(['src/B.java']);
      expect(incremental.indexing.reusedSourcePaths).toEqual(['src/A.java', 'src/C.java']);
      expect(extracted).toEqual(['symbols:src/B.java', 'relations:src/B.java']);
      expect(incremental.graph.imports).toContainEqual(expect.objectContaining({
        from: 'src/B.java',
        to: 'src/A.java',
        external: false,
      }));
      const { generatedAt: _incrementalTime, ...incrementalStable } = incrementalCache;
      const { generatedAt: _fullTime, ...fullStable } = fullCache;
      expect(incrementalStable).toEqual(fullStable);
    } finally {
      await cleanup(root);
    }
  });

  it('reanalyzes relation units whose cached call targets point into a changed source', async () => {
    const root = await fixture({
      'a.py': 'def foo():\n    return 1\n',
      'b.py': 'foo()\n',
      'c.py': 'print("unchanged")\n',
    });
    try {
      await indexGraph(root, { persist: true, refresh: false });
      await writeFile(join(root, 'a.py'), '\ndef foo():\n    return 2\n');
      const extracted: string[] = [];

      const incremental = await indexGraph(root, {
        persist: true,
        refresh: true,
        onSourceExtraction: ({ path, phase }) => extracted.push(`${phase}:${path}`),
      });
      const incrementalCache = JSON.parse(
        await readFile(join(root, '.musubix/cache/codegraph.json'), 'utf8'),
      ) as Record<string, unknown>;
      await indexGraph(root, { persist: true, refresh: false });
      const fullCache = JSON.parse(
        await readFile(join(root, '.musubix/cache/codegraph.json'), 'utf8'),
      ) as Record<string, unknown>;

      expect(incremental.indexing.analyzedSourcePaths).toEqual(['a.py', 'b.py']);
      expect(incremental.indexing.reusedSourcePaths).toEqual(['c.py']);
      expect(extracted).toEqual([
        'symbols:a.py',
        'symbols:b.py',
        'relations:a.py',
        'relations:b.py',
      ]);
      const { generatedAt: _incrementalTime, ...incrementalStable } = incrementalCache;
      const { generatedAt: _fullTime, ...fullStable } = fullCache;
      expect(incrementalStable).toEqual(fullStable);
    } finally {
      await cleanup(root);
    }
  });

  it('reanalyzes global call resolution when a changed source adds a duplicate symbol name', async () => {
    const root = await fixture({
      'a.py': 'def foo():\n    return 1\n',
      'b.py': 'foo()\n',
      'c.py': 'def bar():\n    return 2\n',
    });
    try {
      await indexGraph(root, { persist: true, refresh: false });
      await writeFile(join(root, 'c.py'), 'def foo():\n    return 2\n');

      const incremental = await indexGraph(root, { persist: true, refresh: true });
      const incrementalCache = JSON.parse(
        await readFile(join(root, '.musubix/cache/codegraph.json'), 'utf8'),
      ) as Record<string, unknown>;
      await indexGraph(root, { persist: true, refresh: false });
      const fullCache = JSON.parse(
        await readFile(join(root, '.musubix/cache/codegraph.json'), 'utf8'),
      ) as Record<string, unknown>;

      expect(incremental.indexing.analyzedSourcePaths).toEqual(['a.py', 'b.py', 'c.py']);
      expect(incremental.graph.calls).toContainEqual(expect.objectContaining({
        path: 'b.py',
        expression: 'foo',
        target: null,
      }));
      const { generatedAt: _incrementalTime, ...incrementalStable } = incrementalCache;
      const { generatedAt: _fullTime, ...fullStable } = fullCache;
      expect(incrementalStable).toEqual(fullStable);
    } finally {
      await cleanup(root);
    }
  });

  it('classifies incomplete current-version phase units as CACHE_INVALID', async () => {
    const root = await fixture({ 'index.ts': 'export const value = 1;\n' });
    try {
      await indexGraph(root, { persist: true, refresh: false });
      const cachePath = join(root, '.musubix/cache/codegraph.json');
      const cache = JSON.parse(await readFile(cachePath, 'utf8')) as {
        phaseUnits: Array<Record<string, unknown>>;
      };
      delete cache.phaseUnits[0]!.relationsPhase;
      await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);

      const refreshed = await indexGraph(root, { persist: false, refresh: true });
      expect(reason(refreshed)).toBe('CACHE_INVALID');
    } finally {
      await cleanup(root);
    }
  });

  it('classifies malformed semantic entries as CACHE_INVALID', async () => {
    const root = await fixture({ 'index.ts': 'export const value = 1;\n' });
    try {
      await indexGraph(root, { persist: true, refresh: false });
      const cachePath = join(root, '.musubix/cache/codegraph.json');
      const cache = JSON.parse(await readFile(cachePath, 'utf8')) as {
        calls: unknown[];
      };
      cache.calls = [null];
      await writeFile(join(root, 'index.ts'), 'export const value = 2;\n');
      await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);

      const refreshed = await indexGraph(root, { persist: false, refresh: true });
      expect(reason(refreshed)).toBe('CACHE_INVALID');
    } finally {
      await cleanup(root);
    }
  });

  it('classifies semantic and phase-unit inconsistencies as CACHE_INVALID', async () => {
    const root = await fixture({ 'index.ts': 'export const value = 1;\n' });
    try {
      await indexGraph(root, { persist: true, refresh: false });
      const cachePath = join(root, '.musubix/cache/codegraph.json');
      const cache = JSON.parse(await readFile(cachePath, 'utf8')) as {
        symbols: Array<{ name: string }>;
      };
      cache.symbols[0]!.name = 'corrupted';
      await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);

      const refreshed = await indexGraph(root, { persist: false, refresh: true });
      expect(reason(refreshed)).toBe('CACHE_INVALID');
    } finally {
      await cleanup(root);
    }
  });

  it('preserves the legacy CodeGraph return shape for public callers', async () => {
    const root = await fixture({ 'index.ts': 'export const value = 1;\n' });
    try {
      const legacy = await indexGraph(root);
      expect(legacy.files).toEqual(['index.ts']);
      expect(legacy).not.toHaveProperty('graph');
      expect(legacy).not.toHaveProperty('indexing');
    } finally {
      await cleanup(root);
    }
  });
});
