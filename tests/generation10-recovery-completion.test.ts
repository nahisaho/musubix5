import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import * as analysis from '../packages/analysis/src/index.js';

const digest = (character: string): string => character.repeat(64);
const ref = (path: string, character: string, size = 1) => ({
  path, sha256: digest(character), size,
});

async function absent(path: string): Promise<boolean> {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
}

/** @id TEST-M5-G10-RECOVERY-COMPLETION-008
 * @verifies REQ-M5-EVIDENCE-007 REQ-M5-LIFECYCLE-006
 */
it('TEST-M5-G10-RECOVERY-COMPLETION-008 materializes exclusive release, no-credit and D1 outcomes', async () => {
  const recovery = analysis as any;
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
  const fence = recovery.acquireFence10(plan, {
    previousCounter: null,
    campaign: null,
    pid: 101,
    startTicks: 202,
    bootId: 'boot-a',
    lockDevice: 303,
    lockInode: 404,
  });
  for (const outcome of ['credit', 'no-credit', 'invalidated']) {
    const root = await mkdtemp(join(tmpdir(), `musubix5-g10-${outcome}-`));
    try {
      const first = await recovery.materializeRecoveryCompletion10(root, plan, fence, outcome);
      const second = await recovery.materializeRecoveryCompletion10(root, plan, fence, outcome);
      expect(second).toEqual(first);
      expect(JSON.parse(await readFile(join(root, 'control/release.json'), 'utf8'))).toMatchObject({
        kind: 'change0017-g10-release-v1',
      });
      const noCredit = join(root, 'control/no-credit.json');
      const expected = join(root, 'control/D1-expected-delta.json');
      const admission = join(root, 'control/D1-admission.json');
      const invalidation = join(root, 'control/credit-invalidation.json');
      if (outcome === 'credit') {
        expect(first.classification).toBe('D1-durable');
        expect(await absent(noCredit)).toBe(true);
        expect(await absent(expected)).toBe(false);
        expect(await absent(admission)).toBe(false);
        expect(await absent(invalidation)).toBe(true);
      } else if (outcome === 'no-credit') {
        expect(first.classification).toBe('released-no-credit');
        expect(await absent(noCredit)).toBe(false);
        expect(await absent(expected)).toBe(true);
        expect(await absent(admission)).toBe(true);
        expect(await absent(invalidation)).toBe(true);
      } else {
        expect(first.classification).toBe('D1-invalidated');
        expect(await absent(noCredit)).toBe(true);
        expect(await absent(expected)).toBe(false);
        expect(await absent(admission)).toBe(false);
        expect(await absent(invalidation)).toBe(false);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
