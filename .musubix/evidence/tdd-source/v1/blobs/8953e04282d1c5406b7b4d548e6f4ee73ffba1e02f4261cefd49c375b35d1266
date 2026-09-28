import { dirname, resolve } from 'node:path';
import { exists, readText, within } from './files.js';
import { classifyParallelTddProvenance } from './parallel.js';
import { runProcess } from './process.js';
import type { TddCycle } from './tdd-types.js';

interface ParallelTddEvidence {
  cycles: TddCycle[];
}

interface ParallelIntegrationEvidence {
  integrations?: Array<{
    attempt: number;
    worktree?: string;
    provenance?: {
      status: 'provisional' | 'verified';
      integrationCommit: string;
    };
  }>;
}

interface ParallelAttemptIdentity {
  planId?: string;
  assignmentId: string;
  attempt: number;
  startCommit: string;
  head: string;
}

interface ParallelAttemptRecord extends ParallelAttemptIdentity {
  planId: string;
  state: string;
}

function attemptKey(assignmentId: string, attempt: number): string {
  return `${assignmentId}:${attempt}`;
}

/** @id CODE-M5-WAVE1-TDD-LINEAGE-001
 * @implements REQ-M5-COMPAT-013 REQ-M5-WAVE1-TDD-001 REQ-M5-WAVE1-TDD-002
 * @design DES-M5-PARALLEL-006 DES-M5-011
 */
export async function authoritativeParallelTddAttemptKeys(
  attempts: ParallelAttemptRecord[],
  consumed: ParallelAttemptIdentity,
  isAncestor: (ancestor: string, descendant: string) => Promise<boolean>,
): Promise<Set<string>> {
  const completed = attempts.filter((entry) =>
    (consumed.planId === undefined || entry.planId === consumed.planId)
    &&
    entry.assignmentId === consumed.assignmentId
    && entry.state === 'completed'
    && entry.attempt <= consumed.attempt);
  const identitiesByAttempt = new Map<number, Set<string>>();
  for (const entry of completed) {
    const identities = identitiesByAttempt.get(entry.attempt) ?? new Set<string>();
    identities.add(`${entry.startCommit}:${entry.head}`);
    identitiesByAttempt.set(entry.attempt, identities);
  }
  const unambiguous = completed.filter((entry) => {
    return identitiesByAttempt.get(entry.attempt)?.size === 1;
  });
  const consumedRecord = unambiguous.find((entry) =>
    entry.attempt === consumed.attempt
    && entry.startCommit === consumed.startCommit
    && entry.head === consumed.head);
  if (!consumedRecord) return new Set();

  const authoritative = new Set([attemptKey(consumed.assignmentId, consumed.attempt)]);
  for (const entry of unambiguous) {
    if (entry === consumedRecord || entry.head === consumed.head) continue;
    if (await isAncestor(entry.head, consumed.startCommit)) {
      authoritative.add(attemptKey(entry.assignmentId, entry.attempt));
    }
  }
  return authoritative;
}

export function selectParallelIntegrationEvidenceRoot(input: {
  controlRoot: string;
  evaluationRoot: string;
  integrationWorktree: string;
  status: 'provisional' | 'verified';
  currentCommit: string | null;
  integrationCommit: string;
}): string {
  const evaluationRoot = resolve(input.evaluationRoot);
  return input.status === 'provisional'
    && evaluationRoot === resolve(input.integrationWorktree)
    && input.currentCommit === input.integrationCommit
    ? resolve(input.controlRoot)
    : evaluationRoot;
}

export async function resolveParallelIntegrationEvidenceRoot(
  root: string,
  purpose: string,
): Promise<string> {
  const evaluationRoot = resolve(root);
  if (purpose !== 'readiness') return evaluationRoot;
  const commonDirectory = await runProcess(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd: evaluationRoot, timeoutMs: 10_000 },
  );
  if (commonDirectory.status !== 'completed') return evaluationRoot;
  const controlRoot = dirname(commonDirectory.stdout.trim());
  if (resolve(controlRoot) === evaluationRoot) return evaluationRoot;
  const path = '.musubix/evidence/parallel.json';
  if (!await exists(within(controlRoot, path))) return evaluationRoot;
  const store = JSON.parse(await readText(controlRoot, path)) as ParallelIntegrationEvidence;
  const integration = store.integrations
    ?.filter((entry) => resolve(entry.worktree ?? '') === evaluationRoot && entry.provenance)
    .sort((left, right) => right.attempt - left.attempt)[0];
  if (!integration?.provenance) return evaluationRoot;
  const currentCommit = await runProcess(
    'git',
    ['rev-parse', 'HEAD'],
    { cwd: evaluationRoot, timeoutMs: 10_000 },
  );
  return selectParallelIntegrationEvidenceRoot({
    controlRoot,
    evaluationRoot,
    integrationWorktree: integration.worktree ?? '',
    status: integration.provenance.status,
    currentCommit: currentCommit.status === 'completed' ? currentCommit.stdout.trim() : null,
    integrationCommit: integration.provenance.integrationCommit,
  });
}

export function classifyParallelTddIntegrationContext(input: {
  consumed: boolean;
  status: 'provisional' | 'verified';
  purpose: string;
  evaluationRoot: string;
  integrationWorktree: string;
  currentCommit: string | null;
  integrationCommit: string;
}): 'pass' | 'PARALLEL_TDD_UNCONSUMED' {
  const exactIntegrationContext = input.status === 'provisional'
    && resolve(input.evaluationRoot) === resolve(input.integrationWorktree)
    && input.currentCommit === input.integrationCommit;
  return classifyParallelTddProvenance({
    consumed: input.consumed,
    status: input.status,
    purpose: exactIntegrationContext ? 'integration-verification' : input.purpose,
  });
}

function cycleTerminalOrder(cycle: TddCycle): number {
  return Math.max(
    cycle.red.order ?? -1,
    cycle.green?.order ?? -1,
    cycle.refactor?.order ?? -1,
  );
}

export function supersededParallelTddCycles(
  cycles: TddCycle[],
  authoritativeCycleIds: ReadonlySet<string>,
): Set<string> {
  const superseded = new Set<string>();
  for (const cycle of cycles) {
    if (!cycle.cycleId || !cycle.parallel) continue;
    const replacement = cycles.find((candidate) =>
      candidate !== cycle
      && candidate.cycleId !== undefined
      && authoritativeCycleIds.has(candidate.cycleId)
      && candidate.red.valid
      && candidate.green?.valid
      && candidate.changeId === cycle.changeId
      && (candidate.generation ?? 1) === (cycle.generation ?? 1)
      && candidate.requirementId === cycle.requirementId
      && candidate.parallel?.planId === cycle.parallel!.planId
      && candidate.parallel.assignmentId === cycle.parallel!.assignmentId
      && cycleTerminalOrder(candidate) > cycleTerminalOrder(cycle));
    if (replacement) superseded.add(cycle.cycleId);
  }
  return superseded;
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
    evidenceRoot?: string;
  },
): Promise<'pass' | 'PARALLEL_TDD_UNCONSUMED' | null> {
  const evidenceRoot = input.evidenceRoot
    ?? await resolveParallelIntegrationEvidenceRoot(root, input.purpose);
  const tddPath = '.musubix/evidence/tdd.json';
  const tdd = await exists(within(evidenceRoot, tddPath))
    ? JSON.parse(await readText(evidenceRoot, tddPath)) as ParallelTddEvidence
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
  if (!await exists(within(evidenceRoot, path))) return 'PARALLEL_TDD_UNCONSUMED';
  const store = JSON.parse(await readText(evidenceRoot, path)) as {
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
      worktree?: string;
      provenance?: {
        status: 'provisional' | 'verified';
        integrationCommit: string;
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
  const integration = store.integrations
    ?.filter((entry) => entry.planId === identity.planId && entry.provenance)
    .sort((left, right) => right.attempt - left.attempt)[0];
  const provenance = integration?.provenance;
  const consumedAssignment = provenance?.assignments.find((entry) =>
    entry.assignmentId === identity.assignmentId);
  const lineage = consumedAssignment
    ? await authoritativeParallelTddAttemptKeys(
        (store.attempts ?? [])
          .filter((entry): entry is typeof entry & { startCommit: string; head: string } =>
            entry.planId === identity.planId
            && typeof entry.startCommit === 'string'
            && typeof entry.head === 'string'),
        { ...consumedAssignment, planId: identity.planId },
        async (ancestor, descendant) => {
          const result = await runProcess(
            'git',
            ['merge-base', '--is-ancestor', ancestor, descendant],
            { cwd: root, timeoutMs: 10_000 },
          );
          return result.status === 'completed' && result.exitCode === 0;
        },
      )
    : new Set<string>();
  const consumed = lineage.has(attemptKey(identity.assignmentId, identity.attempt));
  if (!consumed) return 'PARALLEL_TDD_UNCONSUMED';
  const currentCommit = provenance?.status === 'provisional' && integration?.worktree
    ? await runProcess('git', ['rev-parse', 'HEAD'], { cwd: root, timeoutMs: 10_000 })
    : null;
  return classifyParallelTddIntegrationContext({
    consumed,
    status: provenance?.status ?? 'provisional',
    purpose: input.purpose,
    evaluationRoot: root,
    integrationWorktree: integration?.worktree ?? '',
    currentCommit: currentCommit?.status === 'completed' ? currentCommit.stdout.trim() : null,
    integrationCommit: provenance?.integrationCommit ?? '',
  });
}
