import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

/** @id TEST-M5-CI-PORTABLE-EXECUTION-001
 * @verifies REQ-M5-CI-EFFICIENCY-002
 */
it('TEST-M5-CI-PORTABLE-EXECUTION-001 canonicalizes platform paths, URLs, bindings and absolute LFS deadlines', async () => {
  const api = await import('../packages/analysis/src/candidate-portability.js');
  expect(api.canonicalRuntimePath('C:\\repo\\a b.ts', 'win32')).toEqual({ platform: 'win32', path: 'C:/repo/a b.ts' });
  expect(api.canonicalRuntimePath('\\\\server\\share\\a.ts', 'win32').path).toBe('//server/share/a.ts');
  expect(api.canonicalRuntimePath('/repo/a b.ts', 'linux').path).toBe('/repo/a b.ts');
  for (const [path, platform] of [
    ['C:\\repo/a.ts', 'win32'], ['C:\\repo\\..\\a.ts', 'win32'],
    ['C:\\repo\\a.ts:stream', 'win32'], ['\\\\?\\C:\\repo', 'win32'],
    ['/repo', 'win32'], ['C:\\repo', 'linux'], ['/repo/../a', 'linux'],
  ] as const) expect(() => api.canonicalRuntimePath(path, platform)).toThrow();
  const root = join(process.cwd(), '.musubix/cache/portable-fixture');
  await mkdir(root, { recursive: true });
  const fixture = await api.createPortableTemporaryRoot(root);
  try {
    const path = join(fixture, 'a b#%.mjs');
    expect(fileURLToPath(api.portableModuleUrl(path))).toBe(path);
    expect(api.runtimePathBinding(path, process.platform)).toEqual(api.runtimePathBinding(api.portableModuleUrl(path), process.platform));
    expect(api.remainingCandidateDeadline(110, () => 100)).toBe(10);
    expect(() => api.remainingCandidateDeadline(100, () => 100)).toThrow(/deadline/);
    const manifest = {
      schemaVersion: 1, nonce: 'nonce-001', runId: '123', runAttempt: 1,
      repositoryId: 'repo-001', candidateCommit: 'a'.repeat(40), jobTimingDigest: 'b'.repeat(64),
      scriptDigest: 'c'.repeat(64), configDigest: 'd'.repeat(64),
      objects: ['e'.repeat(40)], pointers: [{
        path: '.musubix/evidence/tdd-source/v1/blobs/blob', oid: 'f'.repeat(64),
        size: 100_000_000, sourceMode: '100644', logicalSha256: 'f'.repeat(64),
      }],
    };
    const digest = api.candidateLfsClosureManifestDigest(manifest);
    expect(api.verifyCandidateLfsClosureManifest(manifest, { ...manifest, digest })).toEqual(manifest);
    expect(() => api.verifyCandidateLfsClosureManifest({ ...manifest, runAttempt: 2 }, { ...manifest, digest })).toThrow();
    expect(() => api.verifyCandidateLfsClosureManifest({ ...manifest, pointers: [{ ...manifest.pointers[0], path: '../blob' }] }, { ...manifest, digest })).toThrow();
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
