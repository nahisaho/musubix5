import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { digest, snapshot } from '../packages/analysis/src/files.js';
import { appendJournalRecord, loadJournalRecords } from '../packages/analysis/src/journal.js';

const injectedReadFailure = vi.hoisted(() => ({ path: null as string | null }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      if (injectedReadFailure.path !== null
        && resolve(String(args[0])) === injectedReadFailure.path) {
        throw Object.assign(new Error('injected unreadable config'), { code: 'EACCES' });
      }
      return actual.readFile(...args);
    },
  };
});

const roots: string[] = [];
const requirementId = 'REQ-DEMO-001';
const changeId = 'CHANGE-0001';
const configPath = '.musubix/config.json';
const invalidConfigMessage =
  'Change fingerprint input .musubix/config.json must be a readable regular file.';
const emptyFingerprints = {
  impact: '0'.repeat(64), requirements: '0'.repeat(64), design: '0'.repeat(64),
  implementation: '0'.repeat(64), tests: '0'.repeat(64), tdd: '0'.repeat(64),
};

async function createSourceRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'musubix5-config-source-'));
  roots.push(root);
  await mkdir(join(root, '.musubix/changes'), { recursive: true });
  await mkdir(join(root, '.musubix/decisions'), { recursive: true });
  await mkdir(join(root, '.musubix/features/demo'), { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'tests'), { recursive: true });
  await writeFile(join(root, `.musubix/changes/${changeId}.md`),
    `# ${changeId}\n\nRequirements: ${requirementId}\n`);
  await writeFile(join(root, '.musubix/features/demo/requirements.md'), [
    '---', 'schemaVersion: 1', 'feature: demo', 'status: draft', '---',
    '# demo requirements', '', `## ${requirementId}: Demo behavior`,
    'Priority: must', 'Type: functional',
    'Statement: The system shall expose the demo behavior.',
    'Acceptance: The demo test returns the expected value.', '',
  ].join('\n'));
  await writeFile(join(root, '.musubix/features/demo/design.md'), [
    '# demo design', '', '## DES-DEMO-001: Demo component',
    'Responsibilities: Expose the demo behavior.', 'Interfaces: `demo()`.',
    'Constraints: Return a deterministic value.', `Requirements: ${requirementId}`,
    'ADRs: ADR-0001', '',
  ].join('\n'));
  await writeFile(join(root, '.musubix/decisions/ADR-0001.md'), [
    '# ADR-0001: Demo decision', '', '## Context',
    'The fixture needs one traced decision.', '', '## Decision',
    'Use a deterministic function.', '', '## Consequences',
    'The result is stable.', '', `Requirements: ${requirementId}`,
    'Design: DES-DEMO-001', '',
  ].join('\n'));
  await writeFile(join(root, 'src/demo.ts'), [
    '/** @id CODE-DEMO-001', ` * @implements ${requirementId}`,
    ' * @design DES-DEMO-001', ' */', 'export const demo = () => 1;', '',
  ].join('\n'));
  await writeFile(join(root, 'tests/demo.test.ts'), [
    '/** @id TEST-DEMO-001', ` * @verifies ${requirementId}`,
    ' * @design DES-DEMO-001', ' */', 'export const expected = 1;', '',
  ].join('\n'));
  return root;
}

async function createControlRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'musubix5-config-control-'));
  roots.push(root);
  await mkdir(join(root, '.musubix/evidence'), { recursive: true });
  await writeFile(join(root, configPath), '{"schemaVersion":1,"control":1}\n');
  await writeFile(join(root, '.musubix/evidence/changes.json'), JSON.stringify({
    schemaVersion: 1,
    changes: [{
      changeId, generation: 1, activeGeneration: 1,
      requirementIds: [requirementId], tddBatches: [],
      phases: { design: {
        phase: 'design', order: 1, recordedAt: '2026-10-02T00:00:00.000Z',
        fingerprints: emptyFingerprints,
      } },
    }],
  }));
  await writeFile(join(root, '.musubix/evidence/tdd.json'),
    '{"schemaVersion":1,"cycles":[]}\n');
  await appendJournalRecord(root, {
    stream: 'normal', changeId, kind: 'fixture',
    idempotencyKey: 'config-fingerprint-history',
    payload: { sentinel: 'historical' },
  });
  await loadJournalRecords(root);
  return root;
}

async function currentFingerprints(root: string) {
  const { currentChangeFingerprints } = await import('../packages/analysis/src/change.js');
  return currentChangeFingerprints(root, changeId, [requirementId]);
}

async function workspaceFingerprints(controlRoot: string, sourceRoot: string) {
  const { workspaceChangeFingerprints } = await import('../packages/analysis/src/tdd.js');
  return workspaceChangeFingerprints(controlRoot, sourceRoot, changeId, [requirementId]);
}

afterEach(async () => {
  injectedReadFailure.path = null;
  vi.clearAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** @id TEST-M5-CONFIG-IMPLEMENTATION-FINGERPRINT-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-005 DES-M5-011 DES-M5-012 DES-M5-022
 */
it('TEST-M5-CONFIG-IMPLEMENTATION-FINGERPRINT-001 treats project config as a shared implementation input', async () => {
  const sourceRoot = await createSourceRoot();
  const controlRoot = await createControlRoot();
  const changesPath = join(controlRoot, '.musubix/evidence/changes.json');
  const journalPath = join(controlRoot, '.musubix/journal/normal/000000000001.json');
  const historicalChanges = await readFile(changesPath);
  const historicalJournal = await readFile(journalPath);
  expect(await loadJournalRecords(controlRoot)).toHaveLength(1);
  const before = await currentFingerprints(sourceRoot);
  const beforeWorkspace = await workspaceFingerprints(controlRoot, sourceRoot);

  await writeFile(join(controlRoot, configPath), '{"schemaVersion":1,"control":2}\n');
  expect(await workspaceFingerprints(controlRoot, sourceRoot)).toEqual(beforeWorkspace);

  await writeFile(join(sourceRoot, configPath), '{"schemaVersion":1,"source":1}\n');
  const after = await currentFingerprints(sourceRoot);
  const afterWorkspace = await workspaceFingerprints(controlRoot, sourceRoot);
  const beforeRequirement = before.requirementImplementations![requirementId]!;
  const afterRequirement = after.requirementImplementations![requirementId]!;
  const expectedPaths = [...new Set([...beforeRequirement.paths, configPath])].sort();
  const expectedImplementation =
    digest(JSON.stringify(await snapshot(sourceRoot, expectedPaths)));

  expect.soft(after.implementation).not.toBe(before.implementation);
  expect.soft(after.implementation).toBe(expectedImplementation);
  expect.soft(afterWorkspace.implementation).not.toBe(beforeWorkspace.implementation);
  expect.soft(afterWorkspace.implementation).toBe(expectedImplementation);
  expect.soft(afterRequirement.paths).toEqual(expectedPaths);
  expect.soft(afterWorkspace.requirementImplementations![requirementId]!.paths)
    .toEqual(expectedPaths);
  expect.soft(afterRequirement.paths.filter((path) => path === configPath)).toHaveLength(1);
  expect.soft(afterRequirement.fingerprints).not.toEqual(beforeRequirement.fingerprints);
  expect(after.requirements).toBe(before.requirements);
  expect(after.design).toBe(before.design);
  expect(after.tests).toBe(before.tests);

  await rm(join(sourceRoot, configPath));
  expect(await currentFingerprints(sourceRoot)).toEqual(before);
  expect(await workspaceFingerprints(controlRoot, sourceRoot)).toEqual(beforeWorkspace);

  const external = join(sourceRoot, 'external-config.json');
  await writeFile(external, '{"schemaVersion":1}\n');
  await symlink(external, join(sourceRoot, configPath));
  await expect.soft(currentFingerprints(sourceRoot)).rejects.toThrow(invalidConfigMessage);
  await expect.soft(workspaceFingerprints(controlRoot, sourceRoot))
    .rejects.toThrow(invalidConfigMessage);

  await rm(join(sourceRoot, configPath));
  await mkdir(join(sourceRoot, configPath));
  await expect.soft(currentFingerprints(sourceRoot)).rejects.toThrow(invalidConfigMessage);
  await expect.soft(workspaceFingerprints(controlRoot, sourceRoot))
    .rejects.toThrow(invalidConfigMessage);

  await rm(join(sourceRoot, configPath), { recursive: true });
  await writeFile(join(sourceRoot, configPath), '{"schemaVersion":1}\n');
  injectedReadFailure.path = resolve(sourceRoot, configPath);
  await expect.soft(currentFingerprints(sourceRoot)).rejects.toThrow(invalidConfigMessage);
  await expect.soft(workspaceFingerprints(controlRoot, sourceRoot))
    .rejects.toThrow(invalidConfigMessage);
  injectedReadFailure.path = null;

  expect(await readFile(changesPath)).toEqual(historicalChanges);
  expect(await readFile(journalPath)).toEqual(historicalJournal);
});
