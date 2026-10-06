import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

/** @id TEST-M5-CI-EFFICIENT-ORCHESTRATION-TIMEOUT-001
 * @verifies REQ-M5-CI-EFFICIENCY-003 REQ-M5-CI-EFFICIENCY-005
 */
it('TEST-M5-CI-EFFICIENT-ORCHESTRATION-TIMEOUT-001 calibrates one completed Ubuntu observation with exact 3/2 margins and rejects censored or over-cap regions', async () => {
  const api = await import('../packages/analysis/src/candidate-execution-plan.js');
  const regions = {
    bootstrap: 40_000, preparation: 80_000, signing: 40_000, upload: 40_000,
    preconditions: 10_000, postconditions: 10_000, persistence: 1_000,
    typecheck: 1_000, build: 1_000, test: 100_000, 'codegraph-tests': 10_000,
    compatibility: 10_000, 'pack-check': 10_000, 'pack-smoke': 10_000, formal: 1_000,
  };
  const jobs = ['ubuntu'].map((os) => ({
    os, nodeMajor: 24, runAttempt: 1, status: 'pass', noCredit: true,
    regions: Object.fromEntries(Object.entries(regions).map(([name, durationMs]) => [name, {
      durationMs, status: 'completed', exitCode: 0, reportComplete: true, acknowledgmentComplete: true,
    }])),
  }));
  const calibrated = api.calibrateCandidateTimeouts(jobs);
  expect(calibrated.timeouts.bootstrap).toBe(60_000);
  expect(calibrated.timeouts.preparation).toBe(120_000);
  expect(calibrated.timeouts.test).toBe(150_000);
  expect(calibrated.timeouts.formal).toBe(1_500);
  expect(calibrated.maxima).toEqual(regions);
  expect(calibrated.outerBudgetMs).toBe(259_500);
  expect(calibrated.gateBudgetMs).toBe(349_500);
  expect(api.candidateGateOuterTimeoutMs('candidate', Object.fromEntries(
    api.candidateCommandOrder.map((name) => [name, 1])), 100)).toBe(45_107);
  expect(api.candidateGateOuterTimeoutMs('calibration', Object.fromEntries(
    api.candidateCommandOrder.map((name) => [name, name === 'test' ? 600_000 : 120_000])), 120_000)).toBe(1_485_000);
  const boundary = structuredClone(jobs);
  boundary[0]!.regions.test!.durationMs = 1_001;
  expect(api.calibrateCandidateTimeouts(boundary).timeouts.test).toBe(3_000);
  for (const durationMs of [40_001, 80_001]) {
    const changed = structuredClone(jobs);
    changed[0]!.regions[durationMs === 40_001 ? 'bootstrap' : 'preparation']!.durationMs = durationMs;
    expect(() => api.calibrateCandidateTimeouts(changed)).toThrow();
  }
  for (const mutate of [
    (job: typeof jobs[number]) => { job.runAttempt = 2; },
    (job: typeof jobs[number]) => { job.status = 'fail'; },
    (job: typeof jobs[number]) => { job.noCredit = false; },
    (job: typeof jobs[number]) => { job.regions.test!.status = 'timeout'; },
    (job: typeof jobs[number]) => { job.regions.test!.exitCode = 1; },
    (job: typeof jobs[number]) => { job.regions.test!.reportComplete = false; },
    (job: typeof jobs[number]) => { job.regions.test!.acknowledgmentComplete = false; },
    (job: typeof jobs[number]) => { job.regions.test!.durationMs = -1; },
    (job: typeof jobs[number]) => { delete job.regions.test; },
    (job: typeof jobs[number]) => { job.regions.test!.durationMs = 400_001; },
  ]) {
    const changed = structuredClone(jobs);
    mutate(changed[0]!);
    expect(() => api.calibrateCandidateTimeouts(changed)).toThrow();
  }
  expect(() => api.calibrateCandidateTimeouts([])).toThrow();
  expect(() => api.calibrateCandidateTimeouts([jobs[0]!, jobs[0]!])).toThrow();
  const aggregate = structuredClone(jobs);
  for (const job of aggregate) {
    for (const name of api.candidateCommandOrder) job.regions[name]!.durationMs = name === 'test' ? 400_000 : 80_000;
    job.regions.formal!.durationMs = 80_000;
  }
  expect(() => api.calibrateCandidateTimeouts(aggregate)).toThrow();
  expect(() => api.candidateGateOuterTimeoutMs('candidate', Object.fromEntries(
    api.candidateCommandOrder.map((name) => [name, name === 'test' ? 600_000 : 120_000])), 120_000)).toThrow();
  expect(() => api.candidateGateOuterTimeoutMs('calibration', Object.fromEntries(
    api.candidateCommandOrder.map((name) => [name, 1])), 100)).toThrow();
});

/** @id TEST-M5-CI-NESTED-WORKER-TIMEOUT-001
 * @verifies REQ-M5-CI-EFFICIENCY-003
 * @design DES-M5-CI-EFFICIENCY-003
 */
it('TEST-M5-CI-NESTED-WORKER-TIMEOUT-001 keeps nested cross-pool verification bounded above measured load', async () => {
  expect(await readFile('vitest.config.ts', 'utf8')).toContain('testTimeout: 90_000');
});
