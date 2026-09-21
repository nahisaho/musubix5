import { describe, expect, it } from 'vitest';

describe('workspace evidence ownership', () => {
  /**
   * @id TEST-M5-WORKTREE-002
   * @verifies REQ-M5-WORKTREE-003
   */
  it('TEST-M5-WORKTREE-002 rejects evidence from another CHANGE or candidate', async () => {
    const { validateWorkspaceBinding } =
      await import('../packages/analysis/src/workspace-manager.js');
    const expected = {
      changeId: 'CHANGE-0002',
      candidateId: 'candidate:abc',
      workspaceKind: 'candidate' as const,
    };
    expect(validateWorkspaceBinding(expected, expected)).toEqual({
      valid: true,
      terminalReason: null,
    });
    for (const foreign of [
      { ...expected, changeId: 'CHANGE-9999' },
      { ...expected, candidateId: 'candidate:other' },
      { ...expected, workspaceKind: 'qa' as const },
    ]) {
      expect(validateWorkspaceBinding(foreign, expected)).toEqual({
        valid: false,
        terminalReason: 'foreign-workspace-evidence',
      });
    }
  });
});
