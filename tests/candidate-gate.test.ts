import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  candidateMatrixJobs,
  requiredCandidateGateCommands,
  validateCandidateGateSet,
  type CandidateGateJob,
  type CandidateGateJobResult,
} from '../packages/analysis/src/candidate-gate.js';
import { approvalManifest, validateApprovalStage } from '../packages/analysis/src/approval.js';
import { sha256 } from '../packages/analysis/src/canonical.js';
import { persistCandidateSnapshot } from '../packages/analysis/src/workspace-manager.js';

const temporaryDirectories: string[] = [];

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

async function initializeCandidateRepository(): Promise<{
  root: string;
  context: Awaited<ReturnType<typeof import('../packages/analysis/src/candidate-gate.js').candidateGateContext>>;
}> {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-node24-gate-'));
  temporaryDirectories.push(root);
  git(root, 'init', '--quiet', '--initial-branch', 'change/CHANGE-0010');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');
  git(root, 'remote', 'add', 'origin', 'https://github.com/nahisaho/musubix5.git');
  mkdirSync(join(root, '.musubix', 'changes'), { recursive: true });
  mkdirSync(join(root, '.musubix', 'evidence'), { recursive: true });
  mkdirSync(join(root, '.musubix', 'features', 'node24-github-actions'), { recursive: true });
  writeFileSync(join(root, '.musubix', 'config.json'), JSON.stringify({
    schemaVersion: 1,
    approval: { mode: 'required', domains: [] },
  }));
  writeFileSync(join(root, '.musubix', 'constitution.md'), '# Constitution\n');
  writeFileSync(
    join(root, '.musubix', 'features', 'node24-github-actions', 'requirements.md'),
    [
      '# Requirements',
      '',
      '## REQ-M5-CI-001: CI',
      'Priority: must',
      'Type: non-functional',
      'Statement: The system shall use Node.js 24.',
      '',
      '## REQ-M5-RELEASE-002: Release',
      'Priority: must',
      'Type: functional',
      'Statement: The system shall validate release gates.',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, '.musubix', 'features', 'node24-github-actions', 'design.md'),
    [
      '# Design',
      '',
      '## DES-M5-CI-001: CI',
      'Responsibilities: Validate CI.',
      'Interfaces: Workflows.',
      'Constraints: Node.js 24.',
      'Requirements: REQ-M5-CI-001 REQ-M5-RELEASE-002',
      'ADRs: ADR-0020',
      '',
    ].join('\n'),
  );
  mkdirSync(join(root, '.musubix', 'decisions'), { recursive: true });
  writeFileSync(join(root, '.musubix', 'decisions', 'ADR-0020.md'), '# ADR-0020\n');
  writeFileSync(join(root, '.musubix', 'changes', 'CHANGE-0010.md'), [
    '---',
    'schemaVersion: 1',
    'id: CHANGE-0010',
    'status: active',
    '---',
    '# CHANGE-0010',
    '',
    'Requirements: REQ-M5-RELEASE-002 REQ-M5-CI-001',
    '',
  ].join('\n'));
  writeFileSync(join(root, '.musubix', 'evidence', 'changes.json'), JSON.stringify({
    schemaVersion: 1,
    changes: [{
      changeId: 'CHANGE-0010',
      activeGeneration: 1,
      requirementIds: ['REQ-M5-CI-001', 'REQ-M5-RELEASE-002'],
      phases: {},
    }],
  }));
  writeFileSync(join(root, 'package.json'), '{}\n');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'candidate');
  await persistCandidateSnapshot(root, 'CHANGE-0010', {
    requireApprovals: async () => undefined,
    requireQuality: async () => undefined,
  });
  const { candidateGateContext } =
    await import('../packages/analysis/src/candidate-gate.js');
  return { root, context: await candidateGateContext(root, 'CHANGE-0010', 1) };
}

function gateResult(
  context: Awaited<ReturnType<typeof import('../packages/analysis/src/candidate-gate.js').candidateGateContext>>,
  job: CandidateGateJob,
  status: 'pass' | 'fail' = 'pass',
): CandidateGateJobResult {
  const commands = requiredCandidateGateCommands.map((name) => ({
    name,
    digest: 'd'.repeat(64),
    status,
  }));
  return {
    schemaVersion: 1 as const,
    ...context,
    job,
    producer: 'github-actions',
    runtime: { ...job },
    commands,
    commandsPassed: status === 'pass',
    preTreeMatchesCandidate: true,
    postTreeMatchesCandidate: true,
    status,
  };
}

async function appendGateResult(
  root: string,
  result: ReturnType<typeof gateResult>,
  suffix: string,
): Promise<void> {
  const { appendEvidence } = await import('../packages/analysis/src/evidence-registry.js');
  const artifactDigest = sha256(Buffer.from(suffix));
  await appendEvidence(root, {
    kind: 'release',
    producerId: result.producer,
    repositoryId: result.repositoryId,
    candidateId: `candidate:${result.candidateCommit}`,
    changeId: result.changeId,
    inputDigest: artifactDigest,
    dependencyHeads: { candidateGate: result.gateInputFingerprint },
    status: result.status === 'pass' ? 'pass' : 'failed',
    idempotencyKey: `gate-${suffix}`,
    payload: {
      candidateGate: true,
      artifactDigest,
      result,
      attestation: {
        schemaVersion: 1,
        repository: 'nahisaho/musubix5',
        commitSha: result.candidateCommit,
        ci: { provider: 'github', runId: suffix },
        evidenceHeads: { candidateGate: artifactDigest },
        issuedAt: '2026-09-25T00:00:00.000Z',
        keyId: `test-${suffix}`,
        signature: 'test',
      },
    },
  });
}

async function candidateSnapshotList(root: string): Promise<Array<{ candidateGateStatus: string }>> {
  const stdout = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { createProgram } = await import('../packages/cli/src/main.js');
  await createProgram().parseAsync([
    'node',
    'musubix5',
    'candidate-snapshot',
    'list',
    '--root',
    root,
    '--json',
  ]);
  const payload = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as Array<{
    candidateGateStatus: string;
  }>;
  stdout.mockRestore();
  return payload;
}

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('candidate-bound matrix gates', () => {
  /**
   * @id TEST-M5-CI-NODE24-001
   * @verifies REQ-M5-CI-001 REQ-M5-CI-002 REQ-M5-COMPAT-007
   */
  it('TEST-M5-CI-NODE24-001 standardizes every GitHub Actions Node runtime on 24', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const workflowDirectory = join(root, '.github', 'workflows');
    const workflowPaths = readdirSync(workflowDirectory)
      .filter((name) => /\.ya?ml$/i.test(name))
      .map((name) => join(workflowDirectory, name));
    const setupNodeSteps: Array<{
      path: string;
      job: Record<string, unknown>;
      step: Record<string, unknown>;
    }> = [];

    for (const path of workflowPaths) {
      const workflow = parse(readFileSync(path, 'utf8')) as {
        jobs?: Record<string, Record<string, unknown>>;
      };
      for (const job of Object.values(workflow.jobs ?? {})) {
        const steps = Array.isArray(job.steps) ? job.steps : [];
        for (const value of steps) {
          if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
          const step = value as Record<string, unknown>;
          if (typeof step.uses !== 'string') continue;
          const action = step.uses.split('@', 1)[0]!.toLowerCase();
          if (action === 'actions/setup-node') setupNodeSteps.push({ path, job, step });
        }
      }
    }

    expect(setupNodeSteps).not.toHaveLength(0);
    for (const { job, step } of setupNodeSteps) {
      const withConfig = step.with;
      expect(withConfig).toBeTypeOf('object');
      expect(withConfig).not.toBeNull();
      const nodeVersion = (withConfig as Record<string, unknown>)['node-version'];
      expect(nodeVersion).toBeDefined();
      if (String(nodeVersion) === '24') continue;

      const match = /^\$\{\{ matrix\.([A-Za-z_][A-Za-z0-9_-]*) \}\}$/.exec(String(nodeVersion));
      expect(match).not.toBeNull();
      const matrix = (job.strategy as Record<string, unknown> | undefined)?.matrix;
      expect(matrix).toBeTypeOf('object');
      expect(matrix).not.toBeNull();
      expect(Object.keys(matrix as Record<string, unknown>)).toEqual(['include']);
      const include = (matrix as Record<string, unknown>).include;
      expect(Array.isArray(include)).toBe(true);
      expect(include).not.toHaveLength(0);
      const key = match![1]!;
      expect((include as Array<Record<string, unknown>>).every((entry) =>
        Object.hasOwn(entry, key))).toBe(true);
      expect(new Set((include as Array<Record<string, unknown>>)
        .map((entry) => String(entry[key])))).toEqual(new Set(['24']));
    }

    const candidateWorkflow = parse(readFileSync(
      join(workflowDirectory, 'candidate-gate.yml'),
      'utf8',
    )) as { jobs: { verify: Record<string, unknown> } };
    const verify = candidateWorkflow.jobs.verify;
    const matrix = (verify.strategy as Record<string, unknown>).matrix as {
      include: Array<Record<string, unknown>>;
    };
    expect(matrix.include).toEqual([
      { runner: 'ubuntu-latest', os: 'ubuntu', node: 24 },
      { runner: 'windows-latest', os: 'windows', node: 24 },
      { runner: 'macos-latest', os: 'macos', node: 24 },
    ]);
    expect(matrix.include.map(({ os, node }) => ({ os, nodeMajor: node })))
      .toEqual(candidateMatrixJobs);
    const verificationStep = (verify.steps as Array<Record<string, unknown>>)
      .find((step) => step.name === 'Run closed verification matrix');
    expect(verificationStep).toBeDefined();
    expect(verificationStep).not.toHaveProperty('env.TMPDIR');
    const uploads = (verify.steps as Array<Record<string, unknown>>)
      .filter((step) => typeof step.uses === 'string'
        && step.uses.toLowerCase().startsWith('actions/upload-artifact@'));
    expect(uploads).toEqual([expect.objectContaining({
      with: {
        name: 'candidate-gate-${{ matrix.os }}-node${{ matrix.node }}',
        path: '${{ runner.temp }}/candidate-gate-envelope.json',
        'if-no-files-found': 'error',
      },
    })]);

    const packageManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      engines: { node: string };
    };
    expect(packageManifest.engines.node).toBe('>=20');
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const readmeJa = readFileSync(join(root, 'README-ja.md'), 'utf8');
    const migration = readFileSync(join(root, 'docs', 'migration-guide.md'), 'utf8');
    expect(readme).toContain('Node.js 24 on Linux, Windows, and macOS');
    expect(readme).toContain('all three opaque artifacts');
    expect(readmeJa).toContain('Node.js 24をLinux、Windows、macOS');
    expect(readmeJa).toContain('3個のopaque artifact');
    expect(migration).toContain('Node.js 24 candidate matrix');
    expect(migration).toContain('RELEASE_GATE_EVIDENCE_STALE');

    const baseline = readFileSync(
      join(root, '.musubix', 'features', 'musubix5-clean-foundation', 'requirements.md'),
      'utf8',
    );
    expect(baseline).toContain('- runtime: Node.js `>=20`, ESM');
    expect(baseline).toContain(
      '- CI compatibility: Node.js 22 on Ubuntu, Windows, and macOS; Node.js 20 and\n  24 on Ubuntu',
    );
    expect(baseline).toContain('- package runtime range: Node.js `>=20`');
    expect(baseline).toContain(
      '- musubix5 verification matrix: Node.js 24 on Ubuntu, Windows, and macOS',
    );
  });

  /**
   * @id TEST-M5-CI-DEFAULT-TMPDIR-001
   * @verifies REQ-M5-CI-002
   */
  it('TEST-M5-CI-DEFAULT-TMPDIR-001 preserves the candidate runner temporary environment', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const workflowSource = readFileSync(
      join(root, '.github', 'workflows', 'candidate-gate.yml'),
      'utf8',
    );
    const workflow = parse(workflowSource) as unknown;
    const inspect = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const entry of value) inspect(entry);
        return;
      }
      if (!value || typeof value !== 'object') return;
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (key === 'env' && entry && typeof entry === 'object' && !Array.isArray(entry)) {
          expect(entry).not.toHaveProperty('TMPDIR');
        }
        inspect(entry);
      }
    };
    inspect(workflow);
    expect(workflowSource).not.toMatch(/TMPDIR[^\n]*GITHUB_ENV|GITHUB_ENV[^\n]*TMPDIR/);
  });

  /**
   * @id TEST-M5-CI-HISTORICAL-GATES-001
   * @verifies REQ-M5-RELEASE-002
   */
  it('TEST-M5-CI-HISTORICAL-GATES-001 preserves history while validating only current jobs', async () => {
    const candidateGate = await import('../packages/analysis/src/candidate-gate.js');
    expect(candidateGate.historicalCandidateMatrixJobs).toEqual([
      { os: 'ubuntu', nodeMajor: 20 },
      { os: 'ubuntu', nodeMajor: 22 },
      { os: 'windows', nodeMajor: 22 },
      { os: 'macos', nodeMajor: 22 },
    ]);

    const context = {
      repositoryId: 'repository:abc',
      changeId: 'CHANGE-0010',
      generation: 1,
      candidateCommit: 'a'.repeat(40),
      gateInputFingerprint: 'b'.repeat(64),
    };
    const current = candidateGate.candidateMatrixJobs.map((job) =>
      gateResult(context, job));
    const retired = candidateGate.historicalCandidateMatrixJobs.map((job) =>
      gateResult(context, job, 'fail'));
    expect(candidateGate.validateCandidateGateSet(context, [...retired, ...current]))
      .toEqual({ valid: true, diagnostics: [] });

    const ingestion = await initializeCandidateRepository();
    const journalDirectory = join(ingestion.root, '.musubix', 'journal', 'normal');
    const before = readdirSync(journalDirectory);
    await expect(candidateGate.ingestCandidateGateEnvelopes(ingestion.root, [{
      schemaVersion: 1,
      result: gateResult(ingestion.context, { os: 'ubuntu', nodeMajor: 20 }),
      attestation: {
        schemaVersion: 1,
        repository: 'nahisaho/musubix5',
        commitSha: ingestion.context.candidateCommit,
        ci: { provider: 'github', runId: 'retired-job' },
        evidenceHeads: { candidateGate: 'e'.repeat(64) },
        issuedAt: '2026-09-25T00:00:00.000Z',
        keyId: 'retired-job',
        signature: 'invalid',
      },
    }])).rejects.toThrow(
      'RELEASE_GATE_EVIDENCE_STALE: candidate gate ubuntu-node20 is outside the current candidate matrix.',
    );
    expect(readdirSync(journalDirectory)).toEqual(before);

    const retiredProjection = await initializeCandidateRepository();
    for (const [index, job] of candidateGate.historicalCandidateMatrixJobs.entries()) {
      await appendGateResult(
        retiredProjection.root,
        gateResult(retiredProjection.context, job, index === 0 ? 'fail' : 'pass'),
        `retired-${index}`,
      );
    }
    await expect(candidateSnapshotList(retiredProjection.root))
      .resolves.toEqual([expect.objectContaining({ candidateGateStatus: 'missing' })]);

    const currentProjection = await initializeCandidateRepository();
    for (const [index, job] of candidateGate.candidateMatrixJobs.entries()) {
      await appendGateResult(
        currentProjection.root,
        gateResult(currentProjection.context, job, index === 0 ? 'fail' : 'pass'),
        `current-${index}`,
      );
    }
    await expect(candidateSnapshotList(currentProjection.root))
      .resolves.toEqual([expect.objectContaining({ candidateGateStatus: 'fail' })]);
  });

  /**
   * @id TEST-M5-RELEASE-002
   * @verifies REQ-M5-RELEASE-002
   */
  it('TEST-M5-RELEASE-002 requires the complete passing matrix for the exact candidate', () => {
    const context = {
      repositoryId: 'repository:abc',
      changeId: 'CHANGE-0002',
      generation: 2,
      candidateCommit: 'a'.repeat(40),
      gateInputFingerprint: 'b'.repeat(64),
    };
    const records: CandidateGateJobResult[] = candidateMatrixJobs.map((job) => ({
      ...context,
      schemaVersion: 1,
      job,
      producer: 'github-actions',
      runtime: { nodeMajor: job.nodeMajor, os: job.os },
      commandsPassed: true,
      preTreeMatchesCandidate: true,
      postTreeMatchesCandidate: true,
      status: 'pass',
    }));

    expect(validateCandidateGateSet(context, records)).toEqual({ valid: true, diagnostics: [] });
    expect(validateCandidateGateSet(context, records.slice(1))).toMatchObject({
      valid: false,
      diagnostics: [{ code: 'RELEASE_GATE_EVIDENCE_MISSING' }],
    });
    expect(validateCandidateGateSet(context, [
      { ...records[0]!, candidateCommit: 'c'.repeat(40) },
      ...records.slice(1),
    ])).toMatchObject({
      valid: false,
      diagnostics: [{ code: 'RELEASE_GATE_CANDIDATE_MISMATCH' }],
    });

  });

  /**
   * @id TEST-M5-RELEASE-002-APPROVAL-001
   * @verifies REQ-M5-RELEASE-002
   */
  it('TEST-M5-RELEASE-002-APPROVAL-001 rejects release preparation without active-generation matrix evidence', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-candidate-gate-approval-'));
    execFileSync('git', ['init', '--quiet', root]);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test User']);
    mkdirSync(join(root, '.musubix', 'changes'), { recursive: true });
    mkdirSync(join(root, '.musubix', 'evidence'), { recursive: true });
    writeFileSync(join(root, '.musubix', 'changes', 'CHANGE-0002.md'), '# CHANGE-0002\n');
    writeFileSync(join(root, '.musubix', 'evidence', 'changes.json'), JSON.stringify({
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0002',
        generation: 2,
        state: 'active',
        requirementIds: ['REQ-M5-RELEASE-002'],
        phases: {},
      }],
    }));
    writeFileSync(join(root, 'package.json'), '{}\n');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', 'candidate']);
    await persistCandidateSnapshot(root, 'CHANGE-0002');

    await expect(approvalManifest(root, 'release'))
      .rejects.toThrow('RELEASE_GATE_EVIDENCE_MISSING');
  });

  /**
   * @id TEST-M5-RELEASE-002-GATE-DIAGNOSTIC-001
   * @verifies REQ-M5-RELEASE-002
   */
  it('TEST-M5-RELEASE-002-GATE-DIAGNOSTIC-001 reports missing matrix evidence as approval non-pass', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-candidate-gate-diagnostic-'));
    execFileSync('git', ['init', '--quiet', root]);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test User']);
    mkdirSync(join(root, '.musubix', 'changes'), { recursive: true });
    mkdirSync(join(root, '.musubix', 'evidence'), { recursive: true });
    writeFileSync(join(root, '.musubix', 'changes', 'CHANGE-0002.md'), '# CHANGE-0002\n');
    writeFileSync(join(root, '.musubix', 'evidence', 'changes.json'), JSON.stringify({
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0002',
        generation: 2,
        state: 'active',
        requirementIds: ['REQ-M5-RELEASE-002'],
        phases: {},
      }],
    }));
    writeFileSync(join(root, 'package.json'), '{}\n');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', 'candidate']);
    await persistCandidateSnapshot(root, 'CHANGE-0002');

    await expect(validateApprovalStage(root, 'release', { mode: 'required', domains: [] }))
      .resolves.toMatchObject({
        status: 'missing',
        diagnostics: [{ code: 'RELEASE_GATE_EVIDENCE_MISSING' }],
      });
  });
});
