import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];
const socketName = 'z-overlay-copy-failure.sock';
interface ShortUnixSocketContext {
  socketPath: string;
  targetSocketPath: string;
  shortDirectory: string;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('portable Unix socket fixture', () => {
  /**
   * @id TEST-M5-CI-SHORT-SOCKET-PATH-001
   * @verifies REQ-M5-CI-002
   */
  it('TEST-M5-CI-SHORT-SOCKET-PATH-001 bounds socket paths and owns cleanup', async () => {
    const {
      createShortSocketDirectory,
      withShortUnixSocket,
    } = await import('./fixtures/short-unix-socket.js');
    const source = readFileSync(
      resolve(import.meta.dirname, 'fixtures/short-unix-socket.ts'),
      'utf8',
    );
    expect(source).not.toContain('node:os');
    expect(source).not.toMatch(/\b(?:TMPDIR|TMP|TEMP)\b/);

    if (process.platform === 'win32') {
      await expect(withShortUnixSocket('C:\\target', async () => undefined))
        .rejects.toThrow(/Windows/i);
      return;
    }

    const targetDirectory = mkdtempSync(join(tmpdir(), 'm5-socket-target-'));
    temporaryDirectories.push(targetDirectory);
    const sentinelPath = join(targetDirectory, 'sentinel.txt');
    writeFileSync(sentinelPath, 'preserve\n');
    const contexts: ShortUnixSocketContext[] = [];

    for (let index = 0; index < 2; index += 1) {
      await withShortUnixSocket(targetDirectory, async (context) => {
        contexts.push(context);
        expect(Buffer.byteLength(context.socketPath, 'utf8')).toBeLessThanOrEqual(90);
        expect(context.targetSocketPath).toBe(join(targetDirectory, socketName));
        expect(lstatSync(context.targetSocketPath).isSocket()).toBe(true);
        expect(statSync(context.shortDirectory).mode & 0o777).toBe(0o700);
      });
    }

    const relativeTargetDirectory = relative(process.cwd(), targetDirectory);
    await withShortUnixSocket(relativeTargetDirectory, async (context) => {
      expect(context.targetSocketPath).toBe(join(targetDirectory, socketName));
      expect(lstatSync(context.targetSocketPath).isSocket()).toBe(true);
    });

    expect(contexts[0]!.shortDirectory).not.toBe(contexts[1]!.shortDirectory);
    for (const context of contexts) {
      expect(existsSync(context.shortDirectory)).toBe(false);
      expect(existsSync(context.targetSocketPath)).toBe(false);
    }

    let failedContext: ShortUnixSocketContext | undefined;
    const callbackFailure = new Error('forced callback failure');
    await expect(withShortUnixSocket(targetDirectory, async (context) => {
      failedContext = context;
      throw callbackFailure;
    })).rejects.toBe(callbackFailure);
    expect(existsSync(failedContext!.shortDirectory)).toBe(false);
    expect(existsSync(failedContext!.targetSocketPath)).toBe(false);
    expect(readFileSync(sentinelPath, 'utf8')).toBe('preserve\n');

    let falsyFailureObserved = false;
    let falsyFailureContext: ShortUnixSocketContext | undefined;
    try {
      await withShortUnixSocket(targetDirectory, async (context) => {
        falsyFailureContext = context;
        throw undefined;
      });
    } catch (cause) {
      falsyFailureObserved = true;
      expect(cause).toBeUndefined();
    }
    expect(falsyFailureObserved).toBe(true);
    expect(existsSync(falsyFailureContext!.shortDirectory)).toBe(false);
    expect(existsSync(falsyFailureContext!.targetSocketPath)).toBe(false);

    const occupiedPath = join(targetDirectory, socketName);
    writeFileSync(occupiedPath, 'caller-owned\n');
    await expect(withShortUnixSocket(targetDirectory, async () => undefined))
      .rejects.toThrow(new RegExp(`${socketName}.*bytes|bytes.*${socketName}`));
    expect(readFileSync(occupiedPath, 'utf8')).toBe('caller-owned\n');
    rmSync(occupiedPath);

    const controlledParent = mkdtempSync('/tmp/m5-length-parent-');
    temporaryDirectories.push(controlledParent);
    const withoutPadding = Buffer.byteLength(
      join(controlledParent, 'm5s-XXXXXX', 'target', socketName),
      'utf8',
    );
    const paddingLength = Math.max(1, 91 - withoutPadding);
    expect(paddingLength).toBeLessThanOrEqual(255);
    const controlledBase = join(controlledParent, 'x'.repeat(paddingLength));
    mkdirSync(controlledBase);
    const candidateLength = Buffer.byteLength(
      join(controlledBase, 'm5s-XXXXXX', 'target', socketName),
      'utf8',
    );
    expect(candidateLength).toBeGreaterThan(90);
    await expect(withShortUnixSocket(
      targetDirectory,
      async () => undefined,
      controlledBase,
    )).rejects.toThrow(new RegExp(`${candidateLength} bytes`));
    expect(readdirSync(controlledBase)).toEqual([]);

    const missingBase = join(controlledParent, 'missing', 'child');
    expect(() => createShortSocketDirectory(missingBase))
      .toThrow(new RegExp(missingBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});
