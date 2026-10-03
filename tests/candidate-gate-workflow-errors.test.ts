import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import type { CandidateGateCommandOutcome, CandidateGateRunnerResult } from '../packages/analysis/src/candidate-gate-runner.js';
/** @id TEST-M5-CI-MATRIX-ERROR-001
 * @verifies REQ-M5-CI-008
 * @design DES-M5-CI-008
 */
it('TEST-M5-CI-MATRIX-ERROR-001 proves the complete closed runner failure and redaction contract', async () => {
    const { runCandidateGateCommand: run, normalizeCandidateGateReport: normalize, runCandidateGateWorkflow: workflow } = await import('../packages/analysis/src/candidate-gate-runner.js');
    const base = fileURLToPath(new URL('../.test-work/g29/', import.meta.url));
    mkdirSync(base, { recursive: true });
    const root = mkdtempSync(join(base, 'runner-test-'));
    const resultPath = join(root, 'candidate-gate-result.json');
    const context = {
        repositoryId: 'repository:' + 'a'.repeat(64), changeId: 'CHANGE-0017', generation: 29,
        candidateCommit: 'b'.repeat(40), gateInputFingerprint: 'c'.repeat(64), job: { os: 'ubuntu', nodeMajor: 24 },
    };
    const names = ['typecheck', 'build', 'test', 'codegraph-tests', 'compatibility', 'pack-check', 'pack-smoke'];
    const checks = names.map(name => ({ name: 'command:' + name, required: true, status: 'pass', summary: 'ok', exitCode: 0 }));
    const report = (extra: unknown[] = []) => JSON.stringify({ checks: [...checks, ...extra] });
    const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
    const options = (secrets: string[] = []) => ({ resultPath, context, secrets, preTreeMatchesCandidate: true, postTreeMatchesCandidate: true });
    const command = (script: string, timeoutMs = 300000) => ({
        command: process.execPath, args: ['-e', script], cwd: root, temporaryDirectory: root, timeoutMs, secrets: [],
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    });
    const fixed = (result: CandidateGateRunnerResult, causes: string[]) => {
        expect(result.status).toBe('fail');
        expect(result.matchedCauses).toEqual(causes);
        expect(result.error?.code).toBe('CANDIDATE_GATE_REPORT_INVALID');
        expect(result.error?.case).toBe(causes[0]);
        for (const key of ['schemaVersion', 'commands', 'commandsPassed', 'preTreeMatchesCandidate', 'postTreeMatchesCandidate',
            'stdoutSha256', 'stderrSha256', 'exitCode', 'signal', 'timedOut', 'drainTruncated', 'tailsDropped',
            'resultTextDropped', 'originalDomainCode', 'originalDomainMessage'])
            expect(result).toHaveProperty(key);
        expect(result.stdoutSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(result.stderrSha256).toMatch(/^[a-f0-9]{64}$/);
    };
    const execute = async (stdout: string, stderr = '', exit = 0, secrets: string[] = []) => {
        const outcome = await run({ ...command(`process.stdout.write(${JSON.stringify(stdout)});process.stderr.write(${JSON.stringify(stderr)});process.exitCode=${exit}`), secrets });
        expect(outcome.stdoutSha256).toBe(sha(stdout));
        expect(outcome.stderrSha256).toBe(sha(stderr));
        const result = await normalize(outcome, options(secrets));
        expect(existsSync(outcome.stdoutPath)).toBe(false);
        expect(existsSync(outcome.stderrPath)).toBe(false);
        expect(JSON.parse(readFileSync(resultPath, 'utf8'))).toEqual(result);
        return result;
    };
    const synthetic = async (stdout: string, overrides: Partial<CandidateGateCommandOutcome>) => {
        const stdoutPath = join(root, 'synthetic-stdout'), stderrPath = join(root, 'synthetic-stderr');
        writeFileSync(stdoutPath, stdout);
        writeFileSync(stderrPath, '');
        return normalize({
            stdoutPath, stderrPath, stdoutTail: stdout, stderrTail: '', stdoutSha256: sha(stdout), stderrSha256: sha(''),
            exitCode: 0, signal: null, timedOut: false, drainTruncated: false, streamCapTerminated: false,
            tailsDropped: false, resultTextDropped: false, ...overrides,
        }, options());
    };
    try {
        expect((await execute(report())).status).toBe('pass');
        expect((await execute(report([{ name: 'approval', required: true, status: 'fail', summary: 'pending' }]))).status).toBe('pass');
        const requiredFailure = await execute(report([{ name: 'trace', required: true, status: 'fail', summary: 'primary',
                diagnostics: [{ code: 'TRACE_FAILED', severity: 'error', message: 'primary diagnostic' }] }]));
        expect(requiredFailure.status).toBe('fail');
        expect(requiredFailure.matchedCauses).toEqual([]);
        expect(readFileSync(resultPath, 'utf8')).toContain('primary diagnostic');
        const abnormal: Array<[
            string,
            string
        ]> = [
            ['', 'empty-stdout'], ['{', 'malformed-json'], ['null', 'invalid-root'], ['[]', 'invalid-root'], ['42', 'invalid-root'],
            ['{}', 'missing-checks'], ['{"checks":{}}', 'non-array-checks'],
            ['{"checks":[null]}', 'invalid-check'], ['{"checks":[{"name":"bad","required":"true","status":"pass","summary":"bad"}]}', 'invalid-check'],
            ['{"checks":[{"name":"bad","required":true,"status":{},"summary":"bad"}]}', 'invalid-check'],
            ['{"checks":[{"name":"bad","required":true,"status":"pass","summary":"bad","diagnostics":[{"code":"X","severity":7,"message":"x"}]}]}', 'invalid-check'],
            ['{"error":{"code":"DOMAIN_FAILED","message":"primary domain"}}', 'cli-error'],
        ];
        for (const [stdout, cause] of abnormal) {
            const result = await execute(stdout, 'runner diagnostic', 1);
            fixed(result, [cause, 'non-zero-exit']);
            expect(result.stderrTail).toBe('runner diagnostic');
            expect(result.originalDomainCode).toBe(cause === 'cli-error' ? 'DOMAIN_FAILED' : null);
            expect(result.originalDomainMessage).toBe(cause === 'cli-error' ? 'primary domain' : null);
        }
        const nonzero = await execute(report(), '', 7);
        fixed(nonzero, ['non-zero-exit']);
        expect(nonzero.exitCode).toBe(7);
        expect(nonzero.checks).toHaveLength(7);
        const ackMessages = ['incomplete command', 'missing final acknowledgment', 'truncated acknowledgment', 'incomplete native inventory', 'acknowledgment mismatch'];
        for (const message of [...ackMessages, ackMessages.map(message => `acknowledgment-binding: ${message}`).join('; ')]) {
            const value = message.startsWith('acknowledgment-binding:') ? message : `acknowledgment-binding: ${message}`;
            const result = await execute(JSON.stringify({ error: { code: 'TEST_RUNTIME_BOOTSTRAP_INVALID', message: value } }), '', 1, [value]);
            fixed(result, ['cli-error', 'non-zero-exit', 'incomplete-runtime-acknowledgment']);
            expect(result.originalDomainMessage).toBe('[REDACTED]');
        }
        fixed(await execute('{"error":{"code":"TEST_RUNTIME_BOOTSTRAP_INVALID","message":"different problem"}}'), ['cli-error']);
        fixed(await execute('{"error":{"code":"OTHER","message":"acknowledgment-binding: incomplete command"}}'), ['cli-error']);
        fixed(await synthetic('{', { timedOut: true, streamCapTerminated: true, signal: 'SIGKILL', exitCode: null }), ['timeout', 'stream-cap-termination', 'signal', 'malformed-json']);
        fixed(await synthetic('', { timedOut: true, signal: 'SIGKILL', exitCode: null }), ['timeout', 'signal', 'empty-stdout']);
        const timed = await run(command('setInterval(()=>{},10000)', 40));
        const timedResult = await normalize(timed, options());
        expect(timedResult.matchedCauses[0]).toBe('timeout');
        expect(timedResult.timedOut).toBe(true);
        expect(timedResult.drainTruncated).toBe(false);
        const signaled = await normalize(await run(command('process.kill(process.pid,"SIGTERM")')), options());
        fixed(signaled, ['signal', 'empty-stdout']);
        expect(signaled.signal).toBe('SIGTERM');
        for (const timeout of [0, -1, 300001, 1.2])
            await expect(run(command('', timeout))).rejects.toThrow();
        const rawSecret = 'configured-"secret"\nvalue';
        const escaped = JSON.stringify(rawSecret).slice(1, -1);
        const ansi = (text: string) => Array.from(text).join('\x1b[31m');
        const tokens = ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_', 'github_pat_'].map(prefix => prefix + 'A'.repeat(20));
        const sensitive = [rawSecret, escaped, ansi(rawSecret), ansi(escaped), ...tokens,
            'Authorization: private-header', '"aUtHoRiZaTiOn" \t: \t"quoted-value"}'];
        const secretReport = report([{ name: 'large', required: false, status: 'pass', summary: '🙂'.repeat(22000) + rawSecret,
                diagnostics: [{ code: 'DETAIL', severity: 'info', message: escaped, path: rawSecret }] }]);
        const redacted = await execute(secretReport, sensitive.join('\n'), 0, [rawSecret]);
        expect(redacted.status).toBe('pass');
        const text = readFileSync(resultPath, 'utf8');
        for (const value of [rawSecret, escaped, ...tokens, 'private-header', 'quoted-value'])
            expect(text).not.toContain(value);
        expect(Array.from(redacted.stdoutTail!)).toHaveLength(20000);
        expect(redacted.tailsDropped).toBe(true);
        expect(redacted.stderrTail).toContain('"aUtHoRiZaTiOn" \t: \t[REDACTED]');
        const longest = await execute(report(), 'alphabet alpha a', 0, ['a', 'alpha', 'alphabet']);
        expect(longest.stderrTail).toBe('[REDACTED] [REDACTED] [REDACTED]');
        const interacting = await execute(report(), 'Authorization: unconfigured-value\nghp_' + 'b'.repeat(20), 0, ['a', 'p']);
        expect(interacting.stderrTail).not.toContain('unconfigured-value');
        expect(interacting.stderrTail).not.toContain('b'.repeat(20));
        const overlappingToken = 'ghp_' + 'b'.repeat(300) + '-private-suffix';
        expect((await execute(report(), overlappingToken, 0, [overlappingToken])).stderrTail).toBe('[REDACTED]');
        expect((await execute(report(), 'visible', 0, ['\x1b[31m'])).stderrTail).toBe('visible');
        for (const token of tokens) {
            const parts = [token.slice(0, 3), token.slice(3, 11), token.slice(11)];
            const crossed = await run(command(`const p=${JSON.stringify(parts)};let i=0;const t=setInterval(()=>{if(i<p.length)process.stderr.write(p[i++]);else{clearInterval(t);process.stdout.write(${JSON.stringify(report())})}},5)`));
            expect((await normalize(crossed, options())).stderrTail).toBe('[REDACTED]');
        }
        const quotedHeader = '"Authorization"' + ' '.repeat(200) + ': "cross-chunk-value"}';
        const headerParts = [quotedHeader.slice(0, 9), quotedHeader.slice(9, 100), quotedHeader.slice(100, 219), quotedHeader.slice(219)];
        const header = await run(command(`const p=${JSON.stringify(headerParts)};let i=0;const t=setInterval(()=>{if(i<p.length)process.stderr.write(p[i++]);else{clearInterval(t);process.stdout.write(${JSON.stringify(report())})}},5)`));
        expect((await normalize(header, options())).stderrTail).not.toContain('cross-chunk-value');
        const boundarySecret = 'cross-boundary';
        for (const representation of [boundarySecret, JSON.stringify('cross-"boundary"').slice(1, -1), ansi(boundarySecret)]) {
            const secret = representation.includes('\\"') ? 'cross-"boundary"' : boundarySecret;
            const parts = ['x'.repeat(30000), representation.slice(0, 5), representation.slice(5), 'y'.repeat(19995)];
            const crossed = await run({ ...command(`const p=${JSON.stringify(parts)};let i=0;const t=setInterval(()=>{if(i<p.length)process.stderr.write(p[i++]);else{clearInterval(t);process.stdout.write(${JSON.stringify(report())})}},5)`), secrets: [secret] });
            const normalized = await normalize(crossed, options([secret]));
            expect(normalized.status).toBe('pass');
            expect(normalized.stderrTail).toBe('CTED]' + 'y'.repeat(19995));
        }
        const transforms = [encodeURIComponent(rawSecret), Buffer.from(rawSecret).toString('base64')];
        const outside = await execute(report(), transforms.join('\n'), 0, [rawSecret]);
        for (const value of transforms)
            expect(outside.stderrTail).toContain(value);
        const chunkParts = ['x'.repeat(20000) + ansi(escaped).slice(0, 13), ansi(escaped).slice(13), '\n' + 'y'.repeat(19990)];
        const chunked = await run({ ...command(`const p=${JSON.stringify(chunkParts)};let i=0;const t=setInterval(()=>{if(i<p.length)process.stderr.write(p[i++]);else{clearInterval(t);process.stdout.write(${JSON.stringify(report())})}},5)`), secrets: [rawSecret] });
        const chunkResult = await normalize(chunked, options([rawSecret]));
        expect(chunkResult.status).toBe('pass');
        expect(chunkResult.stderrTail).not.toContain('secret');
        expect(chunkResult.stderrTail).not.toContain('\\nvalue');
        const invalidBytes = Buffer.from([0xff, 0xf0, 0x9f, 0x99, 0x82, 0xfe]);
        const utf = await run(command(`process.stdout.write(${JSON.stringify(report())});process.stderr.write(Buffer.from([255,240,159,153,130,254]))`));
        expect(utf.stderrSha256).toBe(sha(invalidBytes));
        expect(utf.stderrTail).toBe('�🙂�');
        await normalize(utf, options());
        for (const [secret, stderr] of [['🙂'.repeat(8193), ''], ['', 'Authorization: ' + 'x'.repeat(8193)], ['', 'ghp_' + 'a'.repeat(8193)]]) {
            const omitted = await execute(report(), stderr, 0, secret ? [secret] : []);
            expect(omitted.status).toBe('fail');
            expect(omitted.tailsDropped).toBe(true);
            expect(omitted.resultTextDropped).toBe(true);
            for (const field of ['stdoutTail', 'stderrTail', 'checks'])
                expect(omitted).not.toHaveProperty(field);
            expect(omitted.originalDomainMessage).toBeNull();
        }
        for (const stream of ['stdout', 'stderr'] as const) {
            const cap = await run(command(`const fs=require("node:fs");const b=Buffer.alloc(1000000,120);for(let i=0;i<100;i++)fs.writeSync(${stream === 'stdout' ? 1 : 2},b);fs.writeSync(${stream === 'stdout' ? 1 : 2},Buffer.from("!"));setInterval(()=>{},10000)`));
            expect(statSync(cap[stream + 'Path' as 'stdoutPath']).size).toBe(100000000);
            expect(statSync(cap[stream === 'stdout' ? 'stderrPath' : 'stdoutPath']).size).toBe(0);
            expect(cap.streamCapTerminated).toBe(true);
            expect(cap[stream + 'Sha256' as 'stdoutSha256']).toBe(createHash('sha256').update(Buffer.alloc(100000000, 120)).update('!').digest('hex'));
            expect(cap[stream + 'Tail' as 'stdoutTail']).toContain('!');
            const capResult = await normalize(cap, options());
            expect(capResult.status).toBe('fail');
            expect(capResult.matchedCauses[0]).toBe('stream-cap-termination');
        }
        for (const abnormalExit of [false, true]) {
            const held = await run(command(`const{spawn}=require("node:child_process");const c=spawn(process.execPath,["-e","process.stdout.write('descendant');setTimeout(()=>{},6000)"],{stdio:["ignore",1,2]});c.unref();process.stdout.write(${JSON.stringify(report())});${abnormalExit ? 'process.kill(process.pid,"SIGTERM")' : ''}`));
            expect(held.drainTruncated).toBe(true);
            expect(held.stdoutSha256).toBe(sha(report() + 'descendant'));
            const result = await normalize(held, options());
            expect(result.status).toBe('fail');
            expect(result.drainTruncated).toBe(true);
            if (abnormalExit)
                expect(result.matchedCauses[0]).toBe('signal');
        }
        const validHeld = await run(command(`const{spawn}=require("node:child_process");const c=spawn(process.execPath,["-e","process.stderr.on('error',()=>{});process.stderr.write('observed');setTimeout(()=>{process.stderr.write('unobserved');},6000)"],{stdio:["ignore",1,2]});c.unref();process.stdout.write(${JSON.stringify(report())})`));
        expect(validHeld.drainTruncated).toBe(true);
        expect(validHeld.stdoutSha256).toBe(sha(report()));
        expect(validHeld.stderrSha256).toBe(sha('observed'));
        const heldResult = await normalize(validHeld, options());
        expect(heldResult.status).toBe('fail');
        expect(heldResult.stderrTail).toBe('observed');
        for (const [phase, code] of [['candidateCommit', 'RELEASE_GATE_CANDIDATE_MISMATCH'], ['repositoryIdentity', 'RELEASE_GATE_CANDIDATE_MISMATCH'],
            ['lfsClosure', 'TDD_SOURCE_LFS_INVALID'], ['trackedTree', 'TDD_SOURCE_LFS_INVALID']]) {
            let launched = false;
            const preconditions = {
                candidateCommit: async () => { }, repositoryIdentity: async () => { }, lfsClosure: async () => { },
                trackedTree: async () => true,
                [phase!]: async () => { throw Object.assign(new Error('primary private-value'), { code }); },
            };
            const result = await workflow({ ...command('throw new Error("must not start")'), ...options(['private-value']), preconditions,
                onCommandStart: () => { launched = true; } });
            fixed(result, ['precondition-domain-failure']);
            expect(launched).toBe(false);
            expect(result.originalDomainCode).toBe(code);
            expect(result.originalDomainMessage).toBe('primary [REDACTED]');
            expect(result.exitCode).toBeNull();
            expect(result.signal).toBeNull();
            expect(result.timedOut).toBe(false);
            expect(result.drainTruncated).toBe(false);
            expect(result.stdoutSha256).toBe(sha(''));
            expect(result.stderrSha256).toBe(sha(''));
        }
        const normalWorkflow = await workflow({ ...command(`process.stdout.write(${JSON.stringify(report())})`), ...options(),
            preconditions: { candidateCommit: async () => { }, repositoryIdentity: async () => { }, lfsClosure: async () => { }, trackedTree: async () => true } });
        expect(normalWorkflow.status).toBe('pass');
        const cliWorkflow = await workflow({ ...command(`process.stdout.write(${JSON.stringify(JSON.stringify({ error: { code: 'TDD_SOURCE_LFS_INVALID', message: 'cli-domain-message' }, checks: [...checks, { name: 'trace', required: true, status: 'fail', summary: 'retained diagnostic' }] }))});process.exitCode=2`), ...options(),
            preconditions: { candidateCommit: async () => { }, repositoryIdentity: async () => { }, lfsClosure: async () => { }, trackedTree: async () => true } });
        fixed(cliWorkflow, ['cli-error', 'non-zero-exit']);
        expect(cliWorkflow.originalDomainMessage).toBe('cli-domain-message');
        expect(cliWorkflow.checks?.at(-1)?.summary).toBe('retained diagnostic');
        const falseTree = await workflow({ ...command('throw Error("must not start")'), ...options(),
            preconditions: { candidateCommit: async () => { }, repositoryIdentity: async () => { }, lfsClosure: async () => { }, trackedTree: async () => false } });
        fixed(falseTree, ['precondition-domain-failure']);
        expect(falseTree.originalDomainMessage).toBe('worktree-integrity');
        const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
        const realCommitFailure = await workflow({ ...command('throw Error("must not start")'), ...options(), cwd: repositoryRoot });
        fixed(realCommitFailure, ['precondition-domain-failure']);
        expect(realCommitFailure.originalDomainCode).toBe('RELEASE_GATE_CANDIDATE_MISMATCH');
        const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
        const realRepositoryFailure = await workflow({ ...command('throw Error("must not start")'), ...options(), cwd: repositoryRoot, context: { ...context, candidateCommit: head } });
        fixed(realRepositoryFailure, ['precondition-domain-failure']);
        expect(realRepositoryFailure.originalDomainMessage).toContain('Repository identity mismatch');
        const envResult = await workflow({ ...command(`process.stdout.write(${JSON.stringify(report())});process.stderr.write("q secret password key oidc github gh")`),
            ...options(), env: { ...command('').env, ONE_TOKEN: 'q', TWO_SECRET: 'secret', THREE_PASSWORD: 'password', FOUR_KEY: 'key',
                ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc', GITHUB_TOKEN: 'github', GH_TOKEN: 'gh' },
            preconditions: { candidateCommit: async () => { }, repositoryIdentity: async () => { }, lfsClosure: async () => { }, trackedTree: async () => true } });
        expect(envResult.stderrTail).toBe(Array(7).fill('[REDACTED]').join(' '));
        const fallback = fileURLToPath(new URL('../.github/scripts/write-candidate-gate-runner-failure.mjs', import.meta.url));
        for (const cause of ['runner-import-failure', 'runner-startup-failure']) {
            expect(() => execFileSync(process.execPath, [fallback, cause], { env: { ...command('').env, RUNNER_TEMP: root, GH_TOKEN: tokens[0] }, stdio: 'pipe' })).toThrow();
            const failure = JSON.parse(readFileSync(resultPath, 'utf8'));
            fixed(failure, [cause]);
            expect(failure.originalDomainCode).toBe('GATE_RUNNER_UNAVAILABLE');
            expect(failure.exitCode).toBeNull();
            expect(failure.signal).toBeNull();
            expect(failure.drainTruncated).toBe(false);
            expect(failure.stdoutSha256).toBe(sha(''));
            expect(failure.stderrSha256).toBe(sha(''));
            const envelope = readFileSync(join(root, 'candidate-gate-envelope.json'), 'utf8');
            expect(envelope).not.toContain(tokens[0]);
            expect(JSON.parse(envelope).result.status).toBe('fail');
        }
        const workflowText = readFileSync(fileURLToPath(new URL('../.github/workflows/candidate-gate.yml', import.meta.url)), 'utf8');
        expect(workflowText).toContain('candidate-gate-runner.js');
        expect(workflowText).toContain('runCandidateGateWorkflow');
        expect(workflowText).toContain('runner-import-failure');
        expect(workflowText).toContain('runner-startup-failure');
        expect(workflowText).not.toContain('const failedChecks = report.checks');
        expect(workflowText).not.toContain('if ! node --input-type=module');
        const wrapper = workflowText.split('node --input-type=module <<\'NODE\'')[2]!.split('\n          NODE')[0]!
            .split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
        const absoluteFallback = fallback.replace(/\\/g, '/');
        for (const [moduleText, expected] of [[undefined, 'runner-import-failure'], ['not javascript !!!', 'runner-import-failure'],
            ['export const runCandidateGateWorkflow = null;', 'runner-startup-failure']] as const) {
            const modulePath = join(root, 'wrapper-runner.mjs');
            if (moduleText !== undefined)
                writeFileSync(modulePath, moduleText);
            else
                rmSync(modulePath, { force: true });
            const code = wrapper.replace('./.github/scripts/write-candidate-gate-runner-failure.mjs', absoluteFallback)
                .replace('./dist/packages/analysis/src/candidate-gate-runner.js', modulePath.replace(/\\/g, '/'));
            expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', code], {
                cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'pipe',
                env: { ...command('').env, RUNNER_TEMP: root, GH_TOKEN: tokens[0] },
            })).toThrow();
            fixed(JSON.parse(readFileSync(resultPath, 'utf8')), [expected]);
            expect(readFileSync(join(root, 'candidate-gate-envelope.json'), 'utf8')).not.toContain(tokens[0]);
        }
        const runnerSource = readFileSync(fileURLToPath(new URL('../packages/analysis/src/candidate-gate-runner.ts', import.meta.url)), 'utf8');
        const originalImports = runnerSource.split('\n').filter(line => line.includes("from './candidate-gate.js'"));
        expect(originalImports.length).toBeGreaterThan(0);
        expect(originalImports.every(line => line.startsWith('import type '))).toBe(true);
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
}, 60000);
