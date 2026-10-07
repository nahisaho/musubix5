import { expect, inject } from 'vitest';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closed, fail, freeze, hash, inheritClock, installClock, markerKey, validateProvider } from './stable-wall-clock.mjs';

/* @id CODE-M5-TEST-RUNTIME-WORKER-001
 * @implements REQ-M5-COMPAT-013 REQ-M5-LIFECYCLE-006 REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-015 DES-M5-LINUX-DELIVERY-002
 */
const readProvided = /** @type {(key: string) => unknown} */ (/** @type {unknown} */ (inject));
const supplied = readProvided('musubix5StableWallClockV1');
const provider = validateProvider(supplied);
freeze(supplied);
const marker = installClock(provider);
const requestPath = process.env.MUSUBIX5_TEST_RUNTIME_REQUEST;
if (!requestPath) fail('worker-scope', 'missing worker request');
const request = closed(JSON.parse(readFileSync(requestPath, 'utf8')),
  ['schemaVersion', 'kind', 'runId', 'commandRunId', 'commandName', 'origin', 'context',
    'configuredInvocation', 'effectiveInvocation', 'executionBinding', 'selectedTestIds', 'selectedFiles',
    'profileSha256', 'inputsSha256', 'dispatchSha256'], 'worker-scope');
if (request.runId !== provider.executionRunId || request.profileSha256 !== provider.profileSha256
  || request.inputsSha256 !== provider.inputsSha256) fail('worker-scope', 'request binding');
/** @type {unknown} */
const state = Reflect.get(globalThis, '__vitest_worker__');
if (!state || typeof state !== 'object') fail('worker-scope', 'missing Vitest worker state');
/** @type {unknown} */
const filepath = Reflect.get(state, 'filepath');
/** @type {unknown} */
const context = Reflect.get(state, 'ctx');
if (typeof filepath !== 'string' || !context || typeof context !== 'object') fail('worker-scope', 'worker identity');
/** @type {unknown} */
const pool = Reflect.get(context, 'pool');
if (typeof pool !== 'string' || !['forks', 'threads', 'vmForks', 'vmThreads'].includes(pool)) fail('worker-scope', 'pool identity');
const root = fileURLToPath(new URL('../..', import.meta.url));
const testPath = relative(root, resolve(filepath)).split('\\').join('/');
if (!Array.isArray(request.selectedFiles) || !request.selectedFiles.includes(testPath)) fail('worker-scope', 'file selection');
const workerId = randomUUID();
const { installedNow, ...markerMetadata } = marker;
const worker = { workerId, pool, testPath, inputsSha256: provider.inputsSha256, anchorSha256: provider.anchorId,
  samples: marker.calibration.samples, selectedIndex: marker.calibration.selectedIndex, status: 'ready',
  observation: { schemaVersion: 1, providerKey: 'musubix5StableWallClockV1', markerKey,
    providerSha256: hash(provider), markerMetadataSha256: hash(markerMetadata),
    installedNowMatchesDateNow: installedNow === Date.now } };
if (!worker.observation.installedNowMatchesDateNow) fail('worker-scope', 'initial installation identity');
const packet = { schemaVersion: 1, kind: 'test-runtime-worker-v1', runId: provider.executionRunId,
  requestSha256: hash(request), worker, provider, markerMetadata };
const ordered = /** @param {unknown} value @returns {unknown} */ (value) => {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, ordered(v)]));
  return value;
};
const staging = resolve(dirname(requestPath), `.worker-${workerId}.tmp`);
writeFileSync(staging, `${JSON.stringify(ordered(packet))}\n`, { flag: 'wx', mode: 0o600 });
renameSync(staging, resolve(dirname(requestPath), 'worker-acks', `${workerId}.json`));
delete process.env.MUSUBIX5_TEST_RUNTIME_REQUEST;
delete process.env.MUSUBIX5_TEST_RUNTIME_DISPATCH;
inheritClock(provider);

// Native byte comparison avoids per-byte matcher allocations for plain buffers.
// Decorated buffers retain Vitest's recursive property-comparison semantics.
expect.addEqualityTesters([
  /** @param {unknown} left @param {unknown} right */
  function equalPlainBuffers(left, right) {
    if (!Buffer.isBuffer(left) || !Buffer.isBuffer(right)
      || Object.getPrototypeOf(left) !== Buffer.prototype || Object.getPrototypeOf(right) !== Buffer.prototype
      || Object.keys(left).length !== left.length || Object.keys(right).length !== right.length
      || Object.getOwnPropertySymbols(left).some((key) => Object.prototype.propertyIsEnumerable.call(left, key))
      || Object.getOwnPropertySymbols(right).some((key) => Object.prototype.propertyIsEnumerable.call(right, key))) {
      return undefined;
    }
    return left.equals(right);
  },
]);
