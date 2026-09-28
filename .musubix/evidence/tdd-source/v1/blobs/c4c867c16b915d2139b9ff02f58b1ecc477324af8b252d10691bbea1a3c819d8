import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('../packages/analysis/src/approval.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../packages/analysis/src/approval.js')>();
  return {
    ...actual,
    validateApprovals: async () => ({
      schemaVersion: 1 as const,
      mode: 'compatible' as const,
      present: false,
      valid: true,
      stages: [],
      diagnostics: [],
    }),
  };
});

import { defaultConfig } from '../packages/analysis/src/config.js';
import {
  evidenceSnapshot,
  projectStatus,
} from '../packages/analysis/src/gate.js';
import {
  evidenceChronologyViolations,
  evidenceSelectorViolations,
} from './helpers/evidence-selector-architecture.js';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const fixtureRoot = resolve(repositoryRoot, '.test-work');
const temporaryDirectories: string[] = [];

function write(root: string, path: string, content: unknown): void {
  const target = join(root, path);
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(
    target,
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`,
  );
}

function temporaryFixture(prefix: string): string {
  mkdirSync(fixtureRoot, { recursive: true });
  const root = mkdtempSync(join(fixtureRoot, prefix));
  temporaryDirectories.push(root);
  return root;
}

function architectureFixture(): string {
  const root = temporaryFixture('evidence-selector-architecture-');
  write(root, 'packages/renamed/src/alias-consumer.ts', [
    "import { evidenceInputPaths as selectPaths } from '../../analysis/src/files.js';",
    "import * as selectors from '../../analysis/src/files.js';",
    '',
    'export const selected = [',
    "  selectPaths(['one.ts']),",
    "  selectors.evidenceInputPaths(['two.ts']),",
    "  selectors['evidenceInputPaths'](['three.ts']),",
    '];',
    '',
  ].join('\n'));
  write(root, 'packages/example/src/direct-consumer.ts', [
    "import { evidenceInputPaths } from '../../analysis/src/files.js';",
    '',
    "export const first = evidenceInputPaths(['one.ts']);",
    "export const second = evidenceInputPaths(['two.ts']);",
    '',
  ].join('\n'));
  write(root, 'packages/safe/src/lookalikes.ts', [
    '// evidenceInputPaths is intentionally unrelated.',
    "const selectorName = 'evidenceInputPaths';",
    'type SelectorShape = { evidenceInputPaths(paths: string[]): string[] };',
    'function evidenceInputPaths(paths: string[]): string[] {',
    '  return paths;',
    '}',
    'export { evidenceInputPaths, selectorName };',
    '',
  ].join('\n'));
  write(root, 'packages/analysis/src/index.ts', "export * from './files.js';\n");
  write(root, 'packages/analysis/src/files.ts', [
    'export function evidenceInputPaths(paths: string[]): string[] {',
    "  return paths.filter((path) => path.endsWith('.ts'));",
    '}',
    '',
    'export async function evidenceInputs(root: string): Promise<string[]> {',
    "  return evidenceInputPaths([`${root}/index.ts`]);",
    '}',
    '',
  ].join('\n'));
  return root;
}

function chronologyFixture(): string {
  const root = temporaryFixture('evidence-selector-chronology-');
  write(root, 'packages/analysis/src/change-evidence.ts', [
    "import { selectCurrentTddCycle } from './tdd-cycle-resolver.js';",
    '',
    'export function selectCurrentChangeTddCycle(change: unknown) {',
    '  return selectCurrentTddCycle(change);',
    '}',
    '',
  ].join('\n'));
  write(root, 'packages/analysis/src/tdd-cycle-resolver.ts', [
    'type Entry = { order: number; recordedAt: string };',
    '',
    'export function selectCurrentTddCycle(entries: Entry[]) {',
    '  return [...entries].sort((left, right) =>',
    '    right.order - left.order',
    '    || right.recordedAt.localeCompare(left.recordedAt))[0];',
    '}',
    '',
  ].join('\n'));
  return root;
}

function statusFixture(recognized: boolean): string {
  const root = temporaryFixture('evidence-selector-status-');
  write(root, 'package.json', {
    name: recognized ? 'musubix5' : 'consumer',
    repository: {
      type: 'git',
      url: 'https://github.com/nahisaho/musubix5.git',
    },
  });
  write(root, '.musubix/config.json', {
    ...defaultConfig,
    approval: { mode: 'compatible', domains: [] },
  });
  write(root, '.musubix/constitution.md', '# Constitution\n');
  write(root, '.musubix/features/sample/requirements.md', [
    '## REQ-SAMPLE-001: Sample requirement',
    'Priority: must',
    'Type: functional',
    'Statement: The system shall provide a sample.',
    'Acceptance: The sample exists.',
    '',
  ].join('\n'));
  write(root, '.musubix/features/sample/design.md', [
    '## DES-SAMPLE-001: Sample design',
    'Responsibilities: Provide a sample.',
    'Interfaces: `sample()`.',
    'Constraints: Deterministic.',
    'Requirements: REQ-SAMPLE-001',
    'ADRs: ADR-0001',
    '',
  ].join('\n'));
  write(root, '.musubix/decisions/ADR-0001.md', '# ADR-0001: Sample\n');
  write(root, '.github/skills/example/SKILL.md', '# Skill\n');
  write(root, '.github/skills/example/notes.md', '# Notes\n');
  write(root, 'src/example.ts', 'export const example = true;\n');
  return root;
}

async function recordPassingQuality(root: string): Promise<void> {
  const fingerprints = await evidenceSnapshot(root);
  write(root, '.musubix/evidence/quality.json', {
    schemaVersion: 1,
    generatedAt: '2026-09-26T00:00:00.000Z',
    status: 'pass',
    checks: [{
      name: 'focused-test',
      status: 'pass',
      required: true,
      message: 'Focused evidence selector guard passed.',
    }],
    metrics: {},
    mode: 'full',
    feature: null,
    changed: null,
    impacted: [],
    lastChangeAnalysis: null,
    fingerprints,
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('evidence selector guards', () => {
  /**
   * @id TEST-M5-WAVE1-EVIDENCE-GUARDS-001
   * @verifies REQ-M5-WAVE1-EVIDENCE-001 REQ-M5-WAVE1-EVIDENCE-002
   */
  it('TEST-M5-WAVE1-EVIDENCE-GUARDS-001 enforces selector architecture and Skill-only staleness', async () => {
    const syntheticRoot = architectureFixture();
    await expect(evidenceSelectorViolations(syntheticRoot)).resolves.toEqual([
      'packages/example/src/direct-consumer.ts',
      'packages/renamed/src/alias-consumer.ts',
    ]);
    await expect(evidenceSelectorViolations(repositoryRoot)).resolves.toEqual([]);

    const syntheticChronologyRoot = chronologyFixture();
    await expect(evidenceChronologyViolations(syntheticChronologyRoot)).resolves.toEqual([
      'packages/analysis/src/tdd-cycle-resolver.ts#selectCurrentTddCycle:recordedAt',
    ]);
    await expect(evidenceChronologyViolations(repositoryRoot)).resolves.toEqual([]);

    const recognizedRoot = statusFixture(true);
    await recordPassingQuality(recognizedRoot);
    await expect(projectStatus(recognizedRoot)).resolves.toMatchObject({
      gate: { status: 'pass', ready: true },
    });
    write(recognizedRoot, '.github/skills/example/SKILL.md', '# Changed Skill\n');
    await expect(projectStatus(recognizedRoot)).resolves.toMatchObject({
      gate: { status: 'stale', ready: false },
    });

    const notesRoot = statusFixture(true);
    await recordPassingQuality(notesRoot);
    write(notesRoot, '.github/skills/example/notes.md', '# Changed Notes\n');
    await expect(projectStatus(notesRoot)).resolves.toMatchObject({
      gate: { status: 'pass', ready: true },
    });

    const consumerRoot = statusFixture(false);
    await recordPassingQuality(consumerRoot);
    write(consumerRoot, '.github/skills/example/SKILL.md', '# Changed Skill\n');
    await expect(projectStatus(consumerRoot)).resolves.toMatchObject({
      gate: { status: 'pass', ready: true },
    });
  });
});
