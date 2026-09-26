import type { Command } from 'commander';
import { describe, expect, it } from 'vitest';

function child(command: Command, name: string): Command {
  const selected = command.commands.find((candidate) => candidate.name() === name);
  if (!selected) throw new Error(`Missing command: ${name}`);
  return selected;
}

describe('candidate workspace CLI lifecycle', () => {
  /**
   * @id TEST-M5-MULTI-CHANGE-CLI-LIFECYCLE-001
   * @verifies REQ-M5-MULTI-CHANGE-002 REQ-M5-MULTI-CHANGE-006 REQ-M5-MULTI-CHANGE-007
   */
  it('TEST-M5-MULTI-CHANGE-CLI-LIFECYCLE-001 exposes unambiguous lifecycle and integration commands', async () => {
    const { createProgram } = await import('../packages/cli/src/main.js');
    const program = createProgram();
    const candidateWorkspace = child(program, 'candidate-workspace');

    expect(candidateWorkspace.commands.map((command) => command.name())).toEqual([
      'create',
      'list',
      'show',
      'ready',
      'resume',
      'refresh',
      'integrate',
      'integration-resume',
      'integration-finalize',
      'integration-cleanup',
      'cleanup',
    ]);
    expect(child(candidateWorkspace, 'refresh').helpInformation()).toContain('--change-id <id>');
    expect(child(candidateWorkspace, 'integrate').helpInformation()).toContain('--confirm');
    expect(child(candidateWorkspace, 'integration-cleanup').helpInformation()).toContain('--confirm');
    expect(child(candidateWorkspace, 'cleanup').helpInformation()).toContain('--deleted-by <name>');

    for (const commandName of ['gate', 'status']) {
      const help = child(program, commandName).helpInformation();
      expect(help).toContain('--change-id <id>');
      expect(help).toContain('--multi-change-verification <integration-id>');
    }
  });

  /**
   * @id TEST-M5-MULTI-CHANGE-CLI-VERIFICATION-001
   * @verifies REQ-M5-MULTI-CHANGE-006
   */
  it('TEST-M5-MULTI-CHANGE-CLI-VERIFICATION-001 converts the complete required gate set', async () => {
    const { closedIntegrationVerificationFromGate } = await import('../packages/cli/src/main.js');
    const verification = closedIntegrationVerificationFromGate({
      schemaVersion: 1,
      generatedAt: '2026-09-26T00:00:00.000Z',
      status: 'fail',
      checks: [
        {
          name: 'command:typecheck',
          required: true,
          status: 'pass',
          summary: 'ok',
        },
        {
          name: 'command:test',
          required: true,
          status: 'pass',
          summary: 'ok',
        },
        {
          name: 'trace',
          required: true,
          status: 'pass',
          summary: 'ok',
        },
        {
          name: 'approval',
          required: true,
          status: 'fail',
          summary: 'release approval is intentionally deferred',
          diagnostics: [{
            code: 'APPROVAL_MISSING',
            severity: 'error',
            message: 'missing',
            detail: 'integration-release-approval-missing',
          }],
        },
      ],
      metrics: {},
      mode: 'changed',
      feature: null,
      changed: [],
      impacted: [],
      lastChangeAnalysis: null,
      fingerprints: {},
    });

    expect(verification).toEqual({
      requiredCommandNames: ['command:test', 'command:typecheck'],
      requiredCheckNames: ['approval', 'trace'],
      requiredCommands: [
        { name: 'command:test', status: 'passed' },
        { name: 'command:typecheck', status: 'passed' },
      ],
      requiredChecks: [
        {
          name: 'approval',
          status: 'failed',
          diagnostics: [{
            code: 'APPROVAL_MISSING',
            detail: 'integration-release-approval-missing',
          }],
        },
        { name: 'trace', status: 'passed' },
      ],
      status: { exitCode: 1, ready: false },
    });
  });
});
