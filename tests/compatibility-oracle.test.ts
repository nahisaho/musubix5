import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

describe('compatibility oracle', () => {
  /**
   * @id TEST-M5-COMPAT-ORACLE-001
   * @verifies REQ-M5-COMPAT-002 REQ-M5-COMPAT-004 REQ-M5-COMPAT-007 REQ-M5-COMPAT-008 REQ-M5-COMPAT-009 REQ-M5-COMPAT-010 REQ-M5-COMPAT-011 REQ-M5-COMPAT-012
   */
  it('TEST-M5-COMPAT-ORACLE-001 enforces the pinned baseline contract', async () => {
    const {
      BASELINE_IDENTITY,
      classifyMigration,
      compareEffectiveConfig,
      legacySolverCommands,
      runBaselineOracle,
      validateCompatibilityInventory,
      validateGovernedDifference,
      verifyExitSemantics,
    } = await import('../packages/analysis/src/compatibility-oracle.js');
    const repositoryRoot = resolve(new URL('..', import.meta.url).pathname);
    const requirements = readFileSync(
      resolve(repositoryRoot, '.musubix/features/musubix5-clean-foundation/requirements.md'),
      'utf8',
    );
    const helpFixture = readFileSync(
      resolve(repositoryRoot, 'docs/baseline/musubix3-v0.1.18-cli-help.json'),
    );

    expect(validateCompatibilityInventory({ requirements, helpFixture })).toEqual({
      valid: true,
      diagnostics: [],
    });
    expect(validateCompatibilityInventory({
      requirements,
      helpFixture: Buffer.concat([helpFixture, Buffer.from('\n')]),
    })).toMatchObject({
      valid: false,
      diagnostics: [{ code: 'COMPAT_HELP_FIXTURE_DIGEST_MISMATCH' }],
    });

    expect(verifyExitSemantics([
      { command: 'requirements validate', baseline: 0, candidate: 0 },
      { command: 'trace check --strict', baseline: 1, candidate: 1 },
      { command: 'config lint', baseline: 2, candidate: 2 },
    ])).toEqual({ valid: true, diagnostics: [] });
    expect(verifyExitSemantics([
      { command: 'config lint', baseline: 2, candidate: 1 },
    ])).toMatchObject({
      valid: false,
      diagnostics: [{ code: 'COMPAT_EXIT_MISMATCH' }],
    });

    expect(compareEffectiveConfig(
      { schemaVersion: 1 },
      {
        schemaVersion: 1,
        language: 'auto',
        qualityProfile: 'custom',
        commands: [],
      },
    )).toMatchObject({ valid: true });

    expect(validateGovernedDifference({
      id: 'single-bin-name',
      requirementId: 'REQ-M5-COMPAT-006',
      adrPath: '.musubix/decisions/ADR-0007.md',
      migrationGuideEntry: 'musubix5 executable',
      testId: 'TEST-M5-COMPAT-006',
    })).toEqual({ valid: true, diagnostics: [] });
    expect(validateGovernedDifference({
      id: 'ungoverned',
      requirementId: '',
      adrPath: '',
      migrationGuideEntry: '',
      testId: '',
    })).toMatchObject({
      valid: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'COMPAT_GOVERNANCE_REQUIREMENT_MISSING' }),
        expect.objectContaining({ code: 'COMPAT_GOVERNANCE_ADR_MISSING' }),
        expect.objectContaining({ code: 'COMPAT_GOVERNANCE_MIGRATION_MISSING' }),
        expect.objectContaining({ code: 'COMPAT_GOVERNANCE_TEST_MISSING' }),
      ]),
    });

    expect(classifyMigration([
      '.musubix/config.json',
      '.musubix/features/example/requirements.md',
      '.musubix/features/example/design.md',
      '.musubix/decisions/ADR-0001.md',
      '.musubix/evidence/quality.json',
      'src/index.ts',
    ])).toEqual({
      preserved: [
        '.musubix/config.json',
        '.musubix/decisions/ADR-0001.md',
        '.musubix/features/example/design.md',
        '.musubix/features/example/requirements.md',
        'src/index.ts',
      ],
      foreignEvidence: ['.musubix/evidence/quality.json'],
    });
    expect(legacySolverCommands({
      MUSUBIX3_Z3: '/tools/z3',
      MUSUBIX3_LEAN: '/tools/lean',
    })).toEqual({ z3: '/tools/z3', lean: '/tools/lean' });

    const runner = vi.fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: `${BASELINE_IDENTITY.commit}\n`, stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 1, stdout: '{"valid":false}\n', stderr: '' });
    const capture = await runBaselineOracle({
      sourceRoot: '/readonly/musubix3',
      workspaceRoot: '/tmp/musubix3-oracle',
      invocation: ['requirements', 'validate', 'fixture.md', '--json'],
      filesystemEffects: [{ path: '.musubix/cache/trace.json', sha256: 'a'.repeat(64) }],
    }, runner);
    expect(runner.mock.calls.map(([command, args]) => [command, args])).toEqual([
      ['git', ['-C', '/readonly/musubix3', 'rev-parse', 'HEAD']],
      ['npm', ['ci']],
      ['npm', ['run', 'build']],
      ['node', ['dist/packages/cli/src/main.js', 'requirements', 'validate', 'fixture.md', '--json']],
    ]);
    expect(capture).toMatchObject({
      baseline: BASELINE_IDENTITY,
      buildCommands: ['npm ci', 'npm run build'],
      invocation: ['requirements', 'validate', 'fixture.md', '--json'],
      exitCode: 1,
      stdoutSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      stderrSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      jsonPayloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      filesystemEffectsSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
});
