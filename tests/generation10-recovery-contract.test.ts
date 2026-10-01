import { expect, it } from 'vitest';
import * as analysis from '../packages/analysis/src/index.js';

const digest = (character: string): string => character.repeat(64);
const ref = (path: string, character: string, size = 1) => ({
  path, sha256: digest(character), size,
});

/** @id TEST-M5-G10-RECOVERY-CONTRACT-002
 * @verifies REQ-M5-APPROVAL-007 REQ-M5-EVIDENCE-007 REQ-M5-LIFECYCLE-006 REQ-M5-WORKTREE-004
 */
it('TEST-M5-G10-RECOVERY-CONTRACT-002 closes fence, slot and non-prefix lifecycle contracts', () => {
  const recovery = analysis as unknown as {
    prepareRecovery10(context: Record<string, unknown>): any;
    acquireFence10(plan: any, input: Record<string, unknown>): any;
    publishPreparation10(plan: any, fence: any): any;
    recoverBoundary10(plan: any, state: Record<string, unknown>): any;
  };
  const plan = recovery.prepareRecovery10({
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
  const holder = {
    previousCounter: null,
    campaign: null,
    pid: 101,
    startTicks: 202,
    bootId: 'boot-a',
    lockDevice: 303,
    lockInode: 404,
  };
  const first = recovery.acquireFence10(plan, holder);
  expect(first.recoveryFence).toEqual({
    schemaVersion: 1,
    kind: 'change0017-g10-recovery-fence-v1',
    campaign: expect.objectContaining({ path: expect.stringMatching(/campaign-fence\.json$/) }),
    holder: expect.objectContaining({ path: expect.stringMatching(/holder\.json$/) }),
    counter: expect.objectContaining({ path: expect.stringMatching(/counter\.json$/) }),
    campaignFence: 1,
    holderFence: 1,
  });
  expect(() => recovery.acquireFence10(plan, {
    ...holder,
    previousCounter: { ...first.counter, unexpected: true },
    campaign: first.campaign,
  })).toThrow(/exact|closed|properties/);
  expect(() => recovery.acquireFence10(plan, {
    ...holder,
    previousCounter: first.counter,
    campaign: { ...first.campaign, campaignFence: 2 },
  })).toThrow(/campaign/i);

  const preparation = recovery.publishPreparation10(plan, first);
  expect(preparation.slots).toHaveLength(266);
  expect(preparation.slots.reduce(
    (total: number, slot: { maximumBytes: number }) => total + slot.maximumBytes,
    0,
  )).toBe(286654464);
  expect(preparation.reservation).toMatchObject({
    codec: expect.objectContaining({ path: expect.stringMatching(/preparation\/codec\.json$/) }),
    budgetSpec: expect.objectContaining({ path: expect.stringMatching(/preparation\/budget-spec\.json$/) }),
    slotsSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    slotsRoot: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
  expect(preparation.reservation.slotsSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(preparation.reservation.slotsRoot).toMatch(/^[0-9a-f]{64}$/);

  const finals = plan.publicationFiles.map((path: string) => `${plan.roots.preparation}/${path}`);
  const throughRelease = finals.slice(0, 14);
  expect(recovery.recoverBoundary10(plan, {
    paths: [...throughRelease, finals[14], finals[16]],
    releaseOutcome: 'released-no-credit',
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'unclassified',
    action: { kind: 'terminal-no-credit-stop' },
  });
  expect(recovery.recoverBoundary10(plan, {
    paths: [...throughRelease, finals[15]],
    releaseOutcome: 'verified-credit-eligible',
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'D1-expected',
    action: { kind: 'resume', step: 'publish-d1-admission' },
  });
  expect(recovery.recoverBoundary10(plan, {
    paths: [...throughRelease, finals[15], finals[16]],
    releaseOutcome: 'verified-credit-eligible',
    accountingBytes: 536870913,
  })).toEqual({
    classification: 'D1-invalidation-pending',
    action: { kind: 'resume', step: 'publish-credit-invalidation' },
  });
  expect(recovery.recoverBoundary10(plan, {
    paths: [...throughRelease, finals[15], finals[17]],
    releaseOutcome: 'verified-credit-eligible',
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'unclassified',
    action: { kind: 'release-only-verify' },
  });
});
