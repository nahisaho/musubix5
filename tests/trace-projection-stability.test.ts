import {
  mkdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];

function fixture(): string {
  const root = resolve('.test-work', `trace-shared-${randomUUID()}`);
  roots.push(root);
  write(root, 'package.json', {
    name: 'consumer',
    repository: { url: 'https://example.com/consumer.git' },
  });
  write(root, '.musubix/features/sample/requirements.md', [
    '## REQ-SHARED-TRACE-001: Shared trace fixture',
    'Priority: must',
    'Type: functional',
    'Statement: When trace evidence is built, the system shall persist one shared index.',
    'Acceptance: The shared index and cache are byte-identical.',
    '',
  ].join('\n'));
  write(root, '.musubix/features/sample/design.md', [
    '## DES-SHARED-TRACE-001: Shared trace fixture',
    'Responsibilities: Define shared trace persistence.',
    'Interfaces: Trace builder.',
    'Constraints: The graph is repository-wide.',
    'Requirements: REQ-SHARED-TRACE-001',
    'ADRs: ADR-9999',
    '',
  ].join('\n'));
  write(root, 'src/example.ts', [
    '/** @id CODE-SHARED-TRACE-001',
    ' * @implements REQ-SHARED-TRACE-001',
    ' * @design DES-SHARED-TRACE-001',
    ' */',
    'export const example = true;',
    '',
  ].join('\n'));
  return root;
}

function write(root: string, path: string, content: unknown): void {
  const target = join(root, path);
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('shared trace index persistence', () => {
  /** @id TEST-M5-WAVE1-TRACE-STABILITY-001
   * @verifies REQ-M5-WAVE1-TRACE-001
   */
  it('TEST-M5-WAVE1-TRACE-STABILITY-001 keeps no-op shared publications byte and mtime stable', async () => {
    const analysis = await import('../packages/analysis/src/index.js');
    const root = fixture();

    await analysis.buildTrace(root);
    const sharedPath = join(root, '.musubix/trace/index.json');
    const cachePath = join(root, '.musubix/cache/trace.json');
    const firstShared = readFileSync(sharedPath);
    const firstCache = readFileSync(cachePath);
    const firstMtime = [statSync(sharedPath).mtimeMs, statSync(cachePath).mtimeMs];
    const envelope = JSON.parse(firstShared.toString('utf8')) as Record<string, unknown>;

    expect(envelope).toMatchObject({
      schemaVersion: 2,
      kind: 'repository-trace-index',
    });
    expect(firstShared.equals(firstCache)).toBe(true);
    expect(readFileSync(sharedPath, 'utf8').endsWith('\n')).toBe(true);
    expect(analysis.traceOperationCounters.committedArtifactRewrites).toBe(1);

    await analysis.buildTrace(root);
    expect(readFileSync(sharedPath).equals(firstShared)).toBe(true);
    expect(readFileSync(cachePath).equals(firstCache)).toBe(true);
    expect([statSync(sharedPath).mtimeMs, statSync(cachePath).mtimeMs]).toEqual(firstMtime);
    expect(analysis.traceOperationCounters.committedArtifactRewrites).toBe(1);

    write(root, 'src/example.ts', `${readFileSync(join(root, 'src/example.ts'), 'utf8')}\n`);
    await analysis.buildTrace(root);
    expect(readFileSync(sharedPath).equals(readFileSync(cachePath))).toBe(true);
    expect(readFileSync(sharedPath).equals(firstShared)).toBe(false);
    expect(analysis.traceOperationCounters.committedArtifactRewrites).toBe(2);
  });

  /** @id TEST-M5-WAVE1-TRACE-COMPAT-001
   * @verifies REQ-M5-WAVE1-TRACE-002
   */
  it('TEST-M5-WAVE1-TRACE-COMPAT-001 normalizes shared schema and preserves closed precedence', async () => {
    const analysis = await import('../packages/analysis/src/index.js');
    const root = fixture();
    const built = await analysis.buildTrace(root);
    const loaded = await analysis.loadTrace(root);

    expect(loaded).toEqual(built);
    expect(loaded).toMatchObject({ schemaVersion: 1 });
    expect(loaded).not.toHaveProperty('kind');
    expect(readFileSync(join(root, '.musubix/trace/index.json'), 'utf8'))
      .toBe(readFileSync(join(root, '.musubix/cache/trace.json'), 'utf8'));

    write(root, '.musubix/features/sample/trace.json', built);
    rmSync(join(root, '.musubix/cache/trace.json'));
    rmSync(join(root, '.musubix/trace/index.json'));
    await expect(analysis.loadTrace(root)).resolves.toEqual(built);

    write(root, '.musubix/trace/index.json', { invalid: true });
    await expect(analysis.loadTrace(root)).rejects.toThrow('Invalid trace graph');
    write(root, '.musubix/cache/trace.json', { invalid: true });
    await expect(analysis.loadTrace(root)).rejects.toThrow('Invalid trace graph');

    rmSync(join(root, '.musubix/cache/trace.json'));
    rmSync(join(root, '.musubix/trace/index.json'));
    rmSync(join(root, '.musubix/features/sample/trace.json'));
    await expect(analysis.loadTrace(root))
      .rejects.toThrow('Trace graph missing; run musubix5 trace build.');
  });
});
