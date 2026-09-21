import { describe, expect, it } from 'vitest';

describe('verified-auto budget limits', () => {
  /**
   * @id TEST-M5-BUDGET-005
   * @verifies REQ-M5-BUDGET-005
   */
  it('TEST-M5-BUDGET-005 fails closed for missing or non-positive limits', async () => {
    const { validateBudgetLimits } = await import('../packages/analysis/src/budget-ledger.js');
    for (const limits of [
      {},
      { reviewer: 0, repairPlanner: 1, producerRepairs: 1 },
      { reviewer: 1, repairPlanner: -1, producerRepairs: 1 },
      { reviewer: 1, repairPlanner: 1, producerRepairs: Number.NaN },
    ]) {
      expect(validateBudgetLimits(limits)).toMatchObject({
        valid: false,
        terminalReason: 'invalid-budget-configuration',
      });
    }
    expect(validateBudgetLimits({
      reviewer: 1,
      repairPlanner: 1,
      producerRepairs: 1,
    })).toEqual({ valid: true, terminalReason: null });
  });
});
