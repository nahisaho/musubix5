import { expect, it } from 'vitest';
import { decodeCandidateStabilityArtifact } from '../packages/analysis/src/candidate-stability.js';

function checksum(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; ++bit) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function archive() {
  const name = Buffer.from('candidate-gate-envelope.json');
  const payload = Buffer.from('{"schemaVersion":1,"result":{"status":"pass"}}');
  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(checksum(payload), 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(payload.length, 22);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);
  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(checksum(payload), 16);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(payload.length, 24);
  central.writeUInt16LE(name.length, 28);
  name.copy(central, 46);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length + payload.length, 16);
  return { bytes: Buffer.concat([local, payload, central, end]), centralOffset: local.length + payload.length };
}

/** @id TEST-M5-CI-STABILITY-ARTIFACT-001
 * @verifies REQ-M5-CI-EFFICIENCY-006
 * @design DES-M5-CI-EFFICIENCY-005
 */
it('TEST-M5-CI-STABILITY-ARTIFACT-001 validates ZIP integrity and mode identity before signed-envelope verification', () => {
  const { bytes, centralOffset } = archive();
  expect(decodeCandidateStabilityArtifact(bytes, 'candidate')).toEqual({ schemaVersion: 1, result: { status: 'pass' } });
  const corrupt = Buffer.from(bytes);
  corrupt.writeUInt32LE(0, centralOffset + 16);
  expect(() => decodeCandidateStabilityArtifact(corrupt, 'candidate')).toThrow(/artifact/);
  expect(() => decodeCandidateStabilityArtifact(bytes, 'calibration')).toThrow(/artifact/);
  expect(() => decodeCandidateStabilityArtifact(bytes.subarray(0, bytes.length - 22), 'candidate')).toThrow(/artifact/);
});
