import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('evidence binding and currency', () => {
  /**
   * @id TEST-M5-EVIDENCE-003
   * @verifies REQ-M5-EVIDENCE-003 REQ-M5-EVIDENCE-005
   */
  it('TEST-M5-EVIDENCE-003 binds inputs and uses order rather than timestamps', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-evidence-binding-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    const { appendEvidence, classifyEvidence } =
      await import('../packages/analysis/src/evidence-registry.js');
    const context = {
      producerId: 'musubix5@0.1.0',
      repositoryId: 'repo:musubix5',
      candidateId: 'candidate:abc',
      changeId: 'CHANGE-0002',
      inputDigest: 'a'.repeat(64),
      dependencyHeads: { requirements: 'b'.repeat(64) },
      supersedingOrder: 1,
    };

    const first = await appendEvidence(root, {
      ...context,
      kind: 'trace',
      status: 'pass',
      idempotencyKey: 'trace-change-0002-v1',
      payload: { observedAt: '2099-01-01T00:00:00.000Z' },
    });
    await appendEvidence(root, {
      ...context,
      changeId: 'CHANGE-0003',
      kind: 'trace',
      status: 'pass',
      idempotencyKey: 'trace-change-0003-v1',
      payload: { observedAt: '1999-01-01T00:00:00.000Z' },
    });

    expect(first).toMatchObject({ order: 1, kind: 'trace', changeId: 'CHANGE-0002' });
    expect(classifyEvidence(first, context)).toMatchObject({ classification: 'pass', current: true });
    expect(classifyEvidence(first, { ...context, inputDigest: 'c'.repeat(64) }))
      .toMatchObject({ classification: 'stale', current: false });
    expect(classifyEvidence(first, {
      ...context,
      dependencyHeads: { requirements: 'd'.repeat(64) },
    })).toMatchObject({ classification: 'stale', current: false });
    expect(classifyEvidence(first, { ...context, supersedingOrder: 2 }))
      .toMatchObject({ classification: 'stale', current: false });
  });
});
