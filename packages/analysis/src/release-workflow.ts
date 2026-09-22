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
  mode: 'tag-push' | 'dispatch';
  repository: string;
  candidateCommit: string;
  workflow: string;
  releaseTag: string;
  evidenceCommit?: string;
  verifiedReleaseApprovalSha256?: string;
}

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

export function releaseContextDigest(context: ReleaseContext): string {
  return sha256(canonicalBytes(context));
}

export function releaseBundleDigest(checksumsSha256: string): string {
  if (!/^[a-f0-9]{64}$/.test(checksumsSha256)) {
    throw new Error('RELEASE_PACKAGE_DIGEST_MISMATCH: SHA256SUMS digest is invalid.');
  }
  return checksumsSha256;
}
