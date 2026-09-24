import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { appendTimestampSentinel } from './helpers/journal-order-sentinel.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function appendInProcess(repositoryRoot: string, root: string, index: number): Promise<void> {
  const script = [
    "import { appendJournalRecord } from './dist/packages/analysis/src/index.js';",
    `await appendJournalRecord(${JSON.stringify(root)}, {`,
    "  stream: 'normal',",
    `  changeId: 'CHANGE-${String(index % 2 + 1).padStart(4, '0')}',`,
    "  kind: 'test-transition',",
    `  idempotencyKey: 'worker-${index}',`,
    `  payload: { worker: ${index}, timestamp: ${index % 2 ? 1 : 9999999999999} },`,
    '});',
  ].join('\n');
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      cwd: repositoryRoot,
      stdio: 'pipe',
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`journal worker ${index} failed (${code}): ${stderr}`));
    });
  });
}

describe('repository-wide journal order', () => {
  /**
   * @id TEST-M5-LIFECYCLE-002
   * @verifies REQ-M5-LIFECYCLE-002 REQ-M5-PARALLEL-011
   */
  it('TEST-M5-LIFECYCLE-002 allocates unique increasing order across concurrent CHANGEs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-journal-order-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
    await Promise.all(Array.from({ length: 8 }, (_, index) =>
      appendInProcess(repositoryRoot, root, index)));
    await appendTimestampSentinel(repositoryRoot, root);

    const journal = join(root, '.musubix', 'journal', 'normal');
    const records = readdirSync(journal)
      .filter((name) => name.endsWith('.json'))
      .map((name) => JSON.parse(readFileSync(join(journal, name), 'utf8')) as {
        order: number;
        payload: { worker: number; timestamp: number };
      })
      .sort((left, right) => left.order - right.order);

    expect(records.map((record) => record.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(records.map((record) => record.order)).size).toBe(9);
    expect(records.slice(0, 8).map((record) => record.payload.worker).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(records.at(-1)?.payload.worker).toBe(8);
    expect(records.some((record, index) =>
      index > 0 && record.payload.timestamp < records[index - 1]!.payload.timestamp)).toBe(true);
  });
});
