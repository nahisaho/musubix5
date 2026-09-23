import { exists, files, readText, within } from './files.js';

export interface ActiveChangeContext {
  changeId: string;
  generation: number;
  requirementIds: string[];
}

export interface ChangeContextSelection {
  changeId: string;
  generation: number | null;
  requirementIds: string[];
  documentStatus: 'active' | 'completed';
}

export interface ChangeContextOptions {
  changeId?: string;
  maintenance?: boolean;
}

interface StoredChangeGeneration {
  changeId: string;
  generation?: number;
  activeGeneration?: number | null;
  requirementIds?: string[];
}

function activeGeneration(change: StoredChangeGeneration): number | null {
  if (change.activeGeneration === null) return null;
  return change.activeGeneration ?? change.generation ?? 1;
}

type ChangeDocumentStatus = 'active' | 'completed' | 'unspecified';

function changeDocumentStatus(source: string): ChangeDocumentStatus {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)?.[1];
  const status = frontmatter === undefined
    ? null
    : /^status:\s*(active|completed)\s*$/m.exec(frontmatter)?.[1];
  return (status as ChangeDocumentStatus | undefined) ?? 'unspecified';
}

async function changeDocumentStatuses(root: string): Promise<Map<string, ChangeDocumentStatus>> {
  const statuses = new Map<string, ChangeDocumentStatus>();
  for (const path of (await files(root)).filter((candidate) =>
    /^\.musubix\/changes\/CHANGE-\d+\.md$/.test(candidate))) {
    statuses.set(
      path.slice('.musubix/changes/'.length, -'.md'.length),
      changeDocumentStatus(await readText(root, path)),
    );
  }
  return statuses;
}

/** @id CODE-M5-GENERATION-CONTEXT-001
 * @implements REQ-M5-LIFECYCLE-005 REQ-M5-APPROVAL-007 REQ-M5-TDD-003 REQ-M5-PARALLEL-017
 * @design DES-M5-005 DES-M5-006 DES-M5-011 DES-M5-PARALLEL-001
 */
export async function resolveChangeContext(
  root: string,
  options: ChangeContextOptions = {},
): Promise<ChangeContextSelection | null> {
  if (options.changeId && !/^CHANGE-\d+$/.test(options.changeId)) {
    throw new Error(`WORKFLOW_CHANGE_MISMATCH: invalid CHANGE identifier ${options.changeId}.`);
  }
  const path = '.musubix/evidence/changes.json';
  if (!await exists(within(root, path))) return null;
  const evidence = JSON.parse(await readText(root, path)) as {
    schemaVersion?: unknown;
    changes?: StoredChangeGeneration[];
  };
  if (evidence.schemaVersion !== 1 || !Array.isArray(evidence.changes)) {
    throw new Error('Invalid change chronology evidence.');
  }
  const changes = evidence.changes;
  const statuses = await changeDocumentStatuses(root);
  const documentsExist = statuses.size > 0;
  const selectedIds = options.changeId
    ? [options.changeId]
    : documentsExist
      ? [...statuses.entries()]
        .filter(([changeId, status]) => {
          if (status === 'active') return true;
          if (status === 'completed') return false;
          const stored = changes.find((change) => change.changeId === changeId);
          return stored !== undefined && activeGeneration(stored) !== null;
        })
        .map(([changeId]) => changeId)
      : changes
        .filter((change) => activeGeneration(change) !== null)
        .map((change) => change.changeId);
  if (!options.changeId && selectedIds.length > 1) {
    throw new Error('CHANGE_GENERATION_MIXED: more than one CHANGE has an active generation.');
  }
  const changeId = selectedIds[0];
  if (!changeId) return null;
  const documentStatus = statuses.get(changeId);
  const stored = changes.find((change) => change.changeId === changeId);
  if (!stored) {
    if (!documentStatus && options.changeId) {
      throw new Error(`WORKFLOW_CHANGE_MISMATCH: unknown CHANGE ${changeId}.`);
    }
    throw new Error(`CHANGE_GENERATION_PHASE: CHANGE ${changeId} has no generation chronology.`);
  }
  if (documentsExist && !documentStatus) {
    if (options.changeId) throw new Error(`WORKFLOW_CHANGE_MISMATCH: unknown CHANGE ${changeId}.`);
    return null;
  }
  const selection = {
    changeId,
    generation: activeGeneration(stored),
    requirementIds: Array.isArray(stored.requirementIds) ? stored.requirementIds : [],
    documentStatus: documentStatus === undefined || documentStatus === 'unspecified'
      ? (activeGeneration(stored) === null ? 'completed' : 'active')
      : documentStatus,
  };
  if (!options.maintenance && (selection.documentStatus !== 'active' || selection.generation === null)) {
    throw new Error(`CHANGE_GENERATION_PHASE: CHANGE ${changeId} is not eligible for current state changes.`);
  }
  return selection;
}

export async function activeChangeContext(root: string): Promise<ActiveChangeContext | null> {
  const selected = await resolveChangeContext(root);
  if (!selected) return null;
  if (selected.generation === null) {
    throw new Error(`CHANGE_GENERATION_PHASE: CHANGE ${selected.changeId} has no active generation.`);
  }
  return {
    changeId: selected.changeId,
    generation: selected.generation,
    requirementIds: selected.requirementIds,
  };
}
