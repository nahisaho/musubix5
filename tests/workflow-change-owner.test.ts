import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recordWorkflow } from '../packages/analysis/src/workflow.js';

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

describe('workflow CHANGE ownership', () => {
  /** @id TEST-M5-WORKFLOW-CHANGE-OWNER-001
   * @verifies REQ-M5-EVIDENCE-006 REQ-M5-PARALLEL-017
   */
  it('TEST-M5-WORKFLOW-CHANGE-OWNER-001 persists an explicitly selected current CHANGE', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-workflow-owner-'));
    temporaryDirectories.push(root);
    write(root, '.musubix/changes/CHANGE-0002.md', [
      '---',
      'schemaVersion: 1',
      'id: CHANGE-0002',
      'status: completed',
      '---',
      '# CHANGE-0002',
      '',
    ].join('\n'));
    write(root, '.musubix/changes/CHANGE-0003.md', [
      '---',
      'schemaVersion: 1',
      'id: CHANGE-0003',
      'status: active',
      '---',
      '# CHANGE-0003',
      '',
    ].join('\n'));
    write(root, '.musubix/evidence/changes.json', JSON.stringify({
      schemaVersion: 1,
      changes: [
        { changeId: 'CHANGE-0002', activeGeneration: 15, requirementIds: ['REQ-OLD-001'] },
        { changeId: 'CHANGE-0003', activeGeneration: 5, requirementIds: ['REQ-NEW-001'] },
      ],
    }));

    const manifest = await recordWorkflow(root, {
      skill: 'sdd-implementation',
      phase: 'complete',
      status: 'completed',
    }, { changeId: 'CHANGE-0003' });

    expect(manifest.events.at(-1)).toMatchObject({
      changeId: 'CHANGE-0003',
      generation: 5,
      requirementIds: ['REQ-NEW-001'],
    });
    await expect(recordWorkflow(root, {
      skill: 'sdd-implementation',
      phase: 'complete',
      status: 'completed',
    }, { changeId: 'CHANGE-0002' })).rejects.toThrow('CHANGE_GENERATION_PHASE');
    await expect(recordWorkflow(root, {
      skill: 'sdd-implementation',
      phase: 'complete',
      status: 'completed',
    }, { changeId: 'CHANGE-9999' })).rejects.toThrow('WORKFLOW_CHANGE_MISMATCH');
  });

  /** @id TEST-M5-WORKFLOW-CHANGE-OWNER-CONFLICT-001
   * @verifies REQ-M5-EVIDENCE-006 REQ-M5-PARALLEL-017
   */
  it('TEST-M5-WORKFLOW-CHANGE-OWNER-CONFLICT-001 rejects an explicit owner conflicting with persisted ownership', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-workflow-owner-conflict-'));
    temporaryDirectories.push(root);
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
        { changeId: 'CHANGE-0002', activeGeneration: 15, requirementIds: ['REQ-OLD-001'] },
        { changeId: 'CHANGE-0003', activeGeneration: 5, requirementIds: ['REQ-NEW-001'] },
      ],
    }));
    write(root, '.musubix/evidence/workflow.json', JSON.stringify({
      schemaVersion: 1,
      events: [{
        skill: 'sdd-change',
        version: '0.1.8',
        provenance: 'self-reported',
        changeId: 'CHANGE-0002',
        generation: 15,
        requirementIds: ['REQ-OLD-001'],
        phase: 'complete',
        status: 'completed',
        recordedAt: '2026-09-23T00:00:00.000Z',
      }],
    }));

    await expect(recordWorkflow(root, {
      skill: 'sdd-implementation',
      phase: 'complete',
      status: 'completed',
    }, { changeId: 'CHANGE-0003' })).rejects.toThrow('WORKFLOW_CHANGE_MISMATCH');
  });
});
