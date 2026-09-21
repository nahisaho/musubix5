import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  candidateMatrixJobs,
  validateCandidateGateSet,
  type CandidateGateJobResult,
} from '../packages/analysis/src/candidate-gate.js';
import { approvalManifest, validateApprovalStage } from '../packages/analysis/src/approval.js';
import { persistCandidateSnapshot } from '../packages/analysis/src/workspace-manager.js';

describe('candidate-bound matrix gates', () => {
  /**
   * @id TEST-M5-RELEASE-002
   * @verifies REQ-M5-RELEASE-002
   */
  it('TEST-M5-RELEASE-002 requires the complete passing matrix for the exact candidate', () => {
    const context = {
      repositoryId: 'repository:abc',
      changeId: 'CHANGE-0002',
      generation: 2,
      candidateCommit: 'a'.repeat(40),
      gateInputFingerprint: 'b'.repeat(64),
    };
    const records: CandidateGateJobResult[] = candidateMatrixJobs.map((job) => ({
      ...context,
      schemaVersion: 1,
      job,
      producer: 'github-actions',
      runtime: { nodeMajor: job.nodeMajor, os: job.os },
      commandsPassed: true,
      preTreeMatchesCandidate: true,
      postTreeMatchesCandidate: true,
      status: 'pass',
    }));

    expect(validateCandidateGateSet(context, records)).toEqual({ valid: true, diagnostics: [] });
    expect(validateCandidateGateSet(context, records.slice(1))).toMatchObject({
      valid: false,
      diagnostics: [{ code: 'RELEASE_GATE_EVIDENCE_MISSING' }],
    });
    expect(validateCandidateGateSet(context, [
      { ...records[0]!, candidateCommit: 'c'.repeat(40) },
      ...records.slice(1),
    ])).toMatchObject({
      valid: false,
      diagnostics: [{ code: 'RELEASE_GATE_CANDIDATE_MISMATCH' }],
    });

  });

  /**
   * @id TEST-M5-RELEASE-002-APPROVAL-001
   * @verifies REQ-M5-RELEASE-002
   */
  it('TEST-M5-RELEASE-002-APPROVAL-001 rejects release preparation without active-generation matrix evidence', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-candidate-gate-approval-'));
    execFileSync('git', ['init', '--quiet', root]);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test User']);
    mkdirSync(join(root, '.musubix', 'changes'), { recursive: true });
    mkdirSync(join(root, '.musubix', 'evidence'), { recursive: true });
    writeFileSync(join(root, '.musubix', 'changes', 'CHANGE-0002.md'), '# CHANGE-0002\n');
    writeFileSync(join(root, '.musubix', 'evidence', 'changes.json'), JSON.stringify({
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0002',
        generation: 2,
        state: 'active',
        requirementIds: ['REQ-M5-RELEASE-002'],
        phases: {},
      }],
    }));
    writeFileSync(join(root, 'package.json'), '{}\n');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', 'candidate']);
    await persistCandidateSnapshot(root, 'CHANGE-0002');

    await expect(approvalManifest(root, 'release'))
      .rejects.toThrow('RELEASE_GATE_EVIDENCE_MISSING');
  });

  /**
   * @id TEST-M5-RELEASE-002-GATE-DIAGNOSTIC-001
   * @verifies REQ-M5-RELEASE-002
   */
  it('TEST-M5-RELEASE-002-GATE-DIAGNOSTIC-001 reports missing matrix evidence as approval non-pass', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-candidate-gate-diagnostic-'));
    execFileSync('git', ['init', '--quiet', root]);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test User']);
    mkdirSync(join(root, '.musubix', 'changes'), { recursive: true });
    mkdirSync(join(root, '.musubix', 'evidence'), { recursive: true });
    writeFileSync(join(root, '.musubix', 'changes', 'CHANGE-0002.md'), '# CHANGE-0002\n');
    writeFileSync(join(root, '.musubix', 'evidence', 'changes.json'), JSON.stringify({
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0002',
        generation: 2,
        state: 'active',
        requirementIds: ['REQ-M5-RELEASE-002'],
        phases: {},
      }],
    }));
    writeFileSync(join(root, 'package.json'), '{}\n');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', 'candidate']);
    await persistCandidateSnapshot(root, 'CHANGE-0002');

    await expect(validateApprovalStage(root, 'release', { mode: 'required', domains: [] }))
      .resolves.toMatchObject({
        status: 'missing',
        diagnostics: [{ code: 'RELEASE_GATE_EVIDENCE_MISSING' }],
      });
  });
});
