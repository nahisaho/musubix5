import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveNpmInvocation } from '../packages/analysis/src/process.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('CLI JSON failure compatibility', () => {
  /**
   * @id TEST-M5-COMPAT-003
   * @verifies REQ-M5-COMPAT-003
   */
  it('TEST-M5-COMPAT-003 preserves the operational-error envelope', () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-json-error-'));
    temporaryDirectories.push(root);
    const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
    const build = resolveNpmInvocation(['run', 'build']);
    execFileSync(build.command, build.args, { cwd: repositoryRoot, stdio: 'pipe' });

    const result = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'dist/packages/cli/src/main.js'),
      'config',
      'lint',
      '--root',
      root,
      '--json',
    ], { encoding: 'utf8' });

    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toEqual({
      error: {
        code: 'CLI_ERROR',
        message: 'Missing .musubix/config.json; run musubix5 init.',
      },
    });
    expect(result.stderr).toBe('');
  });
});
