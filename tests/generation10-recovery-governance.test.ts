import { expect, it } from 'vitest';
import * as analysis from '../packages/analysis/src/index.js';

const digest = (character: string): string => character.repeat(64);
const ref = (path: string, character: string, size = 1) => ({
  path, sha256: digest(character), size,
});
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

/** @id TEST-M5-G10-RECOVERY-APPROVAL-007
 * @verifies REQ-M5-APPROVAL-007
 */
it('TEST-M5-G10-RECOVERY-APPROVAL-007 rejects Generation-9 authority as fresh approval or consent', () => {
  const recovery = analysis as any;
  expect(() => recovery.prepareRecovery10({
    ...context,
    designApproval: context.recoveryAuthority29,
  })).toThrow(/Generation-9|reuse|fresh/);
  expect(() => recovery.prepareRecovery10({
    ...context,
    consent: context.abortRelease29,
  })).toThrow(/Generation-9|reuse|fresh/);
});

/** @id TEST-M5-G10-RECOVERY-COMPAT-013
 * @verifies REQ-M5-COMPAT-013
 */
it('TEST-M5-G10-RECOVERY-COMPAT-013 preserves allocation identities without granting historical authority', () => {
  const recovery = analysis as any;
  const binding = recovery.recoveryCompatibilityBinding10(recovery.prepareRecovery10(context));
  expect(binding).toEqual({
    generation: 10,
    gapKey: '604514880a44924d56a8f0f3177a62540de526f7101b356271be67fc33977af9',
    authorityKey: '9dc882e33a5b453757c4b3a5ca16593aac43fc8375cde648c74e8e50553c482b',
    pId: 'fe27129bcb82de2245c321e2a8af1e01704a87101fb6013e497881b4c77cd690',
    historicalAuthority: false,
  });
});

/** @id TEST-M5-G10-RECOVERY-EVIDENCE-007
 * @verifies REQ-M5-EVIDENCE-007
 */
it('TEST-M5-G10-RECOVERY-EVIDENCE-007 enforces the closed RecoveryAuthority10 schema', () => {
  const recovery = analysis as any;
  const plan = recovery.prepareRecovery10(context);
  expect(recovery.validateRecoveryAuthority10(plan.authority)).toEqual(plan.authority);
  expect(() => recovery.validateRecoveryAuthority10({
    ...plan.authority,
    unexpected: true,
  })).toThrow(/closed|properties|exact/);
});

/** @id TEST-M5-G10-RECOVERY-GRAPH-003
 * @verifies REQ-M5-GRAPH-003
 */
it('TEST-M5-G10-RECOVERY-GRAPH-003 exposes the approved acyclic dependency graph', () => {
  const recovery = analysis as any;
  expect(recovery.generation10DependencyGraph()).toEqual({
    node: 'DES-M5-024',
    dependsOn: ['DES-M5-005', 'DES-M5-006', 'DES-M5-007', 'DES-M5-012', 'DES-M5-015', 'DES-M5-018'],
    cyclic: false,
  });
});

/** @id TEST-M5-G10-RECOVERY-WORKTREE-004
 * @verifies REQ-M5-WORKTREE-004
 */
it('TEST-M5-G10-RECOVERY-WORKTREE-004 rejects non-canonical control and git-common roots', () => {
  const recovery = analysis as any;
  expect(() => recovery.prepareRecovery10({
    ...context,
    controlRoot: '/workspace/../control',
  })).toThrow(/canonical|root|traversal/);
  expect(() => recovery.prepareRecovery10({
    ...context,
    gitCommonRoot: '/repository/.git/../foreign',
  })).toThrow(/canonical|root|traversal/);
});
