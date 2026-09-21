import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('run-local approval workspace', () => {
  /**
   * @id TEST-M5-APPROVAL-002
   * @verifies REQ-M5-APPROVAL-002
   */
  it('TEST-M5-APPROVAL-002 isolates generated output from approved specifications', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-run-local-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    const requirementPath = '.musubix/features/example/requirements.md';
    mkdirSync(join(root, '.musubix/features/example'), { recursive: true });
    writeFileSync(join(root, requirementPath), '# Approved\n');
    const { prepareNativeApproval } =
      await import('../packages/analysis/src/native-approval.js');
    const {
      assertApprovedSpecificationCurrent,
      createRunLocalWorkspace,
      writeRunLocalArtifact,
    } = await import('../packages/analysis/src/run-local-workspace.js');
    const approval = await prepareNativeApproval(root, {
      stage: 'requirements',
      paths: [requirementPath],
      projection: { schemaVersion: 1 },
    });
    const workspace = await createRunLocalWorkspace(root, {
      changeId: 'CHANGE-0002',
      runId: 'review-1',
      approval,
    });

    const artifact = await writeRunLocalArtifact(workspace, 'repair/draft.json', {
      priorities: ['must'],
    });
    expect(artifact.path).toBe('.musubix/runs/CHANGE-0002/review-1/repair/draft.json');
    expect(JSON.parse(readFileSync(join(root, artifact.path), 'utf8')))
      .toEqual({ priorities: ['must'] });
    await expect(writeRunLocalArtifact(
      workspace,
      '../../../features/example/requirements.md',
      { changed: true },
    )).rejects.toThrow('RUN_LOCAL_PATH_ESCAPE');
    expect(readFileSync(join(root, requirementPath), 'utf8')).toBe('# Approved\n');

    writeFileSync(join(root, requirementPath), '# Changed\n');
    await expect(assertApprovedSpecificationCurrent(workspace))
      .rejects.toThrow('APPROVED_SPECIFICATION_CHANGED');
  });
});
