import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, inject, it, vi } from 'vitest';
import { canonicalBytes, sha256 } from '../packages/analysis/src/canonical.js';
import {
  generationOrderPhase, nextBatchScopeId, validateBatchCheckpointJournal,
  type BatchCheckpointRecord,
} from '../packages/analysis/src/change-evidence.js';
import { loadApprovalProjectionConfig } from '../packages/analysis/src/config.js';
import { runProcess } from '../packages/analysis/src/process.js';

type StableWallClockProviderV1 = Readonly<{
  schemaVersion: 1;
  kind: 'test-runtime-provider-v1';
  executionRunId: string;
  profileSha256: string;
  bootstrapSha256: string;
  inputsSha256: string;
  anchorId: string;
  anchor: Readonly<{
    schemaVersion: 1;
    kind: 'test-runtime-anchor-v1';
    runId: string;
    wallEpochMs: number;
    monoEpochMs: number;
    hrtimeNs: string;
  }>;
}>;

declare module 'vitest' {
  export interface ProvidedContext {
    musubix5StableWallClockV1: StableWallClockProviderV1;
  }
}

const root = fileURLToPath(new URL('..', import.meta.url));
const providerKey = 'musubix5StableWallClockV1';
const markerKey = 'musubix5.testRuntime.stableWallClock.install.v1';
const profileSha256 = 'f9fbe94729722eaaea1f1e49bbaf6c48053ea1ed6a8498a2287dbfe4a20bf06e';
const moduleProvider: unknown = inject(providerKey);
const moduleDescriptor = Object.getOwnPropertyDescriptor(globalThis, Symbol.for(markerKey));

function record(value: unknown): asserts value is Record<string, unknown> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe('object');
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an object in the runtime evidence contract');
  }
}

function bindings() {
  expect(moduleProvider, 'stable runtime provider must exist before the test module').toBeDefined();
  expect(moduleDescriptor, 'stable runtime install marker must exist before the test module').toBeDefined();
  record(moduleProvider);
  const marker: unknown = moduleDescriptor?.value;
  record(marker);
  expect(moduleProvider).toMatchObject({ schemaVersion: 1, kind: 'test-runtime-provider-v1', profileSha256 });
  expect(marker).toMatchObject({
    schemaVersion: 1, kind: 'test-runtime-install-v1', profileSha256,
    anchorId: moduleProvider.anchorId, bootstrapSha256: moduleProvider.bootstrapSha256,
  });
  expect(moduleDescriptor).toMatchObject({ enumerable: false, configurable: false, writable: false });
  expect(moduleProvider.anchorId).toBe(sha256(canonicalBytes(moduleProvider.anchor)));
  expect(Date.now).toBe(marker.installedNow);
  expect(Object.isFrozen(moduleProvider)).toBe(true);
  expect(Object.isFrozen(moduleProvider.anchor)).toBe(true);
  expect(Object.isFrozen(marker)).toBe(true);
  return { provider: moduleProvider, marker };
}

async function runtime() {
  const url = new URL('../packages/analysis/src/test-runtime.js', import.meta.url);
  const api: unknown = await import(url.href);
  record(api);
  return async (name: string, ...args: unknown[]): Promise<unknown> => {
    const fn = api[name];
    expect(typeof fn, `runtime export ${name}`).toBe('function');
    if (typeof fn !== 'function') throw new Error(`Missing runtime export ${name}`);
    const result: unknown = await fn(...args);
    return result;
  };
}

function approvedProfile() {
  const text = readFileSync(join(root, '.musubix/features/musubix5-clean-foundation/design.md'), 'utf8');
  const section = text.split('### Test runtime extension policy')[1];
  const json = section?.match(/```json\n([\s\S]*?)\n```/)?.[1];
  expect(json).toBeDefined();
  if (!json) throw new Error('Missing normative runtime profile');
  const profile: unknown = JSON.parse(json);
  record(profile);
  expect(sha256(canonicalBytes(profile))).toBe(profileSha256);
  return profile;
}

function blobStore(directory: string) {
  return join(directory, '.musubix/evidence/test-runtime/v1/blobs');
}

async function fixture(role: 'tdd' | 'command' | 'result' | 'integration', call: Awaited<ReturnType<typeof runtime>>) {
  const directory = mkdtempSync(join(tmpdir(), 'musubix5-runtime-evidence-'));
  const store = blobStore(directory);
  mkdirSync(store, { recursive: true });
  const bytes = new Map<string, Buffer>();
  const put = (value: unknown) => {
    const data = canonicalBytes(value);
    const hash = sha256(data);
    bytes.set(hash, data);
    writeFileSync(join(store, hash), data, { flag: 'wx' });
    return hash;
  };
  const profile = approvedProfile();
  expect(put(profile)).toBe(profileSha256);
  const inputs = profile.inputs;
  if (!Array.isArray(inputs) || !inputs.every((value): value is string => typeof value === 'string')) {
    throw new Error('Expected closed runtime input paths');
  }
  expect(inputs).toHaveLength(21);
  const entries = inputs.map((path) => {
    const content = readFileSync(join(root, path));
    const mode = statSync(join(root, path)).mode & 0o111 ? 100755 : 100644;
    const rawSha256 = sha256(content);
    const size = content.byteLength;
    const blobSha256 = put({
      schemaVersion: 1, kind: 'test-runtime-file-v1', path, mode, size, rawSha256,
      contentBase64: content.toString('base64'),
    });
    return { path, mode, size, rawSha256, blobSha256 };
  });
  const inputsSha256 = put({ schemaVersion: 1, kind: 'test-runtime-inputs-v1', entries });
  const runId = randomUUID();
  const commandRunId = randomUUID();
  const workerId = randomUUID();
  const testPath = 'tests/test-runtime-evidence.test.ts';
  const testId = 'TEST-M5-TEST-CLOCK-EVIDENCE-001';
  const anchor = {
    schemaVersion: 1, kind: 'test-runtime-anchor-v1', runId,
    wallEpochMs: 1_800_000_000_000, monoEpochMs: 100, hrtimeNs: '1000000000',
  };
  const anchorSha256 = put(anchor);
  const context = {
    repositoryId: 'repository:e5297915dd33125e52ca4d9d5a00250e33a221401bd38b066934730c6948ecae',
    changeId: 'CHANGE-0017', generation: 8,
    commit: 'a'.repeat(40), role,
  };
  const logicalInvocation = {
    command: 'npx',
    args: ['vitest', 'run', testPath, '-t', testId, '--reporter=json', '--outputFile=native.json'],
  };
  const executionBinding = await call('augmentTestRuntimeInvocation', {
    logicalInvocation, profileSha256, anchor, runId, commandRunId,
    locations: { repo: directory, run: join(directory, 'run'), 'command-run': join(directory, 'command-run') },
  });
  record(executionBinding);
  expect(executionBinding.logicalCommandSha256).toBe(
    createHash('sha256').update(JSON.stringify([logicalInvocation.command, logicalInvocation.args])).digest('hex'),
  );
  const effectiveInvocation = executionBinding.resolvedInvocation;
  record(effectiveInvocation);
  const effectiveArgs = effectiveInvocation.args;
  if (!Array.isArray(effectiveArgs) || !effectiveArgs.every((arg): arg is string => typeof arg === 'string')) {
    throw new Error('Expected effective invocation arguments');
  }
  const dispatch = {
    schemaVersion: 1, kind: 'test-runtime-dispatch-v1', commandRunId,
    commandSha256: executionBinding.logicalCommandSha256, profileSha256, inputsSha256,
    invocations: [{
      ordinal: 0, runId, argv: [effectiveInvocation.command, ...effectiveArgs],
      selectedTestIds: [testId], selectedFiles: [testPath], executionBinding,
    }],
  };
  const dispatchSha256 = put(dispatch);
  const request = {
    schemaVersion: 1, kind: 'test-runtime-request-v1', runId, commandRunId, commandName: 'test',
    origin: 'configured', context, configuredInvocation: { command: 'npx', args: ['vitest', 'run'] },
    effectiveInvocation, executionBinding, selectedTestIds: [testId], selectedFiles: [testPath],
    profileSha256, inputsSha256, dispatchSha256,
  };
  const requestSha256 = put(request);
  const provider = {
    schemaVersion: 1, kind: 'test-runtime-provider-v1', executionRunId: runId,
    profileSha256, inputsSha256,
    bootstrapSha256: entries.find((entry) => entry.path === 'scripts/test-runtime/stable-wall-clock.mjs')!.rawSha256,
    anchorId: anchorSha256, anchor,
  };
  const samples = Array.from({ length: 8 }, (_, index) => ({
    hrtimeBeforeNs: String(1_000_000_000n + BigInt(index) * 2_000_000n),
    performanceMs: 100 + index * 2,
    hrtimeAfterNs: String(1_000_500_000n + BigInt(index) * 2_000_000n),
  }));
  const markerMetadata = {
    schemaVersion: 1, kind: 'test-runtime-install-v1', anchorId: anchorSha256,
    bootstrapSha256: provider.bootstrapSha256, profileSha256,
    calibration: { samples, selectedIndex: 0, localWallEpochMs: anchor.wallEpochMs + 0.25, localMonoEpochMs: 100 },
  };
  const observation = {
    schemaVersion: 1, providerKey, markerKey,
    providerSha256: sha256(canonicalBytes(provider)),
    markerMetadataSha256: sha256(canonicalBytes(markerMetadata)), installedNowMatchesDateNow: true,
  };
  const worker = {
    workerId, pool: 'forks', testPath, inputsSha256, anchorSha256, samples, selectedIndex: 0,
    status: 'ready', observation,
  };
  const workerSha256 = put({
    schemaVersion: 1, kind: 'test-runtime-worker-v1', runId, requestSha256,
    worker, provider, markerMetadata,
  });
  const acknowledgment = {
    schemaVersion: 1, kind: 'test-runtime-ack-v1', runId, requestSha256, profileSha256,
    inputsSha256, nodeVersion: process.version, platform: process.platform,
    anchor, anchorSha256, workers: [worker], files: [{ path: testPath, state: 'completed' }],
    workerSha256s: [workerSha256],
    reporterRegistration: {
      reporterPath: join(directory, 'scripts/test-runtime/coordinator-reporter.mjs'),
      requestSha256,
      observedProcess: {
        command: process.execPath,
        args: [join(directory, 'node_modules/vitest/vitest.mjs'), ...effectiveArgs.slice(1)],
      },
      observedVitestArgs: effectiveArgs.slice(1),
    },
    reportedFailed: 0, bootstrapErrors: [], complete: true,
  };
  const acknowledgmentSha256 = put(acknowledgment);
  const resultSha256 = put({
    schemaVersion: 1, kind: 'test-runtime-result-v1', runId, requestSha256,
    effectiveInvocation, executionBinding, status: 'completed', exitCode: 0, durationMs: 1,
    nativeReportBase64: canonicalBytes({
      success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0,
      testResults: [{
        name: testPath, status: 'passed',
        assertionResults: [{ fullName: testId, title: testId, status: 'passed', failureMessages: [] }],
      }],
    }).toString('base64'),
  });
  const provenance = {
    kind: 'stable-test-wall-clock-v1', profileSha256, inputsSha256, dispatchSha256,
    runs: [{ ordinal: 0, runId, requestSha256, anchorSha256, acknowledgmentSha256, resultSha256 }],
    publication: {
      durability: process.platform === 'win32' ? 'win32-file-flush-no-replace-rehash' : 'posix-file-directory-fsync',
      closureSha256: sha256(canonicalBytes([...bytes.keys()].sort())),
    },
  };
  return {
    directory, store, bytes, provenance, context, request, acknowledgment, executionBinding,
    workerSha256, acknowledgmentSha256, inputsSha256, resultSha256, dispatchSha256,
  };
}

function activationFixture(provenance: unknown, logicalCommandSha256: unknown, bindings: {
  repositoryId: string;
  approvals: { requirements: { artifactSha256: string }; design: { artifactSha256: string } };
  phases: { requirements: { order: number }; design: { order: number } };
  orderPrefix: { records: Array<{ sequence: number; recordSha256: string }> };
  implementationPaths: Record<string, string[]>;
}) {
  const hash = (value: unknown) => sha256(canonicalBytes(value));
  const rawHash = (value: unknown) => sha256(Buffer.from(JSON.stringify(value)));
  const requirementIds = ['REQ-M5-COMPAT-013', 'REQ-M5-LIFECYCLE-006'];
  const scopeId = nextBatchScopeId([], requirementIds);
  const changeId = 'CHANGE-0017';
  const generation = 8;
  const testId = 'TEST-M5-TEST-CLOCK-EVIDENCE-001';
  const requirementId = 'REQ-M5-COMPAT-013';
  const repositoryId = bindings.repositoryId;
  const recordedAt = '2026-09-28T00:00:00.000Z';
  const approvals = structuredClone(bindings.approvals);
  const phases = structuredClone(bindings.phases);
  const designOrder = phases.design.order;
  const redCheckpointOrder = designOrder + 13;
  const implementationOrder = designOrder + 14;
  const greenOrder = designOrder + 15;
  const fingerprint = (name: 'red' | 'implementation') => ({
    impact: hash('impact'), requirements: hash('requirements'), design: hash('design'),
    implementation: hash(['implementation', name]), tests: hash('prepared-tests'), tdd: hash(['tdd', name]),
    requirementImplementations: Object.fromEntries(requirementIds.map((id) => {
      const paths = [...bindings.implementationPaths[id]!];
      return [id, {
        paths,
        fingerprints: Object.fromEntries(paths.map((path) => [
          path, hash(['g8-freeze-fixture-implementation-v1', name, id, path]),
        ])),
      }];
    })),
  });
  const redFingerprints = fingerprint('red');
  const implementationFingerprints = fingerprint('implementation');
  const assignments = [
    ['TEST-M5-RELEASE-002-TRUST-001', 'REQ-M5-COMPAT-013', 'tests/candidate-gate-trust.test.ts'],
    ['TEST-M5-TEST-CLOCK-MODULE-ORDER-001', 'REQ-M5-LIFECYCLE-006', 'tests/test-runtime-worker.test.ts'],
    ['TEST-M5-TEST-CLOCK-MONOTONIC-001', 'REQ-M5-LIFECYCLE-006', 'tests/test-runtime-worker.test.ts'],
    ['TEST-M5-TEST-CLOCK-CHILD-001', 'REQ-M5-LIFECYCLE-006', 'tests/test-runtime-worker.test.ts'],
    ['TEST-M5-TEST-CLOCK-MOCK-001', 'REQ-M5-LIFECYCLE-006', 'tests/test-runtime-worker.test.ts'],
    ['TEST-M5-TEST-CLOCK-TIMERS-001', 'REQ-M5-LIFECYCLE-006', 'tests/test-runtime-timers.test.ts'],
    ['TEST-M5-TEST-CLOCK-ISOLATION-001', 'REQ-M5-LIFECYCLE-006', 'tests/test-runtime-worker.test.ts'],
    ['TEST-M5-TEST-CLOCK-EVIDENCE-001', 'REQ-M5-COMPAT-013', 'tests/test-runtime-evidence.test.ts'],
    ['TEST-M5-TEST-CLOCK-AGGREGATE-001', 'REQ-M5-COMPAT-013', 'tests/test-runtime-evidence.test.ts'],
    ['TEST-M5-TEST-CLOCK-HOST-BOUNDARY-001', 'REQ-M5-LIFECYCLE-006', 'tests/test-runtime-worker.test.ts'],
    ['TEST-M5-TEST-CLOCK-BLOB-PLATFORM-001', 'REQ-M5-COMPAT-013', 'tests/test-runtime-evidence.test.ts'],
    ['TEST-M5-TEST-CLOCK-GATE-FINGERPRINT-001', 'REQ-M5-COMPAT-013', 'tests/test-runtime-gate.test.ts'],
  ] as const;
  const phase = (name: 'red' | 'green', order: number) => ({
    phase: name, valid: true, scoped: true, resultObserved: true,
    testStatus: name === 'red' ? 'failed' : 'passed',
    reportSha256: hash(`${name}-report`), commandSha256: logicalCommandSha256,
    outputSha256: hash(`${name}-output`), exitCode: name === 'red' ? 1 : 0, durationMs: 1,
    testFingerprint: hash('same-test'), sourceFingerprint: hash(name),
    executionId: `${name}-execution`, order, recordedAt, diagnostics: [], warnings: [],
  });
  const cycles = assignments.map(([id, requirement, testPath], index) => ({
    cycleId: randomUUID(), changeId, generation, requirementId: requirement,
    testId: id, testPath, commandName: 'test', red: phase('red', designOrder + index + 1),
  }));
  const cycle = cycles.find((value) => value.testId === testId)!;
  const { cycleId, red } = cycle;
  let previousChainSha256: string | null = null;
  const chain = cycles.map((value, index) => {
    const payload = {
      sequence: index + 1, cycleId: value.cycleId, changeId, generation,
      requirementId: value.requirementId, testId: value.testId,
      testPath: value.testPath, commandName: 'test', phase: 'red',
      phaseEvidenceSha256: rawHash(value.red), previousSha256: previousChainSha256,
    };
    const entry = { ...payload, recordSha256: rawHash(payload) };
    previousChainSha256 = entry.recordSha256;
    return entry;
  });
  const tddEvidence = { schemaVersion: 1, cycles, chain };
  let previousJournalSha256: string | null = null;
  const journal = (name: 'red' | 'implementation', order: number): BatchCheckpointRecord => {
    const payload = {
      schemaVersion: 1 as const, changeId, generation, phase: name, scopeId, repositoryId,
      workspaceHead: 'a'.repeat(40), requirementIds,
      fingerprints: name === 'red' ? redFingerprints : implementationFingerprints,
      workspaceStateSha256: hash('workspace'), tddEvidenceSha256: rawHash(tddEvidence),
      semanticPhaseKey: generationOrderPhase(generation, name, scopeId),
      orderPhaseKey: generationOrderPhase(generation, name, scopeId),
      recordedAt, changeFencingToken: 1, projectionFencingToken: 1,
    };
    const record = {
      schemaVersion: 1 as const, stream: 'normal' as const, changeId, kind: 'change-batch-checkpoint' as const,
      idempotencyKey: `change-batch-checkpoint:${changeId}:${payload.orderPhaseKey}`, payload, order,
      previousSha256: previousJournalSha256,
    };
    const result = { ...record, recordSha256: hash(record) };
    previousJournalSha256 = result.recordSha256;
    return result;
  };
  const redJournal = journal('red', 1);
  const implementationJournal = journal('implementation', 2);
  const checkpoint = (record: typeof redJournal, order: number) => ({
    order, orderPhaseKey: record.payload.orderPhaseKey,
    journalRecordSha256: record.recordSha256, tddEvidenceSha256: record.payload.tddEvidenceSha256,
  });
  const activation = {
    schemaVersion: 1, kind: 'legacy-red-runtime-activation-v1', changeId, generation, scopeId,
    cycleId, requirementId, testId, commandName: 'test',
    redOrder: red.order, redPhaseEvidenceSha256: rawHash(red),
    requirementsApprovalSha256: approvals.requirements.artifactSha256,
    designApprovalSha256: approvals.design.artifactSha256,
    requirementsCheckpointOrder: phases.requirements.order, designCheckpointOrder: designOrder,
    redCheckpoint: checkpoint(redJournal, redCheckpointOrder),
    implementationCheckpoint: checkpoint(implementationJournal, implementationOrder),
  };
  record(provenance);
  const green = { ...phase('green', greenOrder), testRuntime: { ...provenance, activation } };
  const prefix = structuredClone(bindings.orderPrefix.records);
  let previousOrderSha256: string | null = prefix.at(-1)!.recordSha256;
  const suffix = [
    ...cycles.map((value) => ({ kind: 'tdd', entityId: value.cycleId, phase: 'red', testId: value.testId })),
    { kind: 'change', entityId: changeId, phase: redJournal.payload.orderPhaseKey },
    { kind: 'change', entityId: changeId, phase: implementationJournal.payload.orderPhaseKey },
    { kind: 'tdd', entityId: cycleId, phase: 'green', testId },
  ].map((entry, index) => {
    const payload = { sequence: designOrder + index + 1, ...entry, previousSha256: previousOrderSha256 };
    const result = { ...payload, recordSha256: rawHash(payload) };
    previousOrderSha256 = result.recordSha256;
    return result;
  });
  return {
    schemaVersion: 1, repositoryId, tddEvidence, cycle, green, approvals, orders: [...prefix, ...suffix],
    journal: [redJournal, implementationJournal],
    phases,
    batch: {
      scopeId, requirementIds,
      red: { phase: 'red', order: redCheckpointOrder, recordedAt, fingerprints: redFingerprints },
      implementation: { phase: 'implementation', order: implementationOrder, recordedAt, fingerprints: implementationFingerprints },
    },
  };
}

async function activationCases(value: Awaited<ReturnType<typeof fixture>>, call: Awaited<ReturnType<typeof runtime>>) {
  const valid = activationFixture(value.provenance, value.executionBinding.logicalCommandSha256, (() => {
    const base = join(root, '.musubix/evidence/test-file-freeze/CHANGE-0017/g8');
    const candidates = readdirSync(base).map((name) => {
      const manifest: unknown = JSON.parse(readFileSync(join(base, name, 'manifest.json'), 'utf8'));
      record(manifest);
      return { name, manifest };
    });
    const predecessors = new Set(candidates.flatMap(({ manifest }) => {
      if (manifest.predecessorFreeze === null) return [];
      record(manifest.predecessorFreeze);
      return [manifest.predecessorFreeze.manifestSha256];
    }));
    const tips = candidates.filter(({ name }) => !predecessors.has(name));
    expect(tips).toHaveLength(1);
    const inputs: unknown = JSON.parse(readFileSync(join(base, tips[0]!.name, 'preflight/inputs.json'), 'utf8'));
    record(inputs);
    record(inputs.fixtureBindings);
    const binding = inputs.fixtureBindings.g8;
    const historical = inputs.fixtureBindings.g7;
    record(binding);
    record(historical);
    record(binding.approvals);
    record(binding.phases);
    record(binding.orderPrefix);
    record(historical.phases);
    record(historical.phases.requirements);
    record(historical.phases.requirements.fingerprints);
    const maps = historical.phases.requirements.fingerprints.requirementImplementations;
    record(maps);
    const implementationPaths = Object.fromEntries(['REQ-M5-COMPAT-013', 'REQ-M5-LIFECYCLE-006'].map((id) => {
      const entry = maps[id];
      record(entry);
      if (!Array.isArray(entry.paths) || !entry.paths.every((path): path is string => typeof path === 'string')) {
        throw new Error('Invalid pinned implementation paths');
      }
      return [id, entry.paths];
    }));
    const approval = (input: unknown) => {
      record(input);
      if (typeof input.artifactSha256 !== 'string') throw new Error('Invalid pinned approval');
      return { ...input, artifactSha256: input.artifactSha256 };
    };
    const checkpoint = (input: unknown) => {
      record(input);
      if (typeof input.order !== 'number') throw new Error('Invalid pinned checkpoint');
      return { ...input, order: input.order };
    };
    const prefix = binding.orderPrefix;
    if (typeof binding.repositoryId !== 'string'
      || Object.keys(prefix).sort().join(',') !== [
        'extractionAlgorithm', 'extractionSha256', 'extractionVersion', 'kind',
        'prefixLength', 'recordJson', 'recordStringsSha256', 'schemaVersion',
        'sourceByteSha256', 'sourcePath', 'tipRecordSha256', 'tipSequence',
      ].join(',')
      || prefix.schemaVersion !== 1 || prefix.kind !== 'evidence-order-native-strings-v1'
      || prefix.sourcePath !== '.musubix/evidence/order.json'
      || prefix.extractionAlgorithm !== 'json-parse-prefix-native-stringify' || prefix.extractionVersion !== 1
      || typeof prefix.sourceByteSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(prefix.sourceByteSha256)
      || !Number.isSafeInteger(prefix.prefixLength) || prefix.prefixLength !== prefix.tipSequence
      || !Array.isArray(prefix.recordJson) || prefix.recordJson.length !== prefix.prefixLength
      || typeof prefix.tipRecordSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(prefix.tipRecordSha256)
      || sha256(canonicalBytes(prefix.recordJson)) !== prefix.recordStringsSha256) {
      throw new Error('Invalid pinned fixture identity');
    }
    const { extractionSha256, ...extraction } = prefix;
    if (sha256(canonicalBytes(extraction)) !== extractionSha256) {
      throw new Error('Invalid pinned order extraction');
    }
    const orderRecord = (input: unknown): input is { sequence: number; recordSha256: string } => {
      record(input);
      return typeof input.sequence === 'number' && typeof input.recordSha256 === 'string';
    };
    const records = prefix.recordJson.map((text: unknown, index: number) => {
      if (typeof text !== 'string' || Buffer.from(text, 'utf8').toString('utf8') !== text) {
        throw new Error('Invalid pinned native record string');
      }
      const input: unknown = JSON.parse(text);
      if (!orderRecord(input) || input.sequence !== index + 1 || JSON.stringify(input) !== text) {
        throw new Error('Invalid pinned order record');
      }
      return input;
    });
    if (records.length === 0 || records[records.length - 1]!.recordSha256 !== prefix.tipRecordSha256) {
      throw new Error('Invalid pinned order tip');
    }
    return {
      repositoryId: binding.repositoryId,
      approvals: {
        requirements: approval(binding.approvals.requirements), design: approval(binding.approvals.design),
      },
      phases: {
        requirements: checkpoint(binding.phases.requirements), design: checkpoint(binding.phases.design),
      },
      orderPrefix: { records }, implementationPaths,
    };
  })());
  expect(validateBatchCheckpointJournal(valid.journal)).toMatchObject({ valid: true, diagnostics: [] });
  expect(valid.cycle.red).not.toHaveProperty('schemaVersion');
  expect(valid.cycle.red).not.toHaveProperty('testRuntime');
  expect(valid.green.commandSha256).toBe(valid.cycle.red.commandSha256);
  await call('validateLegacyRuntimeActivation', valid);
  const changed = (path: string[], replacement: unknown, remove = false) => {
    const copy: unknown = structuredClone(valid);
    record(copy);
    let parent = copy;
    for (const key of path.slice(0, -1)) {
      const child = parent[key];
      record(child);
      parent = child;
    }
    if (remove) delete parent[path.at(-1)!];
    else parent[path.at(-1)!] = replacement;
    return copy;
  };
  const mutations = [
    changed(['tddEvidence', 'schemaVersion'], 2),
    changed(['cycle', 'red', 'testRuntime'], null),
    changed(['cycle', 'red', 'augmentationSha256'], 'a'.repeat(64)),
    changed(['cycle', 'red', 'schemaVersion'], 1),
    changed(['cycle', 'red', 'order'], 2),
    changed(['batch', 'red', 'order'], 3),
    changed(['batch', 'implementation', 'order'], 4),
    changed(['batch', 'implementation'], undefined, true),
    changed(['cycle', 'testId'], 'TEST-M5-CHECKPOINT-SESSION-001'),
    changed(['cycle', 'red', 'commandSha256'], 'f'.repeat(64)),
    changed(['green', 'testRuntime', 'kind'], 'another-profile'),
    changed(['green', 'testRuntime', 'profileSha256'], 'e'.repeat(64)),
    changed(['green', 'testRuntime', 'runs'], []),
    changed(['green', 'testRuntime', 'activation', 'designApprovalSha256'], 'd'.repeat(64)),
    changed(['cycle', 'cycleId'], randomUUID()),
    changed(['cycle', 'generation'], 6),
    changed(['cycle', 'changeId'], 'CHANGE-0005'),
    changed(['batch', 'scopeId'], 'foreign'),
    changed(['repositoryId'], 'repository:foreign'),
    changed(['tddEvidence', 'chain'], []),
    changed(['green', 'testRuntime', 'activation', 'redCheckpoint'], undefined, true),
    changed(['green', 'testRuntime', 'activation', 'implementationCheckpoint', 'journalRecordSha256'], 'b'.repeat(64)),
    changed(['green', 'order'], 5),
  ];
  for (const invalid of mutations) {
    await expect(call('validateLegacyRuntimeActivation', invalid))
      .rejects.toThrow(/TEST_RUNTIME_BOOTSTRAP_INVALID.*phase-runtime-transition/);
    await expect(call('validateLegacyRuntimeActivation', {
      ...invalid, reconstructedConfig: { testRuntime: undefined }, reconstructedGitCommit: 'a'.repeat(40),
    })).rejects.toThrow(/TEST_RUNTIME_BOOTSTRAP_INVALID.*phase-runtime-transition/);
  }
}

function rehashedMutation(
  value: Awaited<ReturnType<typeof fixture>>,
  target: string,
  mutate: (object: Record<string, unknown>) => void,
) {
  const rewritten = new Map<string, string>();
  const reachable = new Map<string, Buffer>();
  const rewrite = (input: unknown): unknown => {
    if (typeof input === 'string' && value.bytes.has(input)) return resolve(input);
    if (Array.isArray(input)) return input.map(rewrite);
    if (input !== null && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, rewrite(entry)]));
    }
    return input;
  };
  const resolve = (hash: string): string => {
    const previous = rewritten.get(hash);
    if (previous) return previous;
    const object: unknown = JSON.parse(value.bytes.get(hash)!.toString('utf8'));
    record(object);
    if (hash === target) mutate(object);
    const bytes = canonicalBytes(rewrite(object));
    const updated = sha256(bytes);
    rewritten.set(hash, updated);
    reachable.set(updated, bytes);
    return updated;
  };
  const result = rewrite(value.provenance);
  record(result);
  record(result.publication);
  result.publication.closureSha256 = sha256(canonicalBytes([...reachable.keys()].sort()));
  const added: string[] = [];
  for (const [hash, bytes] of reachable) {
    const path = join(value.store, hash);
    if (existsSync(path)) expect(readFileSync(path)).toEqual(bytes);
    else {
      writeFileSync(path, bytes, { flag: 'wx' });
      added.push(path);
    }
  }
  return { provenance: result, added };
}

async function observedPublication(
  options: {
    sourceRoot: string; controlRoot: string; provenance: unknown; context: unknown; platform: string;
  },
  fault?: 'sync' | 'rehash',
) {
  const events: Array<{ operation: string; path: string }> = [];
  vi.resetModules();
  vi.doMock('node:fs/promises', async () => {
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    return {
      ...actual,
      open: async (...args: Parameters<typeof actual.open>) => {
        const handle = await actual.open(...args);
        const path = String(args[0]);
        if (path.startsWith(blobStore(options.controlRoot))) {
          events.push({ operation: `open:${args[1]}`, path });
          const sync = handle.sync.bind(handle);
          handle.sync = async () => {
            const directory = (await handle.stat()).isDirectory();
            events.push({ operation: directory ? 'directory-sync' : 'file-sync', path });
            if (fault === 'sync') throw new Error('fixture fsync failure');
            await sync();
          };
        }
        return handle;
      },
      link: async (...args: Parameters<typeof actual.link>) => {
        await actual.link(...args);
        const path = String(args[1]);
        if (path.startsWith(blobStore(options.controlRoot))) {
          events.push({ operation: 'no-replace-link', path });
          if (fault === 'rehash') await actual.writeFile(args[1], '{}\n');
        }
      },
    };
  });
  try {
    const invoke = await runtime();
    const publication = await invoke('publishTestRuntimeClosure', options);
    return { publication, events };
  } finally {
    vi.doUnmock('node:fs/promises');
    vi.resetModules();
  }
}

/** @id TEST-M5-TEST-CLOCK-EVIDENCE-001
 * @verifies REQ-M5-COMPAT-013
 * @design DES-M5-015
 */
it('TEST-M5-TEST-CLOCK-EVIDENCE-001 binds closed observation blobs and rejects missing tampered foreign or incomplete evidence', async () => {
  bindings();
  const call = await runtime();
  expect(await call('expectedTestRuntimeProfileSha256', 'stable-test-wall-clock-v1', 1)).toBe(profileSha256);
  await expect(call('expectedTestRuntimeProfileSha256', 'stable-test-wall-clock-v2', 1)).rejects.toThrow();
  const approvalBefore = canonicalBytes(await loadApprovalProjectionConfig(root));
  for (const role of ['tdd', 'command', 'result', 'integration'] as const) {
    const value = await fixture(role, call);
    try {
      await call('validateTestRuntimeProvenance', value.directory, value.provenance, value.context);
      if (role === 'tdd') await activationCases(value, call);
      for (const [hash, original] of value.bytes) {
        rmSync(join(value.store, hash));
        await expect(call('validateTestRuntimeProvenance', value.directory, value.provenance, value.context))
          .rejects.toThrow(/TEST_RUNTIME_BOOTSTRAP_INVALID.*blob-missing/);
        writeFileSync(join(value.store, hash), Buffer.from('{}\n'));
        await expect(call('validateTestRuntimeProvenance', value.directory, value.provenance, value.context))
          .rejects.toThrow(/TEST_RUNTIME_BOOTSTRAP_INVALID.*blob-(schema|hash)/);
        writeFileSync(join(value.store, hash), original);
        expect(readFileSync(join(value.store, hash))).toEqual(original);
      }
      for (const invalid of [
        { ...value.provenance, profileSha256: 'b'.repeat(64) },
        { ...value.provenance, runs: [] },
        { ...value.provenance, runs: [...value.provenance.runs, value.provenance.runs[0]] },
        { ...value.provenance, unknownAugmentation: true },
        { ...value.provenance, publication: { ...value.provenance.publication, closureSha256: 'c'.repeat(64) } },
      ]) {
        await expect(call('validateTestRuntimeProvenance', value.directory, invalid, value.context))
          .rejects.toThrow(/TEST_RUNTIME_BOOTSTRAP_INVALID/);
      }
      const mutations: Array<[string, (object: Record<string, unknown>) => void]> = [
        [value.acknowledgmentSha256, (object) => { object.runId = randomUUID(); }],
        [value.acknowledgmentSha256, (object) => { object.complete = false; }],
        [value.acknowledgmentSha256, (object) => { delete object.reporterRegistration; }],
        [value.acknowledgmentSha256, (object) => { object.workers = []; object.workerSha256s = []; }],
        [value.acknowledgmentSha256, (object) => { object.files = []; }],
        [value.workerSha256, (object) => {
          record(object.worker);
          record(object.worker.observation);
          object.worker.observation.providerKey = 'foreign-provider';
        }],
        [value.workerSha256, (object) => {
          record(object.provider);
          object.provider.anchorId = 'c'.repeat(64);
        }],
        [value.workerSha256, (object) => { delete object.markerMetadata; }],
        [value.inputsSha256, (object) => {
          if (!Array.isArray(object.entries)) throw new Error('Expected input entries');
          object.entries = object.entries.slice(1);
        }],
        [value.dispatchSha256, (object) => { object.invocations = []; }],
        [value.resultSha256, (object) => { object.nativeReportBase64 = null; }],
        [value.resultSha256, (object) => {
          record(object.executionBinding);
          object.executionBinding.augmentationSha256 = 'b'.repeat(64);
        }],
        [profileSha256, (object) => { object.commandNames = ['test']; }],
      ];
      for (const [target, mutate] of mutations) {
        const changed = rehashedMutation(value, target, mutate);
        try {
          await expect(call('validateTestRuntimeProvenance', value.directory, changed.provenance, value.context))
            .rejects.toThrow(/TEST_RUNTIME_BOOTSTRAP_INVALID/);
        } finally {
          for (const path of changed.added) rmSync(path);
        }
      }
      for (const context of [
        { ...value.context, generation: 6 },
        { ...value.context, changeId: 'CHANGE-0005' },
        { ...value.context, repositoryId: 'repository:foreign' },
        { ...value.context, commit: 'f'.repeat(40) },
        { ...value.context, role: 'standalone' },
      ]) {
        await expect(call('validateTestRuntimeProvenance', value.directory, value.provenance, context))
          .rejects.toThrow(/TEST_RUNTIME_BOOTSTRAP_INVALID.*(blob-context|acknowledgment-binding)/);
      }
      const untransferred = mkdtempSync(join(tmpdir(), 'musubix5-runtime-untransferred-'));
      try {
        await expect(call('validateTestRuntimeProvenance', untransferred, value.provenance, value.context))
          .rejects.toThrow(/TEST_RUNTIME_BOOTSTRAP_INVALID.*blob-missing/);
      } finally {
        rmSync(untransferred, { recursive: true, force: true });
      }
      await call('validateTestRuntimeProvenance', value.directory, value.provenance, value.context);
    } finally {
      rmSync(value.directory, { recursive: true, force: true });
    }
  }
  expect(canonicalBytes(await loadApprovalProjectionConfig(root))).toEqual(approvalBefore);
  const tsc = await runProcess(process.execPath, [
    join(root, 'node_modules/typescript/bin/tsc'), '--strict', '--allowJs', '--checkJs',
    '--noEmit', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--target', 'ES2022', '--skipLibCheck', 'scripts/test-runtime/vitest-setup.mjs',
  ], { cwd: root, timeoutMs: 30_000 });
  expect(tsc.exitCode, tsc.stdout + tsc.stderr).toBe(0);
  const probe = mkdtempSync(join(root, '.musubix/cache/runtime-type-boundary-'));
  try {
    const path = join(probe, 'unvalidated.mjs');
    writeFileSync(path, [
      'import { inject } from "vitest";',
      'const readProvided = /** @type {(key: string) => unknown} */ (/** @type {unknown} */ (inject));',
      'const supplied = readProvided("musubix5StableWallClockV1");',
      'console.log(supplied.anchorId);',
    ].join('\n'));
    const rejected = await runProcess(process.execPath, [
      join(root, 'node_modules/typescript/bin/tsc'), '--strict', '--allowJs', '--checkJs',
      '--noEmit', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
      '--target', 'ES2022', '--skipLibCheck', path,
    ], { cwd: root, timeoutMs: 30_000 });
    expect(rejected.exitCode).toBe(2);
    expect(rejected.stdout + rejected.stderr).toContain("TS18046: 'supplied' is of type 'unknown'.");
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
});

/** @id TEST-M5-TEST-CLOCK-AGGREGATE-001
 * @verifies REQ-M5-COMPAT-013
 * @design DES-M5-015
 */
it('TEST-M5-TEST-CLOCK-AGGREGATE-001 preserves logical command identity while binding closed root-independent runtime augmentation', async () => {
  bindings();
  const call = await runtime();
  const invocations = [
    { command: 'npx', args: ['vitest', 'run'] },
    { command: 'npx', args: ['vitest', 'run', 'tests/probe.test.ts', '-t', 'selected', '--reporter=json', '--outputFile=native.json'] },
    { command: 'npm', args: ['run', 'test:compat'] },
    { command: 'npm', args: ['run', 'test:compat', '--', '-t', 'selected', '--reporter=json'] },
    { command: 'npx', args: ['vitest', 'run', '--reporter=json', '--', 'literal-suffix'] },
    { command: process.execPath, args: ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=1', '--reporter=json', '--outputFile=group.json'] },
  ];
  for (const logicalInvocation of invocations) {
    const rootA = mkdtempSync(join(tmpdir(), 'musubix5 runtime A '));
    const rootB = mkdtempSync(join(tmpdir(), 'musubix5 runtime B '));
    try {
      const bindingsForRoots = [];
      for (const directory of [rootA, rootB]) {
        const value = await call('augmentTestRuntimeInvocation', {
          logicalInvocation, profileSha256, runId: randomUUID(), commandRunId: randomUUID(),
          locations: { repo: directory, run: join(directory, 'run'), 'command-run': join(directory, 'command-run') },
        });
        record(value);
        expect(value.logicalInvocation).toEqual(logicalInvocation);
        expect(value.logicalCommandSha256).toBe(
          createHash('sha256').update(JSON.stringify([logicalInvocation.command, logicalInvocation.args])).digest('hex'),
        );
        record(value.augmentation);
        expect(Object.keys(value.augmentation).sort()).toEqual([
          'ackPath', 'clockMarker', 'defaultReporter', 'dispatchPath', 'kind',
          'npmForwardingBoundary', 'preloadPath', 'profileSha256', 'reporterPath',
          'requestPath', 'schemaVersion', 'setupPath', 'workerPacketPath',
        ]);
        expect(value.augmentation).toMatchObject({
          schemaVersion: 1, kind: 'test-runtime-augmentation-v1', profileSha256,
          reporterPath: 'repo:scripts/test-runtime/coordinator-reporter.mjs',
          preloadPath: 'repo:scripts/test-runtime/stable-wall-clock.mjs',
          setupPath: 'repo:scripts/test-runtime/vitest-setup.mjs',
          requestPath: 'run:request.json', dispatchPath: 'command-run:dispatch.json',
          ackPath: 'run:ack.json', workerPacketPath: 'run:worker-acks/{workerId}.json', clockMarker: 'anchor-ref',
          defaultReporter: !logicalInvocation.args.some((arg) => arg.startsWith('--reporter=')),
          npmForwardingBoundary: logicalInvocation.command === 'npm' && !logicalInvocation.args.includes('--'),
        });
        expect(value.augmentationSha256).toBe(sha256(canonicalBytes(value.augmentation)));
        record(value.resolvedInvocation);
        const args = value.resolvedInvocation.args;
        expect(Array.isArray(args)).toBe(true);
        if (!Array.isArray(args)) throw new Error('Expected effective argv');
        const reporter = `--reporter=${join(directory, 'scripts/test-runtime/coordinator-reporter.mjs')}`;
        expect(args.filter((arg: unknown) => arg === reporter)).toHaveLength(1);
        if (logicalInvocation.args.includes('--reporter=json')) expect(args).toContain('--reporter=json');
        if (logicalInvocation.command === 'npm') expect(args.filter((arg: unknown) => arg === '--')).toHaveLength(1);
        if (logicalInvocation.args.includes('literal-suffix')) {
          expect(args.indexOf(reporter)).toBeLessThan(args.indexOf('--'));
          expect(args.slice(args.indexOf('--') + 1)).toEqual(['literal-suffix']);
        }
        await call('validateTestRuntimeExecutionBinding', value);
        for (const invalid of [
          { ...value, augmentation: { ...value.augmentation, unknown: true } },
          { ...value, augmentation: null },
          { ...value, augmentationSha256: '0'.repeat(64) },
          { ...value, resolvedInvocation: { ...value.resolvedInvocation, args: args.filter((arg: unknown) => arg !== reporter) } },
          { ...value, resolvedInvocation: { ...value.resolvedInvocation, args: [...args, '--unexpected'] } },
          { ...value, logicalInvocation: { ...logicalInvocation, args: [...logicalInvocation.args, '-t', 'different'] } },
        ]) {
          await expect(call('validateTestRuntimeExecutionBinding', invalid))
            .rejects.toThrow(/TEST_RUNTIME_BOOTSTRAP_INVALID.*augmentation-binding/);
        }
        bindingsForRoots.push(value);
      }
      expect(bindingsForRoots[0]!.logicalCommandSha256).toBe(bindingsForRoots[1]!.logicalCommandSha256);
      expect(bindingsForRoots[0]!.augmentationSha256).toBe(bindingsForRoots[1]!.augmentationSha256);
      expect(canonicalBytes(bindingsForRoots[0])).not.toEqual(canonicalBytes(bindingsForRoots[1]));
    } finally {
      rmSync(rootA, { recursive: true, force: true });
      rmSync(rootB, { recursive: true, force: true });
    }
  }
  const directory = mkdtempSync(join(root, '.musubix/cache/runtime-groups-'));
  try {
    const report = join(directory, 'native.json');
    const description = await runProcess(process.execPath, [
      'scripts/run-codegraph-tests.mjs', '--describe-groups', '--report', report,
    ], { cwd: root, timeoutMs: 10_000 });
    expect(description.exitCode, description.stderr).toBe(0);
    expect(existsSync(report)).toBe(false);
    const described: unknown = JSON.parse(description.stdout);
    record(described);
    expect(Object.keys(described).sort()).toEqual(['groups', 'schemaVersion']);
    expect(described.schemaVersion).toBe(1);
    const groups = described.groups;
    if (!Array.isArray(groups)) throw new Error('Expected described codegraph groups');
    expect(groups.length).toBeGreaterThan(1);
    const runIds = new Set<string>();
    const groupBindings = [];
    const commandRunId = randomUUID();
    for (const [ordinal, group] of groups.entries()) {
      record(group);
      expect(Object.keys(group).sort()).toEqual(['args', 'command', 'ordinal', 'testFiles', 'testIds']);
      expect(group.ordinal).toBe(ordinal);
      expect(group.command).toBe(process.execPath);
      if (!Array.isArray(group.args)) throw new Error('Expected native group argv');
      expect(group.args[0]).toBe(join(root, 'node_modules/vitest/vitest.mjs'));
      expect(group.args).toContain('--maxWorkers=1');
      expect(group.args).toContain('--reporter=json');
      expect(group.args.some((arg: unknown) => typeof arg === 'string' && arg.includes('coordinator-reporter.mjs'))).toBe(false);
      const runId = randomUUID();
      runIds.add(runId);
      const binding = await call('augmentTestRuntimeInvocation', {
        logicalInvocation: { command: group.command, args: group.args },
        profileSha256, runId, commandRunId,
        locations: { repo: root, run: join(directory, runId), 'command-run': directory },
      });
      record(binding);
      expect(binding.logicalInvocation).toEqual({ command: group.command, args: group.args });
      groupBindings.push({ ordinal, runId, group, executionBinding: binding });
    }
    expect(runIds.size).toBe(groups.length);
    await call('validateTestRuntimeGroups', described, groupBindings);
    await expect(call('validateTestRuntimeGroups', described, groupBindings.slice(1)))
      .rejects.toThrow(/TEST_RUNTIME_BOOTSTRAP_INVALID/);
    await expect(call('validateTestRuntimeGroups', described, [...groupBindings, groupBindings[0]]))
      .rejects.toThrow(/TEST_RUNTIME_BOOTSTRAP_INVALID/);
    const wrapper = readFileSync(join(root, 'scripts/run-codegraph-tests.mjs'), 'utf8');
    expect(wrapper).not.toMatch(/import\s.*test-runtime\.ts/);
    const reporter = readFileSync(join(root, 'scripts/test-runtime/coordinator-reporter.mjs'), 'utf8');
    expect(reporter).not.toContain('.provide(');
    expect(reporter).toContain('onTestRunEnd');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** @id TEST-M5-TEST-CLOCK-BLOB-PLATFORM-001
 * @verifies REQ-M5-COMPAT-013
 * @design DES-M5-015
 */
it('TEST-M5-TEST-CLOCK-BLOB-PLATFORM-001 publishes a verified closure before transport cleanup with immutable no-replace semantics', async () => {
  bindings();
  const call = await runtime();
  for (const platform of ['linux', 'win32']) {
    const source = await fixture('integration', call);
    const control = mkdtempSync(join(tmpdir(), 'musubix5-runtime-publication-'));
    try {
      const expected = [...source.bytes.keys()].sort();
      const observed = await observedPublication({
        sourceRoot: source.directory, controlRoot: control,
        provenance: source.provenance, context: source.context, platform,
      });
      const { publication, events } = observed;
      expect(publication).toEqual({
        durability: platform === 'win32' ? 'win32-file-flush-no-replace-rehash' : 'posix-file-directory-fsync',
        closureSha256: sha256(canonicalBytes(expected)),
      });
      expect(readdirSync(blobStore(control)).sort()).toEqual(expected);
      expect(events.some((event) => event.operation === 'open:wx')).toBe(true);
      const firstSync = events.findIndex((event) => event.operation === 'file-sync');
      const firstLink = events.findIndex((event) => event.operation === 'no-replace-link');
      expect(firstSync).toBeGreaterThanOrEqual(0);
      expect(firstLink).toBeGreaterThan(firstSync);
      if (platform === 'win32') {
        expect(events.some((event) => event.operation === 'directory-sync')).toBe(false);
      } else {
        expect(events.some((event, index) => event.operation === 'directory-sync' && index > firstLink)).toBe(true);
      }
      for (const [hash, bytes] of source.bytes) {
        expect(readFileSync(join(blobStore(control), hash))).toEqual(bytes);
      }
      const first = expected[0]!;
      const before = statSync(join(blobStore(control), first));
      await call('publishTestRuntimeClosure', {
        sourceRoot: source.directory, controlRoot: control,
        provenance: source.provenance, context: source.context, platform,
      });
      expect(statSync(join(blobStore(control), first)).ino).toBe(before.ino);
      writeFileSync(join(blobStore(control), first), '{}\n');
      await expect(call('publishTestRuntimeClosure', {
        sourceRoot: source.directory, controlRoot: control,
        provenance: source.provenance, context: source.context, platform,
      })).rejects.toThrow(/TEST_RUNTIME_BOOTSTRAP_INVALID.*(blob-hash|blob-schema|blob-io)/);
      expect(readFileSync(join(blobStore(control), first), 'utf8')).toBe('{}\n');
      writeFileSync(join(blobStore(control), first), source.bytes.get(first)!);
      for (const fault of platform === 'win32' ? ['sync', 'rehash'] as const : ['sync'] as const) {
        const failedControl = mkdtempSync(join(tmpdir(), 'musubix5-runtime-publication-failure-'));
        try {
          await expect(observedPublication({
            sourceRoot: source.directory, controlRoot: failedControl,
            provenance: source.provenance, context: source.context, platform,
          }, fault)).rejects.toThrow(/TEST_RUNTIME_BOOTSTRAP_INVALID.*blob-io/);
          if (fault === 'sync' && existsSync(blobStore(failedControl))) {
            expect(readdirSync(blobStore(failedControl)).filter((name) => /^[a-f0-9]{64}$/.test(name))).toEqual([]);
          }
        } finally {
          rmSync(failedControl, { recursive: true, force: true });
        }
      }
      rmSync(source.directory, { recursive: true, force: true });
      await call('validateTestRuntimeProvenance', control, {
        ...source.provenance, publication,
      }, source.context);
      await expect(call('publishTestRuntimeClosure', {
        sourceRoot: source.directory, controlRoot: control,
        provenance: source.provenance, context: source.context, platform,
      })).rejects.toThrow(/TEST_RUNTIME_BOOTSTRAP_INVALID.*blob-io/);
    } finally {
      rmSync(source.directory, { recursive: true, force: true });
      rmSync(control, { recursive: true, force: true });
    }
  }
});
