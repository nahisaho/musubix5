import * as childProcess from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { dirname, join, win32 } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { acquireCandidateSlots, releaseCandidateSlots, acquireCandidateFixtureSlotSync,
  releaseCandidateFixtureSlotSync, completeCandidateNativeTerminationsSync,
  type CandidateSlotLedger, type CandidateSlotLease } from './candidate-execution-plan.js';
import { remainingCandidateDeadline } from './candidate-portability.js';
export interface TestRuntimeProvenance {
  kind: 'stable-test-wall-clock-v1';
  profileSha256: string;
  inputsSha256: string;
  dispatchSha256: string;
  runs: Array<{
    ordinal: number; runId: string; requestSha256: string; anchorSha256: string;
    acknowledgmentSha256: string; resultSha256: string;
  }>;
  publication: {
    durability: 'posix-file-directory-fsync' | 'win32-file-flush-no-replace-rehash';
    closureSha256: string;
  };
  activation?: Record<string, unknown>;
}
const nativeKey = Symbol.for('musubix5.candidateNativeFunctions.v1');
const sharedNative = globalThis as typeof globalThis & { [nativeKey]?: typeof childProcess };
const native = sharedNative[nativeKey] ?? Object.freeze({ ...childProcess });
if (!sharedNative[nativeKey]) Object.defineProperty(sharedNative, nativeKey, { value: native, configurable: false, writable: false });

function invocationSlotCount(args: unknown[]): number {
  const argv = args.flatMap(arg => Array.isArray(arg) ? arg.filter(item => typeof item === 'string') : typeof arg === 'string' ? [arg] : []);
  if (!argv.some(arg => /(?:^|[/\\])vitest(?:\.mjs)?$/.test(arg))) return 1;
  const index = argv.indexOf('--maxWorkers');
  const workers = Number(index >= 0 ? argv[index + 1] : argv.find(arg => arg.startsWith('--maxWorkers='))?.split('=')[1]);
  if (!Number.isSafeInteger(workers) || workers < 1 || workers > 15) throw new Error('CANDIDATE_WORKER_CAPACITY_UNBOUND');
  return workers + 1;
}

/** @id CODE-M5-CI-COUNTED-PRODUCT-PROCESS-001
 * @implements REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-002
 * @design DES-M5-CI-EFFICIENCY-002 DES-M5-CI-EFFICIENCY-003
 */
type SlotRelease = (() => void) & { bindNative?: (child: childProcess.ChildProcess) => void; environment?: NodeJS.ProcessEnv };
/** @id CODE-M5-CI-NATIVE-DESCRIPTOR-ATOMIC-001
 * @implements REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-002 REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-CI-EFFICIENCY-002 DES-M5-LINUX-DELIVERY-002
 */
function publishCandidateNativeDescriptorSync(
  path: string,
  descriptor: Record<string, unknown>,
  replace: boolean,
): void {
  const stagingDirectory = join(dirname(path), '.native-staging');
  mkdirSync(stagingDirectory, { recursive: true, mode: 0o700 });
  const staging = join(stagingDirectory, `${process.pid}.${randomUUID()}.tmp`);
  writeFileSync(staging, JSON.stringify(descriptor), { flag: 'wx', mode: 0o600 });
  try {
    if (replace) renameSync(staging, path);
    else {
      linkSync(staging, path);
      unlinkSync(staging);
    }
  } catch (cause) {
    try { unlinkSync(staging); } catch (cleanup) {
      if ((cleanup as NodeJS.ErrnoException).code !== 'ENOENT') throw cleanup;
    }
    throw cause;
  }
}

function processSlotLeases(args: unknown[], shell = false, cleanup = false): SlotRelease {
  // A verified Vitest coordinator's pool is already reserved atomically by its launcher.
  if (/[\\/]node_modules[\\/]vitest[\\/]vitest\.mjs$/.test(process.argv[1] ?? '')
    && args.flatMap(arg => Array.isArray(arg) ? arg : [arg]).some(arg =>
      typeof arg === 'string' && /[\\/]tinypool[\\/]dist[\\/]entry[\\/]process\.js$/.test(arg))) return () => {};
  const options = args.find(value => value && typeof value === 'object' && !Array.isArray(value)) as { env?: NodeJS.ProcessEnv } | undefined;
  const environments = [process.env, options?.env].filter((env): env is NodeJS.ProcessEnv => Boolean(env));
  const ledgers = new Map<string, CandidateSlotLedger>();
  for (const env of environments) {
    const chain = JSON.parse(env.MUSUBIX5_CANDIDATE_LEDGER_CHAIN ?? '[]') as Array<{ path: string; nonce: string }>;
    if (!Array.isArray(chain) || chain.length > 16) throw new Error('CANDIDATE_LEDGER_CHAIN_INVALID');
    for (const ancestor of chain) {
      const ledger = JSON.parse(readFileSync(ancestor.path, 'utf8')) as CandidateSlotLedger;
      if (ledger.nonce !== ancestor.nonce) throw new Error('CANDIDATE_SLOT_NONCE_MISMATCH');
      ledgers.set(ledger.root, ledger);
    }
    if (!env.MUSUBIX5_CANDIDATE_SLOT_LEDGER) continue;
    const ledger = JSON.parse(readFileSync(env.MUSUBIX5_CANDIDATE_SLOT_LEDGER, 'utf8')) as CandidateSlotLedger;
    if (ledger.nonce !== env.CANDIDATE_DISPATCH_NONCE) throw new Error('CANDIDATE_SLOT_NONCE_MISMATCH');
    ledgers.set(ledger.root, ledger);
  }
  const leases: Array<{ ledger: CandidateSlotLedger; lease: CandidateSlotLease }> = [];
  try {
    for (const ledger of ledgers.values()) {
      completeCandidateNativeTerminationsSync(ledger);
      leases.push({ ledger, lease: acquireCandidateFixtureSlotSync(ledger,
        options?.env?.MUSUBIX5_CANDIDATE_PARTITION ?? process.env.MUSUBIX5_CANDIDATE_PARTITION ?? 'product',
        invocationSlotCount(args) + (shell || typeof args[0] === 'string' && /(?:^|[/\\])(?:sh|bash|cmd(?:\.exe)?|powershell(?:\.exe)?)$/.test(args[0]) ? 1 : 0) + (cleanup ? 1 : 0)) });
    }
  } catch (cause) {
    for (const { ledger, lease } of leases.reverse()) releaseCandidateFixtureSlotSync(ledger, lease);
    throw cause;
  }
  let released = false;
  const release: SlotRelease = () => {
    if (released) return;
    released = true;
    for (const { ledger, lease } of leases.reverse()) {
      releaseCandidateFixtureSlotSync(ledger, lease);
      completeCandidateNativeTerminationsSync(ledger);
    }
  };
  const chain = new Map<string, { path: string; nonce: string }>();
  for (const env of environments) {
    for (const ancestor of JSON.parse(env.MUSUBIX5_CANDIDATE_LEDGER_CHAIN ?? '[]')) chain.set(ancestor.path, ancestor);
    if (env.MUSUBIX5_CANDIDATE_SLOT_LEDGER) chain.set(env.MUSUBIX5_CANDIDATE_SLOT_LEDGER,
      { path: env.MUSUBIX5_CANDIDATE_SLOT_LEDGER, nonce: env.CANDIDATE_DISPATCH_NONCE! });
  }
  if (chain.size) release.environment = { ...(options?.env ?? process.env),
    MUSUBIX5_CANDIDATE_LEDGER_CHAIN: JSON.stringify([...chain.values()]) };
  release.bindNative = child => {
    if (!child.pid) return;
    for (const { ledger, lease } of leases) {
      const path = join(ledger.root, `native-${lease.leaseId}.json`);
      const descriptor = { schemaVersion: 1, nonce: ledger.nonce, leaseId: lease.leaseId,
        callerPid: process.pid, childPid: child.pid, status: 'launched' };
      publishCandidateNativeDescriptorSync(path, descriptor, false);
      const terminated = () => publishCandidateNativeDescriptorSync(path, { ...descriptor, status: 'terminated' }, true);
      child.once('exit', terminated);
      child.once('close', terminated);
    }
  };
  return release;
}
function invocationEnvironment(args: unknown[], release: SlotRelease): unknown[] {
  const optionsIndex = args.findIndex(value => value && typeof value === 'object' && !Array.isArray(value));
  const options = optionsIndex >= 0 ? args[optionsIndex] as { env?: NodeJS.ProcessEnv } : undefined;
  const explicitEnvironment = options && Object.prototype.hasOwnProperty.call(options, 'env');
  let environment = release.environment;
  if (!explicitEnvironment && (environment
    || process.env.MUSUBIX5_REUSED_TEST_REPORT || process.env.MUSUBIX5_REUSED_TEST_REPORT_SHA256)) {
    environment = { ...(environment ?? process.env) };
    delete environment.MUSUBIX5_REUSED_TEST_REPORT;
    delete environment.MUSUBIX5_REUSED_TEST_REPORT_SHA256;
  }
  if (!environment) return args;
  const copy = [...args];
  if (optionsIndex >= 0) copy[optionsIndex] = { ...args[optionsIndex] as object, env: environment };
  else copy.splice(typeof copy.at(-1) === 'function' ? copy.length - 1 : copy.length, 0, { env: environment });
  return copy;
}
function countedSynchronous(fn: Function, args: unknown[]) {
  const release = processSlotLeases(args, fn === native.execSync);
  try { return Reflect.apply(fn, undefined, invocationEnvironment(args, release)); } finally { release(); }
}
function countedAsynchronous(fn: Function, args: unknown[]): childProcess.ChildProcess {
  const release = processSlotLeases(args, fn === native.exec);
  let child: childProcess.ChildProcess | undefined;
  try {
    child = Reflect.apply(fn, undefined, invocationEnvironment(args, release)) as childProcess.ChildProcess;
    release.bindNative?.(child);
    child.once('exit', release);
    child.once('close', release);
    return child;
  } catch (cause) {
    if (child?.pid) {
      child.once('exit', release);
      child.once('close', release);
      child.kill('SIGKILL');
    } else release();
    throw cause;
  }
}
export const countedExecFileSync = ((...args: unknown[]) => countedSynchronous(native.execFileSync, args)) as typeof childProcess.execFileSync;
export const countedSpawnSync = ((...args: unknown[]) => countedSynchronous(native.spawnSync, args)) as typeof childProcess.spawnSync;
export const countedExecSync = ((...args: unknown[]) => countedSynchronous(native.execSync, args)) as typeof childProcess.execSync;
export const countedSpawn = ((...args: unknown[]) => countedAsynchronous(native.spawn, args)) as typeof childProcess.spawn;
export const countedExecFile = ((...args: unknown[]) => countedAsynchronous(native.execFile, args)) as typeof childProcess.execFile;
export const countedExec = ((...args: unknown[]) => countedAsynchronous(native.exec, args)) as typeof childProcess.exec;
export const countedFork = ((...args: unknown[]) => countedAsynchronous(native.fork, args)) as typeof childProcess.fork;
for (const fn of [countedExecFile, countedExec]) {
  Object.defineProperty(fn, promisify.custom, { value: (...args: unknown[]) => {
    let child: childProcess.ChildProcess | undefined;
    const promise = new Promise((accept, reject) => {
      child = Reflect.apply(fn, undefined, [...args, (error: Error | null, stdout: unknown, stderr: unknown) =>
        error ? reject(Object.assign(error, { stdout, stderr })) : accept({ stdout, stderr })]);
    });
    return Object.assign(promise, { child });
  } });
}

export function installCandidateNativeCounting(): void {
  if (!process.env.MUSUBIX5_CANDIDATE_SLOT_LEDGER) return;
  const target = (childProcess as unknown as { default: Record<string, unknown> }).default;
  Object.assign(target, { spawn: countedSpawn, spawnSync: countedSpawnSync, execFile: countedExecFile,
    execFileSync: countedExecFileSync, exec: countedExec, execSync: countedExecSync, fork: countedFork });
  syncBuiltinESMExports();
}

export interface ProcessResult {
  testRuntime?: TestRuntimeProvenance;
  status: 'completed' | 'missing' | 'timeout' | 'error';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export type Runner = (command: string, args: string[], options: {
  cwd: string;
  timeoutMs: number;
  input?: string;
  env?: NodeJS.ProcessEnv;
  deadline?: number;
  slotProvider?: { acquire(): Promise<() => Promise<void>> };
}) => Promise<ProcessResult>;

export function resolveProcessCommand(command: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32' || !/^(?:npm|npx)$/i.test(command)) return command;
  return `${command.toLowerCase()}.cmd`;
}

/** @id CODE-M5-PROCESS-WINDOWS-001
 * @implements REQ-M5-QUALITY-005 REQ-M5-RELEASE-002
 * @design DES-M5-015 DES-M5-019
 */
export function resolveProcessInvocation(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  nodeExecutable: string = process.execPath,
): { command: string; args: string[] } {
  if (platform !== 'win32' || !/^(?:npm|npx)$/i.test(command)) return { command, args };
  const cli = win32.join(
    win32.dirname(nodeExecutable),
    'node_modules',
    'npm',
    'bin',
    `${command.toLowerCase()}-cli.js`,
  );
  return { command: nodeExecutable, args: [cli, ...args] };
}

export function resolveNpmInvocation(
  args: string[],
  platform: NodeJS.Platform = process.platform,
  nodeExecutable: string = process.execPath,
): { command: string; args: string[] } {
  return resolveProcessInvocation('npm', args, platform, nodeExecutable);
}

export function resolvePortableNpmInvocation(
  args: string[],
  matrixOs: string | undefined = process.env.MATRIX_OS,
  platform: NodeJS.Platform = process.platform,
  nodeExecutable: string = process.execPath,
): { command: string; args: string[] } {
  if (matrixOs?.toLowerCase() === 'windows' && process.env.npm_execpath) {
    return { command: nodeExecutable, args: [process.env.npm_execpath, ...args] };
  }
  return resolveNpmInvocation(
    args,
    matrixOs?.toLowerCase() === 'windows' ? 'win32' : platform,
    nodeExecutable,
  );
}

export function resolveNpmInvocationForEnvironment(
  args: string[],
  matrixOs: string | undefined = process.env.MATRIX_OS,
  platform: NodeJS.Platform = process.platform,
  nodeExecutable: string = process.execPath,
): { command: string; args: string[] } {
  return resolvePortableNpmInvocation(args, matrixOs, platform, nodeExecutable);
}

/** @id CODE-M5-RELEASE-BUILD-ISOLATION-001
 * @implements REQ-M5-RELEASE-002
 * @design DES-M5-015
 */
export function resolveBuildInvocationForEnvironment(
  matrixOs: string | undefined = process.env.MATRIX_OS,
  platform: NodeJS.Platform = process.platform,
  nodeExecutable: string = process.execPath,
): { command: string; args: string[] } {
  return resolveNpmInvocationForEnvironment(['run', 'build'], matrixOs, platform, nodeExecutable);
}

/** @id CODE-M5-TEST-RUNTIME-BUILD-ISOLATION-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-015
 */
export function cleanTestRuntimeBuildEnvironment(root: string, environment = process.env): NodeJS.ProcessEnv {
  const env = { ...environment }, options = env.NODE_OPTIONS ?? '';
  const preload = `--import=${pathToFileURL(join(root, 'scripts/test-runtime/stable-wall-clock.mjs')).href}`;
  const tokens = options.split(/[ \t]+/).filter(Boolean);
  let memory: string | undefined;
  if (/[^\S\t ]|["'\\\x00-\x08\x0e-\x1f\x7f]/.test(options)) throw new Error('TEST_RUNTIME_BOOTSTRAP_INVALID: node-options');
  for (const token of tokens) {
    if (token === preload || token === '--enable-source-maps') continue;
    if (!/^--max-old-space-size=[1-9][0-9]*$/.test(token) || !Number.isSafeInteger(Number(token.split('=')[1]))
      || memory !== undefined && memory !== token) throw new Error('TEST_RUNTIME_BOOTSTRAP_INVALID: node-options');
    memory = token;
  }
  const countOnly = env.MUSUBIX5_CANDIDATE_COUNT_ONLY === '1' && Boolean(env.MUSUBIX5_CANDIDATE_SLOT_LEDGER);
  if (tokens.includes(preload) !== (Boolean(env.MUSUBIX5_TEST_RUNTIME_CLOCK) || countOnly)) throw new Error('TEST_RUNTIME_BOOTSTRAP_INVALID: worker-scope');
  delete env.MUSUBIX5_TEST_RUNTIME_CLOCK;
  delete env.MUSUBIX5_TEST_RUNTIME_REQUEST;
  delete env.MUSUBIX5_TEST_RUNTIME_DISPATCH;
  const retained = tokens.filter((token) => token !== preload);
  if (env.MUSUBIX5_CANDIDATE_SLOT_LEDGER) {
    retained.push(preload);
    env.MUSUBIX5_CANDIDATE_COUNT_ONLY = '1';
  }
  if (retained.length) env.NODE_OPTIONS = retained.join(' ');
  else delete env.NODE_OPTIONS;
  return env;
}

export const runProcess: Runner = async (command, args, options) => {
  let environment = options.env ?? process.env;
  let release: (() => Promise<void>) | undefined;
  let nativeRelease: SlotRelease | undefined;
  if (options.slotProvider) release = await options.slotProvider.acquire();
  else {
    nativeRelease = processSlotLeases([command, args, { env: environment }], false, process.platform === 'win32');
    environment = nativeRelease.environment ?? environment;
    release = async () => nativeRelease!();
  }
  let closed = false;
  let cleanup: Promise<void> | undefined;
  try { return await new Promise((resolve) => {
  const start = performance.now();
  const invocation = /^npm$/i.test(command)
    ? resolvePortableNpmInvocation(args)
    : resolveProcessInvocation(command, args);
  let child: childProcess.ChildProcessWithoutNullStreams;
  try { child = native.spawn(invocation.command, invocation.args, {
    cwd: options.cwd,
    env: environment,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  }); } catch (cause) {
    closed = true;
    throw cause;
  }
  nativeRelease?.bindNative?.(child);
  let stdout = '';
  let stderr = '';
  let status: ProcessResult['status'] = 'completed';
  let settled = false;
  let killFallback: NodeJS.Timeout | undefined;
  const finish = (exitCode: number | null): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (killFallback) clearTimeout(killFallback);
    resolve({ status, exitCode, stdout, stderr, durationMs: Math.max(0, Math.round(performance.now() - start)) });
  };
  const timer = setTimeout(() => {
    status = 'timeout';
    // Stop this subprocess tree only; inherited output pipes must not hang the gate.
    if (child.pid && process.platform !== 'win32') {
      try { process.kill(-child.pid, 'SIGKILL'); }
      catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'ESRCH') stderr += String(cause); }
    } else if (child.pid) {
      cleanup = new Promise<void>((done) => {
        try {
          const killer = native.spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
          const killerTimer = setTimeout(() => killer.kill('SIGKILL'), 1_000);
          killer.once('error', () => { child.kill('SIGKILL'); clearTimeout(killerTimer); done(); });
          killer.once('close', () => { clearTimeout(killerTimer); done(); });
        } catch (cause) { stderr += String(cause); child.kill('SIGKILL'); done(); }
      });
    } else child.kill('SIGKILL');
    killFallback = setTimeout(() => finish(null), 1_000);
    killFallback.unref();
  }, options.deadline === undefined ? options.timeoutMs : Math.min(options.timeoutMs, remainingCandidateDeadline(options.deadline)));
  child.stdout.on('data', (chunk: Buffer) => { stdout = (stdout + chunk.toString()).slice(-1_000_000); });
  child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-1_000_000); });
  child.stdin.on('error', (cause: NodeJS.ErrnoException) => {
    if (cause.code !== 'EPIPE') { status = 'error'; stderr += cause.message; }
  });
  child.on('error', (cause: NodeJS.ErrnoException) => {
    if (!child.pid) closed = true;
    status = cause.code === 'ENOENT' ? 'missing' : 'error';
    stderr += cause.message;
    finish(null);
  });
  child.on('close', code => { closed = true; finish(code); });
  child.stdin.end(options.input ?? '');
  });
  } finally {
    await cleanup;
    if (closed) await release?.();
  }
};

export async function changedFiles(root: string, runner: Runner = runProcess): Promise<string[]> {
  const location = await runner('git', ['rev-parse', '--show-prefix'], { cwd: root, timeoutMs: 10_000 });
  if (location.status !== 'completed' || location.exitCode !== 0) throw new Error(`Cannot determine changed files: ${location.stderr}`);
  const prefix = location.stdout.replace(/\r?\n$/, '');
  const result = await runner('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'], { cwd: root, timeoutMs: 10_000 });
  if (result.status !== 'completed' || result.exitCode !== 0) throw new Error(`Cannot determine changed files: ${result.stderr}`);
  const entries = result.stdout.split('\0');
  const paths = new Set<string>();
  const add = (path: string): void => {
    if (path.startsWith(prefix)) paths.add(path.slice(prefix.length));
  };
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || entry.length < 4) continue;
    add(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2))) {
      const previous = entries[++i];
      if (previous) add(previous);
    }
  }
  return [...paths].sort();
}
