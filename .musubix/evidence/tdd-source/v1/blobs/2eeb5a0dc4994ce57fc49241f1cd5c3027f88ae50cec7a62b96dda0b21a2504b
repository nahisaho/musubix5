import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';

const classificationCounts = new Map<string, number>();

vi.mock('../packages/analysis/src/parallel-tdd-evidence.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../packages/analysis/src/parallel-tdd-evidence.js')
  >();
  return {
    ...actual,
    classifyParallelTddEvidence: async (
      ...args: Parameters<typeof actual.classifyParallelTddEvidence>
    ): Promise<Awaited<ReturnType<typeof actual.classifyParallelTddEvidence>>> => {
      const [root, context] = args;
      const key = JSON.stringify([
        root,
        context.changeId,
        context.generation,
        context.requirementId,
        context.cycleId,
        context.purpose,
        context.evidenceRoot ?? null,
      ]);
      classificationCounts.set(key, (classificationCounts.get(key) ?? 0) + 1);
      return actual.classifyParallelTddEvidence(...args);
    },
  };
});

function duplicateClassifications(): Array<{ context: string; count: number }> {
  return [...classificationCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([context, count]) => ({ context, count }));
}

async function validateWithFreshLedger(
  validateChangeEvidence: (root: string) => Promise<{ present: boolean }>,
  root: string,
): Promise<void> {
  classificationCounts.clear();
  const validation = await validateChangeEvidence(root);
  expect(validation.present).toBe(true);
  expect(classificationCounts.size).toBeGreaterThan(0);
  expect(duplicateClassifications()).toEqual([]);
}

/** @id TEST-M5-CHANGE-CURRENT-SELECTION-CACHE-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-005 DES-M5-011
 */
it('TEST-M5-CHANGE-CURRENT-SELECTION-CACHE-001 classifies each current-cycle context once per validation', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const { validateChangeEvidence } = await import('../packages/analysis/src/change.js');

  await validateWithFreshLedger(validateChangeEvidence, root);
  await validateWithFreshLedger(validateChangeEvidence, root);
}, 180000);
