import {
  mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function writeFixture(root: string, path: string, content: string): void {
  const target = join(root, path);
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, content);
}

function traceFixture(packageManifest?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-trace-skill-'));
  if (packageManifest !== undefined) writeFixture(root, 'package.json', packageManifest);
  writeFixture(root, '.musubix/features/sample/requirements.md', [
    '## REQ-FIXTURE-REAL-001: Fixture requirement',
    'Priority: must',
    'Type: functional',
    'Statement: When the fixture runs, the system shall trace the real declaration.',
    'Acceptance: The fixture graph contains its declared node and links.',
    '',
  ].join('\n'));
  writeFixture(root, '.musubix/features/sample/design.md', [
    '## DES-FIXTURE-REAL-001: Fixture design',
    'Responsibilities: Define the fixture trace node.',
    'Interfaces: Fixture Skill.',
    'Constraints: Only the real declaration is authoritative.',
    'Requirements: REQ-FIXTURE-REAL-001',
    'ADRs: ADR-9999',
    '',
  ].join('\n'));
  writeFixture(root, 'src/example.ts', [
    'export function fixture(): boolean {',
    '  /** @id CODE-FIXTURE-TYPESCRIPT-INDENTED-001',
    '   * @implements REQ-FIXTURE-REAL-001',
    '   * @design DES-FIXTURE-REAL-001',
    '   */',
    '  return true;',
    '}',
    '',
  ].join('\n'));
  writeFixture(root, '.github/skills/example/SKILL.md', [
    '\uFEFF```ts',
    '/** @id CODE-FIXTURE-FENCED-001',
    ' * @implements REQ-FIXTURE-FAKE-001',
    ' */',
    '````',
    '',
    "Copilot's \"quoted\" prose must not hide the declaration below.",
    '/* @id CODE-FIXTURE-REAL-001',
    ' * @implements REQ-FIXTURE-REAL-001',
    ' * @design DES-FIXTURE-REAL-001',
    '*/',
    '',
    '    /** @id CODE-FIXTURE-INDENTED-001',
    '     * @implements REQ-FIXTURE-FAKE-001',
    '     */',
    '',
    'Inline `/** @id CODE-FIXTURE-INLINE-001 */` example.',
    '',
    'Double ``/** @id CODE-FIXTURE-DOUBLE-INLINE-001 */`` example.',
    '',
    '1. List continuation',
    '',
    '    /** @id CODE-FIXTURE-LIST-CONTINUATION-001',
    '     * @implements REQ-FIXTURE-REAL-001',
    '     * @design DES-FIXTURE-REAL-001',
    '     */',
    '',
    '- Parent item',
    '  - Nested item',
    '',
    '      /** @id CODE-FIXTURE-NESTED-LIST-001',
    '       * @implements REQ-FIXTURE-REAL-001',
    '       * @design DES-FIXTURE-REAL-001',
    '       */',
    '',
    '/* @id CODE-FIXTURE-MIXED-REAL-001',
    ' * @implements REQ-FIXTURE-REAL-001',
    ' * @design DES-FIXTURE-REAL-001',
    '   ```ts',
    '   /** @id CODE-FIXTURE-MIXED-FAKE-001',
    '    * @implements REQ-FIXTURE-FAKE-001',
    '    */',
    '   ```',
    ' */',
    '',
    'A stray prose /* opener before a fenced example:',
    '```ts',
    '/** @id CODE-FIXTURE-CAPTURED-001 */',
    '```',
    '*/',
    '',
    '`unmatched inline opener',
    '',
    '/* @id CODE-FIXTURE-AFTER-BLANK-001',
    ' * @implements REQ-FIXTURE-REAL-001',
    ' * @design DES-FIXTURE-REAL-001',
    ' */',
    '',
    '~~~ts',
    '/** @id CODE-FIXTURE-UNTERMINATED-001 */',
  ].join('\r\n'));
  return root;
}

describe('trace evidence namespace', () => {
  /**
   * @id TEST-M5-EVIDENCE-TRACE-001
   * @verifies REQ-M5-EVIDENCE-001 REQ-M5-EVIDENCE-002
   */
  it('TEST-M5-EVIDENCE-TRACE-001 excludes inherited musubix3 trace declarations', async () => {
    const { buildTrace, checkTrace } = await import('../packages/analysis/src/index.js');
    const root = fileURLToPath(new URL('..', import.meta.url));
    const graph = await buildTrace(root, false);
    const checked = await checkTrace(root, graph, true);

    expect(checked.diagnostics.filter((diagnostic) => diagnostic.code === 'TRACE_DANGLING'))
      .toEqual([]);
  });

  /** @id TEST-M5-EVIDENCE-SKILL-INPUT-001
   * @verifies REQ-M5-EVIDENCE-008
   */
  it('TEST-M5-EVIDENCE-SKILL-INPUT-001 selects and parses only repository-owned Skill declarations', async () => {
    const { buildTrace, traceInputs } = await import('../packages/analysis/src/index.js');
    const recognized = [
      { name: 'musubix5', repository: { type: 'git', url: 'https://github.com/nahisaho/musubix5.git' } },
      { name: 'musubix3', repository: { type: 'git', url: 'https://github.com/nahisaho/musubix3.git' } },
    ];
    const rejected: Array<string | undefined> = [
      JSON.stringify({ name: 'consumer', repository: { url: 'https://github.com/nahisaho/musubix5.git' } }),
      JSON.stringify({ name: 'musubix5', repository: { url: 'https://example.com/consumer.git' } }),
      JSON.stringify({ name: 'musubix5', repository: 'github:nahisaho/musubix5' }),
      JSON.stringify({ name: 'musubix5', repository: { url: 'git+https://github.com/nahisaho/musubix5.git' } }),
      JSON.stringify({ repository: { url: 'https://github.com/nahisaho/musubix5.git' } }),
      JSON.stringify({ name: 'musubix5' }),
      JSON.stringify({ name: 5, repository: { url: 5 } }),
      undefined,
      '{ malformed',
    ];
    const roots: string[] = [];
    try {
      for (const manifest of recognized) {
        const root = traceFixture(JSON.stringify(manifest));
        roots.push(root);
        const inputs = await traceInputs(root);
        expect(inputs).toContain('.github/skills/example/SKILL.md');
        expect(inputs).toContain('.musubix/features/sample/requirements.md');
        expect(inputs).toContain('src/example.ts');
      }
      for (const manifest of rejected) {
        const root = traceFixture(manifest);
        roots.push(root);
        const inputs = await traceInputs(root);
        expect(inputs).not.toContain('.github/skills/example/SKILL.md');
        expect(inputs).toContain('.musubix/features/sample/requirements.md');
        expect(inputs).toContain('src/example.ts');
      }

      const unreadable = traceFixture();
      roots.push(unreadable);
      mkdirSync(join(unreadable, 'package.json'));
      await expect(traceInputs(unreadable)).resolves.not.toContain('.github/skills/example/SKILL.md');

      const root = roots[0]!;
      const graph = await buildTrace(root, false);
      const node = graph.nodes.find((candidate) => candidate.id === 'CODE-FIXTURE-REAL-001');
      expect(node).toMatchObject({
        kind: 'code',
        path: '.github/skills/example/SKILL.md',
        line: 8,
      });
      expect(graph.nodes.map((candidate) => candidate.id)).toEqual(expect.arrayContaining([
        'CODE-FIXTURE-REAL-001',
        'CODE-FIXTURE-LIST-CONTINUATION-001',
        'CODE-FIXTURE-NESTED-LIST-001',
        'CODE-FIXTURE-MIXED-REAL-001',
        'CODE-FIXTURE-AFTER-BLANK-001',
        'CODE-FIXTURE-TYPESCRIPT-INDENTED-001',
      ]));
      const excludedIds = [
        'CODE-FIXTURE-FENCED-001',
        'CODE-FIXTURE-INDENTED-001',
        'CODE-FIXTURE-INLINE-001',
        'CODE-FIXTURE-DOUBLE-INLINE-001',
        'CODE-FIXTURE-MIXED-FAKE-001',
        'CODE-FIXTURE-CAPTURED-001',
        'CODE-FIXTURE-UNTERMINATED-001',
      ];
      for (const id of excludedIds) expect(graph.nodes.map((candidate) => candidate.id)).not.toContain(id);
      expect(graph.diagnostics).toEqual([]);
      expect(graph.edges.filter((edge) => edge.from === 'CODE-FIXTURE-MIXED-REAL-001')).toEqual([
        { from: 'CODE-FIXTURE-MIXED-REAL-001', to: 'REQ-FIXTURE-REAL-001', relation: 'implements' },
        { from: 'CODE-FIXTURE-MIXED-REAL-001', to: 'DES-FIXTURE-REAL-001', relation: 'implements' },
      ]);
      const repositoryGraph = await buildTrace(fileURLToPath(new URL('..', import.meta.url)), false);
      for (const id of ['CODE-FEATURE-001', 'TEST-FEATURE-001']) {
        expect(repositoryGraph.nodes.map((candidate) => candidate.id)).not.toContain(id);
      }
    } finally {
      for (const root of roots) rmSync(root, { recursive: true, force: true });
    }
  });

  /** @id TEST-SESSION-SCOPED-DEVELOPMENT-001
   * @verifies REQ-SESSION-SCOPED-DEVELOPMENT-001 REQ-SESSION-SCOPED-DEVELOPMENT-002
   */
  it('TEST-SESSION-SCOPED-DEVELOPMENT-001 traces the authoritative fresh-change and approval contracts', async () => {
    const { buildTrace } = await import('../packages/analysis/src/index.js');
    const root = fileURLToPath(new URL('..', import.meta.url));
    const changeSkill = readFileSync(resolve(root, '.github/skills/sdd-change/SKILL.md'), 'utf8');
    const requirementsSkill = readFileSync(resolve(root, '.github/skills/sdd-requirements/SKILL.md'), 'utf8');

    expect(changeSkill).toContain('every new natural-language development request is a new change');
    expect(changeSkill).toContain('unless the user explicitly names the existing change ID and asks to continue it');
    expect(changeSkill).toContain('never start implementation before validating requirements/design');
    expect(changeSkill).toContain('Never infer approval');
    expect(changeSkill).toContain('An edit to `requirements.md` re-opens approval');
    expect(changeSkill).toContain('An edit re-opens approval and requires re-review');

    expect(requirementsSkill).toContain('For every new natural-language development request');
    expect(requirementsSkill).toContain('do not edit or reuse a prior');
    expect(requirementsSkill).toContain('Validation is not human approval');
    expect(requirementsSkill).toContain('Before design');
    expect(requirementsSkill).toContain('any intervening artifact change stops and requires renewed review');

    const graph = await buildTrace(root, false);
    expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      'CODE-SESSION-SCOPED-DEVELOPMENT-001',
      'CODE-SESSION-SCOPED-DEVELOPMENT-002',
    ]));
    for (const id of ['CODE-FEATURE-001', 'TEST-FEATURE-001']) {
      expect(graph.nodes.map((node) => node.id)).not.toContain(id);
    }
  });
});
