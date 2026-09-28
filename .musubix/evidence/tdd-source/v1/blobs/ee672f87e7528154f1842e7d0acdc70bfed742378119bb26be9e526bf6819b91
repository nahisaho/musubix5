import { describe, expect, it } from 'vitest';

describe('Planner retry identity', () => {
  /**
   * @id TEST-M5-PLANNER-002
   * @verifies REQ-M5-PLANNER-002 REQ-M5-PLANNER-004
   */
  it('TEST-M5-PLANNER-002 separates retry and repair and stops repeated invalid output', async () => {
    const {
      processPlannerOutput,
      producerRepairIdentity,
      roleRetryIdentity,
    } = await import('../packages/analysis/src/planner-output.js');
    expect(roleRetryIdentity('planner:requirements', 2))
      .not.toBe(producerRepairIdentity('requirements:CHANGE-0002', 2));
    const schema = {
      type: 'object',
      required: ['priorities'],
      properties: { priorities: { type: 'array', items: { type: 'string' } } },
    } as const;
    const first = processPlannerOutput({
      raw: '{}',
      schema,
      ordinal: 1,
      secrets: [],
      previousInvalidIdentity: null,
    });
    const repeated = processPlannerOutput({
      raw: '{}',
      schema,
      ordinal: 2,
      secrets: [],
      previousInvalidIdentity: first.invalidIdentity,
    });

    expect(repeated).toMatchObject({
      status: 'terminal',
      terminalReason: 'repeated-invalid-output',
      ordinal: 2,
    });
  });
});
