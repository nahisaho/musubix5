import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

/** @id CODE-M5-CI-COUNTED-LAUNCHER-001
 * @implements REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-002
 * @design DES-M5-CI-EFFICIENCY-002
 */
export async function launchCountedProcess(command, args, {
  env = process.env, cwd = process.cwd(), timeoutMs = 120_000,
  partition = 'standalone', maxWorkers = 1, stdio = 'inherit', onChild,
} = {}) {
  const started = performance.now();
  const deadline = Date.now() + timeoutMs;
  const ledger = env.MUSUBIX5_CANDIDATE_SLOT_LEDGER
    ? JSON.parse(await readFile(env.MUSUBIX5_CANDIDATE_SLOT_LEDGER, 'utf8')) : null;
  const { acquireCandidateSlots, releaseCandidateSlots } = ledger
    ? await import(env.MUSUBIX5_CANDIDATE_ROOT
      ? pathToFileURL(resolve(env.MUSUBIX5_CANDIDATE_ROOT, 'dist/packages/analysis/src/candidate-execution-plan.js')).href
      : '../../dist/packages/analysis/src/candidate-execution-plan.js') : {};
  if (env.CANDIDATE_DISPATCH_NONCE && (!ledger || ledger.nonce !== env.CANDIDATE_DISPATCH_NONCE)) {
    throw new Error('CANDIDATE_SLOT_LEDGER_MISSING');
  }
  const lease = ledger ? await acquireCandidateSlots(ledger, { nonce: ledger.nonce, pid: process.pid, partition },
    1 + maxWorkers + (process.platform === 'win32' ? 1 : 0)) : null;
  let child, termination, cleanup, closed = false;
  try {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('CANDIDATE_PARTITION_DEADLINE');
    return await new Promise((accept) => {
      let timer, error, timedOut = false;
      child = spawn(command, args, { env, cwd, stdio, shell: false, detached: process.platform !== 'win32' });
      onChild?.(child);
      child.once('error', cause => { error = cause; });
      const stop = () => {
        timedOut = true;
        if (child.pid && process.platform !== 'win32') {
          try { process.kill(-child.pid, 'SIGKILL'); } catch (cause) { if (cause.code !== 'ESRCH') error = cause; }
        } else if (child.pid) {
          cleanup = new Promise(done => {
            try {
              const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
              const killerTimer = setTimeout(() => killer.kill('SIGKILL'), 1_000);
              killer.once('error', cause => { error = cause; child.kill('SIGKILL'); clearTimeout(killerTimer); done(); });
              killer.once('close', () => { clearTimeout(killerTimer); done(); });
            } catch (cause) { error = cause; child.kill('SIGKILL'); done(); }
          });
        } else child.kill('SIGKILL');
      };
      timer = setTimeout(stop, remaining);
      termination = stop;
      child.once('close', (exitCode, signal) => {
        closed = true;
        clearTimeout(timer);
        accept({ status: error ? 'error' : timedOut ? 'timeout' : 'completed', exitCode, signal,
          error, durationMs: Math.max(0, Math.round(performance.now() - started)) });
      });
    });
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) termination?.();
    await cleanup;
    if (lease && (closed || !child?.pid)) await releaseCandidateSlots(ledger, lease);
  }
}
