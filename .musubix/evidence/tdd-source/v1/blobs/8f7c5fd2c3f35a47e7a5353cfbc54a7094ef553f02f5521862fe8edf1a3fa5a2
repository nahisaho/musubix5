import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import { CandidateGateStartupError, runCandidateGateCommand, runCandidateGateWorkflow, type CandidateGateRunnerDependencies, } from '../packages/analysis/src/candidate-gate-runner.js';
/** @id TEST-M5-CI-MATRIX-ORCHESTRATION-BOUNDARIES-001
 * @verifies REQ-M5-CI-008
 * @design DES-M5-CI-008
 */
it('TEST-M5-CI-MATRIX-ORCHESTRATION-BOUNDARIES-001 verifies cleanup, stubborn children and fallback storage boundaries', async () => {
    const base = fileURLToPath(new URL('../.test-work/g30-boundaries/', import.meta.url));
    mkdirSync(base, { recursive: true });
    const root = mkdtempSync(join(base, 'runner-'));
    const context = {
        repositoryId: 'repository:' + 'a'.repeat(64), changeId: 'CHANGE-0017', generation: 30,
        candidateCommit: 'b'.repeat(40), gateInputFingerprint: 'c'.repeat(64), job: { os: 'ubuntu', nodeMajor: 24 },
    };
    const env = {
        RUNNER_TEMP: root, REPOSITORY_ID: context.repositoryId, CHANGE_ID: context.changeId,
        GENERATION: '30', CANDIDATE_COMMIT: context.candidateCommit, GATE_INPUT_FINGERPRINT: context.gateInputFingerprint,
        MATRIX_OS: 'ubuntu', MATRIX_NODE: '24',
    };
    const preconditions = {
        candidateCommit: async () => { }, repositoryIdentity: async () => { },
        lfsClosure: async () => { }, trackedTree: async () => true,
    };
    const input = {
        command: process.execPath, args: [], cwd: root, temporaryDirectory: root,
        resultPath: join(root, 'candidate-gate-result.json'), timeoutMs: 75107, context, env: {}, secrets: [],
    };
    const child = (pid?: number) => Object.assign(new EventEmitter(), {
        ...(pid === undefined ? {} : { pid }), stdout: new PassThrough(), stderr: new PassThrough(),
        kill: () => true,
    });
    const remainingSpools = () => readdirSync(root).filter(name => name.startsWith('musubix5-gate-'));
    const runner = await import('../packages/analysis/src/candidate-gate-runner.js');
    const wrapperPath = fileURLToPath(new URL('../.github/scripts/run-candidate-gate-wrapper.mjs', import.meta.url));
    const fallbackPath = fileURLToPath(new URL('../.github/scripts/write-candidate-gate-runner-failure.mjs', import.meta.url));
    const { runCandidateGateWrapper } = await import(wrapperPath);
    const { writeCandidateGateRunnerFailure } = await import(fallbackPath);
    const config = {
        commands: ['typecheck', 'build', 'test', 'codegraph-tests', 'compatibility', 'pack-check', 'pack-smoke']
            .map(name => ({ name, timeoutMs: 1 })),
        formal: { timeoutMs: 100 },
    };
    let fallbacks = 0;
    try {
        for (const stage of ['spool-directory', 'stdout-open', 'stderr-open', 'command-start', 'spawn-attempt'] as const) {
            const result = await runCandidateGateWorkflow({ ...input, preconditions, dependencies: {
                    fault: at => {
                        if (at === stage)
                            throw Error('startup');
                    },
                    spawn: () => { throw Error('must not reach real spawn'); },
                } });
            expect(result.originalDomainCode).toBe('GATE_RUNNER_UNAVAILABLE');
            expect(remainingSpools()).toEqual([]);
        }
        const unsafeStartup = await runCandidateGateWorkflow({
            ...input, secrets: ['x'.repeat(8193)], preconditions,
            onCommandStart: () => { throw new CandidateGateStartupError(); },
        });
        const fallbackStartup = writeCandidateGateRunnerFailure('runner-startup-failure', env);
        expect(unsafeStartup).toEqual(fallbackStartup);
        vi.useFakeTimers();
        let terminated = 0;
        const stubborn = child(12345);
        const dependencies: CandidateGateRunnerDependencies = {
            spawn: () => { queueMicrotask(() => stubborn.emit('spawn')); return stubborn; },
            terminateProcessTree: () => { terminated++; },
        };
        const pending = runCandidateGateCommand({ ...input, dependencies });
        await vi.advanceTimersByTimeAsync(80107);
        const outcome = await pending;
        expect(terminated).toBe(1);
        expect(outcome.timedOut).toBe(true);
        expect(outcome.drainTruncated).toBe(true);
        expect(outcome.spawned).toBe(true);
        await runner.normalizeCandidateGateReport(outcome, { resultPath: input.resultPath, context, secrets: [] });
        expect(remainingSpools()).toEqual([]);
        const neverSpawned = child();
        const startupPending = runCandidateGateCommand({ ...input, dependencies: {
                spawn: () => { queueMicrotask(() => neverSpawned.emit('error', Error('pre-spawn'))); return neverSpawned; },
                terminateProcessTree: () => { throw Error('no PID must not terminate'); },
            } }).catch(error => error);
        await vi.advanceTimersByTimeAsync(5000);
        expect(await startupPending).toBeInstanceOf(CandidateGateStartupError);
        expect(remainingSpools()).toEqual([]);
        const probe = child(23456);
        const prePending = runCandidateGateWorkflow({ ...input, dependencies: {
                spawn: () => probe,
                terminateProcessTree: candidate => {
                    expect(candidate).toBe(probe);
                    terminated++;
                    probe.emit('close', 1);
                },
            } });
        await vi.advanceTimersByTimeAsync(305000);
        const preResult = await prePending;
        expect(preResult.originalDomainCode).toBe('CANDIDATE_GATE_PRECONDITION_TIMEOUT');
        expect(preResult.timedOut).toBe(false);
        expect(terminated).toBe(2);
        expect(remainingSpools()).toEqual([]);
        vi.useRealTimers();
        for (const thrown of [null, undefined, Symbol('x'), new Proxy({}, { get() { throw Error('hostile'); } }),
            new CandidateGateStartupError()]) {
            const before = fallbacks;
            const result = await runCandidateGateWrapper({ cwd: root, env, config, dependencies: {
                    importRunner: async () => runner,
                    fallbackObserver: () => { fallbacks++; },
                    runner: { preconditions: { ...preconditions, candidateCommit: async () => { throw thrown; } },
                        spawn: () => { throw Error('must not spawn'); } },
                } });
            expect(result.originalDomainCode).toBe('CANDIDATE_GATE_PRECONDITION_FAILED');
            expect(fallbacks).toBe(before);
        }
        for (const fakeRunner of [
            { ...runner, candidateGateOrchestrationTimeout: () => 2475001 },
            { ...runner, runCandidateGateWorkflow: null },
        ]) {
            const result = await runCandidateGateWrapper({ cwd: root, env, config, dependencies: {
                    importRunner: async () => fakeRunner, fallbackObserver: () => { fallbacks++; },
                } });
            expect(result.originalDomainCode).toBe('GATE_RUNNER_UNAVAILABLE');
            expect(result.matchedCauses).toEqual(['runner-startup-failure']);
        }
        const alien = Object.assign(new CandidateGateStartupError(), { code: 'OTHER_CODE' });
        const alienResult = await runCandidateGateWrapper({ cwd: root, env, config, dependencies: {
                importRunner: async () => runner, validateInput: () => { throw alien; },
            } });
        expect(alienResult.originalDomainCode).toBe('GATE_RUNNER_PROCESSING_FAILED');
        const post = child(34567);
        let persisted = 0;
        const before = fallbacks;
        const persistedFailure = await runCandidateGateWrapper({ cwd: root, env, config, dependencies: {
                importRunner: async () => runner, fallbackObserver: () => { fallbacks++; },
                runner: {
                    preconditions, spawn: () => {
                        queueMicrotask(() => {
                            post.emit('spawn');
                            post.emit('exit', 0, null);
                            post.stdout.end('{}');
                            post.stderr.end();
                        });
                        return post;
                    },
                    persistResult: async () => { persisted++; expect(remainingSpools()).toHaveLength(1); throw Error('storage'); },
                },
            } });
        expect(persisted).toBe(1);
        expect(fallbacks).toBe(before + 1);
        expect(persistedFailure.originalDomainCode).toBe('GATE_RUNNER_PROCESSING_FAILED');
        expect(remainingSpools()).toEqual([]);
        for (const cause of ['runner-import-failure', 'runner-startup-failure', 'runner-processing-failure']) {
            const before = fallbacks;
            await expect(runCandidateGateWrapper({ cwd: root, env, config, dependencies: {
                    importRunner: async () => {
                        if (cause === 'runner-import-failure')
                            throw Error('import');
                        return runner;
                    },
                    validateInput: () => { throw cause === 'runner-startup-failure' ? new CandidateGateStartupError() : Error('processing'); },
                    fallbackObserver: () => { fallbacks++; },
                    writeFailure: () => { throw Error('fallback storage unavailable'); },
                } })).rejects.toThrow('fallback storage unavailable');
            expect(fallbacks).toBe(before + 1);
        }
        expect(JSON.parse(readFileSync(join(root, 'candidate-gate-envelope.json'), 'utf8')).result.status).toBe('fail');
    }
    finally {
        vi.useRealTimers();
        rmSync(root, { recursive: true, force: true });
        process.exitCode = 0;
    }
}, 30000);
/** @id TEST-M5-CI-MATRIX-PRECONDITION-THROWN-VALUE-001
 * @verifies REQ-M5-CI-008
 * @design DES-M5-CI-008
 */
it('TEST-M5-CI-MATRIX-PRECONDITION-THROWN-VALUE-001 preserves eligible fields on non-Error callable and array values', async () => {
    const base = fileURLToPath(new URL('../.test-work/g30-values/', import.meta.url));
    mkdirSync(base, { recursive: true });
    const root = mkdtempSync(join(base, 'runner-'));
    const context = {
        repositoryId: 'repository:' + 'a'.repeat(64), changeId: 'CHANGE-0017', generation: 30,
        candidateCommit: 'b'.repeat(40), gateInputFingerprint: 'c'.repeat(64), job: { os: 'ubuntu', nodeMajor: 24 },
    };
    const fields = { code: 'DOMAIN_ERROR', message: 'primary private-secret' };
    try {
        for (const thrown of [Object.assign(() => { }, fields), Object.assign([], fields)]) {
            const result = await runCandidateGateWorkflow({
                command: process.execPath, args: [], cwd: root, temporaryDirectory: root,
                resultPath: join(root, 'candidate-gate-result.json'), timeoutMs: 75107,
                secrets: ['private-secret'], env: {}, context,
                preconditions: {
                    candidateCommit: async () => { throw thrown; }, repositoryIdentity: async () => { },
                    lfsClosure: async () => { }, trackedTree: async () => true,
                },
                dependencies: { spawn: () => { throw Error('must not spawn'); } },
            });
            expect(result.originalDomainCode).toBe('DOMAIN_ERROR');
            expect(result.originalDomainMessage).toBe('primary [REDACTED]');
            expect(result.matchedCauses).toEqual(['precondition-domain-failure']);
        }
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
});
