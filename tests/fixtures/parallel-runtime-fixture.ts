import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { digest } from '../../packages/analysis/src/files.js';
import { appendJournalRecord } from '../../packages/analysis/src/journal.js';
import { resilientRemovalOptions } from '../../packages/analysis/src/files.js';
import type { AuthoredParallelPlan } from '../../packages/analysis/src/parallel.js';

export const fixtureParallelPolicy = {
  schemaVersion: 1,
  defaultConcurrency: 3,
  maxConcurrency: 8,
  integratorOwnedDefaults: ['.musubix/**'],
  provisionCommands: [],
  agentCommitIdentity: {
    name: 'parallel-fixture-agent',
    email: 'parallel-fixture-agent@example.invalid',
  },
  prohibitedAgentOperations: [
    { command: 'git', argsPrefix: ['push'] },
    { command: 'git', argsPrefix: ['commit', '--amend'] },
  ],
  runnerEnvironment: {
    fixed: { CI: 'true' },
    managedHome: true,
    passThrough: ['PATH', 'TMP', 'TEMP'],
  },
};

export interface ParallelFixture {
  root: string;
  baseCommit: string;
  planFile: string;
  dispose(): void;
}

interface FixtureOptions {
  consumerDesignPath?: string;
  includeLegacyDesignPath?: boolean;
  policySource?: string;
  plan?: AuthoredParallelPlan;
}

export function writeFixtureFile(root: string, path: string, content: string | object): void {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(
    destination,
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`,
  );
}

export function git(root: string, args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

export function commitAll(root: string, message: string): string {
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', message, '--quiet']);
  return git(root, ['rev-parse', 'HEAD']);
}

export function readParallelStore(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, '.musubix/evidence/parallel.json'), 'utf8')) as Record<string, unknown>;
}

export function writeParallelStore(root: string, store: Record<string, unknown>): void {
  writeFixtureFile(root, '.musubix/evidence/parallel.json', store);
}

export async function createParallelFixture(options: FixtureOptions = {}): Promise<ParallelFixture> {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-parallel-runtime-'));
  const consumerDesignPath = options.consumerDesignPath ?? '.musubix/features/parallel-agent-development/design.md';
  const policySource = options.policySource
    ?? `# Consumer parallel design\n\nParallel-Policy: ${JSON.stringify(fixtureParallelPolicy)}\n`;
  const requirementsPath = '.musubix/features/consumer/requirements.md';
  const plan = options.plan ?? {
    schemaVersion: 1,
    concurrency: 1,
    provisionCommandNames: [],
    integratorOwnedPaths: ['.musubix/**'],
    assignments: [{
      id: 'core',
      role: 'implementation',
      requirementIds: ['REQ-M5-PARALLEL-004'],
      dependsOn: [],
      ownedPaths: ['packages/core/**'],
      focusedCommands: [{ name: 'smoke', args: [] }],
    }],
  };

  writeFixtureFile(root, '.gitignore', [
    '.musubix/journal/',
    '.musubix/evidence/parallel.json',
    '.musubix/cache/',
    '',
  ].join('\n'));
  writeFixtureFile(root, '.musubix/config.json', {
    schemaVersion: 1,
    language: 'auto',
    qualityProfile: 'custom',
    commands: [{
      name: 'smoke',
      command: process.execPath,
      args: ['-e', 'process.exit(0)'],
      required: false,
      timeoutMs: 10_000,
    }],
    requiredChecks: [],
    thresholds: { design: 0, implementation: 0, tests: 0 },
    architecture: { forbidCycles: true, rules: [] },
    codeGraph: { mode: 'compatible' },
    formal: { solver: 'none', minModeledFraction: 0, timeoutMs: 1_000 },
    mutation: { mode: 'compatible' },
    tdd: { redPreflightCommands: [] },
    approval: { mode: 'required', domains: [] },
    workflow: { mode: 'compatible', maxAgeSeconds: 3_600, maxFutureSkewSeconds: 60 },
    attestation: {
      mode: 'local',
      maxAgeSeconds: 3_600,
      maxFutureSkewSeconds: 60,
      trustedPublicKeys: [],
      githubOidc: { mode: 'off' },
    },
  });
  writeFixtureFile(root, '.musubix/changes/CHANGE-0003.md', [
    '---',
    'status: active',
    '---',
    '# CHANGE-0003',
    '',
    'Requirements: REQ-M5-PARALLEL-004 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-013',
    '',
  ].join('\n'));
  writeFixtureFile(root, '.musubix/evidence/changes.json', {
    schemaVersion: 1,
    changes: [{
      changeId: 'CHANGE-0003',
      generation: 5,
      activeGeneration: 5,
      requirementIds: [
        'REQ-M5-PARALLEL-004',
        'REQ-M5-PARALLEL-009',
        'REQ-M5-PARALLEL-013',
      ],
      phases: {},
    }],
  });
  writeFixtureFile(root, requirementsPath, '# Consumer requirements\n');
  writeFixtureFile(root, consumerDesignPath, policySource);
  if (options.includeLegacyDesignPath && consumerDesignPath !== '.musubix/features/parallel-agent-development/design.md') {
    writeFixtureFile(root, '.musubix/features/parallel-agent-development/design.md', policySource);
  }
  writeFixtureFile(root, '.musubix/evidence/approvals/requirements.json', {
    schemaVersion: 1,
    stage: 'requirements',
    changeId: 'CHANGE-0003',
    generation: 5,
    approver: 'fixture-owner',
    approvedAt: '2026-09-23T00:00:00.000Z',
    artifactSha256: 'a'.repeat(64),
    artifacts: {
      [requirementsPath]: digest(readFileSync(join(root, requirementsPath), 'utf8')),
    },
  });
  writeFixtureFile(root, '.musubix/evidence/approvals/design.json', {
    schemaVersion: 1,
    stage: 'design',
    changeId: 'CHANGE-0003',
    generation: 5,
    approver: 'fixture-owner',
    approvedAt: '2026-09-23T00:00:00.000Z',
    artifactSha256: 'b'.repeat(64),
    artifacts: {
      [consumerDesignPath]: digest(readFileSync(join(root, consumerDesignPath), 'utf8')),
    },
  });
  writeFixtureFile(root, 'parallel-plan.json', plan);
  writeFixtureFile(root, 'packages/core/value.txt', 'base\n');

  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.name', 'Parallel Fixture']);
  git(root, ['config', 'user.email', 'parallel-fixture@example.invalid']);
  const baseCommit = commitAll(root, 'fixture baseline');
  await appendJournalRecord(root, {
    stream: 'normal',
    changeId: 'CHANGE-0003',
    kind: 'workspace-baseline',
    idempotencyKey: 'fixture:workspace-baseline',
    payload: { commitSha: baseCommit },
  });

  return {
    root,
    baseCommit,
    planFile: 'parallel-plan.json',
    dispose: () => rmSync(root, resilientRemovalOptions),
  };
}

export function repositoryRoot(): string {
  return resolve(import.meta.dirname, '..', '..');
}
