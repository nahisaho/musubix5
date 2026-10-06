import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { canonicalBytes } from '../packages/analysis/src/canonical.js';
import { countedExecFile } from '../packages/analysis/src/process.js';

/** @id TEST-M5-CI-COUNTED-NATIVE-001
 * @verifies REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-002
 */
it('TEST-M5-CI-COUNTED-NATIVE-001 counts native launches in generated fixture processes without import exemptions', async () => {
  const api = await import('../packages/analysis/src/candidate-execution-plan.js');
  const { runProcess } = await import('../packages/analysis/src/process.js');
  const root = join(process.cwd(), '.musubix/cache/native-counted-fixture');
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  try {
    const ledger = await api.createCandidateSlotLedger(root, 'native-nonce-001', 16);
    const ledgerPath = join(root, 'binding.json');
    await writeFile(ledgerPath, canonicalBytes(ledger));
    const source = `import { execFileSync } from 'node:child_process';
      execFileSync(process.execPath, ['-e', 'process.exit(0)']);`;
    const result = await runProcess(process.execPath, ['--input-type=module', '-e', source], {
      cwd: process.cwd(), timeoutMs: 20_000, env: { ...process.env,
        MUSUBIX5_CANDIDATE_SLOT_LEDGER: ledgerPath, CANDIDATE_DISPATCH_NONCE: ledger.nonce },
    });
    expect(result.status).toBe('completed');
    expect(result.exitCode).toBe(0);
    expect((await api.validateCandidateSlotLedger(ledger)).maximum).toBeGreaterThanOrEqual(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-CI-COUNTED-ERROR-001
 * @verifies REQ-M5-CI-EFFICIENCY-002
 * @design DES-M5-CI-EFFICIENCY-003
 */
it('TEST-M5-CI-COUNTED-ERROR-001 preserves child stderr on promisified counted process failures', async () => {
  const execute = promisify(countedExecFile);
  await expect(execute(process.execPath, [
    '-e', "process.stderr.write('fixture stderr'); process.exit(1)",
  ], { encoding: 'utf8' })).rejects.toMatchObject({ stderr: 'fixture stderr' });
});
