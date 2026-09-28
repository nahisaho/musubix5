import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('current change completeness', () => {
  /**
   * @id TEST-M5-QUALITY-COMPLETENESS-001
   * @verifies REQ-M5-EVIDENCE-004 REQ-M5-TDD-004 REQ-M5-QUALITY-001
   */
  it('TEST-M5-QUALITY-COMPLETENESS-001 uses authoritative trace links and current TDD cycles', async () => {
    const { validateChangeCompleteness } =
      await import('../packages/analysis/src/change.js');
    const root = fileURLToPath(new URL('..', import.meta.url));
    const validation = await validateChangeCompleteness(root);

    expect(validation.diagnostics.filter((diagnostic) =>
      diagnostic.code === 'CHANGE_COMPLETENESS_TEST'
      || diagnostic.code === 'CHANGE_COMPLETENESS_TDD'
      || diagnostic.code === 'CHANGE_COMPLETENESS_ACCEPTANCE')).toEqual([]);
  });
});
