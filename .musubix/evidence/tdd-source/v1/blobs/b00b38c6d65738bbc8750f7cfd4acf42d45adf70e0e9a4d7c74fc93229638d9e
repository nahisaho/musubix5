import { execFileSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, content);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('approval effective projection', () => {
  /**
   * @id TEST-M5-COMPAT-EFFECTIVE-DESIGN-PROJECTION-001
   * @verifies REQ-M5-COMPAT-013
   */
  it('TEST-M5-COMPAT-EFFECTIVE-DESIGN-PROJECTION-001 keeps defaulted design projections producer-identical', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-effective-projection-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    write(root, '.musubix/config.json', JSON.stringify({
      schemaVersion: 1,
      approval: { mode: 'required', domains: [] },
    }));
    write(root, '.musubix/constitution.md', '# Constitution\n');
    write(root, '.musubix/features/sample/requirements.md', [
      '## REQ-SAMPLE-001: Sample',
      'Priority: must',
      'Type: functional',
      'Statement: The system shall respond.',
      'Acceptance: The response is observed.',
      '',
    ].join('\n'));
    write(root, '.musubix/features/sample/design.md', [
      '## DES-SAMPLE-001: Sample',
      'Responsibilities: Respond.',
      'Interfaces: `respond()`.',
      'Constraints: Deterministic.',
      'Requirements: REQ-SAMPLE-001',
      'ADRs: ADR-0001',
      '',
    ].join('\n'));
    write(root, '.musubix/decisions/ADR-0001.md', '# ADR\n');
    const { approvalManifest } = await import('../packages/analysis/src/approval.js');
    const { prepareStageApproval } =
      await import('../packages/analysis/src/native-approval.js');

    const compatibility = await approvalManifest(root, 'design');
    const native = await prepareStageApproval(root, {
      stage: 'design',
      changeId: 'CHANGE-0002',
      runLocalPaths: [],
    });
    expect(native.projection).toEqual(compatibility.projection);
    expect(native.artifactSha256).toBe(compatibility.artifactSha256);

    write(root, '.musubix/changes/CHANGE-0003.md', [
      '---',
      'schemaVersion: 1',
      'id: CHANGE-0003',
      'status: completed',
      '---',
      '# CHANGE-0003',
      '',
    ].join('\n'));
    write(root, '.musubix/evidence/changes.json', JSON.stringify({
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0003',
        activeGeneration: 5,
        requirementIds: ['REQ-M5-WAVE0-COMPLETION-001'],
        phases: { quality: { order: 6 } },
      }],
    }));
    const { resolveValidationChangeContext } =
      await import('../packages/analysis/src/change-generation.js');
    const validationContext = await resolveValidationChangeContext(root);
    const preparationManifest = await approvalManifest(root, 'design');
    const validationManifest = await approvalManifest(
      root, 'design', undefined, undefined, undefined, validationContext,
    );

    expect(preparationManifest.changeId).toBeUndefined();
    expect(validationManifest).toMatchObject({
      changeId: 'CHANGE-0003',
      generation: 5,
    });
  });

  /**
   * @id TEST-M5-WAVE0-COMPLETION-004
   * @verifies REQ-M5-WAVE0-COMPLETION-001
   */
  it('TEST-M5-WAVE0-COMPLETION-004 keeps explicit evidence context independent of active selection', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-explicit-approval-context-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    write(root, '.musubix/config.json', JSON.stringify({
      schemaVersion: 1,
      approval: { mode: 'required', domains: [] },
    }));
    write(root, '.musubix/constitution.md', '# Constitution\n');
    write(root, '.musubix/features/sample/requirements.md', [
      '## REQ-SAMPLE-001: Sample',
      'Priority: must',
      'Type: functional',
      'Statement: The system shall respond.',
      'Acceptance: The response is observed.',
      '',
    ].join('\n'));
    write(root, '.musubix/features/sample/design.md', [
      '## DES-SAMPLE-001: Sample',
      'Responsibilities: Respond.',
      'Interfaces: `respond()`.',
      'Constraints: Deterministic.',
      'Requirements: REQ-SAMPLE-001',
      'ADRs: ADR-0001',
      '',
    ].join('\n'));
    write(root, '.musubix/decisions/ADR-0001.md', '# ADR\n');
    for (const changeId of ['CHANGE-0002', 'CHANGE-0003']) {
      write(root, `.musubix/changes/${changeId}.md`, [
        '---',
        'schemaVersion: 1',
        `id: ${changeId}`,
        'status: active',
        '---',
        `# ${changeId}`,
        '',
      ].join('\n'));
    }
    write(root, '.musubix/evidence/changes.json', JSON.stringify({
      schemaVersion: 1,
      changes: [
        { changeId: 'CHANGE-0002', activeGeneration: 1, requirementIds: ['REQ-SAMPLE-001'] },
        { changeId: 'CHANGE-0003', activeGeneration: 1, requirementIds: ['REQ-SAMPLE-001'] },
      ],
    }));
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test User']);
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', 'fixture']);
    const { approvalManifest } = await import('../packages/analysis/src/approval.js');

    await expect(approvalManifest(root, 'design', undefined, undefined, {
      repositoryId: 'repository:test',
      candidateId: `candidate:${'a'.repeat(64)}`,
      changeId: 'CHANGE-0002',
      generation: 1,
      baseCommit: 'b'.repeat(40),
      candidateCommit: 'c'.repeat(40),
    })).resolves.toMatchObject({
      changeId: 'CHANGE-0002',
      generation: 1,
    });
  });
});
