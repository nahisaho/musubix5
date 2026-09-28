import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';

/** @id TEST-M5-SOURCE-BLOB-GIT-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004
 */
it('TEST-M5-SOURCE-BLOB-GIT-001 preserves raw content-addressed bytes through the Git index', () => {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-blob-git-'));
  try {
    execFileSync('git', ['init', '--quiet', root]);
    writeFileSync(join(root, '.gitattributes'), readFileSync('.gitattributes'));
    const bytes = Buffer.from('reviewed\r\nsource\r\n', 'utf8');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const path = `.musubix/evidence/tdd-source/v1/blobs/${hash}`;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
    execFileSync('git', ['-C', root, 'add', '.gitattributes', path], { stdio: 'pipe' });
    const stored = execFileSync('git', ['-C', root, 'show', `:${path}`]);
    expect(createHash('sha256').update(stored).digest('hex')).toBe(hash);
    expect(stored).toEqual(bytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
