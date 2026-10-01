import { expect, it } from 'vitest';
import * as analysis from '../packages/analysis/src/index.js';

const digest = (character: string): string => character.repeat(64);
const ref = (path: string, character: string, size = 1) => ({
  path, sha256: digest(character), size,
});

/** @id TEST-M5-G10-RECOVERY-STATE-MACHINE-005
 * @verifies REQ-M5-APPROVAL-007 REQ-M5-EVIDENCE-007 REQ-M5-LIFECYCLE-006
 */
it('TEST-M5-G10-RECOVERY-STATE-MACHINE-005 classifies abort, claim asymmetry and post-dispatch failures', () => {
  const recovery = analysis as unknown as {
    prepareRecovery10(context: Record<string, unknown>): any;
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
  const finals = plan.publicationFiles.map((path: string) => `${plan.roots.preparation}/${path}`);
  const throughSeal = finals.slice(0, 10);
  const throughDispatch = finals.slice(0, 11);
  expect(recovery.recoverBoundary10(plan, {
    paths: throughSeal,
    accountingBytes: 534118400,
    abortRequested: true,
  })).toEqual({
    classification: 'P-sealed-unclaimed',
    action: { kind: 'abort-before-dispatch' },
  });
  expect(recovery.recoverBoundary10(plan, {
    paths: [...throughDispatch, finals[12]],
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'claim-present-unverified',
    action: { kind: 'release-only-verify' },
  });
  expect(recovery.recoverBoundary10(plan, {
    paths: [...throughDispatch, `${finals[12]}.pending`],
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'claim-present-unverified',
    action: { kind: 'release-only-verify' },
  });
  expect(recovery.recoverBoundary10(plan, {
    paths: [...throughDispatch, finals[11], finals[12]],
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'claim-verified',
    action: { kind: 'release-only-verify', step: 'publish-release' },
  });
  expect(recovery.recoverBoundary10(plan, {
    paths: [...throughDispatch, `${plan.roots.preparation}/unknown.json`],
    accountingBytes: 534118400,
  })).toEqual({
    classification: 'unclassified',
    action: { kind: 'release-only-verify' },
  });
  expect(recovery.recoverBoundary10(plan, {
    paths: [...throughDispatch, finals[11], finals[12]],
    accountingBytes: 534118400,
    releasePathSafe: false,
  })).toEqual({
    classification: 'release-publication-blocked',
    action: { kind: 'terminal-no-credit-stop' },
  });
  expect(recovery.recoverBoundary10(plan, {
    paths: [...finals.slice(0, 16), `${finals[16]}.pending`],
    releaseOutcome: 'verified-credit-eligible',
    accountingBytes: 536870913,
  })).toEqual({
    classification: 'D1-admission-transient-invalid',
    action: { kind: 'resume', step: 'publish-d1-admission' },
  });
});
