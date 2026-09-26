---
schemaVersion: 1
feature: candidate-cleanup-policy
status: draft
---
# Candidate cleanup policy design

## Scope and invariants

- Candidate CLI cleanup and integration-attempt cleanup use one pure,
  state-conditional policy decision over the same normalized inspection input.
- Cleanup never deletes a candidate branch, commit, journal record, candidate
  projection, or registry history. It removes only the selected managed
  worktree and appends or reuses one tombstone.
- Dirty tracked content, untracked content, a live lease, or unresolved
  conflicts always take precedence and produce `CANDIDATE_CLEANUP_UNSAFE`.
- `integrating | verified` ownership conflicts take precedence over commit
  reachability once the universal hazards are absent.
- The normal journal remains authoritative. Registry entries, including
  deleted entries, are compatibility projections that can be rebuilt without
  weakening live-candidate uniqueness.

## DES-M5-CANDIDATE-CLEANUP-001: Shared state-conditional cleanup predicate
Responsibilities: Normalize Git and lease inspection into one cleanup-policy input; return an explicit allow or reject decision for every candidate lifecycle state; preserve one diagnostic precedence for candidate and integration callers.
Interfaces: Additive exports are `CandidateCleanupPolicyInput = CandidateCleanupState & { state: CandidateLifecycleState }`, `CandidateCleanupDecision`, and `evaluateCandidateCleanupPolicy(input: CandidateCleanupPolicyInput): CandidateCleanupDecision`; existing exported `CandidateCleanupState`, `CleanupInspectionAdapter`, `assertCandidateCleanupSafe(state: CandidateCleanupState): void`, and `inspectCandidateCleanupSafety(input): Promise<void>` remain compatibility surfaces and delegate to the new predicate after supplying a concrete lifecycle state.
Constraints: The predicate is pure and is the only authority for cleanup eligibility; both cleanup paths and both existing compatibility helpers must call it after producing equivalent normalized inputs; the legacy `assertCandidateCleanupSafe` form with omitted `CandidateCleanupState.state` deterministically normalizes to `active`, preserving its conservative behavior in which unintegrated commits and every universal hazard are rejected; callers that need terminal-state permission must supply the actual state; dirty, untracked, live-lease, and unresolved-conflict flags reject every inspectable non-deleted state as `CANDIDATE_CLEANUP_UNSAFE`; `deleted` has no managed workspace to inspect and is resolved as `CANDIDATE_WORKSPACE_NOT_FOUND` before synthetic hazard fields can be supplied, except for the exact tombstone replay described by DES-M5-CANDIDATE-CLEANUP-004; this makes the requirements' universal-hazard rule apply to every state in which cleanup safety can actually be inspected while preserving the explicit deleted-state zero-write rule; `integrating | verified` reject as `CANDIDATE_INTEGRATION_CONFLICT` after universal hazard checks; an unintegrated commit rejects `prepared | active | ready | integrated` as `CANDIDATE_CLEANUP_UNSAFE`, is permitted for `failed | abandoned | stale`, and never changes branch or commit retention; clean reachable `prepared | active | ready | failed | abandoned | stale | integrated` inputs permit worktree-only cleanup; unknown explicit states fail closed and are not coerced to a known state; diagnostic code and detail are returned by the predicate rather than reclassified by callers.
Requirements: REQ-M5-MULTI-CHANGE-007 REQ-M5-WAVE1-CLEANUP-001
ADRs: ADR-0030
Depends-On: DES-M5-MULTI-CHANGE-004 DES-M5-MULTI-CHANGE-008

## DES-M5-CANDIDATE-CLEANUP-002: Terminal worktree-only cleanup executor
Responsibilities: Inspect the selected managed worktree, invoke the shared policy, remove only an allowed worktree, and coordinate the tombstone and registry projection under the existing fenced write transaction.
Interfaces: Existing public exports remain `cleanupCandidate(root, selector, options)` and `cleanupCandidateIntegration({ controlRoot, integrationId, deletedBy, ... })`; internal inspection adapters normalize each existing option/input shape to `CandidateCleanupPolicyInput` before invoking `evaluateCandidateCleanupPolicy`.
Constraints: Cleanup requires nonblank actor and explicit confirmation; selection validates repository identity and canonical managed path before inspection; Git status includes tracked, staged, deleted, and untracked paths, unresolved entries come from the index, lease state comes from the existing CHANGE/repository lease mechanisms, and commit reachability is evaluated against the current default commit; no worktree removal begins before an allow decision; terminal unintegrated cleanup for `failed | abandoned | stale` invokes `git worktree remove` without `--force`, does not delete or move the candidate branch, and does not rewrite the candidate commit; integrated cleanup has the same worktree-only effect; after an allow decision and while the fenced write transaction remains current, the executor writes a Git-common-directory `candidate-cleanup-v1` recovery marker bound to the operation key and complete candidate/tombstone inputs, removes the worktree, appends the tombstone, projects the deleted registry entry, and removes the marker; the marker is untracked operational metadata excluded from materialization and repository fingerprints; the executor does not remove another candidate or the control worktree and does not change control-worktree content outside the append-only journal and registry projection; retry with a valid marker either re-inspects and removes a still-present worktree or completes the missing tombstone/projection for an already-absent worktree, while an authoritative tombstone suppresses a second removal or append.
Requirements: REQ-M5-MULTI-CHANGE-007 REQ-M5-WAVE1-CLEANUP-001 REQ-M5-WAVE1-CLEANUP-002
ADRs: ADR-0025 ADR-0026 ADR-0027 ADR-0030
Depends-On: DES-M5-CANDIDATE-CLEANUP-001 DES-M5-MULTI-CHANGE-002 DES-M5-MULTI-CHANGE-003

## DES-M5-CANDIDATE-CLEANUP-003: Retained cleanup history and registry projection
Responsibilities: Append the authoritative cleanup tombstone, retain reconstructable candidate identity and Git references, and project a deleted registry entry without blocking unrelated candidates.
Interfaces: Internal `appendCandidateCleanupTombstone(input, appendSession)`, `projectDeletedCandidate(tombstone, registry)`, and `rebuildCandidateRegistry(records)` support the existing public candidate `list`/`show` projections; no replacement public cleanup export is introduced.
Constraints: The existing `candidate-workspace-deleted` journal kind gains an additive `recordVersion: 2` payload recording candidate ID, CHANGE ID, generation, repository identity, creation epoch, identity-base commit, current-base commit, candidate commit, branch, prior state, managed relative worktree path, cleanup actor, deterministic cleanup reason, journal order, and timestamp; readers continue to accept existing records and project missing legacy fields conservatively without fabricating retained references; the reason distinguishes terminal unintegrated retention, reachable candidate retirement, and prepared-artifact retirement without requiring free-form CLI text; the tombstone never claims branch or commit deletion; registry rebuild retains the entry with `state: deleted`, the candidate identity, generation, creation epoch, branch, commit bindings, relative former worktree path, and deleted order; deleted entries are excluded from live-owner uniqueness and implicit workspace resolution but remain included in list/show audit projections; show by exact candidate ID returns the retained tombstone, while resume, refresh, ready, and same-generation create return `CANDIDATE_WORKSPACE_NOT_FOUND` with zero writes; a deleted entry for one CHANGE does not prevent create, list, or show for another CHANGE; later generations derive creation epoch from live and deleted journal history, never from a filtered live registry.
Requirements: REQ-M5-MULTI-CHANGE-007 REQ-M5-WAVE1-CLEANUP-002
ADRs: ADR-0025 ADR-0027 ADR-0030
Depends-On: DES-M5-MULTI-CHANGE-002 DES-M5-MULTI-CHANGE-003 DES-M5-CANDIDATE-CLEANUP-002

## DES-M5-CANDIDATE-CLEANUP-004: Cleanup replay and public compatibility adapter
Responsibilities: Preserve public CLI exit and JSON behavior, distinguish an exact cleanup replay from an ordinary operation on a deleted candidate, and ensure candidate and integration cleanup expose the same policy decision for the same input.
Interfaces: Existing public exports remain `cleanupCandidate(root, selector, options)` and `cleanupCandidateIntegration({ controlRoot, integrationId, deletedBy, ... })`; internal `candidateCleanupOperationKey(kind: 'candidate' | 'integration', ownerId, deletedBy)` and `resolveCleanupReplay(kind, selector, deletedBy, records)` provide replay identity; public CLI remains `candidate-workspace cleanup <selector> --deleted-by <actor> --confirm [--json]` and `candidate-workspace integration-cleanup <integration-id> --deleted-by <actor> --confirm [--json]`.
Constraints: The operation key is canonical and stable from cleanup kind, logical candidate or integration ID, and normalized actor; the mandatory kind field gives candidate and integration cleanup disjoint idempotency namespaces even if malformed or future owner identifiers share bytes; before selecting a live workspace, cleanup checks the authoritative journal and recovery marker for that exact key; an exact replay of a completed operation returns the previously persisted result without calling Git, replacing the registry, changing journal or registry bytes, or adding another tombstone; replay of an incomplete valid marker deterministically completes only its missing steps and then returns the same persisted result; marker schema, cleanup kind, operation key, candidate binding, actor, path, or fencing mismatch fails closed as `CANDIDATE_INTEGRATION_CONFLICT` and retains the marker for operator recovery; the replay result preserves the original identity, state, actor, reason, retained references, and tombstone order; a deleted selector with no exact operation-key match returns exit 1 `CANDIDATE_WORKSPACE_NOT_FOUND` with zero writes; malformed options remain exit 2 `CLI_ERROR`; all policy rejections remain exit 1; list and exact-ID show remain read-only and tolerate deleted entries alongside live candidates from other CHANGE generations; public matrix tests cover all ten candidate states, universal hazards, diagnostic precedence, retained branch/commit reachability, other-worktree invariance, registry compatibility, zero-write deleted operations, candidate/integration operation-key namespace separation, crash points before and after worktree removal, and byte-stable completed replay; a contract test invokes candidate and integration adapters with identical normalized policy input and requires identical decisions, and separately verifies that omitted-state `assertCandidateCleanupSafe` input is normalized to `active` and conservatively rejects an unintegrated commit.
Requirements: REQ-M5-MULTI-CHANGE-007 REQ-M5-WAVE1-CLEANUP-001 REQ-M5-WAVE1-CLEANUP-002
ADRs: ADR-0030
Depends-On: DES-M5-CANDIDATE-CLEANUP-001 DES-M5-CANDIDATE-CLEANUP-003 DES-M5-MULTI-CHANGE-001

## State and diagnostic matrix

Universal hazard checks run before the state rows below.

| State | Clean and candidate commit reachable | Clean and candidate commit unintegrated |
|---|---|---|
| `prepared` | allow worktree-only cleanup | `CANDIDATE_CLEANUP_UNSAFE` |
| `active` | allow worktree-only cleanup | `CANDIDATE_CLEANUP_UNSAFE` |
| `ready` | allow worktree-only cleanup | `CANDIDATE_CLEANUP_UNSAFE` |
| `integrating` | `CANDIDATE_INTEGRATION_CONFLICT` | `CANDIDATE_INTEGRATION_CONFLICT` |
| `verified` | `CANDIDATE_INTEGRATION_CONFLICT` | `CANDIDATE_INTEGRATION_CONFLICT` |
| `integrated` | allow worktree-only cleanup | `CANDIDATE_CLEANUP_UNSAFE` |
| `failed` | allow worktree-only cleanup | allow worktree-only cleanup and retain branch/commit |
| `abandoned` | allow worktree-only cleanup | allow worktree-only cleanup and retain branch/commit |
| `stale` | allow worktree-only cleanup | allow worktree-only cleanup and retain branch/commit |
| `deleted` | `CANDIDATE_WORKSPACE_NOT_FOUND` | `CANDIDATE_WORKSPACE_NOT_FOUND` |

For every non-deleted row, dirty or untracked content, a live lease, or an
unresolved conflict produces `CANDIDATE_CLEANUP_UNSAFE` before the row-specific
decision. The sole deleted-state exception is an exact operation-key replay,
which returns the retained tombstone result without writes.

## Verification mapping

| Test ID | Required coverage |
|---|---|
| `TEST-M5-WAVE1-CANDIDATE-CLEANUP-POLICY-001` | Public candidate CLI matrix for all ten states; universal hazard precedence; `integrating | verified` conflict diagnostics; shared predicate equality between candidate and integration adapters. |
| `TEST-M5-WAVE1-CANDIDATE-CLEANUP-RETENTION-001` | Terminal unintegrated worktree-only cleanup; retained branch and commit reachability; tombstone reconstruction; other candidate/control content invariance; registry compatibility with deleted entries; blocked post-cleanup operations; show behavior; byte-stable exact replay. |
