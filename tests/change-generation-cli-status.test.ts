import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../packages/analysis/src/config.js';

const roots: string[] = [];

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, content);
}

function mixedChangeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-mixed-change-cli-'));
  roots.push(root);
  write(root, '.musubix/config.json', JSON.stringify(defaultConfig));
  for (const changeId of ['CHANGE-0002', 'CHANGE-0003']) {
    write(root, `.musubix/changes/${changeId}.md`, [
      '---',
      'schemaVersion: 1',
      `id: ${changeId}`,
      'status: active',
      '---',
      `# ${changeId}`,
      '',
    ].join('\n'));
  }
  write(root, '.musubix/evidence/changes.json', JSON.stringify({
    schemaVersion: 1,
    changes: [
      { changeId: 'CHANGE-0002', activeGeneration: 2, requirementIds: [] },
      { changeId: 'CHANGE-0003', activeGeneration: 5, requirementIds: [] },
    ],
  }));
  return root;
}

function abandonedChangeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-abandoned-change-cli-'));
  roots.push(root);
  write(root, '.musubix/config.json', JSON.stringify(defaultConfig));
  write(root, '.musubix/changes/CHANGE-0003.md', [
    '---',
    'schemaVersion: 1',
    'id: CHANGE-0003',
    'status: active',
    '---',
    '# CHANGE-0003',
    '',
  ].join('\n'));
  write(root, '.musubix/evidence/changes.json', JSON.stringify({
    schemaVersion: 1,
    changes: [{
      changeId: 'CHANGE-0003',
      generation: 5,
      activeGeneration: null,
      requirementIds: ['REQ-M5-LIFECYCLE-005'],
      phases: { impact: { phase: 'impact', recordedAt: new Date().toISOString(), fingerprints: {} } },
      abandonment: {
        reason: 'restart incomplete generation',
        approver: '@nahisaho',
        abandonedAt: new Date().toISOString(),
      },
    }],
  }));
  return root;
}

function cli(...args: string[]) {
  return spawnSync(process.execPath, [
    resolve('dist/packages/cli/src/main.js'),
    ...args,
  ], { encoding: 'utf8' });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('CHANGE generation CLI status', () => {
  /** @id TEST-M5-LIFECYCLE-STATUS-EXIT-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-COMPAT-013
   */
  it('TEST-M5-LIFECYCLE-STATUS-EXIT-001 keeps mixed status diagnostic at exit zero', () => {
    const root = mixedChangeRoot();
    const result = cli('status', '--root', root, '--json');
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      initialized: true,
      change: null,
      changeDiagnostics: [{ code: 'CHANGE_GENERATION_MIXED', severity: 'error' }],
      gate: { ready: false },
    });
  });

  /** @id TEST-M5-LIFECYCLE-MIXED-ERROR-MAPPING-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-COMPAT-013
   */
  it('TEST-M5-LIFECYCLE-MIXED-ERROR-MAPPING-001 maps mixed gate failure to exit one and its domain code', () => {
    const root = mixedChangeRoot();
    const result = cli('gate', '--root', root, '--json');
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      error: {
        code: 'CHANGE_GENERATION_MIXED',
        message: 'more than one CHANGE has an active generation.',
      },
    });
  });

  /** @id TEST-M5-LIFECYCLE-STATUS-ABANDONED-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-COMPAT-013
   */
  it('TEST-M5-LIFECYCLE-STATUS-ABANDONED-001 reports an abandoned active document at exit zero', () => {
    const root = abandonedChangeRoot();
    const result = cli('status', '--root', root, '--json');
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      initialized: true,
      change: {
        changeId: 'CHANGE-0003',
        activeGeneration: null,
        generations: [{ generation: 5, status: 'abandoned' }],
      },
      changeDiagnostics: [],
      gate: { ready: false },
      next: ['musubix5 change-record CHANGE-0003 impact --reopen'],
    });
  });
});
