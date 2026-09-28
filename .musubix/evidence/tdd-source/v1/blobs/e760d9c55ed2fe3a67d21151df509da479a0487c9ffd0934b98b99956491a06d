import { execFileSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, content);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('CHANGE generation reopen recovery', () => {
  /**
   * @id TEST-M5-LIFECYCLE-REOPEN-RESUME-001
   * @verifies REQ-M5-LIFECYCLE-005
   */
  it('TEST-M5-LIFECYCLE-REOPEN-RESUME-001 resumes a persisted impact without allocating twice', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-generation-resume-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    write(root, '.musubix/changes/CHANGE-0002.md', [
      '# CHANGE-0002',
      '',
      'Requirements: REQ-M5-LIFECYCLE-005',
      '',
    ].join('\n'));
    write(root, '.musubix/features/sample/requirements.md', [
      '## REQ-M5-LIFECYCLE-005: Generation',
      'Priority: must',
      'Type: functional',
      'Statement: The system shall resume a generation.',
      'Acceptance: Repeated reopen keeps one impact order.',
      '',
    ].join('\n'));
    write(root, '.musubix/features/sample/design.md', [
      '## DES-M5-005: Generation',
      'Responsibilities: Resume a generation.',
      'Interfaces: `reopen()`.',
      'Constraints: Idempotent.',
      'Requirements: REQ-M5-LIFECYCLE-005',
      'ADRs: ADR-0010',
      '',
    ].join('\n'));
    write(root, '.musubix/decisions/ADR-0010.md', '# ADR\n');

    const { appendEvidenceOrder } = await import('../packages/analysis/src/order.js');
    const impactOrder = await appendEvidenceOrder(root, {
      kind: 'change',
      entityId: 'CHANGE-0002',
      phase: 'g2:impact',
    });
    const fingerprints = {
      impact: 'impact',
      requirements: 'requirements',
      design: 'design',
      implementation: 'implementation',
      tests: 'tests',
      tdd: 'tdd',
    };
    write(root, '.musubix/evidence/changes.json', JSON.stringify({
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0002',
        generation: 2,
        activeGeneration: 2,
        requirementIds: ['REQ-M5-LIFECYCLE-005'],
        phases: {
          impact: {
            phase: 'impact',
            order: impactOrder.sequence,
            recordedAt: '2026-09-21T00:00:00.000Z',
            fingerprints,
          },
        },
        generationHistory: [{
          generation: 1,
          status: 'superseded',
          requirementIds: ['REQ-M5-LIFECYCLE-005'],
          phases: {},
        }],
      }],
    }));

    const { recordChangePhase } = await import('../packages/analysis/src/change.js');
    const evidence = await recordChangePhase(
      root,
      'CHANGE-0002',
      'impact',
      [],
      { reopen: true },
    );

    expect(evidence.changes[0]).toMatchObject({
      generation: 2,
      activeGeneration: 2,
      phases: { impact: { order: impactOrder.sequence } },
      generationHistory: [{ generation: 1, status: 'superseded' }],
    });
  });
});
