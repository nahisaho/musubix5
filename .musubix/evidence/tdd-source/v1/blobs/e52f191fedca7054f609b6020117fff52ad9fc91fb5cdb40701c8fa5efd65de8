import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import * as analysis from '../packages/analysis/src/index.js';

const digest = (character: string): string => character.repeat(64);
const ref = (path: string, character: string, size = 1) => ({
  path, sha256: digest(character), size,
});

/** @id TEST-M5-G10-RECOVERY-MATERIALIZATION-006
 * @verifies REQ-M5-APPROVAL-007 REQ-M5-EVIDENCE-007 REQ-M5-LIFECYCLE-006 REQ-M5-WORKTREE-004
 */
it('TEST-M5-G10-RECOVERY-MATERIALIZATION-006 publishes the exact preparation and claim set idempotently', async () => {
  const recovery = analysis as unknown as {
    prepareRecovery10(context: Record<string, unknown>): any;
    acquireFence10(plan: any, input: Record<string, unknown>): any;
    materializeRecoveryClaim10(root: string, plan: any, fence: any): Promise<any>;
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
  const fence = recovery.acquireFence10(plan, {
    previousCounter: null,
    campaign: null,
    pid: 101,
    startTicks: 202,
    bootId: 'boot-a',
    lockDevice: 303,
    lockInode: 404,
  });
  const root = await mkdtemp(join(tmpdir(), 'musubix5-g10-materialization-'));
  try {
    const first = await recovery.materializeRecoveryClaim10(root, plan, fence);
    const firstBytes = await Promise.all(first.paths.map(
      (path: string) => readFile(join(root, path)),
    ));
    const second = await recovery.materializeRecoveryClaim10(root, plan, fence);
    const secondBytes = await Promise.all(second.paths.map(
      (path: string) => readFile(join(root, path)),
    ));
    expect(first.paths).toEqual(plan.publicationFiles.slice(0, 13));
    expect(second).toEqual(first);
    expect(secondBytes).toEqual(firstBytes);
    expect(JSON.parse(await readFile(join(root, first.paths[10]), 'utf8'))).toMatchObject({
      kind: 'change0017-g10-claim-dispatch-v1',
      abortAfterSeal: false,
    });
    expect(JSON.parse(await readFile(join(root, first.paths[11]), 'utf8'))).toMatchObject({
      kind: 'change0017-g10-claim-journal-v1',
      sequence: 1,
      previousSha256: null,
    });
    expect(JSON.parse(await readFile(join(root, first.paths[12]), 'utf8'))).toMatchObject({
      kind: 'change0017-g10-campaign-claim-v1',
      generation: 10,
      lockFence: 1,
    });
    const journalEntries = await readdir(join(root, 'registry/journal'));
    expect(journalEntries).toEqual(['000000000001.json']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
