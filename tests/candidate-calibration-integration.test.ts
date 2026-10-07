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
    ['candidate-calibration', [1, 2, 31, 1, 1], 38],
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
    schemaVersion: 2, deliveryProfile: 'linux-only-v1', mode: 'calibration', noCredit: true, runId: '44', runAttempt: 1,
    sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), policyDigest: 'c'.repeat(64),
    observationsDigest: 'd'.repeat(64), apiTimingDigest: 'e'.repeat(64),
    envelopeDigests: ['1'.repeat(64)],
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

/** @id TEST-M5-LINUX-CALIBRATION-PARTITION-BUDGET-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-PARTITION-BUDGET-001 expands only calibration test partition deadlines', async () => {
  const scheduler = await readFile('scripts/test-runtime/partition-scheduler.mjs', 'utf8');
  expect(scheduler).toContain("commandName === 'test' && process.env.CANDIDATE_MODE === 'calibration'");
  expect(scheduler).toContain('1_050_000 - command.mergeAllowanceMs - command.terminationAllowanceMs');
  expect(scheduler).toContain('timeoutMs: calibration ? remainingCalibrationBudget()');
});

/** @id TEST-M5-LINUX-CALIBRATION-MODE-BINDING-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-MODE-BINDING-001 binds calibration mode into the partition scheduler command', async () => {
  const [runtime, scheduler] = await Promise.all([
    readFile('packages/analysis/src/test-runtime.ts', 'utf8'),
    readFile('scripts/test-runtime/partition-scheduler.mjs', 'utf8'),
  ]);
  expect(runtime).toContain("'--candidate-mode', environment.CANDIDATE_MODE");
  expect(scheduler).toContain("option('--candidate-mode') === 'calibration'");
});

/** @id TEST-M5-LINUX-CALIBRATION-SCHEDULER-TIMEOUT-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-SCHEDULER-TIMEOUT-001 fixes the calibration scheduler boundary at 1050 seconds', async () => {
  const runtime = await readFile('packages/analysis/src/test-runtime.ts', 'utf8');
  expect(runtime).toContain("const schedulerTimeoutMs = matrix && environment.CANDIDATE_MODE === 'calibration'");
  expect(runtime).toContain("&& command.name === 'test' ? 1_050_000 : options.timeoutMs");
  expect(runtime).toContain('timeoutMs: schedulerTimeoutMs');
});

/** @id TEST-M5-LINUX-CALIBRATION-POSTCONDITION-BUDGET-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-POSTCONDITION-BUDGET-001 gives calibration postconditions a bounded observation window', async () => {
  const runner = await readFile('packages/analysis/src/candidate-gate-runner.ts', 'utf8');
  expect(runner).toContain("postconditions: mode === 'calibration' ? maxInnerTimeoutMs");
  expect(runner).toContain('persistence: calibration?.budgets.timeouts.persistence ?? 60_000');
});

/** @id TEST-M5-LINUX-CALIBRATION-POSTCONDITION-HEADROOM-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-POSTCONDITION-HEADROOM-001 reserves 300 seconds for variable Linux tree verification', async () => {
  const runner = await readFile('packages/analysis/src/candidate-gate-runner.ts', 'utf8');
  expect(runner).toContain("postconditions: mode === 'calibration' ? maxInnerTimeoutMs");
  expect(runner).toContain('const maxInnerTimeoutMs = 300000');
});

/** @id TEST-M5-LINUX-CALIBRATION-REMAINING-BUDGET-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-REMAINING-BUDGET-001 carries unused calibration time into later partition waves', async () => {
  const scheduler = await readFile('scripts/test-runtime/partition-scheduler.mjs', 'utf8');
  expect(scheduler).toContain('const calibrationDeadline = calibration');
  expect(scheduler).toContain('calibrationDeadline - Number(process.hrtime.bigint()) / 1_000_000');
  expect(scheduler).toContain('timeoutMs: calibration ? remainingCalibrationBudget()');
});

/** @id TEST-M5-LINUX-CALIBRATION-BUDGET-REALLOCATION-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-BUDGET-REALLOCATION-001 reallocates fixed outer budget to the test command', async () => {
  const [runner, scheduler, executionPlan] = await Promise.all([
    readFile('packages/analysis/src/candidate-gate-runner.ts', 'utf8'),
    readFile('scripts/test-runtime/partition-scheduler.mjs', 'utf8'),
    readFile('packages/analysis/src/candidate-execution-plan.ts', 'utf8'),
  ]);
  expect(runner).toContain("command.name === 'test' ? 1_050_000 : 95_000");
  expect(scheduler).toContain('1_050_000 - command.mergeAllowanceMs - command.terminationAllowanceMs');
  expect(executionPlan).toContain('test: 1_050_000');
  expect(executionPlan).toContain("map((name) => [name, 95_000])");
});

/** @id TEST-M5-LINUX-CALIBRATION-NATIVE-REPORT-DIAGNOSTIC-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-NATIVE-REPORT-DIAGNOSTIC-001 bounds invalid partition report diagnostics', async () => {
  const runtime = await readFile('packages/analysis/src/test-runtime.ts', 'utf8');
  expect(runtime).toContain('partition-${entry.group.ordinal}: native report invalid');
  expect(runtime).toContain('status=${native.status} exitCode=${native.exitCode} durationMs=${native.durationMs}');
});

/** @id TEST-M5-LINUX-CALIBRATION-NATIVE-SELECTION-DIAGNOSTIC-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-NATIVE-SELECTION-DIAGNOSTIC-001 identifies the invalid native selection boundary', async () => {
  const runtime = await readFile('packages/analysis/src/test-runtime.ts', 'utf8');
  expect(runtime).toContain('native selection ordinal=${ordinal}');
  expect(runtime).toContain('command=${String(request.commandName)} testId=${id} matches=${selected.length}');
  expect(runtime).toContain('statuses=${statuses || "none"}');
});

/** @id TEST-M5-LINUX-CALIBRATION-WORKER-PACKET-ATOMICITY-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-WORKER-PACKET-ATOMICITY-001 publishes complete worker JSON atomically', async () => {
  const setup = await readFile('scripts/test-runtime/vitest-setup.mjs', 'utf8');
  expect(setup).toContain("const staging = resolve(dirname(requestPath), `.worker-${workerId}.tmp`)");
  expect(setup).toContain("writeFileSync(staging, `${JSON.stringify(ordered(packet))}\\n`, { flag: 'wx', mode: 0o600 })");
  expect(setup).toContain("renameSync(staging, resolve(dirname(requestPath), 'worker-acks', `${workerId}.json`))");
});

/** @id TEST-M5-LINUX-CALIBRATION-NATIVE-DESCRIPTOR-ATOMICITY-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-NATIVE-DESCRIPTOR-ATOMICITY-001 publishes complete native descriptors atomically', async () => {
  const [processSource, executionPlan] = await Promise.all([
    readFile('packages/analysis/src/process.ts', 'utf8'),
    readFile('packages/analysis/src/candidate-execution-plan.ts', 'utf8'),
  ]);
  expect(processSource).toContain('function publishCandidateNativeDescriptorSync(');
  expect(processSource).toContain('linkSync(staging, path)');
  expect(processSource).toContain('renameSync(staging, path)');
  expect(processSource).not.toContain("writeFileSync(path, JSON.stringify({ ...descriptor, status: 'terminated' })");
  expect(executionPlan).toContain('CANDIDATE_NATIVE_DESCRIPTOR_INVALID: ${name}');
});

/** @id TEST-M5-LINUX-CALIBRATION-TIMEOUT-DIAGNOSTIC-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-TIMEOUT-DIAGNOSTIC-001 exposes only bounded scheduler timeout metadata', async () => {
  const runtime = await readFile('packages/analysis/src/test-runtime.ts', 'utf8');
  expect(runtime).toContain('configuredTimeoutMs: options.timeoutMs');
  expect(runtime).toContain('schedulerTimeoutMs, matrix');
  expect(runtime).toContain('configuredTimeoutMs=${observed.configuredTimeoutMs}');
});

/** @id TEST-M5-LINUX-CALIBRATION-POSTCONDITION-STAGE-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-POSTCONDITION-STAGE-001 preserves a fixed postcondition failure stage', async () => {
  const runner = await readFile('packages/analysis/src/candidate-gate-runner.ts', 'utf8');
  expect(runner).toContain("let postconditionStage: 'lfs' | 'tree' | 'normalization' = 'lfs'");
  expect(runner).toContain('GATE_RUNNER_POSTCONDITION_LFS_FAILED');
  expect(runner).toContain('GATE_RUNNER_POSTCONDITION_TREE_FAILED');
  expect(runner).toContain('GATE_RUNNER_POSTCONDITION_NORMALIZATION_FAILED');
});

/** @id TEST-M5-LINUX-CALIBRATION-WRAPPER-DIAGNOSTIC-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-WRAPPER-DIAGNOSTIC-001 emits only a normalized processing failure class', async () => {
  const wrapper = await readFile('.github/scripts/run-candidate-gate-wrapper.mjs', 'utf8');
  expect(wrapper).toContain('candidate-gate-wrapper:${failureKind(cause)}');
  expect(wrapper).not.toContain('cause.message');
});

/** @id TEST-M5-LINUX-CALIBRATION-SIGNER-DIAGNOSTIC-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-SIGNER-DIAGNOSTIC-001 identifies only the failed validation stage', async () => {
  const workflow = await readFile('.github/workflows/candidate-calibration.yml', 'utf8');
  for (const stage of ['read', 'outcome', 'context', 'manifest']) {
    expect(workflow).toContain(`validationStage='${stage}'`);
  }
  expect(workflow).toContain("console.error(`candidate-calibration-sign:${validationStage}`)");
});

/** @id TEST-M5-LINUX-SIGNER-CONTEXT-BOUNDARY-001
 * @verifies REQ-M5-LINUX-DELIVERY-002 REQ-M5-LINUX-DELIVERY-004
 * @design DES-M5-LINUX-DELIVERY-002 DES-M5-LINUX-DELIVERY-004
 */
it('TEST-M5-LINUX-SIGNER-CONTEXT-BOUNDARY-001 validates schema-v1 runner context before adding the delivery profile', async () => {
  for (const name of ['candidate-gate', 'candidate-calibration']) {
    const workflow = await readFile(`.github/workflows/${name}.yml`, 'utf8');
    expect(workflow).toContain('const runnerContext=');
    expect(workflow).toContain('const context={...runnerContext,deliveryProfile:e.DELIVERY_PROFILE}');
    expect(workflow).toContain('Object.entries(runnerContext)');
  }
});

/** @id TEST-M5-LINUX-SIGNER-CONTEXT-BOUNDARY-002
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-SIGNER-CONTEXT-BOUNDARY-002 names the enriched schema-v2 context at the signing boundary', async () => {
  for (const name of ['candidate-gate', 'candidate-calibration']) {
    const workflow = await readFile(`.github/workflows/${name}.yml`, 'utf8');
    expect(workflow).toContain('const signedContext={...runnerContext,deliveryProfile:e.DELIVERY_PROFILE}');
    expect(workflow).toContain('context:signedContext');
  }
});

/** @id TEST-M5-CI-CALIBRATION-FAILURE-ENVELOPE-001
 * @verifies REQ-M5-CI-EFFICIENCY-004 REQ-M5-CI-EFFICIENCY-005
 * @design DES-M5-CI-EFFICIENCY-004 DES-M5-CI-EFFICIENCY-006
 */
it('TEST-M5-CI-CALIBRATION-FAILURE-ENVELOPE-001 preserves a generated failure result for signing', async () => {
  const workflow = await readFile('.github/workflows/candidate-calibration.yml', 'utf8');
  const readResult = workflow.indexOf("result=JSON.parse(readFileSync(join(e.RUNNER_TEMP,'candidate-gate-result.json'),'utf8'))");
  const validateOutcome = workflow.indexOf("if((e.GATE_STEP_OUTCOME==='success')!==(result.status==='pass')) throw new Error('outcome')");
  expect(readResult).toBeGreaterThanOrEqual(0);
  expect(validateOutcome).toBeGreaterThan(readResult);
  expect(workflow).not.toContain("if(e.GATE_STEP_OUTCOME!=='success') throw new Error('incomplete calibration stage')");
});

/** @id TEST-M5-LINUX-CANDIDATE-WORKFLOW-001
 * @verifies REQ-M5-LINUX-DELIVERY-001
 */
it('TEST-M5-LINUX-CANDIDATE-WORKFLOW-001 defines one immutable Ubuntu Node.js 24 delivery job', async () => {
  for (const name of ['candidate-gate', 'candidate-calibration']) {
    const source = await readFile(`.github/workflows/${name}.yml`, 'utf8');
    const workflow = parse(source);
    expect(workflow.jobs.verify.name).toBe('ubuntu-node24');
    expect(workflow.jobs.verify['runs-on']).toBe('ubuntu-latest');
    expect(workflow.jobs.verify.strategy).toBeUndefined();
    expect(workflow.jobs.verify.env.DELIVERY_PROFILE).toBe('linux-only-v1');
    expect(source).not.toMatch(/windows-latest|macos-latest|matrix\./);
  }
  const profile = await import('../packages/analysis/src/candidate-delivery-profile.js');
  expect(profile.LINUX_DELIVERY_PROFILE).toEqual({ profile: 'linux-only-v1', os: 'ubuntu', nodeMajor: 24 });
  expect(() => profile.validateLinuxDeliveryProfile({ profile: 'three-platform-v1', os: 'ubuntu', nodeMajor: 24 }))
    .toThrow(/LINUX_DELIVERY_EVIDENCE_INVALID/);
});

/** @id TEST-M5-LINUX-CALIBRATION-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-001 accepts one version-2 Linux envelope digest and rejects prior matrix manifests', async () => {
  const api = await import('../packages/analysis/src/candidate-calibration.js');
  const manifest = {
    schemaVersion: 2, deliveryProfile: 'linux-only-v1', mode: 'calibration', noCredit: true,
    runId: '44', runAttempt: 1, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
    policyDigest: 'c'.repeat(64), observationsDigest: 'd'.repeat(64), apiTimingDigest: 'e'.repeat(64),
    envelopeDigests: ['1'.repeat(64)],
    approval: { artifactSha256: 'f'.repeat(64), approver: 'human', approved: true },
  };
  const context = {
    sourceCommit: manifest.sourceCommit, sourceTree: manifest.sourceTree,
    policyDigest: manifest.policyDigest, observationsDigest: manifest.observationsDigest,
    apiTimingDigest: manifest.apiTimingDigest, approvalSha256: 'f'.repeat(64),
  };
  expect(api.validateCandidateCalibrationManifest(manifest, context).deliveryProfile).toBe('linux-only-v1');
  expect(() => api.validateCandidateCalibrationManifest({ ...manifest, schemaVersion: 1 }, context))
    .toThrow(/LINUX_DELIVERY_EVIDENCE_INVALID/);
  expect(() => api.validateCandidateCalibrationManifest({
    ...manifest, envelopeDigests: ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64)],
  }, context)).toThrow(/LINUX_DELIVERY_EVIDENCE_INVALID/);
});
