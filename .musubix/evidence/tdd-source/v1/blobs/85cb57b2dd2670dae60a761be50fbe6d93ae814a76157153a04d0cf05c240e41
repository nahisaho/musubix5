import { sha256 } from './canonical.js';
import {
  listCandidateEntries, readCandidateBlob, resolveCandidateSnapshot,
} from './workspace-manager.js';

export interface ReleaseExclusion {
  path: string;
  reason: string;
  sha256: string;
}

const gateSelfReferences = new Set([
  '.musubix/evidence/formal.json',
  '.musubix/evidence/model-correspondence.json',
  '.musubix/evidence/mutation.json',
  '.musubix/evidence/performance.json',
  '.musubix/evidence/quality.json',
]);

export function evidenceChangeIdFromBytes(path: string, bytes: Uint8Array): string | null {
  if (!path.startsWith('.musubix/evidence/') || !path.endsWith('.json')) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.changeId === 'string' && record.changeId.length > 0) return record.changeId;
  const metadata = record.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const nested = (metadata as Record<string, unknown>).changeId;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return null;
}

export function releaseExclusionReason(input: {
  path: string;
  symbolicLink?: boolean;
  changeId: string | undefined;
  evidenceChangeId: string | null;
  runLocalPaths: string[];
  selfReferencePaths: string[];
}): string | null {
  const { path } = input;
  if (input.symbolicLink) return 'symlink';
  if (path === '.musubix/trace/index.json'
    || /^\.musubix\/features\/[^/]+\/trace\.json$/.test(path)) return 'generated-trace';
  if (path.endsWith('.tgz')) return 'package-archive';
  if (/(?:^|\/)(?:log|logs|session-log|session-logs)\//.test(path)) return 'log-directory';
  if (path.startsWith('docs/history/')) return 'historical';
  if (input.runLocalPaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return 'run-local';
  if (input.selfReferencePaths.includes(path)) return 'release-self-reference';
  if (gateSelfReferences.has(path) || path.startsWith('.musubix/evidence/native/test/')) {
    return 'gate-self-reference';
  }
  if (input.changeId !== undefined
    && input.evidenceChangeId !== null
    && input.evidenceChangeId !== input.changeId) {
    return 'foreign-change-evidence';
  }
  return null;
}

export function releaseExclusionIdentity(
  exclusions: ReleaseExclusion[],
): Array<{ path: string; reason: string }> {
  return exclusions.map(({ path, reason }) => ({ path, reason }));
}

const normativeReleasePath = /^(?:\.musubix\/constitution\.md|\.musubix\/features\/[^/]+\/(?:requirements|design)\.md|\.musubix\/decisions\/ADR-[^/]+\.md)$/;

export interface ReleaseCandidateContent {
  changeId: string;
  commit: string;
  artifacts: Record<string, string>;
  exclusions: ReleaseExclusion[];
}

/** @id CODE-M5-RELEASE-CANDIDATE-TREE-001
 * @implements REQ-M5-APPROVAL-007 REQ-M5-COMPAT-013
 * @design DES-M5-006 DES-M5-012
 */
export async function buildReleaseCandidateContent(
  root: string,
  requestedChangeId?: string,
): Promise<ReleaseCandidateContent> {
  const snapshot = await resolveCandidateSnapshot(root, requestedChangeId);
  const artifacts: Record<string, string> = {};
  const exclusions: ReleaseExclusion[] = [];
  for (const entry of await listCandidateEntries(root, snapshot.commit)) {
    if (entry.gitMode === '160000' || entry.objectType === 'commit') {
      throw new Error(`APPROVAL_GITLINK_UNSUPPORTED: ${entry.nfcPath}`);
    }
    if (entry.objectType !== 'blob') continue;
    const symbolicLink = entry.gitMode === '120000';
    if (symbolicLink && normativeReleasePath.test(entry.nfcPath)) {
      throw new Error(`APPROVAL_NORMATIVE_SYMLINK: ${entry.nfcPath}`);
    }
    const bytes = await readCandidateBlob(root, snapshot.commit, entry.objectId);
    const hash = sha256(bytes);
    const reason = releaseExclusionReason({
      path: entry.nfcPath,
      symbolicLink,
      changeId: snapshot.changeId,
      evidenceChangeId: evidenceChangeIdFromBytes(entry.nfcPath, bytes),
      runLocalPaths: ['.musubix/runs'],
      selfReferencePaths: [
        '.musubix/evidence/approvals/release.json',
        '.musubix/evidence/approvals/native/release.json',
      ],
    });
    if (reason === null) artifacts[entry.nfcPath] = hash;
    else exclusions.push({ path: entry.nfcPath, reason, sha256: hash });
  }
  return {
    changeId: snapshot.changeId,
    commit: snapshot.commit,
    artifacts,
    exclusions,
  };
}
