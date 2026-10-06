import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { createCandidateFailureProjector } from '../packages/analysis/src/adapters.js';

/** @id TEST-M5-CI-FIRST-FAILURE-LEDGER-001
 * @verifies REQ-M5-CI-EFFICIENCY-004
 */
it('TEST-M5-CI-FIRST-FAILURE-LEDGER-001 retains bounded redacted Unicode head and tail in the existing failure diagnostics without changing pass computation', async () => {
  const { normalizeCandidateGateReport } = await import('../packages/analysis/src/candidate-gate-runner.js');
  const base = resolve('.musubix/cache/ci-efficiency-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'diagnostics-'));
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const context = {
    repositoryId: `repository:${'a'.repeat(64)}`, changeId: 'CHANGE-0018', generation: 2,
    candidateCommit: 'b'.repeat(40), gateInputFingerprint: 'c'.repeat(64),
    job: { os: 'ubuntu', nodeMajor: 24 },
  };
  const project = createCandidateFailureProjector();
  const messages = [
    'ASSERTION ' + '😀'.repeat(400) + 'M'.repeat(3_000) + 'TERMINAL STACK',
    '😀'.repeat(1_000), '😀'.repeat(999), 'head private-secret ' + 'X'.repeat(1_500) + ' tail',
  ];
  const diagnostics = project('test', messages.map((nativeMessage, index) => ({
    index, testId: `TEST-FAILURE-${index}`, title: `failure ${index}`, nativeMessage, path: 'tests/example.test.ts',
  })));
  const stdout = JSON.stringify({ checks: [
    { name: 'command:test', required: true, status: 'fail', summary: 'native failure', exitCode: 1, diagnostics },
  ] });
  const stdoutPath = join(root, 'stdout'), stderrPath = join(root, 'stderr');
  await writeFile(stdoutPath, stdout);
  await writeFile(stderrPath, '');
  try {
    const result = await normalizeCandidateGateReport({
      stdoutPath, stderrPath, stdoutTail: '', stderrTail: '', stdoutSha256: hash(stdout), stderrSha256: hash(''),
      tailsDropped: false, resultTextDropped: false, drainTruncated: false, streamCapTerminated: false,
      exitCode: 1, signal: null, timedOut: false, spawned: true, childErrorMessage: null,
    }, { resultPath: join(root, 'result.json'), context, secrets: ['private-secret'],
      preTreeMatchesCandidate: true, postTreeMatchesCandidate: true });
    expect(result.status).toBe('fail');
    expect(result.commandsPassed).toBe(false);
    expect(result.matchedCauses).toContain('non-zero-exit');
    const enriched = result.checks!.find((check) => check.name === 'command:test')!.diagnostics!;
    expect(enriched).toHaveLength(4);
    const native = enriched.map((entry) => entry.message.split('\nnativeMessage=')[1]!);
    expect(native[0]!.startsWith(Array.from(messages[0]!).slice(0, 400).join(''))).toBe(true);
    expect(native[0]!.endsWith('TERMINAL STACK')).toBe(true);
    const marker = /\[TRUNCATED middleScalars=(\d+)\]/.exec(native[0]!)!;
    expect(marker).not.toBeNull();
    expect(Number(marker[1]) + Array.from(native[0]!.replace(marker[0], '')).length).toBe(Array.from(messages[0]!).length);
    expect(Array.from(native[0]!).length).toBe(1_000);
    expect(native[1]).toBe(messages[1]);
    expect(native[2]).toBe(messages[2]);
    expect(native[3]).not.toContain('private-secret');
    expect(native[3]!.startsWith('head [REDACTED] ')).toBe(true);
    expect(native[3]!.endsWith(' tail')).toBe(true);
    expect(enriched.every((entry) => Array.from(entry.message).length <= 1_800)).toBe(true);
    expect(result).not.toHaveProperty('ledger');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
