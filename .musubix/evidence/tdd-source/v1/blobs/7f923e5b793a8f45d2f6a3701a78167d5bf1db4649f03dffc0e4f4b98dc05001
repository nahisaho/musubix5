import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { repositoryRoot } from './fixtures/parallel-runtime-fixture.js';

describe('CHANGE-0003 generation 5 Skill contract', () => {
  /** @id TEST-M5-PARALLEL-SKILL-CONCURRENCY-001
   * @verifies REQ-M5-PARALLEL-003 REQ-M5-PARALLEL-014
   */
  it('TEST-M5-PARALLEL-SKILL-CONCURRENCY-001 requires dispatch to obey the configured concurrency bound', () => {
    const source = readFileSync(resolve(
      repositoryRoot(),
      '.github/skills/sdd-parallel-dispatch/SKILL.md',
    ), 'utf8');
    expect(source).toMatch(/configured concurrency bound/i);
    expect(source).toMatch(/never exceed/i);
  });

  /** @id TEST-M5-PARALLEL-SKILL-OUTCOME-001
   * @verifies REQ-M5-EVIDENCE-006 REQ-M5-PARALLEL-014 REQ-M5-PARALLEL-017
   */
  it('TEST-M5-PARALLEL-SKILL-OUTCOME-001 requires exactly one terminal workflow outcome in every added Skill', () => {
    for (const skill of [
      'sdd-parallel-dispatch',
      'sdd-agent-assignment',
      'sdd-integration-verification',
    ]) {
      const source = readFileSync(resolve(repositoryRoot(), `.github/skills/${skill}/SKILL.md`), 'utf8');
      expect(source).toMatch(/Record exactly one terminal (?:workflow )?(?:declaration|outcome)/);
      expect(source.match(/workflow-record/g)).toHaveLength(1);
    }
  });

  /** @id TEST-M5-PARALLEL-SKILL-PRESERVATION-001
   * @verifies REQ-M5-COMPAT-013 REQ-M5-PARALLEL-014
   */
  it('TEST-M5-PARALLEL-SKILL-PRESERVATION-001 preserves every Skill tracked before CHANGE-0003', () => {
    const root = repositoryRoot();
    const listing = spawnSync('git', [
      '-C', root, 'ls-tree', '-r', '--name-only', 'HEAD', '--', '.github/skills',
    ], { encoding: 'utf8' });
    expect(listing.status).toBe(0);
    const trackedSkills = listing.stdout.split(/\r?\n/)
      .filter((path) => path.endsWith('/SKILL.md'));
    expect(trackedSkills.length).toBeGreaterThan(0);

    for (const path of trackedSkills) {
      const baseline = spawnSync('git', ['-C', root, 'show', `HEAD:${path}`], { encoding: 'utf8' });
      expect(baseline.status, path).toBe(0);
      expect(readFileSync(resolve(root, path), 'utf8'), path).toBe(baseline.stdout);
    }
  });
});
