import { afterEach, describe, expect, it } from 'vitest';

import { createParallelFixture, type ParallelFixture } from './fixtures/parallel-runtime-fixture.js';

const fixtures: ParallelFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.dispose();
});

describe('CHANGE-0003 generation 5 consumer policy resolution', () => {
  /** @id TEST-M5-PARALLEL-CONSUMER-POLICY-001
   * @verifies REQ-M5-PARALLEL-001 REQ-M5-PARALLEL-013
   */
  it('TEST-M5-PARALLEL-CONSUMER-POLICY-001 resolves Parallel-Policy from the approved active design artifact', async () => {
    const fixture = await createParallelFixture({
      consumerDesignPath: '.musubix/features/consumer-owned-feature/design.md',
    });
    fixtures.push(fixture);
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');

    await expect(runtime.validateParallelPlanFile(fixture.root, fixture.planFile))
      .resolves.toMatchObject({
        binding: { changeId: 'CHANGE-0003', generation: 5 },
        concurrency: 1,
      });
  });

  /** @id TEST-M5-PARALLEL-CONSUMER-POLICY-DIAGNOSTIC-001
   * @verifies REQ-M5-PARALLEL-001 REQ-M5-PARALLEL-013
   */
  it.each([
    ['missing', '# Design without a policy line\n'],
    ['malformed', 'Parallel-Policy: {"schemaVersion":1}\n'],
  ])(
    'TEST-M5-PARALLEL-CONSUMER-POLICY-DIAGNOSTIC-001 maps %s approved policy to PARALLEL_PLAN_STALE',
    async (_case, policySource) => {
      const fixture = await createParallelFixture({
        consumerDesignPath: '.musubix/features/consumer-owned-feature/design.md',
        policySource,
      });
      fixtures.push(fixture);
      const runtime = await import('../packages/analysis/src/parallel-runtime.js');

      await expect(runtime.validateParallelPlanFile(fixture.root, fixture.planFile))
        .rejects.toThrow(/^PARALLEL_PLAN_STALE:/);
    },
  );
});
