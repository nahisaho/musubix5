import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('budget actual usage', () => {
  /**
   * @id TEST-M5-BUDGET-003
   * @verifies REQ-M5-BUDGET-003
   */
  it('TEST-M5-BUDGET-003 records one terminal usage and classifies overrun separately', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-budget-usage-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    const { recordBudgetUsage, reserveBudget } =
      await import('../packages/analysis/src/budget-ledger.js');
    const reservation = await reserveBudget(root, {
      changeId: 'CHANGE-0002',
      budgetKey: 'requirements-review',
      role: 'reviewer',
      limit: 5,
      requested: 5,
      invocationKey: 'reviewer:usage',
      idempotencyKey: 'reserve-usage',
    });
    const usage = await recordBudgetUsage(root, {
      changeId: 'CHANGE-0002',
      reservationId: reservation.reservationId,
      invocationKey: 'reviewer:usage',
      actual: 7,
      terminalStatus: 'completed',
      idempotencyKey: 'usage-reviewer-1',
    });

    expect(usage).toMatchObject({
      actual: 7,
      reserved: 5,
      overrun: 2,
      classification: 'reservation-overrun',
    });
    expect(await recordBudgetUsage(root, {
      changeId: 'CHANGE-0002',
      reservationId: reservation.reservationId,
      invocationKey: 'reviewer:usage',
      actual: 7,
      terminalStatus: 'completed',
      idempotencyKey: 'usage-reviewer-1',
    })).toEqual(usage);
  });
});
