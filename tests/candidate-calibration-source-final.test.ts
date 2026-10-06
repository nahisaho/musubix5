import { expect, it } from 'vitest';
import { verifyCandidateCalibrationSourceFinal, type CandidateCalibrationManifest } from '../packages/analysis/src/candidate-calibration.js';
import type { Runner } from '../packages/analysis/src/process.js';

/** @id TEST-M5-CI-CALIBRATION-SOURCE-FINAL-001
 * @verifies REQ-M5-CI-EFFICIENCY-005 REQ-M5-CI-EFFICIENCY-006
 * @design DES-M5-CI-EFFICIENCY-001 DES-M5-CI-EFFICIENCY-005
 */
it('TEST-M5-CI-CALIBRATION-SOURCE-FINAL-001 requires one direct source parent and rejects same-source, merges and skipped ancestors', async () => {
  const source = 'a'.repeat(40), final = 'b'.repeat(40), other = 'c'.repeat(40);
  const manifest = { sourceCommit: source, sourceTree: 'd'.repeat(40) } as CandidateCalibrationManifest;
  let parents = `${final} ${source}`;
  let changed = '';
  const runner: Runner = async (_command, args) => ({
    status: 'completed', exitCode: 0, stderr: '', durationMs: 1,
    stdout: args[0] === 'rev-parse' ? manifest.sourceTree
      : args[0] === 'rev-list' ? parents
        : args[0] === 'diff-tree' ? changed : '{}',
  });
  await expect(verifyCandidateCalibrationSourceFinal(process.cwd(), manifest, final, runner)).resolves.toBeUndefined();
  await expect(verifyCandidateCalibrationSourceFinal(process.cwd(), manifest, source, runner)).rejects.toThrow(/direct source parent/);
  for (const invalid of [`${final} ${other}`, `${final} ${source} ${other}`, `${other} ${source}`, final]) {
    parents = invalid;
    await expect(verifyCandidateCalibrationSourceFinal(process.cwd(), manifest, final, runner)).rejects.toThrow(/direct source parent/);
  }
  parents = `${final} ${source}`;
  changed = '.github/workflows/candidate-calibration.yml';
  await expect(verifyCandidateCalibrationSourceFinal(process.cwd(), manifest, final, runner)).rejects.toThrow(/changed execution shape/);
});
