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
   * @verifies REQ-M5-COMPAT-001
   */
  it('TEST-M5-COMPAT-001 preserves every inventoried help entry', async () => {
    const { createProgram } = await import('../packages/cli/src/main.js');
    for (const snapshot of baseline.snapshots) {
      let expected = snapshot.stdout.replaceAll('musubix3', 'musubix5');
      if (snapshot.command === 'musubix3 workflow-sanitize') {
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
            + '  --dry-run               Preview the outcome without recording it',
        );
      } else if (snapshot.command === 'musubix3 change') {
        expected = expected.replace(
          'Commands:\n',
          'Commands:\n  generation      Manage versioned CHANGE generations\n',
        );
      }
      expect(commandFor(createProgram, snapshot.command).helpInformation(), snapshot.command).toBe(expected);
    }
  });
});
