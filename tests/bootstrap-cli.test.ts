import { describe, expect, it } from 'vitest';

describe('bootstrap CLI', () => {
  /**
   * @id TEST-M5-BOOTSTRAP-002
   * @verifies REQ-M5-BOOTSTRAP-001 REQ-M5-COMPAT-013
   */
  it('TEST-M5-BOOTSTRAP-002 exposes only explicit bootstrap subcommands', async () => {
    const { createProgram } = await import('../packages/cli/src/main.js');
    const program = createProgram();
    const bootstrap = program.commands.find((command) => command.name() === 'bootstrap');
    expect(bootstrap?.commands.map((command) => command.name())).toEqual([
      'run',
      'resume',
      'status',
    ]);
    expect(bootstrap?.commands.every((command) => command.description().length > 0)).toBe(true);
    expect(program.commands.filter((command) =>
      ['run', 'resume'].includes(command.name()))).toEqual([]);
  });
});
