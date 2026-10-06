import { createHook } from 'node:async_hooks';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
