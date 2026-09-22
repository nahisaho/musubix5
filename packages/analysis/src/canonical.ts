import { createHash } from 'node:crypto';

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function canonicalValue(value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('CANONICAL_NUMBER_INVALID: canonical JSON rejects non-finite numbers.');
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => compareUtf8(left, right))
      .map(([key, entry]) => [key, canonicalValue(entry)]));
  }
  return value;
}

export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8');
}

export function legacyCanonicalBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(canonicalValue(value)), 'utf8');
}

export function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

const ASCII_EDGE_WHITESPACE = /^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g;
const GITHUB_HTTPS_ORIGIN = /^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)$/;

function canonicalGithubHttpsOrigin(origin: string): string | null {
  const withoutTrailingSlashes = origin.replace(/\/+$/, '');
  const match = GITHUB_HTTPS_ORIGIN.exec(withoutTrailingSlashes);
  if (!match) return null;
  const owner = match[1]!;
  const repositoryWithSuffix = match[2]!;
  const repository = repositoryWithSuffix.endsWith('.git')
    ? repositoryWithSuffix.slice(0, -4)
    : repositoryWithSuffix;
  return repository ? `https://github.com/${owner}/${repository}` : null;
}

/** @id CODE-M5-REPOSITORY-IDENTITY-001
 * @implements REQ-M5-WORKTREE-001 REQ-M5-RELEASE-003 REQ-M5-RELEASE-004
 * @design DES-M5-003
 */
export function canonicalRepositoryIdentity(
  origin: string | undefined,
  repositoryRoot = '',
): string {
  const trimmed = (origin ?? '').replace(ASCII_EDGE_WHITESPACE, '');
  if (!trimmed && !repositoryRoot) {
    throw new Error('Repository identity requires an origin or repository root.');
  }
  const identity = trimmed
    ? canonicalGithubHttpsOrigin(trimmed) ?? trimmed
    : repositoryRoot;
  return `repository:${sha256(canonicalBytes({ identity }))}`;
}
