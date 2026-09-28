import { readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildTrace,
  defaultConfig,
  defaultPolicyBaseline,
  exists,
  files,
  readText,
  safePath,
  writeText,
  runProcess,
  type Runner,
} from '../../analysis/src/index.js';

export const skillNames = [
  'sdd-change',
  'sdd-requirements',
  'sdd-design',
  'sdd-implementation',
  'sdd-traceability',
  'sdd-quality',
  'sdd-knowledge',
  'sdd-formal-codegraph',
  'sdd-issue-report',
  'sdd-parallel-dispatch',
  'sdd-agent-assignment',
  'sdd-integration-verification',
] as const;

export interface InstallAction {
  path: string;
  action: 'create' | 'replace' | 'preserve' | 'unchanged' | 'merge' | 'remove';
}

/** @id CODE-M5-WAVE1-TRACE-INSTALL-001
 * @implements REQ-M5-WAVE1-TRACE-001 REQ-M5-WAVE1-TRACE-002 REQ-M5-WAVE1-NAMING-001
 * @design DES-M5-WAVE1-TRACE-003 DES-M5-WAVE1-NAMING-001
 */
export async function install(root: string, packageRoot: string, options: { dryRun?: boolean; force?: boolean; feature?: string } = {}): Promise<{ dryRun: boolean; actions: InstallAction[] }> {
  root = resolve(root);
  const feature = options.feature ?? 'example';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature)) throw new Error('Feature slug must be lowercase kebab-case.');
  const planned = new Map<string, string>();
  for (const name of skillNames) {
    const directory = `.github/skills/${name}`;
    const entries = await readdir(resolve(packageRoot, directory), { withFileTypes: true });
    // Bundled skills intentionally contain no executable scripts.
    for (const entry of entries) {
      if (!entry.isFile()) throw new Error(`Unexpected skill asset: ${directory}/${entry.name}`);
      planned.set(`${directory}/${entry.name}`, await readText(packageRoot, `${directory}/${entry.name}`));
    }
  }
  planned.set('.musubix/config.json', `${JSON.stringify(defaultConfig, null, 2)}\n`);
  planned.set('.musubix/policy-baseline.json', `${JSON.stringify(defaultPolicyBaseline, null, 2)}\n`);
  planned.set('.musubix/constitution.md', await readText(packageRoot, 'assets/constitution.md'));
  const featureAsset = async (name: string): Promise<string> => (await readText(packageRoot, `assets/${name}.md`))
    .replace(/feature: example/g, `feature: ${feature}`)
    .replace(/(REQ|DES)-EXAMPLE-/g, `$1-${feature.toUpperCase()}-`);
  planned.set(`.musubix/features/${feature}/requirements.md`, await featureAsset('requirements'));
  planned.set(`.musubix/features/${feature}/design.md`, await featureAsset('design'));
  planned.set('.musubix/decisions/ADR-0001.md', await readText(packageRoot, 'assets/ADR-0001.md'));
  planned.set('.musubix/evidence/quality.json', `${JSON.stringify({ schemaVersion: 1, status: 'skipped', generatedAt: null, checks: [], reason: 'No checks have run. Configure commands and run musubix5 gate.' }, null, 2)}\n`);
  const actions: InstallAction[] = [];
  const writes = new Map<string, string>();
  for (const [path, content] of planned) {
    const absolute = await safePath(root, path);
    const present = await exists(absolute);
    const equal = present && await readText(root, path) === content;
    const action = !present ? 'create' : equal ? 'unchanged' : options.force ? 'replace' : 'preserve';
    actions.push({ path, action });
    if (action === 'create' || action === 'replace') writes.set(path, content);
  }
  const ignorePath = await safePath(root, '.gitignore');
  const oldIgnore = await exists(ignorePath) ? await readText(root, '.gitignore') : '';
  if (!oldIgnore.split(/\r?\n/).some((line) => line.trim() === '/.musubix/cache/')) {
    writes.set('.gitignore', `${oldIgnore}${oldIgnore && !oldIgnore.endsWith('\n') ? '\n' : ''}\n# musubix5 generated caches\n/.musubix/cache/\n`);
    actions.push({ path: '.gitignore', action: oldIgnore ? 'merge' : 'create' });
  } else actions.push({ path: '.gitignore', action: 'unchanged' });
  for (const path of ['.musubix/trace/index.json', '.musubix/cache/trace.json']) {
    actions.push({
      path,
      action: await exists(await safePath(root, path)) ? 'unchanged' : 'create',
    });
  }
  const legacyTraces = (await files(root))
    .filter((path) => /^\.musubix\/features\/[^/]+\/trace\.json$/.test(path))
    .sort();
  for (const path of legacyTraces) actions.push({ path, action: 'remove' });
  if (!options.dryRun) {
    await mkdir(root, { recursive: true });
    for (const [path, text] of writes) await writeText(root, path, text);
    await buildTrace(root);
  }
  return { dryRun: options.dryRun ?? false, actions };
}

export async function upgradeSkills(root: string, packageRoot: string, options: { dryRun?: boolean } = {}): Promise<{ dryRun: boolean; actions: InstallAction[] }> {
  root = resolve(root);
  const planned = new Map<string, string>();
  for (const name of skillNames) {
    const directory = `.github/skills/${name}`;
    const entries = await readdir(resolve(packageRoot, directory), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) throw new Error(`Unexpected skill asset: ${directory}/${entry.name}`);
      planned.set(`${directory}/${entry.name}`, await readText(packageRoot, `${directory}/${entry.name}`));
    }
  }
  const actions: InstallAction[] = [];
  const writes = new Map<string, string>();
  for (const [path, content] of planned) {
    const absolute = await safePath(root, path);
    const present = await exists(absolute);
    const equal = present && await readText(root, path) === content;
    const action = !present ? 'create' : equal ? 'unchanged' : 'replace';
    actions.push({ path, action });
    if (action === 'create' || action === 'replace') writes.set(path, content);
  }
  if (!options.dryRun) {
    await mkdir(root, { recursive: true });
    for (const [path, text] of writes) await writeText(root, path, text);
  }
  return { dryRun: options.dryRun ?? false, actions };
}

export async function pluginInstall(packageRoot: string, runner: Runner = runProcess): Promise<Awaited<ReturnType<Runner>>> {
  return runner('copilot', ['plugin', 'install', resolve(packageRoot)], { cwd: resolve(packageRoot), timeoutMs: 120_000 });
}
