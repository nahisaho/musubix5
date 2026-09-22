import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { canonicalBytes, sha256 } from './canonical.js';
import { files, readText } from './files.js';

export interface ReleaseVersionValidation {
  releaseTag: string;
  version: string;
  valid: true;
  paths: string[];
  versions: Record<string, string>;
}

export interface ReleaseContext {
  schemaVersion: 'release-context-v1';
  mode: 'tag-push' | 'dispatch';
  repository: string;
  candidateCommit: string;
  workflow: '.github/workflows/release.yml';
  releaseTag: string;
  evidenceCommit?: string;
  verifiedReleaseApprovalSha256?: string;
}

export interface ReleaseAssetManifestValidation {
  releaseTag: string;
  version: string;
  tarball: string;
  checksummed: string[];
}

export interface ReleaseAttestationEnvelope {
  release?: unknown;
  evidenceHeads?: unknown;
}

export type NpmRegistryQueryClassification =
  | { status: 'missing' }
  | { status: 'found'; value: unknown };

export function releaseTransportPolicy(): {
  workflow: '.github/workflows/release.yml';
  maxAgeSeconds: 2_592_000;
  maxFutureSkewSeconds: 60;
  runner: 'ubuntu-24.04';
  npmVersion: '11.5.1';
} {
  return {
    workflow: '.github/workflows/release.yml',
    maxAgeSeconds: 2_592_000,
    maxFutureSkewSeconds: 60,
    runner: 'ubuntu-24.04',
    npmVersion: '11.5.1',
  };
}

/** @id CODE-M5-NPM-PUBLISH-POLICY-001
 * @implements REQ-M5-RELEASE-004
 * @design DES-M5-021
 */
export function npmPublishTransportPolicy(): {
  workflow: '.github/workflows/npm-publish.yml';
  npmVersion: '11.6.0';
  registryAttempts: 6;
  registryQueryTimeoutSeconds: 15;
  registryQueryKillAfterSeconds: 2;
  registryDeadlineSeconds: 240;
  registryDeadlineKillAfterSeconds: 5;
  reconcileFailedPublication: true;
} {
  return {
    workflow: '.github/workflows/npm-publish.yml',
    npmVersion: '11.6.0',
    registryAttempts: 6,
    registryQueryTimeoutSeconds: 15,
    registryQueryKillAfterSeconds: 2,
    registryDeadlineSeconds: 240,
    registryDeadlineKillAfterSeconds: 5,
    reconcileFailedPublication: true,
  };
}

function packageVersion(value: unknown, path: string): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof (value as Record<string, unknown>).version !== 'string') {
    throw new Error(`RELEASE_VERSION_MISMATCH: ${path} has no string version.`);
  }
  return (value as { version: string }).version;
}

/** @id CODE-M5-RELEASE-WORKFLOW-001
 * @implements REQ-M5-RELEASE-003
 * @design DES-M5-020
 */
export async function validateReleaseVersions(
  root: string,
  releaseTag: string,
): Promise<ReleaseVersionValidation> {
  if (!/^v[0-9A-Za-z][0-9A-Za-z._-]*$/.test(releaseTag)) {
    throw new Error(`RELEASE_VERSION_MISMATCH: invalid release tag ${releaseTag}.`);
  }
  const allFiles = await files(root);
  const paths = [
    'package.json',
    ...allFiles.filter((path) => /^packages\/[^/]+\/package\.json$/.test(path)).sort(),
    'plugin.json',
    '.github/plugin/marketplace.json#metadata',
    '.github/plugin/marketplace.json#plugins[0]',
  ];
  const versions: Record<string, string> = {};
  for (const path of paths.filter((value) => !value.includes('#'))) {
    versions[path] = packageVersion(JSON.parse(await readText(root, path)) as unknown, path);
  }
  const marketplace = JSON.parse(await readText(root, '.github/plugin/marketplace.json')) as {
    metadata?: unknown;
    plugins?: unknown[];
  };
  versions['.github/plugin/marketplace.json#metadata'] =
    packageVersion(marketplace.metadata, '.github/plugin/marketplace.json#metadata');
  versions['.github/plugin/marketplace.json#plugins[0]'] =
    packageVersion(marketplace.plugins?.[0], '.github/plugin/marketplace.json#plugins[0]');
  const version = releaseTag.slice(1);
  const mismatch = Object.entries(versions).find(([, observed]) => observed !== version);
  if (mismatch) {
    throw new Error(`RELEASE_VERSION_MISMATCH: ${mismatch[0]} is ${mismatch[1]}, expected ${version}.`);
  }
  return { releaseTag, version, valid: true, paths, versions };
}

function releaseContextError(message: string): never {
  throw new Error(`RELEASE_ATTESTATION_INVALID: ${message}`);
}

/** @id CODE-M5-RELEASE-CONTEXT-001
 * @implements REQ-M5-RELEASE-003 REQ-M5-RELEASE-004
 * @design DES-M5-020 DES-M5-021
 */
export function validateReleaseContext(value: unknown): ReleaseContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return releaseContextError('release-context.json must contain an object.');
  }
  const context = value as Record<string, unknown>;
  const mode = context.mode;
  const required = mode === 'dispatch'
    ? [
      'candidateCommit',
      'evidenceCommit',
      'mode',
      'releaseTag',
      'repository',
      'schemaVersion',
      'verifiedReleaseApprovalSha256',
      'workflow',
    ]
    : [
      'candidateCommit',
      'mode',
      'releaseTag',
      'repository',
      'schemaVersion',
      'workflow',
    ];
  if (!['dispatch', 'tag-push'].includes(String(mode))
    || Object.keys(context).sort().join('\0') !== required.sort().join('\0')) {
    return releaseContextError('release context fields do not match its mode.');
  }
  if (context.schemaVersion !== 'release-context-v1') {
    return releaseContextError('unsupported release context schema.');
  }
  if (context.workflow !== '.github/workflows/release.yml') {
    return releaseContextError('release workflow identity is invalid.');
  }
  if (typeof context.repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(context.repository)) {
    return releaseContextError('repository identity is invalid.');
  }
  if (typeof context.releaseTag !== 'string' || !/^v[0-9A-Za-z][0-9A-Za-z._-]*$/.test(context.releaseTag)) {
    return releaseContextError('release tag is invalid.');
  }
  if (typeof context.candidateCommit !== 'string' || !/^[a-f0-9]{40}$/.test(context.candidateCommit)) {
    return releaseContextError('candidate commit is invalid.');
  }
  if (mode === 'dispatch'
    && (typeof context.evidenceCommit !== 'string'
      || !/^[a-f0-9]{40}$/.test(context.evidenceCommit)
      || typeof context.verifiedReleaseApprovalSha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(context.verifiedReleaseApprovalSha256))) {
    return releaseContextError('dispatch evidence binding is invalid.');
  }
  return context as unknown as ReleaseContext;
}

export function releaseContextBytes(context: ReleaseContext): Buffer {
  return canonicalBytes(validateReleaseContext(context));
}

export function releaseContextDigest(context: ReleaseContext): string {
  return sha256(releaseContextBytes(context));
}

export function releaseBundleDigest(checksumsSha256: string): string {
  if (!/^[a-f0-9]{64}$/.test(checksumsSha256)) {
    throw new Error('RELEASE_PACKAGE_DIGEST_MISMATCH: SHA256SUMS digest is invalid.');
  }
  return checksumsSha256;
}

/** @id CODE-M5-RELEASE-ATTESTATION-IDENTITY-001
 * @implements REQ-M5-RELEASE-003 REQ-M5-RELEASE-004
 * @design DES-M5-020 DES-M5-021
 */
export function validateReleaseAttestationIdentity(
  contextInput: unknown,
  attestation: ReleaseAttestationEnvelope,
  releaseContextSha256: string,
  releaseBundleSha256: string,
): void {
  const context = validateReleaseContext(contextInput);
  if (!/^[a-f0-9]{64}$/.test(releaseContextSha256)
    || !/^[a-f0-9]{64}$/.test(releaseBundleSha256)) {
    releaseContextError('attestation evidence-head digest is invalid.');
  }
  const expectedRelease = {
    mode: context.mode,
    repository: context.repository,
    candidateCommit: context.candidateCommit,
    workflow: context.workflow,
    releaseTag: context.releaseTag,
    ...(context.mode === 'dispatch' ? {
      evidenceCommit: context.evidenceCommit,
      verifiedReleaseApprovalSha256: context.verifiedReleaseApprovalSha256,
    } : {}),
  };
  const heads = attestation.evidenceHeads;
  if (!heads || typeof heads !== 'object' || Array.isArray(heads)
    || canonicalBytes(attestation.release).compare(canonicalBytes(expectedRelease)) !== 0
    || (heads as Record<string, unknown>).releaseContext !== releaseContextSha256
    || (heads as Record<string, unknown>).releaseBundle !== releaseBundleSha256) {
    releaseContextError('attestation release identity mismatch.');
  }
}

/** @id CODE-M5-RELEASE-REGISTRY-QUERY-001
 * @implements REQ-M5-RELEASE-004
 * @design DES-M5-021
 */
export function classifyNpmRegistryQuery(
  exitCode: number,
  stdout: string,
): NpmRegistryQueryClassification {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch (cause) {
    throw new Error('RELEASE_REGISTRY_QUERY_FAILED: npm registry output is not JSON.', { cause });
  }
  if (exitCode === 0) return { status: 'found', value };
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const registryError = (value as Record<string, unknown>).error;
    if (registryError && typeof registryError === 'object' && !Array.isArray(registryError)
      && (registryError as Record<string, unknown>).code === 'E404') {
      return { status: 'missing' };
    }
  }
  throw new Error('RELEASE_REGISTRY_QUERY_FAILED: npm registry query failed without explicit E404.');
}

function checksumEntries(checksums: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of checksums.split(/\r?\n/).filter(Boolean)) {
    const match = /^([a-f0-9]{64})  (?:\.\/)?([^/\r\n]+)$/.exec(line);
    if (!match || entries.has(match[2]!)) {
      throw new Error('RELEASE_ARTIFACT_CHECKSUM_MISMATCH: SHA256SUMS is malformed.');
    }
    entries.set(match[2]!, match[1]!);
  }
  return entries;
}

/** @id CODE-M5-RELEASE-ASSET-VALIDATION-001
 * @implements REQ-M5-RELEASE-004
 * @design DES-M5-021
 */
export function validateReleaseAssetManifest(
  releaseTag: string,
  assetNames: string[],
  checksums: string,
): ReleaseAssetManifestValidation {
  if (!/^v[0-9A-Za-z][0-9A-Za-z._-]*$/.test(releaseTag)) {
    throw new Error('RELEASE_VERSION_MISMATCH: release tag is invalid.');
  }
  if (new Set(assetNames).size !== assetNames.length) {
    throw new Error('RELEASE_ARTIFACT_CHECKSUM_MISMATCH: duplicate Release asset.');
  }
  const version = releaseTag.slice(1);
  const tarballs = assetNames.filter((name) => /^musubix5-[^/]+\.tgz$/.test(name));
  if (tarballs.length !== 1 || tarballs[0] !== `musubix5-${version}.tgz`) {
    throw new Error('RELEASE_VERSION_MISMATCH: exactly one version-matched package tarball is required.');
  }
  for (const required of [
    tarballs[0],
    'sbom.cdx.json',
    'release-context.json',
    'SHA256SUMS',
    'attestation.json',
  ]) {
    if (!assetNames.includes(required)) {
      throw new Error(`RELEASE_ARTIFACT_CHECKSUM_MISMATCH: missing Release asset ${required}.`);
    }
  }
  const entries = checksumEntries(checksums);
  for (const required of [tarballs[0], 'sbom.cdx.json', 'release-context.json']) {
    if (!entries.has(required)) {
      throw new Error(`RELEASE_ARTIFACT_CHECKSUM_MISMATCH: ${required} is not checksummed.`);
    }
  }
  return {
    releaseTag,
    version,
    tarball: tarballs[0]!,
    checksummed: [...entries.keys()].sort(),
  };
}

function tarString(buffer: Buffer, start: number, length: number): string {
  const end = buffer.indexOf(0, start);
  return buffer.subarray(start, end >= start && end < start + length ? end : start + length)
    .toString('utf8');
}

export function extractPackagedVersion(tarball: Uint8Array): string {
  let archive: Buffer;
  try {
    archive = gunzipSync(tarball);
  } catch {
    throw new Error('RELEASE_VERSION_MISMATCH: package tarball is not valid gzip.');
  }
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = tarString(header, 0, 100);
    const prefix = tarString(header, 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const sizeText = tarString(header, 124, 12).trim();
    const size = Number.parseInt(sizeText || '0', 8);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error('RELEASE_VERSION_MISMATCH: package tarball header is invalid.');
    }
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > archive.length) {
      throw new Error('RELEASE_VERSION_MISMATCH: package tarball is truncated.');
    }
    if (path === 'package/package.json') {
      try {
        const value = JSON.parse(archive.subarray(bodyStart, bodyEnd).toString('utf8')) as unknown;
        return packageVersion(value, 'package/package.json');
      } catch (cause) {
        if (cause instanceof Error && cause.message.startsWith('RELEASE_VERSION_MISMATCH:')) {
          throw cause;
        }
        throw new Error('RELEASE_VERSION_MISMATCH: packaged package.json is invalid.', { cause });
      }
    }
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  throw new Error('RELEASE_VERSION_MISMATCH: package/package.json is absent.');
}

export function computeTarballIntegrity(tarball: Uint8Array): string {
  return `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
}
