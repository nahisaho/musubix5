import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../packages/analysis/src/config.js';
import { activeChangeContext } from '../packages/analysis/src/change-generation.js';
import { projectStatus } from '../packages/analysis/src/gate.js';

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

describe('active CHANGE context', () => {
  /** @id TEST-M5-LIFECYCLE-LEGACY-DOCUMENT-STATUS-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-COMPAT-013
   */
  it('TEST-M5-LIFECYCLE-LEGACY-DOCUMENT-STATUS-001 defers missing document status to generation chronology', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-active-change-'));
    temporaryDirectories.push(root);
    write(root, '.musubix/changes/CHANGE-0002.md', '# CHANGE-0002\n');
    write(root, '.musubix/changes/CHANGE-0003.md', '# CHANGE-0003\n');
    write(root, '.musubix/evidence/changes.json', JSON.stringify({
      schemaVersion: 1,
      changes: [
        { changeId: 'CHANGE-0002', activeGeneration: null, requirementIds: ['REQ-OLD-001'] },
        { changeId: 'CHANGE-0003', activeGeneration: 5, requirementIds: ['REQ-NEW-001'] },
      ],
    }));

    await expect(activeChangeContext(root)).resolves.toEqual({
      changeId: 'CHANGE-0003',
      generation: 5,
      requirementIds: ['REQ-NEW-001'],
    });
  });

  /** @id TEST-M5-LIFECYCLE-ACTIVE-STATUS-001
   * @verifies REQ-M5-LIFECYCLE-005
   */
  it('TEST-M5-LIFECYCLE-ACTIVE-STATUS-001 excludes completed CHANGE documents from implicit selection', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-active-change-'));
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

    await expect(activeChangeContext(root)).resolves.toEqual({
      changeId: 'CHANGE-0003',
      generation: 5,
      requirementIds: ['REQ-NEW-001'],
    });
  });

  /** @id TEST-M5-LIFECYCLE-STATUS-SELECTION-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-COMPAT-013
   */
  it('TEST-M5-LIFECYCLE-STATUS-SELECTION-001 reports the document-selected active CHANGE', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-project-status-'));
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
        {
          changeId: 'CHANGE-0002',
          activeGeneration: 15,
          requirementIds: ['REQ-OLD-001'],
          phases: { quality: { order: 10 } },
        },
        {
          changeId: 'CHANGE-0003',
          activeGeneration: 5,
          requirementIds: ['REQ-NEW-001'],
          phases: {},
        },
      ],
    }));

    await expect(projectStatus(root)).resolves.toMatchObject({
      change: {
        changeId: 'CHANGE-0003',
        activeGeneration: 5,
      },
      gate: {
        ready: false,
      },
    });
  });

  /** @id TEST-M5-LIFECYCLE-STATUS-RECOVERY-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-COMPAT-013
   */
  it('TEST-M5-LIFECYCLE-STATUS-RECOVERY-001 reports recoverable CHANGE selection diagnostics', async () => {
    const missingRoot = mkdtempSync(join(tmpdir(), 'musubix5-project-status-missing-'));
    temporaryDirectories.push(missingRoot);
    write(missingRoot, '.musubix/changes/CHANGE-0003.md', [
      '---',
      'schemaVersion: 1',
      'id: CHANGE-0003',
      'status: active',
      '---',
      '# CHANGE-0003',
      '',
    ].join('\n'));
    write(missingRoot, '.musubix/evidence/changes.json', JSON.stringify({
      schemaVersion: 1,
      changes: [],
    }));
    write(missingRoot, '.musubix/config.json', JSON.stringify(defaultConfig));

    await expect(projectStatus(missingRoot)).resolves.toMatchObject({
      initialized: true,
      change: null,
      changeDiagnostics: [{ code: 'CHANGE_GENERATION_PHASE', severity: 'error' }],
      gate: { ready: false },
      next: ['Restore .musubix/evidence/changes.json for the active CHANGE before continuing.'],
    });

    const mixedRoot = mkdtempSync(join(tmpdir(), 'musubix5-project-status-mixed-'));
    temporaryDirectories.push(mixedRoot);
    for (const changeId of ['CHANGE-0002', 'CHANGE-0003']) {
      write(mixedRoot, `.musubix/changes/${changeId}.md`, [
        '---',
        'schemaVersion: 1',
        `id: ${changeId}`,
        'status: active',
        '---',
        `# ${changeId}`,
        '',
      ].join('\n'));
    }
    write(mixedRoot, '.musubix/evidence/changes.json', JSON.stringify({
      schemaVersion: 1,
      changes: [
        { changeId: 'CHANGE-0002', activeGeneration: 2, requirementIds: ['REQ-OLD-001'] },
        { changeId: 'CHANGE-0003', activeGeneration: 5, requirementIds: ['REQ-NEW-001'] },
      ],
    }));
    write(mixedRoot, '.musubix/config.json', JSON.stringify(defaultConfig));

    await expect(projectStatus(mixedRoot)).resolves.toMatchObject({
      initialized: true,
      change: null,
      changeDiagnostics: [{ code: 'CHANGE_GENERATION_MIXED', severity: 'error' }],
      gate: { ready: false },
      next: ['Review .musubix/changes and leave exactly one CHANGE document with status: active.'],
    });
  });

  /** @id TEST-M5-LIFECYCLE-CONTEXT-002
   * @verifies REQ-M5-LIFECYCLE-005
   */
  it('TEST-M5-LIFECYCLE-CONTEXT-002 preserves an active CHANGE with no active generation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-active-change-'));
    temporaryDirectories.push(root);
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
        { changeId: 'CHANGE-0003', activeGeneration: null, requirementIds: ['REQ-NEW-001'] },
      ],
    }));

    await expect(activeChangeContext(root)).rejects.toThrow('CHANGE_GENERATION_PHASE');
  });
});
