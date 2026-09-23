import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** @id CODE-M5-COMPAT-006
 * @implements REQ-M5-COMPAT-005 REQ-M5-COMPAT-006
 * @design DES-M5-002
 */
function executablePath(pkg) {
  assert.deepEqual(Object.keys(pkg.bin ?? {}), ['musubix5']);
  return pkg.bin.musubix5;
}

const npmCli = process.env.npm_execpath;
assert(npmCli, 'Run this check through npm so npm_execpath is available.');
const pack = JSON.parse(execFileSync(process.execPath, [
  npmCli, 'pack', '--dry-run', '--json', '--ignore-scripts',
], { encoding: 'utf8' }))[0];
const files = new Set(pack.files.map((file) => file.path));
const manifest = JSON.parse(readFileSync('plugin.json', 'utf8'));
const marketplace = JSON.parse(readFileSync('.github/plugin/marketplace.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(pkg.name, 'musubix5');
assert.equal(manifest.skills, '.github/skills/');
assert.equal(manifest.version, pkg.version);
assert.equal(marketplace.plugins[0].source, '.');
assert.equal(marketplace.plugins[0].name, manifest.name);
assert.equal(marketplace.plugins[0].version, pkg.version);
const skills = [
  'change',
  'requirements',
  'design',
  'implementation',
  'traceability',
  'quality',
  'knowledge',
  'formal-codegraph',
  'issue-report',
  'parallel-dispatch',
  'agent-assignment',
  'integration-verification',
];
for (const required of [
  'plugin.json', '.github/plugin/marketplace.json', executablePath(pkg),
  'dist/packages/domain/src/index.js', 'dist/packages/analysis/src/index.js',
  'dist/packages/analysis/src/attestation.js',
  'assets/constitution.md', 'assets/requirements.md', 'assets/design.md', 'assets/ADR-0001.md',
  'README.md', 'README-ja.md', 'CHANGELOG.md', 'LICENSE',
  ...skills.map((name) => `.github/skills/sdd-${name}/SKILL.md`),
]) assert(files.has(required), `Package is missing ${required}`);
for (const skill of skills) {
  const source = readFileSync(`.github/skills/sdd-${skill}/SKILL.md`, 'utf8');
  assert(!source.includes('npx musubix3'), `Skill sdd-${skill} invokes the legacy musubix3 executable.`);
  assert(
    !source.includes("repository's exact `musubix3` CLI"),
    `Skill sdd-${skill} identifies the legacy musubix3 executable as authoritative.`,
  );
}
assert(![...files].some((path) => path.startsWith('tests/') || path.startsWith('.test-work/')));
console.log(`Package verified: ${pack.filename}, ${files.size} files, ${skills.length} skills.`);
