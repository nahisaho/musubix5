import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
describe('repository identity workflow wiring', () => {
    const root = resolve(import.meta.dirname, '..');
    /**
     * @id TEST-M5-WORKTREE-REPOSITORY-IDENTITY-004
     * @verifies REQ-M5-WORKTREE-001 REQ-M5-CI-008
     */
    it('TEST-M5-WORKTREE-REPOSITORY-IDENTITY-004 derives matrix identity from the checkout', async () => {
        const workflow = readFileSync(resolve(root, '.github/workflows/candidate-gate.yml'), 'utf8');
        expect(workflow).toContain("await import('./dist/packages/analysis/src/candidate-gate-runner.js')");
        const runner = await import('../packages/analysis/src/candidate-gate-runner.js');
        expect(runner.runCandidateGateWorkflow).toBeTypeOf('function');
        const implementation = readFileSync(resolve(root, 'packages/analysis/src/candidate-gate-runner.ts'), 'utf8');
        expect(implementation).toContain("['config', '--get-all', 'remote.origin.url']");
        expect(implementation).toContain("['rev-parse', '--show-toplevel']");
        expect(implementation).toContain('canonicalRepositoryIdentity(');
    });
    /**
     * @id TEST-M5-CANDIDATE-GATE-PRE-APPROVAL-001
     * @verifies REQ-M5-PARALLEL-010 REQ-M5-CI-008
     */
    it('TEST-M5-CANDIDATE-GATE-PRE-APPROVAL-001 accepts required commands before release approval', async () => {
        const workflow = readFileSync(resolve(root, '.github/workflows/candidate-gate.yml'), 'utf8');
        expect(workflow).toContain('runCandidateGateWorkflow');
        expect(workflow).not.toContain("const commandsPassed = report.status === 'pass'");
        const runner = await import('../packages/analysis/src/candidate-gate-runner.js');
        const { requiredCandidateGateCommands } = await import('../packages/analysis/src/candidate-gate.js');
        const directory = mkdtempSync(resolve(tmpdir(), 'pre-approval-'));
        const checks = requiredCandidateGateCommands.map(name => ({
            name: `command:${name}`, required: true, status: 'pass',
            summary: 'passed', exitCode: 0, stdout: '', stderr: '',
        }));
        const report = JSON.stringify({ status: 'fail', checks: [
                ...checks, { name: 'approval', required: true, status: 'fail', summary: 'release pending' },
            ] });
        try {
            const outcome = await runner.runCandidateGateCommand({
                command: process.execPath, args: ['-e', `process.stdout.write(${JSON.stringify(report)})`],
                cwd: directory, temporaryDirectory: directory, timeoutMs: 300000, secrets: [],
            });
            const result = await runner.normalizeCandidateGateReport(outcome, {
                resultPath: resolve(directory, 'candidate-gate-result.json'), secrets: [],
                context: {
                    repositoryId: `repository:${'a'.repeat(64)}`, candidateCommit: 'b'.repeat(40),
                    changeId: 'CHANGE-0017', generation: 29, gateInputFingerprint: 'c'.repeat(64),
                    job: { os: 'ubuntu', nodeMajor: 24 },
                },
                preTreeMatchesCandidate: true, postTreeMatchesCandidate: true,
            });
            expect(result.commandsPassed).toBe(true);
            expect(result.status).toBe('pass');
        }
        finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
  /**
   * @id TEST-M5-RELEASE-003-REPOSITORY-IDENTITY-003
   * @verifies REQ-M5-RELEASE-003
   */
  it('TEST-M5-RELEASE-003-REPOSITORY-IDENTITY-003 seals the canonical digest in release context', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/release.yml'),
      'utf8',
    );
    expect(workflow).toContain(
      "await import('./build-a/dist/packages/analysis/src/canonical.js');",
    );
    expect(workflow).toContain(
      'repository: canonicalRepositoryIdentity(',
    );
    expect(workflow).toContain(
      'release evidence producers must use the credential-free GitHub HTTPS origin.',
    );
  });

  /**
   * @id TEST-M5-RELEASE-004-REPOSITORY-IDENTITY-003
   * @verifies REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-004-REPOSITORY-IDENTITY-003 verifies publication against a local digest', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/npm-publish.yml'),
      'utf8',
    );
    expect(workflow).toContain(
      "await import('./candidate/dist/packages/analysis/src/canonical.js');",
    );
    expect(workflow).toContain(
      'context.repository !== canonicalRepositoryIdentity(',
    );
    expect(workflow).toContain(
      'release evidence producers must use the credential-free GitHub HTTPS origin.',
    );
  });
});
