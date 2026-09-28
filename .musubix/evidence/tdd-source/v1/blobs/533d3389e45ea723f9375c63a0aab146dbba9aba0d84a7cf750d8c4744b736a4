import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

type WorkflowStep = {
  id?: string;
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

describe('release repository target generation 15', () => {
  /**
   * @id TEST-M5-RELEASE-REPOSITORY-TARGET-001
   * @verifies REQ-M5-RELEASE-003 REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-REPOSITORY-TARGET-001 binds and classifies explicit GitHub Release targets', async () => {
    const { classifyReleaseTargetLookup } =
      await import('../packages/analysis/src/release-workflow.js');

    expect(classifyReleaseTargetLookup({
      exact: {
        exitCode: 0,
        statusCode: 200,
        release: { tagName: 'v0.1.1', draft: false, prerelease: false },
      },
    })).toBe('present-stable');
    expect(classifyReleaseTargetLookup({
      exact: {
        exitCode: 0,
        statusCode: 200,
        release: { tagName: 'v0.1.1', draft: false, prerelease: true },
      },
    })).toBe('present-draft-or-prerelease');
    expect(classifyReleaseTargetLookup({
      exact: { exitCode: 1, statusCode: 404 },
    })).toBe('absent');
    expect(classifyReleaseTargetLookup({
      exact: { exitCode: 1, statusCode: 404 },
      enumeration: { complete: true, releases: [] },
    })).toBe('absent');
    expect(classifyReleaseTargetLookup({
      exact: { exitCode: 1, statusCode: 404 },
      enumeration: {
        complete: true,
        releases: [
          { tagName: 'v0.1.1', draft: true, prerelease: false },
        ],
      },
    })).toBe('present-draft-or-prerelease');
    expect(classifyReleaseTargetLookup({
      exact: { exitCode: 1, statusCode: 404 },
      enumeration: { complete: false, releases: [] },
    })).toBe('lookup-failed');

    const releaseWorkflow = parse(
      readFileSync(resolve('.github/workflows/release.yml'), 'utf8'),
    ) as Workflow;
    const releaseStep = namedStep(
      releaseWorkflow,
      'Verify checksums, attestation, authorization, and target',
    );
    expect(releaseStep).toContain(
      'canonicalRepositoryIdentity(`https://github.com/${process.env.GITHUB_REPOSITORY}.git`)',
    );
    expect(releaseStep).toContain(
      'gh api --include "repos/$GITHUB_REPOSITORY/releases/tags/$RELEASE_TAG"',
    );
    expect(releaseStep).toContain(
      'gh api --paginate --slurp "repos/$GITHUB_REPOSITORY/releases?per_page=100"',
    );
    expect(releaseStep).toContain(
      'gh release create "$RELEASE_TAG" release-bundle/* --repo "$GITHUB_REPOSITORY"',
    );
    expect(releaseStep).not.toMatch(/release not found|HTTP 404: Not Found/i);

    const publishWorkflow = parse(
      readFileSync(resolve('.github/workflows/npm-publish.yml'), 'utf8'),
    ) as Workflow;
    const publishIdentity = namedStep(
      publishWorkflow,
      'Validate tag, stable Release, ancestry, and operation identity',
    );
    expect(publishIdentity.indexOf(
      'canonicalRepositoryIdentity(`https://github.com/${process.env.GITHUB_REPOSITORY}.git`)',
    )).toBeLessThan(publishIdentity.indexOf(
      'gh api --include "repos/$GITHUB_REPOSITORY/releases/tags/$RELEASE_TAG"',
    ));
    const download = namedStep(
      publishWorkflow,
      'Download authenticated GitHub Release assets',
    );
    expect(download).toContain(
      'gh release download "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --dir release-assets',
    );
    expect(download).toContain('RELEASE_TARGET_LOOKUP_FAILED');
  });
});
