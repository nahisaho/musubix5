import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CHANGE-0003 quality regressions', () => {
  /** @id TEST-M5-PARALLEL-GRAPH-ACYCLIC-001
   * @verifies REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-013 REQ-M5-TDD-CURRENCY-001
   */
  it('TEST-M5-PARALLEL-GRAPH-ACYCLIC-001 keeps parallel TDD provenance dependencies acyclic', async () => {
    const { graphGate, indexGraph } = await import('../packages/analysis/src/graph.js');
    const { graph } = await indexGraph('.', { persist: false, refresh: false });
    const result = graphGate(graph, { forbidCycles: true, rules: [] });
    expect(result.cycles).not.toContainEqual([
      'packages/analysis/src/change-evidence.ts',
      'packages/analysis/src/tdd-cycle-resolver.ts',
      'packages/analysis/src/tdd.ts',
    ]);
    expect(result.valid).toBe(true);
  });

  /** @id TEST-M5-PARALLEL-RELEASE-NONPASS-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-PARALLEL-013
   */
  it('TEST-M5-PARALLEL-RELEASE-NONPASS-001 classifies incomplete release approval as a non-pass diagnostic', async () => {
    const approval = await import('../packages/analysis/src/approval.js');
    const classifyReleaseApprovalDiagnostic = (
      approval as unknown as Record<string, unknown>
    ).classifyReleaseApprovalDiagnostic;
    expect(classifyReleaseApprovalDiagnostic).toBeTypeOf('function');
    expect((classifyReleaseApprovalDiagnostic as (code: string) => boolean)(
      'CHANGE_GENERATION_INCOMPLETE',
    )).toBe(true);
  });

  it('validates performance evidence against matrix-isolated structured reports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'musubix5-matrix-performance-'));
    await mkdir(join(root, '.musubix/features/performance'), { recursive: true });
    await mkdir(join(root, '.musubix/evidence'), { recursive: true });
    await mkdir(join(root, '.musubix/cache/matrix-native/codegraph-tests'), { recursive: true });
    await writeFile(join(root, '.musubix/features/performance/requirements.md'), [
      '---',
      'schemaVersion: 1',
      'feature: performance',
      '---',
      '# Performance',
      '',
      '## REQ-M5-MATRIX-PERFORMANCE-001: Validate matrix reports',
      'Priority: must',
      'Type: non-functional',
      'Pattern: ubiquitous',
      'Statement: The system shall validate matrix-isolated operation reports.',
      'Acceptance: The matrix report is accepted.',
      'Performance: {"counter":"visits","max":1,"testId":"TEST-M5-MATRIX-PERFORMANCE-001","unit":"operations"}',
      '',
    ].join('\n'));
    const config = {
      schemaVersion: 1,
      language: 'auto',
      qualityProfile: 'custom',
      commands: [{
        name: 'codegraph-tests',
        command: process.execPath,
        args: ['runner.mjs', '--report', '{reportPath}'],
        testReport: { format: 'musubix-json', path: '.musubix/cache/test-results/codegraph.json' },
        required: true,
        timeoutMs: 10_000,
      }],
      requiredChecks: [],
      thresholds: { design: 0, implementation: 0, tests: 0 },
      architecture: { forbidCycles: true, rules: [] },
      codeGraph: { mode: 'compatible' },
      formal: { solver: 'none', minModeledFraction: 0, timeoutMs: 1_000 },
      mutation: { mode: 'compatible' },
      tdd: { redPreflightCommands: [] },
      approval: { mode: 'compatible', domains: [] },
      workflow: { mode: 'compatible', maxAgeSeconds: 3_600, maxFutureSkewSeconds: 60 },
      attestation: {
        mode: 'local',
        maxAgeSeconds: 3_600,
        maxFutureSkewSeconds: 60,
        trustedPublicKeys: [],
        githubOidc: { mode: 'off' },
      },
    };
    await mkdir(join(root, '.musubix'), { recursive: true });
    await writeFile(join(root, '.musubix/config.json'), `${JSON.stringify(config, null, 2)}\n`);
    const report = `${JSON.stringify({
      schemaVersion: 1,
      tests: [{
        id: 'TEST-M5-MATRIX-PERFORMANCE-001',
        status: 'passed',
        operations: { visits: 1 },
      }],
    }, null, 2)}\n`;
    await writeFile(
      join(root, '.musubix/cache/matrix-native/codegraph-tests/aggregate.json'),
      report,
    );
    const performance = await import('../packages/analysis/src/performance.js');
    const runId = randomUUID();
    const execution = performance.createPerformanceExecution({
      runId,
      executionId: createHash('sha256').update('execution').digest('hex'),
      commandName: 'codegraph-tests',
      commandSha256: performance.performanceCommandSha256(process.execPath, [
        'runner.mjs',
        '--report',
        '.musubix/cache/test-results/codegraph.json',
      ]),
      reportPath: '.musubix/cache/test-results/codegraph.json',
      sourceKind: 'file',
      reportSha256: createHash('sha256').update(report).digest('hex'),
      processStatus: 'completed',
      exitCode: 0,
      tests: [{
        id: 'TEST-M5-MATRIX-PERFORMANCE-001',
        status: 'passed',
        operations: { visits: 1 },
      }],
    });
    const requirements = await performance.requirementsWithBudgets(root);
    const evidence = performance.performanceEvidence(requirements, [execution], runId);
    await writeFile(
      join(root, '.musubix/evidence/performance.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );

    expect((await performance.validatePerformanceEvidence(root)).valid).toBe(false);
    expect((await performance.validatePerformanceEvidence(
      root,
      '.musubix/cache/matrix-native',
    )).valid).toBe(true);
  });
});
