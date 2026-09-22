import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProgram } from '../packages/cli/src/main.js';

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe('release-operation CLI domain errors', () => {
  it('keeps the legacy mutating executor off the public analysis surface', async () => {
    const publicAnalysis = await import('../packages/analysis/src/index.js');
    const internalGuard = await import('../packages/analysis/src/release-operation-guard.js');

    expect(publicAnalysis).not.toHaveProperty('executeReleaseOperation');
    expect(internalGuard.executeReleaseOperation).toBeTypeOf('function');
  });

  it('returns a structured release-operation validation failure with exit 1', async () => {
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await createProgram().parseAsync([
      'node',
      'musubix5',
      'release-operation',
      'validate',
      'missing-operation',
      '--root',
      '.test-work/nonexistent-release-operation',
      '--scope',
      'release',
      '--candidate-commit',
      'a'.repeat(40),
      '--release-tag',
      'v0.1.0',
      '--json',
    ]);

    expect(process.exitCode).toBe(1);
    expect(stdout).toHaveBeenCalledOnce();
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toEqual({
      error: {
        code: 'RELEASE_OPERATION_NOT_AUTHORIZED',
        message: 'missing-operation.',
      },
    });
    expect(stderr).not.toHaveBeenCalled();
  });
});
