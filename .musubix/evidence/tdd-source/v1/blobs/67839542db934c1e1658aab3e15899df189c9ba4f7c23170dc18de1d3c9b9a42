import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('candidate gate trust contract', () => {
  /**
   * @id TEST-M5-RELEASE-002-TRUST-001
   * @verifies REQ-M5-APPROVAL-007 REQ-M5-EVIDENCE-003 REQ-M5-RELEASE-002 REQ-M5-TDD-CURRENCY-001
   */
  it('TEST-M5-RELEASE-002-TRUST-001 materializes approved policy and rejects unsigned artifacts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-candidate-trust-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test User']);
    mkdirSync(join(root, '.musubix'), { recursive: true });
    writeFileSync(join(root, '.musubix', 'config.json'), JSON.stringify({
      schemaVersion: 1,
      approval: { mode: 'required', domains: [] },
    }));
    writeFileSync(join(root, 'package.json'), '{}\n');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', 'candidate']);

    const {
      candidateGateFingerprintConfig,
      ingestCandidateGateEnvelopes,
    } = await import('../packages/analysis/src/candidate-gate.js');
    const { sha256, canonicalBytes } =
      await import('../packages/analysis/src/canonical.js');

    const projection = await candidateGateFingerprintConfig(
      fileURLToPath(new URL('..', import.meta.url)),
    );
    expect(sha256(canonicalBytes(projection)))
      .toBe('4024de812ec88cca469bc4e86825b742691c92f8f605c03d4b44b3294a1dfd2d');

    await expect(ingestCandidateGateEnvelopes(root, [{
      schemaVersion: 1,
      result: {
        schemaVersion: 1,
        repositoryId: 'repository:untrusted',
        changeId: 'CHANGE-0002',
        generation: 2,
        candidateCommit: 'a'.repeat(40),
        gateInputFingerprint: 'b'.repeat(64),
        job: { os: 'ubuntu', nodeMajor: 24 },
        producer: 'github-actions',
        runtime: { os: 'ubuntu', nodeMajor: 24 },
        commandsPassed: true,
        preTreeMatchesCandidate: true,
        postTreeMatchesCandidate: true,
        status: 'pass',
      },
      attestation: null,
    }])).rejects.toThrow('RELEASE_GATE_EVIDENCE_STALE');
  });
});
