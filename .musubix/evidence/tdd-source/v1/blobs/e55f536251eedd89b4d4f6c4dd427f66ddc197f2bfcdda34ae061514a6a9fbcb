import { expect, it } from 'vitest';
import * as analysis from '../packages/analysis/src/index.js';

const digest = (character: string): string => character.repeat(64);
const ref = (path: string, character: string, size = 1) => ({
  path, sha256: digest(character), size,
});

function planFixture(recovery: any): any {
  return recovery.prepareRecovery10({
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
}

/** @id TEST-M5-G10-RECOVERY-ACCOUNTING-004
 * @verifies REQ-M5-EVIDENCE-007 REQ-M5-LIFECYCLE-006 REQ-M5-WORKTREE-004
 */
it('TEST-M5-G10-RECOVERY-ACCOUNTING-004 derives accounting and recovers the first campaign fence without reuse', () => {
  const recovery = analysis as unknown as {
    prepareRecovery10(context: Record<string, unknown>): any;
    acquireFence10(plan: any, input: Record<string, unknown>): any;
    publishPreparation10(plan: any, fence: any): any;
    buildRecoveryAccountingManifest10(plan: any, preparation: any): any;
    verifyRecoveryAccounting10(manifest: any): any;
  };
  const plan = planFixture(recovery);
  const holder = {
    previousCounter: null,
    campaign: null,
    pid: 101,
    startTicks: 202,
    bootId: 'boot-a',
    lockDevice: 303,
    lockInode: 404,
    seenSequences: [],
  };
  const first = recovery.acquireFence10(plan, holder);
  const recoveredCampaign = recovery.acquireFence10(plan, {
    ...holder,
    previousCounter: first.counter,
    campaign: null,
    recoverCampaignFromCounter: true,
    seenSequences: [1],
  });
  expect(recoveredCampaign).toMatchObject({ campaignFence: 1, holderFence: 1 });
  expect(recoveredCampaign.counter).toEqual(first.counter);
  expect(() => recovery.acquireFence10(plan, {
    ...holder,
    previousCounter: first.counter,
    campaign: first.campaign,
    seenSequences: [1, 2],
  })).toThrow(/reuse|seen|sequence/);

  const preparation = recovery.publishPreparation10(plan, first);
  const manifest = recovery.buildRecoveryAccountingManifest10(plan, preparation);
  expect(manifest.entries).toHaveLength(368);
  expect(new Set(manifest.entries.map((entry: { path: string }) => entry.path)).size).toBe(368);
  expect(manifest.entries.every((entry: { mode: unknown }) =>
    entry.mode === '100644' || entry.mode === '100755')).toBe(true);
  expect(manifest).toMatchObject({
    schemaVersion: 1,
    kind: 'change0017-g10-recovery-accounting-manifest-v1',
    preparationEntries: 266,
    postEntries: 102,
    preparationMaximumBytes: 287178752,
    postSlotBytes: 240648192,
    postSharedBytes: 6291456,
    chargedMaximumBytes: 534118400,
    hardLimitBytes: 536870912,
    unwritableMarginBytes: 2752512,
  });
  expect(recovery.verifyRecoveryAccounting10(manifest)).toEqual({
    valid: true,
    chargedMaximumBytes: 534118400,
    unwritableMarginBytes: 2752512,
  });
  expect(() => recovery.verifyRecoveryAccounting10({
    ...manifest,
    entries: manifest.entries.map((entry: any, index: number) =>
      index === 367 ? { ...entry, maximumBytes: entry.maximumBytes + 2752513 } : entry),
  })).toThrow(/limit|accounting|maximum/);
  expect(() => recovery.verifyRecoveryAccounting10({
    ...manifest,
    entries: manifest.entries.map((entry: any, index: number) =>
      index === 0 ? { ...entry, mode: 100644 } : entry),
  })).toThrow(/mode/);
});
