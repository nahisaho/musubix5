import { createHash } from 'node:crypto';
import { execFileSync } from './fixtures/counted-process.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { candidateGateFingerprintConfig } from '../packages/analysis/src/candidate-gate.js';
import { canonicalBytes, sha256 } from '../packages/analysis/src/canonical.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const legacyGateSha256 = '327baa0f399450fd6714f112e41bc23e13de79a9c1113499795ea76d87bcd03e';
const approvedGateSha256 = '2d92597fbbd621ec23abb31d26c4f4287b3b735d7523fd4f284e5f7f3e837516';
const approvedLegacyGateSha256 = '2487162acfb6d862ff118819267631f8f64195358798b57bedd4cfa9602792cd';
const redCandidateGateSha256 = '71780a08dd4b0058b8420f6254cf6cbd10117179a907ff3cdce1bc1d0dd00188';
const candidateGateDeclaration = 'export async function candidateGateFingerprintConfig';
const candidateGateTraceBlock = `/** @id CODE-M5-CANDIDATE-GATE-FINGERPRINT-CONFIG-001
 * @implements REQ-M5-LIFECYCLE-006
 * @design DES-M5-015
 */
`;

interface CommandConfig {
  name: string;
  timeoutMs: number;
}

function commandTimeout(config: unknown, name: string): number {
  if (typeof config !== 'object' || config === null || !('commands' in config)
    || !Array.isArray(config.commands)) {
    throw new Error('config does not contain a commands array');
  }
  const matches = config.commands.filter((command): command is CommandConfig =>
    typeof command === 'object' && command !== null
    && 'name' in command && command.name === name
    && 'timeoutMs' in command && typeof command.timeoutMs === 'number');
  if (matches.length !== 1) {
    throw new Error(`expected exactly one command named ${name}, observed ${matches.length}`);
  }
  return matches[0]!.timeoutMs;
}

function normativeGate(design: string): unknown {
  const section = design.split('### Test runtime extension policy')[1]?.split('## DES-M5-001')[0];
  const blocks = [...(section ?? '').matchAll(/```json\n([\s\S]*?)\n```/g)];
  if (blocks.length !== 2) {
    throw new Error(`expected exactly two runtime policy JSON blocks, observed ${blocks.length}`);
  }
  return JSON.parse(blocks[1]![1]!);
}

function candidateTrustDigest(source: string): string {
  const match = source.match(/expect\(sha256\(canonicalBytes\(projection\)\)\)\s*\.toBe\('([0-9a-f]{64})'\)/);
  if (!match) throw new Error('candidate gate trust digest binding is missing');
  return match[1]!;
}

function runtimeGateDigest(source: string): string {
  const match = source.match(/const gateSha256 = '([0-9a-f]{64})';/);
  if (!match) throw new Error('test runtime gate digest binding is missing');
  return match[1]!;
}

function runtimeLegacyGateDigest(source: string): string {
  const match = source.match(/const legacyGateSha256 = '([0-9a-f]{64})';/);
  if (!match) throw new Error('test runtime legacy gate digest binding is missing');
  return match[1]!;
}

/** @id TEST-M5-FULL-TEST-TIMEOUT-001
 * @verifies REQ-M5-COMPAT-013 REQ-M5-LIFECYCLE-006
 * @design DES-M5-011 DES-M5-012 DES-M5-015
 */
it('TEST-M5-FULL-TEST-TIMEOUT-001 Generation 49 binds the 900-second policy into candidate gate trust', async () => {
  const [configText, design, candidateTrust, runtimeGate, candidateGateSource] = await Promise.all([
    readFile(`${root}/.musubix/config.json`, 'utf8'),
    readFile(`${root}/.musubix/features/musubix5-clean-foundation/design.md`, 'utf8'),
    readFile(`${root}/tests/candidate-gate-trust.test.ts`, 'utf8'),
    readFile(`${root}/tests/test-runtime-gate.test.ts`, 'utf8'),
    readFile(`${root}/packages/analysis/src/candidate-gate.ts`, 'utf8'),
  ]);
  const config: unknown = JSON.parse(configText);
  expect(commandTimeout(config, 'test')).toBe(900000);
  expect(commandTimeout(config, 'compatibility')).toBe(180000);
  expect(commandTimeout(config, 'pack-smoke')).toBe(180000);
  expect(sha256(canonicalBytes(normativeGate(design)))).toBe(approvedGateSha256);
  expect(sha256(canonicalBytes(await candidateGateFingerprintConfig(root))))
    .toBe('daa08856c5c90f17f1868b02fc5b1ee04bce4b80ef8cef918329dc847a7240e7');

  const declarationCount = candidateGateSource.split(candidateGateDeclaration).length - 1;
  expect(declarationCount).toBe(1);
  const traceBlockCount = candidateGateSource.split(candidateGateTraceBlock).length - 1;
  expect([0, 1]).toContain(traceBlockCount);
  const historicalSource = execFileSync('git', [
    'show', 'ad6b5cbf76149c0b8626ab85214aa84f8536ffb8:packages/analysis/src/candidate-gate.ts',
  ], { cwd: root, encoding: 'utf8' });
  const redSource = historicalSource.replace(candidateGateTraceBlock, '');
  expect(createHash('sha256').update(redSource).digest('hex')).toBe(redCandidateGateSha256);
  const greenSource = redSource.replace(
    candidateGateDeclaration,
    `${candidateGateTraceBlock}${candidateGateDeclaration}`,
  );
  const candidateTrustSha256 = candidateTrustDigest(candidateTrust);
  const runtimeGateSha256 = runtimeGateDigest(runtimeGate);
  expect(historicalSource).toBe(greenSource);
  expect(candidateGateSource.match(/@id CODE-M5-CANDIDATE-GATE-FINGERPRINT-CONFIG-001/g)).toHaveLength(1);
  expect.soft(candidateTrustSha256).toBe('daa08856c5c90f17f1868b02fc5b1ee04bce4b80ef8cef918329dc847a7240e7');
  expect.soft(runtimeGateSha256).toBe(approvedGateSha256);
  expect.soft(runtimeLegacyGateDigest(runtimeGate)).toBe(approvedLegacyGateSha256);
});
