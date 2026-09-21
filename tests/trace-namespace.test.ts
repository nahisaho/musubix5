import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('trace evidence namespace', () => {
  /**
   * @id TEST-M5-EVIDENCE-TRACE-001
   * @verifies REQ-M5-EVIDENCE-001 REQ-M5-EVIDENCE-002
   */
  it('TEST-M5-EVIDENCE-TRACE-001 excludes inherited musubix3 trace declarations', async () => {
    const { buildTrace, checkTrace } = await import('../packages/analysis/src/index.js');
    const root = fileURLToPath(new URL('..', import.meta.url));
    const graph = await buildTrace(root, false);
    const checked = await checkTrace(root, graph, true);

    expect(checked.diagnostics.filter((diagnostic) => diagnostic.code === 'TRACE_DANGLING'))
      .toEqual([]);
  });
});
