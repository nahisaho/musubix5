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

describe('CHANGE generation evidence binding', () => {
  /**
   * @id TEST-M5-LIFECYCLE-GENERATION-BINDING-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-APPROVAL-007
   */
  it('TEST-M5-LIFECYCLE-GENERATION-BINDING-001 binds approvals and status to the active generation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-generation-binding-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    write(root, '.musubix/config.json', JSON.stringify({
      schemaVersion: 1,
      approval: { mode: 'required', domains: [] },
    }));
    write(root, '.musubix/constitution.md', '# Constitution\n');
    write(root, '.musubix/features/sample/requirements.md', [
      '## REQ-M5-LIFECYCLE-005: Generation',
      'Priority: must',
      'Type: functional',
      'Statement: The system shall version CHANGE cycles.',
      'Acceptance: Generation 2 is reported.',
      '',
    ].join('\n'));
    write(root, '.musubix/features/sample/design.md', [
      '## DES-M5-005: Generation',
      'Responsibilities: Version CHANGE cycles.',
      'Interfaces: `activeGeneration()`.',
      'Constraints: Positive integers.',
      'Requirements: REQ-M5-LIFECYCLE-005',
      'ADRs: ADR-0010',
      '',
    ].join('\n'));
    write(root, '.musubix/decisions/ADR-0010.md', '# ADR\n');
    write(root, '.musubix/changes/CHANGE-0002.md', [
      '# CHANGE-0002',
      '',
      'Requirements: REQ-M5-LIFECYCLE-005',
      '',
    ].join('\n'));
    write(root, '.musubix/evidence/changes.json', JSON.stringify({
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0002',
        generation: 2,
        activeGeneration: 2,
        requirementIds: ['REQ-M5-LIFECYCLE-005'],
        phases: {},
        generationHistory: [{
          generation: 1,
          status: 'superseded',
          requirementIds: ['REQ-M5-LIFECYCLE-005'],
          phases: {},
        }],
      }],
    }));

    const { approvalManifest } = await import('../packages/analysis/src/approval.js');
    const { projectStatus } = await import('../packages/analysis/src/gate.js');

    await expect(approvalManifest(root, 'requirements')).resolves.toMatchObject({
      stage: 'requirements',
      changeId: 'CHANGE-0002',
      generation: 2,
    });
    await expect(projectStatus(root)).resolves.toMatchObject({
      change: {
        changeId: 'CHANGE-0002',
        activeGeneration: 2,
        generations: [
          { generation: 1, status: 'superseded' },
          { generation: 2, status: 'active' },
        ],
      },
      gate: { ready: false },
    });
  });
});
