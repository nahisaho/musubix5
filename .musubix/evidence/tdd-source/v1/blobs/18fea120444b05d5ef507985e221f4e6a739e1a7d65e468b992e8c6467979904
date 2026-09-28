import { lstat, readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { validateDesign } from '../../domain/src/index.js';
import { sha256 } from './canonical.js';
import { readText } from './files.js';

export type NormativeApprovalStage = 'requirements' | 'design';

export interface NormativeArtifact {
  sourcePath: string;
  key: string;
}

function portable(path: string): string {
  return path.split(sep).join('/');
}

async function assertRegularNormativePath(root: string, path: string): Promise<void> {
  const absoluteRoot = resolve(root);
  const absolute = resolve(root, path);
  let cursor = absoluteRoot;
  for (const segment of relative(absoluteRoot, absolute).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment);
    let entry;
    try {
      entry = await lstat(cursor);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`APPROVAL_NORMATIVE_MISSING: ${path}`);
      }
      throw cause;
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`APPROVAL_NORMATIVE_SYMLINK: ${path}`);
    }
  }
  const entry = await lstat(absolute);
  if (!entry.isFile()) throw new Error(`APPROVAL_NORMATIVE_SYMLINK: ${path}`);
}

async function selectedRegularNormativePath(root: string, path: string): Promise<boolean> {
  try {
    await assertRegularNormativePath(root, path);
    return true;
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('APPROVAL_NORMATIVE_MISSING:')) {
      return false;
    }
    throw cause;
  }
}

async function featureSlugs(root: string): Promise<string[]> {
  const directory = resolve(root, '.musubix/features');
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('APPROVAL_NORMATIVE_MISSING: .musubix/features');
    }
    throw cause;
  }
  const normalized = new Map<string, string>();
  for (const entry of entries) {
    if (entry.name.includes('\uFFFD')) {
      throw new Error('APPROVAL_PATH_ENCODING: feature path is not valid UTF-8.');
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`APPROVAL_NORMATIVE_SYMLINK: .musubix/features/${entry.name}`);
    }
    if (!entry.isDirectory()) continue;
    const key = entry.name.normalize('NFC');
    if (normalized.has(key)) throw new Error(`APPROVAL_PATH_COLLISION: .musubix/features/${key}`);
    normalized.set(key, entry.name);
  }
  return [...normalized.values()].sort((left, right) =>
    Buffer.compare(Buffer.from(left.normalize('NFC')), Buffer.from(right.normalize('NFC'))));
}

function addArtifact(
  artifacts: NormativeArtifact[],
  sourcePath: string,
  keys: Set<string>,
  normalizedPath = sourcePath,
): void {
  if (sourcePath.includes('\uFFFD')) {
    throw new Error(`APPROVAL_PATH_ENCODING: ${sourcePath}`);
  }
  const key = portable(normalizedPath).normalize('NFC');
  if (keys.has(key)) throw new Error(`APPROVAL_PATH_COLLISION: ${key}`);
  keys.add(key);
  artifacts.push({ sourcePath, key });
}

/** @id CODE-M5-APPROVAL-NORMATIVE-PATHS-001
 * @implements REQ-M5-APPROVAL-007 REQ-M5-COMPAT-013
 * @design DES-M5-006
 */
export async function resolveNormativeArtifacts(
  root: string,
  stage: NormativeApprovalStage,
  selectedFeatures?: string[],
): Promise<NormativeArtifact[]> {
  const artifacts: NormativeArtifact[] = [];
  const keys = new Set<string>();
  await assertRegularNormativePath(root, '.musubix/constitution.md');
  addArtifact(artifacts, '.musubix/constitution.md', keys);
  const slugs = selectedFeatures ?? await featureSlugs(root);
  if (slugs.length === 0) throw new Error('APPROVAL_NORMATIVE_MISSING: no selected features.');
  const adrIds = new Set<string>();
  let selectedCount = 0;
  for (const rawSlug of slugs) {
    const slug = rawSlug.normalize('NFC');
    const requirementsPath = `.musubix/features/${rawSlug}/requirements.md`;
    const designPath = `.musubix/features/${rawSlug}/design.md`;
    if (stage === 'requirements') {
      if (!await selectedRegularNormativePath(root, requirementsPath)) continue;
      addArtifact(artifacts, requirementsPath, keys, `.musubix/features/${slug}/requirements.md`);
      selectedCount += 1;
      continue;
    }
    if (!await selectedRegularNormativePath(root, designPath)) continue;
    await assertRegularNormativePath(root, requirementsPath);
    addArtifact(artifacts, requirementsPath, keys, `.musubix/features/${slug}/requirements.md`);
    addArtifact(artifacts, designPath, keys, `.musubix/features/${slug}/design.md`);
    selectedCount += 1;
    for (const component of validateDesign(await readText(root, designPath), designPath).value) {
      for (const adrId of component.decisions) adrIds.add(adrId);
    }
  }
  if (selectedCount === 0) {
    throw new Error(`APPROVAL_NORMATIVE_MISSING: no selected ${stage} files.`);
  }
  for (const adrId of [...adrIds].sort()) {
    const path = `.musubix/decisions/${adrId}.md`;
    await assertRegularNormativePath(root, path);
    addArtifact(artifacts, path, keys);
  }
  return artifacts.sort((left, right) =>
    Buffer.compare(Buffer.from(left.key, 'utf8'), Buffer.from(right.key, 'utf8')));
}

export async function snapshotNormativeArtifacts(
  root: string,
  artifacts: NormativeArtifact[],
): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  for (const artifact of artifacts) {
    snapshot[artifact.key] = sha256(await readFile(resolve(root, artifact.sourcePath)));
  }
  return snapshot;
}
