import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { expect, it } from 'vitest';

/** @id TEST-M5-CI-CALIBRATION-INTEGRATION-001
 * @verifies REQ-M5-CI-EFFICIENCY-003 REQ-M5-CI-EFFICIENCY-005
 */
it('TEST-M5-CI-CALIBRATION-INTEGRATION-001 binds workflow mode budgets and rejects unapproved or shape-changing calibration', async () => {
  const api = await import('../packages/analysis/src/candidate-calibration.js');
  for (const [name, shape, maximum] of [
    ['candidate-gate', [1, 2, 14, 1, 1], 21],
    ['candidate-calibration', [1, 2, 28, 1, 1], 35],
  ] as const) {
    const workflow = parse(await readFile(`.github/workflows/${name}.yml`, 'utf8'));
    expect(workflow.permissions).toEqual({ contents: 'read', actions: 'read', 'id-token': 'write' });
    expect(workflow.jobs.verify.steps.map((step: { 'timeout-minutes': number }) => step['timeout-minutes'])).toEqual(shape);
    expect(workflow.jobs.verify['timeout-minutes']).toBeLessThanOrEqual(maximum);
    expect(JSON.stringify(workflow)).not.toMatch(/retry|continue-on-error/);
  }
  const config = JSON.parse(await readFile('.musubix/config.json', 'utf8'));
  expect(config.commands.map((command: { name: string }) => command.name)).toEqual([
    'typecheck', 'build', 'test', 'codegraph-tests', 'compatibility', 'pack-check', 'pack-smoke',
  ]);
  expect(config.testRuntime.inputs).toContain('packages/analysis/src/candidate-execution-plan.ts');
  expect(config.testRuntime.calibratedPlan.required).toBe(true);
  expect(api.validateCandidateDeadline({ mode: 'candidate', jobStartedAt: 100, now: 101, signingReserveMs: 120_000 }).gateRemainingMs).toBe(840_000);
  expect(api.validateCandidateDeadline({ mode: 'calibration', jobStartedAt: 100, now: 101, signingReserveMs: 120_000 }).gateRemainingMs).toBe(1_665_000);
  expect(() => api.validateCandidateDeadline({ mode: 'candidate', jobStartedAt: 0, now: 1_080_001, signingReserveMs: 120_000 })).toThrow();
  expect(() => api.validateCandidateDeadline({
    mode: 'candidate', jobStartedAt: Number.MAX_SAFE_INTEGER - 1, now: Number.MAX_SAFE_INTEGER, signingReserveMs: 120_000,
  })).toThrow();
  const manifest = {
    schemaVersion: 1, mode: 'calibration', noCredit: true, runId: '44', runAttempt: 1,
    sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), policyDigest: 'c'.repeat(64),
    observationsDigest: 'd'.repeat(64), apiTimingDigest: 'e'.repeat(64),
    envelopeDigests: ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64)],
    approval: { artifactSha256: 'f'.repeat(64), approver: 'human', approved: true },
  };
  expect(api.validateCandidateCalibrationManifest(manifest, {
    sourceCommit: manifest.sourceCommit, sourceTree: manifest.sourceTree,
    policyDigest: manifest.policyDigest, observationsDigest: manifest.observationsDigest,
    apiTimingDigest: manifest.apiTimingDigest, approvalSha256: 'f'.repeat(64),
  }).runId).toBe('44');
  expect(() => api.validateCandidateCalibrationManifest({ ...manifest, noCredit: false }, {
    sourceCommit: manifest.sourceCommit, sourceTree: manifest.sourceTree, policyDigest: manifest.policyDigest,
    observationsDigest: manifest.observationsDigest, apiTimingDigest: manifest.apiTimingDigest, approvalSha256: 'f'.repeat(64),
  })).toThrow();
  expect(() => api.validateCandidateCalibrationManifest(manifest, {
    sourceCommit: manifest.sourceCommit, sourceTree: manifest.sourceTree, policyDigest: '0'.repeat(64),
    observationsDigest: manifest.observationsDigest, apiTimingDigest: manifest.apiTimingDigest, approvalSha256: 'f'.repeat(64),
  })).toThrow();
});
