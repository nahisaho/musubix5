import { spawn, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, constants, lstatSync, mkdirSync, mkdtempSync, openSync, rmSync, writeSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { CandidateGateContext } from './candidate-gate.js';
import { canonicalBytes, canonicalRepositoryIdentity, sha256 } from './canonical.js';
export interface CandidateGateCommandOutcome {
    stdoutPath: string;
    stderrPath: string;
    stdoutTail: string;
    stderrTail: string;
    stdoutSha256: string;
    stderrSha256: string;
    tailsDropped: boolean;
    resultTextDropped: boolean;
    drainTruncated: boolean;
    streamCapTerminated: boolean;
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    spawned: boolean;
    childErrorMessage: string | null;
}
interface CandidateCheck {
    name: string;
    required: boolean;
    status: 'pass' | 'fail' | 'skipped';
    summary: string;
    exitCode?: number | null;
    stdout?: string;
    stderr?: string;
    diagnostics?: Array<{
        code: string;
        severity: 'error' | 'warning' | 'info';
        message: string;
        path?: string;
    }>;
}
interface CandidateResultCheck {
    name: string;
    required: boolean;
    status: 'pass' | 'fail' | 'skipped';
    summary: string;
    exitCode?: number | null;
    stdoutTail?: string;
    stderrTail?: string;
    diagnostics?: CandidateCheck['diagnostics'];
}
type RunnerContext = CandidateGateContext & {
    job: {
        os: string;
        nodeMajor: number;
    };
};
export interface CandidateGateRunnerResult extends RunnerContext {
    producer: 'github-actions';
    runtime: RunnerContext['job'];
    schemaVersion: 1;
    status: 'pass' | 'fail';
    commands: Array<{
        name: string;
        exitCode: number;
        digest: string;
        status: 'pass' | 'fail';
    }>;
    commandsPassed: boolean;
    preTreeMatchesCandidate: boolean;
    postTreeMatchesCandidate: boolean;
    stdoutSha256: string;
    stderrSha256: string;
    gateReportDigest: string;
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    drainTruncated: boolean;
    tailsDropped: boolean;
    resultTextDropped: boolean;
    matchedCauses: string[];
    originalDomainCode: string | null;
    originalDomainMessage: string | null;
    childErrorMessage: string | null;
    stdoutTail?: string;
    stderrTail?: string;
    checks?: CandidateResultCheck[];
    error?: {
        code: 'CANDIDATE_GATE_REPORT_INVALID';
        case: string;
    };
}
const streamLimit = 100000000;
const carryLimit = 8192;
const tailLimit = 20000;
const drainMs = 5000;
const maxInnerTimeoutMs = 300000;
const maxTestTimeoutMs = 900000;
const probeRegionTimeoutMs = maxInnerTimeoutMs;
const commandsRequired = ['typecheck', 'build', 'test', 'codegraph-tests', 'compatibility', 'pack-check', 'pack-smoke'];
const causeOrder = ['runner-import-failure', 'runner-startup-failure', 'precondition-domain-failure', 'subprocess-error', 'runner-processing-failure', 'timeout',
    'stream-cap-termination', 'signal', 'empty-stdout', 'malformed-json', 'invalid-root', 'cli-error',
    'missing-checks', 'non-array-checks', 'invalid-check', 'non-zero-exit', 'incomplete-runtime-acknowledgment'];
const acknowledgmentMessages = ['incomplete command', 'missing final acknowledgment', 'truncated acknowledgment',
    'incomplete native inventory', 'acknowledgment mismatch'].map(text => `acknowledgment-binding: ${text}`);
const ansiPattern = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*?(?:\u0007|\u001b\\)|[@-Z\\^_])/g;
const tokenPattern = /(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})/g;
const tokenCandidate = /(?:gh[pousr]_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+)/g;
const authorizationPattern = /Authorization"?[ \t]*:[ \t]*[^\r\n]+/gi;
const authorizationCandidate = /Authorization"?[ \t]*(?::[ \t]*[^\r\n]*)?/gi;
const scalars = (value: string) => Array.from(value);
const stripAnsi = (text: string) => text.replace(ansiPattern, '');
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export class CandidateGateStartupError extends Error {
    readonly code = 'GATE_RUNNER_UNAVAILABLE';
    constructor() {
        super('Candidate gate runner unavailable.');
        this.name = 'CandidateGateStartupError';
    }
}
export type CandidateGateFaultStage = 'spool-directory' | 'stdout-open' | 'stderr-open' | 'command-start' | 'spawn-attempt' | 'stream-processing' | 'postconditions' | 'normalization';
export interface CandidateGateSpool {
    directory: string;
    stdoutPath: string;
    stderrPath: string;
    stdoutFile: CandidateGateSpoolFile;
    stderrFile: CandidateGateSpoolFile;
}
export interface CandidateGateSpoolFile {
    write(bytes: Buffer, offset: number, length: number): Promise<{
        bytesWritten: number;
    }>;
    close(): Promise<void>;
}
export type CandidateGateChild = Pick<ReturnType<typeof spawn>, 'pid' | 'stdout' | 'stderr' | 'kill' | 'emit'> & {
    once(event: 'spawn', listener: () => void): unknown;
    once(event: 'error', listener: (cause: unknown) => void): unknown;
    once(event: 'exit' | 'close', listener: (code: number | null, signal: string | null) => void): unknown;
};
export interface CandidateGateRunnerDependencies {
    arithmetic?: (allowance: number, timeouts: readonly number[], formalTimeout: number) => number;
    spawn?: ((command: string, args: string[], options: SpawnOptions) => CandidateGateChild) | undefined;
    setTimeout?: typeof setTimeout;
    clearTimeout?: typeof clearTimeout;
    preconditionSetTimeout?: typeof setTimeout;
    preconditionClearTimeout?: typeof clearTimeout;
    now?: () => number;
    onCommandStart?: () => void;
    preconditions?: Preconditions;
    terminateProcessTree?: (child: CandidateGateChild) => void | Promise<void>;
    createSpool?: (directory: string) => Promise<CandidateGateSpool>;
    persistResult?: (path: string, result: CandidateGateRunnerResult) => Promise<void>;
    fault?: (stage: CandidateGateFaultStage) => void;
}
function orchestrationRange(value: unknown): asserts value is number {
    if (!Number.isSafeInteger(value) || (value as number) < 75107 || (value as number) > 3075000)
        throw new CandidateGateStartupError();
}
function commandRange(value: unknown): asserts value is number {
    if (!Number.isSafeInteger(value) || (value as number) < 75107 || (value as number) > 2475000)
        throw new CandidateGateStartupError();
}
export function candidateGateOrchestrationTimeout(commands: unknown, formalTimeout: unknown, dependencies: CandidateGateRunnerDependencies = {}): number {
    try {
        if (!Array.isArray(commands) || commands.length !== commandsRequired.length
            || !commands.every(command => object(command) && typeof command.name === 'string'
                && commandsRequired.includes(command.name) && Number.isSafeInteger(command.timeoutMs)
                && (command.timeoutMs as number) > 0
                && (command.timeoutMs as number) <= (command.name === 'test' ? maxTestTimeoutMs : maxInnerTimeoutMs))
            || new Set(commands.map(command => command.name)).size !== commandsRequired.length
            || !Number.isSafeInteger(formalTimeout) || (formalTimeout as number) < 100 || (formalTimeout as number) > maxInnerTimeoutMs)
            throw new CandidateGateStartupError();
        const timeouts = commands.map(command => command.timeoutMs as number);
        const value = (dependencies.arithmetic ?? ((allowance, values, formal) => allowance + values.reduce((sum, timeout) => sum + timeout, 0) + formal))(75000, timeouts, formalTimeout as number);
        orchestrationRange(value);
        return value;
    }
    catch {
        throw new CandidateGateStartupError();
    }
}
async function atomicWrite(path: string, bytes: Uint8Array): Promise<void> {
    const directory = await mkdtemp(join(dirname(path), '.candidate-result-'));
    const staging = join(directory, 'result');
    try {
        const file = await open(staging, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
        try {
            await file.writeFile(bytes);
            await file.sync();
        }
        finally {
            await file.close();
        }
        await rename(staging, path);
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
}
export async function validateCandidateGateWrapperInput(input: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    config: unknown;
}): Promise<{
    context: RunnerContext;
    commands: unknown;
    formalTimeout: unknown;
    temporaryDirectory: string;
}> {
    try {
        const env = input.env;
        const context = {
            repositoryId: env.REPOSITORY_ID!, changeId: env.CHANGE_ID!, generation: Number(env.GENERATION),
            candidateCommit: env.CANDIDATE_COMMIT!, gateInputFingerprint: env.GATE_INPUT_FINGERPRINT!,
            job: { os: env.MATRIX_OS!, nodeMajor: Number(env.MATRIX_NODE) },
        };
        if (!env.RUNNER_TEMP || !/^repository:[a-f0-9]{64}$/.test(context.repositoryId ?? '')
            || !/^CHANGE-\d+$/.test(context.changeId ?? '') || !Number.isSafeInteger(context.generation) || context.generation <= 0
            || !/^[a-f0-9]{40}$/.test(context.candidateCommit ?? '') || !/^[a-f0-9]{64}$/.test(context.gateInputFingerprint ?? '')
            || !['ubuntu', 'windows', 'macos'].includes(context.job.os) || context.job.nodeMajor !== 24 || !object(input.config))
            throw new CandidateGateStartupError();
        await mkdir(env.RUNNER_TEMP, { recursive: true });
        await secureDirectory(env.RUNNER_TEMP);
        const probe = await mkdtemp(join(env.RUNNER_TEMP, '.candidate-probe-'));
        try {
            await atomicWrite(join(probe, 'probe'), Buffer.from('probe'));
        }
        finally {
            await rm(probe, { recursive: true, force: true });
        }
        return { context, commands: input.config.commands,
            formalTimeout: object(input.config.formal) ? input.config.formal.timeoutMs : undefined,
            temporaryDirectory: env.RUNNER_TEMP };
    }
    catch {
        throw new CandidateGateStartupError();
    }
}
async function secureDirectory(directory: string): Promise<void> {
    for (let path = resolve(directory);; path = dirname(path)) {
        const stat = await lstat(path);
        if (!stat.isDirectory() || stat.isSymbolicLink())
            throw new CandidateGateStartupError();
        if (path === dirname(path))
            break;
    }
}
function configuredSecrets(values: readonly string[], env: NodeJS.ProcessEnv = {}): string[] {
    const environmentValues = Object.entries(env).filter(([name, value]) => value &&
        (/^(?:GITHUB_TOKEN|GH_TOKEN|ACTIONS_ID_TOKEN_REQUEST_TOKEN)$/.test(name) || /_(?:TOKEN|SECRET|PASSWORD|KEY)$/.test(name)))
        .map(([, value]) => value!);
    return [...new Set([...values, ...environmentValues].filter(Boolean).flatMap(value => [
            stripAnsi(value), stripAnsi(JSON.stringify(value).slice(1, -1)),
        ]).filter(Boolean))].sort((a, b) => scalars(b).length - scalars(a).length);
}
class TailRedactor {
    private carry = '';
    private ansiCarry = '';
    tail = '';
    unsafe: boolean;
    dropped = false;
    private readonly lookbehind: number;
    constructor(private readonly secrets: readonly string[]) {
        this.unsafe = secrets.some(value => scalars(value).length > carryLimit);
        this.lookbehind = Math.min(carryLimit, secrets.reduce((maximum, value) => Math.max(maximum, scalars(value).length), 16));
    }
    append(value: string, final = false): void {
        if (this.unsafe)
            return;
        let incoming = this.ansiCarry + value;
        this.ansiCarry = '';
        incoming = stripAnsi(incoming);
        const escape = incoming.lastIndexOf('\u001b');
        if (!final && escape >= 0) {
            this.ansiCarry = incoming.slice(escape);
            incoming = incoming.slice(0, escape);
            if (scalars(this.ansiCarry + this.carry).length > carryLimit)
                return this.omit();
        }
        const text = this.carry + incoming;
        const points = scalars(text);
        let cut = final ? text.length : points.slice(0, Math.max(0, points.length - this.lookbehind)).join('').length;
        let pendingStart = text.length;
        const ranges: Array<{
            start: number;
            end: number;
        }> = [];
        const redactions: typeof ranges = [];
        for (const secret of this.secrets) {
            for (let at = text.indexOf(secret); at >= 0; at = text.indexOf(secret, at + 1)) {
                const range = { start: at, end: at + secret.length };
                ranges.push(range);
                redactions.push(range);
            }
        }
        for (const pattern of [tokenCandidate, authorizationCandidate]) {
            for (const match of text.matchAll(pattern)) {
                if (scalars(match[0]).length > carryLimit)
                    return this.omit();
                ranges.push({ start: match.index, end: match.index + match[0].length });
                if (!final && match.index + match[0].length === text.length)
                    pendingStart = Math.min(pendingStart, match.index);
            }
        }
        cut = Math.min(cut, pendingStart);
        for (const range of this.merge(ranges))
            if (range.start < cut && range.end > cut) {
                cut = range.end <= pendingStart ? range.end : range.start;
            }
        this.carry = text.slice(cut);
        if (scalars(this.carry).length > carryLimit)
            return this.omit();
        for (const match of text.matchAll(tokenPattern)) {
            redactions.push({ start: match.index, end: match.index + match[0].length });
        }
        for (const match of text.matchAll(authorizationPattern)) {
            const colon = match[0].indexOf(':');
            const whitespace = /^[ \t]*/.exec(match[0].slice(colon + 1))![0].length;
            redactions.push({ start: match.index + colon + 1 + whitespace, end: match.index + match[0].length });
        }
        // Union original-text matches before replacement so intersecting secrets cannot hide a token/header.
        const parts: string[] = [];
        let consumed = 0;
        for (const range of this.merge(redactions)) {
            if (range.end > cut)
                break;
            parts.push(text.slice(consumed, range.start), '[REDACTED]');
            consumed = range.end;
        }
        parts.push(text.slice(consumed, cut));
        const safe = parts.join('');
        const combined = scalars(this.tail + safe);
        this.dropped ||= combined.length > tailLimit;
        this.tail = combined.slice(-tailLimit).join('');
    }
    private merge(ranges: Array<{
        start: number;
        end: number;
    }>): typeof ranges {
        const merged: typeof ranges = [];
        for (const range of ranges.sort((a, b) => a.start - b.start || b.end - a.end)) {
            const previous = merged.at(-1);
            if (previous && range.start < previous.end)
                previous.end = Math.max(previous.end, range.end);
            else
                merged.push({ ...range });
        }
        return merged;
    }
    private omit(): void {
        this.unsafe = true;
        this.carry = this.ansiCarry = this.tail = '';
    }
}
interface CommandInput {
    command: string;
    args: string[];
    cwd: string;
    temporaryDirectory: string;
    timeoutMs: number;
    secrets: readonly string[];
    env?: NodeJS.ProcessEnv;
    onCommandStart?: () => void;
    dependencies?: CandidateGateRunnerDependencies;
}
async function createSpool(input: CommandInput): Promise<CandidateGateSpool> {
    let directory: string | undefined, stdoutFile: CandidateGateSpoolFile | undefined, stderrFile: CandidateGateSpoolFile | undefined;
    const file = (path: string): CandidateGateSpoolFile => {
        const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
        let closed = false;
        return {
            write: async (bytes, offset, length) => ({ bytesWritten: writeSync(fd, bytes, offset, length) }),
            close: async () => { if (!closed) {
                closed = true;
                closeSync(fd);
            } },
        };
    };
    try {
        mkdirSync(input.temporaryDirectory, { recursive: true });
        for (let path = resolve(input.temporaryDirectory);; path = dirname(path)) {
            const stat = lstatSync(path);
            if (!stat.isDirectory() || stat.isSymbolicLink())
                throw new CandidateGateStartupError();
            if (path === dirname(path))
                break;
        }
        directory = mkdtempSync(join(input.temporaryDirectory, 'musubix5-gate-'));
        input.dependencies?.fault?.('spool-directory');
        const stdoutPath = join(directory, 'stdout'), stderrPath = join(directory, 'stderr');
        stdoutFile = file(stdoutPath);
        input.dependencies?.fault?.('stdout-open');
        stderrFile = file(stderrPath);
        input.dependencies?.fault?.('stderr-open');
        return { directory, stdoutPath, stderrPath, stdoutFile, stderrFile };
    }
    catch {
        await Promise.allSettled([stdoutFile?.close(), stderrFile?.close()]);
        if (directory)
            rmSync(directory, { recursive: true, force: true });
        throw new CandidateGateStartupError();
    }
}
function terminateProcessTree(child: CandidateGateChild): void {
    if (!child.pid)
        return;
    if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: false, stdio: 'ignore', timeout: drainMs });
        killer.on('error', () => { child.kill('SIGKILL'); });
        killer.on('exit', code => { if (code !== 0)
            child.kill('SIGKILL'); });
    }
    else {
        try {
            process.kill(-child.pid, 'SIGKILL');
        }
        catch {
            child.kill('SIGKILL');
        }
    }
}
class RunnerProcessingError extends Error {
    constructor(readonly outcome: CandidateGateCommandOutcome) { super('Candidate gate runner processing failed.'); }
}
const commandTermination = new WeakMap<CandidateGateCommandOutcome, () => void>();
/** @id CODE-M5-CI-CANDIDATE-CAPTURE-001
 * @implements REQ-M5-CI-008
 * @design DES-M5-CI-008
 */
export async function runCandidateGateCommand(input: CommandInput, outerTimeout = false): Promise<CandidateGateCommandOutcome> {
    if (outerTimeout)
        orchestrationRange(input.timeoutMs);
    else
        commandRange(input.timeoutMs);
    const dependencies = input.dependencies ?? {};
    const schedule = dependencies.setTimeout ?? setTimeout, cancel = dependencies.clearTimeout ?? clearTimeout;
    let spool: CandidateGateSpool;
    try {
        spool = await (dependencies.createSpool ? dependencies.createSpool(input.temporaryDirectory) : createSpool(input));
    }
    catch {
        throw new CandidateGateStartupError();
    }
    const { directory, stdoutPath, stderrPath, stdoutFile, stderrFile } = spool;
    const secrets = configuredSecrets(input.secrets, input.env ?? process.env);
    const stdoutTail = new TailRedactor(secrets), stderrTail = new TailRedactor(secrets);
    const stdoutHash = createHash('sha256'), stderrHash = createHash('sha256');
    let timedOut = false, streamCapTerminated = false, drainTruncated = false;
    let exitCode: number | null = null, signal: string | null = null, spawned = false, childErrorMessage: string | null = null;
    let child: CandidateGateChild & {
        stdout: NonNullable<ReturnType<typeof spawn>['stdout']>;
        stderr: NonNullable<ReturnType<typeof spawn>['stderr']>;
    };
    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finishExit = () => { };
    let terminateRequested = false;
    const terminate = () => {
        if (terminateRequested)
            return;
        terminateRequested = true;
        if (!child.pid)
            return;
        try {
            const pending = (dependencies.terminateProcessTree ?? terminateProcessTree)(child);
            if (pending)
                void pending.catch(() => { });
        }
        catch { /* Drain still bounds a failed process-tree termination. */ }
    };
    const beginDrain = () => {
        if (drainTimer)
            return;
        drainTimer = schedule(() => {
            drainTruncated = true;
            child.stdout.destroy();
            child.stderr.destroy();
            finishExit();
        }, drainMs);
    };
    try {
        dependencies.fault?.('command-start');
        (input.onCommandStart ?? dependencies.onCommandStart)?.();
        timer = schedule(() => { timedOut = true; terminate(); beginDrain(); }, input.timeoutMs);
        dependencies.fault?.('spawn-attempt');
        child = (dependencies.spawn ?? spawn)(input.command, input.args, { cwd: input.cwd, env: input.env ?? process.env,
            shell: false, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' }) as typeof child;
    }
    catch {
        cancel(timer);
        await Promise.allSettled([stdoutFile.close(), stderrFile.close()]);
        await rm(directory, { recursive: true, force: true });
        throw new CandidateGateStartupError();
    }
    child.once('spawn', () => { spawned = true; });
    let spawnError = false;
    const exited = new Promise<void>(accept => {
        finishExit = accept;
        child.once('error', cause => {
            spawnError = !spawned;
            if (spawned)
                childErrorMessage = guardedMessage(cause) ?? 'Candidate gate subprocess failed.';
            cancel(timer);
            terminate();
            beginDrain();
            accept();
        });
        child.once('exit', (code, childSignal) => {
            exitCode = code;
            signal = childSignal;
            cancel(timer);
            beginDrain();
            accept();
        });
    });
    const pump = async (stream: typeof child.stdout, file: typeof stdoutFile, hash: typeof stdoutHash, redactor: TailRedactor) => {
        let size = 0;
        const decoder = new StringDecoder('utf8');
        try {
            for await (const value of stream) {
                const bytes: Buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
                hash.update(bytes);
                dependencies.fault?.('stream-processing');
                redactor.append(decoder.write(bytes));
                const retained = Math.min(bytes.length, streamLimit - size);
                let offset = 0;
                while (offset < retained) {
                    const { bytesWritten } = await file.write(bytes, offset, retained - offset);
                    if (!bytesWritten)
                        throw new Error('CANDIDATE_GATE_REPORT_INVALID: incomplete spool write.');
                    offset += bytesWritten;
                }
                size += retained;
                if (retained !== bytes.length && !streamCapTerminated) {
                    streamCapTerminated = true;
                    terminate();
                    beginDrain();
                }
            }
        }
        catch (cause) {
            if (!drainTruncated && !spawnError && childErrorMessage === null)
                throw cause;
        }
        redactor.append(decoder.end(), true);
    };
    const streams = [pump(child.stdout, stdoutFile, stdoutHash, stdoutTail), pump(child.stderr, stderrFile, stderrHash, stderrTail)];
    let processingFailure = false;
    try {
        try {
            await Promise.all([exited, ...streams]);
        }
        catch {
            processingFailure = true;
            cancel(timer);
            terminate();
            beginDrain();
            await Promise.allSettled(streams);
        }
        if (spawnError)
            throw new CandidateGateStartupError();
        const unsafe = stdoutTail.unsafe || stderrTail.unsafe;
        const outcome = { stdoutPath, stderrPath, stdoutTail: unsafe ? '' : stdoutTail.tail, stderrTail: unsafe ? '' : stderrTail.tail,
            stdoutSha256: stdoutHash.digest('hex'), stderrSha256: stderrHash.digest('hex'), exitCode, signal, timedOut,
            spawned, childErrorMessage, streamCapTerminated, drainTruncated,
            tailsDropped: unsafe || stdoutTail.dropped || stderrTail.dropped, resultTextDropped: unsafe };
        commandTermination.set(outcome, terminate);
        if (processingFailure)
            throw new RunnerProcessingError(outcome);
        return outcome;
    }
    catch (cause) {
        if (!(cause instanceof RunnerProcessingError)) {
            await Promise.allSettled([stdoutFile.close(), stderrFile.close()]);
            await rm(directory, { recursive: true, force: true });
        }
        throw cause;
    }
    finally {
        cancel(timer);
        cancel(drainTimer);
        await Promise.allSettled([stdoutFile.close(), stderrFile.close()]);
    }
}
function candidateCheck(value: unknown): value is CandidateCheck {
    return object(value) && typeof value.name === 'string' && /^[A-Za-z][A-Za-z0-9:.-]{0,127}$/.test(value.name)
        && typeof value.required === 'boolean' && typeof value.status === 'string' && ['pass', 'fail', 'skipped'].includes(value.status)
        && typeof value.summary === 'string'
        && (value.exitCode === undefined || value.exitCode === null || Number.isSafeInteger(value.exitCode))
        && (value.stdout === undefined || typeof value.stdout === 'string') && (value.stderr === undefined || typeof value.stderr === 'string')
        && (value.diagnostics === undefined || Array.isArray(value.diagnostics) && value.diagnostics.every(diagnostic => object(diagnostic) && typeof diagnostic.code === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/.test(diagnostic.code)
            && typeof diagnostic.severity === 'string' && ['error', 'warning', 'info'].includes(diagnostic.severity)
            && typeof diagnostic.message === 'string' && (diagnostic.path === undefined || typeof diagnostic.path === 'string')));
}
interface NormalizeOptions {
    resultPath: string;
    context: RunnerContext;
    secrets: readonly string[];
    preTreeMatchesCandidate?: boolean;
    postTreeMatchesCandidate?: boolean;
    domainFailure?: {
        code: string;
        message: string;
    };
    initialCause?: string;
    dependencies?: CandidateGateRunnerDependencies;
}
class PrimaryPersistenceError extends Error {
    constructor() { super('Candidate gate result persistence failed.'); }
}
/** @id CODE-M5-CI-CANDIDATE-NORMALIZER-001
 * @implements REQ-M5-CI-008
 * @design DES-M5-CI-008
 */
export async function normalizeCandidateGateReport(outcome: CandidateGateCommandOutcome, options: NormalizeOptions): Promise<CandidateGateRunnerResult> {
    const secrets = configuredSecrets(options.secrets);
    let omitText = outcome.resultTextDropped;
    let textDiscarded = false;
    const safeText = (text: string) => {
        if (options.initialCause === 'runner-startup-failure')
            return text;
        const redactor = new TailRedactor(secrets);
        for (let offset = 0; offset < text.length; offset += 32768)
            redactor.append(text.slice(offset, offset + 32768));
        redactor.append('', true);
        omitText ||= redactor.unsafe;
        textDiscarded ||= redactor.dropped;
        return redactor.tail;
    };
    const causes = new Set<string>();
    if (options.initialCause)
        causes.add(options.initialCause);
    if (outcome.childErrorMessage !== null)
        causes.add('subprocess-error');
    if (outcome.timedOut)
        causes.add('timeout');
    if (outcome.streamCapTerminated)
        causes.add('stream-cap-termination');
    if (outcome.signal)
        causes.add('signal');
    if (outcome.exitCode !== null && outcome.exitCode !== 0)
        causes.add('non-zero-exit');
    let parsed: unknown;
    let domainCode: string | null = options.domainFailure?.code ?? null;
    let domainMessage: string | null = options.domainFailure?.message ?? null;
    if (outcome.childErrorMessage !== null && !options.domainFailure) {
        domainCode = 'GATE_SUBPROCESS_ERROR';
        domainMessage = outcome.childErrorMessage;
    }
    let checks: CandidateCheck[] = [];
    try {
        if (!options.initialCause) {
            try {
                const stat = await lstat(outcome.stdoutPath);
                if (!stat.isFile() || stat.isSymbolicLink() || stat.size > streamLimit)
                    throw new Error('unsafe spool');
                const file = await open(outcome.stdoutPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
                let raw: Buffer;
                try {
                    raw = await file.readFile();
                }
                finally {
                    await file.close();
                }
                if (!outcome.streamCapTerminated && !outcome.drainTruncated && sha256(raw) !== outcome.stdoutSha256) {
                    omitText = true;
                    throw new Error('spool digest mismatch');
                }
                if (!raw.length)
                    causes.add('empty-stdout');
                else {
                    try {
                        parsed = JSON.parse(raw.toString('utf8'));
                    }
                    catch {
                        causes.add('malformed-json');
                    }
                    if (!causes.has('malformed-json')) {
                        if (!object(parsed))
                            causes.add('invalid-root');
                        else if ('error' in parsed) {
                            causes.add('cli-error');
                            if (object(parsed.error)) {
                                if (typeof parsed.error.code === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/.test(parsed.error.code))
                                    domainCode = parsed.error.code;
                                if (typeof parsed.error.message === 'string')
                                    domainMessage = parsed.error.message;
                                if (domainCode === 'TEST_RUNTIME_BOOTSTRAP_INVALID' && domainMessage !== null
                                    && acknowledgmentMessages.some(message => domainMessage!.includes(message)))
                                    causes.add('incomplete-runtime-acknowledgment');
                            }
                            else if (typeof parsed.error === 'string')
                                domainMessage = parsed.error;
                            if (Array.isArray(parsed.checks) && parsed.checks.length <= 10000 && parsed.checks.every(candidateCheck))
                                checks = parsed.checks;
                        }
                        else if (!('checks' in parsed))
                            causes.add('missing-checks');
                        else if (!Array.isArray(parsed.checks))
                            causes.add('non-array-checks');
                        else if (parsed.checks.length > 10000 || !parsed.checks.every(candidateCheck))
                            causes.add('invalid-check');
                        else
                            checks = parsed.checks;
                    }
                }
            }
            catch {
                causes.add('malformed-json');
                omitText = true;
            }
        }
        if (outcome.childErrorMessage !== null && !options.domainFailure) {
            domainCode = 'GATE_SUBPROCESS_ERROR';
            domainMessage = outcome.childErrorMessage;
        }
        const sanitizedChecks: CandidateResultCheck[] = checks.map(check => {
            const failedRequiredCommand = check.name.startsWith('command:') && check.required && check.status === 'fail';
            return {
                name: check.name, required: check.required, status: check.status, summary: safeText(check.summary),
                ...(failedRequiredCommand ? {
                    exitCode: check.exitCode ?? null,
                    stdoutTail: safeText(check.stdout ?? ''),
                    stderrTail: safeText(check.stderr ?? ''),
                } : {}),
                ...(check.diagnostics ? { diagnostics: check.diagnostics.map(diagnostic => ({
                    code: diagnostic.code, severity: diagnostic.severity, message: safeText(diagnostic.message),
                    ...(diagnostic.path !== undefined ? { path: safeText(diagnostic.path) } : {}),
                })) } : {}),
            };
        });
        const commands = checks.filter(check => check.name.startsWith('command:')).map(check => ({
            name: check.name.slice(8), exitCode: check.exitCode ?? -1,
            digest: sha256(canonicalBytes({ name: check.name.slice(8), exitCode: check.exitCode ?? -1,
                stdout: check.stdout ?? '', stderr: check.stderr ?? '' })),
            status: check.status === 'pass' && check.exitCode === 0 ? 'pass' as const : 'fail' as const,
        }));
        const stdoutTail = safeText(outcome.stdoutTail), stderrTail = safeText(outcome.stderrTail);
        const originalDomainCode = domainCode;
        const originalDomainMessage = domainMessage === null ? null : safeText(domainMessage);
        const childErrorMessage = outcome.childErrorMessage === null ? null : safeText(outcome.childErrorMessage);
        const matchedCauses = causeOrder.filter(cause => causes.has(cause));
        const commandsPassed = !matchedCauses.length && !omitText && !outcome.drainTruncated && outcome.exitCode === 0
            && checks.every(check => !check.required || check.name === 'approval' || check.status === 'pass')
            && commands.length === commandsRequired.length
            && commands.map(command => command.name).sort().join('\n') === [...commandsRequired].sort().join('\n')
            && commands.every(command => command.status === 'pass');
        const result: CandidateGateRunnerResult = {
            schemaVersion: 1, ...options.context, producer: 'github-actions', runtime: options.context.job,
            commands: omitText ? [] : commands, commandsPassed,
            preTreeMatchesCandidate: options.preTreeMatchesCandidate === true, postTreeMatchesCandidate: options.postTreeMatchesCandidate === true,
            gateReportDigest: outcome.stdoutSha256, status: commandsPassed && options.preTreeMatchesCandidate === true
                && options.postTreeMatchesCandidate === true ? 'pass' : 'fail',
            stdoutSha256: outcome.stdoutSha256, stderrSha256: outcome.stderrSha256, exitCode: outcome.exitCode, signal: outcome.signal,
            timedOut: outcome.timedOut, drainTruncated: outcome.drainTruncated, matchedCauses,
            tailsDropped: outcome.tailsDropped || textDiscarded || omitText, resultTextDropped: omitText,
            originalDomainCode, originalDomainMessage: omitText ? null : originalDomainMessage,
            childErrorMessage: omitText ? null : childErrorMessage,
            ...(!omitText && !options.initialCause ? { stdoutTail, stderrTail, checks: sanitizedChecks } : {}),
            ...(matchedCauses.length || omitText || outcome.drainTruncated ? {
                error: { code: 'CANDIDATE_GATE_REPORT_INVALID' as const, case: matchedCauses[0] ?? (omitText ? 'redaction-unavailable' : 'drain-truncated') },
            } : {}),
        };
        try {
            await (options.dependencies?.persistResult ?? ((path, value) => atomicWrite(path, canonicalBytes(value))))(options.resultPath, result);
        }
        catch {
            throw new PrimaryPersistenceError();
        }
        return result;
    }
    catch (cause) {
        if (!(cause instanceof PrimaryPersistenceError))
            commandTermination.get(outcome)?.();
        throw cause;
    }
    finally {
        commandTermination.delete(outcome);
        for (const path of [outcome.stdoutPath, outcome.stderrPath])
            if (path)
                await rm(path, { force: true });
        if (outcome.stdoutPath && dirname(outcome.stdoutPath) === dirname(outcome.stderrPath)
            && dirname(outcome.stdoutPath).split(/[\\/]/).at(-1)?.startsWith('musubix5-gate-')) {
            await rm(dirname(outcome.stdoutPath), { recursive: true, force: true });
        }
    }
}
export interface Preconditions {
    candidateCommit(): Promise<void>;
    repositoryIdentity(): Promise<void>;
    lfsClosure(): Promise<void>;
    trackedTree(phase: 'pre' | 'post'): Promise<boolean>;
}
function guardedMessage(cause: unknown): string | undefined {
    try {
        if ((typeof cause === 'object' && cause !== null) || typeof cause === 'function') {
            const message = (cause as {
                message?: unknown;
            }).message;
            if (typeof message === 'string')
                return message;
        }
    }
    catch { /* Hostile thrown values are not trusted diagnostics. */ }
    return undefined;
}
function preconditionFailure(cause: unknown): {
    code: string;
    message: string;
} {
    const generic = { code: 'CANDIDATE_GATE_PRECONDITION_FAILED', message: 'Candidate gate precondition failed.' };
    try {
        if (cause === null || (typeof cause !== 'object' && typeof cause !== 'function'))
            return generic;
        const value = cause as { code?: unknown; message?: unknown };
        const code = value.code, message = value.message;
        if (typeof code !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(code) || code.startsWith('GATE_')
            || code === 'CANDIDATE_GATE_REPORT_INVALID' || typeof message !== 'string')
            return generic;
        return { code, message };
    }
    catch {
        return generic;
    }
}
function domainFailure(code: string, message: string): Error & {
    code: string;
} {
    return Object.assign(new Error(message), { code });
}
async function stopProbe(child: CandidateGateChild, dependencies: CandidateGateRunnerDependencies): Promise<void> {
    let pending: void | Promise<void>;
    try {
        pending = (dependencies.terminateProcessTree ?? terminateProcessTree)(child);
    }
    catch {
        pending = undefined;
    }
    child.stdout?.destroy();
    child.stderr?.destroy();
    try {
        await pending;
    }
    catch { /* The aggregate cleanup deadline remains authoritative. */ }
}
function defaultPreconditions(input: CommandInput & NormalizeOptions, probes: Set<CandidateGateChild>, signal: AbortSignal): Preconditions {
    const probe = async (command: string, args: string[]): Promise<string> => {
        if (signal.aborted)
            throw domainFailure('CANDIDATE_GATE_PRECONDITION_TIMEOUT', 'Candidate gate precondition timed out.');
        const child = (input.dependencies?.spawn ?? spawn)(command, args, {
            cwd: input.cwd, env: input.env ?? process.env, shell: false, detached: process.platform !== 'win32',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        probes.add(child);
        let stdout = '', stderr = '';
        child.stdout?.setEncoding('utf8');
        child.stderr?.setEncoding('utf8');
        child.stdout?.on('data', value => { if (stdout.length < 1000000)
            stdout += String(value); });
        child.stderr?.on('data', value => { if (stderr.length < 20000)
            stderr += String(value); });
        let succeeded = false;
        try {
            const value = await new Promise<string>((accept, reject) => {
                child.once('error', reject);
                child.once('close', code => {
                    if (code === 0)
                        accept(stdout);
                    else {
                        try {
                            const failure = JSON.parse(stdout);
                            reject(preconditionFailure(failure));
                        }
                        catch {
                            reject(domainFailure('CANDIDATE_GATE_PRECONDITION_FAILED', stderr || 'Candidate gate precondition failed.'));
                        }
                    }
                });
            });
            succeeded = true;
            return value;
        }
        finally {
            if (succeeded)
                probes.delete(child);
        }
    };
    const git = (args: string[]) => probe('git', args);
    const workspaceProbe = (operation: 'lfs' | 'tree', phase?: 'pre' | 'post') => probe(process.execPath, [
        join(input.cwd, '.github/scripts/run-candidate-precondition-probe.mjs'),
        operation, input.cwd, input.context.candidateCommit, ...(phase ? [phase] : []),
    ]);
    return {
        candidateCommit: async () => {
            const head = await git(['rev-parse', 'HEAD']);
            if (head.trim().toLowerCase() !== input.context.candidateCommit.toLowerCase()) {
                throw domainFailure('RELEASE_GATE_CANDIDATE_MISMATCH', 'Checked out commit does not match candidateCommit.');
            }
        },
        repositoryIdentity: async () => {
            const root = await git(['rev-parse', '--show-toplevel']), remote = await git(['config', '--get-all', 'remote.origin.url']);
            if (!root.trim()
                || canonicalRepositoryIdentity(remote.split(/\r?\n/, 1)[0]!, root.trim()) !== input.context.repositoryId) {
                throw domainFailure('RELEASE_GATE_CANDIDATE_MISMATCH', 'Repository identity mismatch; use the credential-free GitHub HTTPS origin.');
            }
        },
        lfsClosure: async () => {
            await workspaceProbe('lfs');
        },
        trackedTree: async (phase) => {
            await probe(process.execPath, ['scripts/verify-lfs-checkout.mjs', '.', '--verify-only']);
            return (await workspaceProbe('tree', phase)).trim() === 'true';
        },
    };
}
/** @id CODE-M5-CI-CANDIDATE-WORKFLOW-001
 * @implements REQ-M5-CI-008
 * @design DES-M5-CI-008
 */
export async function runCandidateGateWorkflow(input: CommandInput & NormalizeOptions & {
    preconditions?: Preconditions;
}): Promise<CandidateGateRunnerResult> {
    const secrets = configuredSecrets(input.secrets, input.env ?? process.env);
    const dependencies = input.dependencies ?? {};
    const schedule = dependencies.setTimeout ?? setTimeout, cancel = dependencies.clearTimeout ?? clearTimeout;
    const now = dependencies.now ?? (() => performance.now());
    const preSchedule = dependencies.preconditionSetTimeout ?? setTimeout;
    const preCancel = dependencies.preconditionClearTimeout ?? clearTimeout;
    const emptyOutcome = (): CandidateGateCommandOutcome => ({
        stdoutPath: '', stderrPath: '', stdoutTail: '', stderrTail: '', stdoutSha256: sha256(Buffer.alloc(0)), stderrSha256: sha256(Buffer.alloc(0)),
        tailsDropped: false, resultTextDropped: false, drainTruncated: false, streamCapTerminated: false,
        exitCode: null, signal: null, timedOut: false, spawned: false, childErrorMessage: null,
    });
    const probes = new Set<CandidateGateChild>();
    const abort = new AbortController();
    const preconditions = input.preconditions ?? dependencies.preconditions ?? defaultPreconditions(input, probes, abort.signal);
    const deadline = now() + probeRegionTimeoutMs;
    let preconditionTimer: ReturnType<typeof setTimeout> | undefined;
    const expired = domainFailure('CANDIDATE_GATE_PRECONDITION_TIMEOUT', 'Candidate gate precondition timed out.');
    try {
        const task = (async () => {
            for (const check of [
                () => preconditions.candidateCommit(), () => preconditions.repositoryIdentity(), () => preconditions.lfsClosure(),
                async () => { if (!await preconditions.trackedTree('pre'))
                    throw domainFailure('TDD_SOURCE_LFS_INVALID', 'worktree-integrity'); },
            ]) {
                if (abort.signal.aborted || now() >= deadline)
                    throw expired;
                await check();
                if (abort.signal.aborted || now() >= deadline)
                    throw expired;
            }
        })();
        await Promise.race([task, new Promise<never>((_, reject) => {
                preconditionTimer = preSchedule(() => { abort.abort(); reject(expired); }, probeRegionTimeoutMs);
            })]);
    }
    catch (cause) {
        abort.abort();
        if (probes.size) {
            let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
            try {
                await Promise.race([Promise.allSettled([...probes].map(child => stopProbe(child, dependencies))),
                    new Promise<void>(accept => { cleanupTimer = schedule(accept, drainMs); })]);
            }
            finally {
                cancel(cleanupTimer);
            }
        }
        return normalizeCandidateGateReport(emptyOutcome(), { ...input, secrets, preTreeMatchesCandidate: false, postTreeMatchesCandidate: false,
            initialCause: 'precondition-domain-failure', domainFailure: preconditionFailure(cause) });
    }
    finally {
        preCancel(preconditionTimer);
    }
    let outcome: CandidateGateCommandOutcome;
    try {
        outcome = await runCandidateGateCommand({ ...input, secrets }, true);
    }
    catch (cause) {
        if (cause instanceof CandidateGateStartupError) {
            return normalizeCandidateGateReport(emptyOutcome(), { ...input, secrets,
                preTreeMatchesCandidate: false, postTreeMatchesCandidate: false,
                initialCause: 'runner-startup-failure',
                domainFailure: { code: 'GATE_RUNNER_UNAVAILABLE', message: 'Candidate gate runner unavailable.' } });
        }
        outcome = cause instanceof RunnerProcessingError ? cause.outcome : emptyOutcome();
        return normalizeCandidateGateReport(outcome, { ...input, secrets, initialCause: 'runner-processing-failure',
            domainFailure: { code: 'GATE_RUNNER_PROCESSING_FAILED', message: 'Candidate gate runner processing failed.' } });
    }
    let postTreeMatchesCandidate = false;
    try {
        dependencies.fault?.('postconditions');
        let postTimer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([(async () => {
                    await preconditions.lfsClosure();
                    postTreeMatchesCandidate = await preconditions.trackedTree('post');
                })(), new Promise<never>((_, reject) => { postTimer = schedule(() => { abort.abort(); reject(expired); }, probeRegionTimeoutMs); })]);
        }
        finally {
            cancel(postTimer);
        }
        dependencies.fault?.('normalization');
        return await normalizeCandidateGateReport(outcome, { ...input, secrets, preTreeMatchesCandidate: true, postTreeMatchesCandidate });
    }
    catch (cause) {
        if (cause instanceof PrimaryPersistenceError)
            throw cause;
        commandTermination.get(outcome)?.();
        if (probes.size) {
            let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
            try {
                await Promise.race([Promise.allSettled([...probes].map(child => stopProbe(child, dependencies))),
                    new Promise<void>(accept => { cleanupTimer = schedule(accept, drainMs); })]);
            }
            finally {
                cancel(cleanupTimer);
            }
        }
        return normalizeCandidateGateReport(outcome, { ...input, secrets, preTreeMatchesCandidate: true, postTreeMatchesCandidate: false,
            initialCause: 'runner-processing-failure',
            domainFailure: { code: 'GATE_RUNNER_PROCESSING_FAILED', message: 'Candidate gate runner processing failed.' } });
    }
}
