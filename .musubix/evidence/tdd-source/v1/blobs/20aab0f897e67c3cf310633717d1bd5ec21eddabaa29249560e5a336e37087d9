import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const matchingSri = `sha512-${Buffer.from('matching registry integrity').toString('base64')}`;

function missing() {
  return {
    exitCode: 1,
    stdout: JSON.stringify({ error: { code: 'E404' } }),
  };
}

describe('npm registry deadline verification', () => {
  /**
   * @id TEST-M5-WAVE1-PUBLISH-DEADLINE-001
   * @verifies REQ-M5-WAVE1-PUBLISH-001
   */
  it('TEST-M5-WAVE1-PUBLISH-DEADLINE-001 retries E404 until the deadline and fails closed otherwise', async () => {
    const {
      DEFAULT_REGISTRY_INTEGRITY_POLICY,
      runRegistryIntegrityVerification,
    } =
      // @ts-expect-error The production verifier intentionally remains a committed ESM script.
      await import('../scripts/verify-npm-registry-integrity.mjs');
    let elapsedMs = 0;
    let queries = 0;
    const sleeps: number[] = [];
    const success = await runRegistryIntegrityVerification({
      packageSpec: 'musubix5@0.2.0',
      localSri: matchingSri,
      policy: DEFAULT_REGISTRY_INTEGRITY_POLICY,
      now: () => elapsedMs,
      query: async () => {
        queries += 1;
        elapsedMs += 1_000;
        return queries <= 6
          ? missing()
          : { exitCode: 0, stdout: JSON.stringify(matchingSri) };
      },
      sleep: async (milliseconds: number) => {
        sleeps.push(milliseconds);
        elapsedMs += milliseconds;
      },
    });

    expect(queries).toBe(7);
    expect(sleeps).toEqual([5, 10, 15, 20, 25, 25].map((seconds) => seconds * 1_000));
    expect(success).toMatchObject({
      published: true,
      registryVisible: true,
      integrityMatched: true,
      manualReconciliationRequired: false,
      registrySri: matchingSri,
    });

    for (const fixture of [
      { result: { exitCode: 0, stdout: JSON.stringify('invalid') }, registryVisible: true },
      {
        result: {
          exitCode: 0,
          stdout: JSON.stringify(`sha512-${Buffer.from('different').toString('base64')}`),
        },
        registryVisible: true,
      },
      {
        result: { exitCode: 1, stdout: JSON.stringify({ error: { code: 'E500' } }) },
        registryVisible: false,
      },
    ]) {
      const failure = await runRegistryIntegrityVerification({
        packageSpec: 'musubix5@0.2.0',
        localSri: matchingSri,
        policy: DEFAULT_REGISTRY_INTEGRITY_POLICY,
        now: () => 0,
        query: async () => fixture.result,
        sleep: async () => {
          throw new Error('terminal failures must not sleep');
        },
      });
      expect(failure).toMatchObject({
        published: true,
        registryVisible: fixture.registryVisible,
        integrityMatched: false,
        manualReconciliationRequired: true,
      });
      expect(failure).not.toHaveProperty('registrySri');
    }

    let deadlineClock = 0;
    let deadlineQueries = 0;
    const deadline = await runRegistryIntegrityVerification({
      packageSpec: 'musubix5@0.2.0',
      localSri: matchingSri,
      policy: {
        ...DEFAULT_REGISTRY_INTEGRITY_POLICY,
        registryInnerDeadlineSeconds: 40,
      },
      now: () => deadlineClock,
      query: async () => {
        deadlineQueries += 1;
        deadlineClock += 1_000;
        return missing();
      },
      sleep: async (milliseconds: number) => {
        deadlineClock += milliseconds;
      },
    });
    expect(deadlineQueries).toBe(4);
    expect(deadline).toMatchObject({
      published: true,
      registryVisible: false,
      integrityMatched: false,
      manualReconciliationRequired: true,
      reason: 'deadline-exhausted',
    });

    let completionClock = 0;
    const lateMatch = await runRegistryIntegrityVerification({
      packageSpec: 'musubix5@0.2.0',
      localSri: matchingSri,
      policy: DEFAULT_REGISTRY_INTEGRITY_POLICY,
      now: () => completionClock,
      query: async () => {
        completionClock = 240_001;
        return { exitCode: 0, stdout: JSON.stringify(matchingSri) };
      },
      sleep: async () => {
        throw new Error('a late visible result must be terminal');
      },
    });
    expect(lateMatch).toMatchObject({
      registryVisible: false,
      integrityMatched: false,
      manualReconciliationRequired: true,
      reason: 'deadline-exhausted',
    });

    let invalidPolicyQueried = false;
    const invalidPolicy = await runRegistryIntegrityVerification({
      packageSpec: 'musubix5@0.2.0',
      localSri: matchingSri,
      policy: {
        ...DEFAULT_REGISTRY_INTEGRITY_POLICY,
        registryBackoffSeconds: [],
      },
      now: () => 0,
      query: async () => {
        invalidPolicyQueried = true;
        return { exitCode: 0, stdout: JSON.stringify(matchingSri) };
      },
      sleep: async () => {},
    });
    expect(invalidPolicyQueried).toBe(false);
    expect(invalidPolicy).toMatchObject({
      registryVisible: false,
      integrityMatched: false,
      manualReconciliationRequired: true,
      reason: 'invalid-input',
    });

    const workflowText = readFileSync(resolve('.github/workflows/npm-publish.yml'), 'utf8');
    const workflow = parse(workflowText) as {
      jobs: { publish: { steps: Array<{ id?: string; run?: string }> } };
    };
    const registryStep = workflow.jobs.publish.steps.find(
      (step) => step.id === 'registry_integrity',
    )!;
    expect(registryStep.run).toContain('scripts/verify-npm-registry-integrity.mjs');
    expect(registryStep.run).toContain(
      'timeout --signal=TERM --kill-after=5s 260s node',
    );
    expect(registryStep.run).toContain(
      '--query-timeout-seconds 15 --query-kill-after-seconds 2',
    );
    expect(registryStep.run).toContain('--inner-deadline-seconds 240');
    expect(registryStep.run).toContain('--backoff-seconds 5,10,15,20,25');
    expect(registryStep.run).not.toContain('npm publish');
    expect(registryStep.run).not.toContain('for attempt in');
    expect(registryStep.run).toContain(
      'if [[ "$registry_loop_status" -eq 124 || "$registry_loop_status" -eq 137 ]]',
    );
  });
});
