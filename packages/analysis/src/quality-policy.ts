import { canonicalBytes, sha256 } from './canonical.js';

export type MandatoryEvidenceStatus =
  | 'pass'
  | 'missing'
  | 'stale'
  | 'fail'
  | 'skipped'
  | 'unsupported'
  | 'flaky'
  | 'waived'
  | 'foreign'
  | 'superseded';

export interface MandatoryEvidenceState {
  kind: string;
  status: MandatoryEvidenceStatus;
  current: boolean;
  changeId: string;
}

export interface ReadinessDiagnostic {
  code: string;
  kind: string;
  message: string;
}

/** @id CODE-M5-QUALITY-001
 * @implements REQ-M5-WAIVER-001 REQ-M5-QUALITY-001
 * @design DES-M5-015
 */
export function evaluateMandatoryEvidence(
  releaseChangeId: string,
  evidence: MandatoryEvidenceState[],
): { ready: boolean; diagnostics: ReadinessDiagnostic[] } {
  const diagnostics = evidence.flatMap((entry): ReadinessDiagnostic[] => {
    if (entry.changeId !== releaseChangeId || entry.status === 'foreign') {
      return [{
        code: 'MANDATORY_EVIDENCE_FOREIGN',
        kind: entry.kind,
        message: `${entry.kind} is not owned by ${releaseChangeId}.`,
      }];
    }
    if (!entry.current || entry.status === 'stale' || entry.status === 'superseded') {
      return [{
        code: 'MANDATORY_EVIDENCE_STALE',
        kind: entry.kind,
        message: `${entry.kind} is not current.`,
      }];
    }
    if (entry.status !== 'pass') {
      return [{
        code: `MANDATORY_EVIDENCE_${entry.status.toUpperCase()}`,
        kind: entry.kind,
        message: `${entry.kind} has mandatory non-pass status ${entry.status}.`,
      }];
    }
    return [];
  });
  return { ready: diagnostics.length === 0, diagnostics };
}

export type FormalRequirementClassification =
  | 'modeled-pass'
  | 'modeled-fail'
  | 'unsupported'
  | 'solver-error';

/** @id CODE-M5-QUALITY-002
 * @implements REQ-M5-QUALITY-002
 * @design DES-M5-014 DES-M5-015
 */
export function classifyFormalRequirement(input: {
  modeled: boolean;
  solverStatus: 'not-requested' | 'completed' | 'error';
  consistent: boolean | null;
}): FormalRequirementClassification {
  if (!input.modeled) return 'unsupported';
  if (input.solverStatus === 'error' || input.consistent === null) return 'solver-error';
  return input.consistent ? 'modeled-pass' : 'modeled-fail';
}

function withoutDisplayMetadata(value: unknown, displayKeys: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => withoutDisplayMetadata(entry, displayKeys));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !displayKeys.has(key))
      .map(([key, entry]) => [key, withoutDisplayMetadata(entry, displayKeys)]));
  }
  return value;
}

/** @id CODE-M5-QUALITY-003
 * @implements REQ-M5-QUALITY-003
 * @design DES-M5-003 DES-M5-015
 */
export function deterministicEvidenceDigest(
  value: unknown,
  displayOnlyKeys: string[] = [],
): string {
  return sha256(canonicalBytes(withoutDisplayMetadata(value, new Set(displayOnlyKeys))));
}

export const REQUIRED_VERIFICATION_COMMANDS = [
  'typecheck',
  'build',
  'test',
  'compatibility',
  'pack-check',
  'pack-smoke',
] as const;

export interface MissingCommandDiagnostic {
  code: 'missing-command';
  severity: 'error';
  command: string;
  message: string;
}

/** @id CODE-M5-QUALITY-004
 * @implements REQ-M5-QUALITY-004 REQ-M5-QUALITY-005
 * @design DES-M5-015
 */
export function requiredCommandDiagnostics(commandNames: string[]): MissingCommandDiagnostic[] {
  const configured = new Set(commandNames);
  return REQUIRED_VERIFICATION_COMMANDS
    .filter((command) => !configured.has(command))
    .map((command) => ({
      code: 'missing-command',
      severity: 'error',
      command,
      message: `Required verification command ${command} is not configured.`,
    }));
}
