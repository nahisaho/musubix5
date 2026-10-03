import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import * as analysis from '../packages/analysis/src/index.js';

/** @id TEST-M5-G10-RECOVERY-PUBLICATION-003
 * @verifies REQ-M5-EVIDENCE-007 REQ-M5-LIFECYCLE-006 REQ-M5-WORKTREE-004
 */
it('TEST-M5-G10-RECOVERY-PUBLICATION-003 executes every closed publication boundary idempotently', async () => {
  const recovery = analysis as unknown as {
    canonicalBytes(value: unknown): Buffer;
    generation10BoundaryMatrix(): Array<{ id: string; family: string; boundary: string }>;
    publishCanonicalFile10(
      root: string,
      path: string,
      value: unknown,
      stopAfter: string,
    ): Promise<{ state: string; sha256: string }>;
    recoverCanonicalFile10(
      root: string,
      path: string,
      value: unknown,
    ): Promise<{ state: string; sha256: string }>;
  };
  const matrix = recovery.generation10BoundaryMatrix();
  expect(matrix).toHaveLength(142);
  expect(new Set(matrix.map((row) => row.id)).size).toBe(142);
  expect(matrix.filter((row) => row.family === 'P10')).toHaveLength(108);
  expect(matrix.filter((row) => row.family === 'F10')).toHaveLength(18);
  expect(matrix.filter((row) => row.family === 'D1')).toHaveLength(16);

  const boundaries = [
    'before-writing',
    'writing-before-fsync',
    'writing-fsynced',
    'pending-before-directory-fsync',
    'pending-fsynced',
    'final-before-directory-fsync',
  ];
  const root = await mkdtemp(join(tmpdir(), 'musubix5-g10-publication-'));
  try {
    for (const [index, boundary] of boundaries.entries()) {
      const path = `control/fixture-${index}.json`;
      const value = { schemaVersion: 1, boundary, index };
      await recovery.publishCanonicalFile10(root, path, value, boundary);
      const first = await recovery.recoverCanonicalFile10(root, path, value);
      const second = await recovery.recoverCanonicalFile10(root, path, value);
      expect(first).toEqual({ state: 'final', sha256: second.sha256 });
      expect(second).toEqual(first);
      expect(JSON.parse(await readFile(join(root, path), 'utf8'))).toEqual(value);
    }
    const conflictPath = 'control/conflict.json';
    const conflict = { schemaVersion: 1, conflict: true };
    await mkdir(join(root, 'control'), { recursive: true });
    const conflictBytes = recovery.canonicalBytes(conflict);
    await writeFile(join(root, `${conflictPath}.writing`), conflictBytes);
    await writeFile(join(root, `${conflictPath}.pending`), conflictBytes);
    await expect(recovery.recoverCanonicalFile10(root, conflictPath, conflict))
      .rejects.toThrow(/multiple|conflict|ambiguous/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
