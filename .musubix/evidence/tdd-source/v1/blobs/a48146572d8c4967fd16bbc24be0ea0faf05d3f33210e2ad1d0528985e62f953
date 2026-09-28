import { basename, isAbsolute, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  candidateFilesystemKey,
  candidateStateRoot,
  integrationFilesystemKey,
  integrationStateRoot,
} from '../packages/analysis/src/candidate-state.js';
import { integrationWorktreeRelativePath } from '../packages/analysis/src/candidate-integration.js';

describe('candidate path portability', () => {
  /** @id TEST-M5-CANDIDATE-PATH-PORTABILITY-001
   * @verifies REQ-M5-CI-001 REQ-M5-MULTI-CHANGE-004
   */
  it('TEST-M5-CANDIDATE-PATH-PORTABILITY-001 maps logical identities to portable state and worktree paths', () => {
    const candidateId = `candidate:${'a'.repeat(64)}`;
    const integrationId = `integration:${'b'.repeat(64)}`;
    const candidateKey = `candidate-${'a'.repeat(64)}`;
    const integrationKey = `integration-${'b'.repeat(64)}`;
    const controlRoot = resolve('repository', 'control');

    expect(candidateFilesystemKey(candidateId)).toBe(candidateKey);
    expect(integrationFilesystemKey(integrationId)).toBe(integrationKey);

    const candidateRoot = candidateStateRoot(controlRoot, candidateId);
    const integrationRoot = integrationStateRoot(controlRoot, integrationId);
    expect(isAbsolute(candidateRoot)).toBe(true);
    expect(isAbsolute(integrationRoot)).toBe(true);
    expect(basename(candidateRoot)).toBe(candidateKey);
    expect(basename(integrationRoot)).toBe(integrationKey);
    expect(candidateRoot).toBe(resolve(controlRoot, '.musubix', 'candidates', candidateKey));
    expect(integrationRoot).toBe(resolve(
      controlRoot,
      '.musubix',
      'candidates',
      'integrations',
      integrationKey,
    ));

    const worktreePath = integrationWorktreeRelativePath(integrationId);
    expect(worktreePath).toBe(`musubix5/workspaces/integrations/${integrationKey}`);
    expect(worktreePath.split('/').every((component) => !component.includes(':'))).toBe(true);

    expect(() => candidateFilesystemKey(`candidate:${'A'.repeat(64)}`))
      .toThrow('CANDIDATE_STATE_OWNERSHIP');
    expect(() => integrationFilesystemKey(`candidate:${'b'.repeat(64)}`))
      .toThrow('CANDIDATE_STATE_OWNERSHIP');
  });
});
