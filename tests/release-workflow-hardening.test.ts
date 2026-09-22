import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { isTraceSource } from '../packages/analysis/src/files.js';

type WorkflowStep = {
  id?: string;
  name?: string;
  uses?: string;
  if?: string;
  env?: Record<string, string>;
  run?: string;
  with?: Record<string, unknown>;
};

type WorkflowJob = {
  if?: string;
  environment?: string;
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  steps: WorkflowStep[];
};

describe('release workflow hardening', () => {
  it('enforces side-effect, authorization, artifact, and registry safeguards', () => {
    const workflowText = readFileSync(resolve('.github/workflows/release.yml'), 'utf8');
    const workflow = parse(workflowText) as { jobs: Record<string, WorkflowJob> };

    expect(workflow.jobs.release!.if).toBe(
      "github.event_name == 'workflow_dispatch' && inputs.release_operation_id != ''",
    );
    expect(workflow.jobs.publish!.if).toBe(
      "github.event_name == 'workflow_dispatch' && inputs.publish_operation_id != ''",
    );
    expect(workflow.jobs.validate!.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.bundle!.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
    });
    expect(workflow.jobs.release!.permissions).toEqual({ contents: 'write' });
    expect(workflow.jobs.publish!.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
    });
    expect(workflow.jobs.publish!.environment).toBe('npm-publish');

    const allRuns = Object.values(workflow.jobs)
      .flatMap((job) => job.steps)
      .map((step) => step.run ?? '');
    expect(allRuns.some((run) => run.includes('${{ inputs.release_operation_id }}'))).toBe(false);
    expect(allRuns.some((run) => run.includes('${{ inputs.publish_operation_id }}'))).toBe(false);

    const context = workflow.jobs.validate!.steps.find((step) => step.id === 'context')!;
    expect(context.env).toMatchObject({
      RELEASE_OPERATION_ID: '${{ inputs.release_operation_id }}',
      PUBLISH_OPERATION_ID: '${{ inputs.publish_operation_id }}',
    });
    expect(context.run).toContain('^[A-Za-z0-9][A-Za-z0-9._-]*$');

    for (const [jobName, input] of [
      ['release', '${{ inputs.release_operation_id }}'],
      ['publish', '${{ inputs.publish_operation_id }}'],
    ] as const) {
      const verify = workflow.jobs[jobName]!.steps.find((step) =>
        step.name?.startsWith('Verify '))!;
      expect(verify.env).toMatchObject({ OPERATION_ID: input });
      expect(verify.run).toContain('^[A-Za-z0-9][A-Za-z0-9._-]*$');
      expect(verify.run).toContain('"$OPERATION_ID"');
    }

    const upload = workflow.jobs.bundle!.steps.find((step) =>
      step.name === 'Upload run-scoped sealed bundle')!;
    expect(upload.with).toMatchObject({
      name: 'release-bundle-${{ github.run_id }}',
      overwrite: true,
    });
    expect(String(upload.with?.name)).not.toContain('run_attempt');
    for (const jobName of ['release', 'publish']) {
      const download = workflow.jobs[jobName]!.steps.find((step) =>
        step.uses === 'actions/download-artifact@v4')!;
      expect(download.with?.name).toBe('release-bundle-${{ github.run_id }}');
    }

    const releaseSteps = workflow.jobs.release!.steps;
    const targetValidation = releaseSteps.find((step) =>
      step.name === 'Verify checksums, attestation, authorization, and target');
    expect(targetValidation?.env).toMatchObject({ GH_TOKEN: '${{ github.token }}' });
    expect(targetValidation?.run).toContain('RELEASE_TARGET_LOOKUP_FAILED');
    expect(targetValidation?.run).toContain('release not found');

    for (const jobName of ['release', 'publish']) {
      const steps = workflow.jobs[jobName]!.steps;
      const record = steps.find((step) => String(step.name).startsWith('Record terminal'));
      const upload = steps.find((step) => String(step.name).startsWith('Upload terminal'));
      expect(record?.if).toBe('always()');
      expect(record?.run).toContain('GITHUB_STEP_SUMMARY');
      expect(upload?.if).toBe('always()');
      expect(upload?.with).toMatchObject({ 'if-no-files-found': 'error' });
    }

    expect(workflowText).toContain('postPublicationIntegrityFailure');
    expect(workflowText).toContain('INTEGRITY_OUTCOME');

    const registry = workflow.jobs.publish!.steps.find((step) =>
      step.id === 'registry_integrity')!;
    expect(registry.env).toMatchObject({
      RELEASE_TAG: '${{ needs.validate.outputs.release_tag }}',
    });
    expect(registry.run).toContain('version="${RELEASE_TAG#v}"');
    expect(registry.run).toContain('for attempt in 1 2 3 4 5');
    expect(registry.run).toContain('sleep $((attempt * 3))');
    expect(registry.run).toContain('^sha512-[A-Za-z0-9+/]+={0,2}$');
    expect(registry.run).toContain('RELEASE_REGISTRY_VISIBILITY_FAILED');
    expect(registry.run).toContain('RELEASE_REGISTRY_INTEGRITY_MISMATCH');
    expect(registry.run).toContain('npm view "musubix5@$version"');

    expect(workflowText).toContain('# @id CODE-M5-RELEASE-WORKFLOW-YAML-001');
    expect(workflowText).toContain('# @implements REQ-M5-RELEASE-003');
    expect(workflowText).toContain('# @design DES-M5-020');
    expect(isTraceSource('.github/workflows/release.yml')).toBe(true);
  });
});
