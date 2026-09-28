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

describe('budget reservation ordering', () => {
  /**
   * @id TEST-M5-BUDGET-001
   * @verifies REQ-M5-BUDGET-001 REQ-M5-BUDGET-002 REQ-M5-BUDGET-004
   */
  it('TEST-M5-BUDGET-001 binds accepted reservations before counters or invocation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-budget-reservation-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    const { reserveBudget } = await import('../packages/analysis/src/budget-ledger.js');

    const accepted = await reserveBudget(root, {
      changeId: 'CHANGE-0002',
      budgetKey: 'design-review',
      role: 'reviewer',
      limit: 10,
      requested: 6,
      invocationKey: 'reviewer:1',
      idempotencyKey: 'reserve-reviewer-1',
    });
    expect(accepted).toMatchObject({
      status: 'reserved',
      order: 1,
      invocationKey: 'reviewer:1',
      attemptConsumed: false,
      nonceConsumed: false,
    });
    expect(await reserveBudget(root, {
      changeId: 'CHANGE-0002',
      budgetKey: 'design-review',
      role: 'reviewer',
      limit: 10,
      requested: 6,
      invocationKey: 'reviewer:1',
      idempotencyKey: 'reserve-reviewer-1',
    })).toEqual(accepted);

    expect(await reserveBudget(root, {
      changeId: 'CHANGE-0002',
      budgetKey: 'design-review',
      role: 'reviewer',
      limit: 10,
      requested: 5,
      invocationKey: 'reviewer:2',
      idempotencyKey: 'reserve-reviewer-2',
    })).toMatchObject({
      status: 'budget-exhausted',
      attemptConsumed: false,
      nonceConsumed: false,
    });
    expect(await reserveBudget(root, {
      changeId: 'CHANGE-0002',
      budgetKey: 'design-repair',
      role: 'repair-planner',
      limit: 4,
      requested: 4,
      invocationKey: 'repair:1',
      idempotencyKey: 'reserve-repair-1',
    })).toMatchObject({
      status: 'reserved',
      repairConsumed: false,
      invocationKey: 'repair:1',
    });
  });
});
