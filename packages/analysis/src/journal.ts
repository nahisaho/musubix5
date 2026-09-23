import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  mkdir, open, readFile, readdir, rename, rm, stat,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { canonicalBytes, legacyCanonicalBytes, sha256 } from './canonical.js';

const execFileAsync = promisify(execFile);
const leaseTtlMs = 30_000;
const leaseRetryMs = 25;
const leaseAttempts = 400;

export type JournalStream = 'normal' | 'bootstrap';

export interface JournalRecordInput {
  stream: JournalStream;
  changeId: string;
  kind: string;
  idempotencyKey: string;
  payload: unknown;
}

export interface JournalRecord extends JournalRecordInput {
  schemaVersion: 1;
  order: number;
  previousSha256: string | null;
  recordSha256: string;
}

interface LeaseOwner {
  token: string;
  fencingToken: number;
  expiresAt: number;
}

export interface ChangeLease {
  path: string;
  token: string;
  fencingToken: number;
}

function errorCode(cause: unknown): string | undefined {
  return cause && typeof cause === 'object' && 'code' in cause
    ? String((cause as { code?: unknown }).code)
    : undefined;
}

async function gitCommonDirectory(root: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', root, 'rev-parse', '--git-common-dir']);
  return resolve(root, stdout.trim());
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function readLeaseOwner(path: string): Promise<LeaseOwner | null> {
  try {
    return JSON.parse(await readFile(join(path, 'owner.json'), 'utf8')) as LeaseOwner;
  } catch (cause) {
    if (errorCode(cause) === 'ENOENT' || cause instanceof SyntaxError) return null;
    throw cause;
  }
}

async function leaseModifiedAt(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mtimeMs;
  } catch (cause) {
    if (errorCode(cause) === 'ENOENT') return null;
    throw cause;
  }
}

async function writeCanonicalFile(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx');
  try {
    await handle.writeFile(canonicalBytes(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

async function nextFencingToken(leases: string, name: string): Promise<number> {
  const path = join(leases, 'fencing', `${encodeURIComponent(name)}.json`);
  await mkdir(dirname(path), { recursive: true });
  let current = 0;
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as { fencingToken?: unknown };
    if (!Number.isInteger(value.fencingToken) || Number(value.fencingToken) < 0) {
      throw new Error(`Invalid fencing token state for ${name}.`);
    }
    current = Number(value.fencingToken);
  } catch (cause) {
    if (errorCode(cause) !== 'ENOENT') throw cause;
  }
  const fencingToken = current + 1;
  await writeCanonicalFile(path, { fencingToken });
  return fencingToken;
}

async function acquireNamedLease(root: string, name: string, wait: boolean): Promise<ChangeLease | null> {
  const leases = join(await gitCommonDirectory(root), 'musubix5', 'leases');
  const path = join(leases, encodeURIComponent(name));
  await mkdir(leases, { recursive: true });
  const attempts = wait ? leaseAttempts : 3;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const token = randomUUID();
    try {
      await mkdir(path);
      const fencingToken = await nextFencingToken(leases, name);
      const handle = await open(join(path, 'owner.json'), 'wx');
      try {
        await handle.writeFile(canonicalBytes({ token, fencingToken, expiresAt: Date.now() + leaseTtlMs }));
        await handle.sync();
      } finally {
        await handle.close();
      }
      return { path, token, fencingToken };
    } catch (cause) {
      if (errorCode(cause) !== 'EEXIST') throw cause;
      const owner = await readLeaseOwner(path);
      const ownerlessCreatedAt = owner === null ? await leaseModifiedAt(path) : null;
      if (owner === null && ownerlessCreatedAt === null) continue;
      if ((owner && owner.expiresAt > Date.now())
        || (ownerlessCreatedAt !== null && ownerlessCreatedAt + leaseTtlMs > Date.now())) {
        if (!wait) return null;
        await delay(leaseRetryMs);
        continue;
      }
      const stalePath = `${path}.stale-${token}`;
      try {
        await rename(path, stalePath);
        await rm(stalePath, { recursive: true });
      } catch (takeoverCause) {
        if (!['ENOENT', 'EEXIST'].includes(errorCode(takeoverCause) ?? '')) throw takeoverCause;
      }
    }
  }
  if (!wait) return null;
  throw new Error('Timed out acquiring the repository-wide order lease.');
}

async function acquireOrderLease(root: string): Promise<ChangeLease> {
  const lease = await acquireNamedLease(root, 'order', true);
  if (!lease) throw new Error('Failed to acquire repository-wide order lease.');
  return lease;
}

async function releaseOrderLease(lease: ChangeLease): Promise<void> {
  const owner = await readLeaseOwner(lease.path);
  if (owner?.token === lease.token) await rm(lease.path, { recursive: true });
}

/** @id CODE-M5-LIFECYCLE-004
 * @implements REQ-M5-LIFECYCLE-004
 * @design DES-M5-004
 */
export async function acquireChangeLease(root: string, changeId: string): Promise<ChangeLease> {
  const lease = await acquireNamedLease(root, `change-${changeId}`, true);
  if (!lease) throw new Error(`Failed to acquire CHANGE lease for ${changeId}.`);
  return lease;
}

export async function tryAcquireChangeLease(root: string, changeId: string): Promise<ChangeLease | null> {
  return acquireNamedLease(root, `change-${changeId}`, false);
}

export async function assertChangeLeaseCurrent(lease: ChangeLease): Promise<void> {
  const owner = await readLeaseOwner(lease.path);
  if (owner?.token !== lease.token || owner.fencingToken !== lease.fencingToken || owner.expiresAt <= Date.now()) {
    throw new Error('LEASE_FENCED: the CHANGE lease is expired or owned by a newer writer.');
  }
}

export async function releaseChangeLease(lease: ChangeLease): Promise<void> {
  await releaseOrderLease(lease);
}

export async function loadJournalRecords(root: string): Promise<JournalRecord[]> {
  const records: JournalRecord[] = [];
  for (const stream of ['normal', 'bootstrap'] as const) {
    const directory = join(root, '.musubix', 'journal', stream);
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (cause) {
      if (errorCode(cause) === 'ENOENT') continue;
      throw cause;
    }
    for (const name of names.filter((entry) => /^\d{12}\.json$/.test(entry))) {
      records.push(JSON.parse(await readFile(join(directory, name), 'utf8')) as JournalRecord);
    }
  }
  records.sort((left, right) => left.order - right.order);
  for (const [index, record] of records.entries()) {
    const { recordSha256, ...payload } = record;
    const previous = index === 0 ? null : records[index - 1]!.recordSha256;
    const canonicalSha256 = sha256(canonicalBytes(payload));
    const legacySha256 = sha256(legacyCanonicalBytes(payload));
    if (record.order !== index + 1
      || record.previousSha256 !== previous
      || (recordSha256 !== canonicalSha256 && recordSha256 !== legacySha256)) {
      throw new Error(`Invalid journal chain at order ${record.order}.`);
    }
  }
  return records;
}

/** @id CODE-M5-LIFECYCLE-002
 * @implements REQ-M5-LIFECYCLE-002
 * @design DES-M5-004
 */
export async function appendJournalRecord(root: string, input: JournalRecordInput): Promise<JournalRecord> {
  const lease = await acquireOrderLease(root);
  try {
    const records = await loadJournalRecords(root);
    const existing = records.find((record) => record.idempotencyKey === input.idempotencyKey);
    if (existing) {
      if (existing.stream !== input.stream
        || existing.changeId !== input.changeId
        || existing.kind !== input.kind
        || !canonicalBytes(existing.payload).equals(canonicalBytes(input.payload))) {
        throw new Error(`JOURNAL_IDEMPOTENCY_CONFLICT: ${input.idempotencyKey} is bound to different input.`);
      }
      return existing;
    }
    const previous = records.at(-1);
    const payload = {
      schemaVersion: 1 as const,
      order: (previous?.order ?? 0) + 1,
      ...input,
      previousSha256: previous?.recordSha256 ?? null,
    };
    const record: JournalRecord = {
      ...payload,
      recordSha256: sha256(canonicalBytes(payload)),
    };
    const destination = join(
      root,
      '.musubix',
      'journal',
      input.stream,
      `${String(record.order).padStart(12, '0')}.json`,
    );
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    const handle = await open(temporary, 'wx');
    try {
      await handle.writeFile(canonicalBytes(record));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, destination);
    return record;
  } finally {
    await releaseOrderLease(lease);
  }
}

export async function verifyJournal(root: string): Promise<JournalRecord[]> {
  return loadJournalRecords(root);
}

export async function loadJournalRecordByIdempotencyKey(
  root: string,
  idempotencyKey: string,
): Promise<JournalRecord | null> {
  return (await loadJournalRecords(root))
    .find((record) => record.idempotencyKey === idempotencyKey) ?? null;
}
