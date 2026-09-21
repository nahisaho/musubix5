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
  });
});
