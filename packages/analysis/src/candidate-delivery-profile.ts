/** @id CODE-M5-LINUX-DELIVERY-PROFILE-001
 * @implements REQ-M5-LINUX-DELIVERY-001 REQ-M5-LINUX-DELIVERY-002 REQ-M5-LINUX-DELIVERY-004
 * @design DES-M5-LINUX-DELIVERY-001 DES-M5-LINUX-DELIVERY-002 DES-M5-LINUX-DELIVERY-004
 */
export const LINUX_DELIVERY_PROFILE = Object.freeze({
  profile: 'linux-only-v1',
  os: 'ubuntu',
  nodeMajor: 24,
} as const);

function invalid(reason: string): never {
  throw new Error(`LINUX_DELIVERY_EVIDENCE_INVALID: ${reason}`);
}

function boundRunId(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const id = (value as Record<string, unknown>).id;
  return Number.isSafeInteger(id) ? id as number : undefined;
}

export function validateLinuxDeliveryProfile(value: unknown): typeof LINUX_DELIVERY_PROFILE {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('delivery profile');
  const profile = value as Record<string, unknown>;
  if (Object.keys(profile).sort().join() !== ['nodeMajor', 'os', 'profile'].sort().join()
    || profile.profile !== LINUX_DELIVERY_PROFILE.profile
    || profile.os !== LINUX_DELIVERY_PROFILE.os
    || profile.nodeMajor !== LINUX_DELIVERY_PROFILE.nodeMajor) invalid('delivery profile');
  return LINUX_DELIVERY_PROFILE;
}

/** @id CODE-M5-LINUX-RUN-INVENTORY-001
 * @implements REQ-M5-LINUX-DELIVERY-001 REQ-M5-LINUX-DELIVERY-002 REQ-M5-LINUX-DELIVERY-003 REQ-M5-LINUX-DELIVERY-004
 * @design DES-M5-LINUX-DELIVERY-001 DES-M5-LINUX-DELIVERY-003 DES-M5-LINUX-DELIVERY-004
 */
export function validateSingleUbuntuRunInventory(
  jobs: Array<Record<string, unknown>>,
  artifacts: Array<Record<string, unknown>>,
  mode: 'candidate' | 'calibration',
  runId: number,
): { jobId: number; artifactId: number } {
  if (!Number.isSafeInteger(runId) || jobs.length !== 1 || artifacts.length !== 1) {
    invalid('exactly one Ubuntu job and artifact');
  }
  const job = jobs[0]!;
  const artifact = artifacts[0]!;
  const expectedArtifact = `candidate-${mode === 'candidate' ? 'gate' : 'calibration'}-ubuntu-node24`;
  if (job.name !== 'ubuntu-node24' || artifact.name !== expectedArtifact
    || job.run_id !== runId || boundRunId(artifact.workflow_run) !== runId
    || !Number.isSafeInteger(job.id) || !Number.isSafeInteger(artifact.id)) {
    invalid('Ubuntu job or artifact identity');
  }
  return { jobId: job.id as number, artifactId: artifact.id as number };
}
