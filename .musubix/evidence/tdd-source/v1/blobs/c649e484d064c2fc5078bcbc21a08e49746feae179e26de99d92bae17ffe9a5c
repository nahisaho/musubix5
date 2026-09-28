import { canonicalBytes, sha256 } from './canonical.js';

export interface JsonSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  required?: readonly string[];
  properties?: Readonly<Record<string, JsonSchema>>;
  items?: JsonSchema;
}

export interface PlannerDiagnostic {
  code: 'PLANNER_PARSE_ERROR' | 'PLANNER_REQUIRED_FIELD' | 'PLANNER_SCHEMA_TYPE';
  path: string;
  message: string;
}

export interface PlannerOutputResult {
  status: 'valid' | 'retry' | 'terminal';
  ordinal: number;
  value: unknown;
  diagnostics: PlannerDiagnostic[];
  rawSha256: string;
  normalizedSha256: string;
  invalidIdentity: string | null;
  retryContext: {
    invalidOutputOrdinal: number;
    diagnostics: PlannerDiagnostic[];
  } | null;
  terminalReason: 'repeated-invalid-output' | null;
}

function normalized(value: unknown): unknown {
  return JSON.parse(canonicalBytes(value).toString('utf8')) as unknown;
}

function actualType(value: unknown): JsonSchema['type'] {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value as JsonSchema['type'];
}

function validate(value: unknown, schema: JsonSchema, path: string, diagnostics: PlannerDiagnostic[]): void {
  const actual = actualType(value);
  const typeMatches = schema.type === actual || (schema.type === 'number' && actual === 'integer');
  if (!typeMatches) {
    diagnostics.push({
      code: 'PLANNER_SCHEMA_TYPE',
      path,
      message: `Expected ${schema.type} at ${path}, received ${actual}.`,
    });
    return;
  }
  if (schema.type === 'object') {
    const object = value as Record<string, unknown>;
    for (const field of schema.required ?? []) {
      if (!(field in object)) {
        diagnostics.push({
          code: 'PLANNER_REQUIRED_FIELD',
          path: `${path}.${field}`,
          message: `Missing required field ${path}.${field}.`,
        });
      }
    }
    for (const [field, child] of Object.entries(schema.properties ?? {})) {
      if (field in object) validate(object[field], child, `${path}.${field}`, diagnostics);
    }
  }
  if (schema.type === 'array' && schema.items) {
    for (const [index, item] of (value as unknown[]).entries()) {
      validate(item, schema.items, `${path}[${index}]`, diagnostics);
    }
  }
}

function redact(message: string, secrets: string[]): string {
  return secrets.filter(Boolean).reduce((safe, secret) => safe.replaceAll(secret, '[REDACTED]'), message);
}

/** @id CODE-M5-PLANNER-001
 * @implements REQ-M5-PLANNER-001 REQ-M5-PLANNER-003
 * @design DES-M5-010
 */
export function processPlannerOutput(input: {
  raw: string;
  schema: JsonSchema;
  ordinal: number;
  secrets: string[];
  previousInvalidIdentity: string | null;
}): PlannerOutputResult {
  const rawSha256 = sha256(Buffer.from(input.raw, 'utf8'));
  let value: unknown = null;
  const diagnostics: PlannerDiagnostic[] = [];
  try {
    value = normalized(JSON.parse(input.raw) as unknown);
  } catch (cause) {
    diagnostics.push({
      code: 'PLANNER_PARSE_ERROR',
      path: '$',
      message: redact(cause instanceof Error ? cause.message : String(cause), input.secrets),
    });
  }
  if (!diagnostics.length) validate(value, input.schema, '$', diagnostics);
  const normalizedSha256 = sha256(canonicalBytes(value));
  if (!diagnostics.length) {
    return {
      status: 'valid',
      ordinal: input.ordinal,
      value,
      diagnostics: [],
      rawSha256,
      normalizedSha256,
      invalidIdentity: null,
      retryContext: null,
      terminalReason: null,
    };
  }
  const invalidIdentity = sha256(canonicalBytes({
    normalizedSha256,
    diagnostics: diagnostics.map(({ code, path }) => ({ code, path })),
  }));
  const repeated = invalidIdentity === input.previousInvalidIdentity;
  return {
    status: repeated ? 'terminal' : 'retry',
    ordinal: input.ordinal,
    value: null,
    diagnostics,
    rawSha256,
    normalizedSha256,
    invalidIdentity,
    retryContext: repeated ? null : {
      invalidOutputOrdinal: input.ordinal,
      diagnostics,
    },
    terminalReason: repeated ? 'repeated-invalid-output' : null,
  };
}

/** @id CODE-M5-PLANNER-002
 * @implements REQ-M5-PLANNER-002 REQ-M5-PLANNER-004
 * @design DES-M5-010
 */
export function roleRetryIdentity(invocationKey: string, invalidOutputOrdinal: number): string {
  return `role-retry:${sha256(canonicalBytes({ invocationKey, invalidOutputOrdinal }))}`;
}

export function producerRepairIdentity(boundaryKey: string, rejectedOutputOrdinal: number): string {
  return `producer-repair:${sha256(canonicalBytes({ boundaryKey, rejectedOutputOrdinal }))}`;
}
