import { describe, expect, it } from 'vitest';

import { resolveProcessCommand, resolveProcessInvocation } from '../packages/analysis/src/process.js';

describe('Windows command resolution', () => {
  /**
   * @id TEST-M5-QUALITY-005-WINDOWS-001
   * @verifies REQ-M5-QUALITY-005 REQ-M5-RELEASE-002
   */
  it('TEST-M5-QUALITY-005-WINDOWS-001 resolves Node package shims without changing native executables', () => {
    expect(resolveProcessCommand('npm', 'win32')).toBe('npm.cmd');
    expect(resolveProcessCommand('npx', 'win32')).toBe('npx.cmd');
    expect(resolveProcessCommand('node', 'win32')).toBe('node');
    expect(resolveProcessCommand('git', 'win32')).toBe('git');
    expect(resolveProcessCommand('npm.cmd', 'win32')).toBe('npm.cmd');
    expect(resolveProcessCommand('npm', 'linux')).toBe('npm');
  });

  /**
   * @id TEST-M5-QUALITY-005-WINDOWS-002
   * @verifies REQ-M5-QUALITY-005
   */
  it('TEST-M5-QUALITY-005-WINDOWS-002 executes Windows npm shims through the Node binary', () => {
    const node = String.raw`C:\Program Files\nodejs\node.exe`;

    expect(resolveProcessInvocation('npm', ['run', 'build'], 'win32', node)).toEqual({
      command: node,
      args: [
        String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`,
        'run',
        'build',
      ],
    });
    expect(resolveProcessInvocation('npx', ['vitest', 'run'], 'win32', node)).toEqual({
      command: node,
      args: [
        String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npx-cli.js`,
        'vitest',
        'run',
      ],
    });
  });
});
