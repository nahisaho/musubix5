import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { canonicalBytes, sha256 } from './canonical.js';
import { files, safePath } from './files.js';
import { authoritativeCandidateTestIds } from './trace.js';
import ts from 'typescript';

export const candidateCommandOrder = [
  'typecheck', 'build', 'test', 'codegraph-tests', 'compatibility', 'pack-check', 'pack-smoke',
] as const;
export interface CandidatePartitionPlan {
  id: string;
  ordinal: number;
  wave: number;
  pool: 'forks' | 'threads';
  maxWorkers: number;
  fanout: number;
  files: string[];
  testIds: string[];
  timeoutMs: number;
}
export interface CandidateCommandPlan {
  name: typeof candidateCommandOrder[number];
  executable: string;
  args: string[];
  timeoutMs: number;
  include: string[];
  exclude: string[];
  testIds: string[];
  partitions: CandidatePartitionPlan[];
  mergeAllowanceMs: number;
  terminationAllowanceMs: number;
}
export interface CandidateExecutionPlan {
  schemaVersion: 1;
  retries: 0;
  maxExecutionSlots: number;
  commands: CandidateCommandPlan[];
  runtimeInputs: string[];
  formalTimeoutMs: number;
  calibrationDigest: string | null;
}
function reject(reason: string): never {
  throw new Error(`CANDIDATE_EXECUTION_PLAN_INVALID: ${reason}`);
}
function closed(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('\0') !== keys.sort().join('\0')) reject('closed schema');
  return value as Record<string, unknown>;
}
function integer(value: unknown, minimum: number, maximum: number): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) reject('integer bounds');
}
function strings(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.length > 0)
    || new Set(value).size !== value.length) reject('unique string array');
}
function paths(value: unknown): asserts value is string[] {
  strings(value);
  if (value.some((path) => path.startsWith('/') || path.includes('\\') || path.includes(':')
    || path.split('/').some((segment) => segment === '..' || segment === '.' || !segment))) reject('noncanonical selector path');
}
function ids(value: unknown): asserts value is string[] {
  strings(value);
  if (value.some((id) => !/^TEST-[A-Z0-9-]+$/.test(id))) reject('test identity');
}
function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && [...left].sort().join('\0') === [...right].sort().join('\0');
}

/** @id CODE-M5-CI-EFFICIENCY-RESOURCE-PLAN-001
 * @implements REQ-M5-CI-EFFICIENCY-001
 * @design DES-M5-CI-EFFICIENCY-001 DES-M5-CI-EFFICIENCY-002
 */
export function validateCandidateExecutionPlan(
  value: unknown,
  authoritativeInventories: ReadonlyMap<string, string[]>,
): { plan: CandidateExecutionPlan; candidatePlannedExecutionSlots: number } {
  const plan = closed(value, ['schemaVersion', 'retries', 'maxExecutionSlots', 'commands',
    'runtimeInputs', 'formalTimeoutMs', 'calibrationDigest']);
  if (plan.schemaVersion !== 1 || plan.retries !== 0) reject('version or retry policy');
  integer(plan.maxExecutionSlots, 1, 16);
  integer(plan.formalTimeoutMs, 100, 120_000);
  paths(plan.runtimeInputs);
  if (plan.calibrationDigest !== null && (typeof plan.calibrationDigest !== 'string'
    || !/^[a-f0-9]{64}$/.test(plan.calibrationDigest))) reject('calibration digest');
  if (!Array.isArray(plan.commands) || plan.commands.length !== 7) reject('seven commands required');
  let maximum = 1;
  for (const [ordinal, value] of plan.commands.entries()) {
    const command = closed(value, ['name', 'executable', 'args', 'timeoutMs', 'include', 'exclude',
      'testIds', 'partitions', 'mergeAllowanceMs', 'terminationAllowanceMs']);
    if (command.name !== candidateCommandOrder[ordinal]) reject('command order');
    if (typeof command.executable !== 'string' || !command.executable.trim()) reject('executable');
    if (!Array.isArray(command.args) || !command.args.every((arg) => typeof arg === 'string')) reject('argv');
    integer(command.timeoutMs, 1, command.name === 'test' ? 600_000 : 120_000);
    integer(command.mergeAllowanceMs, 0, 60_000);
    integer(command.terminationAllowanceMs, 0, 60_000);
    paths(command.include);
    paths(command.exclude);
    ids(command.testIds);
    const inventory = authoritativeInventories.get(command.name as string);
    if (!inventory || !sameSet(command.testIds, inventory)) reject('authoritative test inventory');
    if (!Array.isArray(command.partitions)) reject('partitions');
    const observedIds: string[] = [], observedFiles: string[] = [], partitionIds: string[] = [];
    const waves = new Map<number, { slots: number; durationMs: number }>();
    for (const [index, value] of command.partitions.entries()) {
      const partition = closed(value, ['id', 'ordinal', 'wave', 'pool', 'maxWorkers', 'fanout', 'files', 'testIds', 'timeoutMs']);
      if (typeof partition.id !== 'string' || !/^[a-z0-9-]+$/.test(partition.id)
        || partition.ordinal !== index || !['forks', 'threads'].includes(partition.pool as string)) reject('partition identity or pool');
      integer(partition.wave, 0, command.partitions.length - 1);
      integer(partition.maxWorkers, 1, 15);
      integer(partition.fanout, 0, 14);
      integer(partition.timeoutMs, 1, command.timeoutMs);
      paths(partition.files);
      ids(partition.testIds);
      if (!partition.files.length || !partition.testIds.length) reject('empty partition');
      partitionIds.push(partition.id);
      observedIds.push(...partition.testIds);
      observedFiles.push(...partition.files);
      const wave = waves.get(partition.wave) ?? { slots: 1, durationMs: 0 };
      wave.slots += partition.maxWorkers + partition.fanout;
      wave.durationMs = Math.max(wave.durationMs, partition.timeoutMs);
      waves.set(partition.wave, wave);
    }
    if (new Set(observedIds).size !== observedIds.length || new Set(observedFiles).size !== observedFiles.length
      || new Set(partitionIds).size !== partitionIds.length || !sameSet(observedIds, command.testIds)) reject('partition ownership overlap or omission');
    const orderedWaves = [...waves.keys()].sort((a, b) => a - b);
    if (orderedWaves.some((wave, index) => wave !== index)) reject('noncontiguous waves');
    const longestPath = [...waves.values()].reduce((sum, wave) => sum + wave.durationMs, 0)
      + command.mergeAllowanceMs + command.terminationAllowanceMs;
    if (longestPath > command.timeoutMs) reject('sequential wave deadline');
    maximum = Math.max(maximum, ...[...waves.values()].map((wave) => wave.slots));
  }
  if (maximum > plan.maxExecutionSlots) reject('execution-slot capacity');
  return { plan: structuredClone(value) as CandidateExecutionPlan, candidatePlannedExecutionSlots: maximum };
}

export function candidateExecutionPlanDigest(plan: CandidateExecutionPlan): string {
  return sha256(canonicalBytes(plan));
}

/** @id CODE-M5-CI-EFFICIENCY-SHAPE-PROJECTION-001
 * @implements REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-005
 * @design DES-M5-CI-EFFICIENCY-001
 */
export function candidateExecutionPolicyProjection(plan: CandidateExecutionPlan): unknown {
  const { calibrationDigest: _calibration, formalTimeoutMs: _formal, ...shape } = plan;
  return {
    ...shape,
    commands: shape.commands.map(({ timeoutMs: _timeout, mergeAllowanceMs: _merge,
      terminationAllowanceMs: _termination, ...command }) => ({
      ...command,
      partitions: command.partitions.map(({ timeoutMs: _partitionTimeout, ...partition }) => partition),
    })),
  };
}

function selectorMatches(path: string, selector: string): boolean {
  const pattern = selector.split('**/').map((segment) => segment.split('**').map((part) =>
    part.split('*').map((text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*')).join('(?:.*/)?');
  return new RegExp(`^${pattern}$`).test(path);
}

/** @id CODE-M5-CI-EFFICIENCY-RESOURCE-LOADER-001
 * @implements REQ-M5-CI-EFFICIENCY-001
 * @design DES-M5-CI-EFFICIENCY-001
 */
export async function loadCandidateExecutionPlan(root: string): Promise<ReturnType<typeof validateCandidateExecutionPlan>> {
  const path = await safePath(root, '.musubix/candidate-execution-plan.json');
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  const raw = closed(value, ['schemaVersion', 'retries', 'maxExecutionSlots', 'commands',
    'runtimeInputs', 'formalTimeoutMs', 'calibrationDigest']);
  if (!Array.isArray(raw.commands)) reject('commands');
  const sourcePaths = await files(root);
  const inventory = new Map<string, string[]>();
  const selectedFiles = new Map<string, string[]>();
  const registry = await candidateCodegraphRegistry(root);
  for (const item of raw.commands) {
    const command = item as CandidateCommandPlan;
    paths(command.include);
    paths(command.exclude);
    const selected = sourcePaths.filter((path) => command.include.some((selector) => selectorMatches(path, selector))
      && !command.exclude.some((selector) => selectorMatches(path, selector))).sort();
    const owned: string[] = [];
    for (const path of selected) {
      const source = await readFile(await safePath(root, path), 'utf8');
      owned.push(...authoritativeCandidateTestIds(source, path).filter(id => command.name !== 'codegraph-tests' || registry.has(id)));
    }
    inventory.set(command.name, owned);
    selectedFiles.set(command.name, selected);
  }
  const validated = validateCandidateExecutionPlan(value, inventory);
  for (const command of validated.plan.commands) {
    if (!sameSet(command.partitions.flatMap((partition) => partition.files), selectedFiles.get(command.name)!)) reject('selected-file inventory');
    for (const partition of command.partitions) {
      const owned: string[] = [];
      for (const file of partition.files) {
        const source = await readFile(await safePath(root, file), 'utf8');
        owned.push(...authoritativeCandidateTestIds(source, file).filter(id => command.name !== 'codegraph-tests' || registry.has(id)));
      }
      if (!sameSet(owned, partition.testIds)) reject('partition test/file ownership');
    }
  }
  return validated;
}

async function candidateCodegraphRegistry(root: string) {
  const source = await readFile(await safePath(root, 'scripts/run-codegraph-tests.mjs'), 'utf8');
  const registry = /const testIds = \[([\s\S]*?)\];/.exec(source)?.[1];
  if (!registry) reject('authoritative Code Graph registry');
  return new Set([...registry.matchAll(/'(TEST-[A-Z0-9-]+)'/g)].map(match => match[1]!));
}

/** @id CODE-M5-CI-PLAN-INVENTORY-001
 * @implements REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-002
 * @design DES-M5-CI-EFFICIENCY-001 DES-M5-CI-EFFICIENCY-002
 */
export async function deriveCandidateExecutionPlan(root: string): Promise<CandidateExecutionPlan> {
  const config = JSON.parse(await readFile(await safePath(root, '.musubix/config.json'), 'utf8'));
  const inventory = new Map<string, string[]>(), paths = (await files(root)).filter(path => /^tests\/.*\.test\.tsx?$/.test(path)).sort();
  const registry = await candidateCodegraphRegistry(root);
  const entries = await Promise.all(paths.map(async path => ({
    path, ids: authoritativeCandidateTestIds(await readFile(await safePath(root, path), 'utf8'), path),
  })));
  const compatibility = new Set(['tests/cli-help-contract.test.ts', 'tests/cli-json-error-contract.test.ts', 'tests/compatibility-oracle.test.ts']);
  const commands: CandidateCommandPlan[] = config.commands.map((command: { name: CandidateCommandPlan['name']; command: string; args: string[] }) => {
    const owning = entries.filter(entry => command.name === 'test' || command.name === 'compatibility' && compatibility.has(entry.path)
      || command.name === 'codegraph-tests' && entry.ids.some(id => registry.has(id)))
      .map(entry => ({ ...entry, ids: entry.ids.filter(id => command.name !== 'codegraph-tests' || registry.has(id)) }));
    const isolated = owning.filter(entry => entry.ids.length > 0 && /lfs|worker|concurrency|lease|checkpoint|integration|recovery/i.test(entry.path));
    const regular = owning.filter(entry => !isolated.includes(entry));
    const groups = command.name === 'codegraph-tests' && owning.length ? [owning]
      : [...(isolated.length ? [isolated] : []), ...(regular.length ? [regular] : [])];
    const weights = groups.map(group => group === isolated ? group.length * 4 : group.length);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const timeoutMs = command.name === 'test' ? 600_000 : 120_000;
    const partitions = groups.map((group, ordinal) => ({
      id: `${command.name}-partition-${ordinal}`, ordinal, wave: ordinal, pool: 'forks' as const,
      maxWorkers: command.name === 'codegraph-tests' ? 4 : group.length === 1 ? 1 : group === isolated ? 2 : 6,
      fanout: command.name === 'codegraph-tests' ? 11 : group.length === 1 ? 14 : group === isolated ? 13 : 9,
      files: group.map(entry => entry.path), testIds: group.flatMap(entry => entry.ids),
      timeoutMs: Math.floor((timeoutMs - 2_000) * weights[ordinal]! / totalWeight),
    }));
    const testIds = owning.flatMap(entry => entry.ids);
    inventory.set(command.name, testIds);
    return { name: command.name, executable: command.command, args: command.args, timeoutMs,
      include: owning.map(entry => entry.path), exclude: [], testIds, partitions,
      mergeAllowanceMs: 1_000, terminationAllowanceMs: 1_000 };
  });
  const plan: CandidateExecutionPlan = { schemaVersion: 1, retries: 0, maxExecutionSlots: 16,
    commands, runtimeInputs: config.testRuntime.inputs, formalTimeoutMs: 120_000, calibrationDigest: null };
  return validateCandidateExecutionPlan(plan, inventory).plan;
}

export async function validateCandidateLaunchInventory(root: string): Promise<void> {
  for (const path of (await files(root)).filter(path => /^(?:tests|packages)\/.*\.[cm]?tsx?$/.test(path))) {
    if (path === 'packages/analysis/src/process.ts') continue;
    const source = ts.createSourceFile(path, await readFile(await safePath(root, path), 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node): void {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
        && node.moduleSpecifier.text === 'node:child_process' && !node.importClause?.isTypeOnly) reject(`uncounted launch import ${path}`);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || ts.isIdentifier(node.expression) && node.expression.text === 'require')
        && node.arguments.some(arg => ts.isStringLiteral(arg) && arg.text === 'node:child_process')) reject(`uncounted dynamic launch ${path}`);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}

export type CandidateExecutionMode = 'candidate' | 'calibration';
export interface CandidateCompletedRegion {
  durationMs: number;
  status: 'completed';
  exitCode: 0;
  reportComplete: true;
  acknowledgmentComplete: true;
}
export interface CandidateCalibrationObservation {
  os: 'ubuntu' | 'windows' | 'macos';
  nodeMajor: 24;
  runAttempt: 1;
  status: 'pass';
  noCredit: true;
  regions: Record<string, CandidateCompletedRegion>;
}
export interface CandidateTimeoutCalibration {
  maxima: Record<string, number>;
  timeouts: Record<string, number>;
  outerBudgetMs: number;
  gateBudgetMs: number;
}
const regionCaps: Readonly<Record<string, number>> = {
  bootstrap: 60_000, preparation: 120_000, signing: 60_000, upload: 60_000,
  preconditions: 60_000, postconditions: 60_000, persistence: 60_000,
  test: 600_000, formal: 120_000,
  ...Object.fromEntries(candidateCommandOrder.filter((name) => name !== 'test').map((name) => [name, 120_000])),
};

/** @id CODE-M5-CI-EFFICIENCY-MODE-BUDGET-001
 * @implements REQ-M5-CI-EFFICIENCY-003 REQ-M5-CI-EFFICIENCY-005
 * @design DES-M5-CI-EFFICIENCY-004
 */
export function candidateGateOuterTimeoutMs(
  mode: CandidateExecutionMode,
  commandTimeouts: Readonly<Record<string, number>>,
  formalTimeoutMs: number,
): number {
  if (mode !== 'candidate' && mode !== 'calibration') reject('execution mode');
  closed(commandTimeouts, [...candidateCommandOrder]);
  integer(formalTimeoutMs, 100, 120_000);
  for (const name of candidateCommandOrder) integer(commandTimeouts[name], 1, regionCaps[name]!);
  const sum = candidateCommandOrder.reduce((sum, name) => sum + commandTimeouts[name]!, formalTimeoutMs);
  integer(sum, 107, mode === 'candidate' ? 615_000 : 1_440_000);
  if (mode === 'calibration' && (sum !== 1_440_000 || formalTimeoutMs !== 120_000
    || candidateCommandOrder.some((name) => commandTimeouts[name] !== regionCaps[name]))) reject('calibration requires individual maxima');
  const outer = 45_000 + sum;
  integer(outer, 45_107, mode === 'candidate' ? 660_000 : 1_485_000);
  return outer;
}

/** @id CODE-M5-CI-EFFICIENCY-TIMEOUT-CALIBRATION-001
 * @implements REQ-M5-CI-EFFICIENCY-003 REQ-M5-CI-EFFICIENCY-005
 * @design DES-M5-CI-EFFICIENCY-001 DES-M5-CI-EFFICIENCY-004
 */
export function calibrateCandidateTimeouts(observations: unknown): CandidateTimeoutCalibration {
  if (!Array.isArray(observations) || observations.length !== 3) reject('three calibration platforms required');
  const expectedPlatforms = new Set(['ubuntu', 'windows', 'macos']);
  const maxima: Record<string, number> = {};
  let expectedRegions: string[] | undefined;
  for (const observation of observations) {
    const job = closed(observation, ['os', 'nodeMajor', 'runAttempt', 'status', 'noCredit', 'regions']);
    if (typeof job.os !== 'string' || !expectedPlatforms.delete(job.os) || job.nodeMajor !== 24
      || job.runAttempt !== 1 || job.status !== 'pass' || job.noCredit !== true) reject('diagnostic first-attempt calibration required');
    if (!job.regions || typeof job.regions !== 'object' || Array.isArray(job.regions)) reject('region inventory');
    const regions = job.regions as Record<string, unknown>;
    const names = Object.keys(regions).sort();
    expectedRegions ??= names;
    if (!sameSet(names, expectedRegions) || Object.keys(regionCaps).some((name) => !Object.hasOwn(regions, name))) reject('missing calibration region');
    for (const [name, observation] of Object.entries(regions)) {
      if (!Object.hasOwn(regionCaps, name) && !/^(?:partition|wave|merge|termination):(?:test|codegraph-tests|compatibility):[a-z0-9-]+$/.test(name)) reject('unplanned calibration region');
      const region = closed(observation, ['durationMs', 'status', 'exitCode', 'reportComplete', 'acknowledgmentComplete']);
      integer(region.durationMs, 0, Number.MAX_SAFE_INTEGER);
      if (region.status !== 'completed' || region.exitCode !== 0 || region.reportComplete !== true
        || region.acknowledgmentComplete !== true) reject('failed or censored region');
      maxima[name] = Math.max(maxima[name] ?? 0, region.durationMs);
    }

  }
  if (expectedPlatforms.size) reject('missing platform');
  const timeouts: Record<string, number> = {};
  for (const [name, maximum] of Object.entries(maxima)) {
    const calibrated = Math.ceil(maximum / 1_000) * 1_000 * 3 / 2;
    const owner = name.split(':')[1];
    const cap = regionCaps[name] ?? (owner ? regionCaps[owner] : undefined);
    if (cap === undefined) reject('region cap');
    integer(calibrated, name === 'formal' ? 100 : 1, cap);
    timeouts[name] = calibrated;
  }
  const outerBudgetMs = candidateGateOuterTimeoutMs('candidate',
    Object.fromEntries(candidateCommandOrder.map((name) => [name, timeouts[name]!])), timeouts.formal!);
  const gateBudgetMs = outerBudgetMs + timeouts.preconditions! + timeouts.postconditions! + 60_000;
  integer(gateBudgetMs, outerBudgetMs, 840_000);
  return { maxima, timeouts, outerBudgetMs, gateBudgetMs };
}

    export interface CandidateSlotLedger { root: string; nonce: string; capacity: number }

    export function acquireCandidateFixtureSlotSync(ledger: CandidateSlotLedger, partition: string, count = 1): CandidateSlotLease {
      integer(ledger.capacity, 1, 16);
      integer(count, 1, ledger.capacity);
      const identity = JSON.parse(readFileSync(join(ledger.root, 'ledger.json'), 'utf8'));
      if (identity.nonce !== ledger.nonce || identity.capacity !== ledger.capacity) reject('foreign fixture ledger');
      const lock = join(ledger.root, 'lock'), deadline = Number(process.hrtime.bigint()) / 1_000_000 + 1_000;
      for (;;) {
        try { mkdirSync(lock); break; } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code !== 'EEXIST' || Number(process.hrtime.bigint()) / 1_000_000 >= deadline) reject('fixture lease deadline');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        }
      }
      try {
        const occupied = new Set(readdirSync(ledger.root));
        const slots = Array.from({ length: ledger.capacity }, (_, slot) => slot).filter(slot => !occupied.has(`slot-${slot}`)).slice(0, count);
        if (slots.length !== count) return reject('fixture slot capacity');
        const lease: CandidateSlotLease = { nonce: ledger.nonce, pid: process.pid, partition, leaseId: randomUUID(), slots };
        const created: number[] = [];
        try {
          for (const slot of slots) {
            mkdirSync(join(ledger.root, `slot-${slot}`));
            created.push(slot);
            writeFileSync(join(ledger.root, `slot-${slot}`, 'owner.json'), canonicalBytes(lease), { flag: 'wx', mode: 0o600 });
          }
          observeCandidateFixtureSlotSync(ledger, lease, 'acquire');
          return lease;
        } catch (cause) {
          for (const slot of created) rmSync(join(ledger.root, `slot-${slot}`), { recursive: true });
          throw cause;
        }
      } finally { rmSync(lock, { recursive: true }); }
    }
    function observeCandidateFixtureSlotSync(ledger: CandidateSlotLedger, lease: CandidateSlotLease, action: 'acquire' | 'release') {
      const ordinal = readdirSync(ledger.root).filter(name => /^observation-[0-9]+\.json$/.test(name)).length;
      writeFileSync(join(ledger.root, `observation-${ordinal}.json`), canonicalBytes({ ...lease, ordinal, action,
        count: lease.slots.length, monotonicMs: Number(process.hrtime.bigint()) / 1_000_000 }), { flag: 'wx', mode: 0o600 });
    }
    export function completeCandidateNativeTerminationsSync(ledger: CandidateSlotLedger): void {
      const terminated = (pid: number): boolean => {
        try { process.kill(pid, 0); }
        catch (cause) { return (cause as NodeJS.ErrnoException).code === 'ESRCH'; }
        if (process.platform !== 'linux') return false;
        try {
          const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
          return /^\s+Z\s/.test(stat.slice(stat.lastIndexOf(')') + 1));
        } catch (cause) { return (cause as NodeJS.ErrnoException).code === 'ENOENT'; }
      };
      const lock = join(ledger.root, 'lock'), deadline = Number(process.hrtime.bigint()) / 1_000_000 + 1_000;
      for (;;) {
        try { mkdirSync(lock); break; } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code !== 'EEXIST' || Number(process.hrtime.bigint()) / 1_000_000 >= deadline) reject('native terminal accounting deadline');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        }
      }
      try {
        const leases = new Map<string, CandidateSlotLease>();
        for (const name of readdirSync(ledger.root).filter(name => /^slot-[0-9]+$/.test(name))) {
          const lease = JSON.parse(readFileSync(join(ledger.root, name, 'owner.json'), 'utf8')) as CandidateSlotLease;
          leases.set(lease.leaseId, lease);
        }
        // Only descriptor-bound, independently terminated native processes qualify, never stale leases.
        for (const lease of leases.values()) {
          if (lease.nonce !== ledger.nonce || !Number.isSafeInteger(lease.pid) || lease.pid <= 0 || !terminated(lease.pid)) continue;
          const path = join(ledger.root, `native-${lease.leaseId}.json`);
          let native: Record<string, unknown>;
          try { native = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
          if (native.schemaVersion !== 1 || native.nonce !== ledger.nonce || native.leaseId !== lease.leaseId
            || native.callerPid !== lease.pid || !Number.isSafeInteger(native.childPid) || Number(native.childPid) <= 0
            || !terminated(Number(native.childPid))) continue;
          for (const slot of lease.slots) {
            if (sha256(canonicalBytes(JSON.parse(readFileSync(join(ledger.root, `slot-${slot}`, 'owner.json'), 'utf8')))) !== sha256(canonicalBytes(lease))) reject('foreign native terminal lease');
          }
          native.status = 'terminated';
          writeFileSync(path, canonicalBytes(native), { mode: 0o600 });
          observeCandidateFixtureSlotSync(ledger, lease, 'release');
          for (const slot of lease.slots) rmSync(join(ledger.root, `slot-${slot}`), { recursive: true });
        }
      } finally { rmSync(lock, { recursive: true }); }
    }
    export function releaseCandidateFixtureSlotSync(ledger: CandidateSlotLedger, lease: CandidateSlotLease) {
      const lock = join(ledger.root, 'lock'), deadline = Number(process.hrtime.bigint()) / 1_000_000 + 1_000;
      for (;;) {
        try { mkdirSync(lock); break; } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code !== 'EEXIST' || Number(process.hrtime.bigint()) / 1_000_000 >= deadline) reject('fixture release deadline');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        }
      }
      try {
        if (lease.nonce !== ledger.nonce || !lease.slots.length || new Set(lease.slots).size !== lease.slots.length) reject('foreign fixture slot');
        for (const slot of lease.slots) {
          const path = join(ledger.root, `slot-${slot}`);
          if (sha256(canonicalBytes(JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8')))) !== sha256(canonicalBytes(lease))) reject('foreign fixture owner');
        }
        observeCandidateFixtureSlotSync(ledger, lease, 'release');
        for (const slot of lease.slots) rmSync(join(ledger.root, `slot-${slot}`), { recursive: true });
      } finally { rmSync(lock, { recursive: true }); }
    }

    export interface CandidateSlotLease {
      nonce: string; pid: number; partition: string; leaseId: string; slots: number[];
    }
    export interface CandidateSlotObservation extends CandidateSlotLease {
      ordinal: number; action: 'acquire' | 'release'; monotonicMs: number; count: number;
    }
    export async function createCandidateSlotLedger(root: string, nonce: string, capacity: number): Promise<CandidateSlotLedger> {
      integer(capacity, 1, 16);
      if (!/^[A-Za-z0-9-]+$/.test(nonce)) reject('slot nonce');
      const directory = join(root, `slots-${nonce}`);
      await mkdir(root, { recursive: true, mode: 0o700 });
      await mkdir(directory, { mode: 0o700 });
      const ledger = { root: directory, nonce, capacity };
      await writeFile(join(directory, 'ledger.json'), canonicalBytes({ nonce, capacity }), { flag: 'wx', mode: 0o600 });
      return ledger;
    }
    function withSlotLock<T>(ledger: CandidateSlotLedger, operation: () => T): T {
      const identity = JSON.parse(readFileSync(join(ledger.root, 'ledger.json'), 'utf8'));
      if (identity.nonce !== ledger.nonce || identity.capacity !== ledger.capacity) reject('foreign slot ledger');
      const lock = join(ledger.root, 'lock');
      const deadline = Number(process.hrtime.bigint()) / 1_000_000 + 1_000;
      for (;;) {
        try { mkdirSync(lock); break; } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code !== 'EEXIST'
            || Number(process.hrtime.bigint()) / 1_000_000 >= deadline) reject('slot capacity or concurrent lease transaction');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        }
      }
      // Native synchronous counting can re-enter between awaits, so a held transaction must never yield.
      try { return operation(); } finally { rmSync(lock, { recursive: true }); }
    }

    /** @id CODE-M5-CI-ATOMIC-SLOT-LEASE-001
     * @implements REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-002
     * @design DES-M5-CI-EFFICIENCY-002
     */
    export async function acquireCandidateSlots(
      ledger: CandidateSlotLedger, owner: Pick<CandidateSlotLease, 'nonce' | 'pid' | 'partition'>, count: number,
    ): Promise<CandidateSlotLease> {
      integer(count, 1, ledger.capacity);
      if (owner.nonce !== ledger.nonce || !Number.isSafeInteger(owner.pid) || owner.pid <= 0
        || !/^[a-z0-9-]+$/.test(owner.partition)) reject('slot owner');
      return withSlotLock(ledger, () => {
        const lease: CandidateSlotLease = { ...owner, leaseId: randomUUID(), slots: [] };
        try {
          for (let slot = 0; slot < ledger.capacity && lease.slots.length < count; slot++) {
            const path = join(ledger.root, `slot-${slot}`);
            try { mkdirSync(path); } catch (cause) {
              if ((cause as NodeJS.ErrnoException).code === 'EEXIST') continue;
              throw cause;
            }
            lease.slots.push(slot);
            writeFileSync(join(path, 'owner.json'), canonicalBytes(lease), { flag: 'wx', mode: 0o600 });
          }
          if (lease.slots.length !== count) reject('slot capacity');
          for (const slot of lease.slots) writeFileSync(join(ledger.root, `slot-${slot}`, 'owner.json'), canonicalBytes(lease));
          observeCandidateFixtureSlotSync(ledger, lease, 'acquire');
          return lease;
        } catch (cause) {
          for (const slot of lease.slots) rmSync(join(ledger.root, `slot-${slot}`), { recursive: true });
          throw cause;
        }
      });
    }
    export async function releaseCandidateSlots(ledger: CandidateSlotLedger, lease: CandidateSlotLease): Promise<void> {
      withSlotLock(ledger, () => {
        if (lease.nonce !== ledger.nonce || !lease.slots.length || new Set(lease.slots).size !== lease.slots.length) reject('foreign slot lease');
        for (const slot of lease.slots) {
          const owner = JSON.parse(readFileSync(join(ledger.root, `slot-${slot}`, 'owner.json'), 'utf8'));
          if (sha256(canonicalBytes(owner)) !== sha256(canonicalBytes(lease))) reject('foreign slot owner');
        }
        observeCandidateFixtureSlotSync(ledger, lease, 'release');
        for (const slot of lease.slots) rmSync(join(ledger.root, `slot-${slot}`), { recursive: true });
      });
    }

    /** @id CODE-M5-CI-INDEPENDENT-SLOT-VALIDATION-001
     * @implements REQ-M5-CI-EFFICIENCY-001
     * @design DES-M5-CI-EFFICIENCY-002
     */
    export async function validateCandidateSlotLedger(ledger: CandidateSlotLedger) {
      integer(ledger.capacity, 1, 16);
      const settleDeadline = Date.now() + 2_000;
      while ((await readdir(ledger.root)).some(name => /^slot-[0-9]+$/.test(name))
        && Date.now() < settleDeadline) await delay(25);
      const nativeDescriptors = await Promise.all((await readdir(ledger.root)).filter(name => /^native-[a-f0-9-]{36}\.json$/.test(name))
        .sort().map(async name => {
          const descriptor = closed(JSON.parse(await readFile(join(ledger.root, name), 'utf8')),
            ['schemaVersion', 'nonce', 'leaseId', 'callerPid', 'childPid', 'status']);
          if (descriptor.schemaVersion !== 1 || descriptor.nonce !== ledger.nonce
            || name !== `native-${descriptor.leaseId}.json` || !['launched', 'terminated'].includes(String(descriptor.status))) reject('native termination binding');
          integer(descriptor.callerPid, 1, Number.MAX_SAFE_INTEGER);
          integer(descriptor.childPid, 1, Number.MAX_SAFE_INTEGER);
          return descriptor;
        }));
      const terminated = async (pid: number): Promise<boolean> => {
        try { process.kill(pid, 0); }
        catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ESRCH') return true; throw cause; }
        if (process.platform === 'linux') {
          try {
            const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
            return /^\s+Z\s/.test(stat.slice(stat.lastIndexOf(')') + 1));
          } catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return true; throw cause; }
        }
        return false;
      };
      // Terminal cleanup is not lease recycling: only independently confirmed dead owners and children qualify.
      const remaining = new Map<string, CandidateSlotLease>();
      for (const name of (await readdir(ledger.root)).filter(name => /^slot-[0-9]+$/.test(name))) {
        const lease = JSON.parse(await readFile(join(ledger.root, name, 'owner.json'), 'utf8')) as CandidateSlotLease;
        remaining.set(lease.leaseId, lease);
      }
      for (const lease of remaining.values()) {
        const native = nativeDescriptors.find(descriptor => descriptor.leaseId === lease.leaseId);
        if (!native || native.callerPid !== lease.pid || !await terminated(lease.pid)) {
          reject(`leaked native owner partition=${lease.partition} callerPid=${lease.pid} childPid=${native?.childPid ?? "missing"}`);
        }
        if (!await terminated(Number(native.childPid))) reject('live native child');
        native.status = 'terminated';
        await writeFile(join(ledger.root, `native-${lease.leaseId}.json`), canonicalBytes(native), { mode: 0o600 });
        await releaseCandidateSlots(ledger, lease);
      }
      const names = await readdir(ledger.root);
      if (names.some((name) => name !== 'ledger.json' && !/^observation-[0-9]+\.json$/.test(name)
        && !/^native-[a-f0-9-]{36}\.json$/.test(name))) reject('leaked or foreign slot');
      const observations: CandidateSlotObservation[] = [];
      for (const name of names.filter((name) => /^observation-/.test(name))) {
        observations.push(JSON.parse(await readFile(join(ledger.root, name), 'utf8')));
      }
      observations.sort((a, b) => a.ordinal - b.ordinal);
      const active = new Map<number, string>(), owners = new Map<string, CandidateSlotLease>();
      let maximum = 0, previous = -Infinity;
      for (const [index, observation] of observations.entries()) {
        closed(observation, ['nonce', 'pid', 'partition', 'leaseId', 'slots', 'ordinal', 'action', 'monotonicMs', 'count']);
        if (observation.ordinal !== index || observation.nonce !== ledger.nonce
          || !Number.isSafeInteger(observation.pid) || observation.pid <= 0
          || !/^[a-z0-9-]+$/.test(observation.partition) || !/^[a-f0-9-]{36}$/.test(observation.leaseId)
          || !Number.isFinite(observation.monotonicMs) || observation.monotonicMs < previous
          || !Array.isArray(observation.slots) || observation.slots.length !== observation.count
          || !observation.count || new Set(observation.slots).size !== observation.count
          || observation.slots.some((slot, i) => !Number.isSafeInteger(slot) || slot < 0 || slot >= ledger.capacity
            || i > 0 && slot <= observation.slots[i - 1]!)) reject('slot observation');
        previous = observation.monotonicMs;
        const { ordinal: _ordinal, action, monotonicMs: _time, count: _count, ...lease } = observation;
        if (action === 'acquire') {
          if (owners.has(lease.leaseId) || lease.slots.some((slot) => active.has(slot))) reject('duplicate slot acquire');
          owners.set(lease.leaseId, lease);
          for (const slot of lease.slots) active.set(slot, lease.leaseId);
        } else if (action === 'release') {
          if (sha256(canonicalBytes(owners.get(lease.leaseId) ?? null)) !== sha256(canonicalBytes(lease))
            || lease.slots.some((slot) => active.get(slot) !== lease.leaseId)) reject('foreign slot release');
          owners.delete(lease.leaseId);
          for (const slot of lease.slots) active.delete(slot);
        } else reject('slot action');
        maximum = Math.max(maximum, active.size);
        if (maximum > ledger.capacity) reject('slot over-capacity');
      }
      if (!observations.length || active.size || owners.size) reject('missing or leaked slot observations');
      if (nativeDescriptors.some(native => native.status !== 'terminated' || !observations.some(observation =>
        observation.action === 'acquire' && observation.leaseId === native.leaseId && observation.pid === native.callerPid))) reject('foreign native descriptor');
      return { maximum, ledgerDigest: sha256(canonicalBytes({ observations, nativeDescriptors })), observations };
    }
