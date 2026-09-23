import { execFileSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { approvalManifest } from '../packages/analysis/src/approval.js';
import { recordApproval } from '../packages/analysis/src/approval-record.js';
import { recordChangePhase } from '../packages/analysis/src/change.js';
import { defaultConfig } from '../packages/analysis/src/config.js';
import { appendJournalRecord } from '../packages/analysis/src/journal.js';
import { appendEvidenceOrder } from '../packages/analysis/src/order.js';

const temporaryDirectories: string[] = [];

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, content);
}

async function fixture(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-phase-checkpoint-'));
  temporaryDirectories.push(root);
  execFileSync('git', ['init', '--quiet', root]);
  write(root, '.musubix/config.json', JSON.stringify(defaultConfig));
  write(root, '.musubix/constitution.md', readFileSync(resolve('.musubix/constitution.md'), 'utf8'));
  write(root, '.musubix/changes/CHANGE-0003.md', [
    '---',
    'schemaVersion: 1',
    'id: CHANGE-0003',
    'status: active',
    '---',
    '# CHANGE-0003',
    '',
    'Requirements: REQ-M5-LIFECYCLE-005',
    '',
  ].join('\n'));
  write(root, '.musubix/features/sample/requirements.md', [
    '## REQ-M5-LIFECYCLE-005: Phase checkpoint supersession',
    'Priority: must',
    'Type: functional',
    'Pattern: event-driven',
    'Statement: When approval changes, the system shall append a superseding checkpoint.',
    'Acceptance: Exact operation replay returns one persisted checkpoint and a distinct operation is rejected.',
    '',
  ].join('\n'));
  write(root, '.musubix/features/sample/design.md', [
    '## DES-M5-005: Phase checkpoint state machine',
    'Responsibilities: Supersede approved phase checkpoints.',
    'Interfaces: `recordApprovedPhase()`.',
    'Constraints: Journal before projection.',
    'Requirements: REQ-M5-LIFECYCLE-005',
    'ADRs: ADR-0015',
    '',
  ].join('\n'));
  write(root, '.musubix/decisions/ADR-0015.md', '# ADR-0015\n');

  const impact = await appendEvidenceOrder(root, {
    kind: 'change',
    entityId: 'CHANGE-0003',
    phase: 'g5:impact',
  });
  const requirements = await appendEvidenceOrder(root, {
    kind: 'change',
    entityId: 'CHANGE-0003',
    phase: 'g5:requirements',
  });
  const design = await appendEvidenceOrder(root, {
    kind: 'change',
    entityId: 'CHANGE-0003',
    phase: 'g5:design',
  });
  const fingerprints = {
    impact: 'impact-before',
    requirements: 'requirements-before',
    design: 'design-before',
    implementation: 'implementation-before',
    tests: 'tests-before',
    tdd: 'tdd-before',
  };
  write(root, '.musubix/evidence/changes.json', JSON.stringify({
    schemaVersion: 1,
    changes: [{
      changeId: 'CHANGE-0003',
      generation: 5,
      activeGeneration: 5,
      requirementIds: ['REQ-M5-LIFECYCLE-005'],
      phases: {
        impact: {
          phase: 'impact',
          order: impact.sequence,
          recordedAt: '2026-09-23T00:00:00.000Z',
          fingerprints,
        },
        requirements: {
          phase: 'requirements',
          order: requirements.sequence,
          recordedAt: '2026-09-23T00:01:00.000Z',
          fingerprints,
        },
        design: {
          phase: 'design',
          order: design.sequence,
          recordedAt: '2026-09-23T00:02:00.000Z',
          fingerprints,
        },
      },
    }],
  }));
  const manifest = await approvalManifest(root, 'requirements');
  await recordApproval(
    root,
    'requirements',
    'reviewer',
    manifest.artifactSha256,
    defaultConfig.approval,
  );
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('same-generation phase checkpoint operations', () => {
  /**
   * @id TEST-M5-LIFECYCLE-PHASE-CHECKPOINT-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-COMPAT-013
   */
  it('TEST-M5-LIFECYCLE-PHASE-CHECKPOINT-001 journals, projects, and replays one scoped operation', async () => {
    const root = await fixture();
    const operation = { operationId: 'requirements-refresh-1' };

    const first = await recordChangePhase(
      root,
      'CHANGE-0003',
      'requirements',
      ['REQ-M5-LIFECYCLE-005'],
      operation,
    );
    expect(first.changes[0]).toMatchObject({
      phases: {
        requirements: {
          phase: 'requirements',
          requirementsOrdinal: 2,
          operationId: 'requirements-refresh-1',
        },
      },
      requirementsHistory: [{
        phase: 'requirements',
        requirementsOrdinal: 1,
      }],
    });
    expect(first.changes[0]?.requirementsHistory?.[0]).not.toHaveProperty('operationId');

    const replay = await recordChangePhase(
      root,
      'CHANGE-0003',
      'requirements',
      ['REQ-M5-LIFECYCLE-005'],
      operation,
    );
    expect(replay).toEqual(first);
    expect(readdirSync(join(root, '.musubix/journal/normal'))).toHaveLength(1);

    await expect(recordChangePhase(
      root,
      'CHANGE-0003',
      'requirements',
      ['REQ-M5-LIFECYCLE-005'],
      { operationId: 'requirements-refresh-2' },
    )).rejects.toThrow('CHANGE_GENERATION_DUPLICATE');
  });

  /**
   * @id TEST-M5-LIFECYCLE-PHASE-CHECKPOINT-ORDER-001
   * @verifies REQ-M5-LIFECYCLE-005
   */
  it('TEST-M5-LIFECYCLE-PHASE-CHECKPOINT-ORDER-001 validates histories against contemporaneous predecessors', async () => {
    const root = await fixture();
    const requirements2 = await appendEvidenceOrder(root, {
      kind: 'change',
      entityId: 'CHANGE-0003',
      phase: 'g5:requirements:2',
    });
    const evidencePath = join(root, '.musubix/evidence/changes.json');
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as {
      changes: Array<Record<string, unknown> & {
        phases: Record<string, Record<string, unknown>>;
      }>;
    };
    const change = evidence.changes[0]!;
    const requirements1 = change.phases.requirements!;
    requirements1.requirementsOrdinal = 1;
    change.requirementsHistory = [requirements1];
    change.phases.requirements = {
      ...requirements1,
      order: requirements2.sequence,
      requirementsOrdinal: 2,
      operationId: 'requirements-refresh-1',
      recordedAt: '2026-09-23T00:03:00.000Z',
    };
    writeFileSync(evidencePath, JSON.stringify(evidence));

    const { validateChangeEvidence } = await import('../packages/analysis/src/change.js');
    const report = await validateChangeEvidence(root);
    expect(report.diagnostics.filter((diagnostic) =>
      diagnostic.code === 'CHANGE_ORDER_MISMATCH'
      || diagnostic.code === 'CHANGE_PHASE_ORDER')).toEqual([]);
  });

  /**
   * @id TEST-M5-LIFECYCLE-PHASE-CHECKPOINT-PENDING-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-COMPAT-013
   */
  it('TEST-M5-LIFECYCLE-PHASE-CHECKPOINT-PENDING-001 reports pending checkpoints without projecting them', async () => {
    const root = await fixture();
    const before = readFileSync(join(root, '.musubix/evidence/changes.json'), 'utf8');
    const fingerprints = JSON.parse(before).changes[0].phases.requirements.fingerprints;
    await appendJournalRecord(root, {
      stream: 'normal',
      changeId: 'CHANGE-0003',
      kind: 'change-phase-checkpoint',
      idempotencyKey: 'change-phase-checkpoint:CHANGE-0003:g5:requirements:requirements-refresh-1',
      payload: {
        schemaVersion: 1,
        changeId: 'CHANGE-0003',
        generation: 5,
        phase: 'requirements',
        operationId: 'requirements-refresh-1',
        ordinal: 2,
        approvalManifestSha256: 'a'.repeat(64),
        requirementIds: ['REQ-M5-LIFECYCLE-005'],
        fingerprints,
        semanticPhaseKey: 'change:CHANGE-0003:g5:requirements',
        orderPhaseKey: 'requirements:2',
        recordedAt: '2026-09-23T00:03:00.000Z',
        fencingToken: 1,
      },
    });

    const { projectStatus } = await import('../packages/analysis/src/gate.js');
    const status = await projectStatus(root);
    expect(status.change?.generations).toContainEqual({
      generation: 5,
      status: 'active',
      unprojectedPhaseCheckpoints: [{
        generation: 5,
        phase: 'requirements',
        operationId: 'requirements-refresh-1',
        ordinal: 2,
        journalOrder: 1,
      }],
    });
    expect(readFileSync(join(root, '.musubix/evidence/changes.json'), 'utf8')).toBe(before);
  });

  /**
   * @id TEST-M5-LIFECYCLE-PHASE-CHECKPOINT-ABANDON-001
   * @verifies REQ-M5-LIFECYCLE-005
   */
  it('TEST-M5-LIFECYCLE-PHASE-CHECKPOINT-ABANDON-001 recovers the departing generation before abandon', async () => {
    const root = await fixture();
    const evidencePath = join(root, '.musubix/evidence/changes.json');
    const before = JSON.parse(readFileSync(evidencePath, 'utf8'));
    await appendJournalRecord(root, {
      stream: 'normal',
      changeId: 'CHANGE-0003',
      kind: 'change-phase-checkpoint',
      idempotencyKey: 'change-phase-checkpoint:CHANGE-0003:g5:requirements:requirements-refresh-1',
      payload: {
        schemaVersion: 1,
        changeId: 'CHANGE-0003',
        generation: 5,
        phase: 'requirements',
        operationId: 'requirements-refresh-1',
        ordinal: 2,
        approvalManifestSha256: 'a'.repeat(64),
        requirementIds: ['REQ-M5-LIFECYCLE-005'],
        fingerprints: before.changes[0].phases.requirements.fingerprints,
        semanticPhaseKey: 'change:CHANGE-0003:g5:requirements',
        orderPhaseKey: 'requirements:2',
        recordedAt: '2026-09-23T00:03:00.000Z',
        fencingToken: 1,
      },
    });

    const { abandonPersistedChangeGeneration } = await import('../packages/analysis/src/change.js');
    const abandoned = await abandonPersistedChangeGeneration(root, 'CHANGE-0003', {
      reason: 'restart after approved lifecycle correction',
      approver: 'reviewer',
      confirm: true,
    });
    expect(abandoned.changes[0]).toMatchObject({
      activeGeneration: null,
      phases: {
        requirements: {
          requirementsOrdinal: 2,
          operationId: 'requirements-refresh-1',
        },
      },
      requirementsHistory: [{ requirementsOrdinal: 1 }],
    });
  });
});
