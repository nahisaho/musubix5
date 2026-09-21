import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('bootstrap runner', () => {
  /**
   * @id TEST-M5-BOOTSTRAP-001
   * @verifies REQ-M5-BOOTSTRAP-001 REQ-M5-BOOTSTRAP-002 REQ-M5-BOOTSTRAP-003 REQ-M5-BOOTSTRAP-004
   */
  it('TEST-M5-BOOTSTRAP-001 runs independently with bounded durable authority', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-bootstrap-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    mkdirSync(join(root, '.musubix/journal/normal'), { recursive: true });
    writeFileSync(join(root, '.musubix/journal/normal/000000000001.json'), '{ malformed');
    const {
      bootstrapResume,
      bootstrapRun,
      bootstrapStatus,
      requestNormalIngestion,
    } = await import('../packages/analysis/src/bootstrap-runner.js');
    const manifest = {
      schemaVersion: 1 as const,
      explicitBootstrap: true as const,
      runId: 'bootstrap-1',
      changeId: 'CHANGE-0002',
      candidateId: 'candidate:abc',
      targetPaths: ['packages/analysis/src'],
      permissions: ['read', 'write', 'execute'] as const,
      budget: 10,
      maxIterations: 2,
      maxDurationMs: 60_000,
      operations: [{
        id: 'repair-analysis',
        kind: 'write' as const,
        targetPath: 'packages/analysis/src/fix.ts',
        estimatedUsage: 3,
        inputDigest: 'a'.repeat(64),
      }],
    };
    const invocationKeys: string[] = [];
    const executor = vi.fn(async (_operation: unknown, context: { invocationKey: string }) => {
      invocationKeys.push(context.invocationKey);
      if (invocationKeys.length === 1) throw new Error('simulated interruption');
      return {
        outputDigest: 'b'.repeat(64),
        actualUsage: 4,
        candidateDigest: 'c'.repeat(64),
        changedPaths: ['packages/analysis/src/fix.ts'],
      };
    });

    await expect(bootstrapRun(root, manifest, executor))
      .rejects.toThrow('simulated interruption');
    const resumed = await bootstrapResume(root, manifest.runId, executor);
    expect(resumed).toMatchObject({
      status: 'completed',
      consumedBudget: 4,
      completedIterations: 1,
    });
    expect(executor).toHaveBeenCalledTimes(2);
    expect(new Set(invocationKeys).size).toBe(1);
    expect((await bootstrapStatus(root, manifest.runId)).history.map((entry) => entry.status))
      .toEqual(['pending', 'completed']);
    expect(await requestNormalIngestion(root, manifest.runId)).toMatchObject({
      changeId: 'CHANGE-0002',
      candidateId: 'candidate:abc',
      status: 'pending-normal-ingestion',
      normalEvidenceAuthorized: false,
      bootstrapStateSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const forbiddenExecutor = vi.fn();
    await expect(bootstrapRun(root, {
      ...manifest,
      runId: 'bootstrap-forbidden',
      operations: [{
        id: 'forge-approval',
        kind: 'write' as const,
        targetPath: '.musubix/evidence/approvals/native/release.json',
        estimatedUsage: 3,
        inputDigest: 'a'.repeat(64),
      }],
    }, forbiddenExecutor)).rejects.toThrow('BOOTSTRAP_TARGET_FORBIDDEN');
    expect(forbiddenExecutor).not.toHaveBeenCalled();

    await expect(bootstrapRun(root, {
      ...manifest,
      runId: 'bootstrap-implicit',
      explicitBootstrap: false as never,
    }, forbiddenExecutor)).rejects.toThrow('BOOTSTRAP_EXPLICIT_MODE_REQUIRED');
  });
});
