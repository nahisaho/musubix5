import { expect, it } from 'vitest';
import * as analysis from '../packages/analysis/src/index.js';

const digest = (character: string): string => character.repeat(64);
const ref = (path: string, character: string, size = 1) => ({
  path, sha256: digest(character), size,
});

interface RecoveryApi {
  prepareRecovery10(context: Record<string, unknown>): {
    roots: { control: string; fence: string; preparation: string };
    authority: Record<string, unknown>;
    publicationFiles: string[];
    accounting: { chargedMaximumBytes: number; hardLimitBytes: number; unwritableMarginBytes: number };
  };
  acquireFence10(plan: Record<string, unknown>, input: Record<string, unknown>): {
    campaignFence: number;
    holderFence: number;
    counter: Record<string, unknown>;
    campaign: Record<string, unknown>;
    holder: Record<string, unknown>;
  };
  publishPreparation10(plan: Record<string, unknown>, fence: Record<string, unknown>): {
    attemptLedgerGenesis: Record<string, unknown>;
    ownerLedgerGenesis: Record<string, unknown>;
    reservation: Record<string, unknown>;
    slots: unknown[];
  };
  publishClaim10(
    plan: Record<string, unknown>,
    preparation: Record<string, unknown>,
    fence: Record<string, unknown>,
  ): {
    claim: Record<string, unknown>;
    journal: Record<string, unknown>;
    claimPath: string;
    journalPath: string;
  };
  recoverBoundary10(plan: Record<string, unknown>, state: Record<string, unknown>): {
    classification: string;
    action: { kind: string; step?: string };
  };
  publishRelease10(plan: Record<string, unknown>, observation: Record<string, unknown>): {
    outcome: string;
  };
  publishD1Admission10(plan: Record<string, unknown>, release: Record<string, unknown>): {
    outcome: string;
  };
}

/** @id TEST-M5-G10-RECOVERY-001
 * @verifies REQ-M5-APPROVAL-007 REQ-M5-COMPAT-013 REQ-M5-EVIDENCE-007 REQ-M5-GRAPH-003 REQ-M5-LIFECYCLE-006 REQ-M5-WORKTREE-004
 */
it('TEST-M5-G10-RECOVERY-001 enforces generation-bound recovery authority, fencing, accounting and replay', () => {
  const recovery = analysis as unknown as RecoveryApi;
  const context = {
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
  };
  const plan = recovery.prepareRecovery10(context);
  expect(plan.roots).toEqual({
    control: '/workspace/control',
    fence: '/repository/.git/musubix5/g10-recovery-v1/campaigns/'
      + '604514880a44924d56a8f0f3177a62540de526f7101b356271be67fc33977af9/fence',
    preparation: '.musubix/cache/g10-recovery-v1/campaigns/'
      + '604514880a44924d56a8f0f3177a62540de526f7101b356271be67fc33977af9/p/'
      + 'fe27129bcb82de2245c321e2a8af1e01704a87101fb6013e497881b4c77cd690',
  });
  expect(plan.authority).toMatchObject({
    schemaVersion: 1,
    kind: 'change0017-g10-recovery-authority-v1',
    changeId: 'CHANGE-0017',
    generation: 10,
    gapKey: '604514880a44924d56a8f0f3177a62540de526f7101b356271be67fc33977af9',
    authorityKey: '9dc882e33a5b453757c4b3a5ca16593aac43fc8375cde648c74e8e50553c482b',
    pId: 'fe27129bcb82de2245c321e2a8af1e01704a87101fb6013e497881b4c77cd690',
  });
  expect(plan.publicationFiles).toHaveLength(18);
  expect(plan.accounting).toEqual({
    chargedMaximumBytes: 534118400,
    hardLimitBytes: 536870912,
    unwritableMarginBytes: 2752512,
  });

  const firstFence = recovery.acquireFence10(plan, {
    previousCounter: null,
    campaign: null,
    pid: 101,
    startTicks: 202,
    bootId: 'boot-a',
    lockDevice: 303,
    lockInode: 404,
  });
  expect(firstFence).toMatchObject({ campaignFence: 1, holderFence: 1 });
  expect(firstFence.counter).toMatchObject({ sequence: 1, previousSha256: null });
  const restartedFence = recovery.acquireFence10(plan, {
    previousCounter: firstFence.counter,
    campaign: firstFence.campaign,
    pid: 102,
    startTicks: 203,
    bootId: 'boot-a',
    lockDevice: 303,
    lockInode: 404,
  });
  expect(restartedFence).toMatchObject({ campaignFence: 1, holderFence: 2 });
  expect(restartedFence.counter).toMatchObject({ sequence: 2 });

  const preparation = recovery.publishPreparation10(plan, firstFence);
  expect(preparation.attemptLedgerGenesis).toMatchObject({
    kind: 'change0017-g10-attempt-ledger-genesis-v1',
    entries: [],
    previousSha256: null,
  });
  expect(preparation.ownerLedgerGenesis).toMatchObject({
    kind: 'change0017-g10-owner-ledger-genesis-v1',
    owners: [],
    previousSha256: null,
  });
  expect(preparation.reservation).toMatchObject({
    kind: 'change0017-g10-preparation-reservation-v5',
    slotCount: 266,
    maximumBytes: 287178752,
    sharedMaximumBytes: 25165824,
    allocatedMaximumBytes: 286654464,
  });
  expect(preparation.slots).toHaveLength(266);

  const publication = recovery.publishClaim10(plan, preparation, firstFence);
  expect(publication.claim).toMatchObject({
    kind: 'change0017-g10-campaign-claim-v1',
    generation: 10,
    lockFence: 1,
  });
  expect(publication.journal).toMatchObject({
    kind: 'change0017-g10-claim-journal-v1',
    sequence: 1,
    previousSha256: null,
  });
  expect(publication.claimPath).toMatch(/registry\/claim\.json$/);
  expect(publication.journalPath).toMatch(/registry\/journal\/000000000001\.json$/);

  expect(recovery.recoverBoundary10(plan, { paths: [], accountingBytes: 534118400 })).toEqual({
    classification: 'pristine',
    action: { kind: 'resume', step: 'publish-codec' },
  });
  const duplicateTransient = [
    `${plan.roots.preparation}/preparation/codec.json.writing`,
    `${plan.roots.preparation}/preparation/codec.json.pending`,
  ];
  expect(recovery.recoverBoundary10(plan, {
    paths: duplicateTransient,
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'unclassified',
    action: { kind: 'terminal-no-credit-stop' },
  });
  const throughDispatch = plan.publicationFiles.slice(0, 11)
    .map((path) => `${plan.roots.preparation}/${path}`);
  expect(recovery.recoverBoundary10(plan, {
    paths: throughDispatch,
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'claim-dispatched',
    action: { kind: 'release-only-verify' },
  });

  const release = recovery.publishRelease10(plan, {
    classification: 'claim-verified',
    accountingBytes: 534118400,
  });
  expect(release).toMatchObject({ outcome: 'verified-credit-eligible' });
  expect(recovery.publishD1Admission10(plan, {
    ...release,
    accountingBytes: 534118400,
  })).toMatchObject({ outcome: 'D1-durable' });
  expect(recovery.publishD1Admission10(plan, {
    ...release,
    accountingBytes: 536870913,
  })).toMatchObject({ outcome: 'released-no-credit' });

  expect(() => recovery.prepareRecovery10({
    ...context,
    designApproval: { ...context.designApproval, path: '/absolute/design.json' },
  })).toThrow(/relative/);
  expect(() => recovery.acquireFence10(plan, {
    previousCounter: { ...firstFence.counter, sequence: 0 },
    campaign: firstFence.campaign,
    pid: 102,
    startTicks: 203,
    bootId: 'boot-a',
    lockDevice: 303,
    lockInode: 404,
  })).toThrow(/sequence/);
});
