import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('published bin contract', () => {
  /**
   * @id TEST-M5-COMPAT-BIN-001
   * @verifies REQ-M5-COMPAT-005 REQ-M5-COMPAT-006 REQ-M5-COMPAT-007
   */
  it('TEST-M5-COMPAT-BIN-001 accepts only the musubix5 executable', async () => {
    const { validatePublishedBinContract } =
      await import('../packages/analysis/src/compatibility-oracle.js');

    expect(validatePublishedBinContract({
      name: 'musubix5',
      bin: { musubix5: 'dist/packages/cli/src/main.js' },
    })).toEqual({ valid: true, diagnostics: [] });
    expect(validatePublishedBinContract({
      name: 'musubix5',
      bin: {
        musubix5: 'dist/packages/cli/src/main.js',
        musubix3: 'dist/packages/cli/src/main.js',
      },
    })).toMatchObject({
      valid: false,
      diagnostics: [{ code: 'COMPAT_BIN_CONTRACT_MISMATCH' }],
    });

    const root = mkdtempSync(join(tmpdir(), 'musubix5-status-next-'));
    try {
      const { projectStatus } = await import('../packages/analysis/src/gate.js');
      expect((await projectStatus(root)).next).toEqual(['musubix5 init']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
