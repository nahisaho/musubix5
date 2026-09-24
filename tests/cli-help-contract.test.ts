import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { describe, expect, it } from 'vitest';

interface HelpBaseline {
  snapshots: Array<{ command: string; stdout: string }>;
}

const baseline = JSON.parse(readFileSync(
  new URL('../docs/baseline/musubix3-v0.1.18-cli-help.json', import.meta.url),
  'utf8',
)) as HelpBaseline;

function commandFor(createProgram: () => Command, path: string) {
  const names = path.split(' ').slice(1);
  let command = createProgram();
  for (const name of names) {
    const next = command.commands.find((candidate) =>
      candidate.name() === name || candidate.aliases().includes(name));
    if (!next) throw new Error(`Missing command path: ${path}`);
    command = next;
  }
  return command;
}

describe('CLI help compatibility', () => {
  /**
   * @id TEST-M5-COMPAT-001
   * @verifies REQ-M5-COMPAT-001 REQ-M5-COMPAT-013
   */
  it('TEST-M5-COMPAT-001 preserves every inventoried help entry', async () => {
    const { createProgram } = await import('../packages/cli/src/main.js');
    for (const snapshot of baseline.snapshots) {
      let expected = snapshot.stdout.replaceAll('musubix3', 'musubix5');
      if (snapshot.command === 'musubix3' || snapshot.command === 'musubix3 help') {
        expected = expected.replace(
          '  formal                                           Honest consistency checking of an explicit abstraction',
          '  parallel                                         Coordinate approved parallel assignment worktrees and integration\n'
            + '  formal                                           Honest consistency checking of an explicit abstraction',
        );
        expected = expected.replace(
          '  approval                                         Prepare, record and validate explicit artifact-bound human approvals',
          '  candidate-snapshot                               Create and inspect immutable candidate snapshot lifecycle evidence\n'
            + '  approval                                         Prepare, record and validate explicit artifact-bound human approvals',
        );
      } else if (snapshot.command === 'musubix3 workflow-sanitize') {
        expected = expected.replace(
          '  -h, --help           display help for command',
          '  --compatible         Allow incomplete or resumed transcripts without claiming\n'
            + '                       strict terminal proof\n'
            + '  -h, --help           display help for command',
        );
      } else if (snapshot.command === 'musubix3 change-record') {
        expected = expected.replace(
          '  --dry-run               Preview the outcome without recording it',
          '  --reopen                Start or resume the next CHANGE generation (impact\n'
            + '                          only)\n'
            + '  --operation-id <id>     Idempotency identity for same-generation\n'
            + '                          requirements/design supersession\n'
            + '  --dry-run               Preview the outcome without recording it',
        );
      } else if (snapshot.command === 'musubix3 change') {
        expected = expected.replace(
          'Commands:\n',
          'Commands:\n  generation      Manage versioned CHANGE generations\n',
        );
      } else if (snapshot.command === 'musubix3 workflow-record') {
        expected = expected.replace(
          '  --status <status>   completed | skipped | failed',
          '  --status <status>   completed | skipped | failed\n'
            + '  --change-id <id>    Bind the declaration to an explicit current CHANGE',
        );
      } else if (snapshot.command === 'musubix3 workflow') {
        expected = expected.replace(
          'Commands:\n',
          'Commands:\n  declaration     Manage append-only workflow declaration corrections\n',
        );
      } else if (snapshot.command === 'musubix3 tdd red'
        || snapshot.command === 'musubix3 tdd green'
        || snapshot.command === 'musubix3 tdd refactor') {
        expected = expected.replace(
          '  --root <directory>  Project root / プロジェクトルート (default: ".")\n'
            + '  --json              Machine-readable JSON\n'
            + '  --requirement <id>  Requirement ID verified by the test\n'
            + '  --command <name>    Configured command name to execute\n'
            + '  -h, --help          display help for command',
          '  --root <directory>             Project root / プロジェクトルート (default: ".")\n'
            + '  --json                         Machine-readable JSON\n'
            + '  --requirement <id>             Requirement ID verified by the test\n'
            + '  --command <name>               Configured command name to execute\n'
            + '  --workspace <directory>        Execute the configured runner in a separate\n'
            + '                                 worktree\n'
            + '  --parallel-plan <id>           Bind evidence to a parallel plan\n'
            + '  --parallel-assignment <id>     Bind evidence to a parallel assignment\n'
            + '  --parallel-attempt <number>    Bind evidence to a parallel assignment attempt\n'
            + '  --parallel-start-commit <sha>  Bind evidence to the assignment start commit\n'
            + '  -h, --help                     display help for command',
        );
      }
      expect(commandFor(createProgram, snapshot.command).helpInformation(), snapshot.command).toBe(expected);
    }
  });
});
