import { execFileSync } from 'node:child_process';

export function checkLfsTool() {
  let text;
  try {
    text = execFileSync('git', ['lfs', 'version'], {
      encoding: 'utf8', shell: false, timeout: 10_000, maxBuffer: 4096,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch { throw new Error('TDD_SOURCE_LFS_UNAVAILABLE: tool-missing'); }
  const version = /^git-lfs\/(\d+)\.(\d+)\.(\d+)(?:\s|$)/.exec(text);
  if (!version || +version[1] < 3 || +version[1] === 3 &&
    (+version[2] < 4 || +version[2] === 4 && +version[3] < 1)) {
    throw new Error('TDD_SOURCE_LFS_UNAVAILABLE: version-unsupported');
  }
}

if (process.argv[1]?.endsWith('check-lfs-tool.mjs')) checkLfsTool();
