import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import * as journal from '../packages/analysis/src/journal.js';
import { withMultiChangeProjectionWrite } from '../packages/analysis/src/candidate-state.js';

type Hold = (root: string, operation: (lease: journal.ChangeLease) => Promise<void>) => Promise<void>;

/** @id TEST-M5-CONCURRENCY-LEASE-CONTRACT-001
 * @verifies REQ-M5-MULTI-CHANGE-006 REQ-M5-LIFECYCLE-006
 * @design DES-M5-004 DES-M5-MULTI-CHANGE-003 DES-M5-MULTI-CHANGE-008
 */
it('TEST-M5-CONCURRENCY-LEASE-CONTRACT-001 preserves real ten-second acquisition, lock order, renewal, TTL, retry and durable fencing', async (context) => {
  const wall = vi.spyOn(Date, 'now');
  const intervals = vi.spyOn(globalThis, 'setInterval');
  const timeouts = vi.spyOn(globalThis, 'setTimeout');
  const timings: Array<{ kind: string; elapsedMs: number }> = [];
  const rows: Array<{ kind: string; diagnostic: string; hold: Hold }> = [
    { kind: 'change', diagnostic: 'CANDIDATE_LEASE_BUSY', hold: (root, operation) => journal.withChangeLease(root, 'CHANGE-0014', operation) },
    { kind: 'projection', diagnostic: 'CHANGE_PROJECTION_LEASE_BUSY', hold: journal.withChangeProjectionLease },
    { kind: 'append', diagnostic: 'CANDIDATE_JOURNAL_BUSY', hold: journal.withOrderLease },
  ];
  try {
    await Promise.all(rows.map(async ({ kind, diagnostic, hold }) => {
      const root = mkdtempSync(join(tmpdir(), 'musubix5-concurrency-lease-'));
      execFileSync('git', ['init', '--quiet', root]);
      let release!: () => void;
      let ready!: (lease: journal.ChangeLease) => void;
      const acquired = new Promise<journal.ChangeLease>((done) => { ready = done; });
      const barrier = new Promise<void>((done) => { release = done; });
      const blocker = hold(root, async (lease) => { ready(lease); await barrier; });
      const lease = await acquired;
      const path = join(lease.path, 'owner.json');
      const before = JSON.parse(readFileSync(path, 'utf8'));
      try {
        expect(wall.mock.results.some((result) => result.type === 'return' && before.expiresAt - result.value === 30_000)).toBe(true);
        const start = performance.now();
        let settled = false;
        const waiting = withMultiChangeProjectionWrite(root, ['CHANGE-0015', 'CHANGE-0014'], async () => {
          throw new Error('Unexpected acquisition while blocker is live.');
        }).then(() => 'unexpected success', (error: Error) => error.message).finally(() => { settled = true; });
        await new Promise((done) => setTimeout(done, 150));
        expect(settled).toBe(false);
        if (kind !== 'change') {
          expect(await journal.hasLiveChangeLease(root, 'CHANGE-0014')).toBe(true);
          expect(await journal.hasLiveChangeLease(root, 'CHANGE-0015')).toBe(true);
        }
        if (kind === 'append') {
          expect(existsSync(join(root, '.git/musubix5/leases/change-projection/owner.json'))).toBe(true);
        }
        expect(await waiting).toContain(diagnostic);
        const elapsedMs = performance.now() - start;
        timings.push({ kind, elapsedMs });
        expect(elapsedMs).toBeGreaterThanOrEqual(10_000);
        expect(elapsedMs).toBeLessThan(12_000);
        const renewalDeadline = performance.now() + 1_000;
        while (JSON.parse(readFileSync(path, 'utf8')).expiresAt === before.expiresAt) {
          if (performance.now() >= renewalDeadline) throw new Error('Ten-second renewal did not persist.');
          await new Promise((done) => setTimeout(done, 25));
        }
        const renewed = JSON.parse(readFileSync(path, 'utf8'));
        expect(renewed.fencingToken).toBe(before.fencingToken);
        expect(wall.mock.results.some((result) => result.type === 'return' && renewed.expiresAt - result.value === 30_000)).toBe(true);
        writeFileSync(path, JSON.stringify({ ...renewed, expiresAt: 0 }));
        await expect(journal.writeAuthorizedJson(root, 'forbidden.json', {}, () => journal.assertChangeLeaseCurrent(lease)))
          .rejects.toThrow('LEASE_FENCED');
        expect(existsSync(join(root, 'forbidden.json'))).toBe(false);
        await hold(root, async (replacement) => {
          expect(replacement.fencingToken).toBeGreaterThan(lease.fencingToken);
          await expect(journal.assertChangeLeaseCurrent(lease)).rejects.toThrow('LEASE_FENCED');
          await journal.assertChangeLeaseCurrent(replacement);
        });
      } finally {
        release();
        await blocker;
        rmSync(root, { recursive: true, force: true });
      }
    }));
    expect(intervals.mock.calls.every((call) => call[1] === 10_000)).toBe(true);
    expect(timeouts.mock.calls.some((call) => call[1] === 25)).toBe(true);
    Object.assign(context.task.meta, { acquisitionTimings: timings });
  } finally {
    timeouts.mockRestore();
    intervals.mockRestore();
    wall.mockRestore();
  }
});
