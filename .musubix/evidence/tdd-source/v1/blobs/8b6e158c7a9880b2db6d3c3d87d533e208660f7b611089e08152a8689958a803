import {
  existsSync,
  lstatSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { createServer, type Server } from 'node:net';
import { join, resolve } from 'node:path';

const socketName = 'z-overlay-copy-failure.sock';
const maximumSocketPathBytes = 90;

export interface ShortUnixSocketContext {
  socketPath: string;
  targetSocketPath: string;
  shortDirectory: string;
}

export function createShortSocketDirectory(base = '/tmp'): string {
  try {
    return mkdtempSync(join(base, 'm5s-'));
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Unable to create short Unix socket directory under ${base}: ${detail}`, {
      cause,
    });
  }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/** @id CODE-M5-CI-SHORT-SOCKET-001
 * @implements REQ-M5-CI-002
 * @design DES-M5-CI-002
 */
export async function withShortUnixSocket<T>(
  targetDirectory: string,
  callback: (context: ShortUnixSocketContext) => Promise<T>,
  base = '/tmp',
): Promise<T> {
  if (process.platform === 'win32') {
    throw new Error('Unix socket fixtures are unavailable on Windows.');
  }

  const resolvedTargetDirectory = resolve(targetDirectory);
  const shortDirectory = createShortSocketDirectory(base);
  const aliasPath = join(shortDirectory, 'target');
  const targetSocketPath = join(resolvedTargetDirectory, socketName);
  const socketPath = join(aliasPath, socketName);
  const pathBytes = Buffer.byteLength(socketPath, 'utf8');
  let server: Server | undefined;
  let listening = false;
  let result: T | undefined;
  let primaryFailed = false;
  let primaryFailure: unknown;

  try {
    if (pathBytes > maximumSocketPathBytes) {
      throw new Error(
        `Unix socket path ${socketPath} is ${pathBytes} bytes; maximum is ${maximumSocketPathBytes} bytes.`,
      );
    }

    symlinkSync(resolvedTargetDirectory, aliasPath, 'dir');
    const activeServer = createServer();
    server = activeServer;
    await new Promise<void>((resolve, reject) => {
      const onListening = (): void => {
        activeServer.off('error', onError);
        listening = true;
        resolve();
      };
      const onError = (error: Error): void => {
        activeServer.off('listening', onListening);
        reject(new Error(
          `Unable to bind Unix socket ${socketPath} (${pathBytes} bytes): ${error.message}`,
          { cause: error },
        ));
      };
      activeServer.once('listening', onListening);
      activeServer.once('error', onError);
      activeServer.listen(socketPath);
    });
    result = await callback({ socketPath, targetSocketPath, shortDirectory });
  } catch (cause) {
    primaryFailed = true;
    primaryFailure = cause;
  }

  let cleanupFailure: unknown;
  try {
    if (server && listening) await closeServer(server);
    if (listening && existsSync(targetSocketPath) && lstatSync(targetSocketPath).isSocket()) {
      rmSync(targetSocketPath, { force: true });
    }
    rmSync(shortDirectory, { recursive: true, force: true });
  } catch (cause) {
    cleanupFailure = cause;
  }

  if (primaryFailed) throw primaryFailure;
  if (cleanupFailure) throw cleanupFailure;
  return result as T;
}
