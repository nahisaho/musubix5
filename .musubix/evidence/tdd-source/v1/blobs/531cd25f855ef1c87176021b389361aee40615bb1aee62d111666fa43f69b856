import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveBuildInvocationForEnvironment } from '../packages/analysis/src/process.js';

export default function globalSetup(): void {
  const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
  const build = resolveBuildInvocationForEnvironment();
  execFileSync(build.command, build.args, { cwd: repositoryRoot, stdio: 'pipe' });
}
