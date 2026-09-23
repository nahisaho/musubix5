import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { canonicalBytes, sha256 } from './canonical.js';
import { files, readText, safePath } from './files.js';
import { resolveNpmInvocation } from './process.js';

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

export interface ReleaseDocumentation {
  readme: string;
  readmeJa: string;
  changelog: string;
}

export interface ReleaseDocumentationValidation {
  valid: true;
  version: string;
}

export interface PackagedReleasePackage {
  version: string;
  documents: ReleaseDocumentation;
}

export interface ReleaseAttestationEnvelope {
  release?: unknown;
  evidenceHeads?: unknown;
}

export type NpmRegistryQueryClassification =
  | { status: 'missing' }
  | { status: 'found'; value: unknown };

export type ReleaseTargetLookupClassification =
  | 'absent'
  | 'present-stable'
  | 'present-draft-or-prerelease'
  | 'lookup-failed';

export interface ReleaseTargetLookupInput {
  expectedTag?: string;
  exact: {
    exitCode: number;
    statusCode?: number;
    release?: {
      tagName: string;
      draft: boolean;
      prerelease: boolean;
    };
  };
  enumeration?: {
    complete: boolean;
    releases: Array<{
      tagName: string;
      draft: boolean;
      prerelease: boolean;
    }>;
  };
}

/** @id CODE-M5-RELEASE-TARGET-HTTP-001
 * @implements REQ-M5-RELEASE-003 REQ-M5-RELEASE-004
 * @design DES-M5-020 DES-M5-021
 */
export function parseReleaseTargetApiResponse(
  text: string,
): { statusCode: number; body: unknown } {
  const matches = [...text.matchAll(/^HTTP\/\S+\s+(\d{3})[^\r\n]*(?:\r?\n)/gm)];
  const last = matches.at(-1);
  if (!last || last.index === undefined) {
    throw new Error('RELEASE_TARGET_LOOKUP_FAILED: GitHub API status is missing.');
  }
  const headersStart = last.index + last[0].length;
  const separator = text.slice(headersStart).match(/\r?\n\r?\n/);
  if (!separator || separator.index === undefined) {
    throw new Error('RELEASE_TARGET_LOOKUP_FAILED: GitHub API headers are incomplete.');
  }
  const bodyStart = headersStart + separator.index + separator[0].length;
  try {
    return {
      statusCode: Number(last[1]),
      body: JSON.parse(text.slice(bodyStart)),
    };
  } catch {
    throw new Error('RELEASE_TARGET_LOOKUP_FAILED: GitHub API body is not JSON.');
  }
}

/** @id CODE-M5-RELEASE-TARGET-LOOKUP-001
 * @implements REQ-M5-RELEASE-003 REQ-M5-RELEASE-004 REQ-M5-REL020-002
 * @design DES-M5-020 DES-M5-021 DES-M5-REL020-002
 */
export function classifyReleaseTargetLookup(
  input: ReleaseTargetLookupInput,
): ReleaseTargetLookupClassification {
  const expectedTag = input.expectedTag;
  const classifyRelease = (
    release: ReleaseTargetLookupInput['exact']['release'],
  ): ReleaseTargetLookupClassification => {
    if (
      !release
      || typeof release.tagName !== 'string'
      || release.tagName.length === 0
      || typeof release.draft !== 'boolean'
      || typeof release.prerelease !== 'boolean'
      || (expectedTag !== undefined && release.tagName !== expectedTag)
    ) {
      return 'lookup-failed';
    }
    return release.draft || release.prerelease
      ? 'present-draft-or-prerelease'
      : 'present-stable';
  };

  if (input.exact.exitCode === 0 && input.exact.statusCode === 200) {
    return classifyRelease(input.exact.release);
  }
  if (input.exact.statusCode !== 404 || input.exact.exitCode === 0) {
    return 'lookup-failed';
  }
  if (!input.enumeration) return 'absent';
  if (!input.enumeration.complete) return 'lookup-failed';
  const releases = expectedTag === undefined
    ? input.enumeration.releases
    : input.enumeration.releases.filter(
      (release) => release.tagName === expectedTag,
    );
  if (releases.length === 0) return 'absent';
  if (releases.some(
    (release) => classifyRelease(release) === 'lookup-failed',
  )) {
    return 'lookup-failed';
  }
  const stable = releases.find(
    (release) => !release.draft && !release.prerelease,
  );
  return classifyRelease(stable ?? releases[0]);
}

/** @id CODE-M5-RELEASE-CREATION-TARGET-001
 * @implements REQ-M5-RELEASE-003
 * @design DES-M5-020
 */
export function classifyReleaseCreationTargetLookup(
  input: ReleaseTargetLookupInput,
): ReleaseTargetLookupClassification {
  if (!input.enumeration) return 'lookup-failed';
  return classifyReleaseTargetLookup(input);
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

/** @id CODE-M5-NPM-PUBLISH-POLICY-001
 * @implements REQ-M5-RELEASE-004 REQ-M5-REL020-003
 * @design DES-M5-021 DES-M5-REL020-003
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

/** @id CODE-M5-NPM-CLI-INVOCATION-001
 * @implements REQ-M5-RELEASE-004
 * @design DES-M5-021
 */
export function npmCliInvocation(
  npmExecPath: string | undefined,
  platform: NodeJS.Platform = process.platform,
  nodeExecutable = process.execPath,
): { command: string; args: string[] } {
  if (!npmExecPath) {
    return resolveNpmInvocation([], platform, nodeExecutable);
  }
  if (!/\.(?:[cm]?js)$/i.test(npmExecPath)) {
    throw new Error(
      'RELEASE_OPERATION_NOT_AUTHORIZED: npm CLI path is not a JavaScript entrypoint.',
    );
  }
  return {
    command: nodeExecutable,
    args: [npmExecPath],
  };
}

function packageVersion(value: unknown, path: string): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof (value as Record<string, unknown>).version !== 'string') {
    throw new Error(`RELEASE_VERSION_MISMATCH: ${path} has no string version.`);
  }
  return (value as { version: string }).version;
}

function releaseVersionError(message: string): never {
  throw new Error(`RELEASE_VERSION_MISMATCH: ${message}`);
}

function normalizedDocument(value: string): string {
  return value.replace(/\r\n?|\u2028|\u2029/g, '\n').normalize('NFC');
}

function readmeSurfaces(
  value: string,
  sectionHeading: string,
  path: string,
): { preamble: string; paragraph: string } {
  const lines = normalizedDocument(value).split('\n');
  const titleIndexes = lines.flatMap((line, index) => line === '# musubix5' ? [index] : []);
  if (titleIndexes.length !== 1) releaseVersionError(`${path} must contain one # musubix5 title.`);
  const titleIndex = titleIndexes[0]!;
  const nextHeading = lines.findIndex((line, index) => index > titleIndex && line.startsWith('## '));
  const preamble = lines.slice(titleIndex + 1, nextHeading < 0 ? lines.length : nextHeading)
    .find((line) => line.startsWith('**'));
  const sectionIndex = lines.findIndex((line) => line === sectionHeading);
  if (!preamble || sectionIndex < 0) releaseVersionError(`${path} release locator is absent.`);
  let paragraphStart = sectionIndex + 1;
  while (paragraphStart < lines.length && lines[paragraphStart] === '') paragraphStart += 1;
  let paragraphEnd = paragraphStart;
  while (paragraphEnd < lines.length && lines[paragraphEnd] !== '') paragraphEnd += 1;
  if (paragraphEnd === paragraphStart) releaseVersionError(`${path} release paragraph is absent.`);
  return {
    preamble,
    paragraph: lines.slice(paragraphStart, paragraphEnd).join(' ').replace(/ +/g, ' '),
  };
}

function rejectTransientQualifier(values: string[]): void {
  const tokens = new Set(['unreleased', 'candidate', 'prerelease', 'rc', 'beta', 'alpha']);
  for (const value of values) {
    const folded = value.replace(/[A-Z]/g, (character) => character.toLowerCase());
    const observed = folded.split(/[^a-z0-9]+/).filter(Boolean);
    if (observed.some((token) => tokens.has(token))
      || folded.includes('pre-release')
      || value.includes('未リリース')) {
      releaseVersionError('release documentation contains a transient qualifier.');
    }
  }
}

function validateChangelog(value: string, version: string): void {
  const lines = normalizedDocument(value).split('\n');
  const headings: string[] = [];
  let fenced = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && line.startsWith('## ')) headings.push(line);
  }
  if (fenced) releaseVersionError('CHANGELOG.md contains an unterminated fence.');
  if (headings[0] !== `## ${version}`) {
    releaseVersionError(`CHANGELOG.md first version heading must be ## ${version}.`);
  }
  if (headings.some((heading) =>
    heading.slice(3).trim().toLowerCase().includes('unreleased')
    || heading.includes('未リリース'))) {
    releaseVersionError('CHANGELOG.md contains an unreleased heading.');
  }
}

/** @id CODE-M5-RELEASE-DOCUMENTATION-001
 * @implements REQ-M5-RELEASE-003
 * @design DES-M5-020
 */
export function validateReleaseDocumentation(
  documents: ReleaseDocumentation,
  version: string,
): ReleaseDocumentationValidation {
  const english = readmeSurfaces(documents.readme, '## Upgrade', 'README.md');
  const japanese = readmeSurfaces(documents.readmeJa, '## アップグレード', 'README-ja.md');
  if (!english.preamble.startsWith(`**${version} ·`)
    || !english.paragraph.startsWith(`The \`upgrade\` command is included in musubix5 ${version}.`)
    || !japanese.preamble.startsWith(`**${version} ·`)
    || !japanese.paragraph.startsWith(`\`upgrade\` commandはmusubix5 ${version}に含まれます。`)) {
    releaseVersionError('README release version surface does not match the release tag.');
  }
  const englishSuffix = english.paragraph.slice(
    `The \`upgrade\` command is included in musubix5 ${version}.`.length,
  );
  if (englishSuffix !== '' && !englishSuffix.startsWith(' ')) {
    releaseVersionError('README.md upgrade sentence boundary is invalid.');
  }
  rejectTransientQualifier([
    english.preamble,
    english.paragraph,
    japanese.preamble,
    japanese.paragraph,
  ]);
  validateChangelog(documents.changelog, version);
  return { valid: true, version };
}

export async function readReleaseDocumentation(root: string): Promise<ReleaseDocumentation> {
  async function strict(path: string): Promise<string> {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(
        await readFile(await safePath(root, path)),
      );
    } catch (cause) {
      throw new Error(`RELEASE_VERSION_MISMATCH: ${path} is absent, unreadable, or not UTF-8.`, {
        cause,
      });
    }
  }
  return {
    readme: await strict('README.md'),
    readmeJa: await strict('README-ja.md'),
    changelog: await strict('CHANGELOG.md'),
  };
}

/** @id CODE-M5-RELEASE-WORKFLOW-001
 * @implements REQ-M5-RELEASE-003 REQ-M5-REL020-001 REQ-M5-REL020-002
 * @design DES-M5-020 DES-M5-REL020-001 DES-M5-REL020-002
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
  validateReleaseDocumentation(await readReleaseDocumentation(root), version);
  return { releaseTag, version, valid: true, paths, versions };
}

function releaseContextError(message: string): never {
  throw new Error(`RELEASE_ATTESTATION_INVALID: context-schema: ${message}`);
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
  if (typeof context.repository !== 'string' || !/^repository:[a-f0-9]{64}$/.test(context.repository)) {
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
 * @implements REQ-M5-RELEASE-004 REQ-M5-REL020-003
 * @design DES-M5-021 DES-M5-REL020-003
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

function tarOctal(buffer: Buffer, start: number, length: number, field: string): number {
  const encoded = buffer.subarray(start, start + length).toString('ascii');
  if (!/^ *[0-7]+[\0 ]*$/.test(encoded)) {
    throw new Error(`RELEASE_VERSION_MISMATCH: package tarball ${field} is invalid.`);
  }
  const digits = encoded.match(/[0-7]+/)![0];
  const value = Number.parseInt(digits, 8);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`RELEASE_VERSION_MISMATCH: package tarball ${field} is invalid.`);
  }
  return value;
}

function validateTarHeaderChecksum(header: Buffer): void {
  const expected = tarOctal(header, 148, 8, 'checksum');
  let observed = 0;
  for (let index = 0; index < header.length; index += 1) {
    observed += index >= 148 && index < 156 ? 32 : header[index]!;
  }
  if (observed !== expected) {
    throw new Error('RELEASE_VERSION_MISMATCH: package tarball checksum is invalid.');
  }
}

const MAX_TARBALL_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_SELECTED_ENTRY_BYTES = 8 * 1024 * 1024;
const packagedTargets = new Set([
  'package/package.json',
  'package/README.md',
  'package/README-ja.md',
  'package/CHANGELOG.md',
]);

/** @id CODE-M5-PACKAGED-RELEASE-DOCUMENTATION-001
 * @implements REQ-M5-RELEASE-004
 * @design DES-M5-021
 */
export function extractPackagedReleasePackage(
  tarball: Uint8Array,
): PackagedReleasePackage {
  let archive: Buffer;
  try {
    archive = gunzipSync(tarball, { maxOutputLength: MAX_TARBALL_OUTPUT_BYTES });
  } catch (cause) {
    throw new Error('RELEASE_VERSION_MISMATCH: package tarball gzip expansion is invalid or too large.', {
      cause,
    });
  }
  const selected = new Map<string, Buffer>();
  let terminated = false;
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      terminated = true;
      break;
    }
    validateTarHeaderChecksum(header);
    const name = tarString(header, 0, 100);
    const prefix = tarString(header, 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const typeflag = header[156]!;
    const size = tarOctal(header, 124, 12, 'size');
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > archive.length) {
      throw new Error('RELEASE_VERSION_MISMATCH: package tarball is truncated.');
    }
    if ([...'xgLK'].some((value) => typeflag === value.charCodeAt(0))) {
      throw new Error('RELEASE_VERSION_MISMATCH: package tarball aliases are not allowed.');
    }
    if (path.startsWith('./') && packagedTargets.has(path.slice(2))) {
      throw new Error('RELEASE_VERSION_MISMATCH: package tarball target alias is not allowed.');
    }
    if (packagedTargets.has(path)) {
      if (typeflag !== 0 && typeflag !== '0'.charCodeAt(0)) {
        throw new Error(`RELEASE_VERSION_MISMATCH: ${path} is not a regular file.`);
      }
      if (size > MAX_SELECTED_ENTRY_BYTES) {
        throw new Error(`RELEASE_VERSION_MISMATCH: ${path} exceeds the entry size limit.`);
      }
      if (selected.has(path)) {
        throw new Error(`RELEASE_VERSION_MISMATCH: duplicate package entry ${path}.`);
      }
      selected.set(path, archive.subarray(bodyStart, bodyEnd));
    }
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  if (!terminated) {
    throw new Error('RELEASE_VERSION_MISMATCH: package tarball has no terminal zero block.');
  }
  for (const target of packagedTargets) {
    if (!selected.has(target)) {
      throw new Error(`RELEASE_VERSION_MISMATCH: ${target} is absent.`);
    }
  }
  let version: string;
  try {
    const manifestText = new TextDecoder('utf-8', { fatal: true })
      .decode(selected.get('package/package.json')!);
    version = packageVersion(JSON.parse(manifestText) as unknown, 'package/package.json');
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('RELEASE_VERSION_MISMATCH:')) {
      throw cause;
    }
    throw new Error('RELEASE_VERSION_MISMATCH: packaged package.json is invalid.', { cause });
  }
  function document(path: string): string {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(selected.get(path)!);
    } catch (cause) {
      throw new Error(`RELEASE_VERSION_MISMATCH: ${path} is not UTF-8.`, { cause });
    }
  }
  const documents = {
    readme: document('package/README.md'),
    readmeJa: document('package/README-ja.md'),
    changelog: document('package/CHANGELOG.md'),
  };
  validateReleaseDocumentation(documents, version);
  return { version, documents };
}

export function extractPackagedVersion(tarball: Uint8Array): string {
  return extractPackagedReleasePackage(tarball).version;
}

export function computeTarballIntegrity(tarball: Uint8Array): string {
  return `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
}
