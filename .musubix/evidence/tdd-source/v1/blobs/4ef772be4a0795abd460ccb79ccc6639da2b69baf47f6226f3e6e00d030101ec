import { describe, expect, it } from 'vitest';

describe('quality readiness policy', () => {
  /**
   * @id TEST-M5-QUALITY-001
   * @verifies REQ-M5-WAIVER-001 REQ-M5-QUALITY-001 REQ-M5-QUALITY-002 REQ-M5-QUALITY-003 REQ-M5-QUALITY-004 REQ-M5-QUALITY-005
   */
  it('TEST-M5-QUALITY-001 keeps every non-pass mandatory state out of readiness', async () => {
    const {
      classifyFormalRequirement,
      deterministicEvidenceDigest,
      evaluateMandatoryEvidence,
      requiredCommandDiagnostics,
    } = await import('../packages/analysis/src/quality-policy.js');

    expect(evaluateMandatoryEvidence('CHANGE-0002', [
      { kind: 'requirements-approval', status: 'pass', current: true, changeId: 'CHANGE-0002' },
      { kind: 'quality', status: 'waived', current: true, changeId: 'CHANGE-0002' },
    ])).toMatchObject({
      ready: false,
      diagnostics: [{ code: 'MANDATORY_EVIDENCE_WAIVED', kind: 'quality' }],
    });
    expect(evaluateMandatoryEvidence('CHANGE-0002', [
      { kind: 'quality', status: 'pass', current: true, changeId: 'CHANGE-OTHER' },
    ])).toMatchObject({
      ready: false,
      diagnostics: [{ code: 'MANDATORY_EVIDENCE_FOREIGN', kind: 'quality' }],
    });

    expect(classifyFormalRequirement({
      modeled: false,
      solverStatus: 'not-requested',
      consistent: null,
    })).toBe('unsupported');
    expect(classifyFormalRequirement({
      modeled: true,
      solverStatus: 'error',
      consistent: null,
    })).toBe('solver-error');
    expect(classifyFormalRequirement({
      modeled: true,
      solverStatus: 'completed',
      consistent: true,
    })).toBe('modeled-pass');
    expect(classifyFormalRequirement({
      modeled: true,
      solverStatus: 'completed',
      consistent: false,
    })).toBe('modeled-fail');

    expect(deterministicEvidenceDigest({
      status: 'pass',
      generatedAt: 'first-display-value',
      nested: { value: 1 },
    }, ['generatedAt'])).toBe(deterministicEvidenceDigest({
      nested: { value: 1 },
      generatedAt: 'different-display-value',
      status: 'pass',
    }, ['generatedAt']));

    expect(requiredCommandDiagnostics([])).toEqual([
      expect.objectContaining({ code: 'missing-command', command: 'typecheck' }),
      expect.objectContaining({ code: 'missing-command', command: 'build' }),
      expect.objectContaining({ code: 'missing-command', command: 'test' }),
      expect.objectContaining({ code: 'missing-command', command: 'compatibility' }),
      expect.objectContaining({ code: 'missing-command', command: 'pack-check' }),
      expect.objectContaining({ code: 'missing-command', command: 'pack-smoke' }),
    ]);
    expect(requiredCommandDiagnostics([
      'typecheck', 'build', 'test', 'compatibility', 'pack-check', 'pack-smoke',
    ])).toEqual([]);
  });
});
