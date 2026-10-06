import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createCandidateSlotLedger, validateCandidateSlotLedger } from '../packages/analysis/src/candidate-execution-plan.js';

/** @id TEST-M5-CI-COUNTED-FIXTURE-001
 * @verifies REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-002
 */
it('TEST-M5-CI-COUNTED-FIXTURE-001 counts synchronous and asynchronous fixture child lifecycles without leaking slots', async () => {
  const helper = await import('./fixtures/counted-process.js');
  const root = join(process.cwd(), '.musubix/cache/counted-fixture');
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const ledger = await createCandidateSlotLedger(root, 'fixture-nonce', 16);
  const path = join(root, 'ledger.json');
  await writeFile(path, JSON.stringify(ledger));
  const env = { ...process.env, CANDIDATE_DISPATCH_NONCE: ledger.nonce, MUSUBIX5_CANDIDATE_SLOT_LEDGER: path,
    MUSUBIX5_CANDIDATE_PARTITION: 'fixture' };
  try {
    expect(helper.execFileSync(process.execPath, ['-e', 'process.stdout.write("sync")'], { env, encoding: 'utf8' })).toBe('sync');
    const child = helper.spawn(process.execPath, ['-e', 'process.exit(0)'], { env, stdio: 'ignore' });
    await new Promise<void>((accept, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? accept() : reject(new Error('child'))); });
    const result = await validateCandidateSlotLedger(ledger);
    expect(result.maximum).toBe(1);
    expect(result.observations.map(observation => observation.action)).toEqual(['acquire', 'release', 'acquire', 'release']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
