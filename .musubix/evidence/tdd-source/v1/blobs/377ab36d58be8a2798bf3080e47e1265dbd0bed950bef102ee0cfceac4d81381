import { describe, expect, it } from 'vitest';

describe('candidate source ownership routing', () => {
  /** @id TEST-M5-CANDIDATE-OWNERSHIP-ROUTING-001
   * @verifies REQ-M5-MULTI-CHANGE-004
   */
  it('TEST-M5-CANDIDATE-OWNERSHIP-ROUTING-001 excludes shared operational state from candidate source ownership', async () => {
    const api = await import('../packages/analysis/src/candidate-state.js') as typeof import(
      '../packages/analysis/src/candidate-state.js'
    ) & {
      candidateOwnedSourcePaths(paths: readonly string[]): string[];
    };

    expect(api.candidateOwnedSourcePaths([
      'src/feature.ts',
      '.musubix/evidence/tdd.json',
      '.musubix/journal/normal/000000000001.json',
      '.musubix/candidates/registry.json',
      'README.md',
      './src/feature.ts',
    ])).toEqual([
      'README.md',
      'src/feature.ts',
    ]);
  });
});
