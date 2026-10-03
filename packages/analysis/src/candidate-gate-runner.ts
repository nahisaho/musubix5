import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, rm } from 'node:fs/promises';
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
    stdoutTail?: string;
    stderrTail?: string;
    checks?: CandidateCheck[];
    error?: {
        code: 'CANDIDATE_GATE_REPORT_INVALID';
        case: string;
    };
}
const streamLimit = 100000000;
const carryLimit = 8192;
const tailLimit = 20000;
const drainMs = 5000;
const commandsRequired = ['typecheck', 'build', 'test', 'codegraph-tests', 'compatibility', 'pack-check', 'pack-smoke'];
const causeOrder = ['runner-import-failure', 'runner-startup-failure', 'precondition-domain-failure', 'timeout',
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
}
/** @id CODE-M5-CI-CANDIDATE-CAPTURE-001
 * @implements REQ-M5-CI-008
 * @design DES-M5-CI-008
 */
export async function runCandidateGateCommand(input: CommandInput): Promise<CandidateGateCommandOutcome> {
    if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0 || input.timeoutMs > 300000) {
        throw new Error('CANDIDATE_GATE_REPORT_INVALID: invalid subprocess timeout.');
    }
    await mkdir(input.temporaryDirectory, { recursive: true });
    for (let path = resolve(input.temporaryDirectory); path !== dirname(path); path = dirname(path)) {
        const stat = await lstat(path);
        if (!stat.isDirectory() || stat.isSymbolicLink())
            throw new Error('CANDIDATE_GATE_REPORT_INVALID: unsafe spool directory.');
    }
    const directory = await mkdtemp(join(input.temporaryDirectory, 'musubix5-gate-'));
    const stdoutPath = join(directory, 'stdout'), stderrPath = join(directory, 'stderr');
    const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);
    const stdoutFile = await open(stdoutPath, flags, 0o600);
    let stderrFile: typeof stdoutFile;
    try {
        stderrFile = await open(stderrPath, flags, 0o600);
    }
    catch (cause) {
        await stdoutFile.close();
        await rm(directory, { recursive: true, force: true });
        throw cause;
    }
    const secrets = configuredSecrets(input.secrets, input.env ?? process.env);
    const stdoutTail = new TailRedactor(secrets), stderrTail = new TailRedactor(secrets);
    const stdoutHash = createHash('sha256'), stderrHash = createHash('sha256');
    let timedOut = false, streamCapTerminated = false, drainTruncated = false;
    let exitCode: number | null = null, signal: string | null = null;
    let child: ReturnType<typeof spawn> & {
        stdout: NonNullable<ReturnType<typeof spawn>['stdout']>;
        stderr: NonNullable<ReturnType<typeof spawn>['stderr']>;
    };
    try {
        child = spawn(input.command, input.args, { cwd: input.cwd, env: input.env ?? process.env,
            shell: false, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    }
    catch (cause) {
        await stdoutFile.close();
        await stderrFile.close();
        await rm(directory, { recursive: true, force: true });
        throw cause;
    }
    child.once('spawn', () => input.onCommandStart?.());
    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    const beginDrain = () => {
        if (drainTimer)
            return;
        drainTimer = setTimeout(() => {
            drainTruncated = true;
            child.stdout.destroy();
            child.stderr.destroy();
        }, drainMs);
    };
    const terminate = () => {
        if (!child.pid)
            return;
        if (process.platform === 'win32') {
            const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: false, stdio: 'ignore', timeout: drainMs });
            killer.on('error', () => child.kill('SIGKILL'));
            killer.on('exit', code => {
                if (code !== 0)
                    child.kill('SIGKILL');
            });
        }
        else {
            try {
                process.kill(-child.pid, 'SIGKILL');
            }
            catch {
                child.kill('SIGKILL');
            }
        }
    };
    const timer = setTimeout(() => { timedOut = true; terminate(); }, input.timeoutMs);
    let spawnError: Error | undefined;
    const exited = new Promise<void>(accept => {
        child.once('error', cause => { spawnError = cause; clearTimeout(timer); beginDrain(); accept(); });
        child.once('exit', (code, childSignal) => {
            exitCode = code;
            signal = childSignal;
            clearTimeout(timer);
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
                }
            }
        }
        catch (cause) {
            if (!drainTruncated)
                throw cause;
        }
        redactor.append(decoder.end(), true);
    };
    try {
        await Promise.all([exited, pump(child.stdout, stdoutFile, stdoutHash, stdoutTail), pump(child.stderr, stderrFile, stderrHash, stderrTail)]);
        if (spawnError)
            throw spawnError;
        const unsafe = stdoutTail.unsafe || stderrTail.unsafe;
        return { stdoutPath, stderrPath, stdoutTail: unsafe ? '' : stdoutTail.tail, stderrTail: unsafe ? '' : stderrTail.tail,
            stdoutSha256: stdoutHash.digest('hex'), stderrSha256: stderrHash.digest('hex'), exitCode, signal, timedOut,
            streamCapTerminated, drainTruncated, tailsDropped: unsafe || stdoutTail.dropped || stderrTail.dropped, resultTextDropped: unsafe };
    }
    catch (cause) {
        terminate();
        child.stdout.destroy();
        child.stderr.destroy();
        await rm(directory, { recursive: true, force: true });
        throw cause;
    }
    finally {
        clearTimeout(timer);
        clearTimeout(drainTimer);
        await stdoutFile.close();
        await stderrFile.close();
    }
}
function candidateCheck(value: unknown): value is CandidateCheck {
    return object(value) && typeof value.name === 'string' && /^[a-z][a-z0-9:.-]{0,127}$/.test(value.name)
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
        const sanitizedChecks = checks.map(check => ({
            name: check.name, required: check.required, status: check.status, summary: safeText(check.summary),
            ...(check.diagnostics ? { diagnostics: check.diagnostics.map(diagnostic => ({
                    code: diagnostic.code, severity: diagnostic.severity, message: safeText(diagnostic.message),
                    ...(diagnostic.path !== undefined ? { path: safeText(diagnostic.path) } : {}),
                })) } : {}),
        }));
        const commands = checks.filter(check => check.name.startsWith('command:')).map(check => ({
            name: check.name.slice(8), exitCode: check.exitCode ?? -1,
            digest: sha256(canonicalBytes({ name: check.name.slice(8), exitCode: check.exitCode ?? -1,
                stdout: check.stdout ?? '', stderr: check.stderr ?? '' })),
            status: check.status === 'pass' && check.exitCode === 0 ? 'pass' as const : 'fail' as const,
        }));
        const stdoutTail = safeText(outcome.stdoutTail), stderrTail = safeText(outcome.stderrTail);
        const originalDomainCode = domainCode === null ? null : safeText(domainCode);
        const originalDomainMessage = domainMessage === null ? null : safeText(domainMessage);
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
            originalDomainCode: omitText ? null : originalDomainCode, originalDomainMessage: omitText ? null : originalDomainMessage,
            ...(!omitText ? { stdoutTail, stderrTail, checks: sanitizedChecks } : {}),
            ...(matchedCauses.length || omitText || outcome.drainTruncated ? {
                error: { code: 'CANDIDATE_GATE_REPORT_INVALID' as const, case: matchedCauses[0] ?? (omitText ? 'redaction-unavailable' : 'drain-truncated') },
            } : {}),
        };
        const resultFile = await open(options.resultPath, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0), 0o600);
        try {
            await resultFile.writeFile(canonicalBytes(result));
            await resultFile.sync();
        }
        finally {
            await resultFile.close();
        }
        return result;
    }
    finally {
        for (const path of [outcome.stdoutPath, outcome.stderrPath])
            if (path)
                await rm(path, { force: true });
        if (outcome.stdoutPath && dirname(outcome.stdoutPath) === dirname(outcome.stderrPath)
            && dirname(outcome.stdoutPath).split(/[\\/]/).at(-1)?.startsWith('musubix5-gate-')) {
            await rm(dirname(outcome.stdoutPath), { recursive: true, force: true });
        }
    }
}
interface Preconditions {
    candidateCommit(): Promise<void>;
    repositoryIdentity(): Promise<void>;
    lfsClosure(): Promise<void>;
    trackedTree(phase: 'pre' | 'post'): Promise<boolean>;
}
function domainFailure(code: string, message: string): Error & {
    code: string;
} {
    return Object.assign(new Error(message), { code });
}
async function defaultPreconditions(input: CommandInput & NormalizeOptions): Promise<Preconditions> {
    const { verifyCandidateLfsClosure, compareTrackedTree } = await import('./workspace-manager.js');
    const git = (args: string[]) => spawnSync('git', args, { cwd: input.cwd, encoding: 'utf8', shell: false, timeout: input.timeoutMs });
    return {
        candidateCommit: async () => {
            const head = git(['rev-parse', 'HEAD']);
            if (head.status !== 0 || head.stdout.trim().toLowerCase() !== input.context.candidateCommit.toLowerCase()) {
                throw domainFailure('RELEASE_GATE_CANDIDATE_MISMATCH', 'Checked out commit does not match candidateCommit.');
            }
        },
        repositoryIdentity: async () => {
            const root = git(['rev-parse', '--show-toplevel']), remote = git(['config', '--get-all', 'remote.origin.url']);
            if (root.status !== 0 || remote.status !== 0 || !root.stdout.trim()
                || canonicalRepositoryIdentity(remote.stdout.split(/\r?\n/, 1)[0]!, root.stdout.trim()) !== input.context.repositoryId) {
                throw domainFailure('RELEASE_GATE_CANDIDATE_MISMATCH', 'Repository identity mismatch; use the credential-free GitHub HTTPS origin.');
            }
        },
        lfsClosure: async () => {
            try {
                await verifyCandidateLfsClosure(input.cwd, input.context.candidateCommit, 'local');
            }
            catch (cause) {
                if (object(cause) && typeof cause.code === 'string')
                    throw cause;
                throw domainFailure('TDD_SOURCE_LFS_INVALID', cause instanceof Error ? cause.message : 'Candidate LFS closure invalid.');
            }
        },
        trackedTree: async (phase) => {
            const hydration = spawnSync(process.execPath, ['scripts/verify-lfs-checkout.mjs', '.', '--verify-only'], { cwd: input.cwd, encoding: 'utf8', shell: false, timeout: input.timeoutMs });
            return hydration.status === 0 && await compareTrackedTree(input.cwd, input.context.candidateCommit, phase);
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
    const preconditions = input.preconditions ?? await defaultPreconditions(input);
    try {
        await preconditions.candidateCommit();
        await preconditions.repositoryIdentity();
        await preconditions.lfsClosure();
        if (!await preconditions.trackedTree('pre'))
            throw domainFailure('TDD_SOURCE_LFS_INVALID', 'worktree-integrity');
    }
    catch (cause) {
        if (!object(cause) || typeof cause.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(cause.code)
            || typeof cause.message !== 'string')
            throw cause;
        const empty = sha256(Buffer.alloc(0));
        return normalizeCandidateGateReport({
            stdoutPath: '', stderrPath: '', stdoutTail: '', stderrTail: '', stdoutSha256: empty, stderrSha256: empty,
            tailsDropped: false, resultTextDropped: false, drainTruncated: false, streamCapTerminated: false,
            exitCode: null, signal: null, timedOut: false,
        }, { ...input, secrets, preTreeMatchesCandidate: false, postTreeMatchesCandidate: false,
            initialCause: 'precondition-domain-failure', domainFailure: { code: cause.code, message: cause.message } });
    }
    const outcome = await runCandidateGateCommand({ ...input, secrets });
    let postTreeMatchesCandidate = false;
    try {
        await preconditions.lfsClosure();
        postTreeMatchesCandidate = await preconditions.trackedTree('post');
    }
    catch {
        postTreeMatchesCandidate = false;
    }
    return normalizeCandidateGateReport(outcome, { ...input, secrets, preTreeMatchesCandidate: true, postTreeMatchesCandidate });
}
