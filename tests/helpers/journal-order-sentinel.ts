import { appendJournalRecord } from '../../packages/analysis/src/journal.js';

export async function appendTimestampSentinel(
  _repositoryRoot: string,
  root: string,
): Promise<void> {
  await appendJournalRecord(root, {
    stream: 'normal',
    changeId: 'CHANGE-0001',
    kind: 'test-transition',
    idempotencyKey: 'worker-8-timestamp-sentinel',
    payload: { worker: 8, timestamp: 0 },
  });
}
