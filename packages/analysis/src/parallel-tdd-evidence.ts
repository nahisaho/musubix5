import { exists, readText, within } from './files.js';
import { classifyParallelTddProvenance } from './parallel.js';

interface ParallelTddCycle {
  cycleId?: string;
  requirementId: string;
  parallel?: {
    planId: string;
    assignmentId: string;
    attempt: number;
    worktree: string;
    startCommit: string;
  };
}

interface ParallelTddEvidence {
  cycles: ParallelTddCycle[];
}

export async function classifyParallelTddEvidence(
  root: string,
  input: {
    changeId: string;
    generation: number;
    planId?: string;
    assignmentId?: string;
    attempt?: number;
    requirementId: string;
    cycleId: string | null;
    purpose: string;
  },
): Promise<'pass' | 'PARALLEL_TDD_UNCONSUMED' | null> {
  const tddPath = '.musubix/evidence/tdd.json';
  const tdd = await exists(within(root, tddPath))
    ? JSON.parse(await readText(root, tddPath)) as ParallelTddEvidence
    : null;
  const cycle = tdd?.cycles.find((entry) =>
    entry.cycleId === input.cycleId && entry.requirementId === input.requirementId);
  if (!cycle?.parallel) {
    return input.planId || input.assignmentId || input.attempt
      ? 'PARALLEL_TDD_UNCONSUMED'
      : null;
  }
  const identity = cycle.parallel;
  if ((input.planId !== undefined && input.planId !== identity.planId)
    || (input.assignmentId !== undefined && input.assignmentId !== identity.assignmentId)
    || (input.attempt !== undefined && input.attempt !== identity.attempt)) {
    return 'PARALLEL_TDD_UNCONSUMED';
  }
  const path = '.musubix/evidence/parallel.json';
  if (!await exists(within(root, path))) return 'PARALLEL_TDD_UNCONSUMED';
  const store = JSON.parse(await readText(root, path)) as {
    plans?: Array<{ planId: string; binding?: { changeId?: string; generation?: number } }>;
    attempts?: Array<{
      planId: string;
      assignmentId: string;
      attempt: number;
      state: string;
      worktree?: string;
      startCommit?: string;
      head?: string;
      tdd?: Array<{ requirementId: string; cycleId: string | null }>;
    }>;
    integrations?: Array<{
      planId: string;
      attempt: number;
      provenance?: {
        status: 'provisional' | 'verified';
        assignments: Array<{
          assignmentId: string;
          attempt: number;
          startCommit: string;
          head: string;
        }>;
      };
    }>;
  };
  const plan = store.plans?.find((entry) =>
    entry.planId === identity.planId
    && entry.binding?.changeId === input.changeId
    && entry.binding.generation === input.generation);
  const attempt = store.attempts?.find((entry) =>
    entry.planId === identity.planId
    && entry.assignmentId === identity.assignmentId
    && entry.attempt === identity.attempt
    && entry.state === 'completed'
    && entry.worktree === identity.worktree
    && entry.startCommit === identity.startCommit
    && entry.tdd?.some((entry) =>
      entry.requirementId === input.requirementId && entry.cycleId === input.cycleId));
  if (!plan || !attempt) return 'PARALLEL_TDD_UNCONSUMED';
  const provenance = store.integrations
    ?.filter((entry) => entry.planId === identity.planId && entry.provenance)
    .sort((left, right) => right.attempt - left.attempt)[0]?.provenance;
  const consumed = provenance?.assignments.some((entry) =>
    entry.assignmentId === identity.assignmentId
    && entry.attempt === identity.attempt
    && entry.head === attempt.head
    && entry.startCommit === identity.startCommit) ?? false;
  if (!consumed) return 'PARALLEL_TDD_UNCONSUMED';
  return classifyParallelTddProvenance({
    consumed,
    status: provenance?.status ?? 'provisional',
    purpose: input.purpose,
  });
}
