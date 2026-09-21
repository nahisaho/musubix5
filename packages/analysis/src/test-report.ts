export interface MusubixTestReport {
  schemaVersion: 1;
  tests: Array<{
    id: string;
    status: 'passed' | 'failed' | 'skipped' | 'error';
    operations?: Record<string, number>;
  }>;
}

export function parseMusubixTestReport(text: string): MusubixTestReport {
  const value = JSON.parse(text) as MusubixTestReport;
  if (value.schemaVersion !== 1 || !Array.isArray(value.tests)) throw new Error('Invalid structured TDD report.');
  for (const test of value.tests) {
    if (!test || typeof test.id !== 'string' || !['passed', 'failed', 'skipped', 'error'].includes(test.status)) {
      throw new Error('Invalid structured TDD test result.');
    }
    if (test.operations !== undefined && (!test.operations || typeof test.operations !== 'object' || Array.isArray(test.operations)
      || Object.entries(test.operations).some(([name, count]) => !/^[\p{L}_][\p{L}\p{N}_.:-]{0,127}$/u.test(name)
        || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0))) {
      throw new Error('Structured test operations must be nonnegative integer counters.');
    }
  }
  return value;
}
