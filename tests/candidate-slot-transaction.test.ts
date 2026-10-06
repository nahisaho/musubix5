import { createHook } from 'node:async_hooks';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import {
  acquireCandidateSlots, acquireCandidateFixtureSlotSync, createCandidateSlotLedger,
  releaseCandidateSlots, releaseCandidateFixtureSlotSync, validateCandidateSlotLedger,
} from '../packages/analysis/src/candidate-execution-plan.js';

/** @id TEST-M5-CI-SLOT-TRANSACTION-001
 * @verifies REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-002
 * @design DES-M5-CI-EFFICIENCY-002
 */
it('TEST-M5-CI-SLOT-TRANSACTION-001 never yields while owning a transaction and preserves a contended live owner', async () => {
  const root = await mkdtemp(join(process.cwd(), '.musubix/cache/slot-transaction-'));
  const ledger = await createCandidateSlotLedger(root, 'transaction-test', 16);
  const lock = join(ledger.root, 'lock');
  const owner = { nonce: ledger.nonce, pid: process.pid, partition: 'root' };
  const first = await acquireCandidateSlots(ledger, owner, 4);
  const suspensions: string[] = [];
  const hook = createHook({
    init(_id, type) {
      if (type === 'FSREQPROMISE' && existsSync(lock)) suspensions.push(type);
    },
  });
  try {
    hook.enable();
    try {
      await releaseCandidateSlots(ledger, first);
      const leases = await Promise.all([
        acquireCandidateSlots(ledger, { ...owner, partition: 'one' }, 4),
        acquireCandidateSlots(ledger, { ...owner, partition: 'two' }, 4),
      ]);
      const fixture = acquireCandidateFixtureSlotSync(ledger, 'fixture', 8);
      await expect(acquireCandidateSlots(ledger, owner, 1)).rejects.toThrow(/capacity/);
      releaseCandidateFixtureSlotSync(ledger, fixture);
      await Promise.all(leases.map(lease => releaseCandidateSlots(ledger, lease)));
    } finally { hook.disable(); }
    expect(suspensions, 'a live transaction must finish before yielding to native synchronous counting').toEqual([]);
    expect((await validateCandidateSlotLedger(ledger)).maximum).toBe(16);

    const lease = await acquireCandidateSlots(ledger, owner, 1);
    await mkdir(lock);
    const marker = join(lock, 'live-owner.json');
    await writeFile(marker, JSON.stringify(owner));
    const before = readFileSync(join(ledger.root, `slot-${lease.slots[0]}`, 'owner.json'));
    await expect(releaseCandidateSlots(ledger, lease)).rejects.toThrow(/transaction|deadline/);
    expect(JSON.parse(await readFile(marker, 'utf8'))).toEqual(owner);
    expect(readFileSync(join(ledger.root, `slot-${lease.slots[0]}`, 'owner.json'))).toEqual(before);
    await rm(lock, { recursive: true });
    await releaseCandidateSlots(ledger, lease);
    expect((await validateCandidateSlotLedger(ledger)).maximum).toBe(16);
  } finally { hook.disable(); await rm(root, { recursive: true, force: true }); }
}, 15_000);

/** @id TEST-M5-CI-NATIVE-OWNER-SETTLE-001
 * @verifies REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-004
 * @design DES-M5-CI-EFFICIENCY-002 DES-M5-CI-EFFICIENCY-006
 */
it('TEST-M5-CI-NATIVE-OWNER-SETTLE-001 waits for terminal native callbacks before declaring a leak', async () => {
  const root = await mkdtemp(join(process.cwd(), '.musubix/cache/native-owner-settle-'));
  const ledger = await createCandidateSlotLedger(root, 'native-owner-settle', 16);
  const lease = await acquireCandidateSlots(ledger, {
    nonce: ledger.nonce, pid: process.pid, partition: 'nested-child',
  }, 1);
  const descriptorPath = join(ledger.root, `native-${lease.leaseId}.json`);
  const descriptor = {
    schemaVersion: 1, nonce: ledger.nonce, leaseId: lease.leaseId,
    callerPid: process.pid, childPid: process.pid, status: 'launched',
  };
  await writeFile(descriptorPath, JSON.stringify(descriptor));
  const terminal = (async () => {
    await delay(50);
    await writeFile(descriptorPath, JSON.stringify({ ...descriptor, status: 'terminated' }));
    await releaseCandidateSlots(ledger, lease);
  })();
  try {
    expect((await validateCandidateSlotLedger(ledger)).maximum).toBe(1);
    await terminal;
  } finally {
    await terminal;
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-CI-SLOT-OBSERVATION-BOUNDED-001
 * @verifies REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-004
 * @design DES-M5-CI-EFFICIENCY-002 DES-M5-CI-EFFICIENCY-006
 */
it('TEST-M5-CI-SLOT-OBSERVATION-BOUNDED-001 reads large slot ledgers without unbounded open files', async () => {
  const source = await readFile('packages/analysis/src/candidate-execution-plan.ts', 'utf8');
  expect(source).toContain('for (const name of names.filter((name) => /^observation-/.test(name)))');
  expect(source).not.toContain("Promise.all(names.filter((name) => /^observation-/.test(name))");
});
