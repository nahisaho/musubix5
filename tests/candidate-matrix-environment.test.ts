import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { defaultConfig } from '../packages/analysis/src/config.js';
import { runGate } from '../packages/analysis/src/gate.js';
/** @id TEST-M5-CI-MATRIX-ENVIRONMENT-001
 * @verifies REQ-M5-CI-004
 */
it('TEST-M5-CI-MATRIX-ENVIRONMENT-001 binds matrix materialization to the supplied environment rather than ambient values', async () => {
    const root = mkdtempSync(join(tmpdir(), 'matrix-env-'));
    const repositoryId = `repository:${'a'.repeat(64)}`;
    const candidateCommit = 'b'.repeat(40);
    const environment = {
        ...process.env, REPOSITORY_ID: repositoryId, CANDIDATE_COMMIT: candidateCommit,
        MATRIX_OS: 'ubuntu', MATRIX_NODE: '24',
    };
    try {
        execFileSync('git', ['init', '--quiet', root]);
        execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
            'commit', '--quiet', '--allow-empty', '-m', 'matrix fixture']);
        mkdirSync(join(root, '.musubix'), { recursive: true });
        writeFileSync(join(root, '.musubix/constitution.md'), readFileSync(new URL('../.musubix/constitution.md', import.meta.url)));
        mkdirSync(join(root, '.musubix/features/matrix'), { recursive: true });
        mkdirSync(join(root, '.musubix/decisions'), { recursive: true });
        writeFileSync(join(root, '.musubix/features/matrix/requirements.md'), '## REQ-MATRIX-FIXTURE-001: Matrix\nPriority: must\nType: functional\nPattern: ubiquitous\nStatement: The system shall isolate matrix reports.\nAcceptance: One current report root exists.\n');
        writeFileSync(join(root, '.musubix/features/matrix/design.md'), '## DES-MATRIX-FIXTURE-001: Matrix\nResponsibilities: Isolate reports.\nInterfaces: runGate().\nConstraints: Use supplied provenance.\nRequirements: REQ-MATRIX-FIXTURE-001\nADRs: ADR-0001\n');
        writeFileSync(join(root, '.musubix/decisions/ADR-0001.md'), '# ADR-0001\nMatrix fixture.\n');
        writeFileSync(join(root, '.musubix/config.json'), JSON.stringify({
            ...defaultConfig, commands: [], requiredChecks: [],
            approval: { mode: 'compatible', domains: [] },
        }));
        for (const name of ['REPOSITORY_ID', 'CANDIDATE_COMMIT', 'MATRIX_OS', 'MATRIX_NODE']) {
            vi.stubEnv(name, 'foreign-invalid');
        }
        const report = await runGate(root, { persistenceMode: 'matrix', environment });
        expect(['pass', 'fail']).toContain(report.status);
        const directory = join(root, '.musubix/cache/matrix-native', candidateCommit, 'ubuntu', 'node24');
        expect(existsSync(directory)).toBe(true);
        expect(readdirSync(directory)).toHaveLength(1);
        expect(existsSync(join(root, '.musubix/cache/codegraph.json'))).toBe(true);
        await expect(runGate(root, {
            persistenceMode: 'matrix', environment: { ...environment, MATRIX_NODE: '22' },
        })).rejects.toThrow('PERFORMANCE_MATRIX_CONTEXT_MISMATCH');
    }
    finally {
        vi.unstubAllEnvs();
        rmSync(root, { recursive: true, force: true });
    }
});
import { execFileSync } from 'node:child_process';
