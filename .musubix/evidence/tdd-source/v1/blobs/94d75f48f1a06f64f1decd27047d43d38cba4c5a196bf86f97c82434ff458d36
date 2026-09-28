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

function root(): string {
  const directory = mkdtempSync(join(tmpdir(), 'musubix5-normative-selection-'));
  temporaryDirectories.push(directory);
  execFileSync('git', ['init', '--quiet', directory]);
  write(directory, '.musubix/config.json', JSON.stringify({
    schemaVersion: 1,
    approval: { mode: 'required', domains: [] },
  }));
  write(directory, '.musubix/constitution.md', '# Constitution\n');
  return directory;
}

function requirement(id: string): string {
  return [
    `## ${id}: Sample`,
    'Priority: must',
    'Type: functional',
    'Statement: The system shall respond.',
    'Acceptance: The response is observed.',
    '',
  ].join('\n');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('approval normative selection', () => {
  /**
   * @id TEST-M5-APPROVAL-PATTERN-SELECTION-001
   * @verifies REQ-M5-APPROVAL-007
   */
  it('TEST-M5-APPROVAL-PATTERN-SELECTION-001 selects only files matching the stage pattern', async () => {
    const project = root();
    write(project, '.musubix/features/complete/requirements.md', requirement('REQ-COMPLETE-001'));
    write(project, '.musubix/features/complete/design.md', [
      '## DES-COMPLETE-001: Complete',
      'Responsibilities: Respond.',
      'Interfaces: `respond()`.',
      'Constraints: Deterministic.',
      'Requirements: REQ-COMPLETE-001',
      'ADRs:',
      '',
    ].join('\n'));
    write(project, '.musubix/features/draft/requirements.md', requirement('REQ-DRAFT-001'));
    write(project, '.musubix/features/templates/readme.txt', 'not a feature\n');
    const { prepareStageApproval } =
      await import('../packages/analysis/src/native-approval.js');

    const design = await prepareStageApproval(project, {
      stage: 'design',
      changeId: 'CHANGE-0002',
      runLocalPaths: [],
    });
    expect(Object.keys(design.artifacts)).toEqual([
      '.musubix/constitution.md',
      '.musubix/features/complete/design.md',
      '.musubix/features/complete/requirements.md',
    ]);
  });

  /**
   * @id TEST-M5-APPROVAL-NFC-REVERIFY-001
   * @verifies REQ-M5-APPROVAL-002
   */
  it('TEST-M5-APPROVAL-NFC-REVERIFY-001 re-verifies an NFD on-disk feature through its NFC key', async () => {
    const project = root();
    const nfdSlug = 'cafe\u0301';
    write(project, `.musubix/features/${nfdSlug}/requirements.md`, requirement('REQ-NFC-001'));
    const { prepareStageApproval } =
      await import('../packages/analysis/src/native-approval.js');
    const { createRunLocalWorkspace } =
      await import('../packages/analysis/src/run-local-workspace.js');
    const approval = await prepareStageApproval(project, {
      stage: 'requirements',
      changeId: 'CHANGE-0002',
      runLocalPaths: [],
    });

    await expect(createRunLocalWorkspace(project, {
      changeId: 'CHANGE-0002',
      runId: 'run-1',
      approval,
    })).resolves.toMatchObject({
      changeId: 'CHANGE-0002',
    });
  });
});
