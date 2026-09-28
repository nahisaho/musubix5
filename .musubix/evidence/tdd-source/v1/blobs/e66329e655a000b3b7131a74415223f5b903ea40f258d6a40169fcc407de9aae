import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { digest } from '../packages/analysis/src/files.js';
import { install } from '../packages/cli/src/install.js';
import {
  createParallelFixture,
  fixtureParallelPolicy,
  repositoryRoot,
  type ParallelFixture,
  writeFixtureFile,
} from './fixtures/parallel-runtime-fixture.js';

const fixtures: ParallelFixture[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.dispose();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('CHANGE-0003 generation 5 scaffold parallel policy', () => {
  /** @id TEST-M5-PARALLEL-SCAFFOLD-PROVISION-001
   * @verifies REQ-M5-PARALLEL-002 REQ-M5-PARALLEL-007 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-013
   */
  it('TEST-M5-PARALLEL-SCAFFOLD-PROVISION-001 scaffolds a dependency-capable provision command and documents provisionCommands', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-parallel-scaffold-'));
    temporaryDirectories.push(root);
    await install(root, repositoryRoot(), { feature: 'sample' });
    const design = readFileSync(join(root, '.musubix/features/sample/design.md'), 'utf8');
    const declaration = design.split(/\r?\n/)
      .map((line) => /^Parallel-Policy:\s*(.*)$/.exec(line))
      .find((match) => match !== null);
    expect(declaration).not.toBeUndefined();
    const policy = JSON.parse(declaration![1]!) as {
      provisionCommands: Array<{ name: string; command: string; args: string[]; timeoutMs: number }>;
    };
    expect(policy.provisionCommands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'npm-ci',
        command: 'npm',
        args: ['ci', '--ignore-scripts'],
      }),
    ]));
    expect(readFileSync(join(repositoryRoot(), 'README.md'), 'utf8')).toContain('provisionCommands');
    expect(readFileSync(join(repositoryRoot(), 'README-ja.md'), 'utf8')).toContain('provisionCommands');
  });

  /** @id TEST-M5-PARALLEL-POLICY-OWNERSHIP-001
   * @verifies REQ-M5-PARALLEL-001 REQ-M5-PARALLEL-002 REQ-M5-PARALLEL-013
   */
  it('TEST-M5-PARALLEL-POLICY-OWNERSHIP-001 selects the active feature policy from a multi-design approval manifest', async () => {
    const activeDesign = '.musubix/features/consumer-owned-feature/design.md';
    const otherDesign = '.musubix/features/unrelated-feature/design.md';
    const fixture = await createParallelFixture({ consumerDesignPath: activeDesign });
    fixtures.push(fixture);
    const unrelatedPolicy = {
      ...fixtureParallelPolicy,
      provisionCommands: [{
        name: 'other-install',
        command: 'other-package-manager',
        args: ['install'],
        timeoutMs: 10_000,
      }],
    };
    const unrelatedSource = `# Unrelated design\n\nParallel-Policy: ${JSON.stringify(unrelatedPolicy)}\n`;
    writeFixtureFile(fixture.root, otherDesign, unrelatedSource);
    const approvalPath = join(fixture.root, '.musubix/evidence/approvals/design.json');
    const approval = JSON.parse(readFileSync(approvalPath, 'utf8')) as {
      artifacts: Record<string, string>;
    };
    approval.artifacts[otherDesign] = digest(unrelatedSource);
    writeFixtureFile(fixture.root, '.musubix/evidence/approvals/design.json', approval);
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');

    await expect(runtime.validateParallelPlanFile(fixture.root, fixture.planFile))
      .resolves.toMatchObject({
        policy: {
          provisionCommands: [],
        },
      });
  });
});
