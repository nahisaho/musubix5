import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { appendJournalRecord, syncJournalDirectory, writeAuthorizedFile, LeaseFencedError } from '../packages/analysis/src/journal.js';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, open: vi.fn(actual.open), rename: vi.fn(actual.rename) };
});

/** @id TEST-M5-FINALIZATION-PLATFORM-001
 * @verifies REQ-M5-MULTI-CHANGE-006
 * @design DES-M5-MULTI-CHANGE-003 DES-M5-MULTI-CHANGE-008
 */
it('TEST-M5-FINALIZATION-PLATFORM-001 retries atomic replacement without unlink and rechecks fencing while propagating record fsync failures', async () => {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-finalization-platform-'));
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  try {
    for (const platform of ['win32', 'darwin', 'linux']) {
      Object.defineProperty(process, 'platform', { configurable: true, value: platform });
      for (const boundary of ['retry', 'fenced-retry', 'fsync'] as const) {
        const path = join(root, 'marker.json');
        await actual.writeFile(path, 'old-marker');
        let live = true;
        const events: string[] = [];
        vi.mocked(fs.open).mockImplementation(async (...args) => {
          expect(args[1]).toBe('wx');
          const handle = await actual.open(...args);
          const sync = handle.sync.bind(handle);
          handle.sync = async () => {
            events.push('fsync');
            if (boundary === 'fsync') throw Object.assign(new Error('RECORD_SYNC_FAILED'), { code: 'EIO' });
            await sync();
          };
          return handle;
        });
        vi.mocked(fs.rename).mockReset();
        vi.mocked(fs.rename).mockImplementation(async (...args) => {
          events.push('rename');
          expect(await actual.readFile(path, 'utf8')).toBe('old-marker');
          if (vi.mocked(fs.rename).mock.calls.length === 1) {
            if (boundary === 'fenced-retry') live = false;
            throw Object.assign(new Error('SHARING_VIOLATION'), { code: 'EBUSY' });
          }
          return actual.rename(...args);
        });
        const write = writeAuthorizedFile(root, 'marker.json', Buffer.from('new-marker'), async () => {
          if (!live) throw new LeaseFencedError();
          events.push('authorize');
        });
        if (boundary === 'retry') {
          await write;
          expect(await actual.readFile(path, 'utf8')).toBe('new-marker');
          expect(fs.rename).toHaveBeenCalledTimes(2);
          expect(events.lastIndexOf('authorize')).toBe(events.lastIndexOf('rename') - 1);
        } else {
          await expect(write).rejects.toThrow(boundary === 'fsync' ? 'RECORD_SYNC_FAILED' : 'LEASE_FENCED');
          expect(await actual.readFile(path, 'utf8')).toBe('old-marker');
          expect(fs.rename).toHaveBeenCalledTimes(boundary === 'fsync' ? 0 : 1);
        }
        expect(await actual.readdir(root)).toEqual(['marker.json']);
        expect(events.indexOf('fsync')).toBeGreaterThan(0);
      }
    }
  } finally {
    Object.defineProperty(process, 'platform', descriptor);
    vi.mocked(fs.open).mockImplementation(actual.open);
    vi.mocked(fs.rename).mockImplementation(actual.rename);
    rmSync(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-FINALIZATION-DURABILITY-001
 * @verifies REQ-M5-MULTI-CHANGE-006
 * @design DES-M5-MULTI-CHANGE-003 DES-M5-MULTI-CHANGE-008
 */
it('TEST-M5-FINALIZATION-DURABILITY-001 fsyncs records and supported directories but does not require Windows directory fsync', async () => {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-finalization-durability-'));
  execFileSync('git', ['init', '--quiet', root]);
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  const synced: string[] = [];
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  vi.mocked(fs.open).mockImplementation(async (...args) => {
    const handle = await actual.open(...args);
    const sync = handle.sync.bind(handle);
    handle.sync = async () => { synced.push(String(args[0])); await sync(); };
    return handle;
  });
  try {
    await appendJournalRecord(root, {
      stream: 'normal', changeId: 'CHANGE-0014', kind: 'fixture', idempotencyKey: 'durability', payload: {},
    });
    const directory = join(root, '.musubix/journal/normal');
    expect(synced.some((path) => path.startsWith(directory) && path.endsWith('.tmp'))).toBe(true);
    await syncJournalDirectory(directory);
    if (process.platform !== 'win32') expect(synced.at(-1)).toBe(directory);
    vi.mocked(fs.open).mockClear();
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
    await syncJournalDirectory(directory);
    expect(fs.open).not.toHaveBeenCalled();
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' });
    vi.mocked(fs.open).mockRejectedValueOnce(Object.assign(new Error('unsupported'), { code: 'ENOTSUP' }));
    await expect(syncJournalDirectory(directory)).resolves.toBeUndefined();
    vi.mocked(fs.open).mockRejectedValueOnce(Object.assign(new Error('disk failure'), { code: 'EIO' }));
    await expect(syncJournalDirectory(directory)).rejects.toThrow('disk failure');
  } finally {
    Object.defineProperty(process, 'platform', platform);
    vi.mocked(fs.open).mockReset();
    vi.mocked(fs.open).mockImplementation(actual.open);
    rmSync(root, { recursive: true, force: true });
  }
});
