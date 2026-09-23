import { realpath } from 'node:fs/promises';
import {
  basename, dirname, parse, resolve,
} from 'node:path';
import { digest, portable } from './files.js';

export const PARALLEL_DIAGNOSTICS = [
  'PARALLEL_PLAN_EXISTS',
  'PARALLEL_PLAN_STALE',
  'PARALLEL_STALE_WORKTREES_PRESENT',
  'PARALLEL_PLAN_INVALID',
  'PARALLEL_PLAN_OWNERSHIP_OVERLAP',
  'PARALLEL_CONCURRENCY_INVALID',
  'PARALLEL_CONCURRENCY_LIMIT',
  'PARALLEL_WORKTREE_CONFLICT',
  'PARALLEL_RESULT_OWNERSHIP',
  'PARALLEL_RESULT_UNVERIFIED',
  'PARALLEL_VERIFICATION_ENVIRONMENT',
  'PARALLEL_TDD_UNCONSUMED',
  'PARALLEL_INTEGRATION_INCOMPLETE',
  'PARALLEL_INTEGRATION_CONFLICT',
  'PARALLEL_INTEGRATION_VERIFICATION_FAILED',
  'PARALLEL_ASSIGNMENT_STATE',
  'PARALLEL_LEASE_BUSY',
  'PARALLEL_CANDIDATE_DIVERGED',
] as const;

export interface ParallelFocusedCommand {
  name: string;
  args: string[];
}

export interface ParallelAssignment {
  id: string;
  role: string;
  requirementIds: string[];
  dependsOn: string[];
  ownedPaths: string[];
  focusedCommands: ParallelFocusedCommand[];
}

function parallelPlanPathSlug(planId: string): string {
  const identity = planId.replace(/^parallel-plan:/, '');
  return `parallel-plan-${/^[a-f0-9]{64}$/i.test(identity) ? identity.slice(0, 20) : identity}`;
}

export async function canonicalWorkspacePath(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch (cause) {
    if (!['ENOENT', 'ENOTDIR'].includes((cause as NodeJS.ErrnoException).code ?? '')) throw cause;
    const parent = dirname(absolute);
    if (parent === absolute || parent === parse(absolute).root) return absolute;
    return resolve(await canonicalWorkspacePath(parent), basename(absolute));
  }
}

export interface AuthoredParallelPlan {
  schemaVersion: 1;
  concurrency?: number;
  provisionCommandNames: string[];
  integratorOwnedPaths: string[];
  assignments: [ParallelAssignment, ...ParallelAssignment[]];
}

export interface ParallelPlanBinding {
  changeId: string;
  generation: number;
  baseCommit: string;
  requirementIds: string[];
  requirementsApprovalSha256: string;
  designApprovalSha256: string;
  commandSetSha256: string;
  configuredCommandNames?: string[];
}

export interface PersistedParallelPlan<
  Assignments extends [ParallelAssignment, ...ParallelAssignment[]] =
    [ParallelAssignment, ...ParallelAssignment[]],
> {
  schemaVersion: 1;
  planId: string;
  concurrency: number;
  authored: Omit<AuthoredParallelPlan, 'assignments'> & { assignments: Assignments };
  binding: ParallelPlanBinding;
  assignments: Assignments;
}

export interface ParallelAttemptTransition {
  assignmentId: string;
  attempt: number;
  state: 'running' | 'completed' | 'failed';
  reason?: string;
}

export interface ParallelStatus {
  counts: Record<'waiting' | 'queued' | 'running' | 'completed' | 'failed' | 'blocked', number>;
  occupiedSlots: number;
  assignments: Array<{ assignmentId: string; attempt: number; state: keyof ParallelStatus['counts'] }>;
}

const transitionStatePrecedence: Record<ParallelAttemptTransition['state'], number> = {
  running: 0,
  completed: 1,
  failed: 2,
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function invalid(message: string): never {
  throw new Error(`PARALLEL_PLAN_INVALID: ${message}`);
}

function validatePathPattern(pattern: string): void {
  if (!pattern || pattern.startsWith('/') || pattern.includes('\\')
    || pattern.split('/').some((segment) => segment === '..' || segment === '')) {
    invalid(`invalid root-relative path pattern ${pattern}.`);
  }
}

function staticPrefix(pattern: string): string {
  return pattern.split(/[*?[]/, 1)[0]!.replace(/\/+$/, '');
}

function segmentPatternsOverlap(left: string, right: string): boolean {
  const leftHasMagic = /[*?[]/.test(left);
  const rightHasMagic = /[*?[]/.test(right);
  if (!leftHasMagic) return globExpression(right).test(left);
  if (!rightHasMagic) return globExpression(left).test(right);
  const a = staticPrefix(left);
  const b = staticPrefix(right);
  if (a && b && a !== b && !a.startsWith(b) && !b.startsWith(a)) return false;
  const suffix = (pattern: string): string => {
    const magic = Math.max(pattern.lastIndexOf('*'), pattern.lastIndexOf('?'), pattern.lastIndexOf('['));
    return pattern.slice(magic + 1);
  };
  const suffixA = suffix(left);
  const suffixB = suffix(right);
  return !suffixA || !suffixB || suffixA.endsWith(suffixB) || suffixB.endsWith(suffixA);
}

function patternsOverlap(left: string, right: string): boolean {
  const a = left.split('/');
  const b = right.split('/');
  const firstDoubleA = a.indexOf('**');
  const firstDoubleB = b.indexOf('**');
  if (firstDoubleA === -1 && firstDoubleB === -1) {
    return a.length === b.length && a.every((segment, index) => segmentPatternsOverlap(segment, b[index]!));
  }
  const leading = Math.min(
    firstDoubleA === -1 ? a.length : firstDoubleA,
    firstDoubleB === -1 ? b.length : firstDoubleB,
  );
  for (let index = 0; index < leading; index += 1) {
    if (!segmentPatternsOverlap(a[index]!, b[index]!)) return false;
  }
  const lastDoubleA = a.lastIndexOf('**');
  const lastDoubleB = b.lastIndexOf('**');
  const trailingA = lastDoubleA === -1 ? 0 : a.length - lastDoubleA - 1;
  const trailingB = lastDoubleB === -1 ? 0 : b.length - lastDoubleB - 1;
  const trailing = Math.min(trailingA, trailingB);
  for (let offset = 1; offset <= trailing; offset += 1) {
    if (!segmentPatternsOverlap(a[a.length - offset]!, b[b.length - offset]!)) return false;
  }
  return true;
}

function descendants(assignments: ParallelAssignment[], source: string): Set<string> {
  const found = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const assignment of assignments) {
      if (!found.has(assignment.id)
        && assignment.dependsOn.some((dependency) => dependency === source || found.has(dependency))) {
        found.add(assignment.id);
        changed = true;
      }
    }
  }
  return found;
}

function comparable(assignments: ParallelAssignment[], left: string, right: string): boolean {
  return descendants(assignments, left).has(right) || descendants(assignments, right).has(left);
}

/** @id CODE-M5-PARALLEL-PLAN-001
 * @implements REQ-M5-PARALLEL-001 REQ-M5-PARALLEL-002 REQ-M5-PARALLEL-003 REQ-M5-PARALLEL-011 REQ-M5-PARALLEL-013
 * @design DES-M5-PARALLEL-001 DES-M5-PARALLEL-002 DES-M5-PARALLEL-003 DES-M5-PARALLEL-009
 */
export function validateParallelPlan<Assignments extends [ParallelAssignment, ...ParallelAssignment[]]>(
  authored: Omit<AuthoredParallelPlan, 'assignments'> & { assignments: Assignments },
  binding: ParallelPlanBinding,
  cliConcurrency?: number,
): PersistedParallelPlan<Assignments> {
  if (authored.schemaVersion !== 1) invalid('schemaVersion must be 1.');
  if (!Array.isArray(authored.assignments) || authored.assignments.length === 0 || authored.assignments.length > 64) {
    invalid('assignments must contain 1 through 64 entries.');
  }
  const concurrency = authored.concurrency ?? cliConcurrency ?? 3;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    invalid('concurrency must be an integer from 1 through 8.');
  }
  if (authored.concurrency !== undefined && cliConcurrency !== undefined && authored.concurrency !== cliConcurrency) {
    throw new Error('CLI_ERROR: PARALLEL_CONCURRENCY_INVALID: CLI concurrency conflicts with the plan document.');
  }
  const commandNames = new Set(binding.configuredCommandNames ?? []);
  const ids = new Set<string>();
  const requirementIds = new Set(binding.requirementIds);
  for (const assignment of authored.assignments) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(assignment.id) || ids.has(assignment.id)) {
      invalid(`invalid or duplicate assignment id ${assignment.id}.`);
    }
    ids.add(assignment.id);
    if (!assignment.role || !assignment.requirementIds.length || !assignment.ownedPaths.length
      || !assignment.focusedCommands.length) invalid(`assignment ${assignment.id} is incomplete.`);
    for (const requirementId of assignment.requirementIds) {
      if (!requirementIds.has(requirementId)) invalid(`assignment ${assignment.id} references unknown ${requirementId}.`);
    }
    for (const pattern of assignment.ownedPaths) {
      validatePathPattern(pattern);
      if (pattern === '.musubix' || pattern.startsWith('.musubix/')) {
        throw new Error(`PARALLEL_PLAN_OWNERSHIP_OVERLAP: assignment ${assignment.id} requests ${pattern}.`);
      }
    }
    for (const command of assignment.focusedCommands) {
      if (!command.name || !Array.isArray(command.args)
        || (commandNames.size && !commandNames.has(command.name))) {
        invalid(`assignment ${assignment.id} references unknown command ${command.name}.`);
      }
    }
  }
  for (const command of authored.provisionCommandNames) {
    if (commandNames.size && !commandNames.has(command)) invalid(`unknown provisioning command ${command}.`);
  }
  const integratorOwnedPaths = [...new Set([
    ...authored.integratorOwnedPaths,
    '.musubix/**',
    '.musubix/changes/**',
    '.musubix/features/**',
    '.musubix/decisions/**',
  ])];
  integratorOwnedPaths.forEach(validatePathPattern);
  for (const assignment of authored.assignments) {
    for (const dependency of assignment.dependsOn) {
      if (!ids.has(dependency) || dependency === assignment.id) {
        invalid(`assignment ${assignment.id} has invalid dependency ${dependency}.`);
      }
    }
    for (const owned of assignment.ownedPaths) {
      if (integratorOwnedPaths.some((integrator) => patternsOverlap(owned, integrator))) {
        throw new Error(`PARALLEL_PLAN_OWNERSHIP_OVERLAP: ${assignment.id}:${owned} overlaps integrator ownership.`);
      }
    }
  }
  stableTopologicalOrder(authored.assignments);
  for (let left = 0; left < authored.assignments.length; left += 1) {
    for (let right = left + 1; right < authored.assignments.length; right += 1) {
      const a = authored.assignments[left]!;
      const b = authored.assignments[right]!;
      if (!comparable(authored.assignments, a.id, b.id)
        && a.ownedPaths.some((one) => b.ownedPaths.some((two) => patternsOverlap(one, two)))) {
        throw new Error(`PARALLEL_PLAN_OWNERSHIP_OVERLAP: ${a.id} and ${b.id} overlap.`);
      }
    }
  }
  const normalizedAuthored: Omit<AuthoredParallelPlan, 'assignments'> & { assignments: Assignments } = {
    ...authored,
    concurrency,
    integratorOwnedPaths,
  };
  const planId = `parallel-plan:${digest(canonical({
    changeId: binding.changeId,
    generation: binding.generation,
    baseCommit: binding.baseCommit,
    requirementsApprovalSha256: binding.requirementsApprovalSha256,
    designApprovalSha256: binding.designApprovalSha256,
    commandSetSha256: binding.commandSetSha256,
    normalizedAuthored: normalizedAuthored,
  }))}`;
  return {
    schemaVersion: 1,
    planId,
    concurrency,
    authored: normalizedAuthored,
    binding,
    assignments: normalizedAuthored.assignments,
  };
}

export function stableTopologicalOrder(assignments: ParallelAssignment[]): ParallelAssignment[] {
  const pending = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const emitted = new Set<string>();
  const result: ParallelAssignment[] = [];
  while (pending.size) {
    const ready = [...pending.values()]
      .filter((assignment) => assignment.dependsOn.every((dependency) => emitted.has(dependency)))
      .sort((left, right) => left.id.localeCompare(right.id));
    if (!ready.length) invalid('assignment dependencies contain a cycle.');
    for (const assignment of ready) {
      pending.delete(assignment.id);
      emitted.add(assignment.id);
      result.push(assignment);
    }
  }
  return result;
}

export function projectParallelStatus(
  plan: PersistedParallelPlan,
  transitions: ParallelAttemptTransition[],
  stale = false,
): ParallelStatus {
  const latest = new Map<string, ParallelAttemptTransition>();
  for (const transition of transitions) {
    const current = latest.get(transition.assignmentId);
    if (!current
      || transition.attempt > current.attempt
      || (transition.attempt === current.attempt
        && transitionStatePrecedence[transition.state] >= transitionStatePrecedence[current.state])) {
      latest.set(transition.assignmentId, transition);
    }
  }
  const states = new Map<string, keyof ParallelStatus['counts']>();
  for (const assignment of stableTopologicalOrder(plan.assignments)) {
    const transition = latest.get(assignment.id);
    if (transition?.state === 'completed' || transition?.state === 'failed') {
      states.set(assignment.id, transition.state);
      continue;
    }
    if (stale || assignment.dependsOn.some((dependency) =>
      states.get(dependency) === 'failed' || states.get(dependency) === 'blocked')) {
      states.set(assignment.id, 'blocked');
    } else if (transition?.state === 'running') {
      states.set(assignment.id, 'running');
    } else if (assignment.dependsOn.every((dependency) => states.get(dependency) === 'completed')) {
      states.set(assignment.id, 'queued');
    } else {
      states.set(assignment.id, 'waiting');
    }
  }
  const counts = { waiting: 0, queued: 0, running: 0, completed: 0, failed: 0, blocked: 0 };
  const projected = plan.assignments.map((assignment) => {
    const state = states.get(assignment.id)!;
    counts[state] += 1;
    return { assignmentId: assignment.id, attempt: latest.get(assignment.id)?.attempt ?? 1, state };
  });
  return {
    counts,
    occupiedSlots: stale ? 0 : counts.running,
    assignments: projected,
  };
}

/** @id CODE-M5-PARALLEL-ASSIGNMENT-001
 * @implements REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-004 REQ-M5-PARALLEL-005 REQ-M5-PARALLEL-006 REQ-M5-PARALLEL-007 REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-014 REQ-M5-PARALLEL-015
 * @design DES-M5-012 DES-M5-PARALLEL-004 DES-M5-PARALLEL-005 DES-M5-PARALLEL-006 DES-M5-PARALLEL-010
 */
export function parallelWorkspacePaths(
  gitCommonDirectory: string,
  changeId: string,
  planId: string,
  assignmentId: string,
  attempt: number,
): { assignmentBranch: string; assignmentWorktree: string; heartbeatPath: string } {
  const planSlug = parallelPlanPathSlug(planId);
  const base = resolve(gitCommonDirectory, 'musubix5', 'workspaces', changeId, 'parallel', planSlug);
  return {
    assignmentBranch: `musubix5/${changeId}/${planSlug}/${assignmentId}/attempt-${attempt}`,
    assignmentWorktree: portable(resolve(base, 'assignments', assignmentId, `attempt-${attempt}`)),
    heartbeatPath: portable(resolve(base, 'heartbeats', `${assignmentId}-attempt-${attempt}.json`)),
  };
}

export function verificationWorkspacePath(
  gitCommonDirectory: string,
  changeId: string,
  planId: string,
  assignmentId: string,
  attempt: number,
): string {
  const planSlug = parallelPlanPathSlug(planId);
  return portable(resolve(
    gitCommonDirectory,
    'musubix5',
    'workspaces',
    changeId,
    'parallel',
    planSlug,
    'verification',
    assignmentId,
    `attempt-${attempt}`,
  ));
}

export function verificationWorkspaceIdentity(input: {
  gitCommonDirectory: string;
  changeId: string;
  planId: string;
  assignmentId: string;
  attempt: number;
  reportedHead: string;
  existing: 'missing' | 'clean-stale' | 'dirty';
}): { path: string; recovery: 'create' | 'remove-and-create' | 'reject' } {
  const base = verificationWorkspacePath(
    input.gitCommonDirectory,
    input.changeId,
    input.planId,
    input.assignmentId,
    input.attempt,
  );
  const path = `${base}-${input.reportedHead.slice(0, 16)}`;
  return {
    path,
    recovery: input.existing === 'missing'
      ? 'create'
      : input.existing === 'clean-stale'
        ? 'remove-and-create'
        : 'reject',
  };
}

export function buildAssignmentTddCommands(input: {
  controlRoot: string;
  worktree: string;
  changeId: string;
  requirementId: string;
  testId: string;
  commandName: string;
  planId?: string;
  assignmentId?: string;
  attempt?: number;
  startCommit?: string;
}): { red: string[]; implementation: string[]; green: string[] } {
  const parallelArgs = input.planId && input.assignmentId && input.attempt && input.startCommit
    ? [
        '--parallel-plan', input.planId,
        '--parallel-assignment', input.assignmentId,
        '--parallel-attempt', String(input.attempt),
        '--parallel-start-commit', input.startCommit,
      ]
    : [];
  const tdd = (phase: 'red' | 'green'): string[] => [
    'tdd',
    phase,
    input.testId,
    '--requirement',
    input.requirementId,
    '--command',
    input.commandName,
    '--root',
    input.controlRoot,
    '--workspace',
    input.worktree,
    ...parallelArgs,
  ];
  return {
    red: tdd('red'),
    implementation: [
      'change-record',
      input.changeId,
      'implementation',
      '--requirement',
      input.requirementId,
      '--root',
      input.controlRoot,
    ],
    green: tdd('green'),
  };
}

export function parallelTransitionIdempotencyKey(input: {
  changeId: string;
  generation: number;
  planId: string;
  entity: string;
  attempt: number;
  transition: string;
}): string {
  return [
    'parallel',
    input.changeId,
    input.generation,
    input.planId,
    input.entity,
    input.attempt,
    input.transition,
  ].join(':');
}

export function classifyParallelTddProvenance(input: {
  consumed: boolean;
  status: 'provisional' | 'verified';
  purpose: string;
}): 'pass' | 'PARALLEL_TDD_UNCONSUMED' {
  if (!input.consumed) return 'PARALLEL_TDD_UNCONSUMED';
  if (input.status === 'verified' || input.purpose === 'integration-verification') return 'pass';
  return 'PARALLEL_TDD_UNCONSUMED';
}

export function selectStaleParallelPlanIds(
  plans: Array<{ planId: string; changeId: string; generation: number }>,
  active: { changeId: string; generation: number } | null,
  changeId: string,
): string[] {
  return plans
    .filter((plan) => plan.changeId === changeId
      && (!active || active.changeId !== changeId || plan.generation !== active.generation))
    .map((plan) => plan.planId);
}

export function parallelExitCode(code: string): 0 | 1 | 2 {
  return code === 'CLI_ERROR' ? 2 : 1;
}

export function validateParallelResultEntries(
  entries: Array<{ path: string; mode: string; type: string }>,
): void {
  const rejected = entries.filter((entry) =>
    entry.type !== 'blob' || (entry.mode !== '100644' && entry.mode !== '100755'));
  if (rejected.length) {
    throw new Error(
      `PARALLEL_RESULT_UNVERIFIED: assignment result contains non-regular entries: ${
        rejected.map((entry) => `${entry.path} (${entry.mode} ${entry.type})`).join(', ')
      }.`,
    );
  }
}

export function integrationFailureTransition(
  code: string,
): { state: 'provisional' | 'verification-failed'; retainProvenance: true } {
  return {
    state: code === 'PARALLEL_VERIFICATION_ENVIRONMENT' ? 'provisional' : 'verification-failed',
    retainProvenance: true,
  };
}

function globExpression(pattern: string): RegExp {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === '*' && pattern[index + 1] === '*') {
      source += '.*';
      index += 1;
    } else if (character === '*') source += '[^/]*';
    else if (character === '?') source += '[^/]';
    else source += character.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

export function validateOwnedPaths(
  changedPaths: string[],
  ownedPaths: string[],
  integratorOwnedPaths: string[],
): string[] {
  const owned = ownedPaths.map(globExpression);
  const integrator = integratorOwnedPaths.map(globExpression);
  const rejected = changedPaths.filter((path) =>
    integrator.some((pattern) => pattern.test(path)) || !owned.some((pattern) => pattern.test(path)));
  if (rejected.length) {
    throw new Error(`PARALLEL_RESULT_OWNERSHIP: ${rejected.join(', ')}.`);
  }
  return rejected;
}

export function nextRetryAttempt(transitions: ParallelAttemptTransition[], assignmentId: string): number {
  const latest = transitions.filter((transition) => transition.assignmentId === assignmentId)
    .reduce<ParallelAttemptTransition | undefined>((current, transition) => {
      if (!current
        || transition.attempt > current.attempt
        || (transition.attempt === current.attempt
          && transitionStatePrecedence[transition.state] >= transitionStatePrecedence[current.state])) {
        return transition;
      }
      return current;
    }, undefined);
  if (!latest || latest.state !== 'failed') {
    throw new Error(`PARALLEL_ASSIGNMENT_STATE: ${assignmentId} is not retryable.`);
  }
  return latest.attempt + 1;
}

export interface IntegrationProvenance {
  planId: string;
  attempt: number;
  integrationCommit: string;
  assignments: Array<{
    assignmentId: string;
    attempt: number;
    startCommit: string;
    head: string;
    commits: string[];
  }>;
  status: 'provisional' | 'verified';
}

/** @id CODE-M5-PARALLEL-INTEGRATION-001
 * @implements REQ-M5-TDD-003 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-012 REQ-M5-PARALLEL-016
 * @design DES-M5-011 DES-M5-PARALLEL-006 DES-M5-PARALLEL-007 DES-M5-PARALLEL-008
 */
export function buildIntegrationProvenance(
  input: Omit<IntegrationProvenance, 'status'>,
): IntegrationProvenance {
  const ids = new Set<string>();
  const commits = new Set<string>();
  for (const assignment of input.assignments) {
    if (ids.has(assignment.assignmentId) || assignment.commits.length === 0) {
      throw new Error('PARALLEL_INTEGRATION_CONFLICT: duplicate or empty assignment range.');
    }
    ids.add(assignment.assignmentId);
    for (const commit of assignment.commits) {
      if (commits.has(commit)) {
        throw new Error('PARALLEL_INTEGRATION_CONFLICT: assignment commit ranges overlap.');
      }
      commits.add(commit);
    }
  }
  return { ...input, status: 'provisional' };
}

export function assertIntegrationReopenable(state: string, reasonCode?: string): void {
  if (state !== 'conflict' && state !== 'verification-failed') {
    throw new Error(
      `PARALLEL_ASSIGNMENT_STATE: integration state ${state}${
        reasonCode ? ` (${reasonCode})` : ''
      } is not reopenable.`,
    );
  }
}

export function verifyIntegrationProvenance(
  provenance: IntegrationProvenance,
  integrationCommit: string,
): IntegrationProvenance {
  if (provenance.integrationCommit !== integrationCommit) {
    throw new Error('PARALLEL_INTEGRATION_VERIFICATION_FAILED: integration commit changed.');
  }
  return { ...provenance, status: 'verified' };
}

export function classifyCandidateHandoff(
  candidateHead: string | null,
  planBase: string,
  clean: boolean,
): 'ready' | 'dirty-at-base' | 'missing' | 'not-at-base' {
  if (candidateHead === null) return 'missing';
  if (candidateHead !== planBase) return 'not-at-base';
  return clean ? 'ready' : 'dirty-at-base';
}

export function cleanupEligibility(input: {
  state: 'completed' | 'failed' | 'blocked' | 'unknown';
  clean: boolean;
  consumedCount: number;
  provenanceStatus: 'provisional' | 'verified' | 'missing';
}): 'remove' | 'retain-dirty' | 'retain-failed' | 'retain-unconsumed' | 'retain-unknown' {
  if (!input.clean) return 'retain-dirty';
  if (input.state === 'failed' || input.state === 'blocked') return 'retain-failed';
  if (input.state !== 'completed') return 'retain-unknown';
  if (input.consumedCount !== 1 || input.provenanceStatus !== 'verified') return 'retain-unconsumed';
  return 'remove';
}
