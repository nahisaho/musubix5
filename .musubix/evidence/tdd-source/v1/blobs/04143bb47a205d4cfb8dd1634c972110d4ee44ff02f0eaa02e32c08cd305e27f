import { mkdir, mkdtemp } from 'node:fs/promises';
import { isAbsolute, join, posix, win32 } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalBytes, sha256 } from './canonical.js';

/** @id CODE-M5-CI-PORTABLE-EXECUTION-001
 * @implements REQ-M5-CI-EFFICIENCY-002
 * @design DES-M5-CI-EFFICIENCY-003
 */
export function canonicalRuntimePath(value: string | URL, platform: NodeJS.Platform) {
  const windows = platform === 'win32';
  if (value instanceof URL && (value.username || value.password || value.search || value.hash)) {
    throw new Error('unsafe runtime URL');
  }
  let path = value instanceof URL || String(value).startsWith('file:')
    ? fileURLToPath(value, { windows }) : String(value);
  if (!path || /[\0-\x1f]/.test(path)) throw new Error('unsafe runtime path');
  if (windows) {
    if (path.includes('/') && path.includes('\\') || /^[\\/]{2}[?.][\\/]/.test(path)
      || !win32.isAbsolute(path) || !/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+\\?)/.test(path)
      || /:/.test(path.slice(2))) throw new Error('unsafe Windows runtime path');
    path = path.replaceAll('\\', '/');
    if (/^[a-z]:/.test(path)) path = path[0]!.toUpperCase() + path.slice(1);
  } else if (!posix.isAbsolute(path) || path.includes('\\') || path.includes(':') || path.startsWith('//')) {
    throw new Error('unsafe POSIX runtime path');
  }
  const segments = path.replace(/\/$/, '').split('/').filter(Boolean);
  if (/\/{2}/.test(path.slice(path.startsWith('//') ? 2 : 0))) throw new Error('unsafe repeated runtime separator');
  if (segments.some((segment) => segment === '.' || segment === '..'
    || windows && (/[<>"|?*]/.test(segment) || /[. ]$/.test(segment) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)))) {
    throw new Error('unsafe runtime path segment');
  }
  return { platform: windows ? 'win32' : 'posix', path: path.length > 1 && !/^[A-Z]:\/$/.test(path) ? path.replace(/\/$/, '') : path };
}

export function portableModuleUrl(path: string): URL {
  canonicalRuntimePath(path, process.platform);
  return pathToFileURL(path);
}

export function runtimePathBinding(path: string | URL, platform: NodeJS.Platform): string {
  return sha256(canonicalBytes(canonicalRuntimePath(path, platform)));
}

export async function createPortableTemporaryRoot(authorizedRoot: string): Promise<string> {
  if (!isAbsolute(authorizedRoot)) throw new Error('authorized root must be absolute');
  await mkdir(authorizedRoot, { recursive: true });
  return mkdtemp(join(authorizedRoot, 'candidate-'));
}

export function remainingCandidateDeadline(deadline: number, now: () => number = Date.now): number {
  const current = now();
  if (!Number.isSafeInteger(deadline) || !Number.isSafeInteger(current)) {
    throw new Error('candidate absolute deadline invalid');
  }
  const remaining = deadline - current;
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('candidate absolute deadline expired');
  return Math.ceil(remaining);
}

export interface CandidateLfsClosureManifest {
  schemaVersion: 1;
  nonce: string;
  runId: string;
  runAttempt: 1;
  repositoryId: string;
  candidateCommit: string;
  jobTimingDigest: string;
  scriptDigest: string;
  configDigest: string;
  objects: string[];
  pointers: Array<{ path: string; oid: string; size: number; sourceMode: string; logicalSha256: string }>;
}

export function candidateLfsClosureManifestDigest(value: unknown): string {
  return sha256(canonicalBytes(value));
}

/** @id CODE-M5-CI-LFS-CLOSURE-MANIFEST-001
 * @implements REQ-M5-CI-EFFICIENCY-002 REQ-M5-CI-EFFICIENCY-003
 * @design DES-M5-CI-EFFICIENCY-003 DES-M5-CI-EFFICIENCY-004
 */
export function verifyCandidateLfsClosureManifest(
  value: unknown,
  context: Pick<CandidateLfsClosureManifest, 'nonce' | 'runId' | 'repositoryId'
    | 'candidateCommit' | 'jobTimingDigest' | 'scriptDigest' | 'configDigest'> & { digest: string; runAttempt: number },
): CandidateLfsClosureManifest {
  const invalid = (): never => { throw new Error('CANDIDATE_LFS_CLOSURE_MANIFEST_INVALID'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const manifest = value as CandidateLfsClosureManifest;
  const keys = ['schemaVersion', 'nonce', 'runId', 'runAttempt', 'repositoryId', 'candidateCommit',
    'jobTimingDigest', 'scriptDigest', 'configDigest', 'objects', 'pointers'];
  if (Object.keys(manifest).sort().join() !== keys.sort().join() || manifest.schemaVersion !== 1
    || manifest.runAttempt !== 1 || candidateLfsClosureManifestDigest(value) !== context.digest) invalid();
  for (const key of ['nonce', 'runId', 'repositoryId', 'candidateCommit', 'jobTimingDigest', 'scriptDigest', 'configDigest'] as const) {
    if (typeof manifest[key] !== 'string' || !manifest[key] || manifest[key] !== context[key]) invalid();
  }
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(manifest.candidateCommit)
    || ['jobTimingDigest', 'scriptDigest', 'configDigest'].some((key) => !/^[a-f0-9]{64}$/.test(manifest[key as 'scriptDigest']))) invalid();
  if (!Array.isArray(manifest.objects) || manifest.objects.some((id) => !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(id))
    || [...new Set(manifest.objects)].sort().join() !== manifest.objects.join() || !Array.isArray(manifest.pointers)) invalid();
  const paths = new Set<string>();
  for (const pointer of manifest.pointers) {
    if (!pointer || Object.keys(pointer).sort().join() !== ['path', 'oid', 'size', 'sourceMode', 'logicalSha256'].sort().join()
      || typeof pointer.path !== 'string' || pointer.path.startsWith('/') || pointer.path.includes('\\')
      || pointer.path.includes(':') || pointer.path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
      || paths.has(pointer.path) || !/^[a-f0-9]{64}$/.test(pointer.oid) || pointer.logicalSha256 !== pointer.oid
      || !Number.isSafeInteger(pointer.size) || pointer.size < 0 || !['100644', '100755'].includes(pointer.sourceMode)) invalid();
    paths.add(pointer.path);
  }
  return structuredClone(manifest);
}
