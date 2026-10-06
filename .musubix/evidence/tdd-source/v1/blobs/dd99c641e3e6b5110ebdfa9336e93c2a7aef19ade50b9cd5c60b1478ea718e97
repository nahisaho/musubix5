import { canonicalBytes, sha256 } from './canonical.js';

export interface CandidatePartitionDispatch {
  nonce: string; planDigest: string; command: string;
  partitions: Array<{ id: string; ordinal: number; wave: number; files: string[]; testIds: string[] }>;
}
export interface CandidatePartitionAcknowledgment {
  id: string; ordinal: number; wave: number; files: string[]; testIds: string[];
  nonce: string; planDigest: string; command: string; dispatchDigest: string;
  executionBinding: { command: string; args: string[] }; observedVitestArgs: string[];
  workers: Array<{ workerId: string; file: string }>; observedMaximum: number;
  status: string; exitCode: number | null; signal: string | null; failureStage: string | null;
  tests: Array<{ testId: string; status: string; nativeMessage: string }>;
}
export interface CandidatePartitionAcknowledgmentManifest {
  schemaVersion: 1; dispatchDigest: string; acknowledgments: Array<{ ordinal: number; path: string; digest: string }>;
}
export function candidatePartitionDispatchDigest(value: CandidatePartitionDispatch) { return sha256(canonicalBytes(value)); }
function fail(partition: string, reason: string): never { throw new Error(`CANDIDATE_PARTITION_INVALID: ${partition}: ${reason}`); }
function equal(a: unknown, b: unknown) { return sha256(canonicalBytes(a)) === sha256(canonicalBytes(b)); }

/** @id CODE-M5-CI-COMPOSITE-PARTITION-ACK-001
 * @implements REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-002
 * @design DES-M5-CI-EFFICIENCY-002
 */
export function validateCandidatePartitionAcknowledgments(
  dispatch: CandidatePartitionDispatch, values: unknown[], ledger: { maximum: number },
) {
  if (!Number.isSafeInteger(ledger.maximum) || ledger.maximum < 1 || ledger.maximum > 16) fail('ledger', 'slot capacity');
  const tests: CandidatePartitionAcknowledgment['tests'] = [], seenTests = new Set<string>();
  const seenFiles = new Set<string>(), seenWorkers = new Set<string>();
  if (values.length !== dispatch.partitions.length) fail(dispatch.partitions.find((p) =>
    !values.some((value) => (value as CandidatePartitionAcknowledgment)?.id === p.id))?.id ?? 'inventory', 'missing acknowledgment');
  for (const partition of dispatch.partitions) {
    const matches = values.filter((value) => (value as CandidatePartitionAcknowledgment)?.id === partition.id);
    if (matches.length !== 1) fail(partition.id, 'duplicate acknowledgment');
    const ack = matches[0] as CandidatePartitionAcknowledgment;
    if (ack.nonce !== dispatch.nonce || ack.planDigest !== dispatch.planDigest || ack.command !== dispatch.command
      || ack.dispatchDigest !== candidatePartitionDispatchDigest(dispatch) || ack.ordinal !== partition.ordinal
      || ack.wave !== partition.wave || !equal(ack.files, partition.files) || !equal(ack.testIds, partition.testIds)
      || ack.observedMaximum !== ledger.maximum || !ack.executionBinding?.command || !Array.isArray(ack.executionBinding.args)
      || !Array.isArray(ack.observedVitestArgs) || !partition.files.every((file) => ack.observedVitestArgs.includes(file))
      || !Array.isArray(ack.workers) || !Array.isArray(ack.tests)
      || ack.status !== 'completed' || ack.signal !== null || !Number.isInteger(ack.exitCode)) fail(partition.id, 'binding or process');
    for (const file of ack.files) {
      if (seenFiles.has(file)) fail(partition.id, 'duplicate file');
      seenFiles.add(file);
      if (!ack.workers.some((worker) => worker.file === file)) fail(partition.id, 'missing worker');
    }
    for (const worker of ack.workers) {
      if (!worker.workerId || seenWorkers.has(worker.workerId) || !ack.files.includes(worker.file)) fail(partition.id, 'worker inventory');
      seenWorkers.add(worker.workerId);
    }
    if (!equal([...ack.tests.map((test) => test.testId)].sort(), [...partition.testIds].sort())) fail(partition.id, 'test inventory');
    for (const test of [...ack.tests].sort((a, b) => Buffer.compare(Buffer.from(a.testId), Buffer.from(b.testId)))) {
      if (seenTests.has(test.testId) || !['passed', 'failed'].includes(test.status) || typeof test.nativeMessage !== 'string') fail(partition.id, 'test identity');
      seenTests.add(test.testId);
      tests.push(test);
    }
    if (ack.exitCode === 0 && ack.tests.some((test) => test.status === 'failed')) fail(partition.id, 'exit mismatch');
  }
  return { schemaVersion: 1, tests, exitCode: values.some((value) => (value as CandidatePartitionAcknowledgment).exitCode !== 0) ? 1 : 0 };
}
