import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import {
  digest,
  sanitizeWorkflowLogFile,
  validateLoadedWorkflow,
  verifyWorkflowLogFile,
  type WorkflowEvent,
  type WorkflowManifest,
} from '../packages/analysis/src/index.js';

/** @id TEST-M5-EVIDENCE-006
 * @verifies REQ-M5-EVIDENCE-006
 */
test('TEST-M5-EVIDENCE-006 reconciles only the active generation with per-Skill cursors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'musubix5-workflow-generation-'));
  await mkdir(join(root, '.musubix', 'evidence'), { recursive: true });
  await writeFile(join(root, '.musubix', 'evidence', 'changes.json'), JSON.stringify({
    schemaVersion: 1,
    changes: [{
      changeId: 'CHANGE-0002',
      generation: 2,
      state: 'active',
      requirementIds: ['REQ-M5-EVIDENCE-006'],
      phases: {},
    }],
  }));

  const events: Array<WorkflowEvent & { changeId: string; generation: number }> = [
    {
      skill: 'sdd-change',
      version: '0.1.8',
      provenance: 'self-reported',
      phase: 'complete',
      status: 'completed',
      recordedAt: '2026-01-01T00:00:02.000Z',
      changeId: 'CHANGE-0002',
      generation: 1,
    },
    {
      skill: 'skill-a',
      version: '0.1.8',
      provenance: 'self-reported',
      phase: 'complete',
      status: 'completed',
      recordedAt: '2026-01-01T00:00:05.000Z',
      changeId: 'CHANGE-0002',
      generation: 2,
    },
    {
      skill: 'skill-b',
      version: '0.1.8',
      provenance: 'self-reported',
      phase: 'complete',
      status: 'completed',
      recordedAt: '2026-01-01T00:00:06.000Z',
      changeId: 'CHANGE-0002',
      generation: 2,
    },
  ];
  const workflow: WorkflowManifest = {
    schemaVersion: 1,
    events,
    verification: {
      mode: 'compatible',
      sourceSha256: 'a'.repeat(64),
      eventsSha256: digest(JSON.stringify(events)),
      verifiedAt: '2026-01-01T00:00:07.000Z',
      invocations: [
        {
          skill: 'skill-b',
          toolCallId: 'call-b',
          invokedAt: '2026-01-01T00:00:01.000Z',
          completedAt: '2026-01-01T00:00:03.000Z',
          status: 'completed',
        },
        {
          skill: 'skill-a',
          toolCallId: 'call-a',
          invokedAt: '2026-01-01T00:00:01.500Z',
          completedAt: '2026-01-01T00:00:04.000Z',
          status: 'completed',
        },
      ],
    },
  };

  const result = await validateLoadedWorkflow(root, workflow, { mode: 'compatible' }, null);
  assert.equal(result.verified, true);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.events, 2);
  assert.equal(result.skills, 2);
});

/** @id TEST-M5-EVIDENCE-007
 * @verifies REQ-M5-EVIDENCE-007
 */
test('TEST-M5-EVIDENCE-007 compatible sanitization retains only derived lifecycle metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'musubix5-workflow-compatible-'));
  const input = join(root, 'raw.jsonl');
  const output = 'safe.jsonl';
  const lines = [
    { type: 'session.resume', timestamp: '2026-01-01T00:00:00.000Z' },
    { type: 'assistant.message', timestamp: '2026-01-01T00:00:01.000Z', data: { content: 'private' } },
    {
      type: 'tool.execution_start',
      timestamp: '2026-01-01T00:00:02.000Z',
      data: { toolCallId: 'call-a', toolName: 'skill', arguments: { skill: 'sdd-change', secret: 'drop' } },
    },
    {
      type: 'tool.execution_complete',
      timestamp: '2026-01-01T00:00:03.000Z',
      data: { toolCallId: 'call-a', success: true, output: 'drop' },
    },
  ];
  const raw = `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
  await writeFile(input, raw);

  const result = await sanitizeWorkflowLogFile(
    root,
    input,
    output,
    undefined,
    undefined,
    undefined,
    undefined,
    'compatible',
  );
  const safe = await readFile(join(root, output), 'utf8');
  const safeEvents = safe.trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);

  assert.equal(result.mode, 'compatible');
  assert.equal(result.rawSourceSha256, digest(raw));
  assert.equal(result.safeTranscriptSha256, digest(safe));
  assert.equal(result.sourceBytes, Buffer.byteLength(raw));
  assert.equal(result.safeBytes, Buffer.byteLength(safe));
  assert.equal(result.inputEvents, 4);
  assert.equal(result.outputEvents, 3);
  assert.equal(result.eligibleEvents, 3);
  assert.equal(result.retainedEligibleEvents, 3);
  assert.equal(result.skillInvocations, 1);
  assert.equal(result.sessionId, undefined);
  assert.deepEqual(safeEvents.map((event) => event.type), [
    'session.resume',
    'tool.execution_start',
    'tool.execution_complete',
  ]);
  assert.equal(JSON.stringify(safeEvents).includes('private'), false);
  assert.equal(JSON.stringify(safeEvents).includes('secret'), false);
  assert.equal(JSON.stringify(safeEvents).includes('output'), false);
});

/** @id TEST-M5-EVIDENCE-007-MULTI-001
 * @verifies REQ-M5-EVIDENCE-007
 */
test('TEST-M5-EVIDENCE-007-MULTI-001 compatible verification preserves source argument order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'musubix5-workflow-multi-'));
  await mkdir(join(root, '.musubix', 'evidence'), { recursive: true });
  const events: WorkflowEvent[] = [
    {
      skill: 'skill-a',
      version: '0.1.8',
      phase: 'complete',
      status: 'completed',
      recordedAt: '2026-01-01T00:00:12.000Z',
    },
    {
      skill: 'skill-b',
      version: '0.1.8',
      phase: 'complete',
      status: 'completed',
      recordedAt: '2026-01-01T00:00:13.000Z',
    },
  ];
  await writeFile(join(root, '.musubix', 'evidence', 'workflow.json'), JSON.stringify({
    schemaVersion: 1,
    events,
  }));
  const first = join(root, 'first.jsonl');
  const second = join(root, 'second.jsonl');
  await writeFile(first, [
    JSON.stringify({
      type: 'tool.execution_start',
      timestamp: '2026-01-01T00:00:10.000Z',
      data: { toolCallId: 'call-a', toolName: 'skill', arguments: { skill: 'skill-a' } },
    }),
    JSON.stringify({
      type: 'tool.execution_complete',
      timestamp: '2026-01-01T00:00:11.000Z',
      data: { toolCallId: 'call-a', success: true },
    }),
  ].join('\n'));
  await writeFile(second, [
    JSON.stringify({
      type: 'tool.execution_start',
      timestamp: '2026-01-01T00:00:01.000Z',
      data: { toolCallId: 'call-b', toolName: 'skill', arguments: { skill: 'skill-b' } },
    }),
    JSON.stringify({
      type: 'tool.execution_complete',
      timestamp: '2026-01-01T00:00:02.000Z',
      data: { toolCallId: 'call-b', success: true },
    }),
  ].join('\n'));

  const verified = await verifyWorkflowLogFile(root, [first, second], { mode: 'compatible' });
  assert.deepEqual(verified.verification?.invocations.map((invocation) => invocation.skill), ['skill-a', 'skill-b']);
  await assert.rejects(
    verifyWorkflowLogFile(root, [first, first], { mode: 'compatible' }),
    /WORKFLOW_DUPLICATE_SOURCE/,
  );
});
