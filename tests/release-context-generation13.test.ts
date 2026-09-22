import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

type WorkflowStep = {
  name?: string;
  run?: string;
};

type Workflow = {
  jobs: Record<string, {
    steps?: WorkflowStep[];
  }>;
};

function namedStep(workflow: Workflow, name: string): string {
  const step = Object.values(workflow.jobs)
    .flatMap((job) => job.steps ?? [])
    .find((candidate) => candidate.name === name);
  expect(step, `missing workflow step: ${name}`).toBeDefined();
  return step?.run ?? '';
}

describe('release context generation 13', () => {
  /**
   * @id TEST-M5-RELEASE-003-CONTEXT-EQUALITY-001
   * @verifies REQ-M5-RELEASE-003
   */
  it('TEST-M5-RELEASE-003-CONTEXT-EQUALITY-001 accepts canonical equality independent of property insertion order', async () => {
    const { releaseContextBytes } =
      await import('../packages/analysis/src/release-workflow.js');
    const expected = {
      verifiedReleaseApprovalSha256: '3'.repeat(64),
      releaseTag: 'v0.1.1',
      workflow: '.github/workflows/release.yml' as const,
      candidateCommit: '1'.repeat(40),
      evidenceCommit: '2'.repeat(40),
      repository: `repository:${'4'.repeat(64)}`,
      mode: 'dispatch' as const,
      schemaVersion: 'release-context-v1' as const,
    };
    const sealed = releaseContextBytes({
      schemaVersion: 'release-context-v1',
      mode: 'dispatch',
      repository: `repository:${'4'.repeat(64)}`,
      candidateCommit: '1'.repeat(40),
      workflow: '.github/workflows/release.yml',
      releaseTag: 'v0.1.1',
      evidenceCommit: '2'.repeat(40),
      verifiedReleaseApprovalSha256: '3'.repeat(64),
    });
    expect(releaseContextBytes(expected)).toEqual(sealed);

    const workflow = parse(
      readFileSync(resolve('.github/workflows/release.yml'), 'utf8'),
    ) as Workflow;
    const buildStep = namedStep(
      workflow,
      'Build reproducible package and release context',
    );
    const verifyStep = namedStep(
      workflow,
      'Verify checksums, attestation, authorization, and target',
    );

    expect(buildStep).toContain("readFileSync('release-bundle/release-context.json')");
    expect(buildStep).toContain('releaseContextBytes(expected)');
    expect(buildStep).toContain('context-canonical-bytes');
    expect(verifyStep).toContain('bytes.equals(releaseContextBytes(expected))');
    expect(verifyStep).toContain("new TextDecoder('utf-8', { fatal: true })");
    expect(verifyStep).toContain('context-decode');
    expect(verifyStep).toContain('context-parse');
    expect(verifyStep).toContain('context-schema');
    expect(verifyStep).toContain('context-canonical-bytes');
    expect(buildStep).not.toMatch(
      /JSON\.stringify\((?:context|expected)\)/,
    );
    expect(verifyStep).not.toMatch(
      /JSON\.stringify\((?:context|expected)\)/,
    );
  });
});
