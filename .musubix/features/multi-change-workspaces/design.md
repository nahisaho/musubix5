---
schemaVersion: 1
feature: multi-change-workspaces
status: approval-pending
---
# Multi-CHANGE candidate workspace design

## Architecture constraints

- Control worktree の `.musubix/` を共有 operational state の唯一の保存先とし、
  candidate worktree と integration worktree は source tree と実行 cwd を提供する。
- Candidate-owned projection は `.musubix/candidates/<candidate-id>/`、registry は
  `.musubix/candidates/registry.json`、authoritative chronology は既存の
  `.musubix/journal/normal/` に保存する。
- Candidate identity は repository identity、CHANGE ID、generation、base commit、
  creation epoch の canonical JSON SHA-256、integration identity、manifest、
  fingerprint は各節で定義する canonical JSON SHA-256 とし、表示用 path や
  wall-clock time を identity に含めない。
- Candidate context は CHANGE ID、positive generation、repository identity、
  immutable base commit、candidate commit の完全一致でのみ evidence credit を得る。
- 単一 CHANGE writer は CHANGE lease の後に repository append lease を取得する。
  multi-CHANGE writer は CHANGE ID 昇順で全 CHANGE lease を取得した後、append lease
  を最後に取得する。逆順取得は禁止する。
- `.musubix/evidence/**`、`.musubix/journal/**`、`.musubix/candidates/**` は
  candidate ownership diff から除外し、integration finalization だけが control
  state から integration worktree へ materialize する。
- `.musubix` と Git common directory の lease file、一時 lock metadata、
  control-worktree locator、finalization marker は fingerprint、
  materialization、commit の対象外とする。
- Selector の欠落、曖昧性、repository/generation/commit mismatch、lease loss、
  ownership conflict、stale dependency、verification failure はすべて fail-closed
  とし、成功形の fallback や自動 conflict resolution を行わない。
- 既存の sole-active CHANGE と one-CHANGE parallel plan は candidate 機能を
  使用しない限り従来の resolution、証跡、exit code、JSON 契約を維持する。

## Candidate lifecycle

`prepared -> active -> ready -> integrating -> verified -> integrated`

Failure and maintenance transitions are:

- Candidate creation journals `prepared` after reserving identity and refs, then
  journals `active` only after the branch, worktree, and registry projection are
  present and revalidated.
- `prepared | active | ready | integrating | verified -> failed`
- `prepared | active | ready | failed -> abandoned`
- `active | ready | failed | integrating | verified -> stale`
- `ready -> active` when approval, TDD, quality, snapshot, gate, configuration,
  or candidate-commit binding drifts without a base change
- `prepared | active | ready | failed | abandoned | stale | integrated -> deleted`
- `stale -> active` only through a successful refresh that creates a new
  candidate commit and invalidates old candidate-bound evidence
- `failed -> active` only after the failed prerequisite is repaired and complete
  readiness re-evaluation succeeds
- `integrating | verified -> ready` when an integration attempt terminates
  without changing candidate bindings
- `integrating | verified -> integrating` only as idempotent resume of the same
  derived integration ID and identical candidate set

Only journaled transitions are authoritative. Registry and candidate projection
files are rebuildable views.

## DES-M5-MULTI-CHANGE-001: Candidate context resolver
Responsibilities: Resolve an explicit candidate or integration context from CLI selectors, registered worktree current directory, and the control root; reject ambiguous implicit selection; expose one normalized execution context to every generation-bound service.
Interfaces: `resolveExecutionContext(root, { changeId?, multiChangeVerification?, cwd?, maintenance? }): CandidateContext | IntegrationContext | RepositoryContext`, `candidateContextForWorkspace(cwd)`, `assertSelectorConsistency(context, root, selectors)`.
Constraints: `--change-id` and `--multi-change-verification` are mutually exclusive; a registered candidate or integration worktree is an explicit selector; `--root` must identify the same registered context when cwd is managed; control-root execution without an explicit selector preserves sole-active implicit resolution and `CHANGE_GENERATION_MIXED`; malformed selectors are CLI errors and unknown, deleted, foreign, generation-mismatched, or selector-mismatched contexts persist nothing; abandoned generations reject every pass-producing operation with `CHANGE_GENERATION_PHASE` and permit only show, inspection-only resume, and confirmed cleanup.
Requirements: REQ-M5-COMPAT-013 REQ-M5-LIFECYCLE-005 REQ-M5-MULTI-CHANGE-002 REQ-M5-MULTI-CHANGE-008
ADRs: ADR-0010 ADR-0013 ADR-0025
Depends-On: DES-M5-003 DES-M5-005 DES-M5-MULTI-CHANGE-002

## DES-M5-MULTI-CHANGE-002: Candidate registry and state router
Responsibilities: Persist and rebuild candidate and integration registrations, map source roots to the shared control root, route candidate-owned projections, and prevent cross-candidate path aliases or ownership reads and writes.
Interfaces: `registerCandidate(input)`, `registerIntegration(input)`, `loadCandidate(selector)`, `listCandidates()`, `candidateStateRoot(candidateId)`, `controlStateRoot(sourceRoot)`, `materializeOperationalState(integrationRoot, OperationalStateBaseline)`, `removeIntegrationRegistration(integrationId)`.
Constraints: `candidate-workspace-registry-v1` owns the repository identity and ordered candidate/integration indexes; `candidate-workspace-record-v1` owns candidate identity, CHANGE ID, generation, journal-order-derived creation epoch, base/tip commits, branch, relative worktree path, lifecycle state, dependency IDs, manifest digest, and audit metadata; `candidate-integration-v1` owns integration ID, starting default commit, ordered input tuples, apply order, deterministic release-owner CHANGE ID, source manifest, lifecycle state, report hashes, integration commit, and recovery metadata; `candidate-workspace-tombstone-v1` owns deleted candidate identity, last state, actor, reason, retained branch/commit references, and journal order; registry entries bind repository identity, CHANGE ID, generation, candidate ID, base commit, branch, Git-common-directory-relative worktree path, state, and latest candidate commit; no absolute machine-local path is persisted; candidate paths are normalized descendants of the Git common-directory managed root and every ancestor is checked against symlink aliasing; the shared registry is rebuilt from journal records and replaced only while the repository append lease is held; candidate projections are sharded by candidate ID and never share a mutable file with another candidate; normal journal records retain all owners verbatim while consumers grant credit only to the selected context; registry and projections never replace the journal as authority; `OperationalStateBaseline` is the sorted path/hash set for `.musubix/evidence/**`, `.musubix/journal/**`, and `.musubix/candidates/**` after excluding lease files, temporary lock metadata, the control-worktree locator, finalization marker, and temporary files.
Requirements: REQ-M5-WORKTREE-005 REQ-M5-WORKTREE-006 REQ-M5-WORKTREE-007 REQ-M5-MULTI-CHANGE-001 REQ-M5-MULTI-CHANGE-004 REQ-M5-MULTI-CHANGE-007
ADRs: ADR-0003 ADR-0006 ADR-0010 ADR-0025
Depends-On: DES-M5-003 DES-M5-004 DES-M5-012

## DES-M5-MULTI-CHANGE-003: Multi-owner journal coordinator
Responsibilities: Append candidate lifecycle, integration lifecycle, refresh, readiness, cleanup, and operational-state materialization records to the existing normal journal while enforcing lease order, fencing, idempotency, and exactly-once projection updates.
Interfaces: `withCandidateWrite(candidateId, operation: (session: AppendLeaseSession) => Promise<T>)`, `withMultiChangeWrite(changeIds, operation: (session: AppendLeaseSession) => Promise<T>)`, `withRepositoryAppendLease(operation: (session: AppendLeaseSession) => Promise<T>)`, `appendCandidateTransition(input, session?)`, `appendIntegrationTransition(input, session?)`, `rebuildCandidateProjections(records, session)`.
Constraints: Single-candidate writes acquire its CHANGE lease before the repository append lease; multi-candidate writes acquire distinct CHANGE leases in byte-sorted CHANGE ID order and the append lease last; `withRepositoryAppendLease` is the session-capable form of DES-M5-004 `withOrderLease` over the same non-reentrant repository lock, not a second lock; `AppendLeaseSession` is a non-exportable capability owned by the journal service, and append/projection operations receiving it assert the current fencing token without reacquiring the lease; this is an additive extension of DES-M5-004's internal append contract and callers without a session retain internal acquire/release behavior; `repository-append-lease-v1` owns token, fencing token, lease deadline, renewal metadata, and repository identity; lease timeout maps to `CANDIDATE_LEASE_BUSY` or `CANDIDATE_JOURNAL_BUSY`; append assigns one gap-free repository order and valid predecessor hash; idempotency keys include owner IDs and immutable binding inputs; candidate-aware shared registry/evidence and candidate-sharded projection replacement occur while the owning CHANGE lease and the same append-lease session are held after append and fencing revalidation; a legacy writer that replaces a projection after releasing the append lease is detected by finalization's second fingerprint and causes `CANDIDATE_OPERATIONAL_STATE_DRIFT`, after which the same integration ID may be resumed only after the competing writer completes, with no automatic retry or evidence credit.
Requirements: REQ-M5-LIFECYCLE-005 REQ-M5-MULTI-CHANGE-004 REQ-M5-MULTI-CHANGE-006 REQ-M5-MULTI-CHANGE-007
ADRs: ADR-0003 ADR-0010 ADR-0025
Depends-On: DES-M5-004 DES-M5-MULTI-CHANGE-002

## DES-M5-MULTI-CHANGE-004: Candidate workspace lifecycle manager
Responsibilities: Create, show, list, resume, refresh, and safely remove candidate branches and managed worktrees; capture immutable base and dirty-state invariants; validate commit reachability and worktree cleanliness.
Interfaces: `createCandidateWorkspace(changeId)`, `showCandidateWorkspace(selector)`, `listCandidateWorkspaces()`, `resumeCandidateWorkspace(selector)`, `refreshCandidateWorkspace(selector)`, `cleanupCandidateWorkspace(selector, actor)`.
Constraints: At most one live candidate exists per repository identity, CHANGE ID, and generation; under the CHANGE lease, create journals `prepared`, returns the existing live identity on exact replay, or derives a new candidate ID from repository identity, CHANGE ID, generation, base commit, and a monotonically increasing journal-order-derived creation epoch greater than every prior tombstone epoch for that tuple, then journals `active` after worktree revalidation; a deleted namespace is never reused; create leaves every control-worktree path outside `.musubix/journal/**` and `.musubix/candidates/**` byte-for-byte unchanged; refresh applies the old-base candidate diff to the current default tip without rewriting history and requires prior deletion of a live old-commit snapshot; CHANGE abandon moves a live candidate to abandoned, and reopening creates a new generation whose candidate must be created with a new identity rather than refreshing the abandoned candidate; cleanup requires explicit actor and confirmation and refuses dirty, untracked, leased, or conflicted workspaces in every state, refuses unintegrated commits for `prepared | active | ready | integrating | verified`, but permits confirmed cleanup of `failed | abandoned | stale` candidates with unintegrated commits by removing only the worktree while retaining the branch, commits, and tombstone references; integrated cleanup may remove its clean worktree and retain historical refs; deleted candidates retain an append-only tombstone and cannot be selected.
Requirements: REQ-M5-LIFECYCLE-005 REQ-M5-WORKTREE-005 REQ-M5-WORKTREE-006 REQ-M5-WORKTREE-007 REQ-M5-MULTI-CHANGE-001 REQ-M5-MULTI-CHANGE-007
ADRs: ADR-0006 ADR-0010 ADR-0025 ADR-0026
Depends-On: DES-M5-012 DES-M5-MULTI-CHANGE-002 DES-M5-MULTI-CHANGE-003

## DES-M5-MULTI-CHANGE-005: Candidate evidence binding adapter
Responsibilities: Add candidate and integration context bindings to approval, TDD, trace, graph, formal, performance, quality, gate, status, workflow, attestation, candidate snapshot, and candidate-gate production and validation; define partitioned projections; classify stale or foreign evidence without cross-candidate credit; assign and preserve integration-specific diagnostic detail.
Interfaces: `candidateEvidenceBinding(context, candidateCommit)`, `integrationEvidenceBinding(integrationContext)`, `validateCandidateBinding(record, context)`, `candidateEvidenceInputs(context)`, `projectCandidateGate(context)`, `candidateStatus(context)`, `classifyIntegrationApprovalDiagnostic(input)`, `classifyIntegrationCandidateGateDiagnostic(input)`.
Constraints: Every credited candidate record binds CHANGE ID, generation, repository identity, base commit, and candidate commit; integration verification records bind integration ID, starting default commit, candidate-ID-sorted identity tuples, stable dependency apply order, `integration-source-manifest-v1`, and integration commit when available, and DES-M5-007 accepts this shape without implicit active-CHANGE resolution; DES-M5-006 approval selection and DES-M5-015 gate/readiness selection are explicitly extended to consume the normalized candidate or integration context from DES-M5-MULTI-CHANGE-001 instead of resolving a sole active CHANGE internally; an integrated transition additionally binds the integration commit and post-materialization `candidate-tree-manifest` SHA-256; authoritative state remains journal records, while approval, TDD, quality, workflow, gate, snapshot, and attestation projections are written under `.musubix/candidates/<candidate-id>/evidence/` and trace/graph/formal/performance outputs are written under `.musubix/candidates/<candidate-id>/reports/`; integration reports are written under `.musubix/candidates/integrations/<integration-id>/reports/`; repository-wide compatibility projections are rebuilt under the append lease and retain owner keys but never merge candidate credit; producer-specific input fingerprints retain approval hashes, configuration, trace/graph inputs, test reports, workflow transcript, and attestation payloads; any binding or input drift makes evidence stale; `CANDIDATE_EVIDENCE_MISMATCH` is emitted before a foreign record can satisfy a check; approval and candidate-gate producers assign the exact registered integration `detail` values before DES-M5-015 gate projection, which preserves code, detail, severity, and source stage unchanged; integration verification can read all-owner control-root history through DES-M5-MULTI-CHANGE-002 but filters credit to its registered candidate set and writes only integration-bound reports and journal transitions; the byte-lowest CHANGE ID in the integration set is the deterministic release owner, and finalization rebinds only that existing candidate branch/worktree and registry tip from its previous candidate commit to the verified integration commit while preserving the previous commit in the integrated record; publication credit is then reacquired in that registered candidate context by deleting its stale old snapshot, rerunning full-set quality on the integration tree, creating the ordinary REQ-M5-WORKTREE-005 snapshot, obtaining the complete DES-M5-019 gate set, and recording a fresh domain-less release approval; other integrated candidates provide no publication credit, and an omitted-selector publication operation remains fail-closed until the release owner is the sole active CHANGE.
Requirements: REQ-M5-COMPAT-013 REQ-M5-LIFECYCLE-005 REQ-M5-RELEASE-002 REQ-M5-PARALLEL-010 REQ-M5-MULTI-CHANGE-002 REQ-M5-MULTI-CHANGE-003 REQ-M5-MULTI-CHANGE-004 REQ-M5-MULTI-CHANGE-008
ADRs: ADR-0005 ADR-0010 ADR-0012 ADR-0025 ADR-0026
Depends-On: DES-M5-006 DES-M5-007 DES-M5-011 DES-M5-015 DES-M5-018 DES-M5-019 DES-M5-MULTI-CHANGE-001 DES-M5-MULTI-CHANGE-002

## DES-M5-MULTI-CHANGE-006: Dependency and ownership analyzer
Responsibilities: Derive candidate-owned source paths against immutable bases, validate explicit candidate dependencies, detect path overlap, stale bases, moved tips, unreachable commits, cycles, and already-integrated inputs, and produce a stable integration order.
Interfaces: `candidateChangeSet(candidate)`, `validateCandidateDependencies(candidates)`, `detectCandidateOwnershipConflicts(candidates)`, `stableCandidateOrder(candidates)`.
Constraints: Generated operational paths are excluded from source ownership; collision detection applies Unicode NFC normalization, platform case-folding where the target filesystem is case-insensitive, exact path overlap, and file/directory prefix conflicts before any integration worktree mutation; dependency edges must target the persisted candidate commit and integrated state expected by the registry; topological ordering uses candidate ID as the only tie-breaker; no content-based merge heuristic or AI resolution is permitted.
Requirements: REQ-M5-MULTI-CHANGE-004 REQ-M5-MULTI-CHANGE-005 REQ-M5-MULTI-CHANGE-006
ADRs: ADR-0005 ADR-0025 ADR-0026
Depends-On: DES-M5-003 DES-M5-MULTI-CHANGE-002 DES-M5-MULTI-CHANGE-004

## DES-M5-MULTI-CHANGE-007: Candidate readiness coordinator
Responsibilities: Re-evaluate approvals, TDD completeness, terminal full-set quality, candidate snapshots, candidate gates, commit reachability, cleanliness, and binding currency before recording ready or demoting a drifted candidate.
Interfaces: `evaluateCandidateReadiness(candidate)`, `markCandidateReady(selector)`, `reclassifyCandidate(candidate, drift)`.
Constraints: Release approval is not a readiness prerequisite; readiness records the complete binding input set; approval, TDD, quality, snapshot, gate, configuration, or candidate-commit drift without a base change demotes ready to active, base/default-history drift marks stale, and a completed required candidate verification failure records failed in that precedence order; repairing the prerequisite permits a full re-evaluation transition from failed to active and then ready; an integration-attempt failure does not rewrite candidate verification evidence and returns unchanged candidates to ready when their bindings remain current; no cached status alone grants readiness; parallel assignment and integration evidence can satisfy only their parent CHANGE candidate after provenance validation.
Requirements: REQ-M5-RELEASE-002 REQ-M5-PARALLEL-010 REQ-M5-MULTI-CHANGE-003 REQ-M5-MULTI-CHANGE-007 REQ-M5-MULTI-CHANGE-008
ADRs: ADR-0005 ADR-0012 ADR-0025
Depends-On: DES-M5-006 DES-M5-011 DES-M5-015 DES-M5-PARALLEL-007 DES-M5-MULTI-CHANGE-005

## DES-M5-MULTI-CHANGE-008: Deterministic integration orchestrator
Responsibilities: Derive integration identity, create or resume a clean registered integration worktree, apply ready candidate commits in stable order, materialize operational state, execute complete verification, persist verified provenance, create the integration commit, and atomically fast-forward the default branch.
Interfaces: `deriveIntegrationId(defaultTip, candidates)`, `startCandidateIntegration(selectors)`, `resumeCandidateIntegration(integrationId)`, `verifyCandidateIntegration(integrationId)`, `finalizeCandidateIntegration(integrationId)`, `cleanupIntegrationWorkspace(integrationId, actor)`.
Constraints: Integration identity hashes repository identity, starting default commit, and CHANGE ID/generation/candidate ID/candidate commit tuples sorted by candidate ID byte order; stable dependency order controls only commit application and is separately persisted; the byte-lowest CHANGE ID is persisted as release owner but does not change integration identity; `integration-source-manifest-v1` is the DES-M5-012 candidate-tree canonical projection using NFC paths, Git modes, object types, object IDs, and canonical byte ordering, captured after candidate application and before operational-state materialization with generated operational paths excluded; verification commands run with no CHANGE or append lease held, use the integration worktree as source root, resolve operational evidence read-only through the control-root state router, and write integration-bound reports through DES-M5-MULTI-CHANGE-005; candidates in `integrating | verified` reject refresh, ready, cleanup, and other mutating operations with `CANDIDATE_INTEGRATION_CONFLICT`; configured required commands, strict trace, graph gate, changed gate, and status execute in the registered integration context; verification accepts exit 0 only when every required command and check is present, non-skipped, and passing, or accepts exit 1 only when the sole failing required check is approval, its diagnostic set is non-empty, and every code/detail pair is in the exact REQ-M5-MULTI-CHANGE-006 closed set; missing or mismatched detail, `APPROVAL_CANDIDATE_UNAVAILABLE`, `RELEASE_CANDIDATE_TREE_MISMATCH`, `CHANGE_GENERATION_INCOMPLETE`, any other approval diagnostic, any other failed check, any absent/skipped required member, empty diagnostics, malformed output, or ready status fails `CANDIDATE_INTEGRATION_VERIFICATION_FAILED`; tolerated approval diagnostics grant no gate, release, or publication credit; verification binds every report hash; every integrating, verified, or integrated candidate transition uses one `withMultiChangeWrite` scope for the complete sorted CHANGE set, whose callback receives the already-held append-lease session; finalization performs every candidate state, generation, base, exact input commit, and reachability assertion inside that scope before any append, appends the final verified record, captures the operational-state fingerprint baseline from the resulting declared path set, materializes state, creates the integration commit, and compares the same path set again; Git subprocesses have configured finite timeouts, lease renewal remains asynchronous, fencing is checked before each irreversible step, and concurrent writers receive `CANDIDATE_JOURNAL_BUSY` rather than unbounded blocking; a dirty control worktree outside declared operational paths fails `CANDIDATE_INTEGRATION_CONFLICT`, while operational bytes differing from the materialized integration tree fail `CANDIDATE_OPERATIONAL_STATE_DRIFT`; before ref movement finalization writes a Git-common-directory untracked `candidate-finalization-v1` marker bound to integration ID, integration commit, starting default commit, and current fencing token, then uses compare-and-swap `update-ref <default-ref> <integration-commit> <starting-default-commit>` and deterministically refreshes the branch-owning control worktree index and files to that commit under the same fenced transaction; a marker with the ref still at the starting commit is a retryable pre-CAS abort that is removed without an integrated append, every CAS failure removes the marker after recording the required stale outcome, and every success or recovered terminal outcome removes it; recovery runs inside the same `withMultiChangeWrite` scope, validates marker schema and fencing lineage, integration registry binding, current ref, and integration commit reachability in that order, then completes the control index/worktree refresh; in the same integrated append it rebinds the release-owner candidate branch, worktree, and registry tip to the integration commit, records its previous candidate commit, and leaves all other candidate refs unchanged; operational-state fingerprint drift updates neither branch nor candidate state, while CAS failure from a default-tip advance marks every input candidate stale and returns `CANDIDATE_BASE_STALE`; if a crash occurs after fast-forward but before the integrated append, resume recognizes the exact recorded integration commit at the default tip or as the uniquely bound reachable commit and idempotently completes the integrated transition instead of deriving a new integration ID; re-submitting any integrating or verified candidate with a different candidate set returns `CANDIDATE_INTEGRATION_CONFLICT`; abort or failed verification records an integration-attempt terminal state and returns unchanged candidates to ready; confirmed cleanup removes only a clean integration worktree, while the terminal integration registration and journal history remain for audit after failed or successful attempts.
Requirements: REQ-M5-WORKTREE-005 REQ-M5-WORKTREE-006 REQ-M5-RELEASE-002 REQ-M5-PARALLEL-010 REQ-M5-MULTI-CHANGE-004 REQ-M5-MULTI-CHANGE-005 REQ-M5-MULTI-CHANGE-006 REQ-M5-MULTI-CHANGE-007
ADRs: ADR-0005 ADR-0006 ADR-0010 ADR-0017 ADR-0025 ADR-0026
Depends-On: DES-M5-006 DES-M5-014 DES-M5-015 DES-M5-019 DES-M5-MULTI-CHANGE-002 DES-M5-MULTI-CHANGE-003 DES-M5-MULTI-CHANGE-005 DES-M5-MULTI-CHANGE-006 DES-M5-MULTI-CHANGE-007

## DES-M5-MULTI-CHANGE-009: Candidate CLI and compatibility facade
Responsibilities: Expose candidate-workspace create, list, show, ready, resume, refresh, integrate, and cleanup commands; add visible candidate selectors to approval, TDD, gate, and status; add integration selectors to trace, graph, gate, and status; map typed diagnostics to stable exit codes and JSON.
Interfaces: `candidate-workspace create --change-id <id>`, `candidate-workspace list`, `candidate-workspace show <selector>`, `candidate-workspace ready <selector>`, `candidate-workspace resume <selector>`, `candidate-workspace refresh --change-id <id>`, `candidate-workspace integrate <selector...> --confirm`, `candidate-workspace cleanup <selector> --deleted-by <name> --confirm`, common `--root`, `--json`, `--change-id`, and `--multi-change-verification`.
Constraints: Read-only list/show preserve exit 0 only for valid projections; status always exits 0 for a valid non-ready projection while state-changing commands and gate use exit 1 for domain failures; malformed syntax and mutually exclusive selectors use exit 2 `CLI_ERROR`; implicit single-CHANGE behavior and existing parallel command contracts remain unchanged; `candidate-snapshot create <change-id>` at the control root preserves the sole-active byte-exact confirmation-token rule, while inside a registered candidate worktree it confirms the workspace-selected CHANGE and rejects any different token; this explicitly extends DES-M5-005 candidate maintenance and DES-M5-002 candidate-snapshot CLI behavior; integration-only selectors are hidden from unrelated commands and never become evidence shortcuts.
Requirements: REQ-M5-COMPAT-013 REQ-M5-LIFECYCLE-005 REQ-M5-WORKTREE-005 REQ-M5-WORKTREE-006 REQ-M5-WORKTREE-007 REQ-M5-RELEASE-002 REQ-M5-PARALLEL-010 REQ-M5-MULTI-CHANGE-001 REQ-M5-MULTI-CHANGE-002 REQ-M5-MULTI-CHANGE-006 REQ-M5-MULTI-CHANGE-007 REQ-M5-MULTI-CHANGE-008
ADRs: ADR-0002 ADR-0007 ADR-0013 ADR-0025 ADR-0026
Depends-On: DES-M5-002 DES-M5-MULTI-CHANGE-001 DES-M5-MULTI-CHANGE-004 DES-M5-MULTI-CHANGE-007 DES-M5-MULTI-CHANGE-008

## Diagnostic ownership

| Code | Owner | Exit |
|---|---|---:|
| `CANDIDATE_WORKSPACE_NOT_FOUND` | DES-M5-MULTI-CHANGE-001/002 | 1 |
| `CANDIDATE_WORKSPACE_REPOSITORY_MISMATCH` | DES-M5-MULTI-CHANGE-001 | 1 |
| `CANDIDATE_WORKSPACE_GENERATION_MISMATCH` | DES-M5-MULTI-CHANGE-001 | 1 |
| `CANDIDATE_WORKSPACE_SELECTOR_MISMATCH` | DES-M5-MULTI-CHANGE-001 | 1 |
| `CANDIDATE_EVIDENCE_MISMATCH` | DES-M5-MULTI-CHANGE-005 | 1 |
| `CANDIDATE_STATE_OWNERSHIP` | DES-M5-MULTI-CHANGE-002/003 | 1 |
| `CANDIDATE_LEASE_BUSY` | DES-M5-MULTI-CHANGE-003 | 1 |
| `CANDIDATE_JOURNAL_BUSY` | DES-M5-MULTI-CHANGE-003 | 1 |
| `CANDIDATE_OWNERSHIP_CONFLICT` | DES-M5-MULTI-CHANGE-006 | 1 |
| `CANDIDATE_DEPENDENCY_UNSATISFIED` | DES-M5-MULTI-CHANGE-006 | 1 |
| `CANDIDATE_DEPENDENCY_CYCLE` | DES-M5-MULTI-CHANGE-006 | 1 |
| `CANDIDATE_BASE_STALE` | DES-M5-MULTI-CHANGE-004/006/008 | 1 |
| `CANDIDATE_COMMIT_UNREACHABLE` | DES-M5-MULTI-CHANGE-004/006 | 1 |
| `CANDIDATE_ALREADY_INTEGRATED` | DES-M5-MULTI-CHANGE-006 | 1 |
| `CANDIDATE_INTEGRATION_CONFLICT` | DES-M5-MULTI-CHANGE-004/008 | 1 |
| `CANDIDATE_INTEGRATION_VERIFICATION_FAILED` | DES-M5-MULTI-CHANGE-008 | 1 |
| `CANDIDATE_OPERATIONAL_STATE_DRIFT` | DES-M5-MULTI-CHANGE-008 | 1 |
| `CANDIDATE_CLEANUP_UNSAFE` | DES-M5-MULTI-CHANGE-004 | 1 |

## Integration approval diagnostic details

| Code | Required detail | Producer |
|---|---|---|
| `APPROVAL_CANDIDATE_MISSING` | `integration-candidate-snapshot-missing` | DES-M5-006 via DES-M5-MULTI-CHANGE-005 |
| `RELEASE_GATE_EVIDENCE_MISSING` | `integration-candidate-gate-missing` | DES-M5-019 via DES-M5-MULTI-CHANGE-005 |
| `RELEASE_GATE_EVIDENCE_STALE` | `integration-candidate-context-mismatch` | DES-M5-019 via DES-M5-MULTI-CHANGE-005 |
| `RELEASE_GATE_CANDIDATE_MISMATCH` | `integration-candidate-context-mismatch` | DES-M5-019 via DES-M5-MULTI-CHANGE-005 |
| `APPROVAL_MISSING` | `integration-release-approval-missing` | DES-M5-006 via DES-M5-MULTI-CHANGE-005 |
| `APPROVAL_STALE` | `integration-release-approval-stale` | DES-M5-006 via DES-M5-MULTI-CHANGE-005 |

The final two details are emitted only for a domain-less release stage.
Requirements, design, and domain approvals never receive them. Missing,
unknown, or rewritten details fail integration verification.
