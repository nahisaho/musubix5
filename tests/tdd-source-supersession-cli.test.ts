import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

/** @id TEST-M5-SOURCE-IO-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-002 DES-M5-004 DES-M5-023
 */
it('TEST-M5-SOURCE-IO-001 distinguishes actual filesystem failures from missing immutable evidence', async () => {
  const { readSourceTddEvidence } = await import('../packages/analysis/src/tdd-source-supersession.js');
  const { publishSourceFile, readSourceBlob } = await import('../packages/analysis/src/tdd-source-storage.js');
  mkdirSync(resolve('.musubix/cache'), { recursive: true });
  const root = mkdtempSync(resolve('.musubix/cache/source-io-'));
  try {
    mkdirSync(join(root, '.musubix/evidence/tdd.json'), { recursive: true });
    await expect(readSourceTddEvidence(root)).rejects.toMatchObject({
      code: 'TDD_SOURCE_IO_FAILED', exitCode: 2, diagnostic: { details: { reason: 'read' } },
    });
    const path = '.musubix/evidence/tdd-source/v1/CHANGE-0017/g5/io-fixture/artifact.json';
    mkdirSync(join(root, path), { recursive: true });
    await expect(publishSourceFile(root, path, Buffer.from('{}'))).rejects.toMatchObject({
      code: 'TDD_SOURCE_IO_FAILED', exitCode: 2, diagnostic: { details: { reason: 'read', path } },
    });
    await expect(readSourceBlob(root, 'a'.repeat(64))).rejects.toMatchObject({
      code: 'TDD_SOURCE_APPROVAL_INVALID', exitCode: 1, diagnostic: { details: { reason: 'blob-hash' } },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-PUBLICATION-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-023
 */
it('TEST-M5-SOURCE-PUBLICATION-001 publishes immutable verified blobs and refuses conflicting bytes or symlink ancestors', async () => {
  const { publishSourceFile, storeSourceBlob, readSourceBlob } =
    await import('../packages/analysis/src/tdd-source-storage.js');
  mkdirSync(resolve('.musubix/cache'), { recursive: true });
  const root = mkdtempSync(resolve('.musubix/cache/source-publication-'));
  try {
    const bytes = Buffer.from('review input\n');
    const digest = await storeSourceBlob(root, bytes);
    expect(await readSourceBlob(root, digest)).toEqual(bytes);
    expect(await storeSourceBlob(root, bytes)).toBe(digest);
    const path = '.musubix/evidence/tdd-source/v1/CHANGE-0017/g5/fixture/artifact.json';
    await publishSourceFile(root, path, bytes);
    await publishSourceFile(root, path, bytes);
    await expect(publishSourceFile(root, path, Buffer.from('different'))).rejects.toThrow(/request-mismatch/);
    expect(readFileSync(join(root, path))).toEqual(bytes);
    const link = '.musubix/evidence/tdd-source/v1/CHANGE-0017/g5/escape';
    symlinkSync(root, join(root, link));
    await expect(publishSourceFile(root, `${link}/artifact.json`, bytes)).rejects.toThrow(/unsafe-path/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
/** @id TEST-M5-SOURCE-DIAGNOSTIC-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-002 DES-M5-023
 */
it('TEST-M5-SOURCE-DIAGNOSTIC-001 retains closed source reasons, explicit unknown context and operational exits', async () => {
  const { SourceOperationError } = await import('../packages/analysis/src/tdd-source-diagnostics.js');
  const admission = new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'input-drift');
  expect(admission.exitCode).toBe(1);
  expect(admission.diagnostic).toEqual({
    code: 'TDD_SOURCE_ADMISSION_INVALID', severity: 'error', message: 'input-drift',
    details: { operationId: null, scope: null, target: null, reason: 'input-drift' },
  });
  const io = new SourceOperationError('TDD_SOURCE_IO_FAILED', 'execute', {
    operationId: 'session-clock', scope: null, target: null,
  }, { path: 'tests/change-lease.test.ts', stage: 'old-run' });
  expect(io.exitCode).toBe(2);
  expect(io.message).toContain('"operationId":"session-clock"');
  expect(io.diagnostic.details).toMatchObject({ reason: 'execute', stage: 'old-run', path: 'tests/change-lease.test.ts' });
});
/** @id TEST-M5-SOURCE-READ-FENCE-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-READ-FENCE-001 rechecks only verified blob dependencies and rejects changed bytes before publication', async () => {
  const { sourceBlobVerification, storeSourceBlob, sourceEvidencePrefix } =
    await import('../packages/analysis/src/tdd-source-storage.js');
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-read-fence-'));
  try {
    const hash = await storeSourceBlob(root, Buffer.from('verified'));
    const verification = sourceBlobVerification(root);
    expect((await verification.read(hash)).toString()).toBe('verified');
    await storeSourceBlob(root, Buffer.from('unrelated publication'));
    await expect(verification.recheck()).resolves.toBeUndefined();
    await writeFile(join(root, sourceEvidencePrefix, 'blobs', hash), 'tampered');
    await expect(verification.recheck()).rejects.toThrow(/blob-hash/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
