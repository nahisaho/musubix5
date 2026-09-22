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
    const releaseText = readFileSync(resolve('.github/workflows/release.yml'), 'utf8');
    const releaseWorkflow = parse(releaseText) as { jobs: Record<string, WorkflowJob> };
    const publishText = readFileSync(resolve('.github/workflows/npm-publish.yml'), 'utf8');
    const publishWorkflow = parse(publishText) as { jobs: Record<string, WorkflowJob> };
    const publish = publishWorkflow.jobs.publish!;

    expect(releaseWorkflow.jobs.release!.if).toBe("github.event_name == 'workflow_dispatch'");
    expect(releaseWorkflow.jobs.publish).toBeUndefined();
    expect(releaseWorkflow.jobs.validate!.permissions).toEqual({ contents: 'read' });
    expect(releaseWorkflow.jobs.bundle!.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
    });
    expect(releaseWorkflow.jobs.release!.permissions).toEqual({ contents: 'write' });
    expect(publish.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
    });
    expect(publish.environment).toBe('npm-publish');

    const releaseRuns = Object.values(releaseWorkflow.jobs)
      .flatMap((job) => job.steps)
      .map((step) => step.run ?? '');
    expect(releaseRuns.some((run) => run.includes('${{ inputs.release_operation_id }}'))).toBe(false);

    const context = releaseWorkflow.jobs.validate!.steps.find((step) => step.id === 'context')!;
    expect(context.env).toMatchObject({
      RELEASE_OPERATION_ID: '${{ inputs.release_operation_id }}',
    });
    expect(context.run).toContain('^[A-Za-z0-9][A-Za-z0-9._-]*$');

    const releaseVerify = releaseWorkflow.jobs.release!.steps.find((step) =>
      step.name?.startsWith('Verify '))!;
    expect(releaseVerify.env).toMatchObject({
      OPERATION_ID: '${{ inputs.release_operation_id }}',
    });
    expect(releaseVerify.run).toContain('"$OPERATION_ID"');
    const publishVerify = publish.steps.find((step) => step.id === 'verify_assets')!;
    expect(publishVerify.env).toMatchObject({
      PUBLISH_OPERATION_ID: '${{ inputs.publish_operation_id }}',
    });
    expect(publishVerify.run).toContain('"$PUBLISH_OPERATION_ID"');

    const upload = releaseWorkflow.jobs.bundle!.steps.find((step) =>
      step.name === 'Upload run-scoped sealed bundle')!;
    expect(upload.with).toMatchObject({
      name: 'release-bundle-${{ github.run_id }}',
      overwrite: true,
    });
    expect(String(upload.with?.name)).not.toContain('run_attempt');
    const download = releaseWorkflow.jobs.release!.steps.find((step) =>
      step.uses === 'actions/download-artifact@v4')!;
    expect(download.with?.name).toBe('release-bundle-${{ github.run_id }}');
    expect(publishText).toContain('gh release download');

    const releaseSteps = releaseWorkflow.jobs.release!.steps;
    const targetValidation = releaseSteps.find((step) =>
      step.name === 'Verify checksums, attestation, authorization, and target');
    expect(targetValidation?.env).toMatchObject({ GH_TOKEN: '${{ github.token }}' });
    expect(targetValidation?.run).toContain('RELEASE_TARGET_LOOKUP_FAILED');
    expect(targetValidation?.run).toContain('gh api --include');
    expect(targetValidation?.run).toContain('gh api --paginate --slurp');
    expect(targetValidation?.run).not.toContain('release not found');

    for (const steps of [releaseSteps, publish.steps]) {
      const record = steps.find((step) => String(step.name).startsWith('Record terminal'));
      const upload = steps.find((step) => String(step.name).startsWith('Upload terminal'));
      expect(record?.if).toBe('always()');
      expect(record?.run).toContain('GITHUB_STEP_SUMMARY');
      expect(upload?.if).toBe('always()');
      expect(upload?.with).toMatchObject({ 'if-no-files-found': 'error' });
    }

    expect(publishText).toContain('manualReconciliationRequired');
    expect(publishText).toContain('INTEGRITY_OUTCOME');

    const registry = publish.steps.find((step) =>
      step.id === 'registry_integrity')!;
    expect(registry.env).toMatchObject({
      RELEASE_TAG: '${{ inputs.release_tag }}',
    });
    expect(registry.run).toContain('version="${RELEASE_TAG#v}"');
    expect(registry.run).toContain('for attempt in 1 2 3 4 5 6');
    expect(registry.run).toContain('deadline=$((SECONDS + 240))');
    expect(registry.run).toContain(
      'timeout --signal=TERM --kill-after=2s 15s npm view',
    );
    expect(registry.run).toContain('^sha512-[A-Za-z0-9+/]+={0,2}$');
    const verifyAssets = publish.steps.find((step) => step.id === 'verify_assets')!;
    expect(verifyAssets.run).toContain('classifyNpmRegistryQuery');
    expect(registry.run).toContain('RELEASE_PUBLISH_INTEGRITY_MISMATCH');
    expect(registry.run).toContain('npm view "musubix5@$version"');

    expect(releaseText).toContain('# @id CODE-M5-RELEASE-WORKFLOW-YAML-001');
    expect(releaseText).toContain('# @implements REQ-M5-RELEASE-003');
    expect(releaseText).toContain('# @design DES-M5-020');
    expect(publishText).toContain('# @id CODE-M5-NPM-PUBLISH-WORKFLOW-YAML-001');
    expect(publishText).toContain('# @implements REQ-M5-RELEASE-004');
    expect(publishText).toContain('# @design DES-M5-021');
    expect(isTraceSource('.github/workflows/release.yml')).toBe(true);
    expect(isTraceSource('.github/workflows/npm-publish.yml')).toBe(true);
  });
});
