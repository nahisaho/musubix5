import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { defaultConfig } from '../packages/analysis/src/config.js';
import { digest } from '../packages/analysis/src/files.js';
import { resolvePortableNpmInvocation } from '../packages/analysis/src/process.js';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const binary = resolve(repositoryRoot, 'dist/packages/cli/src/main.js');
const temporaryDirectories: string[] = [];

function write(root: string, path: string, value: unknown): void {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, typeof value === 'string' ? value : JSON.stringify(value));
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-workflow-correction-cli-error-'));
  temporaryDirectories.push(root);
  execFileSync('git', ['init', '--quiet', root]);
  write(root, '.musubix/config.json', defaultConfig);
  write(root, '.musubix/changes/CHANGE-0003.md', [
    '---',
    'schemaVersion: 1',
    'id: CHANGE-0003',
    'status: active',
    '---',
    '# CHANGE-0003',
    '',
    'Requirements: REQ-M5-EVIDENCE-006',
    '',
  ].join('\n'));
  write(root, '.musubix/evidence/changes.json', {
    schemaVersion: 1,
    changes: [{
      changeId: 'CHANGE-0003',
      generation: 5,
      activeGeneration: 5,
      requirementIds: ['REQ-M5-EVIDENCE-006'],
      phases: {},
    }],
  });
  const events = [
    {
      skill: 'sdd-quality',
      version: '0.1.8',
      provenance: 'self-reported',
      changeId: 'CHANGE-0003',
      generation: 5,
      requirementIds: ['REQ-M5-EVIDENCE-006'],
      phase: 'complete',
      status: 'completed',
      recordedAt: '2026-09-23T00:00:02.000Z',
    },
    {
      skill: 'sdd-quality',
      version: '0.1.8',
      provenance: 'self-reported',
      changeId: 'CHANGE-0003',
      generation: 5,
      requirementIds: ['REQ-M5-EVIDENCE-006'],
      phase: 'complete',
      status: 'completed',
      recordedAt: '2026-09-23T00:00:03.000Z',
    },
  ];
  write(root, '.musubix/evidence/workflow.json', {
    schemaVersion: 1,
    events,
    verification: {
      mode: 'compatible',
      sourceSha256: 'a'.repeat(64),
      eventsSha256: digest(JSON.stringify(events)),
      verifiedAt: '2026-09-23T00:00:04.000Z',
      invocations: [{
        skill: 'sdd-quality',
        toolCallId: 'call-quality',
        invokedAt: '2026-09-23T00:00:00.000Z',
        completedAt: '2026-09-23T00:00:01.000Z',
        status: 'completed',
      }],
    },
  });
  return root;
}

function run(root: string, code: string, recordedAt: string) {
  return spawnSync(process.execPath, [
    binary,
    'workflow',
    'declaration',
    'supersede',
    code,
    '--skill',
    'sdd-quality',
    '--phase',
    'complete',
    '--recorded-at',
    recordedAt,
    '--approver',
    'reviewer',
    '--reason',
    'Accidental duplicate declaration.',
    '--confirm',
    '--root',
    root,
    '--json',
  ], { encoding: 'utf8' });
}

beforeAll(() => {
  const npm = resolvePortableNpmInvocation(['run', 'build'], 'Windows');
  execFileSync(npm.command, npm.args, { cwd: repositoryRoot, stdio: 'pipe' });
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

afterAll(() => {
  temporaryDirectories.splice(0);
});

describe('workflow declaration correction CLI errors', () => {
  /**
   * @id TEST-M5-WORKFLOW-DECLARATION-CORRECTION-CLI-ERROR-001
   * @verifies REQ-M5-COMPAT-013
   */
  it('TEST-M5-WORKFLOW-DECLARATION-CORRECTION-CLI-ERROR-001 maps unsupported codes and malformed timestamps to CLI_ERROR exit 2', () => {
    expect(resolvePortableNpmInvocation([], 'Windows').command).toBe(process.execPath);
    const root = fixture();
    const unsupported = run(root, 'WORKFLOW_SKILL_NOT_INVOKED', '2026-09-23T00:00:03.000Z');
    const malformed = run(root, 'WORKFLOW_INVOCATION_REUSED', 'not-a-timestamp');

    for (const result of [unsupported, malformed]) {
      expect(result.status).toBe(2);
      expect(JSON.parse(result.stdout)).toEqual({
        error: expect.objectContaining({ code: 'CLI_ERROR' }),
      });
      expect(result.stderr).toBe('');
    }
  });
});
