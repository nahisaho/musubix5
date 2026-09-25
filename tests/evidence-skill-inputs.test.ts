import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { defaultConfig } from '../packages/analysis/src/config.js';
import type { ProcessResult, Runner } from '../packages/analysis/src/process.js';

const temporaryDirectories: string[] = [];

function write(root: string, path: string, content: unknown): void {
  const target = join(root, path);
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

function fixture(manifest: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-skill-evidence-'));
  temporaryDirectories.push(root);
  if (manifest !== undefined) write(root, 'package.json', manifest);
  write(root, '.github/skills/example/SKILL.md', '# Skill\n');
  write(root, '.github/skills/example/notes.md', '# Notes\n');
  write(root, '.musubix/features/sample/trace.json', '{}\n');
  write(root, 'logs/run/output.txt', 'log\n');
  write(root, 'archive.tgz', 'archive\n');
  write(root, 'src/example.ts', 'export const example = true;\n');
  return root;
}

function tddFixture(): string {
  const root = fixture({
    name: 'musubix5',
    repository: { type: 'git', url: 'https://github.com/nahisaho/musubix5.git' },
  });
  write(root, '.musubix/config.json', {
    ...defaultConfig,
    approval: { mode: 'compatible', domains: [] },
    commands: [{
      name: 'target',
      command: 'target',
      args: [],
      tddArgs: ['{testId}', '{reportPath}'],
      tddReport: { format: 'musubix-json', path: '.test-results/{testId}.json' },
      required: false,
      timeoutMs: 10_000,
    }],
  });
  write(root, '.musubix/features/sample/requirements.md', [
    '## REQ-M5-EVIDENCE-009: Skill evidence fixture',
    'Priority: must',
    'Type: functional',
    'Statement: When Skill evidence is collected, the system shall fingerprint it.',
    'Acceptance: A Skill-only edit changes the source fingerprint.',
    '',
  ].join('\n'));
  write(root, '.musubix/features/sample/design.md', [
    '## DES-M5-EVIDENCE-SKILL-001: Skill evidence fixture',
    'Responsibilities: Exercise Skill evidence fingerprints.',
    'Interfaces: Fixture test.',
    'Constraints: The Skill is a source input.',
    'Requirements: REQ-M5-EVIDENCE-009',
    'ADRs: ADR-9999',
    '',
  ].join('\n'));
  write(root, 'tests/target.test.ts', [
    '/** @id TEST-M5-EVIDENCE-SKILL-FINGERPRINT-001',
    ' * @verifies REQ-M5-EVIDENCE-009',
    ' */',
    'export const target = true;',
    '',
  ].join('\n'));
  return root;
}

function reportRunner(statuses: Array<'failed' | 'passed'>): Runner {
  let call = 0;
  return async (_command, args, options): Promise<ProcessResult> => {
    const testId = args[0]!;
    const reportPath = args[1]!;
    const status = statuses[call++]!;
    write(options.cwd, reportPath, {
      schemaVersion: 1,
      tests: [{ id: testId, status }],
    });
    return {
      status: 'completed',
      exitCode: status === 'failed' ? 1 : 0,
      stdout: '',
      stderr: '',
      durationMs: 1,
    };
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('repository Skill evidence inputs', () => {
  /** @id TEST-M5-EVIDENCE-SKILL-FINGERPRINT-001
   * @verifies REQ-M5-EVIDENCE-009
   */
  it('TEST-M5-EVIDENCE-SKILL-FINGERPRINT-001 binds owned Skills to every non-trace fingerprint', async () => {
    const analysis = await import('../packages/analysis/src/index.js');
    const evidenceInputs = (analysis as Record<string, unknown>).evidenceInputs;
    expect(evidenceInputs).toBeTypeOf('function');
    const select = evidenceInputs as (root: string) => Promise<string[]>;
    const recognizedManifests = [
      { name: 'musubix5', repository: { url: 'https://github.com/nahisaho/musubix5.git' } },
      { name: 'musubix3', repository: { url: 'https://github.com/nahisaho/musubix3.git' } },
    ];
    expect(recognizedManifests.every(analysis.isRecognizedMusubixSource)).toBe(true);
    expect(analysis.isRecognizedMusubixSource({
      name: 'musubix5',
      repository: 'github:nahisaho/musubix5',
    })).toBe(false);

    for (const manifest of recognizedManifests) {
      const root = fixture(manifest);
      const selected = await select(root);
      expect(selected).toEqual([
        '.github/skills/example/SKILL.md',
        'package.json',
        'src/example.ts',
      ]);
      expect(await analysis.traceInputs(root)).toContain('.github/skills/example/SKILL.md');
    }

    const rejectedManifests: unknown[] = [
      { name: 'consumer', repository: { url: 'https://github.com/nahisaho/musubix5.git' } },
      { name: 'musubix5', repository: 'github:nahisaho/musubix5' },
      { name: 'musubix5', repository: { url: 'git+https://github.com/nahisaho/musubix5.git' } },
      undefined,
      '{ malformed',
    ];
    for (const manifest of rejectedManifests) {
      const root = fixture(manifest);
      expect(await select(root)).toEqual(['package.json', 'src/example.ts'].filter((path) =>
        manifest !== undefined || path !== 'package.json'));
      expect(await analysis.traceInputs(root)).not.toContain('.github/skills/example/SKILL.md');
    }

    const unreadable = fixture(undefined);
    mkdirSync(join(unreadable, 'package.json'));
    await expect(select(unreadable)).resolves.toEqual(['src/example.ts']);
    await expect(analysis.traceInputs(unreadable)).resolves.not.toContain('.github/skills/example/SKILL.md');

    expect(analysis.evidenceInputPaths([
      '.github/skills/example/SKILL.md',
      '.github/skills/example/notes.md',
      '.musubix/features/sample/trace.json',
      'archive.tgz',
      'logs/run/output.txt',
      'src/example.ts',
    ])).toEqual(['src/example.ts']);

    const root = fixture(recognizedManifests[0]);
    const before = await analysis.evidenceSnapshot(root);
    const beforeHeads = await analysis.collectEvidenceHeads(root);
    const qualityInputsCurrent = (analysis as Record<string, unknown>).qualityInputsCurrent;
    expect(qualityInputsCurrent).toBeTypeOf('function');
    const inputsCurrent = qualityInputsCurrent as (recorded: unknown, current: Record<string, string>) => boolean;
    expect(inputsCurrent(before, before)).toBe(true);
    for (const invalid of [undefined, null, [], 'invalid', { path: 1 }]) {
      expect(inputsCurrent(invalid, before)).toBe(false);
    }
    write(root, '.github/skills/example/SKILL.md', '# Changed Skill\n');
    const after = await analysis.evidenceSnapshot(root);
    const afterHeads = await analysis.collectEvidenceHeads(root);
    expect(before['.github/skills/example/SKILL.md']).toBeDefined();
    expect(after['.github/skills/example/SKILL.md']).not.toBe(before['.github/skills/example/SKILL.md']);
    expect(inputsCurrent(before, after)).toBe(false);
    expect(analysis.snapshotChanges(before, after)).toContainEqual(expect.objectContaining({
      path: '.github/skills/example/SKILL.md',
      change: 'modified',
    }));
    expect(afterHeads.workspace).not.toBe(beforeHeads.workspace);

    const tddRoot = tddFixture();
    const runner = reportRunner(['failed', 'passed']);
    const red = await analysis.runTddPhase(
      tddRoot,
      'red',
      'TEST-M5-EVIDENCE-SKILL-FINGERPRINT-001',
      'REQ-M5-EVIDENCE-009',
      'target',
      runner,
    );
    write(tddRoot, '.github/skills/example/SKILL.md', '# Changed Skill\n');
    const green = await analysis.runTddPhase(
      tddRoot,
      'green',
      'TEST-M5-EVIDENCE-SKILL-FINGERPRINT-001',
      'REQ-M5-EVIDENCE-009',
      'target',
      runner,
    );
    expect(red.valid).toBe(true);
    expect(green.valid).toBe(true);
    expect(green.sourceFingerprint).not.toBe(red.sourceFingerprint);

    const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
    for (const path of [
      'packages/analysis/src/tdd.ts',
      'packages/analysis/src/gate.ts',
      'packages/analysis/src/attestation.ts',
    ]) {
      expect(readFileSync(resolve(repositoryRoot, path), 'utf8')).not.toContain('evidenceInputPaths');
    }
  });
});
