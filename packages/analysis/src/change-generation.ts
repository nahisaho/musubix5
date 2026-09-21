import { exists, readText, within } from './files.js';

export interface ActiveChangeContext {
  changeId: string;
  generation: number;
}

interface StoredChangeGeneration {
  changeId: string;
  generation?: number;
  activeGeneration?: number | null;
}

function activeGeneration(change: StoredChangeGeneration): number | null {
  if (change.activeGeneration === null) return null;
  return change.activeGeneration ?? change.generation ?? 1;
}

/** @id CODE-M5-GENERATION-CONTEXT-001
 * @implements REQ-M5-LIFECYCLE-005 REQ-M5-APPROVAL-007 REQ-M5-TDD-003
 * @design DES-M5-005 DES-M5-006 DES-M5-011
 */
export async function activeChangeContext(root: string): Promise<ActiveChangeContext | null> {
  const path = '.musubix/evidence/changes.json';
  if (!await exists(within(root, path))) return null;
  const evidence = JSON.parse(await readText(root, path)) as {
    schemaVersion?: unknown;
    changes?: StoredChangeGeneration[];
  };
  if (evidence.schemaVersion !== 1 || !Array.isArray(evidence.changes)) {
    throw new Error('Invalid change chronology evidence.');
  }
  const active = evidence.changes.flatMap((change) => {
    const generation = activeGeneration(change);
    return generation === null ? [] : [{ changeId: change.changeId, generation }];
  });
  if (active.length > 1) {
    throw new Error('CHANGE_GENERATION_MIXED: more than one CHANGE has an active generation.');
  }
  return active[0] ?? null;
}
