import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalBytes, sha256 } from '../packages/analysis/src/canonical.js';

const temporaryDirectories: string[] = [];

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function initializeRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-candidate-snapshot-'));
  temporaryDirectories.push(root);
  git(root, 'init', '--quiet', '--initial-branch', 'change/CHANGE-0007');
  git(root, 'config', 'core.filemode', 'false');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');
  git(root, 'remote', 'add', 'origin', 'https://github.com/example/musubix5.git');
  mkdirSync(join(root, 'nested'), { recursive: true });
  writeFileSync(join(root, 'alpha.txt'), 'alpha\n');
  writeFileSync(join(root, 'nested', 'run.sh'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(root, 'nested', 'run.sh'), 0o755);
  git(root, 'add', '.');
  git(root, 'update-index', '--chmod=+x', 'nested/run.sh');
  git(root, 'commit', '--quiet', '-m', 'candidate');
  return root;
}

function writeActiveChange(root: string): void {
  mkdirSync(join(root, '.musubix', 'changes'), { recursive: true });
  mkdirSync(join(root, '.musubix', 'evidence'), { recursive: true });
  writeFileSync(join(root, '.musubix', 'changes', 'CHANGE-0007.md'), [
    '---',
    'status: active',
    '---',
    '# CHANGE-0007',
    '',
  ].join('\n'));
  writeFileSync(join(root, '.musubix', 'evidence', 'changes.json'), JSON.stringify({
    schemaVersion: 1,
    changes: [{
      changeId: 'CHANGE-0007',
      activeGeneration: 4,
      requirementIds: ['REQ-M5-WORKTREE-005'],
    }],
  }));
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'active change');
}

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('candidate snapshot lifecycle', () => {
  /**
   * @id TEST-M5-WORKTREE-SNAPSHOT-MANIFEST-001
   * @verifies REQ-M5-WORKTREE-005
   */
  it('TEST-M5-WORKTREE-SNAPSHOT-MANIFEST-001 builds a canonical candidate tree manifest', async () => {
    const root = initializeRepository();
    const commit = git(root, 'rev-parse', 'HEAD');
    const { candidateTreeManifest } =
      await import('../packages/analysis/src/workspace-manager.js');

    const manifest = await candidateTreeManifest(root, commit);

    expect(manifest.entries).toEqual([
      {
        path: 'alpha.txt',
        gitMode: '100644',
        objectType: 'blob',
        objectId: expect.stringMatching(/^[a-f0-9]{40,64}$/),
      },
      {
        path: 'nested/run.sh',
        gitMode: '100755',
        objectType: 'blob',
        objectId: expect.stringMatching(/^[a-f0-9]{40,64}$/),
      },
    ]);
    expect(manifest.artifactManifestDigest).toBe(sha256(canonicalBytes(manifest.entries)));
  });

  /**
   * @id TEST-M5-WORKTREE-SNAPSHOT-CREATE-001
   * @verifies REQ-M5-WORKTREE-005
   */
  it('TEST-M5-WORKTREE-SNAPSHOT-CREATE-001 persists versioned identity and replays before cleanliness', async () => {
    const root = initializeRepository();
    writeActiveChange(root);
    const { persistCandidateSnapshot } =
      await import('../packages/analysis/src/workspace-manager.js');
    const evaluators = {
      requireApprovals: async () => undefined,
      requireQuality: async () => undefined,
    };

    const created = await persistCandidateSnapshot(root, 'CHANGE-0007', evaluators);
    const replayed = await persistCandidateSnapshot(root, 'CHANGE-0007', evaluators);
    const journal = JSON.parse(readFileSync(join(root, created.journalPath), 'utf8')) as {
      payload: Record<string, unknown>;
    };

    expect(created).toEqual({
      snapshotId: 'snapshot-000000000001',
      changeId: 'CHANGE-0007',
      generation: 4,
      repositoryId: expect.stringMatching(/^repository:[a-f0-9]{64}$/),
      branch: 'change/CHANGE-0007',
      commit: expect.stringMatching(/^[a-f0-9]{40,64}$/),
      artifactManifestDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      order: 1,
      journalPath: '.musubix/journal/normal/000000000001.json',
      replayed: false,
      guidance: expect.stringContaining('candidate-snapshot show snapshot-000000000001'),
    });
    expect(replayed).toEqual({ ...created, replayed: true });
    expect(journal.payload).toMatchObject({
      recordVersion: 1,
      changeId: 'CHANGE-0007',
      generation: 4,
      repositoryId: created.repositoryId,
      branch: created.branch,
      commit: created.commit,
      artifactManifestDigest: created.artifactManifestDigest,
      createdAt: created.createdAt,
    });
  });

  /**
   * @id TEST-M5-WORKTREE-SNAPSHOT-CLI-001
   * @verifies REQ-M5-WORKTREE-005
   */
  it('TEST-M5-WORKTREE-SNAPSHOT-CLI-001 rejects a malformed create token before workspace access', async () => {
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { createProgram } = await import('../packages/cli/src/main.js');

    await createProgram().parseAsync([
      'node',
      'musubix5',
      'candidate-snapshot',
      'create',
      'not-a-change',
      '--root',
      '/definitely/missing',
      '--json',
    ]);

    expect(process.exitCode).toBe(2);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toEqual({
      error: {
        code: 'CLI_ERROR',
        message: 'change-id must match CHANGE-<digits>.',
      },
    });
  });

  /**
   * @id TEST-M5-WORKTREE-SNAPSHOT-GUIDANCE-001
   * @verifies REQ-M5-WORKTREE-006
   */
  it('TEST-M5-WORKTREE-SNAPSHOT-GUIDANCE-001 reports the executable create recovery command', async () => {
    const root = initializeRepository();
    const { resolveCandidateSnapshot } =
      await import('../packages/analysis/src/workspace-manager.js');

    await expect(resolveCandidateSnapshot(root, 'CHANGE-0007')).rejects.toThrow(
      'APPROVAL_CANDIDATE_MISSING: run `musubix5 candidate-snapshot create CHANGE-0007`.',
    );
  });

  /**
   * @id TEST-M5-WORKTREE-SNAPSHOT-READ-001
   * @verifies REQ-M5-WORKTREE-006
   */
  it('TEST-M5-WORKTREE-SNAPSHOT-READ-001 lists and shows deleted snapshot history deterministically', async () => {
    const root = initializeRepository();
    writeActiveChange(root);
    const { appendJournalRecord } = await import('../packages/analysis/src/journal.js');
    const {
      listCandidateSnapshotRecords,
      persistCandidateSnapshot,
      showCandidateSnapshotRecord,
    } = await import('../packages/analysis/src/workspace-manager.js');
    const evaluators = {
      requireApprovals: async () => undefined,
      requireQuality: async () => undefined,
    };
    const created = await persistCandidateSnapshot(root, 'CHANGE-0007', evaluators);
    await appendJournalRecord(root, {
      stream: 'normal',
      changeId: created.changeId,
      kind: 'workspace-candidate-snapshot-deleted',
      idempotencyKey: `workspace:${created.changeId}:candidate-snapshot-delete:${created.order}`,
      payload: {
        recordVersion: 1,
        repositoryId: created.repositoryId,
        snapshotOrder: created.order,
        deletedAt: '2026-01-02T03:04:05.000Z',
        deletedBy: 'Test User',
      },
    });

    const records = await listCandidateSnapshotRecords(root);

    expect(records).toEqual([{
      snapshotId: created.snapshotId,
      recordVersion: 1,
      legacy: false,
      changeId: created.changeId,
      generation: 4,
      repositoryId: created.repositoryId,
      branch: created.branch,
      commit: created.commit,
      artifactManifestDigest: created.artifactManifestDigest,
      createdAt: created.createdAt,
      order: created.order,
      journalPath: created.journalPath,
      deleted: true,
      deletedAt: '2026-01-02T03:04:05.000Z',
      deletedBy: 'Test User',
      commitStatus: 'reachable',
      repositoryStatus: 'match',
      conflicting: false,
    }]);
    await expect(showCandidateSnapshotRecord(root, created.snapshotId)).resolves.toEqual(records[0]);
  });

  /**
   * @id TEST-M5-WORKTREE-SNAPSHOT-LIST-CLI-001
   * @verifies REQ-M5-WORKTREE-006
   */
  it('TEST-M5-WORKTREE-SNAPSHOT-LIST-CLI-001 exposes the exact public projection shape', async () => {
    const root = initializeRepository();
    writeActiveChange(root);
    const { persistCandidateSnapshot } =
      await import('../packages/analysis/src/workspace-manager.js');
    await persistCandidateSnapshot(root, 'CHANGE-0007', {
      requireApprovals: async () => undefined,
      requireQuality: async () => undefined,
    });
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

    expect(Object.keys(JSON.parse(String(stdout.mock.calls[0]?.[0]))[0])).toEqual([
      'snapshotId',
      'recordVersion',
      'legacy',
      'changeId',
      'generation',
      'repositoryId',
      'branch',
      'commit',
      'artifactManifestDigest',
      'createdAt',
      'order',
      'journalPath',
      'deleted',
      'requirementsApprovalStatus',
      'designApprovalStatus',
      'qualityStatus',
      'candidateGateStatus',
      'commitStatus',
      'repositoryStatus',
      'releaseApprovalStatus',
      'eligibilityStatus',
      'replacementRequired',
      'protected',
      'guidance',
    ]);
  });

  /**
   * @id TEST-M5-WORKTREE-SNAPSHOT-DELETE-001
   * @verifies REQ-M5-WORKTREE-007
   */
  it('TEST-M5-WORKTREE-SNAPSHOT-DELETE-001 appends an audited tombstone and replays by actor', async () => {
    const root = initializeRepository();
    writeActiveChange(root);
    const {
      deleteCandidateSnapshot,
      persistCandidateSnapshot,
    } = await import('../packages/analysis/src/workspace-manager.js');
    const created = await persistCandidateSnapshot(root, 'CHANGE-0007', {
      requireApprovals: async () => undefined,
      requireQuality: async () => undefined,
    });
    const evaluators = {
      evaluateProtection: async () => ({
        protected: false,
        releaseApprovalStatus: 'missing' as const,
        releaseApprovalArtifactSha256: null,
        invalidatedStates: [],
      }),
    };

    const deleted = await deleteCandidateSnapshot(
      root,
      created.snapshotId,
      'Test User',
      evaluators,
    );
    const replayed = await deleteCandidateSnapshot(
      root,
      created.snapshotId,
      'Test User',
      evaluators,
    );

    expect(deleted).toEqual({
      snapshotId: created.snapshotId,
      changeId: created.changeId,
      commit: created.commit,
      artifactManifestDigest: created.artifactManifestDigest,
      deletedBy: 'Test User',
      deletedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      releaseApprovalStatus: 'missing',
      releaseApprovalArtifactSha256: null,
      tombstoneOrder: 2,
      tombstonePath: '.musubix/journal/normal/000000000002.json',
      replayed: false,
      invalidatedStates: [],
      guidance: expect.stringContaining('creation record and Git commit remain immutable'),
    });
    expect(replayed).toEqual({ ...deleted, replayed: true });
    await expect(deleteCandidateSnapshot(
      root,
      created.snapshotId,
      'Another User',
      evaluators,
    )).rejects.toThrow('CANDIDATE_SNAPSHOT_ALREADY_DELETED');
  });

  /**
   * @id TEST-M5-COMPAT-OBJECT-ID-WIDTH-001
   * @verifies REQ-M5-COMPAT-013 REQ-M5-RELEASE-002
   */
  it('TEST-M5-COMPAT-OBJECT-ID-WIDTH-001 accepts lowercase 40-to-64-character release object IDs', async () => {
    const { validateReleaseContext } =
      await import('../packages/analysis/src/release-workflow.js');
    const identity = {
      schemaVersion: 'release-context-v1',
      mode: 'dispatch',
      workflow: '.github/workflows/release.yml',
      repository: `repository:${'a'.repeat(64)}`,
      releaseTag: 'v1.2.3',
      candidateCommit: 'b'.repeat(64),
      evidenceCommit: 'c'.repeat(64),
      verifiedReleaseApprovalSha256: 'd'.repeat(64),
    };

    expect(validateReleaseContext(identity)).toMatchObject({
      candidateCommit: 'b'.repeat(64),
      evidenceCommit: 'c'.repeat(64),
    });
    expect(() => validateReleaseContext({
      ...identity,
      candidateCommit: 'B'.repeat(40),
    })).toThrow('candidate commit is invalid');
    expect(() => validateReleaseContext({
      ...identity,
      evidenceCommit: 'c'.repeat(65),
    })).toThrow('dispatch evidence binding is invalid');
  });

  /**
   * @id TEST-M5-LIFECYCLE-SNAPSHOT-MAINTENANCE-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-WORKTREE-007
   */
  it('TEST-M5-LIFECYCLE-SNAPSHOT-MAINTENANCE-001 replays a tombstone through its CHANGE selector', async () => {
    const root = initializeRepository();
    writeActiveChange(root);
    const {
      deleteCandidateSnapshot,
      persistCandidateSnapshot,
    } = await import('../packages/analysis/src/workspace-manager.js');
    const created = await persistCandidateSnapshot(root, 'CHANGE-0007', {
      requireApprovals: async () => undefined,
      requireQuality: async () => undefined,
    });
    const evaluators = {
      evaluateProtection: async () => ({
        protected: false,
        releaseApprovalStatus: 'missing' as const,
        releaseApprovalArtifactSha256: null,
        invalidatedStates: [],
      }),
    };
    const deleted = await deleteCandidateSnapshot(
      root,
      created.snapshotId,
      'Test User',
      evaluators,
    );

    await expect(deleteCandidateSnapshot(
      root,
      'CHANGE-0007',
      'Test User',
      evaluators,
    )).resolves.toEqual({ ...deleted, replayed: true });
  });

  /**
   * @id TEST-M5-WORKTREE-SNAPSHOT-PROJECTION-001
   * @verifies REQ-M5-WORKTREE-006
   */
  it('TEST-M5-WORKTREE-SNAPSHOT-PROJECTION-001 preserves a current basis when gates are missing', async () => {
    const { composeCandidateSnapshotProjection } =
      await import('../packages/cli/src/main.js');

    expect(composeCandidateSnapshotProjection({
      snapshotId: 'snapshot-000000000001',
      recordVersion: 1,
      legacy: false,
      changeId: 'CHANGE-0007',
      generation: 4,
      repositoryId: `repository:${'a'.repeat(64)}`,
      branch: 'change/CHANGE-0007',
      commit: 'b'.repeat(40),
      artifactManifestDigest: 'c'.repeat(64),
      createdAt: '2026-01-02T03:04:05.000Z',
      order: 1,
      journalPath: '.musubix/journal/normal/000000000001.json',
      deleted: false,
      commitStatus: 'reachable',
      repositoryStatus: 'match',
      conflicting: false,
    }, {
      current: true,
      requirementsApprovalStatus: 'approved',
      designApprovalStatus: 'approved',
      qualityStatus: 'current',
      candidateGateStatus: 'missing',
      releaseApprovalStatus: 'missing',
      protected: false,
    })).toMatchObject({
      eligibilityStatus: 'stale',
      replacementRequired: false,
      protected: false,
      guidance: 'Run candidate-bound gates before release approval.',
    });
  });

  /**
   * @id TEST-M5-RELEASE-DELETED-SNAPSHOT-001
   * @verifies REQ-M5-RELEASE-002 REQ-M5-WORKTREE-007
   */
  it('TEST-M5-RELEASE-DELETED-SNAPSHOT-001 excludes a tombstoned snapshot from release selection', async () => {
    const root = initializeRepository();
    writeActiveChange(root);
    const {
      deleteCandidateSnapshot,
      persistCandidateSnapshot,
      resolveCandidateSnapshot,
    } = await import('../packages/analysis/src/workspace-manager.js');
    const created = await persistCandidateSnapshot(root, 'CHANGE-0007', {
      requireApprovals: async () => undefined,
      requireQuality: async () => undefined,
    });
    await deleteCandidateSnapshot(root, created.snapshotId, 'Test User', {
      evaluateProtection: async () => ({
        protected: false,
        releaseApprovalStatus: 'missing',
        releaseApprovalArtifactSha256: null,
        invalidatedStates: [],
      }),
    });

    await expect(resolveCandidateSnapshot(root, 'CHANGE-0007')).rejects.toThrow(
      'APPROVAL_CANDIDATE_MISSING',
    );
  });

  /**
   * @id TEST-M5-WORKTREE-SNAPSHOT-JOURNAL-001
   * @verifies REQ-M5-WORKTREE-005
   */
  it('TEST-M5-WORKTREE-SNAPSHOT-JOURNAL-001 fails closed on malformed snapshot evidence', async () => {
    const root = initializeRepository();
    writeActiveChange(root);
    const { appendJournalRecord, verifyJournal } =
      await import('../packages/analysis/src/journal.js');
    const { persistCandidateSnapshot } =
      await import('../packages/analysis/src/workspace-manager.js');
    await appendJournalRecord(root, {
      stream: 'normal',
      changeId: 'CHANGE-0007',
      kind: 'workspace-candidate-snapshot',
      idempotencyKey: 'malformed-snapshot',
      payload: {
        recordVersion: 1,
        branch: 'change/CHANGE-0007',
        commit: git(root, 'rev-parse', 'HEAD'),
        generation: 4,
        artifactManifestDigest: 'a'.repeat(64),
        createdAt: '2026-01-02T03:04:05.000Z',
      },
    });

    await expect(persistCandidateSnapshot(root, 'CHANGE-0007', {
      requireApprovals: async () => undefined,
      requireQuality: async () => undefined,
    })).rejects.toThrow(
      'APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot journal is invalid.',
    );
    expect(await verifyJournal(root)).toHaveLength(1);
  });

  /**
   * @id TEST-M5-RELEASE-STALE-SNAPSHOT-001
   * @verifies REQ-M5-RELEASE-002 REQ-M5-WORKTREE-006
   */
  it('TEST-M5-RELEASE-STALE-SNAPSHOT-001 rejects a non-current generation candidate', async () => {
    const root = initializeRepository();
    writeActiveChange(root);
    const { persistCandidateSnapshot, resolveCandidateSnapshot } =
      await import('../packages/analysis/src/workspace-manager.js');
    const created = await persistCandidateSnapshot(root, 'CHANGE-0007');
    expect(created.generation).toBe(4);
    writeFileSync(join(root, '.musubix', 'evidence', 'changes.json'), JSON.stringify({
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0007',
        activeGeneration: 5,
        requirementIds: ['REQ-M5-WORKTREE-005'],
      }],
    }));

    await expect(resolveCandidateSnapshot(root, 'CHANGE-0007')).rejects.toThrow(
      'APPROVAL_CANDIDATE_UNAVAILABLE',
    );
  });

  /**
   * @id TEST-M5-WORKTREE-SNAPSHOT-PROTECTION-001
   * @verifies REQ-M5-WORKTREE-006 REQ-M5-WORKTREE-007
   */
  it('TEST-M5-WORKTREE-SNAPSHOT-PROTECTION-001 protects a legacy snapshot selected by release commit', async () => {
    const { releaseApprovalSelectsSnapshot } =
      await import('../packages/cli/src/main.js');

    expect(releaseApprovalSelectsSnapshot({
      changeId: 'CHANGE-0007',
      generation: 4,
      projection: { candidateCommit: 'a'.repeat(40) },
    }, {
      snapshotId: 'snapshot-000000000001',
      recordVersion: 0,
      legacy: true,
      changeId: 'CHANGE-0007',
      generation: null,
      repositoryId: `repository:${'b'.repeat(64)}`,
      branch: 'change/CHANGE-0007',
      commit: 'a'.repeat(40),
      artifactManifestDigest: null,
      createdAt: null,
      order: 1,
      journalPath: '.musubix/journal/normal/000000000001.json',
      deleted: false,
      commitStatus: 'reachable',
      repositoryStatus: 'match',
      conflicting: false,
    })).toBe(true);
  });

  /**
   * @id TEST-M5-WORKTREE-SNAPSHOT-FINGERPRINT-001
   * @verifies REQ-M5-WORKTREE-005
   */
  it('TEST-M5-WORKTREE-SNAPSHOT-FINGERPRINT-001 evaluates quality fingerprints without writing trace files', async () => {
    const root = initializeRepository();
    mkdirSync(join(root, '.musubix', 'features', 'demo'), { recursive: true });
    writeFileSync(join(root, '.musubix', 'features', 'demo', 'requirements.md'), [
      '# Requirements',
      '',
      '## REQ-DEMO-001: Demo',
      'Priority: must',
      'Type: functional',
      'Pattern: ubiquitous',
      'Statement: The system shall remain deterministic.',
      'Acceptance: The output is deterministic.',
      '',
    ].join('\n'));
    writeFileSync(join(root, '.musubix', 'features', 'demo', 'design.md'), [
      '# Design',
      '',
      '## DES-DEMO-001: Demo',
      'Requirements: REQ-DEMO-001',
      'Responsibilities: Preserve deterministic behavior.',
      'Interfaces: `demo()`',
      'Constraints: No mutable global state.',
      '',
    ].join('\n'));
    const tracePath = join(root, '.musubix', 'features', 'demo', 'trace.json');
    writeFileSync(tracePath, 'sentinel\n');
    const { currentChangeFingerprints } =
      await import('../packages/analysis/src/change.js');

    await currentChangeFingerprints(root, 'CHANGE-0007', ['REQ-DEMO-001']);

    expect(readFileSync(tracePath, 'utf8')).toBe('sentinel\n');
  });
});
