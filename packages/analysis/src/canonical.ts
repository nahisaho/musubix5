import { createHash } from 'node:crypto';

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function canonicalValue(value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('CANONICAL_NUMBER_INVALID: canonical JSON rejects non-finite numbers.');
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => compareUtf8(left, right))
      .map(([key, entry]) => [key, canonicalValue(entry)]));
  }
  return value;
}

export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8');
}

export function legacyCanonicalBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(canonicalValue(value)), 'utf8');
}

export function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
