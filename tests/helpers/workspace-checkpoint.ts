import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ChangeEvidence } from '../../packages/analysis/src/change-evidence.js';
import { appendEvidenceOrder } from '../../packages/analysis/src/order.js';
import { defaultConfig } from '../../packages/analysis/src/config.js';

export async function workspaceCheckpointFixture(evidence: ChangeEvidence) {
  mkdirSync(resolve('.musubix/cache'), { recursive: true });
  const cleanupRoot = mkdtempSync(resolve('.musubix/cache/workspace-binding-'));
  const controlRoot = join(cleanupRoot, 'control');
  const sourceRoot = join(cleanupRoot, 'source');
  execFileSync('git', ['init', '--quiet', controlRoot]);
  execFileSync('git', ['-C', controlRoot, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '--quiet', '--allow-empty', '-m', 'fixture']);
  execFileSync('git', ['-C', controlRoot, 'worktree', 'add', '--quiet', '--detach', sourceRoot, 'HEAD']);
  mkdirSync(join(controlRoot, '.musubix/evidence'), { recursive: true });
  mkdirSync(join(controlRoot, '.musubix/changes'), { recursive: true });
  writeFileSync(join(controlRoot, '.musubix/config.json'), JSON.stringify(defaultConfig));
  writeFileSync(join(controlRoot, '.musubix/evidence/changes.json'), JSON.stringify(evidence));
  const change = evidence.changes[0]!;
  writeFileSync(join(controlRoot, `.musubix/changes/${change.changeId}.md`),
    `# ${change.changeId}\nRequirements: ${change.requirementIds.join(' ')}\n`);
  await appendEvidenceOrder(controlRoot, {
    kind: 'change', entityId: change.changeId,
    phase: change.phases.design ? 'g1:design' : `g1:red:${change.tddBatches![0]!.scopeId}`,
  });
  return { cleanupRoot, controlRoot, sourceRoot };
}
