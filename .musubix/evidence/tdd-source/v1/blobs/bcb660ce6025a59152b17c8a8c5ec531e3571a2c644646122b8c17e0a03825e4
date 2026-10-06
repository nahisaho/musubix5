import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { candidateGateFingerprintConfig } from '../packages/analysis/src/candidate-gate.js';
import { canonicalBytes, sha256 } from '../packages/analysis/src/canonical.js';
import { testRuntimeProfile } from '../packages/analysis/src/test-runtime.js';

/** @id TEST-M5-CI-CALIBRATION-INPUT-CLOSURE-001
 * @verifies REQ-M5-CI-EFFICIENCY-002 REQ-M5-CI-EFFICIENCY-005
 * @design DES-M5-CI-EFFICIENCY-001 DES-M5-CI-EFFICIENCY-002
 */
it('TEST-M5-CI-CALIBRATION-INPUT-CLOSURE-001 closes plan and canonical absent/present calibration bytes in runtime and gate fingerprints', async () => {
  const plan = '.musubix/candidate-execution-plan.json';
  const manifest = '.musubix/candidate-timeout-calibration.json';
  expect(testRuntimeProfile.inputs).toContain(plan);
  expect(testRuntimeProfile.inputs).toContain(manifest);
  const root = await mkdtemp(join(process.cwd(), '.musubix/cache/calibration-input-'));
  try {
    const config = JSON.parse(await readFile('.musubix/config.json', 'utf8'));
    delete config.testRuntime.calibratedPlan;
    await mkdir(join(root, '.musubix'));
    await writeFile(join(root, '.musubix/config.json'), JSON.stringify(config));
    const absent = await candidateGateFingerprintConfig(root) as unknown as { candidateArtifactInputs: Record<string, string> };
    expect(absent.candidateArtifactInputs[manifest]).toBe(sha256(canonicalBytes({
      schemaVersion: 1, kind: 'candidate-artifact-absent-v1', path: manifest,
    })));
    await writeFile(join(root, manifest), '{}\n');
    const present = await candidateGateFingerprintConfig(root) as unknown as { candidateArtifactInputs: Record<string, string> };
    expect(present.candidateArtifactInputs[manifest]).toBe(sha256(Buffer.from('{}\n')));
    expect(present.candidateArtifactInputs[manifest]).not.toBe(absent.candidateArtifactInputs[manifest]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
