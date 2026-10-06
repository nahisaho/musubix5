import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { loadConfig } from '../packages/analysis/src/config.js';
import { sanitizeWorkflowLogFile } from '../packages/analysis/src/workflow.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** @id TEST-M5-WORKFLOW-TRANSCRIPT-LIMIT-001
 * @verifies REQ-M5-EVIDENCE-007
 * @design DES-M5-018
 */
it('TEST-M5-WORKFLOW-TRANSCRIPT-LIMIT-001 Generation 49 binds bounded transcript totals and lines without large fixtures', async () => {
  const config = await loadConfig(process.cwd());
  expect(config.workflow.maxTranscriptBytes).toBe(600_000_000);
  expect(config.workflow.maxTranscriptLineBytes).toBe(4_000_000);
  expect(600_000_000).toBeLessThanOrEqual(config.workflow.maxTranscriptBytes!);
  expect(600_000_001).toBeGreaterThan(config.workflow.maxTranscriptBytes!);
  expect(4_000_000).toBeLessThanOrEqual(config.workflow.maxTranscriptLineBytes!);
  expect(4_000_001).toBeGreaterThan(config.workflow.maxTranscriptLineBytes!);

  const directory = mkdtempSync(join(process.cwd(), '.test-work/workflow-limit-'));
  temporaryDirectories.push(directory);
  const input = join(directory, 'events.jsonl');
  const output = join(directory, 'safe.jsonl');
  writeFileSync(input, '{}\n{}\n{} \n');
  await expect(sanitizeWorkflowLogFile(directory, input, output, undefined, undefined, 10, 10, 'compatible'))
    .rejects.toThrow('No Copilot Skill invocation events were found in the workflow transcript.');
  writeFileSync(input, '12345678901');
  await expect(sanitizeWorkflowLogFile(directory, input, output, undefined, undefined, 10, 10, 'compatible'))
    .rejects.toThrow('WORKFLOW_TRANSCRIPT_SIZE: Workflow transcript exceeds the maximum total size of 10 bytes');
});
