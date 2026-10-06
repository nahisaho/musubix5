import { expect, it } from 'vitest';

/** @id TEST-M5-CI-STABILITY-PROOF-001
 * @verifies REQ-M5-CI-EFFICIENCY-006
 */
it('TEST-M5-CI-STABILITY-PROOF-001 revalidates adjacent first attempts, jobs, artifacts, workflow and calibration', async () => {
  const api = await import('../packages/analysis/src/candidate-stability.js');
  const sha = 'a'.repeat(40);
  const platforms = ['ubuntu'];
  const start = '2026-10-05T00:00:00Z';
  const run = (id: number, path = '.github/workflows/candidate-gate.yml') => ({
    id, workflow_id: path.includes('calibration') ? 8 : 7, path, head_sha: sha, run_attempt: 1,
    event: 'workflow_dispatch', status: 'completed', conclusion: 'success',
    created_at: `2026-10-05T00:00:${String(id).padStart(2, '0')}Z`,
  });
  const records = new Map([1, 2, 3].map((id) => [id, run(id)]));
  records.set(4, run(4, '.github/workflows/candidate-calibration.yml'));
  let sequence = [records.get(1)!, records.get(2)!];
  let brokenAttempt = false, expired = false, duplicateJob = false, envelopes = 0;
  const requests: string[] = [];
  const fetcher = async (url: string) => {
    requests.push(url);
    const match = /runs\/(\d+)/.exec(url);
    const id = match ? Number(match[1]) : 0;
    let value: unknown;
    if (url.includes('/workflows/') && !url.includes('/runs?')) value = { id: url.includes('calibration') ? 8 : 7, path: url.includes('calibration') ? '.github/workflows/candidate-calibration.yml' : '.github/workflows/candidate-gate.yml' };
    else if (url.includes('/runs?')) value = { workflow_runs: sequence };
    else if (url.includes('/jobs?')) value = { jobs: [...platforms.map((os, index) => ({
      id: id * 10 + index, run_id: id, name: duplicateJob ? 'ubuntu-node24' : `${os}-node24`,
      status: 'completed', conclusion: 'success', started_at: start, completed_at: '2026-10-05T00:19:00Z',
    })), ...(duplicateJob ? [{
      id: id * 10 + 9, run_id: id, name: 'windows-node24', status: 'completed', conclusion: 'success',
      started_at: start, completed_at: '2026-10-05T00:19:00Z',
    }] : [])] };
    else if (url.includes('/artifacts?')) value = { artifacts: platforms.map((os, index) => ({
      id: id * 10 + index, name: `candidate-${id === 4 ? 'calibration' : 'gate'}-${os}-node24`,
      expired, created_at: '2026-10-05T00:20:00Z', workflow_run: { id },
    })) };
    else value = { ...records.get(id), conclusion: brokenAttempt && url.includes('/attempts/1') ? 'failure' : 'success' };
    return { ok: true, status: 200, json: async () => value };
  };
  const context = { repository: 'owner/repo', candidateCommit: sha, generation: 51,
    repositoryId: 'repo-id', planDigest: 'b'.repeat(64), calibrationDigest: 'c'.repeat(64),
    gateInputFingerprint: 'd'.repeat(64), authoritativeGateDigest: 'e'.repeat(64),
    calibrationRunId: 4, calibrationSourceCommit: sha };
  const options = { token: 'secret-never-persist', fetch: fetcher,
    verifyEnvelope: async (_runId: number, _artifact: unknown, binding: unknown) => { envelopes++; return binding; } };
  const evidence = await api.verifyCandidateStabilityPair(1, 2, context, options);
  expect(evidence.runIds).toEqual([1, 2]);
  expect(envelopes).toBe(3);
  expect(JSON.stringify(evidence)).not.toContain(options.token);
  expect(requests.some((url) => url.includes('/attempts/1'))).toBe(true);
  await api.revalidateCandidateStability(evidence, context, options);
  records.get(2)!.run_attempt = 2;
  await expect(api.verifyCandidateStabilityPair(1, 2, context, options)).rejects.toThrow();
  records.get(2)!.run_attempt = 1;
  sequence = [records.get(1)!, records.get(3)!, records.get(2)!];
  await expect(api.verifyCandidateStabilityPair(1, 2, context, options)).rejects.toThrow(/adjacen/);
  sequence = [records.get(1)!, records.get(2)!];
  brokenAttempt = true;
  await expect(api.verifyCandidateStabilityPair(1, 2, context, options)).rejects.toThrow();
  brokenAttempt = false; expired = true;
  await expect(api.verifyCandidateStabilityPair(1, 2, context, options)).rejects.toThrow();
  expired = false; duplicateJob = true;
  await expect(api.verifyCandidateStabilityPair(1, 2, context, options)).rejects.toThrow();
  duplicateJob = false;
  await expect(api.verifyCandidateStabilityPair(1, 4, context, options)).rejects.toThrow();
});

/** @id TEST-M5-LINUX-STABILITY-001
 * @verifies REQ-M5-LINUX-DELIVERY-003
 */
it('TEST-M5-LINUX-STABILITY-001 validates one Ubuntu job and rejects extra bound-run evidence', async () => {
  const api = await import('../packages/analysis/src/candidate-stability.js');
  const jobs = [{
    id: 11, run_id: 7, name: 'ubuntu-node24', status: 'completed', conclusion: 'success',
    started_at: '2026-10-06T00:00:00Z', completed_at: '2026-10-06T00:10:00Z',
  }];
  const artifacts = [{
    id: 12, name: 'candidate-gate-ubuntu-node24', expired: false,
    created_at: '2026-10-06T00:11:00Z', workflow_run: { id: 7 },
  }];
  expect(api.verifyCandidateRunTiming(jobs, artifacts, 'candidate', 7)).toEqual([{
    os: 'ubuntu', jobId: 11, artifactId: 12,
    startedAt: '2026-10-06T00:00:00Z', createdAt: '2026-10-06T00:11:00Z', durationMs: 660_000,
  }]);
  expect(() => api.verifyCandidateRunTiming([
    ...jobs, { ...jobs[0], id: 13, name: 'windows-node24' },
  ], artifacts, 'candidate', 7)).toThrow(/LINUX_DELIVERY_EVIDENCE_INVALID/);
});

/** @id TEST-M5-LINUX-RELEASE-001
 * @verifies REQ-M5-LINUX-DELIVERY-004
 */
it('TEST-M5-LINUX-RELEASE-001 binds release evidence to the version-2 Linux profile', async () => {
  const profile = await import('../packages/analysis/src/candidate-delivery-profile.js');
  expect(profile.validateSingleUbuntuRunInventory(
    [{ id: 1, run_id: 7, name: 'ubuntu-node24' }],
    [{ id: 2, name: 'candidate-gate-ubuntu-node24', workflow_run: { id: 7 } }],
    'candidate',
    7,
  )).toEqual({ jobId: 1, artifactId: 2 });
  expect(() => profile.validateSingleUbuntuRunInventory(
    [{ id: 1, run_id: 7, name: 'ubuntu-node24' }],
    [{ id: 2, name: 'candidate-gate-ubuntu-node24', workflow_run: { id: 7 } },
      { id: 3, name: 'candidate-gate-windows-node24', workflow_run: { id: 7 } }],
    'candidate',
    7,
  )).toThrow(/LINUX_DELIVERY_EVIDENCE_INVALID/);
});

/** @id TEST-M5-LINUX-RUN-OWNERSHIP-001
 * @verifies REQ-M5-LINUX-DELIVERY-001
 */
it('TEST-M5-LINUX-RUN-OWNERSHIP-001 rejects jobs and artifacts owned by a different workflow run', async () => {
  const profile = await import('../packages/analysis/src/candidate-delivery-profile.js');
  expect(() => profile.validateSingleUbuntuRunInventory(
    [{ id: 1, run_id: 8, name: 'ubuntu-node24' }],
    [{ id: 2, name: 'candidate-gate-ubuntu-node24', workflow_run: { id: 7 } }],
    'candidate',
    7,
  )).toThrow(/LINUX_DELIVERY_EVIDENCE_INVALID/);
});

/** @id TEST-M5-LINUX-CALIBRATION-OWNERSHIP-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-OWNERSHIP-001 rejects a calibration artifact from a foreign workflow run', async () => {
  const profile = await import('../packages/analysis/src/candidate-delivery-profile.js');
  expect(() => profile.validateSingleUbuntuRunInventory(
    [{ id: 1, run_id: 7, name: 'ubuntu-node24' }],
    [{ id: 2, name: 'candidate-calibration-ubuntu-node24', workflow_run: { id: 8 } }],
    'calibration',
    7,
  )).toThrow(/LINUX_DELIVERY_EVIDENCE_INVALID/);
});

/** @id TEST-M5-LINUX-STABILITY-OWNERSHIP-001
 * @verifies REQ-M5-LINUX-DELIVERY-003
 */
it('TEST-M5-LINUX-STABILITY-OWNERSHIP-001 rejects candidate timing projected from a foreign workflow run', async () => {
  const api = await import('../packages/analysis/src/candidate-stability.js');
  expect(() => api.verifyCandidateRunTiming(
    [{ id: 1, run_id: 8, name: 'ubuntu-node24', status: 'completed', conclusion: 'success',
      started_at: '2026-10-06T00:00:00Z' }],
    [{ id: 2, name: 'candidate-gate-ubuntu-node24', expired: false,
      created_at: '2026-10-06T00:01:00Z', workflow_run: { id: 7 } }],
    'candidate',
    7,
  )).toThrow(/LINUX_DELIVERY_EVIDENCE_INVALID/);
});

/** @id TEST-M5-LINUX-RELEASE-OWNERSHIP-001
 * @verifies REQ-M5-LINUX-DELIVERY-004
 */
it('TEST-M5-LINUX-RELEASE-OWNERSHIP-001 rejects release evidence with an unowned bound artifact', async () => {
  const profile = await import('../packages/analysis/src/candidate-delivery-profile.js');
  expect(() => profile.validateSingleUbuntuRunInventory(
    [{ id: 1, run_id: 7, name: 'ubuntu-node24' }],
    [{ id: 2, name: 'candidate-gate-ubuntu-node24', workflow_run: { id: 9 } }],
    'candidate',
    7,
  )).toThrow(/LINUX_DELIVERY_EVIDENCE_INVALID/);
});
