import { canonicalBytes, sha256 } from './canonical.js';
import { parseConfig, type Config } from './config.js';

export const BASELINE_IDENTITY = {
  package: 'musubix3',
  version: '0.1.18',
  tag: 'v0.1.18',
  commit: 'c0b20f06727bceb04eeec181d95af9047b1981de',
} as const;

export interface CompatibilityDiagnostic {
  code: string;
  message: string;
}

export interface CompatibilityResult {
  valid: boolean;
  diagnostics: CompatibilityDiagnostic[];
}

const HELP_FIXTURE_SHA256 = '675ceaf3fb693488bfcf3da0a9db475b666164db4c304ded0a2524ce09a4ede0';

function result(diagnostics: CompatibilityDiagnostic[]): CompatibilityResult {
  return { valid: diagnostics.length === 0, diagnostics };
}

/** @id CODE-M5-COMPAT-ORACLE-001
 * @implements REQ-M5-COMPAT-008 REQ-M5-COMPAT-009
 * @design DES-M5-001
 */
export function validateCompatibilityInventory(input: {
  requirements: string;
  helpFixture: Uint8Array;
}): CompatibilityResult {
  const diagnostics: CompatibilityDiagnostic[] = [];
  if (sha256(input.helpFixture) !== HELP_FIXTURE_SHA256) {
    diagnostics.push({
      code: 'COMPAT_HELP_FIXTURE_DIGEST_MISMATCH',
      message: `The verbatim CLI-help fixture must have SHA-256 ${HELP_FIXTURE_SHA256}.`,
    });
  }
  if (!input.requirements.includes(`tag: \`${BASELINE_IDENTITY.tag}\``)
    || !input.requirements.includes(`commit: \`${BASELINE_IDENTITY.commit}\``)
    || !input.requirements.includes(`CLI-help fixture SHA-256:\n  \`${HELP_FIXTURE_SHA256}\``)) {
    diagnostics.push({
      code: 'COMPAT_INVENTORY_IDENTITY_MISMATCH',
      message: 'The normative compatibility inventory is not bound to the approved baseline identity and fixture.',
    });
  }
  return result(diagnostics);
}

/** @id CODE-M5-COMPAT-EXIT-001
 * @implements REQ-M5-COMPAT-002
 * @design DES-M5-001
 */
export function verifyExitSemantics(
  observations: Array<{ command: string; baseline: number; candidate: number }>,
): CompatibilityResult {
  return result(observations
    .filter((observation) => observation.baseline !== observation.candidate)
    .map((observation) => ({
      code: 'COMPAT_EXIT_MISMATCH',
      message: `${observation.command} exited ${observation.candidate}; baseline exited ${observation.baseline}.`,
    })));
}

/** @id CODE-M5-COMPAT-BIN-001
 * @implements REQ-M5-COMPAT-005 REQ-M5-COMPAT-006
 * @design DES-M5-001 DES-M5-002
 */
export function validatePublishedBinContract(packageManifest: {
  name?: unknown;
  bin?: unknown;
}): CompatibilityResult {
  const expected = { musubix5: 'dist/packages/cli/src/main.js' };
  const valid = packageManifest.name === 'musubix5'
    && packageManifest.bin !== null
    && typeof packageManifest.bin === 'object'
    && !Array.isArray(packageManifest.bin)
    && Buffer.compare(
      canonicalBytes(packageManifest.bin),
      canonicalBytes(expected),
    ) === 0;
  return result(valid ? [] : [{
    code: 'COMPAT_BIN_CONTRACT_MISMATCH',
    message: 'The package must expose exactly musubix5 -> dist/packages/cli/src/main.js.',
  }]);
}

/** @id CODE-M5-COMPAT-CONFIG-001
 * @implements REQ-M5-COMPAT-004
 * @design DES-M5-001
 */
export function compareEffectiveConfig(
  omittedFields: unknown,
  explicitFields: unknown,
): CompatibilityResult & { omitted?: Config; explicit?: Config } {
  const omitted = parseConfig(omittedFields);
  const explicit = parseConfig(explicitFields);
  const diagnostics = Buffer.compare(canonicalBytes(omitted), canonicalBytes(explicit)) === 0
    ? []
    : [{
      code: 'COMPAT_CONFIG_DEFAULT_MISMATCH',
      message: 'Omitted and explicit schema-version-1 configuration resolve differently.',
    }];
  return { ...result(diagnostics), omitted, explicit };
}

/** @id CODE-M5-COMPAT-GOVERNANCE-001
 * @implements REQ-M5-COMPAT-007
 * @design DES-M5-001
 */
export function validateGovernedDifference(difference: {
  id: string;
  requirementId: string;
  adrPath: string;
  migrationGuideEntry: string;
  testId: string;
}): CompatibilityResult {
  const diagnostics: CompatibilityDiagnostic[] = [];
  if (!/^REQ-[A-Z0-9-]+$/.test(difference.requirementId)) {
    diagnostics.push({
      code: 'COMPAT_GOVERNANCE_REQUIREMENT_MISSING',
      message: `${difference.id} has no dedicated requirement.`,
    });
  }
  if (!/^\.musubix\/decisions\/ADR-\d+\.md$/.test(difference.adrPath)) {
    diagnostics.push({
      code: 'COMPAT_GOVERNANCE_ADR_MISSING',
      message: `${difference.id} has no ADR.`,
    });
  }
  if (!difference.migrationGuideEntry.trim()) {
    diagnostics.push({
      code: 'COMPAT_GOVERNANCE_MIGRATION_MISSING',
      message: `${difference.id} has no migration-guide entry.`,
    });
  }
  if (!/^TEST-[A-Z0-9-]+$/.test(difference.testId)) {
    diagnostics.push({
      code: 'COMPAT_GOVERNANCE_TEST_MISSING',
      message: `${difference.id} has no regression test.`,
    });
  }
  return result(diagnostics);
}

/** @id CODE-M5-COMPAT-MIGRATION-001
 * @implements REQ-M5-COMPAT-010
 * @design DES-M5-001
 */
export function classifyMigration(paths: string[]): {
  preserved: string[];
  foreignEvidence: string[];
} {
  const unique = [...new Set(paths)].sort();
  return {
    preserved: unique.filter((path) => !path.startsWith('.musubix/evidence/')),
    foreignEvidence: unique.filter((path) => path.startsWith('.musubix/evidence/')),
  };
}

/** @id CODE-M5-COMPAT-SOLVER-001
 * @implements REQ-M5-COMPAT-011
 * @design DES-M5-001
 */
export function legacySolverCommands(environment: NodeJS.ProcessEnv): {
  z3: string;
  lean: string | null;
} {
  return {
    z3: environment.MUSUBIX3_Z3 ?? 'z3',
    lean: environment.MUSUBIX3_LEAN ?? null,
  };
}

export type CompatibilityRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export interface BaselineOracleCapture {
  schemaVersion: 1;
  baseline: typeof BASELINE_IDENTITY;
  sourceRoot: string;
  workspaceRoot: string;
  buildCommands: ['npm ci', 'npm run build'];
  invocation: string[];
  exitCode: number;
  stdoutSha256: string;
  stderrSha256: string;
  jsonPayloadSha256: string | null;
  filesystemEffectsSha256: string;
}

/** @id CODE-M5-COMPAT-ORACLE-002
 * @implements REQ-M5-COMPAT-009 REQ-M5-COMPAT-012
 * @design DES-M5-001
 */
export async function runBaselineOracle(input: {
  sourceRoot: string;
  workspaceRoot: string;
  invocation: string[];
  filesystemEffects: Array<{ path: string; sha256: string }>;
}, runner: CompatibilityRunner): Promise<BaselineOracleCapture> {
  const identity = await runner('git', ['-C', input.sourceRoot, 'rev-parse', 'HEAD'], {
    cwd: input.sourceRoot,
  });
  if (identity.exitCode !== 0 || identity.stdout.trim() !== BASELINE_IDENTITY.commit) {
    throw new Error(
      `COMPAT_BASELINE_IDENTITY_MISMATCH: expected ${BASELINE_IDENTITY.commit}, got ${identity.stdout.trim() || 'unavailable'}.`,
    );
  }
  const install = await runner('npm', ['ci'], { cwd: input.workspaceRoot });
  if (install.exitCode !== 0) {
    throw new Error(`COMPAT_BASELINE_BUILD_FAILED: npm ci exited ${install.exitCode}.`);
  }
  const build = await runner('npm', ['run', 'build'], { cwd: input.workspaceRoot });
  if (build.exitCode !== 0) {
    throw new Error(`COMPAT_BASELINE_BUILD_FAILED: npm run build exited ${build.exitCode}.`);
  }
  const invocation = await runner('node', [
    'dist/packages/cli/src/main.js',
    ...input.invocation,
  ], { cwd: input.workspaceRoot });
  let jsonPayloadSha256: string | null = null;
  try {
    jsonPayloadSha256 = sha256(canonicalBytes(JSON.parse(invocation.stdout) as unknown));
  } catch (caught) {
    if (!(caught instanceof SyntaxError)) throw caught;
  }
  const filesystemEffects = [...input.filesystemEffects]
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    schemaVersion: 1,
    baseline: BASELINE_IDENTITY,
    sourceRoot: input.sourceRoot,
    workspaceRoot: input.workspaceRoot,
    buildCommands: ['npm ci', 'npm run build'],
    invocation: [...input.invocation],
    exitCode: invocation.exitCode,
    stdoutSha256: sha256(Buffer.from(invocation.stdout)),
    stderrSha256: sha256(Buffer.from(invocation.stderr)),
    jsonPayloadSha256,
    filesystemEffectsSha256: sha256(canonicalBytes(filesystemEffects)),
  };
}
