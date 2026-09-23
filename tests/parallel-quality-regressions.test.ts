import { describe, expect, it } from 'vitest';

describe('CHANGE-0003 quality regressions', () => {
  /** @id TEST-M5-PARALLEL-GRAPH-ACYCLIC-001
   * @verifies REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-013
   */
  it('TEST-M5-PARALLEL-GRAPH-ACYCLIC-001 keeps parallel TDD provenance dependencies acyclic', async () => {
    const { graphGate, indexGraph } = await import('../packages/analysis/src/graph.js');
    const graph = await indexGraph('.', false);
    const result = graphGate(graph, { forbidCycles: true, rules: [] });
    expect(result.cycles).not.toContainEqual([
      'packages/analysis/src/change-evidence.ts',
      'packages/analysis/src/tdd-cycle-resolver.ts',
      'packages/analysis/src/tdd.ts',
    ]);
    expect(result.valid).toBe(true);
  });

  /** @id TEST-M5-PARALLEL-RELEASE-NONPASS-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-PARALLEL-013
   */
  it('TEST-M5-PARALLEL-RELEASE-NONPASS-001 classifies incomplete release approval as a non-pass diagnostic', async () => {
    const approval = await import('../packages/analysis/src/approval.js');
    const classifyReleaseApprovalDiagnostic = (
      approval as unknown as Record<string, unknown>
    ).classifyReleaseApprovalDiagnostic;
    expect(classifyReleaseApprovalDiagnostic).toBeTypeOf('function');
    expect((classifyReleaseApprovalDiagnostic as (code: string) => boolean)(
      'CHANGE_GENERATION_INCOMPLETE',
    )).toBe(true);
  });
});
