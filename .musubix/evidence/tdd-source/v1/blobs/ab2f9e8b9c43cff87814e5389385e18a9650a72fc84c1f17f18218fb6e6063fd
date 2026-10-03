import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import * as analysis from '../packages/analysis/src/index.js';

const digest = (character: string): string => character.repeat(64);
const ref = (path: string, character: string, size = 1) => ({
  path, sha256: digest(character), size,
});

/** @id TEST-M5-G10-RECOVERY-REVIEW-009
 * @verifies REQ-M5-EVIDENCE-007 REQ-M5-LIFECYCLE-006 REQ-M5-WORKTREE-004
 */
it('TEST-M5-G10-RECOVERY-REVIEW-009 keeps every post-dispatch and abort path fail-closed', async () => {
  const recovery = analysis as unknown as {
    prepareRecovery10(context: Record<string, unknown>): any;
    acquireFence10(plan: any, input: Record<string, unknown>): any;
    recoverBoundary10(plan: any, state: Record<string, unknown>): any;
    materializeRecoveryAbort10(root: string, plan: any, fence: any): Promise<any>;
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
  const finals = plan.publicationFiles.map((path: string) => `${plan.roots.preparation}/${path}`);
  const throughSeal = finals.slice(0, 10);
  const throughDispatch = finals.slice(0, 11);

  expect(recovery.recoverBoundary10(plan, {
    paths: [...throughDispatch, `${finals[11]}.pending`],
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'claim-present-unverified',
    action: { kind: 'release-only-verify' },
  });
  expect(recovery.recoverBoundary10(plan, {
    paths: [...throughDispatch, finals[11], finals[13]],
    releaseOutcome: 'released-no-credit',
    releasePathSafe: true,
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'released-no-credit-pending',
    action: { kind: 'resume', step: 'publish-no-credit' },
  });
  expect(recovery.recoverBoundary10(plan, {
    paths: [...finals.slice(0, 14), `${finals[14]}.pending`],
    releaseOutcome: 'verified-credit-eligible',
    releasePathSafe: true,
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'released-no-credit-pending',
    action: { kind: 'resume', step: 'publish-no-credit' },
  });
  expect(recovery.recoverBoundary10(plan, {
    paths: [...finals.slice(0, 14), finals[16]],
    releaseOutcome: 'verified-credit-eligible',
    releasePathSafe: true,
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'unclassified',
    action: { kind: 'release-only-verify' },
  });

  const fence = recovery.acquireFence10(plan, {
    previousCounter: null,
    campaign: null,
    pid: 101,
    startTicks: 202,
    bootId: 'boot-a',
    lockDevice: 303,
    lockInode: 404,
  });
  const root = await mkdtemp(join(tmpdir(), 'musubix5-g10-abort-'));
  try {
    const first = await recovery.materializeRecoveryAbort10(root, plan, fence);
    const firstBytes = await Promise.all(first.paths.map(
      (path: string) => readFile(join(root, path)),
    ));
    const second = await recovery.materializeRecoveryAbort10(root, plan, fence);
    const secondBytes = await Promise.all(second.paths.map(
      (path: string) => readFile(join(root, path)),
    ));
    expect(second).toEqual(first);
    expect(secondBytes).toEqual(firstBytes);
    expect(first.paths).toEqual([...plan.publicationFiles.slice(0, 10), 'control/release.json']);
    expect(JSON.parse(await readFile(join(root, 'control/release.json'), 'utf8'))).toMatchObject({
      kind: 'change0017-g10-release-v1',
      outcome: 'aborted-before-dispatch',
      absent: {
        dispatch: true,
        journal: true,
        claim: true,
      },
    });
    expect(recovery.recoverBoundary10(plan, {
      paths: [...throughSeal, finals[13]],
      releaseOutcome: 'aborted-before-dispatch',
      releasePathSafe: true,
      accountingBytes: 534118400,
    })).toEqual({
      classification: 'aborted',
      action: { kind: 'complete' },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
