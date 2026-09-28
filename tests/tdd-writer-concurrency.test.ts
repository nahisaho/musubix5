import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultConfig } from '../packages/analysis/src/config.js';
import { withChangeProjectionLease, withChangeProjectionLeases, withOrderLease } from '../packages/analysis/src/journal.js';
import { inspectEvidenceOrder } from '../packages/analysis/src/order.js';
import type { Runner } from '../packages/analysis/src/process.js';
import { loadTddEvidence, runTddPhase, voidTddCycle } from '../packages/analysis/src/tdd.js';

function write(root: string, path: string, value: unknown): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-tdd-writer-'));
  execFileSync('git', ['init', '--quiet', root]);
  write(root, '.musubix/config.json', {
    ...defaultConfig,
    approval: { mode: 'compatible', domains: [] },
    commands: [{
      name: 'target', command: 'target', args: [],
      tddArgs: ['{testId}', '{reportPath}'],
      tddReport: { format: 'musubix-json', path: '.musubix/cache/{testId}.json' },
      required: false, timeoutMs: 30_000,
    }],
  });
  write(root, '.musubix/features/example/requirements.md', [
    '## REQ-EXAMPLE-001: Concurrent observations',
    'Priority: must',
    'Type: functional',
    'Statement: When observations finish, the system shall retain every independent observation.',
    'Acceptance: Two independent tests remain in the ledger.',
  ].join('\n'));
  for (const id of ['TEST-EXAMPLE-FIRST-001', 'TEST-EXAMPLE-SECOND-001']) {
    write(root, `tests/${id}.test.ts`, [
      `/** @id ${id}`,
      ' * @verifies REQ-EXAMPLE-001',
      ' */',
      'export const example = true;',
    ].join('\n'));
  }
  return root;
}

function reportRunner(beforeReport: () => Promise<void> = async () => {}, status: 'failed' | 'passed' = 'failed'): Runner {
  return async (_command, args, options) => {
    await beforeReport();
    write(options.cwd, args[1]!, {
      schemaVersion: 1, tests: [{ id: args[0]!, status }],
    });
    return { status: 'completed', exitCode: status === 'failed' ? 1 : 0, stdout: '', stderr: '', durationMs: 1 };
  };
}

/** @id TEST-M5-TDD-WRITER-MERGE-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-004 DES-M5-011 DES-M5-023
 */
it('TEST-M5-TDD-WRITER-MERGE-001 releases shared leases during runners and merges unrelated completed observations', async () => {
  const root = fixture();
  let release!: () => void;
  let entered!: () => void;
  const paused = new Promise<void>((done) => { entered = done; });
  const barrier = new Promise<void>((done) => { release = done; });
  const first = runTddPhase(root, 'red', 'TEST-EXAMPLE-FIRST-001', 'REQ-EXAMPLE-001', 'target',
    reportRunner(async () => { entered(); await barrier; }));
  try {
    await paused;
    await withChangeProjectionLeases(root, ['CHANGE-0001'], (leases) =>
      withOrderLease(root, async () => {}, leases));
    const second = await runTddPhase(
      root, 'red', 'TEST-EXAMPLE-SECOND-001', 'REQ-EXAMPLE-001', 'target', reportRunner(),
    );
    expect(second.valid).toBe(true);
    const retained = readFileSync(join(root, '.musubix/evidence/tdd.json'), 'utf8');
    release();
    expect((await first).valid).toBe(true);
    const evidence = (await loadTddEvidence(root))!;
    expect(evidence.cycles.map((cycle) => cycle.testId).sort())
      .toEqual(['TEST-EXAMPLE-FIRST-001', 'TEST-EXAMPLE-SECOND-001']);
    const previous = JSON.parse(retained);
    expect(evidence.cycles[0]).toEqual(previous.cycles[0]);
    expect(evidence.chain![0]).toEqual(previous.chain[0]);
    expect(evidence.chain).toHaveLength(2);
    expect(evidence.chain![1]!.previousSha256).toBe(evidence.chain![0]!.recordSha256);
    expect((await inspectEvidenceOrder(root)).valid).toBe(true);
  } finally {
    release();
    await first;
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

/** @id TEST-M5-TDD-WRITER-DIAGNOSTIC-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-002 DES-M5-004 DES-M5-023
 */
it('TEST-M5-TDD-WRITER-DIAGNOSTIC-001 reports ordinary append contention as TDD_EVIDENCE_LEASE_BUSY exit one without evidence writes', async () => {
  const root = fixture();
  try {
    await withOrderLease(root, async () => {
      const result = spawnSync('npx', [
        'musubix5', 'tdd', 'red', 'TEST-EXAMPLE-FIRST-001',
        '--requirement', 'REQ-EXAMPLE-001', '--command', 'target', '--root', root, '--json',
      ], { encoding: 'utf8', timeout: 20_000 });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({
        error: { code: 'TDD_EVIDENCE_LEASE_BUSY' },
      });
      expect(await loadTddEvidence(root)).toBeNull();
      expect((await inspectEvidenceOrder(root)).records.size).toBe(0);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

/** @id TEST-M5-TDD-WRITER-MAINTENANCE-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-004 DES-M5-011 DES-M5-023
 */
it('TEST-M5-TDD-WRITER-MAINTENANCE-001 excludes no-active void persistence while the shared projection lease is held', async () => {
  const root = fixture();
  let pending: ReturnType<typeof voidTddCycle> | undefined;
  try {
    const id = 'TEST-EXAMPLE-FIRST-001';
    await runTddPhase(root, 'red', id, 'REQ-EXAMPLE-001', 'target', reportRunner());
    write(root, 'src/implementation.ts', 'export const implemented = true;\n');
    expect((await runTddPhase(root, 'green', id, 'REQ-EXAMPLE-001', 'target',
      reportRunner(undefined, 'passed'))).valid).toBe(true);
    await runTddPhase(root, 'red', id, 'REQ-EXAMPLE-001', 'target', reportRunner());
    const before = readFileSync(join(root, '.musubix/evidence/tdd.json'), 'utf8');
    await withChangeProjectionLease(root, async () => {
      let completed = false;
      pending = voidTddCycle(root, id, 'fixture-reviewer', 'Retain the verified fallback.');
      void pending.then(() => { completed = true; }, () => { completed = true; });
      await new Promise((done) => setTimeout(done, 200));
      expect(completed).toBe(false);
      expect(readFileSync(join(root, '.musubix/evidence/tdd.json'), 'utf8')).toBe(before);
    });
    expect((await pending)!.voided).toBe(true);
    expect((await inspectEvidenceOrder(root)).valid).toBe(true);
  } finally {
    await pending;
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

/** @id TEST-M5-TDD-WRITER-INPUT-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-004 DES-M5-011 DES-M5-023
 */
it('TEST-M5-TDD-WRITER-INPUT-001 rejects runner-time production and configuration drift before recording an observation', async () => {
  for (const path of ['src/implementation.ts', '.musubix/config.json']) {
    const root = fixture();
    try {
      write(root, 'src/implementation.ts', 'export const implemented = false;\n');
      const runner = reportRunner(async () => {
        if (path.endsWith('.ts')) {
          write(root, path, 'export const implemented = true;\n');
        } else {
          const config = JSON.parse(readFileSync(join(root, path), 'utf8'));
          config.commands[0].timeoutMs += 1;
          write(root, path, config);
        }
      });
      await expect(runTddPhase(root, 'red', 'TEST-EXAMPLE-FIRST-001', 'REQ-EXAMPLE-001', 'target', runner))
        .rejects.toThrow('CHANGE_WORKSPACE_DRIFT');
      expect(await loadTddEvidence(root)).toBeNull();
      expect((await inspectEvidenceOrder(root)).records.size).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
