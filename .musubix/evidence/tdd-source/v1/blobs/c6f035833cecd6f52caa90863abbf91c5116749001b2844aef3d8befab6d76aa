import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { createCandidateSlotLedger, acquireCandidateSlots, releaseCandidateSlots, validateCandidateSlotLedger } from '../packages/analysis/src/candidate-execution-plan.js';
import { createPortableTemporaryRoot } from '../packages/analysis/src/candidate-portability.js';
import { countedExecFileSync } from '../packages/analysis/src/process.js';

/** @id TEST-M5-CI-NATIVE-LEDGER-CHAIN-001
 * @verifies REQ-M5-CI-EFFICIENCY-002
 * @design DES-M5-CI-EFFICIENCY-002
 */
it('TEST-M5-CI-NATIVE-LEDGER-CHAIN-001 retains physical ancestor accounting when fixtures install their own logical ledger', async () => {
  const parent = resolve('.musubix/cache/fixture-root');
  await mkdir(parent, { recursive: true });
  const root = await createPortableTemporaryRoot(parent);
  const outer = await createCandidateSlotLedger(root, `outer-${randomUUID()}`, 16);
  const inner = await createCandidateSlotLedger(root, `inner-${randomUUID()}`, 16);
  const outerPath = resolve(root, 'outer.json'), innerPath = resolve(root, 'inner.json');
  await writeFile(outerPath, JSON.stringify(outer));
  await writeFile(innerPath, JSON.stringify(inner));
  const owner = await acquireCandidateSlots(outer, { nonce: outer.nonce, pid: process.pid, partition: 'test-parent' }, 1);
  const saved = { ledger: process.env.MUSUBIX5_CANDIDATE_SLOT_LEDGER, nonce: process.env.CANDIDATE_DISPATCH_NONCE };
  try {
    process.env.MUSUBIX5_CANDIDATE_SLOT_LEDGER = outerPath;
    process.env.CANDIDATE_DISPATCH_NONCE = outer.nonce;
    countedExecFileSync(process.execPath, ['--input-type=module', '-e', `
      import { spawnSync } from 'node:child_process';
      const result = spawnSync(process.execPath, ['-e', 'process.exit(0)'], { env: process.env });
      if (result.status !== 0) process.exit(1);
    `], { env: { ...process.env, MUSUBIX5_CANDIDATE_SLOT_LEDGER: innerPath,
      CANDIDATE_DISPATCH_NONCE: inner.nonce, MUSUBIX5_CANDIDATE_COUNT_ONLY: '1',
      NODE_OPTIONS: `--import=${pathToFileURL(resolve('scripts/test-runtime/stable-wall-clock.mjs')).href}` },
      timeout: 10_000, stdio: 'pipe' });
    await releaseCandidateSlots(outer, owner);
    expect((await validateCandidateSlotLedger(outer)).maximum).toBe(3);
    expect((await validateCandidateSlotLedger(inner)).maximum).toBe(2);
  } finally {
    if (saved.ledger === undefined) delete process.env.MUSUBIX5_CANDIDATE_SLOT_LEDGER;
    else process.env.MUSUBIX5_CANDIDATE_SLOT_LEDGER = saved.ledger;
    if (saved.nonce === undefined) delete process.env.CANDIDATE_DISPATCH_NONCE;
    else process.env.CANDIDATE_DISPATCH_NONCE = saved.nonce;
    await rm(root, { recursive: true, force: true });
  }
});
