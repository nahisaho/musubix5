import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance as nodePerformance } from 'node:perf_hooks';
import {
  clearInterval as nodeClearInterval,
  clearTimeout as nodeClearTimeout,
  setInterval as nodeSetInterval,
  setTimeout as nodeSetTimeout,
} from 'node:timers';
import { expect, inject, it, vi } from 'vitest';
import { canonicalBytes, sha256 } from '../packages/analysis/src/canonical.js';
import {
  acquireChangeLease,
  assertChangeLeaseCurrent,
  releaseChangeLease,
} from '../packages/analysis/src/journal.js';

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

const moduleProvider: unknown = inject('musubix5StableWallClockV1');
const moduleMarker = Object.getOwnPropertyDescriptor(
  globalThis,
  Symbol.for('musubix5.testRuntime.stableWallClock.install.v1'),
);

function record(value: unknown): asserts value is Record<string, unknown> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBe(false);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a stable-runtime data object');
  }
}

/** @id TEST-M5-TEST-CLOCK-TIMERS-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-015
 */
it('TEST-M5-TEST-CLOCK-TIMERS-001 preserves native timers and explicit lease expiry and takeover', async () => {
  expect(moduleProvider, 'stable runtime provider must exist before the test module').toBeDefined();
  expect(moduleMarker, 'stable runtime install marker must exist before the test module').toBeDefined();
  record(moduleProvider);
  expect(Object.keys(moduleProvider).sort()).toEqual([
    'anchor', 'anchorId', 'bootstrapSha256', 'executionRunId', 'inputsSha256',
    'kind', 'profileSha256', 'schemaVersion',
  ]);
  expect(moduleProvider.schemaVersion).toBe(1);
  expect(moduleProvider.kind).toBe('test-runtime-provider-v1');
  expect(moduleProvider.profileSha256)
    .toBe('f9fbe94729722eaaea1f1e49bbaf6c48053ea1ed6a8498a2287dbfe4a20bf06e');
  expect(moduleProvider.anchorId).toBe(sha256(canonicalBytes(moduleProvider.anchor)));
  expect(Object.isFrozen(moduleProvider)).toBe(true);
  expect(Object.isFrozen(moduleProvider.anchor)).toBe(true);
  expect(moduleMarker).toMatchObject({
    enumerable: false, configurable: false, writable: false,
  });
  const marker: unknown = moduleMarker?.value;
  record(marker);
  expect(Object.keys(marker).sort()).toEqual([
    'anchorId', 'bootstrapSha256', 'calibration', 'installedNow',
    'kind', 'profileSha256', 'schemaVersion',
  ]);
  expect(marker).toMatchObject({
    schemaVersion: 1,
    kind: 'test-runtime-install-v1',
    anchorId: moduleProvider.anchorId,
    bootstrapSha256: moduleProvider.bootstrapSha256,
    profileSha256: moduleProvider.profileSha256,
  });
  expect(Object.isFrozen(marker)).toBe(true);
  expect(Object.isFrozen(marker.installedNow)).toBe(true);
  expect(Date.now).toBe(marker.installedNow);

  const dateConstructor = Date;
  const datePrototype = Date.prototype;
  const performanceNow = performance.now;
  const hrtime = process.hrtime;
  const hrtimeBigint = process.hrtime.bigint;
  const wallNow = Date.now;

  expect(setTimeout).toBe(nodeSetTimeout);
  expect(setInterval).toBe(nodeSetInterval);
  expect(clearTimeout).toBe(nodeClearTimeout);
  expect(clearInterval).toBe(nodeClearInterval);
  expect(performance).toBe(nodePerformance);
  expect(Date.toString()).toBe('function Date() { [native code] }');
  expect(new Date(0).toISOString()).toBe('1970-01-01T00:00:00.000Z');

  const started = performance.now();
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
  expect(performance.now() - started).toBeGreaterThanOrEqual(20);

  const root = mkdtempSync(join(tmpdir(), 'musubix5-test-runtime-timers-'));
  execFileSync('git', ['init', '--quiet', root]);
  const epoch = 1_800_000_000_000;
  let now = epoch;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  let lease: Awaited<ReturnType<typeof acquireChangeLease>> | undefined;
  let successor: Awaited<ReturnType<typeof acquireChangeLease>> | undefined;
  try {
    lease = await acquireChangeLease(root, 'CHANGE-0017');
    const owner = JSON.parse(readFileSync(join(lease.path, 'owner.json'), 'utf8')) as {
      expiresAt: number;
    };
    expect(owner.expiresAt).toBe(epoch + 30_000);
    now = epoch + 29_999;
    await assertChangeLeaseCurrent(lease);
    now = epoch + 30_000;
    await expect(assertChangeLeaseCurrent(lease)).rejects.toThrow('LEASE_FENCED');
    successor = await acquireChangeLease(root, 'CHANGE-0017');
    expect(successor.fencingToken).toBeGreaterThan(lease.fencingToken);
    await expect(assertChangeLeaseCurrent(lease)).rejects.toThrow('LEASE_FENCED');
    await assertChangeLeaseCurrent(successor);
  } finally {
    try {
      if (successor) await releaseChangeLease(successor);
      if (lease) await releaseChangeLease(lease);
    } finally {
      clock.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  }

  expect(Date).toBe(dateConstructor);
  expect(Date.prototype).toBe(datePrototype);
  expect(Date.now).toBe(wallNow);
  expect(performance.now).toBe(performanceNow);
  expect(process.hrtime).toBe(hrtime);
  expect(process.hrtime.bigint).toBe(hrtimeBigint);
  expect(setTimeout).toBe(nodeSetTimeout);
  expect(setInterval).toBe(nodeSetInterval);
});
