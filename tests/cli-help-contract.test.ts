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
      const expected = snapshot.stdout.replaceAll('musubix3', 'musubix5');
      expect(commandFor(createProgram, snapshot.command).helpInformation(), snapshot.command).toBe(expected);
    }
  });
});
