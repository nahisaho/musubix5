import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('CHANGE writer lease', () => {
  /**
   * @id TEST-M5-LIFECYCLE-004
   * @verifies REQ-M5-LIFECYCLE-004
   */
  it('TEST-M5-LIFECYCLE-004 excludes concurrent writers and fences expired holders', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-change-lease-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    const {
      acquireChangeLease,
      assertChangeLeaseCurrent,
      releaseChangeLease,
      tryAcquireChangeLease,
    } = await import('../packages/analysis/src/journal.js');

    const first = await acquireChangeLease(root, 'CHANGE-0002');
    expect(await tryAcquireChangeLease(root, 'CHANGE-0002')).toBeNull();

    const owner = JSON.parse(readFileSync(join(first.path, 'owner.json'), 'utf8')) as {
      expiresAt: number;
    };
    writeFileSync(join(first.path, 'owner.json'), JSON.stringify({ ...owner, expiresAt: 0 }));

    const second = await acquireChangeLease(root, 'CHANGE-0002');
    expect(second.fencingToken).toBe(first.fencingToken + 1);
    await expect(assertChangeLeaseCurrent(first)).rejects.toThrow('LEASE_FENCED');
    await expect(assertChangeLeaseCurrent(second)).resolves.toBeUndefined();
    await releaseChangeLease(second);
  });
});
