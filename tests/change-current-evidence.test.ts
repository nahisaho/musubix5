import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('current change evidence validation', () => {
  /**
   * @id TEST-M5-EVIDENCE-CURRENT-001
   * @verifies REQ-M5-EVIDENCE-005 REQ-M5-TDD-001 REQ-M5-TDD-002 REQ-M5-TDD-003 REQ-M5-TDD-004 REQ-M5-BOOTSTRAP-001 REQ-M5-BOOTSTRAP-002 REQ-M5-BOOTSTRAP-003 REQ-M5-BOOTSTRAP-004 REQ-M5-COMPAT-001 REQ-M5-COMPAT-013
   */
  it('TEST-M5-EVIDENCE-CURRENT-001 ignores superseded invalid cycles and accepts concrete outcomes', async () => {
    const {
      hasMeasurableAcceptance,
      validateChangeEvidence,
    } = await import('../packages/analysis/src/change.js');
    const root = resolve(new URL('..', import.meta.url).pathname);
    const validation = await validateChangeEvidence(root);
    const staleHistoryCodes = new Set([
      'CHANGE_TEST_CHANGED_AFTER_RED',
      'CHANGE_ORDER_MIGRATION_REQUIRED',
    ]);

    expect(validation.diagnostics.filter((diagnostic) =>
      staleHistoryCodes.has(diagnostic.code))).toEqual([]);
    for (const acceptance of [
      'Producer repair cannot modify approved normative files.',
      'Crash and resume preserve one ordered history.',
      'Retries use separate identities, counters, and budgets.',
      'Repeated clean runs produce identical normalized evidence digests.',
      'Each external operation records its exact candidate identity.',
    ]) {
      expect(hasMeasurableAcceptance(acceptance)).toBe(true);
    }
    expect(hasMeasurableAcceptance('TODO')).toBe(false);
  });
});
