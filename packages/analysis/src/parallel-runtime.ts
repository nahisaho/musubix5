import { mkdir, lstat, rm } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAssignmentTddCommands,
  buildIntegrationProvenance,
  canonicalWorkspacePath,
  assertIntegrationReopenable,
  classifyCandidateHandoff,
  cleanupEligibility,
  integrationFailureTransition,
  nextRetryAttempt,
  parallelTransitionIdempotencyKey,
  parallelWorkspacePaths,
  projectParallelStatus,
  selectStaleParallelPlanIds,
  stableTopologicalOrder,
  validateParallelResultEntries,
  validateOwnedPaths,
  validateParallelPlan,
  verificationWorkspacePath,
  verificationWorkspaceIdentity,
  verifyIntegrationProvenance,
  type AuthoredParallelPlan,
  type IntegrationProvenance,
  type ParallelAssignment,
  type ParallelAttemptTransition,
  type PersistedParallelPlan,
} from './parallel.js';
import { digest, exists, portable, readText, within, writeJson } from './files.js';
import { runProcess, type ProcessResult } from './process.js';
import { resolveChangeContext } from './change-generation.js';
import { classifyReleaseApprovalDiagnostic } from './approval.js';
import { commandCwd, loadConfig, type CommandConfig, type Config } from './config.js';
import { loadChangeEvidence } from './change-evidence.js';
import { classifyParallelTddEvidence } from './parallel-tdd-evidence.js';
import { loadTddEvidence } from './tdd.js';
import { selectCurrentTddCycle } from './tdd-cycle-resolver.js';
import {
  acquireChangeLease,
  appendJournalRecord,
  assertChangeLeaseCurrent,
  releaseChangeLease,
  verifyJournal,
  type ChangeLease,
} from './journal.js';

const storePath = '.musubix/evidence/parallel.json';
const requirementsApprovalPath = '.musubix/evidence/approvals/requirements.json';
const designApprovalPath = '.musubix/evidence/approvals/design.json';
const shaPattern = /^[a-f0-9]{40,64}$/i;

interface ParallelPolicy {
  schemaVersion: 1;
  defaultConcurrency: number;
  maxConcurrency: number;
  integratorOwnedDefaults: string[];
  provisionCommands: Array<{ name: string; command: string; args: string[]; timeoutMs: number }>;
  agentCommitIdentity: { name: string; email: string };
  prohibitedAgentOperations: Array<{ command: string; argsPrefix: string[] }>;
  runnerEnvironment: {
    fixed: Record<string, string>;
    managedHome: boolean;
    passThrough: string[];
  };
}

interface ApprovalRecord {
  schemaVersion: 1;
  changeId: string;
  generation: number;
  artifactSha256: string;
  artifacts: Record<string, string>;
}

interface StoredPlan extends PersistedParallelPlan {
  createdOrder: number;
  policy: ParallelPolicy;
}

interface PreparedRecord {
  planId: string;
  preparedOrder: number;
  gitCommonDirectory: string;
}

interface AttemptRecord extends ParallelAttemptTransition {
  planId: string;
  order: number;
  branch?: string;
  worktree?: string;
  startCommit?: string;
  head?: string;
  commits?: string[];
  tdd?: Array<{
    requirementId: string;
    cycleId: string | null;
    testId: string;
    batchTerminalOrder: number;
  }>;
}

interface RetryRecord {
  planId: string;
  assignmentId: string;
  attempt: number;
  order: number;
}

interface IntegrationRecord {
  planId: string;
  attempt: number;
  order: number;
  branch: string;
  worktree: string;
  state: 'running' | 'conflict' | 'verification-failed' | 'provisional' | 'verified' | 'closed';
  consumedAssignmentIds: string[];
  provenance?: IntegrationProvenance;
  verification?: {
    provisioning: ParallelCommandOutcome[];
    commands: ParallelCommandOutcome[];
    checks: ParallelCommandOutcome[];
  };
  reason?: string;
}

interface HandoffRecord {
  planId: string;
  order: number;
  candidateCommit: string;
  candidateIdentity: string;
  integrationEvidenceHead: string;
}

interface CleanupRecord {
  planId: string;
  order: number;
  maintenance: boolean;
  removed: string[];
  retained: Array<{ path: string; reason: string }>;
}

interface ParallelStore {
  schemaVersion: 1;
  nextOrder: number;
  plans: StoredPlan[];
  prepared: PreparedRecord[];
  attempts: AttemptRecord[];
  retries: RetryRecord[];
  integrations: IntegrationRecord[];
  handoffs: HandoffRecord[];
  cleanups: CleanupRecord[];
  maintenance: CleanupRecord[];
}

interface CurrentBinding {
  plan: PersistedParallelPlan['binding'];
  policy: ParallelPolicy;
  config: Config;
  gitCommonDirectory: string;
}

export interface ParallelCommandOutcome {
  [key: string]: unknown;
}

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

function domain(code: string, message: string, details?: Record<string, unknown>): never {
  const suffix = details ? ` ${JSON.stringify(details)}` : '';
  throw new Error(`${code}: ${message}${suffix}`);
}

function assertObject(value: unknown, location: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    domain('PARALLEL_PLAN_INVALID', `${location} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: string[], location: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) domain('PARALLEL_PLAN_INVALID', `${location} contains unknown field ${unknown[0]}.`);
}

function parseAuthoredPlan(value: unknown): AuthoredParallelPlan {
  const plan = assertObject(value, 'plan');
  exactKeys(plan, ['schemaVersion', 'concurrency', 'provisionCommandNames', 'integratorOwnedPaths', 'assignments'], 'plan');
  if (plan.schemaVersion !== 1
    || !Array.isArray(plan.provisionCommandNames)
    || !plan.provisionCommandNames.every((entry) => typeof entry === 'string')
    || !Array.isArray(plan.integratorOwnedPaths)
    || !plan.integratorOwnedPaths.every((entry) => typeof entry === 'string')
    || !Array.isArray(plan.assignments)) {
    domain('PARALLEL_PLAN_INVALID', 'plan schemaVersion, command names, paths, or assignments are invalid.');
  }
  for (const [index, raw] of plan.assignments.entries()) {
    const assignment = assertObject(raw, `assignments[${index}]`);
    exactKeys(
      assignment,
      ['id', 'role', 'requirementIds', 'dependsOn', 'ownedPaths', 'focusedCommands'],
      `assignments[${index}]`,
    );
    if (!Array.isArray(assignment.focusedCommands)) {
      domain('PARALLEL_PLAN_INVALID', `assignments[${index}].focusedCommands must be an array.`);
    }
    for (const [commandIndex, rawCommand] of assignment.focusedCommands.entries()) {
      const command = assertObject(rawCommand, `assignments[${index}].focusedCommands[${commandIndex}]`);
      exactKeys(command, ['name', 'args'], `assignments[${index}].focusedCommands[${commandIndex}]`);
    }
  }
  return plan as unknown as AuthoredParallelPlan;
}

function emptyStore(): ParallelStore {
  return {
    schemaVersion: 1,
    nextOrder: 1,
    plans: [],
    prepared: [],
    attempts: [],
    retries: [],
    integrations: [],
    handoffs: [],
    cleanups: [],
    maintenance: [],
  };
}

export function reconcileParallelTransition<T extends { attempts: unknown[] }>(
  store: T,
  record: { idempotencyKey: string; payload: unknown },
): T {
  const next = structuredClone(store) as T & Partial<ParallelStore>;
  const payload = record.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return next;
  const value = payload as Record<string, unknown>;
  const replace = (collection: keyof ParallelStore, candidate: Record<string, unknown>, keys: string[]): void => {
    const items = (next[collection] ?? []) as unknown[];
    const index = items.findIndex((entry) => entry && typeof entry === 'object'
      && keys.every((key) => (entry as Record<string, unknown>)[key] === candidate[key]));
    if (index >= 0) items[index] = candidate;
    else items.push(candidate);
    (next as unknown as Record<string, unknown>)[collection] = items;
  };
  const apply = (candidate: Record<string, unknown>): void => {
    if ('createdOrder' in candidate && 'binding' in candidate) replace('plans', candidate, ['planId']);
    else if ('preparedOrder' in candidate) replace('prepared', candidate, ['planId']);
    else if ('candidateCommit' in candidate) replace('handoffs', candidate, ['planId']);
    else if ('removed' in candidate && 'retained' in candidate) {
      replace(candidate.maintenance ? 'maintenance' : 'cleanups', candidate, ['planId', 'order']);
    } else if ('consumedAssignmentIds' in candidate) {
      replace('integrations', candidate, ['planId', 'attempt']);
    } else if ('assignmentId' in candidate && 'state' in candidate) {
      const items = (next.attempts ?? []) as unknown[];
      if (!items.some((entry) => canonical(entry) === canonical(candidate))) items.push(candidate);
      next.attempts = items as AttemptRecord[];
    } else if ('assignmentId' in candidate && 'attempt' in candidate) {
      replace('retries', candidate, ['planId', 'assignmentId', 'attempt']);
    }
  };
  if (value.integration && typeof value.integration === 'object' && !Array.isArray(value.integration)) {
    apply(value.integration as Record<string, unknown>);
  }
  if (Array.isArray(value.attempts)) {
    for (const attempt of value.attempts) {
      if (attempt && typeof attempt === 'object' && !Array.isArray(attempt)) {
        apply(attempt as Record<string, unknown>);
      }
    }
  } else {
    apply(value);
  }
  const orderOf = (entry: unknown, field = 'order'): unknown =>
    entry && typeof entry === 'object' ? (entry as Record<string, unknown>)[field] : undefined;
  const maximumOrder = [
    ...(next.plans ?? []).map((entry) => orderOf(entry, 'createdOrder')),
    ...(next.prepared ?? []).map((entry) => orderOf(entry, 'preparedOrder')),
    ...(next.attempts ?? []).map((entry) => orderOf(entry)),
    ...(next.retries ?? []).map((entry) => orderOf(entry)),
    ...(next.integrations ?? []).map((entry) => orderOf(entry)),
    ...(next.handoffs ?? []).map((entry) => orderOf(entry)),
    ...(next.cleanups ?? []).map((entry) => orderOf(entry)),
    ...(next.maintenance ?? []).map((entry) => orderOf(entry)),
  ].filter((order): order is number => Number.isInteger(order));
  next.nextOrder = Math.max(next.nextOrder ?? 1, (maximumOrder.length ? Math.max(...maximumOrder) : 0) + 1);
  return next;
}

async function loadStore(root: string): Promise<ParallelStore> {
  let store = emptyStore();
  if (await exists(within(root, storePath))) {
    const value = JSON.parse(await readText(root, storePath)) as Partial<ParallelStore>;
    if (value.schemaVersion !== 1 || !Array.isArray(value.plans)) {
      domain('PARALLEL_PLAN_INVALID', 'parallel evidence store is invalid.');
    }
    store = {
      ...emptyStore(),
      ...value,
      nextOrder: Number.isInteger(value.nextOrder) && value.nextOrder! > 0 ? value.nextOrder! : 1,
      plans: value.plans,
      prepared: value.prepared ?? [],
      attempts: value.attempts ?? [],
      retries: value.retries ?? [],
      integrations: value.integrations ?? [],
      handoffs: value.handoffs ?? [],
      cleanups: value.cleanups ?? [],
      maintenance: value.maintenance ?? [],
    };
  }
  for (const transition of (await verifyJournal(root))
    .filter((record) => record.kind === 'parallel-transition')) {
    store = reconcileParallelTransition(store, transition) as ParallelStore;
  }
  return store;
}

async function saveStore(root: string, store: ParallelStore): Promise<void> {
  await writeJson(root, storePath, store);
}

async function acquireParallelLease(root: string, changeId: string): Promise<ChangeLease> {
  try {
    return await acquireChangeLease(root, changeId);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message.includes('Timed out acquiring') || message.includes('Failed to acquire CHANGE lease')) {
      domain('PARALLEL_LEASE_BUSY', `CHANGE ${changeId} is busy; retry the operation.`);
    }
    throw cause;
  }
}

async function persistParallelTransition(
  root: string,
  lease: ChangeLease,
  plan: StoredPlan,
  store: ParallelStore,
  input: {
    entity: string;
    attempt: number;
    transition: string;
    payload: unknown;
  },
): Promise<void> {
  await assertChangeLeaseCurrent(lease);
  await appendJournalRecord(root, {
    stream: 'normal',
    changeId: plan.binding.changeId,
    kind: 'parallel-transition',
    idempotencyKey: parallelTransitionIdempotencyKey({
      changeId: plan.binding.changeId,
      generation: plan.binding.generation,
      planId: plan.planId,
      entity: input.entity,
      attempt: input.attempt,
      transition: input.transition,
    }),
    payload: input.payload,
  });
  await assertChangeLeaseCurrent(lease);
  await saveStore(root, store);
}

function ordered(store: ParallelStore): number {
  const order = store.nextOrder;
  store.nextOrder += 1;
  return order;
}

async function gitResult(cwd: string, args: string[], timeoutMs = 120_000): Promise<ProcessResult> {
  return runProcess('git', args, { cwd, timeoutMs });
}

async function git(cwd: string, args: string[], code = 'PARALLEL_WORKTREE_CONFLICT'): Promise<string> {
  const result = await gitResult(cwd, args);
  if (result.status !== 'completed' || result.exitCode !== 0) {
    domain(code, result.stderr.trim() || `git ${args.join(' ')} failed.`);
  }
  return result.stdout.trim();
}

async function gitSucceeds(cwd: string, args: string[]): Promise<boolean> {
  const result = await gitResult(cwd, args);
  return result.status === 'completed' && result.exitCode === 0;
}

async function isClean(cwd: string): Promise<boolean> {
  return (await git(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])) === '';
}

async function isCleanOutsidePaths(cwd: string, ignoredPaths: string[]): Promise<boolean> {
  const output = await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (!output) return true;
  const entries = output.split('\0').filter(Boolean);
  const changedPaths: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const status = entry.slice(0, 2);
    changedPaths.push(portable(entry.slice(3)));
    if (status.includes('R') || status.includes('C')) {
      const destination = entries[index + 1];
      if (destination) changedPaths.push(portable(destination));
      index += 1;
    }
  }
  try {
    validateOwnedPaths(changedPaths, ignoredPaths, []);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isDirectory();
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw cause;
  }
}

async function assertManagedPathAncestors(path: string, managedRoot: string): Promise<void> {
  const root = resolve(managedRoot);
  const target = resolve(path);
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('/')) {
    domain('PARALLEL_WORKTREE_CONFLICT', `${path} escapes the managed parallel workspace root.`);
  }
  const segments = rel.split(sep).filter(Boolean);
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = resolve(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        domain('PARALLEL_WORKTREE_CONFLICT', `managed workspace ancestor ${current} is a symlink.`);
      }
      if (!info.isDirectory()) {
        domain('PARALLEL_WORKTREE_CONFLICT', `managed workspace ancestor ${current} is not a directory.`);
      }
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw cause;
    }
  }
}

async function loadApproval(root: string, path: string, changeId: string, generation: number): Promise<ApprovalRecord> {
  if (!await exists(within(root, path))) domain('PARALLEL_PLAN_STALE', `required approval ${path} is missing.`);
  const approval = JSON.parse(await readText(root, path)) as ApprovalRecord;
  if (approval.schemaVersion !== 1 || approval.changeId !== changeId || approval.generation !== generation
    || !/^[a-f0-9]{64}$/.test(approval.artifactSha256) || !approval.artifacts) {
    domain('PARALLEL_PLAN_STALE', `approval ${path} is not current for ${changeId} generation ${generation}.`);
  }
  for (const [artifact, expected] of Object.entries(approval.artifacts)) {
    if (!await exists(within(root, artifact)) || digest(await readText(root, artifact)) !== expected) {
      domain('PARALLEL_PLAN_STALE', `approved artifact ${artifact} has changed.`);
    }
  }
  return approval;
}

function parsePolicy(source: string, artifact: string): ParallelPolicy | null {
  const declarations = source.split(/\r?\n/)
    .map((entry) => /^Parallel-Policy:\s*(.*)$/.exec(entry))
    .filter((match): match is RegExpExecArray => match !== null);
  if (!declarations.length) return null;
  if (declarations.length !== 1 || !declarations[0]![1]) {
    domain('PARALLEL_PLAN_STALE', `approved design artifact ${artifact} has ambiguous Parallel-Policy declarations.`);
  }
  let policy: ParallelPolicy;
  try {
    policy = JSON.parse(declarations[0]![1]!) as ParallelPolicy;
  } catch {
    domain('PARALLEL_PLAN_STALE', `approved Parallel-Policy in ${artifact} is malformed.`);
  }
  if (!policy || typeof policy !== 'object'
    || policy.schemaVersion !== 1
    || policy.defaultConcurrency !== 3
    || policy.maxConcurrency !== 8
    || !Array.isArray(policy.integratorOwnedDefaults)
    || !policy.integratorOwnedDefaults.every((entry) => typeof entry === 'string')
    || !Array.isArray(policy.provisionCommands)
    || !policy.provisionCommands.every((entry) =>
      entry && typeof entry.name === 'string' && typeof entry.command === 'string'
      && Array.isArray(entry.args) && entry.args.every((arg) => typeof arg === 'string')
      && Number.isInteger(entry.timeoutMs) && entry.timeoutMs > 0)
    || !policy.agentCommitIdentity
    || typeof policy.agentCommitIdentity.name !== 'string'
    || typeof policy.agentCommitIdentity.email !== 'string'
    || !Array.isArray(policy.prohibitedAgentOperations)
    || !policy.prohibitedAgentOperations.every((entry) =>
      entry && typeof entry.command === 'string'
      && Array.isArray(entry.argsPrefix) && entry.argsPrefix.every((arg) => typeof arg === 'string'))
    || !policy.runnerEnvironment
    || typeof policy.runnerEnvironment.managedHome !== 'boolean'
    || !policy.runnerEnvironment.fixed
    || Object.values(policy.runnerEnvironment.fixed).some((entry) => typeof entry !== 'string')
    || !Array.isArray(policy.runnerEnvironment.passThrough)
    || !policy.runnerEnvironment.passThrough.every((entry) => typeof entry === 'string')) {
    domain('PARALLEL_PLAN_STALE', `approved Parallel-Policy in ${artifact} is invalid.`);
  }
  return policy;
}

async function resolveApprovedPolicy(
  root: string,
  design: ApprovalRecord,
  requirementIds: string[],
): Promise<ParallelPolicy> {
  const candidates: Array<{ artifact: string; policy: ParallelPolicy; score: number }> = [];
  for (const artifact of Object.keys(design.artifacts)) {
    let policy: ParallelPolicy | null;
    let source: string;
    try {
      source = await readText(root, artifact);
      policy = parsePolicy(source, artifact);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message.startsWith('PARALLEL_PLAN_STALE:')) throw cause;
      domain('PARALLEL_PLAN_STALE', `approved design artifact ${artifact} cannot be read.`);
    }
    if (policy) {
      candidates.push({
        artifact,
        policy,
        score: requirementIds.filter((requirementId) => source.includes(requirementId)).length,
      });
    }
  }
  if (!candidates.length) {
    domain('PARALLEL_PLAN_STALE', 'approved design artifacts have no Parallel-Policy.');
  }
  const ranked = [...candidates].sort((left, right) => right.score - left.score);
  return ranked[0]!.policy;
}

async function gitCommonDirectory(root: string): Promise<string> {
  return canonicalWorkspacePath(resolve(root, await git(root, ['rev-parse', '--git-common-dir'])));
}

async function currentBinding(root: string): Promise<CurrentBinding> {
  let context;
  try {
    context = await resolveChangeContext(root);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message.startsWith('CHANGE_GENERATION_MIXED:')
      || message.startsWith('CHANGE_GENERATION_PHASE:')) {
      domain('PARALLEL_PLAN_STALE', 'no unique active CHANGE generation exists.');
    }
    throw cause;
  }
  if (!context || context.generation === null) domain('PARALLEL_PLAN_STALE', 'no active CHANGE generation exists.');
  const requirements = await loadApproval(
    root,
    requirementsApprovalPath,
    context.changeId,
    context.generation,
  );
  const design = await loadApproval(root, designApprovalPath, context.changeId, context.generation);
  const policy = await resolveApprovedPolicy(root, design, context.requirementIds);
  const config = await loadConfig(root);
  const commandSetSha256 = digest(`${canonical({
    commands: config.commands,
    provisionCommands: policy.provisionCommands,
  })}\n`);
  return {
    plan: {
      changeId: context.changeId,
      generation: context.generation,
      baseCommit: await git(root, ['rev-parse', '--verify', 'HEAD^{commit}']),
      requirementIds: context.requirementIds,
      requirementsApprovalSha256: requirements.artifactSha256,
      designApprovalSha256: design.artifactSha256,
      commandSetSha256,
      configuredCommandNames: [
        ...config.commands.map((command) => command.name),
        ...policy.provisionCommands.map((command) => command.name),
      ],
    },
    policy,
    config,
    gitCommonDirectory: await gitCommonDirectory(root),
  };
}

async function assertPlanBaseDescendsFromBaseline(
  root: string,
  changeId: string,
  baseCommit: string,
): Promise<void> {
  const baseline = (await verifyJournal(root))
    .filter((record) => record.changeId === changeId && record.kind === 'workspace-baseline')
    .at(-1);
  const baselineCommit = baseline
    && typeof baseline.payload === 'object'
    && baseline.payload !== null
    && 'commitSha' in baseline.payload
    ? String((baseline.payload as { commitSha: unknown }).commitSha)
    : null;
  if (!baselineCommit || !await gitSucceeds(root, ['merge-base', '--is-ancestor', baselineCommit, baseCommit])) {
    domain(
      'PARALLEL_WORKTREE_CONFLICT',
      `plan base ${baseCommit} does not descend from the persisted CHANGE baseline.`,
    );
  }
}

async function registeredWorktreePaths(root: string): Promise<Set<string>> {
  const output = await git(root, ['worktree', 'list', '--porcelain']);
  return new Set(await Promise.all(output.split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => canonicalWorkspacePath(line.slice('worktree '.length)))));
}

async function requirePlan(
  root: string,
  planId: string,
  current = true,
  options: { allowCandidateDivergence?: boolean } = {},
): Promise<{
  store: ParallelStore;
  plan: StoredPlan;
  binding?: CurrentBinding;
}> {
  if (!/^parallel-plan:[a-f0-9]{64}$/.test(planId)) {
    throw new Error('CLI_ERROR: plan ID must match parallel-plan:<sha256>.');
  }
  const store = await loadStore(root);
  const plan = store.plans.find((entry) => entry.planId === planId);
  if (!plan) domain('PARALLEL_PLAN_INVALID', `unknown plan ${planId}.`);
  if (!current) return { store, plan };
  const binding = await currentBinding(root);
  const expected = binding.plan;
  const handedOff = store.handoffs.some((entry) =>
    entry.planId === planId && entry.candidateCommit === expected.baseCommit);
  if (plan.binding.changeId !== expected.changeId
    || plan.binding.generation !== expected.generation
    || (!options.allowCandidateDivergence && !handedOff && plan.binding.baseCommit !== expected.baseCommit)
    || canonical(plan.binding.requirementIds) !== canonical(expected.requirementIds)
    || plan.binding.requirementsApprovalSha256 !== expected.requirementsApprovalSha256
    || plan.binding.designApprovalSha256 !== expected.designApprovalSha256
    || plan.binding.commandSetSha256 !== expected.commandSetSha256) {
    domain('PARALLEL_PLAN_STALE', `plan ${planId} no longer matches the active repository binding.`);
  }
  return { store, plan, binding };
}

async function withPlanLease<T>(
  root: string,
  planId: string,
  operation: (
    value: { store: ParallelStore; plan: StoredPlan; binding?: CurrentBinding },
    lease: ChangeLease,
  ) => Promise<T>,
  options: { allowCandidateDivergence?: boolean } = {},
): Promise<T> {
  if (!/^parallel-plan:[a-f0-9]{64}$/.test(planId)) {
    throw new Error('CLI_ERROR: plan ID must match parallel-plan:<sha256>.');
  }
  const initial = await loadStore(root);
  const known = initial.plans.find((plan) => plan.planId === planId);
  if (!known) domain('PARALLEL_PLAN_INVALID', `unknown plan ${planId}.`);
  const lease = await acquireParallelLease(root, known.binding.changeId);
  try {
    return await operation(await requirePlan(root, planId, true, options), lease);
  } finally {
    await releaseChangeLease(lease);
  }
}

function planAttempts(store: ParallelStore, planId: string): AttemptRecord[] {
  return store.attempts.filter((attempt) => attempt.planId === planId);
}

function latestAttempt(store: ParallelStore, planId: string, assignmentId: string): AttemptRecord | undefined {
  return planAttempts(store, planId)
    .filter((attempt) => attempt.assignmentId === assignmentId)
    .sort((left, right) => right.attempt - left.attempt || right.order - left.order)[0];
}

function projectedTransitions(store: ParallelStore, plan: StoredPlan): ParallelAttemptTransition[] {
  const transitions: ParallelAttemptTransition[] = [...planAttempts(store, plan.planId)];
  for (const retry of store.retries.filter((entry) => entry.planId === plan.planId)) {
    if (!transitions.some((entry) =>
      entry.assignmentId === retry.assignmentId && entry.attempt === retry.attempt)) {
      transitions.push({ assignmentId: retry.assignmentId, attempt: retry.attempt, state: 'running' });
    }
  }
  return transitions;
}

function project(store: ParallelStore, plan: StoredPlan, stale: boolean): ReturnType<typeof projectParallelStatus> {
  const status = projectParallelStatus(plan, projectedTransitions(store, plan), stale);
  for (const retry of store.retries.filter((entry) => entry.planId === plan.planId)) {
    const item = status.assignments.find((entry) => entry.assignmentId === retry.assignmentId);
    const persisted = store.attempts.some((entry) =>
      entry.planId === plan.planId && entry.assignmentId === retry.assignmentId && entry.attempt === retry.attempt);
    if (item && !persisted && item.state === 'running') {
      item.state = plan.assignments.find((entry) => entry.id === retry.assignmentId)!.dependsOn.every((dependency) =>
        latestAttempt(store, plan.planId, dependency)?.state === 'completed') ? 'queued' : 'waiting';
      status.counts.running -= 1;
      status.occupiedSlots -= 1;
      status.counts[item.state] += 1;
    }
  }
  return status;
}

function assignmentFor(plan: StoredPlan, assignmentId: string): ParallelAssignment {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(assignmentId)) {
    throw new Error('CLI_ERROR: assignment ID is malformed.');
  }
  const assignment = plan.assignments.find((entry) => entry.id === assignmentId);
  if (!assignment) domain('PARALLEL_PLAN_INVALID', `unknown assignment ${assignmentId}.`);
  return assignment;
}

async function runChecked(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  code: string,
  env: NodeJS.ProcessEnv,
  record?: ParallelCommandOutcome[],
): Promise<{
  command: string;
  args: string[];
  status: ProcessResult['status'];
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
}> {
  const result = await runProcess(command, args, { cwd, timeoutMs, env });
  const outcome = {
    command,
    args,
    status: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  record?.push(outcome);
  if (result.status !== 'completed' || result.exitCode !== 0) {
    domain(code, `${command} ${args.join(' ')} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return { ...outcome, exitCode: result.exitCode };
}

async function parallelCliEntry(workspace: string): Promise<string> {
  const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
  const candidates = [
    resolve(workspace, 'dist/packages/cli/src/main.js'),
    invoked,
    resolve(dirname(fileURLToPath(import.meta.url)), '../../cli/src/main.js'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../dist/packages/cli/src/main.js'),
  ];
  let entry: string | undefined;
  for (const candidate of candidates) {
    if (candidate.endsWith(`${sep}cli${sep}src${sep}main.js`) && await exists(candidate)) {
      entry = candidate;
      break;
    }
  }
  if (!entry) {
    domain('PARALLEL_VERIFICATION_ENVIRONMENT', 'cannot resolve the musubix5 CLI entry.');
  }
  return entry;
}

export function integrationGateAcceptable(result: ProcessResult): boolean {
  if (result.status !== 'completed') return false;
  if (result.exitCode === 0) return true;
  if (result.exitCode !== 1) return false;
  try {
    const report = JSON.parse(result.stdout) as {
      checks?: Array<{
        name?: string;
        required?: boolean;
        status?: string;
        diagnostics?: Array<{ code?: string }>;
      }>;
    };
    const failures = report.checks?.filter((check) => check.required && check.status !== 'pass') ?? [];
    return failures.length > 0 && failures.every((check) =>
      check.name === 'approval'
      && (check.diagnostics?.length ?? 0) > 0
      && check.diagnostics!.every((diagnostic) =>
        typeof diagnostic.code === 'string' && classifyReleaseApprovalDiagnostic(diagnostic.code)));
  } catch {
    return false;
  }
}

function integrationStatusAcceptable(result: ProcessResult): boolean {
  if (result.status !== 'completed' || result.exitCode !== 0) return false;
  try {
    const status = JSON.parse(result.stdout) as {
      initialized?: boolean;
      gate?: { status?: string; ready?: boolean };
    };
    return status.initialized === true
      && ['pass', 'fail', 'stale', 'skipped'].includes(status.gate?.status ?? '')
      && typeof status.gate?.ready === 'boolean';
  } catch {
    return false;
  }
}

/** @id CODE-M5-PARALLEL-INTEGRATION-DIAGNOSTIC-001
 * @implements REQ-M5-PARALLEL-010
 * @design DES-M5-PARALLEL-007
 */
export function formatIntegrationVerificationFailure(
  name: string,
  command: string,
  args: string[],
  result: Pick<ProcessResult, 'stdout' | 'stderr'>,
): string {
  const detail = result.stderr.trim() || result.stdout.trim() || 'no command output';
  return `${name}: ${detail} (${command} ${args.join(' ')})`;
}

async function runIntegrationCliCheck(
  localCli: string,
  args: string[],
  root: string,
  workspace: string,
  env: NodeJS.ProcessEnv,
  name: string,
  record: ParallelCommandOutcome[],
): Promise<void> {
  const commandArgs = [localCli, ...args, '--root', root, '--workspace', workspace, '--json'];
  const result = await runProcess(process.execPath, commandArgs, {
    cwd: workspace,
    timeoutMs: 300_000,
    env,
  });
  record.push({
    name,
    command: process.execPath,
    args: commandArgs,
    status: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  const acceptable = name === 'gate-changed'
    ? integrationGateAcceptable(result)
    : name === 'status'
      ? integrationStatusAcceptable(result)
      : result.status === 'completed' && result.exitCode === 0;
  if (!acceptable) {
    domain(
      'PARALLEL_INTEGRATION_VERIFICATION_FAILED',
      formatIntegrationVerificationFailure(name, process.execPath, commandArgs, result),
    );
  }
}

function configuredCommand(config: Config, name: string): CommandConfig {
  const command = config.commands.find((entry) => entry.name === name);
  if (!command) domain('PARALLEL_PLAN_INVALID', `unknown configured command ${name}.`);
  return command;
}

async function managedRunnerEnvironment(
  plan: StoredPlan,
  cwd: string,
  managedWorkspaceRoot: string,
): Promise<NodeJS.ProcessEnv> {
  const home = resolve(dirname(cwd), `.musubix-home-${basename(cwd)}`);
  await assertManagedPathAncestors(home, managedWorkspaceRoot);
  const relativeHome = relative(resolve(managedWorkspaceRoot), home);
  if (!relativeHome || relativeHome === '..' || relativeHome.startsWith(`..${sep}`) || relativeHome.startsWith('/')) {
    domain('PARALLEL_WORKTREE_CONFLICT', `managed runner home ${home} escapes the managed workspace root.`);
  }
  await rm(home, { recursive: true, force: true });
  await mkdir(home, { recursive: true });
  const env: NodeJS.ProcessEnv = {};
  for (const name of plan.policy.runnerEnvironment.passThrough) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  Object.assign(env, plan.policy.runnerEnvironment.fixed);
  env.HOME = home;
  if (process.platform === 'win32') {
    const appData = resolve(home, 'AppData', 'Roaming');
    const localAppData = resolve(home, 'AppData', 'Local');
    await Promise.all([
      mkdir(appData, { recursive: true }),
      mkdir(localAppData, { recursive: true }),
    ]);
    env.USERPROFILE = home;
    env.APPDATA = appData;
    env.LOCALAPPDATA = localAppData;
  }
  return env;
}

async function runProvisioning(
  plan: StoredPlan,
  cwd: string,
  managedWorkspaceRoot: string,
  record?: ParallelCommandOutcome[],
): Promise<ParallelCommandOutcome[]> {
  const commands = plan.authored.provisionCommandNames.map((name) => {
    const command = plan.policy.provisionCommands.find((entry) => entry.name === name);
    if (!command) domain('PARALLEL_VERIFICATION_ENVIRONMENT', `unknown provision command ${name}.`);
    return command;
  });
  const outcomes: ParallelCommandOutcome[] = [];
  const env = await managedRunnerEnvironment(plan, cwd, managedWorkspaceRoot);
  for (const command of commands) {
    outcomes.push(await runChecked(
      command.command,
      command.args,
      cwd,
      command.timeoutMs,
      'PARALLEL_VERIFICATION_ENVIRONMENT',
      env,
      record,
    ));
  }
  return outcomes;
}

async function runFocused(
  config: Config,
  plan: StoredPlan,
  assignment: ParallelAssignment,
  cwd: string,
  managedWorkspaceRoot: string,
): Promise<ParallelCommandOutcome[]> {
  const outcomes: ParallelCommandOutcome[] = [];
  const env = await managedRunnerEnvironment(plan, cwd, managedWorkspaceRoot);
  for (const focused of assignment.focusedCommands) {
    const command = configuredCommand(config, focused.name);
    outcomes.push(await runChecked(
      command.command,
      [...command.args, ...focused.args],
      command.cwd === undefined ? cwd : resolve(cwd, command.cwd),
      command.timeoutMs,
      'PARALLEL_RESULT_UNVERIFIED',
      env,
    ));
  }
  return outcomes;
}

async function resultTreeEntries(
  root: string,
  head: string,
): Promise<Array<{ path: string; mode: string; type: string }>> {
  const output = await git(root, ['ls-tree', '-r', '-z', head]);
  return output.split('\0').filter(Boolean).map((entry) => {
    const match = /^(\d{6}) ([^ ]+) [a-f0-9]+\t([\s\S]+)$/.exec(entry);
    if (!match) domain('PARALLEL_RESULT_UNVERIFIED', `cannot parse result tree entry ${entry}.`);
    return { mode: match[1]!, type: match[2]!, path: portable(match[3]!) };
  });
}

async function withDetachedVerificationWorkspace<T>(
  root: string,
  binding: CurrentBinding,
  plan: StoredPlan,
  assignmentId: string,
  attempt: number,
  head: string,
  operation: (workspace: string) => Promise<T>,
): Promise<T> {
  const legacyWorkspace = verificationWorkspacePath(
    binding.gitCommonDirectory,
    plan.binding.changeId,
    plan.planId,
    assignmentId,
    attempt,
  );
  const legacyExists = await isDirectory(legacyWorkspace);
  const identity = verificationWorkspaceIdentity({
    gitCommonDirectory: binding.gitCommonDirectory,
    changeId: plan.binding.changeId,
    planId: plan.planId,
    assignmentId,
    attempt,
    reportedHead: head,
    existing: !legacyExists ? 'missing' : await isClean(legacyWorkspace) ? 'clean-stale' : 'dirty',
  });
  if (identity.recovery === 'reject') {
    domain('PARALLEL_WORKTREE_CONFLICT', `verification workspace ${legacyWorkspace} is dirty.`);
  }
  if (identity.recovery === 'remove-and-create') {
    await git(root, ['worktree', 'remove', '--force', legacyWorkspace], 'PARALLEL_WORKTREE_CONFLICT');
  }
  const workspace = identity.path;
  await assertManagedPathAncestors(workspace, managedRoot(binding, plan));
  if (await isDirectory(workspace)) {
    if (!await isClean(workspace)) {
      domain('PARALLEL_WORKTREE_CONFLICT', `verification workspace ${workspace} is dirty.`);
    }
    await git(root, ['worktree', 'remove', '--force', workspace], 'PARALLEL_WORKTREE_CONFLICT');
  }
  await mkdir(dirname(workspace), { recursive: true });
  await git(root, ['worktree', 'add', '--quiet', '--detach', workspace, head]);
  let validationFailure: Error | undefined;
  try {
    if (!await isClean(workspace) || await git(workspace, ['rev-parse', 'HEAD']) !== head) {
      domain('PARALLEL_RESULT_UNVERIFIED', 'detached verification workspace is not clean at the reported head.');
    }
    return await operation(workspace);
  } catch (cause) {
    validationFailure = cause instanceof Error ? cause : new Error(String(cause));
    throw validationFailure;
  } finally {
    if (await isDirectory(workspace)) {
      const removed = await gitResult(root, ['worktree', 'remove', '--force', workspace]);
      if (removed.status !== 'completed' || removed.exitCode !== 0) {
        const cleanupFailure = new Error(
          `PARALLEL_WORKTREE_CONFLICT: cannot remove verification workspace ${workspace}: ${
            removed.stderr.trim() || removed.stdout.trim()
          }`,
        );
        if (validationFailure) throw detachedVerificationFailure(validationFailure, cleanupFailure);
        throw cleanupFailure;
      }
    }
  }
}

export function detachedVerificationFailure(validation: Error, cleanup: Error): Error {
  const failure = new Error(`${validation.message} Detached verification cleanup also failed: ${cleanup.message}`);
  failure.cause = validation;
  return failure;
}

async function validateAssignmentTdd(
  root: string,
  plan: StoredPlan,
  assignment: ParallelAssignment,
  attempt: AttemptRecord,
): Promise<Array<{
  requirementId: string;
  cycleId: string | null;
  testId: string;
  batchTerminalOrder: number;
}>> {
  const [changes, tdd] = await Promise.all([
    loadChangeEvidence(root),
    loadTddEvidence(root),
  ]);
  const change = changes?.changes.find((entry) => entry.changeId === plan.binding.changeId);
  const activeGeneration = change?.activeGeneration ?? change?.generation ?? null;
  if (!change || activeGeneration !== plan.binding.generation || !tdd) {
    domain(
      'PARALLEL_RESULT_UNVERIFIED',
      `current TDD evidence is unavailable for ${plan.binding.changeId} generation ${plan.binding.generation}.`,
    );
  }
  return assignment.requirementIds.map((requirementId) => {
    const resolution = selectCurrentTddCycle(change, requirementId, tdd);
    if (!resolution.selected) {
      domain(
        'PARALLEL_RESULT_UNVERIFIED',
        `${requirementId} has no current complete Red/Implementation/Green TDD cycle.`,
        { requirementId, excluded: resolution.excluded },
      );
    }
    const cycle = resolution.selected.cycle;
    if (!cycle.parallel
      || cycle.parallel.planId !== plan.planId
      || cycle.parallel.assignmentId !== assignment.id
      || cycle.parallel.attempt !== attempt.attempt
      || !cycle.parallel.worktree
      || !attempt.worktree
      || resolve(cycle.parallel.worktree) !== resolve(attempt.worktree)
      || cycle.parallel.startCommit !== attempt.startCommit) {
      domain(
        'PARALLEL_RESULT_UNVERIFIED',
        `${requirementId} TDD evidence is not bound to the current assignment attempt.`,
      );
    }
    return {
      requirementId,
      cycleId: cycle.cycleId ?? null,
      testId: cycle.testId,
      batchTerminalOrder: resolution.selected.batchTerminalOrder,
    };
  });
}

async function ensureWorktree(
  root: string,
  branch: string,
  worktree: string,
  startCommit: string,
  managedRoot: string,
): Promise<void> {
  await assertManagedPathAncestors(worktree, managedRoot);
  await mkdir(dirname(worktree), { recursive: true });
  if (await isDirectory(worktree)) {
    const [head, existingBranch] = await Promise.all([
      git(worktree, ['rev-parse', 'HEAD']),
      git(worktree, ['branch', '--show-current']),
    ]);
    if (head !== startCommit || existingBranch !== branch || !await isClean(worktree)) {
      domain('PARALLEL_WORKTREE_CONFLICT', `existing worktree ${worktree} has another identity or is dirty.`);
    }
    return;
  }
  const branchExists = await gitSucceeds(root, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`]);
  if (branchExists) {
    const branchHead = await git(root, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`]);
    if (branchHead !== startCommit) {
      domain('PARALLEL_WORKTREE_CONFLICT', `branch ${branch} points to another commit.`);
    }
    await git(root, ['worktree', 'add', '--quiet', worktree, branch]);
  } else {
    await git(root, ['worktree', 'add', '--quiet', '-b', branch, worktree, startCommit]);
  }
}

async function assignmentStart(
  root: string,
  store: ParallelStore,
  plan: StoredPlan,
  assignment: ParallelAssignment,
  branch: string,
  worktree: string,
  managedRoot: string,
): Promise<string> {
  if (await isDirectory(worktree)) {
    if (await gitSucceeds(worktree, ['rev-parse', '--verify', 'CHERRY_PICK_HEAD'])) {
      await git(worktree, ['cherry-pick', '--abort'], 'PARALLEL_WORKTREE_CONFLICT');
    }
    if (!await isClean(worktree)) {
      domain('PARALLEL_WORKTREE_CONFLICT', `recovered assignment worktree ${worktree} is dirty.`);
    }
    await git(worktree, ['reset', '--hard', plan.binding.baseCommit], 'PARALLEL_WORKTREE_CONFLICT');
  }
  await ensureWorktree(root, branch, worktree, plan.binding.baseCommit, managedRoot);
  const dependencyIds = new Set(assignment.dependsOn);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const candidate of plan.assignments) {
      if (dependencyIds.has(candidate.id)) {
        for (const dependency of candidate.dependsOn) {
          if (!dependencyIds.has(dependency)) {
            dependencyIds.add(dependency);
            expanded = true;
          }
        }
      }
    }
  }
  for (const dependency of stableTopologicalOrder(plan.assignments)
    .filter((candidate) => dependencyIds.has(candidate.id))) {
    const completed = latestAttempt(store, plan.planId, dependency.id);
    if (!completed || completed.state !== 'completed' || !completed.commits?.length) {
      domain('PARALLEL_ASSIGNMENT_STATE', `dependency ${dependency.id} is not completed.`);
    }
    for (const commit of completed.commits) {
      const cherry = await git(worktree, ['cherry', 'HEAD', commit]);
      if (cherry.split(/\r?\n/).some((line) => line === `- ${commit}`)) continue;
      const cherryPick = await gitResult(worktree, ['cherry-pick', commit]);
      if (cherryPick.status !== 'completed' || cherryPick.exitCode !== 0) {
        if (await gitSucceeds(worktree, ['rev-parse', '--verify', 'CHERRY_PICK_HEAD'])) {
          await git(worktree, ['cherry-pick', '--abort'], 'PARALLEL_WORKTREE_CONFLICT');
        }
        domain(
          'PARALLEL_WORKTREE_CONFLICT',
          cherryPick.stderr.trim() || `dependency cherry-pick failed for ${commit}.`,
        );
      }
    }
  }
  return git(worktree, ['rev-parse', 'HEAD']);
}

function integrationPaths(
  binding: CurrentBinding,
  plan: StoredPlan,
  attempt: number,
): { branch: string; worktree: string } {
  const assignmentPath = parallelWorkspacePaths(
    binding.gitCommonDirectory,
    plan.binding.changeId,
    plan.planId,
    '_integration',
    attempt,
  ).assignmentWorktree;
  const base = resolve(assignmentPath, '..', '..', '..');
  const slug = basename(resolve(assignmentPath, '..', '..', '..'));
  return {
    branch: `musubix5/${plan.binding.changeId}/${slug}/integration/attempt-${attempt}`,
    worktree: resolve(base, 'integration', `attempt-${attempt}`),
  };
}

function managedRoot(binding: CurrentBinding, plan: StoredPlan): string {
  const sample = parallelWorkspacePaths(
    binding.gitCommonDirectory,
    plan.binding.changeId,
    plan.planId,
    '_check',
    1,
  ).assignmentWorktree;
  return resolve(sample, '..', '..', '..');
}

function isUnderManagedRoot(path: string, binding: CurrentBinding, plan: StoredPlan): boolean {
  const base = managedRoot(binding, plan);
  const rel = relative(base, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith('/');
}

function verificationWorktreePaths(
  binding: CurrentBinding,
  plan: StoredPlan,
  attempts: AttemptRecord[],
): string[] {
  return attempts.flatMap((attempt) => {
    if (!attempt.head) return [];
    const legacy = verificationWorkspacePath(
      binding.gitCommonDirectory,
      plan.binding.changeId,
      plan.planId,
      attempt.assignmentId,
      attempt.attempt,
    );
    return [
      legacy,
      verificationWorkspaceIdentity({
        gitCommonDirectory: binding.gitCommonDirectory,
        changeId: plan.binding.changeId,
        planId: plan.planId,
        assignmentId: attempt.assignmentId,
        attempt: attempt.attempt,
        reportedHead: attempt.head,
        existing: 'missing',
      }).path,
    ];
  });
}

/** @id CODE-M5-PARALLEL-RUNTIME-PLAN-001
 * @implements REQ-M5-PARALLEL-001 REQ-M5-PARALLEL-002 REQ-M5-PARALLEL-003 REQ-M5-PARALLEL-011 REQ-M5-PARALLEL-013
 * @design DES-M5-PARALLEL-001 DES-M5-PARALLEL-002 DES-M5-PARALLEL-003 DES-M5-PARALLEL-009
 */
export async function validateParallelPlanFile(
  root: string,
  planFile: string,
  concurrency?: number,
): Promise<PersistedParallelPlan & { policy: ParallelPolicy }> {
  const binding = await currentBinding(root);
  const authored = parseAuthoredPlan(JSON.parse(await readText(root, planFile)));
  return {
    ...validateParallelPlan(
    authored as Omit<AuthoredParallelPlan, 'assignments'> & {
      assignments: [ParallelAssignment, ...ParallelAssignment[]];
    },
    binding.plan,
    concurrency,
    ),
    policy: binding.policy,
  };
}

export async function createParallelPlan(
  root: string,
  planFile: string,
  concurrency?: number,
): Promise<StoredPlan> {
  const binding = await currentBinding(root);
  if (!await isClean(root)) domain('PARALLEL_WORKTREE_CONFLICT', 'plan creation requires a clean candidate worktree.');
  await assertPlanBaseDescendsFromBaseline(root, binding.plan.changeId, binding.plan.baseCommit);
  const validated = await validateParallelPlanFile(root, planFile, concurrency);
  const lease = await acquireParallelLease(root, binding.plan.changeId);
  try {
    const store = await loadStore(root);
    if (store.plans.some((plan) =>
      plan.binding.changeId === binding.plan.changeId && plan.binding.generation === binding.plan.generation)) {
      domain('PARALLEL_PLAN_EXISTS', `a plan already exists for ${binding.plan.changeId} generation ${binding.plan.generation}.`);
    }
    const stalePlanIds = new Set(selectStaleParallelPlanIds(
      store.plans.map((plan) => ({
        planId: plan.planId,
        changeId: plan.binding.changeId,
        generation: plan.binding.generation,
      })),
      { changeId: binding.plan.changeId, generation: binding.plan.generation },
      binding.plan.changeId,
    ));
    const registered = await registeredWorktreePaths(root);
    const staleWithWorktrees: string[] = [];
    for (const stalePlan of store.plans.filter((plan) => stalePlanIds.has(plan.planId))) {
      const canonicalBinding = {
        ...binding,
        gitCommonDirectory: await canonicalWorkspacePath(binding.gitCommonDirectory),
      };
      const paths = [
        ...store.attempts.filter((attempt) => attempt.planId === stalePlan.planId)
          .map((attempt) => attempt.worktree),
        ...store.integrations.filter((integration) => integration.planId === stalePlan.planId)
          .map((integration) => integration.worktree),
        ...verificationWorktreePaths(
          binding,
          stalePlan,
          store.attempts.filter((attempt) => attempt.planId === stalePlan.planId),
        ),
      ];
      for (const path of paths) {
        if (!path) continue;
        const canonicalPath = await canonicalWorkspacePath(path);
        if (registered.has(canonicalPath)
          && isUnderManagedRoot(canonicalPath, canonicalBinding, stalePlan)) {
          staleWithWorktrees.push(path);
        }
      }
    }
    if (staleWithWorktrees.length) {
      domain('PARALLEL_STALE_WORKTREES_PRESENT', 'stale managed worktrees must be cleaned before plan creation.');
    }
    const stored: StoredPlan = {
      ...validated,
      policy: binding.policy,
      createdOrder: ordered(store),
    };
    store.plans.push(stored);
    await persistParallelTransition(root, lease, stored, store, {
      entity: 'plan',
      attempt: 1,
      transition: 'created',
      payload: stored,
    });
    return stored;
  } finally {
    await releaseChangeLease(lease);
  }
}

export async function prepareParallelPlanRuntime(root: string, planId: string): Promise<PreparedRecord> {
  return withPlanLease(root, planId, async ({ store, plan, binding }, lease) => {
    const existing = store.prepared.find((entry) => entry.planId === planId);
    if (existing) return existing;
    for (const commandName of plan.authored.provisionCommandNames) {
      const command = plan.policy.provisionCommands.find((entry) => entry.name === commandName);
      if (!command) domain('PARALLEL_VERIFICATION_ENVIRONMENT', `unknown provision command ${commandName}.`);
      const probe = await runProcess(command.command, ['--version'], { cwd: root, timeoutMs: 10_000 });
      if (probe.status !== 'completed' || probe.exitCode !== 0) {
        domain('PARALLEL_VERIFICATION_ENVIRONMENT', `provision executable ${command.command} is unavailable.`);
      }
    }
    const record = {
      planId,
      preparedOrder: ordered(store),
      gitCommonDirectory: binding!.gitCommonDirectory,
    };
    store.prepared.push(record);
    await persistParallelTransition(root, lease, plan, store, {
      entity: 'plan',
      attempt: 1,
      transition: 'prepared',
      payload: record,
    });
    return record;
  });
}

/** @id CODE-M5-PARALLEL-RUNTIME-ASSIGNMENT-001
 * @implements REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-003 REQ-M5-PARALLEL-004 REQ-M5-PARALLEL-005 REQ-M5-PARALLEL-006 REQ-M5-PARALLEL-007 REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-014 REQ-M5-PARALLEL-015
 * @design DES-M5-012 DES-M5-PARALLEL-003 DES-M5-PARALLEL-004 DES-M5-PARALLEL-005 DES-M5-PARALLEL-006 DES-M5-PARALLEL-010
 */
export async function issueParallelAssignmentInstruction(
  root: string,
  planId: string,
  assignmentId: string,
): Promise<ParallelCommandOutcome> {
  return withPlanLease(root, planId, async ({ store, plan, binding }, lease) => {
    if (!store.prepared.some((entry) => entry.planId === planId)) {
      domain('PARALLEL_ASSIGNMENT_STATE', 'plan must be prepared before issuing assignments.');
    }
    const assignment = assignmentFor(plan, assignmentId);
    const status = project(store, plan, false);
    const projected = status.assignments.find((entry) => entry.assignmentId === assignmentId)!;
    if (projected.state === 'running') {
      const current = latestAttempt(store, planId, assignmentId)!;
      return instructionManifest(root, plan, assignment, current);
    }
    if (projected.state !== 'queued') {
      domain('PARALLEL_ASSIGNMENT_STATE', `${assignmentId} is ${projected.state}, not queued.`);
    }
    if (status.occupiedSlots >= plan.concurrency) {
      domain('PARALLEL_CONCURRENCY_LIMIT', `plan concurrency ${plan.concurrency} is fully occupied.`);
    }
    const retry = store.retries.filter((entry) => entry.planId === planId && entry.assignmentId === assignmentId)
      .sort((left, right) => right.attempt - left.attempt)[0];
    const attempt = retry?.attempt ?? 1;
    const paths = parallelWorkspacePaths(
      binding!.gitCommonDirectory,
      plan.binding.changeId,
      planId,
      assignmentId,
      attempt,
    );
    const startCommit = await assignmentStart(
      root,
      store,
      plan,
      assignment,
      paths.assignmentBranch,
      paths.assignmentWorktree,
      managedRoot(binding!, plan),
    );
    const record: AttemptRecord = {
      planId,
      assignmentId,
      attempt,
      state: 'running',
      order: ordered(store),
      branch: paths.assignmentBranch,
      worktree: paths.assignmentWorktree,
      startCommit,
    };
    store.attempts.push(record);
    await persistParallelTransition(root, lease, plan, store, {
      entity: `assignment:${assignmentId}`,
      attempt,
      transition: 'running',
      payload: record,
    });
    return instructionManifest(root, plan, assignment, record);
  });
}

function instructionManifest(
  root: string,
  plan: StoredPlan,
  assignment: ParallelAssignment,
  attempt: AttemptRecord,
): ParallelCommandOutcome {
  const tddCommands = assignment.requirementIds.map((requirementId, index) => {
    const focused = assignment.focusedCommands[index] ?? assignment.focusedCommands[0]!;
    const testId = focused.args.find((arg) => /^TEST-[A-Z0-9-]+$/.test(arg)) ?? '<TEST-ID>';
    return {
      requirementId,
      testId,
      commandName: focused.name,
      ...buildAssignmentTddCommands({
        controlRoot: root,
        worktree: attempt.worktree!,
        changeId: plan.binding.changeId,
        requirementId,
        testId,
        commandName: focused.name,
        planId: plan.planId,
        assignmentId: assignment.id,
        attempt: attempt.attempt,
        startCommit: attempt.startCommit!,
      }),
    };
  });
  return {
    schemaVersion: 1,
    changeId: plan.binding.changeId,
    generation: plan.binding.generation,
    planId: plan.planId,
    assignmentId: assignment.id,
    attempt: attempt.attempt,
    role: assignment.role,
    requirementIds: assignment.requirementIds,
    requirementsApprovalSha256: plan.binding.requirementsApprovalSha256,
    designApprovalSha256: plan.binding.designApprovalSha256,
    controlRoot: root,
    branch: attempt.branch,
    worktree: attempt.worktree,
    startCommit: attempt.startCommit,
    ownedPaths: assignment.ownedPaths,
    integratorOwnedPaths: plan.authored.integratorOwnedPaths,
    focusedCommands: assignment.focusedCommands,
    provisionCommandNames: plan.authored.provisionCommandNames,
    tddCommands,
    prohibitedOperations: plan.policy.prohibitedAgentOperations,
    commitIdentity: plan.policy.agentCommitIdentity,
    commands: {
      heartbeat: `musubix5 parallel assignment heartbeat ${plan.planId} ${assignment.id} --attempt ${attempt.attempt}`,
      fail: `musubix5 parallel assignment fail ${plan.planId} ${assignment.id} --attempt ${attempt.attempt} --reason <text>`,
      result: `musubix5 parallel assignment result ${plan.planId} ${assignment.id} --attempt ${attempt.attempt} --head <sha>`,
    },
    resultContract: { head: 'Git commit SHA at the assignment branch tip' },
  };
}

export async function recordParallelHeartbeat(
  root: string,
  planId: string,
  assignmentId: string,
  attempt: number,
): Promise<ParallelCommandOutcome> {
  const { store, plan, binding } = await requirePlan(root, planId);
  assignmentFor(plan, assignmentId);
  const current = latestAttempt(store, planId, assignmentId);
  if (!current || current.attempt !== attempt || current.state !== 'running') {
    domain('PARALLEL_ASSIGNMENT_STATE', `${assignmentId} attempt ${attempt} is not running.`);
  }
  const path = parallelWorkspacePaths(
    binding!.gitCommonDirectory,
    plan.binding.changeId,
    planId,
    assignmentId,
    attempt,
  ).heartbeatPath;
  const relativePath = portable(relative(root, path));
  if (relativePath.startsWith('../')) {
    await mkdir(dirname(path), { recursive: true });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, `${JSON.stringify({ schemaVersion: 1, planId, assignmentId, attempt, heartbeatAt: new Date().toISOString() }, null, 2)}\n`);
  } else {
    await writeJson(root, relativePath, {
      schemaVersion: 1,
      planId,
      assignmentId,
      attempt,
      heartbeatAt: new Date().toISOString(),
    });
  }
  return { planId, assignmentId, attempt, heartbeatPath: path };
}

export async function failParallelAssignment(
  root: string,
  planId: string,
  assignmentId: string,
  attempt: number,
  reason: string,
): Promise<AttemptRecord> {
  if (!reason.trim()) domain('PARALLEL_ASSIGNMENT_STATE', 'failure reason must be non-empty.');
  return withPlanLease(root, planId, async ({ store, plan }, lease) => {
    assignmentFor(plan, assignmentId);
    const current = latestAttempt(store, planId, assignmentId);
    if (current?.attempt === attempt && current.state === 'failed') return current;
    if (!current || current.attempt !== attempt || current.state !== 'running') {
      domain('PARALLEL_ASSIGNMENT_STATE', `${assignmentId} attempt ${attempt} is not running.`);
    }
    const failed: AttemptRecord = { ...current, state: 'failed', reason, order: ordered(store) };
    store.attempts.push(failed);
    await persistParallelTransition(root, lease, plan, store, {
      entity: `assignment:${assignmentId}`,
      attempt,
      transition: 'failed',
      payload: failed,
    });
    return failed;
  });
}

export async function retryParallelAssignment(
  root: string,
  planId: string,
  assignmentId: string,
): Promise<RetryRecord> {
  return withPlanLease(root, planId, async ({ store, plan }, lease) => {
    assignmentFor(plan, assignmentId);
    const transitions = planAttempts(store, planId);
    const attempt = nextRetryAttempt(transitions, assignmentId);
    const existing = store.retries.find((entry) =>
      entry.planId === planId && entry.assignmentId === assignmentId && entry.attempt === attempt);
    if (existing) return existing;
    const retry = { planId, assignmentId, attempt, order: ordered(store) };
    store.retries.push(retry);
    await persistParallelTransition(root, lease, plan, store, {
      entity: `assignment:${assignmentId}`,
      attempt,
      transition: 'retry',
      payload: retry,
    });
    return retry;
  });
}

export async function recordParallelAssignmentResult(
  root: string,
  planId: string,
  assignmentId: string,
  attempt: number,
  head: string,
): Promise<ParallelCommandOutcome> {
  if (!shaPattern.test(head)) domain('PARALLEL_RESULT_UNVERIFIED', 'reported head is not a Git commit SHA.');
  const { store, plan, binding } = await requirePlan(root, planId);
  const assignment = assignmentFor(plan, assignmentId);
  const current = latestAttempt(store, planId, assignmentId);
  if (!current || current.attempt !== attempt || current.state !== 'running'
    || !current.startCommit || !current.worktree || !current.branch) {
    domain('PARALLEL_ASSIGNMENT_STATE', `${assignmentId} attempt ${attempt} is not running.`);
  }
  const branchHead = await git(root, ['rev-parse', '--verify', `refs/heads/${current.branch}^{commit}`]);
  if (branchHead !== head || !await gitSucceeds(root, ['merge-base', '--is-ancestor', current.startCommit, head])) {
    domain('PARALLEL_RESULT_UNVERIFIED', 'reported head does not extend the persisted assignment start commit.');
  }
  const commits = (await git(root, ['rev-list', '--reverse', `${current.startCommit}..${head}`]))
    .split(/\r?\n/).filter(Boolean);
  if (!commits.length) domain('PARALLEL_RESULT_UNVERIFIED', 'assignment result has no commits.');
  const changedPaths = (await git(root, [
    'diff-tree',
    '--root',
    '--no-commit-id',
    '--name-only',
    '-r',
    '-m',
    '-z',
    ...commits,
  ]))
    .split('\0').filter(Boolean).map(portable);
  validateOwnedPaths(changedPaths, assignment.ownedPaths, plan.authored.integratorOwnedPaths);
  validateParallelResultEntries(await resultTreeEntries(root, head));
  const tdd = await validateAssignmentTdd(root, plan, assignment, current);
  const { provisioning, focused } = await withDetachedVerificationWorkspace(
    root,
    binding!,
    plan,
    assignmentId,
    attempt,
    head,
    async (workspace) => ({
      provisioning: await runProvisioning(plan, workspace, managedRoot(binding!, plan)),
      focused: await runFocused(binding!.config, plan, assignment, workspace, managedRoot(binding!, plan)),
    }),
  );
  return withPlanLease(root, planId, async ({ store: currentStore, plan: currentPlan }, lease) => {
    const latest = latestAttempt(currentStore, planId, assignmentId);
    if (!latest || latest.attempt !== attempt || latest.state !== 'running'
      || latest.startCommit !== current.startCommit || latest.branch !== current.branch) {
      domain('PARALLEL_ASSIGNMENT_STATE', `${assignmentId} attempt ${attempt} changed during verification.`);
    }
    const completed: AttemptRecord = {
      ...latest,
      state: 'completed',
      order: ordered(currentStore),
      head,
      commits,
      tdd,
    };
    currentStore.attempts.push(completed);
    await persistParallelTransition(root, lease, currentPlan, currentStore, {
      entity: `assignment:${assignmentId}`,
      attempt,
      transition: 'completed',
      payload: completed,
    });
    return { attempt: completed, changedPaths, tdd, provisioning, focused };
  });
}

export async function classifyStoredParallelTddCycle(
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
  return classifyParallelTddEvidence(root, input);
}

export async function parallelRuntimeStatus(
  root: string,
  options: { planId?: string; changeId?: string },
): Promise<ParallelCommandOutcome> {
  const store = await loadStore(root);
  if (options.changeId) {
    const context = await resolveChangeContext(root, { changeId: options.changeId, maintenance: true });
    if (!context) domain('PARALLEL_PLAN_INVALID', `unknown CHANGE ${options.changeId}.`);
    const plans = store.plans.filter((plan) => plan.binding.changeId === options.changeId);
    let current: CurrentBinding | undefined;
    try { current = await currentBinding(root); } catch { current = undefined; }
    return {
      schemaVersion: 1,
      changeId: options.changeId,
      maintenance: true,
      plans: plans.map((plan) => {
        const handedOff = store.handoffs.some((entry) =>
          entry.planId === plan.planId && entry.candidateCommit === current?.plan.baseCommit);
        const stale = !current
          || plan.binding.changeId !== current.plan.changeId
          || plan.binding.generation !== current.plan.generation
          || (!handedOff && plan.binding.baseCommit !== current.plan.baseCommit)
          || canonical(plan.binding.requirementIds) !== canonical(current.plan.requirementIds)
          || plan.binding.commandSetSha256 !== current.plan.commandSetSha256;
        return { planId: plan.planId, generation: plan.binding.generation, stale, ...project(store, plan, stale) };
      }),
    };
  }
  if (!options.planId) domain('PARALLEL_PLAN_INVALID', 'status requires a plan ID or --change-id.');
  const plan = store.plans.find((entry) => entry.planId === options.planId);
  if (!plan) domain('PARALLEL_PLAN_INVALID', `unknown plan ${options.planId}.`);
  let stale = false;
  try { await requirePlan(root, plan.planId); } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('PARALLEL_PLAN_STALE:')) stale = true;
    else throw cause;
  }
  return {
    schemaVersion: 1,
    planId: plan.planId,
    changeId: plan.binding.changeId,
    generation: plan.binding.generation,
    stale,
    prepared: store.prepared.some((entry) => entry.planId === plan.planId),
    ...project(store, plan, stale),
    integration: store.integrations.filter((entry) => entry.planId === plan.planId)
      .sort((left, right) => right.attempt - left.attempt)[0] ?? null,
    handoff: store.handoffs.find((entry) => entry.planId === plan.planId) ?? null,
  };
}

/** @id CODE-M5-PARALLEL-RUNTIME-INTEGRATION-001
 * @implements REQ-M5-TDD-003 REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-012 REQ-M5-PARALLEL-016
 * @design DES-M5-011 DES-M5-PARALLEL-004 DES-M5-PARALLEL-006 DES-M5-PARALLEL-007 DES-M5-PARALLEL-008
 */
export async function startParallelIntegration(root: string, planId: string): Promise<IntegrationRecord> {
  return withPlanLease(root, planId, async ({ store, plan, binding }, lease) => {
  const completed = stableTopologicalOrder(plan.assignments).map((assignment) =>
    latestAttempt(store, planId, assignment.id));
  if (completed.some((attempt) => !attempt || attempt.state !== 'completed' || !attempt.commits?.length)) {
    domain('PARALLEL_INTEGRATION_INCOMPLETE', 'every assignment must be completed before integration.');
  }
  let integration = store.integrations.filter((entry) => entry.planId === planId)
    .sort((left, right) => right.attempt - left.attempt)[0];
  if (integration?.state === 'provisional' || integration?.state === 'verified') return integration;
  if (integration?.state === 'conflict' || integration?.state === 'verification-failed') {
    domain(
      'PARALLEL_ASSIGNMENT_STATE',
      `integration attempt ${integration.attempt} is ${integration.state}; run parallel integration reopen first.`,
    );
  }
  const attempt = integration?.state === 'closed' ? integration.attempt + 1 : integration?.attempt ?? 1;
  if (!integration || integration.state === 'closed') {
    const paths = integrationPaths(binding!, plan, attempt);
    await ensureWorktree(
      root,
      paths.branch,
      paths.worktree,
      plan.binding.baseCommit,
      managedRoot(binding!, plan),
    );
    integration = {
      planId,
      attempt,
      order: ordered(store),
      branch: paths.branch,
      worktree: paths.worktree,
      state: 'running',
      consumedAssignmentIds: [],
    };
    store.integrations.push(integration);
    await persistParallelTransition(root, lease, plan, store, {
      entity: 'integration',
      attempt,
      transition: 'running',
      payload: integration,
    });
  }
  for (const assignment of stableTopologicalOrder(plan.assignments)) {
    if (integration.consumedAssignmentIds.includes(assignment.id)) continue;
    const result = latestAttempt(store, planId, assignment.id)!;
    if (await git(root, ['rev-parse', '--verify', `refs/heads/${result.branch}^{commit}`]) !== result.head) {
      integration.state = 'conflict';
      integration.reason = `${assignment.id} branch head changed`;
      integration.order = ordered(store);
      await persistParallelTransition(root, lease, plan, store, {
        entity: 'integration',
        attempt,
        transition: `conflict:${assignment.id}`,
        payload: integration,
      });
      domain('PARALLEL_INTEGRATION_CONFLICT', integration.reason);
    }
    for (const commit of result.commits!) {
      const cherry = await git(integration.worktree, ['cherry', 'HEAD', commit]);
      if (cherry.split(/\r?\n/).some((line) => line === `- ${commit}`)) continue;
      const cherryPick = await gitResult(integration.worktree, ['cherry-pick', commit]);
      if (cherryPick.status !== 'completed' || cherryPick.exitCode !== 0) {
        integration.state = 'conflict';
        integration.reason = cherryPick.stderr.trim() || `cherry-pick failed for ${commit}`;
        if (await gitSucceeds(integration.worktree, ['rev-parse', '--verify', 'CHERRY_PICK_HEAD'])) {
          const abort = await gitResult(integration.worktree, ['cherry-pick', '--abort']);
          if (abort.status !== 'completed' || abort.exitCode !== 0) {
            integration.reason += `; cherry-pick abort failed: ${abort.stderr.trim() || abort.stdout.trim()}`;
          }
        }
        integration.order = ordered(store);
        await persistParallelTransition(root, lease, plan, store, {
          entity: 'integration',
          attempt,
          transition: `conflict:${assignment.id}:${commit}`,
          payload: integration,
        });
        domain('PARALLEL_INTEGRATION_CONFLICT', integration.reason);
      }
    }
    integration.consumedAssignmentIds.push(assignment.id);
    integration.order = ordered(store);
    await persistParallelTransition(root, lease, plan, store, {
      entity: 'integration',
      attempt,
      transition: `consumed:${assignment.id}`,
      payload: integration,
    });
  }
  const integrationCommit = await git(integration.worktree, ['rev-parse', 'HEAD']);
  integration.provenance = buildIntegrationProvenance({
    planId,
    attempt,
    integrationCommit,
    assignments: stableTopologicalOrder(plan.assignments).map((assignment) => {
      const result = latestAttempt(store, planId, assignment.id)!;
      return {
        assignmentId: assignment.id,
        attempt: result.attempt,
        startCommit: result.startCommit!,
        head: result.head!,
        commits: result.commits!,
      };
    }),
  });
  integration.state = 'provisional';
  integration.order = ordered(store);
  await persistParallelTransition(root, lease, plan, store, {
    entity: 'integration',
    attempt,
    transition: 'provisional',
    payload: integration,
  });
  return integration;
  });
}

export async function reopenParallelIntegration(
  root: string,
  planId: string,
  assignmentIds: string[],
  reason: string,
): Promise<ParallelCommandOutcome> {
  if (!assignmentIds.length || !reason.trim()) {
    domain('PARALLEL_ASSIGNMENT_STATE', 'integration reopen requires assignments and a non-empty reason.');
  }
  return withPlanLease(root, planId, async ({ store, plan, binding }, lease) => {
  const integration = store.integrations.filter((entry) => entry.planId === planId)
    .sort((left, right) => right.attempt - left.attempt)[0];
  if (!integration) {
    domain('PARALLEL_ASSIGNMENT_STATE', 'integration is not reopenable.');
  }
  assertIntegrationReopenable(integration.state, integration.reason);
  const named = new Set(assignmentIds);
  for (const assignmentId of named) {
    const assignment = assignmentFor(plan, assignmentId);
    const current = latestAttempt(store, planId, assignmentId);
    if (!current || current.state !== 'completed') {
      domain('PARALLEL_ASSIGNMENT_STATE', `${assignmentId} is not completed.`);
    }
    const dependentIds = new Set<string>();
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const candidate of plan.assignments) {
        if (!dependentIds.has(candidate.id)
          && candidate.dependsOn.some((dependency) =>
            dependency === assignment.id || dependentIds.has(dependency))) {
          dependentIds.add(candidate.id);
          expanded = true;
        }
      }
    }
    if ([...dependentIds].some((candidateId) => latestAttempt(store, planId, candidateId)?.state === 'completed'
      && !named.has(candidateId))) {
      domain('PARALLEL_ASSIGNMENT_STATE', `${assignmentId} reopen set is not dependency-closed.`);
    }
  }
  if (!isUnderManagedRoot(integration.worktree, binding!, plan)) {
    domain('PARALLEL_WORKTREE_CONFLICT', 'integration worktree is outside the managed parallel workspace root.');
  }
  if (await isDirectory(integration.worktree)) {
    if (await gitSucceeds(integration.worktree, ['rev-parse', '--verify', 'CHERRY_PICK_HEAD'])) {
      const abort = await gitResult(integration.worktree, ['cherry-pick', '--abort']);
      if (abort.status !== 'completed' || abort.exitCode !== 0) {
        domain(
          'PARALLEL_WORKTREE_CONFLICT',
          `cannot abort the integration cherry-pick: ${abort.stderr.trim() || abort.stdout.trim()}`,
        );
      }
    }
    if (!await isClean(integration.worktree)) {
      await git(integration.worktree, ['reset', '--hard', 'HEAD'], 'PARALLEL_WORKTREE_CONFLICT');
      await git(integration.worktree, ['clean', '-fdx'], 'PARALLEL_WORKTREE_CONFLICT');
    }
    if (!await isClean(integration.worktree)) {
      domain('PARALLEL_WORKTREE_CONFLICT', 'cannot restore the integration worktree to a clean state.');
    }
    await git(root, ['worktree', 'remove', integration.worktree], 'PARALLEL_WORKTREE_CONFLICT');
    if (await isDirectory(integration.worktree)) {
      domain('PARALLEL_WORKTREE_CONFLICT', 'closed integration worktree still exists after removal.');
    }
  }
  const failedAttempts: AttemptRecord[] = [];
  for (const assignmentId of named) {
    const current = latestAttempt(store, planId, assignmentId)!;
    const failed = { ...current, state: 'failed' as const, reason, order: ordered(store) };
    store.attempts.push(failed);
    failedAttempts.push(failed);
  }
  integration.state = 'closed';
  integration.reason = reason;
  delete integration.provenance;
  integration.order = ordered(store);
  await persistParallelTransition(root, lease, plan, store, {
    entity: 'integration',
    attempt: integration.attempt,
    transition: 'reopened',
    payload: {
      integration,
      attempts: failedAttempts,
      assignments: [...named],
      reason,
    },
  });
  return { planId, closedAttempt: integration.attempt, assignments: [...named], reason };
  });
}

export async function verifyParallelIntegration(
  root: string,
  planId: string,
): Promise<ParallelCommandOutcome> {
  const { store, plan, binding } = await requirePlan(root, planId);
  const integration = store.integrations.filter((entry) => entry.planId === planId)
    .sort((left, right) => right.attempt - left.attempt)[0];
  if (!integration?.provenance || integration.state !== 'provisional') {
    domain('PARALLEL_INTEGRATION_VERIFICATION_FAILED', 'current integration has no provisional provenance.');
  }
  const verification = {
    provisioning: [] as ParallelCommandOutcome[],
    commands: [] as ParallelCommandOutcome[],
    checks: [] as ParallelCommandOutcome[],
  };
  integration.verification = verification;
  try {
    const workspaceRoot = managedRoot(binding!, plan);
    await runProvisioning(plan, integration.worktree, workspaceRoot, verification.provisioning);
    const env = await managedRunnerEnvironment(plan, integration.worktree, workspaceRoot);
    for (const command of binding!.config.commands.filter((entry) => entry.required)) {
      await runChecked(
        command.command,
        command.args,
        commandCwd(integration.worktree, command),
        command.timeoutMs,
        'PARALLEL_INTEGRATION_VERIFICATION_FAILED',
        env,
        verification.commands,
      );
    }
    const localCli = await parallelCliEntry(integration.worktree);
    const checks = [
      { name: 'trace-strict', args: ['trace', 'check', '--strict'] },
      { name: 'graph-gate', args: ['graph', 'gate'] },
      {
        name: 'gate-changed',
        args: ['gate', '--changed', '--parallel-verification', planId],
      },
      { name: 'status', args: ['status'] },
    ];
    for (const check of checks) {
      await runIntegrationCliCheck(
        localCli,
        check.args,
        root,
        integration.worktree,
        env,
        check.name,
        verification.checks,
      );
    }
    const head = await git(integration.worktree, ['rev-parse', 'HEAD']);
    return withPlanLease(root, planId, async ({ store: currentStore, plan: currentPlan }, lease) => {
      const current = currentStore.integrations.filter((entry) => entry.planId === planId)
        .sort((left, right) => right.attempt - left.attempt)[0];
      if (!current?.provenance || current.attempt !== integration.attempt || current.state !== 'provisional'
        || current.provenance.integrationCommit !== integration.provenance!.integrationCommit) {
        domain('PARALLEL_INTEGRATION_VERIFICATION_FAILED', 'integration changed during verification.');
      }
      current.verification = verification;
      current.provenance = verifyIntegrationProvenance(current.provenance, head);
      current.state = 'verified';
      current.order = ordered(currentStore);
      await persistParallelTransition(root, lease, currentPlan, currentStore, {
        entity: 'integration',
        attempt: current.attempt,
        transition: 'verified',
        payload: current,
      });
      return { integration: current, verification };
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    const code = /^([A-Z0-9_]+):/.exec(reason)?.[1]
      ?? 'PARALLEL_INTEGRATION_VERIFICATION_FAILED';
    await withPlanLease(root, planId, async ({ store: currentStore, plan: currentPlan }, lease) => {
      const current = currentStore.integrations.filter((entry) => entry.planId === planId)
        .sort((left, right) => right.attempt - left.attempt)[0];
      if (!current || current.attempt !== integration.attempt || current.state !== 'provisional') {
        domain('PARALLEL_INTEGRATION_VERIFICATION_FAILED', 'integration changed during verification.');
      }
      current.verification = verification;
      current.reason = reason;
      current.state = integrationFailureTransition(code).state;
      current.order = ordered(currentStore);
      await persistParallelTransition(root, lease, currentPlan, currentStore, {
        entity: 'integration',
        attempt: current.attempt,
        transition: current.state === 'provisional' ? 'verification-environment' : current.state,
        payload: current,
      });
    });
    if (reason.startsWith('PARALLEL_VERIFICATION_ENVIRONMENT:')) throw cause;
    domain('PARALLEL_INTEGRATION_VERIFICATION_FAILED', reason);
  }
}

export async function handoffParallelPlan(root: string, planId: string): Promise<HandoffRecord> {
  return withPlanLease(root, planId, async ({ store, plan }, lease) => {
    const existing = store.handoffs.find((entry) => entry.planId === planId);
    if (existing) return existing;
    const integration = store.integrations.find((entry) =>
      entry.planId === planId && entry.state === 'verified' && entry.provenance?.status === 'verified');
    if (!integration?.provenance) {
      domain('PARALLEL_INTEGRATION_INCOMPLETE', 'verified integration provenance is required for handoff.');
    }
    const candidateHead = await git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).catch(() => null);
    const reason = classifyCandidateHandoff(
      candidateHead,
      plan.binding.baseCommit,
      await isCleanOutsidePaths(root, plan.authored.integratorOwnedPaths),
    );
    if (reason !== 'ready') {
      domain('PARALLEL_CANDIDATE_DIVERGED', `candidate is ${reason}.`, { reason });
    }
    await git(root, ['merge', '--ff-only', integration.provenance.integrationCommit], 'PARALLEL_CANDIDATE_DIVERGED');
    const record = {
      planId,
      order: ordered(store),
      candidateCommit: await git(root, ['rev-parse', 'HEAD']),
      candidateIdentity: '',
      integrationEvidenceHead: integration.provenance.integrationCommit,
    };
    record.candidateIdentity = `candidate:${record.candidateCommit}`;
    store.handoffs.push(record);
    await persistParallelTransition(root, lease, plan, store, {
      entity: 'handoff',
      attempt: integration.attempt,
      transition: 'completed',
      payload: record,
    });
    return record;
  }, { allowCandidateDivergence: true });
}

async function removeWorktree(root: string, path: string): Promise<void> {
  await git(root, ['worktree', 'remove', path], 'PARALLEL_WORKTREE_CONFLICT');
}

export async function cleanupParallelRuntime(
  root: string,
  options: { planId?: string; changeId?: string },
): Promise<CleanupRecord | { schemaVersion: 1; changeId: string; records: CleanupRecord[] }> {
  if (options.changeId) {
    const context = await resolveChangeContext(root, { changeId: options.changeId, maintenance: true });
    if (!context) domain('PARALLEL_PLAN_INVALID', `unknown CHANGE ${options.changeId}.`);
    const lease = await acquireParallelLease(root, options.changeId);
    try {
    const store = await loadStore(root);
    let active: { changeId: string; generation: number } | null = null;
    try {
      const current = await currentBinding(root);
      active = { changeId: current.plan.changeId, generation: current.plan.generation };
    } catch {
      active = null;
    }
    const stalePlanIds = new Set(selectStaleParallelPlanIds(
      store.plans.map((plan) => ({
        planId: plan.planId,
        changeId: plan.binding.changeId,
        generation: plan.binding.generation,
      })),
      active,
      options.changeId,
    ));
    const records: CleanupRecord[] = [];
    for (const plan of store.plans.filter((entry) => stalePlanIds.has(entry.planId))) {
      const binding = {
        ...(await currentBinding(root).catch(() => ({
          gitCommonDirectory: '',
        } as CurrentBinding))),
      } as CurrentBinding;
      if (!binding.gitCommonDirectory) binding.gitCommonDirectory = await gitCommonDirectory(root);
      const removed: string[] = [];
      const retained: Array<{ path: string; reason: string }> = [];
      const paths = [
        ...planAttempts(store, plan.planId).map((entry) => entry.worktree).filter((path): path is string => !!path),
        ...store.integrations.filter((entry) => entry.planId === plan.planId).map((entry) => entry.worktree),
      ];
      for (const path of [...new Set(paths)]) {
        if (!isUnderManagedRoot(path, binding, plan)) {
          retained.push({ path, reason: 'outside-managed-root' });
        } else if (!await isDirectory(path)) {
          continue;
        } else if (!await isClean(path)) {
          retained.push({ path, reason: 'dirty' });
        } else {
          await assertManagedPathAncestors(path, managedRoot(binding, plan));
          await removeWorktree(root, path);
          removed.push(path);
        }
      }
      const record = {
        planId: plan.planId,
        order: ordered(store),
        maintenance: true,
        removed,
        retained,
      };
      store.maintenance.push(record);
      records.push(record);
      await persistParallelTransition(root, lease, plan, store, {
        entity: 'cleanup',
        attempt: store.maintenance.filter((entry) => entry.planId === plan.planId).length,
        transition: 'stale-maintenance',
        payload: record,
      });
    }
    return { schemaVersion: 1, changeId: options.changeId, records };
    } finally {
      await releaseChangeLease(lease);
    }
  }
  if (!options.planId) domain('PARALLEL_PLAN_INVALID', 'cleanup requires a plan ID or --change-id.');
  return withPlanLease(root, options.planId, async ({ store, plan, binding }, lease) => {
  const existing = store.cleanups.find((entry) => entry.planId === plan.planId);
  if (existing) return existing;
  if (!store.handoffs.some((entry) => entry.planId === plan.planId)) {
    domain('PARALLEL_INTEGRATION_INCOMPLETE', 'candidate handoff is required before cleanup.');
  }
  const integration = store.integrations.find((entry) =>
    entry.planId === plan.planId && entry.state === 'verified' && entry.provenance?.status === 'verified');
  const removed: string[] = [];
  const retained: Array<{ path: string; reason: string }> = [];
  for (const assignment of plan.assignments) {
    const attempt = latestAttempt(store, plan.planId, assignment.id);
    if (!attempt?.worktree || !await isDirectory(attempt.worktree)) continue;
    const consumedCount = integration?.provenance?.assignments.filter((entry) =>
      entry.assignmentId === assignment.id && entry.attempt === attempt.attempt).length ?? 0;
    const eligibility = cleanupEligibility({
      state: attempt.state === 'running' ? 'unknown' : attempt.state,
      clean: await isClean(attempt.worktree),
      consumedCount,
      provenanceStatus: integration?.provenance?.status ?? 'missing',
    });
    if (eligibility === 'remove' && isUnderManagedRoot(attempt.worktree, binding!, plan)) {
      await assertManagedPathAncestors(attempt.worktree, managedRoot(binding!, plan));
      await removeWorktree(root, attempt.worktree);
      removed.push(attempt.worktree);
    } else {
      retained.push({ path: attempt.worktree, reason: eligibility });
    }
  }
  if (integration && await isDirectory(integration.worktree)) {
    if (await isClean(integration.worktree) && isUnderManagedRoot(integration.worktree, binding!, plan)) {
      await assertManagedPathAncestors(integration.worktree, managedRoot(binding!, plan));
      await removeWorktree(root, integration.worktree);
      removed.push(integration.worktree);
    } else retained.push({ path: integration.worktree, reason: 'dirty' });
  }
  for (const path of verificationWorktreePaths(binding!, plan, planAttempts(store, plan.planId))) {
    if (!await isDirectory(path)) continue;
    if (await isClean(path) && isUnderManagedRoot(path, binding!, plan)) {
      await assertManagedPathAncestors(path, managedRoot(binding!, plan));
      await removeWorktree(root, path);
      removed.push(path);
    } else {
      retained.push({ path, reason: 'dirty' });
    }
  }
  const record = {
    planId: plan.planId,
    order: ordered(store),
    maintenance: false,
    removed,
    retained,
  };
  store.cleanups.push(record);
  await persistParallelTransition(root, lease, plan, store, {
    entity: 'cleanup',
    attempt: integration?.attempt ?? 1,
    transition: 'completed',
    payload: record,
  });
  return record;
  });
}
