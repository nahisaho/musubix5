import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { cleanTestRuntimeBuildEnvironment, resolveBuildInvocationForEnvironment } from '../packages/analysis/src/process.js';

/** @id CODE-M5-TEST-RUNTIME-GLOBAL-SETUP-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-015
 */
export default async function globalSetup(project: TestProject): Promise<void> {
  const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
  const build = resolveBuildInvocationForEnvironment();
  execFileSync(build.command, build.args, {
    cwd: repositoryRoot, stdio: 'pipe', env: cleanTestRuntimeBuildEnvironment(repositoryRoot),
  });
  const { prepareTestRuntimeProvider } = await import('../packages/analysis/src/test-runtime.js');
  const provider = await prepareTestRuntimeProvider(repositoryRoot);
  if (provider === undefined) return;
  structuredClone(provider);
  project.provide('musubix5StableWallClockV1', provider);
}
