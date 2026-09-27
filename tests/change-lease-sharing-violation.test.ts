import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const sharingViolation = vi.hoisted(() => ({
  remainingLeaseMkdirs: 0,
  remainingFencingRenames: 0,
  remainingOwnerOpens: 0,
  remainingOwnerReads: 0,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    mkdir: async (...args: Parameters<typeof actual.mkdir>) => {
      const normalizedPath = String(args[0]).replace(/\\/g, '/');
      if (normalizedPath.includes('leases/change-') && sharingViolation.remainingLeaseMkdirs > 0) {
        sharingViolation.remainingLeaseMkdirs -= 1;
        throw Object.assign(new Error('simulated Windows directory sharing violation'), { code: 'EPERM' });
      }
      return actual.mkdir(...args);
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      if (String(args[0]).endsWith('owner.json') && sharingViolation.remainingOwnerOpens > 0) {
        sharingViolation.remainingOwnerOpens -= 1;
        throw Object.assign(new Error('simulated Windows owner creation sharing violation'), { code: 'EACCES' });
      }
      return actual.open(...args);
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      const normalizedPath = String(args[1]).replace(/\\/g, '/');
      if (normalizedPath.includes('/fencing/') && sharingViolation.remainingFencingRenames > 0) {
        sharingViolation.remainingFencingRenames -= 1;
        throw Object.assign(new Error('simulated Windows fencing rename sharing violation'), { code: 'EBUSY' });
      }
      return actual.rename(...args);
    },
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      if (String(args[0]).endsWith('owner.json') && sharingViolation.remainingOwnerReads > 0) {
        sharingViolation.remainingOwnerReads -= 1;
        throw Object.assign(new Error('simulated Windows sharing violation'), { code: 'EPERM' });
      }
      return actual.readFile(...args);
    },
  };
});

const temporaryDirectories: string[] = [];

afterEach(() => {
  sharingViolation.remainingLeaseMkdirs = 0;
  sharingViolation.remainingFencingRenames = 0;
  sharingViolation.remainingOwnerOpens = 0;
  sharingViolation.remainingOwnerReads = 0;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('CHANGE writer lease sharing violations', () => {
  /**
   * @id TEST-M5-LIFECYCLE-LEASE-SHARING-001
   * @verifies REQ-M5-LIFECYCLE-004
   */
  it('TEST-M5-LIFECYCLE-LEASE-SHARING-001 retries a transient owner read without taking over the live lease', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-change-lease-sharing-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    const {
      acquireChangeLease,
      releaseChangeLease,
      tryAcquireChangeLease,
    } = await import('../packages/analysis/src/journal.js');

    const owner = await acquireChangeLease(root, 'CHANGE-0002');
    sharingViolation.remainingOwnerReads = 1;

    await expect(tryAcquireChangeLease(root, 'CHANGE-0002')).resolves.toBeNull();
    await releaseChangeLease(owner);
  });

  /**
   * @id TEST-M5-LIFECYCLE-LEASE-SHARING-002
   * @verifies REQ-M5-LIFECYCLE-004
   */
  it('TEST-M5-LIFECYCLE-LEASE-SHARING-002 retries lease creation and fails closed when owner reads stay blocked', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-change-lease-creation-sharing-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    const {
      acquireChangeLease,
      releaseChangeLease,
      tryAcquireChangeLease,
    } = await import('../packages/analysis/src/journal.js');

    sharingViolation.remainingLeaseMkdirs = 1;
    sharingViolation.remainingOwnerOpens = 1;
    const owner = await acquireChangeLease(root, 'CHANGE-0002');
    const ownerPath = join(owner.path, 'owner.json');
    const token = JSON.parse(readFileSync(ownerPath, 'utf8')) as { token: string };

    sharingViolation.remainingOwnerReads = 100;
    await expect(tryAcquireChangeLease(root, 'CHANGE-0002')).rejects.toMatchObject({ code: 'EPERM' });
    expect(JSON.parse(readFileSync(ownerPath, 'utf8'))).toMatchObject({ token: token.token });

    sharingViolation.remainingOwnerReads = 0;
    await releaseChangeLease(owner);
  });

  /**
   * @id TEST-M5-LIFECYCLE-LEASE-SHARING-003
   * @verifies REQ-M5-LIFECYCLE-004
   */
  it('TEST-M5-LIFECYCLE-LEASE-SHARING-003 retries transient fencing-token replacement failures', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-change-lease-fencing-sharing-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    const {
      acquireChangeLease,
      releaseChangeLease,
    } = await import('../packages/analysis/src/journal.js');

    const first = await acquireChangeLease(root, 'CHANGE-0002');
    await releaseChangeLease(first);

    sharingViolation.remainingFencingRenames = 1;
    const second = await acquireChangeLease(root, 'CHANGE-0002');
    expect(second.fencingToken).toBe(first.fencingToken + 1);
    await releaseChangeLease(second);
  });
});
