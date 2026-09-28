import { describe, expect, it } from 'vitest';

describe('Planner structured output validation', () => {
  /**
   * @id TEST-M5-PLANNER-001
   * @verifies REQ-M5-PLANNER-001 REQ-M5-PLANNER-003
   */
  it('TEST-M5-PLANNER-001 returns path diagnostics and safe retry context', async () => {
    const { processPlannerOutput } =
      await import('../packages/analysis/src/planner-output.js');
    const schema = {
      type: 'object',
      required: ['priorities', 'requirements'],
      properties: {
        priorities: { type: 'array', items: { type: 'string' } },
        requirements: { type: 'array', items: { type: 'object' } },
      },
    } as const;
    const invalid = processPlannerOutput({
      raw: '{"requirements":[],"token":"secret-value"}',
      schema,
      ordinal: 1,
      secrets: ['secret-value'],
      previousInvalidIdentity: null,
    });

    expect(invalid).toMatchObject({
      status: 'retry',
      ordinal: 1,
      diagnostics: [{
        code: 'PLANNER_REQUIRED_FIELD',
        path: '$.priorities',
      }],
      retryContext: {
        invalidOutputOrdinal: 1,
      },
    });
    expect(JSON.stringify(invalid)).not.toContain('secret-value');
    expect(invalid.rawSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(invalid.normalizedSha256).toMatch(/^[a-f0-9]{64}$/);

    expect(processPlannerOutput({
      raw: '{"priorities":["must"],"requirements":[]}',
      schema,
      ordinal: 2,
      secrets: [],
      previousInvalidIdentity: invalid.invalidIdentity,
    })).toMatchObject({
      status: 'valid',
      value: { priorities: ['must'], requirements: [] },
      diagnostics: [],
    });
  });
});
