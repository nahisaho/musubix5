import { isAbsolute, normalize } from 'node:path';
import { canonicalBytes, sha256 } from './canonical.js';
import {
  materializeRecoveryAbort10,
  materializeRecoveryCompletion10,
  prepareRecovery10,
  recoverCanonicalFile10,
  validateRecoveryAuthority10,
  verifyCanonicalFile10,
  verifyRecoveryAccounting10,
  type RecoveryAccountingEntry10,
  type RecoveryAccountingManifest10,
  type RecoveryAuthority10,
  type RecoveryFence10,
  type D1ExpectedDelta10,
  type RecoveryObservation10,
  type RecoveryPlan10,
  type RecoveryRef10,
} from './generation10-recovery.js';

const AUTHORITY10_PATH = '.musubix/cache/g11-chronology-repair/recovery-authority10.json';
const AUTHORITY11_PATH = '.musubix/cache/g11-chronology-repair/recovery-authority.json';
const AUTHORITY_SEAL_PATH = '.musubix/cache/g11-chronology-repair/authority-seal.json';
const SHA256 = /^[0-9a-f]{64}$/;

export interface AbandonmentIdentity10 {
  generation: 10;
  status: 'abandoned';
  reason: string;
  approver: string;
  abandonedAt: string;
  sha256: string;
}

export interface RecoveryContext11 {
  requirementsApproval: RecoveryRef10;
  designApproval: RecoveryRef10;
  requirementsManifestSha256: string;
  designManifestSha256: string;
  recoveryAuthority10: RecoveryAuthority10;
  generation10Abandonment: AbandonmentIdentity10;
  repositoryId: string;
  controlRoot: string;
  gitCommonRoot: string;
  baselineHead: string;
  impactOrder: number;
}

export interface RecoveryAuthority11 {
  schemaVersion: 1;
  kind: 'change0017-g11-recovery-authority-v1';
  changeId: 'CHANGE-0017';
  generation: 11;
  requirementsApproval: RecoveryRef10;
  designApproval: RecoveryRef10;
  requirementsManifestSha256: string;
  designManifestSha256: string;
  recoveryAuthority10: RecoveryRef10;
  generation10Abandonment: AbandonmentIdentity10;
  repositoryId: string;
  controlRoot: string;
  gitCommonRoot: string;
  baselineHead: string;
  impactOrder: number;
}

export interface RecoveryAuthority11Expected {
  requirementsApproval: RecoveryRef10;
  designApproval: RecoveryRef10;
  requirementsManifestSha256: string;
  designManifestSha256: string;
  generation10AbandonmentSha256: string;
  repositoryId: string;
  controlRoot: string;
  gitCommonRoot: string;
  baselineHead: string;
  impactOrder: number;
}

export interface AuthoritySeal11 {
  schemaVersion: 1;
  kind: 'change0017-g11-authority-seal-v1';
  authority: RecoveryRef10;
}

export interface RecoveryPlan11 {
  context: RecoveryContext11;
  authority10: RecoveryAuthority10;
  authority11: RecoveryAuthority11;
  expected: RecoveryAuthority11Expected;
  seal: AuthoritySeal11;
  payloadPlan: RecoveryPlan10;
  paths: {
    authority10: typeof AUTHORITY10_PATH;
    authority: typeof AUTHORITY11_PATH;
    seal: typeof AUTHORITY_SEAL_PATH;
  };
}

export interface RecoveryAccountingManifest11 {
  schemaVersion: 1;
  kind: 'change0017-g11-recovery-accounting-manifest-v1';
  entries: RecoveryAccountingEntry10[];
  chargedMaximumBytes: 535_298_048;
  hardLimitBytes: 536_870_912;
  unwritableMarginBytes: 1_572_864;
}

function assertClosed(value: object, fields: string[], name: string): void {
  if (Object.keys(value).sort().join(',') !== [...fields].sort().join(',')) {
    throw new Error(`${name} contains missing or additional properties.`);
  }
}

function assertSha(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new Error(`${name} must be a lowercase SHA-256.`);
  }
}

function assertRef(value: RecoveryRef10, name: string): void {
  assertClosed(value, ['path', 'sha256', 'size'], name);
  if (!value.path || value.path.startsWith('/') || value.path.includes('\\')
    || value.path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${name}.path must be repository-root-relative.`);
  }
  assertSha(value.sha256, `${name}.sha256`);
  if (!Number.isSafeInteger(value.size) || value.size < 0) {
    throw new Error(`${name}.size must be a nonnegative integer.`);
  }
}

function artifactRef(path: string, value: unknown): RecoveryRef10 {
  const bytes = canonicalBytes(value);
  return { path, sha256: sha256(bytes), size: bytes.length };
}

function abandonmentPayload(value: AbandonmentIdentity10): Omit<AbandonmentIdentity10, 'sha256'> {
  return {
    generation: value.generation,
    status: value.status,
    reason: value.reason,
    approver: value.approver,
    abandonedAt: value.abandonedAt,
  };
}

function validateAbandonment(value: AbandonmentIdentity10): void {
  assertClosed(
    value,
    ['generation', 'status', 'reason', 'approver', 'abandonedAt', 'sha256'],
    'Generation-10 abandonment',
  );
  if (value.generation !== 10 || value.status !== 'abandoned'
    || !value.reason || !value.approver || !value.abandonedAt) {
    throw new Error('Generation-10 abandonment binding is invalid.');
  }
  assertSha(value.sha256, 'Generation-10 abandonment sha256');
  if (value.sha256 !== sha256(canonicalBytes(abandonmentPayload(value)))) {
    throw new Error('Generation-10 abandonment digest does not match its canonical fields.');
  }
}

/** @id CODE-M5-G11-AUTHORITY-001
 * @implements REQ-M5-APPROVAL-007 REQ-M5-WORKTREE-004
 * @design DES-M5-025
 */
export function prepareRecovery11(context: RecoveryContext11): RecoveryPlan11 {
  assertRef(context.requirementsApproval, 'Generation-11 requirements approval');
  assertRef(context.designApproval, 'Generation-11 design approval');
  assertSha(context.requirementsManifestSha256, 'Generation-11 requirements manifest');
  assertSha(context.designManifestSha256, 'Generation-11 design manifest');
  assertSha(context.repositoryId, 'Generation-11 repositoryId');
  assertSha(context.baselineHead, 'Generation-11 baselineHead');
  if (!isAbsolute(context.controlRoot) || normalize(context.controlRoot) !== context.controlRoot
    || !isAbsolute(context.gitCommonRoot) || normalize(context.gitCommonRoot) !== context.gitCommonRoot) {
    throw new Error('Generation-11 roots must be absolute canonical worktree paths.');
  }
  if (!Number.isSafeInteger(context.impactOrder) || context.impactOrder <= 0) {
    throw new Error('Generation-11 impactOrder must be a positive integer.');
  }
  validateRecoveryAuthority10(context.recoveryAuthority10);
  validateAbandonment(context.generation10Abandonment);
  const authority10Ref = artifactRef(AUTHORITY10_PATH, context.recoveryAuthority10);
  const authority11: RecoveryAuthority11 = {
    schemaVersion: 1,
    kind: 'change0017-g11-recovery-authority-v1',
    changeId: 'CHANGE-0017',
    generation: 11,
    requirementsApproval: context.requirementsApproval,
    designApproval: context.designApproval,
    requirementsManifestSha256: context.requirementsManifestSha256,
    designManifestSha256: context.designManifestSha256,
    recoveryAuthority10: authority10Ref,
    generation10Abandonment: context.generation10Abandonment,
    repositoryId: context.repositoryId,
    controlRoot: context.controlRoot,
    gitCommonRoot: context.gitCommonRoot,
    baselineHead: context.baselineHead,
    impactOrder: context.impactOrder,
  };
  const expected: RecoveryAuthority11Expected = {
    requirementsApproval: context.requirementsApproval,
    designApproval: context.designApproval,
    requirementsManifestSha256: context.requirementsManifestSha256,
    designManifestSha256: context.designManifestSha256,
    generation10AbandonmentSha256: context.generation10Abandonment.sha256,
    repositoryId: context.repositoryId,
    controlRoot: context.controlRoot,
    gitCommonRoot: context.gitCommonRoot,
    baselineHead: context.baselineHead,
    impactOrder: context.impactOrder,
  };
  validateRecoveryAuthority11(authority11, expected);
  const authorityRef = artifactRef(AUTHORITY11_PATH, authority11);
  const seal: AuthoritySeal11 = {
    schemaVersion: 1,
    kind: 'change0017-g11-authority-seal-v1',
    authority: authorityRef,
  };
  const payloadPlan = prepareRecovery10({
    controlRoot: context.recoveryAuthority10.controlRoot,
    gitCommonRoot: context.gitCommonRoot,
    repositoryId: context.recoveryAuthority10.repositoryId,
    baselineHead: context.recoveryAuthority10.baselineHead,
    requirementsApproval: context.recoveryAuthority10.requirementsApproval,
    designApproval: context.recoveryAuthority10.designApproval,
    consent: context.recoveryAuthority10.consent,
    recoveryAuthority29: context.recoveryAuthority10.recoveryAuthority29,
    abortRelease29: context.recoveryAuthority10.abortRelease29,
    writerResume29: context.recoveryAuthority10.writerResume29,
    designManifestSha256: context.designManifestSha256,
  });
  payloadPlan.authorityRef = authority10Ref;
  return {
    context,
    authority10: context.recoveryAuthority10,
    authority11,
    expected,
    seal,
    payloadPlan,
    paths: {
      authority10: AUTHORITY10_PATH,
      authority: AUTHORITY11_PATH,
      seal: AUTHORITY_SEAL_PATH,
    },
  };
}

/** @id CODE-M5-G11-AUTHORITY-VALIDATE-001
 * @implements REQ-M5-APPROVAL-007 REQ-M5-EVIDENCE-007 REQ-M5-WORKTREE-004
 * @design DES-M5-025
 */
export function validateRecoveryAuthority11(
  authority: RecoveryAuthority11,
  expected: RecoveryAuthority11Expected,
): RecoveryAuthority11 {
  assertClosed(authority, [
    'schemaVersion',
    'kind',
    'changeId',
    'generation',
    'requirementsApproval',
    'designApproval',
    'requirementsManifestSha256',
    'designManifestSha256',
    'recoveryAuthority10',
    'generation10Abandonment',
    'repositoryId',
    'controlRoot',
    'gitCommonRoot',
    'baselineHead',
    'impactOrder',
  ], 'RecoveryAuthority11');
  if (authority.schemaVersion !== 1
    || authority.kind !== 'change0017-g11-recovery-authority-v1'
    || authority.changeId !== 'CHANGE-0017'
    || authority.generation !== 11) {
    throw new Error('RecoveryAuthority11 schema or generation is invalid.');
  }
  assertRef(authority.requirementsApproval, 'RecoveryAuthority11 requirements approval');
  assertRef(authority.designApproval, 'RecoveryAuthority11 design approval');
  assertRef(authority.recoveryAuthority10, 'RecoveryAuthority11 RecoveryAuthority10');
  if (authority.recoveryAuthority10.path !== AUTHORITY10_PATH) {
    throw new Error('RecoveryAuthority11 must bind the repository custody RecoveryAuthority10 path.');
  }
  assertSha(authority.requirementsManifestSha256, 'RecoveryAuthority11 requirements manifest');
  assertSha(authority.designManifestSha256, 'RecoveryAuthority11 design manifest');
  assertSha(authority.repositoryId, 'RecoveryAuthority11 repositoryId');
  assertSha(authority.baselineHead, 'RecoveryAuthority11 baselineHead');
  validateAbandonment(authority.generation10Abandonment);
  if (!isAbsolute(authority.controlRoot) || normalize(authority.controlRoot) !== authority.controlRoot
    || !isAbsolute(authority.gitCommonRoot) || normalize(authority.gitCommonRoot) !== authority.gitCommonRoot
    || !Number.isSafeInteger(authority.impactOrder) || authority.impactOrder <= 0) {
    throw new Error('RecoveryAuthority11 worktree roots or impact order are invalid.');
  }
  const actualExpected: RecoveryAuthority11Expected = {
    requirementsApproval: authority.requirementsApproval,
    designApproval: authority.designApproval,
    requirementsManifestSha256: authority.requirementsManifestSha256,
    designManifestSha256: authority.designManifestSha256,
    generation10AbandonmentSha256: authority.generation10Abandonment.sha256,
    repositoryId: authority.repositoryId,
    controlRoot: authority.controlRoot,
    gitCommonRoot: authority.gitCommonRoot,
    baselineHead: authority.baselineHead,
    impactOrder: authority.impactOrder,
  };
  if (!canonicalBytes(actualExpected).equals(canonicalBytes(expected))) {
    throw new Error('RecoveryAuthority11 current authority, approval, abandonment, baseline or worktree binding differs.');
  }
  return authority;
}

/** @id CODE-M5-G11-SEAL-VALIDATE-001
 * @implements REQ-M5-APPROVAL-007 REQ-M5-EVIDENCE-007
 * @design DES-M5-025
 */
export function validateAuthoritySeal11(
  seal: AuthoritySeal11,
  authority: RecoveryAuthority11,
): AuthoritySeal11 {
  assertClosed(seal, ['schemaVersion', 'kind', 'authority'], 'AuthoritySeal11');
  if (seal.schemaVersion !== 1 || seal.kind !== 'change0017-g11-authority-seal-v1') {
    throw new Error('AuthoritySeal11 schema is invalid.');
  }
  assertRef(seal.authority, 'AuthoritySeal11 authority');
  const expected = artifactRef(AUTHORITY11_PATH, authority);
  if (!canonicalBytes(seal.authority).equals(canonicalBytes(expected))) {
    throw new Error('AuthoritySeal11 does not bind the exact RecoveryAuthority11.');
  }
  return seal;
}

/** @id CODE-M5-G11-AUTHORITY-MATERIALIZE-001
 * @implements REQ-M5-APPROVAL-007 REQ-M5-COMPAT-013 REQ-M5-EVIDENCE-007 REQ-M5-WORKTREE-004
 * @design DES-M5-025
 */
export async function materializeRecoveryAuthority11(
  root: string,
  plan: RecoveryPlan11,
): Promise<{
  paths: [typeof AUTHORITY10_PATH, typeof AUTHORITY11_PATH, typeof AUTHORITY_SEAL_PATH];
  authority10: RecoveryRef10;
  authority: RecoveryRef10;
  seal: AuthoritySeal11;
}> {
  validateRecoveryAuthority10(plan.authority10);
  validateRecoveryAuthority11(plan.authority11, plan.expected);
  validateAuthoritySeal11(plan.seal, plan.authority11);
  await recoverCanonicalFile10(root, AUTHORITY10_PATH, plan.authority10);
  const authority10 = artifactRef(AUTHORITY10_PATH, plan.authority10);
  if (!canonicalBytes(authority10).equals(canonicalBytes(plan.authority11.recoveryAuthority10))) {
    throw new Error('RecoveryAuthority11 does not bind the materialized RecoveryAuthority10 copy.');
  }
  await recoverCanonicalFile10(root, AUTHORITY11_PATH, plan.authority11);
  const authority = artifactRef(AUTHORITY11_PATH, plan.authority11);
  if (!canonicalBytes(authority).equals(canonicalBytes(plan.seal.authority))) {
    throw new Error('AuthoritySeal11 does not bind the materialized RecoveryAuthority11.');
  }
  await recoverCanonicalFile10(root, AUTHORITY_SEAL_PATH, plan.seal);
  return {
    paths: [AUTHORITY10_PATH, AUTHORITY11_PATH, AUTHORITY_SEAL_PATH],
    authority10,
    authority,
    seal: plan.seal,
  };
}

/** @id CODE-M5-G11-DURABLE-ABORT-001
 * @implements REQ-M5-LIFECYCLE-006
 * @design DES-M5-025
 */
export async function materializeRecoveryAbort11(
  root: string,
  plan: RecoveryPlan11,
  fence: RecoveryFence10,
  materialized: { authority: RecoveryRef10; seal: AuthoritySeal11 },
): Promise<{ releasePath: string; paths: string[]; sha256: string[] }> {
  if (!canonicalBytes(materialized.authority).equals(canonicalBytes(plan.seal.authority))
    || !canonicalBytes(materialized.seal).equals(canonicalBytes(plan.seal))) {
    throw new Error('Generation-11 abort requires the exact authority and seal.');
  }
  validateRecoveryAuthority11(plan.authority11, plan.expected);
  validateAuthoritySeal11(materialized.seal, plan.authority11);
  await verifyCanonicalFile10(root, AUTHORITY10_PATH, plan.authority10);
  await verifyCanonicalFile10(root, AUTHORITY11_PATH, plan.authority11);
  await verifyCanonicalFile10(root, AUTHORITY_SEAL_PATH, plan.seal);
  const result = await materializeRecoveryAbort10(
    root,
    plan.payloadPlan,
    fence,
    materialized.authority,
  );
  return { releasePath: 'control/release.json', ...result };
}

/** @id CODE-M5-G11-COMPLETION-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-EVIDENCE-007
 * @design DES-M5-025
 */
export async function materializeRecoveryCompletion11(
  root: string,
  plan: RecoveryPlan11,
  fence: RecoveryFence10,
  materialized: { authority: RecoveryRef10; seal: AuthoritySeal11 },
  observation: RecoveryObservation10 & { accountingBytes: number },
  expectedDelta?: D1ExpectedDelta10,
): ReturnType<typeof materializeRecoveryCompletion10> {
  validateRecoveryAuthority11(plan.authority11, plan.expected);
  validateAuthoritySeal11(materialized.seal, plan.authority11);
  await verifyCanonicalFile10(root, AUTHORITY10_PATH, plan.authority10);
  await verifyCanonicalFile10(root, AUTHORITY11_PATH, plan.authority11);
  await verifyCanonicalFile10(root, AUTHORITY_SEAL_PATH, plan.seal);
  let outcome: 'credit' | 'no-credit' | 'invalidated';
  if (observation.classification === 'claim-verified'
    && observation.accountingBytes <= 536_870_912) {
    if (!expectedDelta) {
      throw new Error('Generation-11 credit completion requires a presealed D1 expected delta.');
    }
    outcome = 'credit';
  } else if (observation.classification === 'D1-invalidation-pending') {
    if (!expectedDelta) {
      throw new Error('Generation-11 invalidation completion requires the sealed D1 expected delta.');
    }
    outcome = 'invalidated';
  } else {
    outcome = 'no-credit';
  }
  return materializeRecoveryCompletion10(
    root,
    plan.payloadPlan,
    fence,
    outcome,
    expectedDelta,
  );
}

/** @id CODE-M5-G11-ACCOUNTING-001
 * @implements REQ-M5-EVIDENCE-007 REQ-M5-LIFECYCLE-006
 * @design DES-M5-025
 */
export function buildRecoveryAccountingManifest11(
  manifest10: RecoveryAccountingManifest10,
): RecoveryAccountingManifest11 {
  verifyRecoveryAccounting10(manifest10);
  const finalPaths = [AUTHORITY10_PATH, AUTHORITY11_PATH, AUTHORITY_SEAL_PATH];
  const additions: RecoveryAccountingEntry10[] = finalPaths.flatMap((path) => (
    [path, `${path}.writing`, `${path}.pending`].map((member) => ({
      path: member,
      owner: 'post' as const,
      mode: '100644' as const,
      maximumBytes: 131_072,
    }))
  ));
  const entries = [...manifest10.entries, ...additions]
    .sort((left, right) => Buffer.from(left.path.normalize('NFC')).compare(
      Buffer.from(right.path.normalize('NFC')),
    ));
  if (new Set(entries.map((entry) => entry.path)).size !== 377) {
    throw new Error('Generation-11 accounting paths must be unique.');
  }
  const manifest: RecoveryAccountingManifest11 = {
    schemaVersion: 1,
    kind: 'change0017-g11-recovery-accounting-manifest-v1',
    entries,
    chargedMaximumBytes: 535_298_048,
    hardLimitBytes: 536_870_912,
    unwritableMarginBytes: 1_572_864,
  };
  verifyRecoveryAccountingManifest11(manifest);
  return manifest;
}

/** @id CODE-M5-G11-ACCOUNTING-VERIFY-001
 * @implements REQ-M5-EVIDENCE-007 REQ-M5-LIFECYCLE-006
 * @design DES-M5-025
 */
export function verifyRecoveryAccountingManifest11(
  manifest: RecoveryAccountingManifest11,
): RecoveryAccountingManifest11 {
  assertClosed(manifest, [
    'schemaVersion',
    'kind',
    'entries',
    'chargedMaximumBytes',
    'hardLimitBytes',
    'unwritableMarginBytes',
  ], 'RecoveryAccountingManifest11');
  if (manifest.schemaVersion !== 1
    || manifest.kind !== 'change0017-g11-recovery-accounting-manifest-v1'
    || !Array.isArray(manifest.entries)
    || manifest.entries.length !== 377) {
    throw new Error('RecoveryAccountingManifest11 schema or entry count is invalid.');
  }
  const paths = new Set<string>();
  let entryMaximum = 0;
  for (const entry of manifest.entries) {
    if (!entry.path || paths.has(entry.path)
      || !Number.isSafeInteger(entry.maximumBytes) || entry.maximumBytes < 0) {
      throw new Error('RecoveryAccountingManifest11 entries must be unique and nonnegative.');
    }
    paths.add(entry.path);
    entryMaximum += entry.maximumBytes;
  }
  const requiredMembers = [AUTHORITY10_PATH, AUTHORITY11_PATH, AUTHORITY_SEAL_PATH]
    .flatMap((path) => [path, `${path}.writing`, `${path}.pending`]);
  for (const path of requiredMembers) {
    const entry = manifest.entries.find((candidate) => candidate.path === path);
    if (!entry || entry.owner !== 'post' || entry.mode !== '100644'
      || entry.maximumBytes !== 131_072) {
      throw new Error(`RecoveryAccountingManifest11 custody entry is invalid: ${path}.`);
    }
  }
  const chargedMaximumBytes = entryMaximum + 6_291_456;
  if (chargedMaximumBytes !== manifest.chargedMaximumBytes
    || manifest.chargedMaximumBytes !== 535_298_048
    || manifest.hardLimitBytes !== 536_870_912
    || manifest.unwritableMarginBytes !== manifest.hardLimitBytes - chargedMaximumBytes) {
    throw new Error('RecoveryAccountingManifest11 totals do not match its entries.');
  }
  return manifest;
}

/** @id CODE-M5-G11-GRAPH-001
 * @implements REQ-M5-GRAPH-003
 * @design DES-M5-025
 */
export function generation11DependencyGraph(): Array<[string, string]> {
  return [
    ['DES-M5-025', 'DES-M5-024'],
    ['RecoveryAuthority11', 'RecoveryAuthority10'],
    ['AuthoritySeal11', 'RecoveryAuthority11'],
  ];
}
