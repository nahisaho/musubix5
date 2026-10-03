import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import * as analysis from '../packages/analysis/src/index.js';

const digest = (character: string): string => character.repeat(64);
const ref = (path: string, character: string, size = 1) => ({
  path, sha256: digest(character), size,
});

function fixture() {
  const recovery = analysis as any;
  const plan10 = recovery.prepareRecovery10({
    controlRoot: '/workspace/control',
    gitCommonRoot: '/repository/.git',
    repositoryId: digest('a'),
    baselineHead: digest('b'),
    requirementsApproval: ref('.musubix/evidence/approvals/requirements.json', 'c', 1024),
    designApproval: ref('.musubix/evidence/approvals/design.json', 'd', 2048),
    consent: ref('files/g10-consent.json', 'e', 512),
    recoveryAuthority29: ref('files/g9-online-design-r29/recovery-authority-f3c50985-v3.json', 'f', 2048),
    abortRelease29: ref('files/g9-online-design-r29/abort-release-between-epochs-f3c50985.json', '1', 256),
    writerResume29: ref('files/g9-online-design-r29/writer-resume-between-epochs-f3c50985.json', '2', 256),
    designManifestSha256: digest('3'),
  });
  const abandonmentBase = {
    generation: 10,
    status: 'abandoned',
    reason: 'Generation 10 checkpoints followed their TDD evidence.',
    approver: 'nahisaho',
    abandonedAt: '2026-10-01T14:54:07.173Z',
  };
  const abandonment = {
    ...abandonmentBase,
    sha256: recovery.sha256(recovery.canonicalBytes(abandonmentBase)),
  };
  const context11 = {
    requirementsApproval: ref('.musubix/evidence/approvals/requirements.json', '4', 4096),
    designApproval: ref('.musubix/evidence/approvals/design.json', '5', 8192),
    requirementsManifestSha256: digest('6'),
    designManifestSha256: digest('7'),
    recoveryAuthority10: plan10.authority,
    generation10Abandonment: abandonment,
    repositoryId: digest('a'),
    controlRoot: '/workspace/control',
    gitCommonRoot: '/repository/.git',
    baselineHead: digest('8'),
    impactOrder: 3855,
  };
  const plan11 = recovery.prepareRecovery11(context11);
  const fence = recovery.acquireFence10(plan10, {
    previousCounter: null,
    campaign: null,
    pid: 101,
    startTicks: 202,
    bootId: 'boot-a',
    lockDevice: 303,
    lockInode: 404,
  });
  return { recovery, plan10, plan11, fence, context11 };
}

/** @id TEST-M5-G11-RELEASE-ONLY-011
 * @verifies REQ-M5-LIFECYCLE-006
 */
it('TEST-M5-G11-RELEASE-ONLY-011 makes every dispatch transient release-only', () => {
  const { recovery, plan10 } = fixture();
  const finals = plan10.publicationFiles.map(
    (path: string) => `${plan10.roots.preparation}/${path}`,
  );
  expect(recovery.recoverBoundary10(plan10, {
    paths: [...finals.slice(0, 10), `${finals[10]}.pending`],
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'claim-dispatched',
    action: { kind: 'release-only-verify' },
  });
  expect(recovery.recoverBoundary10(plan10, {
    paths: [...finals.slice(0, 11), `${finals[11]}.writing`],
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'claim-present-unverified',
    action: { kind: 'release-only-verify' },
  });
});

/** @id TEST-M5-G11-DURABLE-ABORT-012
 * @verifies REQ-M5-LIFECYCLE-006
 */
it('TEST-M5-G11-DURABLE-ABORT-012 seals an idempotent abort under G11 authority', async () => {
  const { recovery, plan11, fence } = fixture();
  const root = await mkdtemp(join(tmpdir(), 'musubix5-g11-abort-'));
  try {
    const authority = await recovery.materializeRecoveryAuthority11(root, plan11);
    const first = await recovery.materializeRecoveryAbort11(root, plan11, fence, authority);
    const firstBytes = await readFile(join(root, first.releasePath));
    const second = await recovery.materializeRecoveryAbort11(root, plan11, fence, authority);
    expect(second).toEqual(first);
    expect(await readFile(join(root, second.releasePath))).toEqual(firstBytes);
    expect(JSON.parse(firstBytes.toString())).toMatchObject({
      outcome: 'aborted-before-dispatch',
      authority: authority.authority,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-G11-D1-DELTA-013
 * @verifies REQ-M5-LIFECYCLE-006
 */
it('TEST-M5-G11-D1-DELTA-013 seals the exact resolved native D1 delta', () => {
  const { recovery } = fixture();
  const paths = [
    '.musubix/evidence/approvals/design.json',
    '.musubix/journal/normal/000000000123.json',
    '.musubix/evidence/order.json',
    '.musubix/evidence/changes.json',
  ];
  const delta = recovery.createD1ExpectedDelta10({
    designSourcePrecondition: ref('.musubix/features/musubix5-clean-foundation/design.md', '9', 1),
    traceIndexPrecondition: ref('.musubix/trace/index.json', 'a', 1),
    resolvedJournalPath: paths[1],
    mutations: paths.map((path, index) => ({
      path,
      writingPath: `${path}.writing`,
      beforeSha256: index === 1 ? `absent:${'0'.repeat(64)}` : digest(String(index + 1)),
      afterSha256: digest(String(index + 5)),
    })),
  });
  expect(delta).toMatchObject({
    schemaVersion: 1,
    kind: 'change0017-g10-d1-expected-delta-v1',
    resolvedJournalPath: paths[1],
  });
  expect(delta.mutations.map((entry: any) => entry.path)).toEqual(paths);
  expect(() => recovery.createD1ExpectedDelta10({
    ...delta,
    resolvedJournalPath: '.musubix/journal/normal/*.json',
  })).toThrow(/resolved|journal|wildcard/);
});

/** @id TEST-M5-G11-ACCOUNTING-LATCH-014
 * @verifies REQ-M5-LIFECYCLE-006
 */
it('TEST-M5-G11-ACCOUNTING-LATCH-014 never restores credit after a latch appears', () => {
  const { recovery, plan10 } = fixture();
  const finals = plan10.publicationFiles.map(
    (path: string) => `${plan10.roots.preparation}/${path}`,
  );
  expect(recovery.recoverBoundary10(plan10, {
    paths: [...finals.slice(0, 14), `${finals[14]}.pending`],
    releaseOutcome: 'verified-credit-eligible',
    releasePathSafe: true,
    accountingBytes: 1,
  })).toEqual({
    classification: 'released-no-credit-pending',
    action: { kind: 'resume', step: 'publish-no-credit' },
  });
  expect(recovery.recoverBoundary10(plan10, {
    paths: [...finals.slice(0, 17), `${finals[17]}.pending`],
    releaseOutcome: 'verified-credit-eligible',
    releasePathSafe: true,
    accountingBytes: 1,
  })).toEqual({
    classification: 'D1-invalidation-pending',
    action: { kind: 'resume', step: 'publish-credit-invalidation' },
  });
});

/** @id TEST-M5-G11-FENCE-VALIDATION-015
 * @verifies REQ-M5-LIFECYCLE-006
 */
it('TEST-M5-G11-FENCE-VALIDATION-015 validates the complete fence chain', () => {
  const { recovery, plan10, fence } = fixture();
  expect(recovery.verifyRecoveryFenceChain10(plan10, {
    previousCounter: null,
    counter: fence.counter,
    campaign: fence.campaign,
    holder: fence.holder,
  })).toEqual(fence);
  expect(() => recovery.verifyRecoveryFenceChain10(plan10, {
    previousCounter: null,
    counter: fence.counter,
    campaign: {
      ...fence.campaign,
      counter: { ...fence.campaign.counter, sha256: digest('f') },
    },
    holder: fence.holder,
  })).toThrow(/campaign|counter|Ref|binding/);
});

/** @id TEST-M5-G11-APPROVAL-AUTHORITY-016
 * @verifies REQ-M5-APPROVAL-007
 */
it('TEST-M5-G11-APPROVAL-AUTHORITY-016 rejects a mismatched current authority', async () => {
  const { recovery, plan11 } = fixture();
  const root = await mkdtemp(join(tmpdir(), 'musubix5-g11-authority-'));
  try {
    const materialized = await recovery.materializeRecoveryAuthority11(root, plan11);
    expect(recovery.validateRecoveryAuthority11(plan11.authority11, plan11.expected))
      .toEqual(plan11.authority11);
    expect(materialized.paths).toEqual([
      '.musubix/cache/g11-chronology-repair/recovery-authority10.json',
      '.musubix/cache/g11-chronology-repair/recovery-authority.json',
      '.musubix/cache/g11-chronology-repair/authority-seal.json',
    ]);
    expect(() => recovery.validateRecoveryAuthority11(
      { ...plan11.authority11, designManifestSha256: digest('f') },
      plan11.expected,
    )).toThrow(/design|manifest|authority/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-G11-COMPAT-PAYLOAD-017
 * @verifies REQ-M5-COMPAT-013
 */
it('TEST-M5-G11-COMPAT-PAYLOAD-017 preserves the exact G10 payload bytes', async () => {
  const { recovery, plan11 } = fixture();
  const root = await mkdtemp(join(tmpdir(), 'musubix5-g11-compat-'));
  try {
    const materialized = await recovery.materializeRecoveryAuthority11(root, plan11);
    const bytes = await readFile(join(root, materialized.paths[0]));
    expect(bytes).toEqual(recovery.canonicalBytes(plan11.authority10));
    expect(materialized.authority10.sha256).toBe(recovery.sha256(bytes));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-G11-EVIDENCE-CLOSURE-018
 * @verifies REQ-M5-EVIDENCE-007
 */
it('TEST-M5-G11-EVIDENCE-CLOSURE-018 closes authority accounting and paths', () => {
  const { recovery, plan10, plan11, fence } = fixture();
  const preparation = recovery.publishPreparation10(plan10, fence);
  const manifest10 = recovery.buildRecoveryAccountingManifest10(plan10, preparation);
  const manifest11 = recovery.buildRecoveryAccountingManifest11(manifest10);
  expect(manifest11.entries).toHaveLength(377);
  expect(manifest11).toMatchObject({
    chargedMaximumBytes: 535298048,
    hardLimitBytes: 536870912,
    unwritableMarginBytes: 1572864,
  });
  expect(manifest11.entries.filter(
    (entry: any) => entry.path.startsWith('.musubix/cache/g11-chronology-repair/'),
  )).toHaveLength(9);
  expect(plan11.paths).toEqual({
    authority10: '.musubix/cache/g11-chronology-repair/recovery-authority10.json',
    authority: '.musubix/cache/g11-chronology-repair/recovery-authority.json',
    seal: '.musubix/cache/g11-chronology-repair/authority-seal.json',
  });
});

/** @id TEST-M5-G11-GRAPH-OWNERSHIP-019
 * @verifies REQ-M5-GRAPH-003
 */
it('TEST-M5-G11-GRAPH-OWNERSHIP-019 keeps wrapper ownership acyclic', () => {
  const { recovery } = fixture();
  expect(recovery.generation11DependencyGraph()).toEqual([
    ['DES-M5-025', 'DES-M5-024'],
    ['RecoveryAuthority11', 'RecoveryAuthority10'],
    ['AuthoritySeal11', 'RecoveryAuthority11'],
  ]);
});

/** @id TEST-M5-G11-WORKTREE-BASELINE-020
 * @verifies REQ-M5-WORKTREE-004
 */
it('TEST-M5-G11-WORKTREE-BASELINE-020 binds the selected roots and baseline', () => {
  const { recovery, plan11 } = fixture();
  expect(() => recovery.validateRecoveryAuthority11(plan11.authority11, {
    ...plan11.expected,
    baselineHead: digest('f'),
  })).toThrow(/baseline|authority|binding/);
  expect(() => recovery.prepareRecovery11({
    ...plan11.context,
    controlRoot: '/workspace/control/../other',
  })).toThrow(/canonical|root|worktree/);
});
