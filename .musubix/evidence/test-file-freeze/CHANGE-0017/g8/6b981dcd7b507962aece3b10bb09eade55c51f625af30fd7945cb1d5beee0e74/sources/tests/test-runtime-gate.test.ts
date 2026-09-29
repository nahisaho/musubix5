import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { candidateGateFingerprintConfig } from '../packages/analysis/src/candidate-gate.js';
import { canonicalBytes, sha256 } from '../packages/analysis/src/canonical.js';
import { loadApprovalProjectionConfig, loadConfig } from '../packages/analysis/src/config.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const profileSha256 = 'f9fbe94729722eaaea1f1e49bbaf6c48053ea1ed6a8498a2287dbfe4a20bf06e';
const gateSha256 = '327baa0f399450fd6714f112e41bc23e13de79a9c1113499795ea76d87bcd03e';
const legacyGateSha256 = 'bb4a58c169b4e4f7357b608dc3b00028a613f907613b88d1540b3654ea600c8a';
const profile = {
  calibration: { maxWidthMs: 1, samples: 8 },
  commandNames: ['codegraph-tests', 'compatibility', 'test'],
  inputs: [
    '.musubix/config.json',
    'package-lock.json',
    'package.json',
    'packages/analysis/src/adapters.ts',
    'packages/analysis/src/candidate-gate.ts',
    'packages/analysis/src/canonical.ts',
    'packages/analysis/src/config.ts',
    'packages/analysis/src/gate.ts',
    'packages/analysis/src/parallel-runtime.ts',
    'packages/analysis/src/process.ts',
    'packages/analysis/src/tdd-source-pair.ts',
    'packages/analysis/src/tdd.ts',
    'packages/analysis/src/test-runtime.ts',
    'scripts/run-codegraph-tests.mjs',
    'scripts/test-runtime/coordinator-reporter.mjs',
    'scripts/test-runtime/stable-wall-clock.mjs',
    'scripts/test-runtime/vitest-setup.mjs',
    'tests/global-setup.ts',
    'tsconfig.build.json',
    'tsconfig.json',
    'vitest.config.ts',
  ],
  kind: 'stable-test-wall-clock-v1',
  reporterMode: 'append-after-native-v1',
  schemaVersion: 1,
};

/** @id TEST-M5-TEST-CLOCK-GATE-FINGERPRINT-001
 * @verifies REQ-M5-COMPAT-013
 * @design DES-M5-015
 */
it('TEST-M5-TEST-CLOCK-GATE-FINGERPRINT-001 binds the closed runtime policy without changing legacy approval projection', async () => {
  const current = await candidateGateFingerprintConfig(root);
  expect(current, 'candidate gate must include the approved runtime policy')
    .toHaveProperty('testRuntime', profile);
  expect(sha256(canonicalBytes(profile))).toBe(profileSha256);
  expect(sha256(canonicalBytes(current))).toBe(gateSha256);

  const design = readFileSync(join(root, '.musubix/features/musubix5-clean-foundation/design.md'), 'utf8');
  const section = design.split('### Test runtime extension policy')[1]?.split('## DES-M5-001')[0];
  expect(section).toBeDefined();
  const blocks = [...(section ?? '').matchAll(/```json\n([\s\S]*?)\n```/g)];
  expect(blocks).toHaveLength(2);
  const normativeProfile: unknown = JSON.parse(blocks[0]![1]!);
  const normativeGate: unknown = JSON.parse(blocks[1]![1]!);
  expect(normativeProfile).toEqual(profile);
  expect(sha256(canonicalBytes(normativeGate))).toBe(gateSha256);

  const fixture = mkdtempSync(join(tmpdir(), 'musubix5-runtime-gate-'));
  try {
    mkdirSync(join(fixture, '.musubix'));
    const original: unknown = JSON.parse(readFileSync(join(root, '.musubix/config.json'), 'utf8'));
    if (typeof original !== 'object' || original === null || Array.isArray(original)) {
      throw new Error('Expected an object repository config');
    }
    const legacy = Object.fromEntries(Object.entries(original).filter(([key]) => key !== 'testRuntime'));
    const configPath = join(fixture, '.musubix/config.json');
    writeFileSync(configPath, canonicalBytes(legacy));
    const legacyApproval = canonicalBytes(await loadApprovalProjectionConfig(fixture));
    const legacyGate = await candidateGateFingerprintConfig(fixture);
    expect(legacyGate).not.toHaveProperty('testRuntime');
    expect(sha256(canonicalBytes(legacyGate))).toBe(legacyGateSha256);

    writeFileSync(configPath, canonicalBytes({ ...legacy, testRuntime: profile }));
    expect(canonicalBytes(await loadApprovalProjectionConfig(fixture))).toEqual(legacyApproval);
    expect(await loadConfig(fixture)).toHaveProperty('testRuntime', profile);
    expect(await candidateGateFingerprintConfig(fixture)).toEqual(current);

    const variants = [
      { ...profile, schemaVersion: 2 },
      { ...profile, kind: 'stable-test-wall-clock-v2' },
      { ...profile, expectedSha256: profileSha256 },
      { ...profile, calibration: { samples: 9, maxWidthMs: 1 } },
      { ...profile, inputs: profile.inputs.slice(1) },
      { ...profile, inputs: [...profile.inputs, 'scripts/undeclared.d.ts'] },
      { ...profile, inputs: [...profile.inputs].reverse() },
      { ...profile, commandNames: ['test'] },
      null,
    ];
    for (const invalid of variants) {
      writeFileSync(configPath, canonicalBytes({ ...legacy, testRuntime: invalid }));
      expect(canonicalBytes(await loadApprovalProjectionConfig(fixture))).toEqual(legacyApproval);
      await expect(loadConfig(fixture), JSON.stringify(invalid)).rejects.toThrow();
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
