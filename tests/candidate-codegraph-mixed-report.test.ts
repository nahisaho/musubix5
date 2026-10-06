import { execFileSync } from './fixtures/counted-process.js';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { expect, it } from 'vitest';

/** @id TEST-M5-CI-CODEGRAPH-MIXED-REPORT-001
 * @verifies REQ-M5-CI-EFFICIENCY-001
 * @design DES-M5-CI-EFFICIENCY-002
 */
it('TEST-M5-CI-CODEGRAPH-MIXED-REPORT-001 preserves native per-assertion status when one batched assertion fails', async () => {
  const wrapper = resolve('scripts/run-codegraph-tests.mjs');
  const source = await readFile(wrapper, 'utf8');
  const files = [.../const testFiles = \[([\s\S]*?)\];/.exec(source)![1]!.matchAll(/'([^']+)'/g)].map(match => match[1]!);
  const root = await mkdtemp(resolve('.musubix/cache/mixed-report-'));
  try {
    for (const file of files) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await copyFile(file, join(root, file));
    }
    await mkdir(join(root, 'node_modules/vitest'), { recursive: true });
    await writeFile(join(root, 'node_modules/vitest/vitest.mjs'), `
import { writeFile } from 'node:fs/promises';
const ids = process.argv[process.argv.indexOf('-t') + 1].match(/TEST-[A-Z0-9-]+/g);
const mixed = ids.length > 1;
const assertionResults = ids.map((title, index) => ({
  title, status: mixed && index === 0 ? 'failed' : 'passed',
  failureMessages: mixed && index === 0 ? ['controlled native assertion failure'] : [],
}));
await writeFile(process.argv.find(arg => arg.startsWith('--outputFile=')).slice(13),
  JSON.stringify({ testResults: [{ assertionResults }] }));
if (mixed) process.exitCode = 1;
`);
    const report = join(root, 'aggregate.json');
    const groups = JSON.parse(execFileSync(process.execPath, [wrapper, '--describe-groups', '--report', report],
      { cwd: root, encoding: 'utf8' })).groups as Array<{ testIds: string[] }>;
    const batched = groups.find(group => group.testIds.length > 1)!;
    let exitCode: number | undefined;
    try { execFileSync(process.execPath, [wrapper, '--report', report], { cwd: root, stdio: 'pipe' }); }
    catch (cause) { exitCode = (cause as { status?: number }).status; }
    expect(exitCode).toBe(1);
    const tests = JSON.parse(await readFile(report, 'utf8')).tests as Array<{ id: string; status: string }>;
    expect(tests.find(test => test.id === batched.testIds[0])?.status).toBe('failed');
    for (const id of batched.testIds.slice(1)) expect(tests.find(test => test.id === id)?.status).toBe('passed');
    expect(tests).toHaveLength(groups.flatMap(group => group.testIds).length);
  } finally { await rm(root, { recursive: true, force: true }); }
});
