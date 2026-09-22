---
schemaVersion: 1
feature: musubix5-clean-foundation
status: approval-pending
---
# musubix5 clean foundation design

## Architecture constraints

- Runtime: Node.js 20 or newer, TypeScript strict mode, ESM.
- No `any`, broad catch, silent fallback, or success-shaped failure.
- Canonical JSON uses sorted object keys, UTF-8, and one trailing LF.
- Persisted `order`, not wall-clock time, establishes chronology.
- Every normal record binds an active positive CHANGE generation; legacy
  generation-less records read as generation 1 without rewriting.
- Source-of-truth journals are append-only. Mutable JSON files are derived
  projections and never chronology authorities.
- All stateful operations validate first, acquire the required lease, reserve
  budget when applicable, persist pending intent, execute, and commit one
  idempotent terminal result.
- musubix3 and musubix4 remain read-only.

## Design-approved execution-policy projection

Canonical encoding is UTF-8 JSON with lexicographically sorted object keys, no
insignificant whitespace, and exactly one trailing LF byte.

```json
{"architecture":{"forbidCycles":true,"rules":[]},"attestation":{"githubOidc":{"mode":"off"},"maxAgeSeconds":3600,"maxFutureSkewSeconds":60,"mode":"local","trustedPublicKeys":[]},"codeGraph":{"mode":"compatible"},"commands":[{"args":["run","typecheck"],"command":"npm","name":"typecheck","required":true,"timeoutMs":120000},{"args":["run","build"],"command":"npm","name":"build","required":true,"timeoutMs":120000},{"adapter":"vitest","args":["vitest","run"],"command":"npx","name":"test","required":true,"timeoutMs":180000},{"args":["run","test:compat"],"command":"npm","name":"compatibility","required":true,"timeoutMs":180000},{"args":["run","pack:check"],"command":"npm","name":"pack-check","required":true,"timeoutMs":120000},{"args":["run","pack:smoke"],"command":"npm","name":"pack-smoke","required":true,"timeoutMs":180000}],"formal":{"minModeledFraction":0,"solver":"none","timeoutMs":12000},"mutation":{"mode":"compatible"},"requiredChecks":["requirements","design","constitution","trace","graph","commands"],"schemaVersion":1,"tdd":{"redPreflightCommands":[]},"thresholds":{"design":1,"implementation":1,"tests":1},"workflow":{"maxAgeSeconds":3600,"maxEventSkewMs":null,"maxFutureSkewSeconds":60,"maxTranscriptBytes":100000000,"maxTranscriptLineBytes":1000000,"mode":"compatible"}}
```

SHA-256:
`2cfe97816d1cb1681c04136277544aa92f6c6f6bf43a8fffa3b94a28a68400c9`

`qualityProfile` is excluded because the projection contains every effective
policy field and the profile label has no independent enforcement effect.
`language` is display-only. `workflow.maxEventSkewMs: null` canonically means
that the optional event-skew bound is disabled; the transcript byte limits are
the fully materialized effective defaults, so explicitly writing those defaults
does not change this projection.

The musubix5-only orchestration extension is also design-approved. It is
disabled by default at both repairable boundaries but fixes positive limits
before verified-auto can be enabled:

```json
{"approvalAutomation":{"design":{"mode":"manual","producerRepairLimit":3,"repairPlannerBudgetUnits":1000,"reviewerBudgetUnits":1000},"release":{"mode":"manual"},"requirements":{"mode":"manual","producerRepairLimit":3,"repairPlannerBudgetUnits":1000,"reviewerBudgetUnits":1000}}}
```

SHA-256:
`d2b5761764ecc3cb7cf10f81ef77157efc56286c587d11048c55c2b78f1c13d9`

If `approvalAutomation` is absent, orchestration configuration normalization
materializes exactly the object above before comparison with this separately
design-approved extension digest. The digest covers both modes and limits.
Enabling verified-auto changes the normative design-controlled digest and
therefore requires a new design approval before execution; tests exercise
enabled configurations through explicit approved test manifests.

Candidate-gate artifact transport has a separate design-approved effective
policy so strengthening remote-runner trust does not alter the existing local
attestation behavior:

```json
{"candidateGate":{"attestation":{"githubOidc":{"audience":"https://github.com/nahisaho/musubix5/actions/musubix5-gate","issuer":"https://token.actions.githubusercontent.com","keyBinding":"public-key","mode":"strict","repository":"nahisaho/musubix5","workflow":".github/workflows/candidate-gate.yml"},"maxAgeSeconds":86400,"maxFutureSkewSeconds":60,"mode":"ci-required","repository":"nahisaho/musubix5","trustedPublicKeys":[]}}}
```

SHA-256:
`2458362070c8e79d8c776d6e9d53965a41ba5c3a770189562bf2921ef6253ea0`

The GitHub OIDC token binds the repository, workflow, commit, run ID, custom
audience, and ephemeral Ed25519 public-key digest. The 24-hour matrix-artifact
freshness window is evaluated independently from the generic one-hour
attestation window and covers cross-platform execution plus retries; changing
this policy invalidates the gate fingerprint and requires design reapproval.

The `gate-input-fingerprint-v1.config` value is the following derived canonical
object. `approval` is the inner `approval` value from the requirements-stage
projection; `approvalAutomation` and `candidateGate` are the inner values of
their wrapper blocks; `executionPolicy` is the complete unwrapped execution-
policy block and carries the single `schemaVersion`.

```json
{"approval":{"domains":[],"mode":"required"},"approvalAutomation":{"design":{"mode":"manual","producerRepairLimit":3,"repairPlannerBudgetUnits":1000,"reviewerBudgetUnits":1000},"release":{"mode":"manual"},"requirements":{"mode":"manual","producerRepairLimit":3,"repairPlannerBudgetUnits":1000,"reviewerBudgetUnits":1000}},"candidateGate":{"attestation":{"githubOidc":{"audience":"https://github.com/nahisaho/musubix5/actions/musubix5-gate","issuer":"https://token.actions.githubusercontent.com","keyBinding":"public-key","mode":"strict","repository":"nahisaho/musubix5","workflow":".github/workflows/candidate-gate.yml"},"maxAgeSeconds":86400,"maxFutureSkewSeconds":60,"mode":"ci-required","repository":"nahisaho/musubix5","trustedPublicKeys":[]}},"executionPolicy":{"architecture":{"forbidCycles":true,"rules":[]},"attestation":{"githubOidc":{"mode":"off"},"maxAgeSeconds":3600,"maxFutureSkewSeconds":60,"mode":"local","trustedPublicKeys":[]},"codeGraph":{"mode":"compatible"},"commands":[{"args":["run","typecheck"],"command":"npm","name":"typecheck","required":true,"timeoutMs":120000},{"args":["run","build"],"command":"npm","name":"build","required":true,"timeoutMs":120000},{"adapter":"vitest","args":["vitest","run"],"command":"npx","name":"test","required":true,"timeoutMs":180000},{"args":["run","test:compat"],"command":"npm","name":"compatibility","required":true,"timeoutMs":180000},{"args":["run","pack:check"],"command":"npm","name":"pack-check","required":true,"timeoutMs":120000},{"args":["run","pack:smoke"],"command":"npm","name":"pack-smoke","required":true,"timeoutMs":180000}],"formal":{"minModeledFraction":0,"solver":"none","timeoutMs":12000},"mutation":{"mode":"compatible"},"requiredChecks":["requirements","design","constitution","trace","graph","commands"],"schemaVersion":1,"tdd":{"redPreflightCommands":[]},"thresholds":{"design":1,"implementation":1,"tests":1},"workflow":{"maxAgeSeconds":3600,"maxEventSkewMs":null,"maxFutureSkewSeconds":60,"maxTranscriptBytes":100000000,"maxTranscriptLineBytes":1000000,"mode":"compatible"}}}
```

SHA-256:
`804c9fa7b32eca979cc44e25f0334effc3abee95f172e6f7d3dbdf1dea9655b6`

## DES-M5-001: Compatibility oracle adapter
Responsibilities: Build the pinned musubix3 v0.1.18 source, capture command contracts, execute the approved Node.js and operating-system matrix, normalize only approved package or executable tokens, and compare observable CLI, API, configuration, package, and filesystem behavior.
Interfaces: `BaselineOracle.acquire()`, `BaselineOracle.capture(invocation)`, `ContractComparator.compare(expected, actual)`.
Constraints: The pinned commit and fixture hashes are mandatory; `MUSUBIX3_Z3` and `MUSUBIX3_LEAN` are not renamed during normalization; mismatches are classified and cannot be silently accepted.
Requirements: REQ-M5-COMPAT-001 REQ-M5-COMPAT-002 REQ-M5-COMPAT-003 REQ-M5-COMPAT-004 REQ-M5-COMPAT-005 REQ-M5-COMPAT-008 REQ-M5-COMPAT-009 REQ-M5-COMPAT-011 REQ-M5-COMPAT-012
ADRs: ADR-0002 ADR-0007
Depends-On: DES-M5-003

## DES-M5-002: Public CLI and package facade
Responsibilities: Expose the `musubix5` executable, compatible command hierarchy, public library exports, package assets, and isolated-installation behavior.
Interfaces: `runCli(argv, environment)`, `release-operation authorize <operation-id>`, `release-operation validate <operation-id>`, `release-operation status <operation-id>`, package exports `./domain`, `./analysis`, `./attestation`.
Constraints: Only the `musubix5` bin is published; every other intentional difference requires registered governance artifacts; command handlers return typed outcomes mapped centrally to exit codes.
Requirements: REQ-M5-COMPAT-001 REQ-M5-COMPAT-002 REQ-M5-COMPAT-003 REQ-M5-COMPAT-005 REQ-M5-COMPAT-006 REQ-M5-COMPAT-007 REQ-M5-COMPAT-013 REQ-M5-LIFECYCLE-005 REQ-M5-RELEASE-001 REQ-M5-RELEASE-003 REQ-M5-RELEASE-004
ADRs: ADR-0002 ADR-0006 ADR-0007 ADR-0010 ADR-0011
Depends-On: DES-M5-003 DES-M5-005 DES-M5-006 DES-M5-008 DES-M5-011 DES-M5-013 DES-M5-014 DES-M5-015 DES-M5-016 DES-M5-017 DES-M5-018 DES-M5-019 DES-M5-020 DES-M5-021

## DES-M5-003: Canonical serialization and identity service
Responsibilities: Canonicalize typed records, hash bytes, derive canonical repository and candidate identities, verify producer identity, and expose deterministic comparison helpers.
Interfaces: `canonicalBytes(value)`, `sha256(bytes)`, `canonicalRepositoryIdentity(origin, repositoryRoot)`, `identityForCandidate()`, `verifyBinding(record, context)`.
Constraints: Canonical bytes exclude schema-declared display metadata only; no caller may invent its own hashing or path normalization. Repository-aware callers obtain configured origin values with `git config --get-all remote.origin.url`, without `url.*.insteadOf` rewriting, use the first value because Git fetch uses the first configured URL, and always supply the absolute `git rev-parse --show-toplevel` path as the missing-or-empty-origin fallback parameter. `canonicalRepositoryIdentity` implements the exact REQ-M5-WORKTREE-001 grammar and normalization order, returns only `repository:<sha256>`, and never logs or returns the raw origin. Callers discard all acquired origin values after canonicalization and must not persist, return, or render them in evidence, manifests, diagnostics, or wrapped errors. Every persisted, compared, manifested, fingerprinted, runner-derived, or reported `repositoryId` originates from this interface.
Requirements: REQ-M5-COMPAT-003 REQ-M5-EVIDENCE-002 REQ-M5-EVIDENCE-003 REQ-M5-EVIDENCE-005 REQ-M5-QUALITY-003 REQ-M5-WORKTREE-001
ADRs: ADR-0003 ADR-0005 ADR-0010

## DES-M5-004: Ordered journal and lease service
Responsibilities: Allocate repository-wide order values, serialize stateful writers, maintain fencing tokens, verify journal chains, rebuild projections, diagnose corruption, recover interrupted writes, and persist generation-qualified CHANGE records.
Interfaces: `withChangeLease(changeId, operation)`, `withOrderLease(operation)`, `allocateOrder()`, `append(record)`, `verifyJournal()`, `rebuildProjection(kind)`, `loadByIdempotencyKey(key)`, `reconcilePending()`, `generationOrderKey(changeId, generation, phase, scopeId?)`.
Constraints: Authoritative normal and bootstrap journals are tracked under `.musubix/journal`; every journal `repositoryId` is supplied by DES-M5-003 `canonicalRepositoryIdentity`; the repository common Git directory contains only shared leases, scratch files, and the control-worktree locator; stateful writes target the designated control worktree; a fresh clone verifies the tracked chain and seeds the next order from its maximum valid order; new CHANGE records use `g<N>` order keys while legacy unqualified keys read as generation 1; duplicate or divergent orders are a non-pass merge diagnostic; atomic directory creation provides lease acquisition; leases use a 30-second TTL and renew every 10 seconds; process-monotonic elapsed time drives renewal while persisted wall-clock deadlines are used only for liveness takeover and never chronology; every commit verifies the latest fencing token; writes use create-new temporary files and platform-safe atomic replacement without assuming directory fsync support on Windows.
Requirements: REQ-M5-LIFECYCLE-002 REQ-M5-LIFECYCLE-003 REQ-M5-LIFECYCLE-004 REQ-M5-LIFECYCLE-005 REQ-M5-EVIDENCE-005
ADRs: ADR-0003 ADR-0010
Depends-On: DES-M5-003

## DES-M5-005: Lifecycle state machine
Responsibilities: Enforce predecessor rules, create/resume/abandon versioned CHANGE generations, persist phase transitions, reject cross-generation evidence, and expose resumable CHANGE status.
Interfaces: `transition(changeId, generation, requestedPhase, evidenceHeads)`, `reopen(changeId, requirementIds?, idempotencyKey): { generation, resumed }`, `abandon(changeId, { reason, approver, confirm })`, `activeGeneration(changeId)`, `status(changeId)`, `resume(invocationId)`.
Constraints: A transition commits only after validation and required evidence checks; reopen is lease-bound and idempotent, starts only at impact, resolves the exact current CHANGE requirement set, creates qualified order keys, and owns the cross-generation unchanged-fingerprint exemption while preserving `--allow-unchanged` inside a generation; every later transition revalidates the CHANGE requirement set and emits `CHANGE_GENERATION_REQUIREMENTS` on drift; abandoning requires nonblank reason/approver and confirmation, leaves no active generation, and permits only reopen; the greatest non-abandoned generation is active; optional Refactor occurs only after Green; unsupported formal obligations are classified without proof credit; stale states retain superseded history and re-enter only through the approval cascade or a new generation.
Requirements: REQ-M5-LIFECYCLE-001 REQ-M5-LIFECYCLE-002 REQ-M5-LIFECYCLE-003 REQ-M5-LIFECYCLE-005 REQ-M5-QUALITY-002
ADRs: ADR-0003 ADR-0005 ADR-0010
Depends-On: DES-M5-003 DES-M5-004 DES-M5-007

## DES-M5-006: Approval manifest service
Responsibilities: Resolve domain-scoped normative paths and effective configuration projections, bind CHANGE generation, read release blobs from an immutable candidate commit, bind candidate gate projection, classify every included or excluded path, produce canonical schema-v1 manifests, record exact-hash approvals, and propagate supersession.
Interfaces: `prepareApproval(stage, domain?)`, `recordApproval(input)`, `validateApprovals()`, `readReleaseApprovalDigest(root, candidateCommit)`, `supersedeFrom(change)`.
Constraints: Requirements and design use `approval-normative-path-set-v1`, active `changeId` plus generation, and effective defaulted projections; no active generation rejects preparation, validation, and recording. An incomplete active generation permits requirements/design approval but release preparation/recording fails with `CHANGE_GENERATION_INCOMPLETE`. Release is domain-less, resolves active CHANGE/generation internally, obtains its persisted immutable commit, typed Git entries, and blob bytes from DES-M5-012, and obtains the candidate-bound `repositoryId`, `candidateCommit`, and `gateInputFingerprint` projection from DES-M5-019, never from caller-selected identities or mutable worktree bytes. `readReleaseApprovalDigest` is lease-free and non-mutating, independently validates the current release approval and candidate binding in a supplied evidence root, and returns its artifact SHA-256 or a classified non-current diagnostic. Blob hashing uses DES-M5-003 `sha256(bytes)`; symbolic-link and Gitlink classification uses only tree-derived mode and object-type data. `approval-manifest-schema-v1` contains exactly `schemaVersion`, `stage`, optional `domain`, optional `changeId`, optional `generation`, `artifacts`, `projection`, and `exclusions`; `artifacts` binds only included raw blob hashes, `exclusions` binds only path/reason pairs, displayed excluded hashes remain outside the aggregate, and NFC UTF-8 path byte order overrides generic object-key order for path-keyed data. Canonical serialization, generation rules, domain rules, exclusion precedence, and all diagnostics follow REQ-M5-APPROVAL-007. Both release approval destinations are excluded producer-independently; manual confirmation is mandatory; bootstrap approvals authorize development only and generation-bound native approval is required before release.
Requirements: REQ-M5-APPROVAL-001 REQ-M5-APPROVAL-002 REQ-M5-APPROVAL-007 REQ-M5-APPROVAL-008 REQ-M5-APPROVAL-009 REQ-M5-COMPAT-013 REQ-M5-LIFECYCLE-005 REQ-M5-RELEASE-002
ADRs: ADR-0002 ADR-0004 ADR-0008 ADR-0010
Depends-On: DES-M5-003 DES-M5-004 DES-M5-005 DES-M5-007 DES-M5-012 DES-M5-019

## DES-M5-007: Evidence registry
Responsibilities: Validate evidence schemas, CHANGE generation, ownership, producer and input bindings, dependency heads, currency, status taxonomy, and derived projections.
Interfaces: `appendEvidence(kind, record)`, `currentEvidence(query)`, `classifyCurrency(record, context)`, `project(kind)`, `bindGeneration(record, activeGeneration)`.
Constraints: Every normal evidence kind binds the active generation; every evidence `repositoryId` is supplied by DES-M5-003 `canonicalRepositoryIdentity`; legacy missing generation reads as generation 1; bootstrap remains separate; abandoned or superseded generations never satisfy current evidence; normative specifications are never generated evidence; foreign, stale, skipped, unsupported, flaky, waived, failed, or superseded records do not become pass.
Requirements: REQ-M5-EVIDENCE-001 REQ-M5-EVIDENCE-002 REQ-M5-EVIDENCE-003 REQ-M5-EVIDENCE-004 REQ-M5-EVIDENCE-005 REQ-M5-LIFECYCLE-005 REQ-M5-WAIVER-001
ADRs: ADR-0003 ADR-0005 ADR-0010
Depends-On: DES-M5-003 DES-M5-004

## DES-M5-008: Approval boundary coordinator
Responsibilities: Coordinate producer output, Reviewer execution, duplicate-manifest detection, bounded repair, durable attempt, nonce, and repair counters, terminal reasons, and manual-boundary handoff.
Interfaces: `evaluateBoundary(changeId, generation, boundaryKey, manifest)`, `resumeBoundary(pendingId)`, `classifyFinding(finding)`.
Constraints: Verified-auto is explicit opt-in for requirements or design only; release remains manual; effective `approvalAutomation` configuration must match the separately design-approved extension digest or execution fails closed; the durable boundary key includes CHANGE and active generation, repair identity adds rejected ordinal, and attempt/repair/nonce counters plus rejected-digest history never cross generations; duplicate rejection and repair exhaustion terminate deterministically; counters increment only in the idempotent terminal commit for the bound pending invocation.
Requirements: REQ-M5-APPROVAL-003 REQ-M5-APPROVAL-004 REQ-M5-APPROVAL-005 REQ-M5-APPROVAL-006 REQ-M5-LIFECYCLE-005
ADRs: ADR-0004 ADR-0009 ADR-0010
Depends-On: DES-M5-004 DES-M5-006 DES-M5-009 DES-M5-010

## DES-M5-009: Budget ledger
Responsibilities: Reserve role budget, bind reservations to pending invocations, record actual usage, classify overruns, and compensate orphan reservations.
Interfaces: `reserve(request)`, `bindPending(reservationId, invocationKey)`, `recordUsage(result)`, `classifyOverrun(result)`, `reconcile(reservationId)`.
Constraints: Reservation precedes attempt, repair, and nonce consumption; missing or non-positive limits fail closed; one started invocation has one terminal usage record.
Requirements: REQ-M5-BUDGET-001 REQ-M5-BUDGET-002 REQ-M5-BUDGET-003 REQ-M5-BUDGET-004 REQ-M5-BUDGET-005
ADRs: ADR-0003 ADR-0004
Depends-On: DES-M5-003 DES-M5-004

## DES-M5-010: Planner output gateway
Responsibilities: Retain safe raw responses, normalize structured output, validate JSON schemas, return path-specific diagnostics, retry invalid role output, and detect repeated invalid output.
Interfaces: `parsePlannerOutput(raw)`, `validatePlannerOutput(kind, value)`, `retryWithDiagnostics(invocation, diagnostics)`.
Constraints: Raw output is stored in access-controlled run-local diagnostics; secrets are redacted before persistence; role retry and semantic producer repair have distinct identities, counters, and budgets.
Requirements: REQ-M5-PLANNER-001 REQ-M5-PLANNER-002 REQ-M5-PLANNER-003 REQ-M5-PLANNER-004
ADRs: ADR-0004 ADR-0005
Depends-On: DES-M5-003 DES-M5-004 DES-M5-009

## DES-M5-011: TDD cycle ledger
Responsibilities: Execute configured test adapters, validate authoritative TEST IDs, record Red/Green/Refactor observations, separate batch scopes, and resolve canonical coverage.
Interfaces: `recordRed(input)`, `recordImplementation(changeRecord)`, `recordGreen(input)`, `recordRefactor(input)`, `selectCurrentCycle(generation, requirementId)`.
Constraints: Red and Green come from `tdd` commands; Implementation comes from the matching generation-bound `change-record` checkpoint; all three bind one generation, requirement batch, and candidate lineage with strictly increasing order; selection never crosses generations; Refactor follows current Green; legacy full-set and requirement batches never merge.
Requirements: REQ-M5-TDD-001 REQ-M5-TDD-002 REQ-M5-TDD-003 REQ-M5-TDD-004 REQ-M5-LIFECYCLE-005
ADRs: ADR-0005 ADR-0010
Depends-On: DES-M5-003 DES-M5-004 DES-M5-007

## DES-M5-012: Workspace manager
Responsibilities: Create and identify baseline, candidate, and QA workspaces; preserve unrelated dirty paths; persist the active CHANGE binding and immutable candidate snapshot commit; enumerate candidate Git entries without reading the worktree; track generated-output ownership; and recover rejected candidates.
Interfaces: `captureBaseline()`, `createCandidate(changeId)`, `createQa(candidateId, matrixJob)`, `persistCandidateSnapshot(root, changeId)`, `resolveCandidateSnapshot(root, requestedChangeId?)`, `listCandidateEntries(commit): { rawPath, nfcPath, objectId, gitMode, objectType }[]`, `readCandidateBlob(commit, objectId)`, `compareTrackedTree(workspace, commit, phase: 'pre' | 'post')`, `collectOwnedChanges(changeId)`, `recover(candidateId)`.
Constraints: Candidate work requires an immutable baseline commit; one CHANGE owns one branch or worktree; byte, mode, staged, unstaged, deleted, and untracked identities are preserved. Creating a snapshot obtains its repository identity only from DES-M5-003 `canonicalRepositoryIdentity`, discards the acquired raw origin before constructing any record or diagnostic, and verifies reachability from that CHANGE's candidate branch head. Resolving a persisted snapshot selects the greatest-order journal record for the requested CHANGE, whose journal attribution binds it to that CHANGE generation, then verifies the same canonical repository identity, exact commit existence, and reachability through at least one fetched repository ref without requiring the original candidate branch to remain; either failure is `APPROVAL_CANDIDATE_UNAVAILABLE`, while DES-M5-016 intentionally wraps any non-current approval or snapshot failure as `RELEASE_OPERATION_NOT_AUTHORIZED` for an external-operation request. An identity-mismatch diagnostic states that release evidence producers must use the credential-free GitHub HTTPS origin form and never includes an acquired origin. Selecting a different verified snapshot appends a later record and supersedes the prior release manifest and approval. Records whose persisted `repositoryId` differs from the canonical digest fail identity comparison and cannot satisfy readiness; each affected generation must persist a new candidate snapshot and regenerate all matrix gate records. QA workspaces disable checkout content conversion and smudge/clean filters; tracked comparison refreshes the index and compares Git object IDs rather than worktree byte hashes. Pre-gate comparison permits no tracked differences; post-gate comparison derives its allow-list internally from the closed `generated-trace` and `gate-self-reference` patterns and otherwise emits `RELEASE_CANDIDATE_TREE_MISMATCH`; ignored/untracked caches are outside comparison. Entry enumeration and blob reads address immutable Git objects and never fall back to worktree paths.
Requirements: REQ-M5-WORKTREE-001 REQ-M5-WORKTREE-002 REQ-M5-WORKTREE-003 REQ-M5-WORKTREE-004 REQ-M5-RELEASE-002
ADRs: ADR-0006 ADR-0010
Depends-On: DES-M5-003 DES-M5-004 DES-M5-007

## DES-M5-013: Bootstrap runner
Responsibilities: Start independently of normal orchestrator state, validate explicit authority, execute bounded operations in a candidate workspace, and persist bootstrap history in bootstrap-scoped ledgers.
Interfaces: Internal `bootstrapRun(manifest)`, `bootstrapResume(runId)`, `bootstrapStatus(runId)`, `requestNormalIngestion(runId)` entry points, invoked by repository-local `scripts/musubix5-bootstrap.mjs`.
Constraints: The launcher is excluded by the package `files` allow-list, verified absent by `pack:check` and `pack:smoke`, and never routes through `musubix5` argv parsing, completion, root help, command help, `help [command]`, or unknown-command/usage-error handling. Evidence and budget services are parameterized by an explicit store root; bootstrap always receives the bootstrap root; the normal evidence registry rejects bootstrap producer identity; no implicit invocation; no writes to normal approvals or mandatory evidence; no readiness, publish, tag, or push authority.
Requirements: REQ-M5-BOOTSTRAP-001 REQ-M5-BOOTSTRAP-002 REQ-M5-BOOTSTRAP-003 REQ-M5-BOOTSTRAP-004
ADRs: ADR-0004 ADR-0006
Depends-On: DES-M5-003 DES-M5-004 DES-M5-007 DES-M5-009 DES-M5-012

## DES-M5-014: Analysis adapters
Responsibilities: Provide compatible requirements/design validation, trace, graph, formal, mutation, correspondence, workflow, attestation, and knowledge operations.
Interfaces: Compatibility-preserving domain and analysis exports plus CLI handlers for each inventoried command.
Constraints: Formal results distinguish modeled pass, modeled fail, unsupported, and solver error; generated artifacts use the evidence registry and cannot mutate normative inputs; workflow CLI handlers delegate sanitization and reconciliation to DES-M5-018. In DES-M5-015 matrix mode, trace, graph, knowledge, formal, mutation, and correspondence intermediates are redirected to ignored scratch storage and never write tracked `.musubix/evidence/{trace,graph,knowledge}` or other tracked cache paths; only the closed generated-trace/gate-self-reference paths may differ after execution.
Requirements: REQ-M5-COMPAT-001 REQ-M5-COMPAT-003 REQ-M5-COMPAT-004 REQ-M5-COMPAT-013 REQ-M5-QUALITY-002 REQ-M5-QUALITY-003
ADRs: ADR-0002 ADR-0005 ADR-0007 ADR-0010
Depends-On: DES-M5-003 DES-M5-007 DES-M5-018

## DES-M5-015: Quality and readiness engine
Responsibilities: Run required commands and deterministic checks, classify every generation-bound evidence state, aggregate readiness, and expose compatible gate/status JSON.
Interfaces: `runGate(scope, persistenceMode?)`, `getStatus(scope)`, `refreshEvidence(scope)`, `candidateGateStatus(changeId, generation)`.
Constraints: Required commands cannot be empty; only the active generation contributes; no active generation or an active generation without terminal quality produces `CHANGE_GENERATION_INCOMPLETE`, gate exit 1, status exit 0, and `ready: false`, without blocking requirements/design approval; `CHANGE_GENERATION_REQUIREMENTS` is re-evaluated on every status/gate call; configuration cannot remove mandatory evidence kinds. Normal mode journals under CHANGE/order leases. Matrix mode is explicitly non-journaling, acquires no shared repository lease, writes its authoritative canonical result artifact outside the QA worktree, and keeps any informational caches in ignored scratch storage; only later DES-M5-019 control-worktree ingestion creates normal evidence. Release readiness reads candidate matrix records only through DES-M5-007 projections, preventing an ESM import cycle with DES-M5-019.
Requirements: REQ-M5-EVIDENCE-004 REQ-M5-LIFECYCLE-005 REQ-M5-QUALITY-001 REQ-M5-QUALITY-002 REQ-M5-QUALITY-003 REQ-M5-QUALITY-004 REQ-M5-QUALITY-005 REQ-M5-RELEASE-002
ADRs: ADR-0005 ADR-0007 ADR-0009 ADR-0010
Depends-On: DES-M5-005 DES-M5-007 DES-M5-011 DES-M5-014

## DES-M5-016: Release operation guard
Responsibilities: Separate release approval from publish, GitHub Release, tag, and push authorization; bind each external operation to an exact candidate, release approval, and release tag; and validate authorization without mutating the candidate tree.
Interfaces: `authorizeReleaseOperation(request)`, `validateReleaseOperationAuthorization(root, operationId, request, dependencies?)`, `executeReleaseOperation(authorization)`, `releaseOperationStatus(operationId)`; CLI `release-operation authorize <operation-id> --scope <scope> --candidate-commit <sha> --release-approval-sha256 <sha256> --release-tag <tag> --authorizer <name> --confirm --json`, `release-operation validate <operation-id> --scope <scope> --candidate-commit <sha> --release-tag <tag> --json`, and `release-operation status <operation-id> --json`.
Constraints: Release approval alone grants no external side effect; scope is the closed set `publish | release | tag | push`. New authorization records use schema version 2 and bind `schemaVersion`, `operationId`, `scope`, `candidateCommit` as exactly 40 lowercase hexadecimal characters, `releaseApprovalSha256`, `releaseTag`, and `authorizer` into `authorizationSha256`; schema-version-1 records remain readable for historical status but cannot authorize workflow side effects. Authorization is single-purpose, confirmed, candidate-bound, release-approval-bound, release-tag-bound, and auditable. CLI authorization and status return the record as JSON with exit zero; validation returns the validated record plus a distinct independently derived `verifiedReleaseApprovalSha256` with exit zero, or the stable `RELEASE_OPERATION_*` diagnostic with exit one. Read-only validation depends on DES-M5-012 snapshot resolution and intentionally wraps every non-current approval or snapshot failure, including canonical repository-identity mismatch or candidate unreachability, as `RELEASE_OPERATION_NOT_AUTHORIZED` before an external side effect. An identity-mismatch wrapper states the credential-free GitHub HTTPS origin precondition without including the acquired raw origin. The optional dependency seam is test-only; CLI and workflow entrypoints always construct and use the production DES-M5-006 approval and DES-M5-012 snapshot dependencies and expose no caller-controlled injection. Workflow attestation binding uses only `verifiedReleaseApprovalSha256`, never the record's unverified field. Workflow validation accepts only `status: authorized`; release-scope validation compares `candidateCommit` with the lightweight tag's `GITHUB_SHA`, while publish-scope validation compares it with the commit resolved from the named lightweight tag. CI uses the candidate-built read-only validation CLI and never calls the repository-mutating `executeReleaseOperation`; terminal outcomes are immutable run artifacts and job summaries. Operation-specific concurrency with `cancel-in-progress: false` and target-existence checks prevent duplicate package versions and GitHub Releases.
Requirements: REQ-M5-RELEASE-001 REQ-M5-RELEASE-002 REQ-M5-RELEASE-003 REQ-M5-RELEASE-004 REQ-M5-BOOTSTRAP-004
ADRs: ADR-0008 ADR-0010 ADR-0011
Depends-On: DES-M5-006 DES-M5-007 DES-M5-012 DES-M5-015 DES-M5-019

## DES-M5-017: Repository migration service
Responsibilities: Detect an existing musubix3 repository, preserve normative and user-owned files, classify legacy evidence, and orchestrate the documented regeneration sequence.
Interfaces: `planMigration(root)`, `applyMigration(plan)`, `migrationStatus(root)`.
Constraints: Migration never imports legacy generated evidence as current, never overwrites normative files without an explicit conflict result, and performs no publish, tag, or push.
Requirements: REQ-M5-COMPAT-010 REQ-M5-EVIDENCE-002 REQ-M5-WORKTREE-002
ADRs: ADR-0002 ADR-0005 ADR-0006
Depends-On: DES-M5-003 DES-M5-007 DES-M5-012 DES-M5-014

## DES-M5-018: Workflow transcript evidence service
Responsibilities: Sanitize strict and compatible Copilot transcripts, retain privacy-minimized source metadata, concatenate safe inputs deterministically, reject duplicate sources/events, and reconcile generation-bound declarations to per-Skill invocation cursors.
Interfaces: `sanitizeWorkflow(log, mode, limits): { rawSourceSha256, safeTranscriptSha256, sourceBytes, safeBytes, inputEvents, outputEvents, eligibleEvents, retainedEligibleEvents }`, `verifyWorkflow(safeLogs, mode, freshness)`, `bindDeclarations(changeId, generation, declarations, invocations, freshness)`, `validateStrictSource(source, strictVerification)`.
Constraints: Limits validate total bytes in `1..1000000000` and line bytes in `1..10000000`. Strict mode retains baseline terminal/session proof; compatible mode retains only lifecycle and Skill events, emits no value not derived from input, and never claims terminal proof. The JSON command result, not the safe transcript, carries digests/counts and requires retained eligible count to equal source eligible count; malformed input, size violations, duplicate sources/events, and missing strict proof emit the exact `WORKFLOW_SANITIZE_INVALID`, `WORKFLOW_TRANSCRIPT_SIZE`, `WORKFLOW_DUPLICATE_SOURCE`, `WORKFLOW_DUPLICATE_EVENT`, or `WORKFLOW_STRICT_SOURCE_MISSING` diagnostic. Release evidence requires a strict-sanitized source matched to a successful strict-verification record by raw SHA-256 and session identity. Safe inputs concatenate in CLI argument order. Declarations process in persisted array order; legacy unowned records resolve only to a sole owner or become foreign; each declaration uses Skill identity, phase-distinct declaration identity, and the lowest-positioned unused completed invocation within freshness/future/event-skew bounds; one cursor per Skill enforces same-Skill order, never crosses CHANGE/generation, and emits `WORKFLOW_DECLARATION_NONPASS`, `WORKFLOW_SKILL_NOT_INVOKED`, `WORKFLOW_INVOCATION_INCOMPLETE`, `WORKFLOW_INVOCATION_FAILED`, `WORKFLOW_INVOCATION_REUSED`, or `WORKFLOW_INVOCATION_ORDER`; superseded generations are informational.
Requirements: REQ-M5-COMPAT-001 REQ-M5-COMPAT-003 REQ-M5-COMPAT-013 REQ-M5-EVIDENCE-003 REQ-M5-EVIDENCE-006 REQ-M5-EVIDENCE-007 REQ-M5-LIFECYCLE-005
ADRs: ADR-0005 ADR-0010
Depends-On: DES-M5-003 DES-M5-004 DES-M5-005 DES-M5-007

## DES-M5-019: Candidate-bound matrix gate coordinator
Responsibilities: Derive `gate-input-fingerprint-v1` from candidate blobs, create isolated QA workspaces, run every musubix5 verification-matrix job, verify pre/post tracked trees, persist external candidate-bound gate records, and project release manifest bindings.
Interfaces: `fingerprintCandidateGate(changeId, generation, commit)`, `runCandidateMatrix(changeId, generation, commit)`, `emitJobResult(context): CandidateGateJobResult`, `ingestJobResults(changeId, generation, results)`, `validateCandidateGateSet(changeId, generation, commit)`, `releaseProjection(changeId, generation, commit)`.
Constraints: `matrix-job-identity-v1` is the closed design-approved set `ubuntu-node20`, `ubuntu-node22`, `ubuntu-node24`, `windows-node22`, and `macos-node22`, represented canonically as `{ "nodeMajor": 20|22|24, "os": "ubuntu"|"windows"|"macos" }`. Fingerprint inputs come only from candidate blobs and the DES-M5-003 canonical persisted repository identity; its `config` member is exactly the derived canonical object and SHA-256 specified above, excluding only display fields `language` and `qualityProfile`, and runtime identity is bound job-result data but not fingerprint input. Matrix runners receive the candidate commit through a clean checkout on their native runner, independently derive their checkout identity through DES-M5-003 `canonicalRepositoryIdentity`, require it to equal the supplied persisted identity before gate execution, invoke DES-M5-015 matrix mode, emit self-contained canonical artifacts bound to repository, CHANGE, generation, candidate, fingerprint, producer, job identity, command results, and pre/post tree checks, and write no tracked QA path except the closed gate output allow-list. A runner-side or ingestion-side canonical repository-identity mismatch emits `RELEASE_GATE_CANDIDATE_MISMATCH`, states the credential-free GitHub HTTPS precondition, and never emits the raw origin. Each artifact is transported as an opaque CI artifact inside a GitHub OIDC strict attestation envelope verified by DES-M5-014 against the candidate-gate transport policy above; ingestion rejects an untrusted producer, altered payload digest, or mismatched repository/candidate/job identity before interpreting self-declared result fields. Envelope identity is repository, candidate, fingerprint, job identity, CI provider/run ID, and payload digest; resubmitting the identical envelope is idempotent and cannot append a new record, while conflicting reuse of the same CI provider/run ID is stale evidence reported as `RELEASE_GATE_EVIDENCE_STALE`. One control-worktree ingestion holds the CHANGE/order leases, validates every artifact, derives its canonical artifact digest, and appends with idempotency key `change:<id>:g<N>:gate:<candidate>:<fingerprint>:<jobId>:<artifactDigest>`; byte-identical retry artifacts are idempotent while a changed terminal result appends history, and the greatest ordered record per job is authoritative only if current and pass. All five jobs must be present and pass. External records are normal generation-bound evidence stored in the control worktree outside the candidate tree; in-tree gate outputs are informational. Candidate-gate schema marks repository/change/generation/candidate/fingerprint/producer/job identity, command digests/status, tree-check results, CI provider/run ID, attestation payload digest, and artifact digest as bound; human-readable timestamps and durations are display-only. Missing, stale, wrong-candidate, wrong-fingerprint, duplicate-job within one ingestion set, or tree-mismatch records fail with the registered `RELEASE_GATE_EVIDENCE_MISSING`, `RELEASE_GATE_EVIDENCE_STALE`, `RELEASE_GATE_CANDIDATE_MISMATCH`, or `RELEASE_CANDIDATE_TREE_MISMATCH`.
Requirements: REQ-M5-APPROVAL-007 REQ-M5-COMPAT-013 REQ-M5-EVIDENCE-003 REQ-M5-EVIDENCE-004 REQ-M5-LIFECYCLE-005 REQ-M5-QUALITY-001 REQ-M5-QUALITY-003 REQ-M5-RELEASE-002
ADRs: ADR-0006 ADR-0008 ADR-0010
Depends-On: DES-M5-003 DES-M5-004 DES-M5-005 DES-M5-007 DES-M5-012 DES-M5-014 DES-M5-015

## DES-M5-020: Candidate-bound release workflow coordinator
Responsibilities: Validate release event identity, version consistency, candidate/evidence ancestry, current release approval, and release authorization; produce a sealed release bundle; and create the GitHub Release without publishing npm.
Interfaces: `.github/workflows/release.yml`, `releaseTransportPolicy()`, `validateReleaseVersions(root, releaseTag)`, `readReleaseDocumentation(root)`, `validateReleaseDocumentation(documents, expectedVersion)`, `validateReleaseContext(value)`, `releaseContextBytes(context)`, `releaseContextDigest(context)`, `releaseBundleDigest(checksumsSha256)`, `classifyReleaseTargetLookup(input: { exact: { exitCode: number; statusCode?: number; release?: { tagName: string; draft: boolean; prerelease: boolean } }; enumeration?: { complete: boolean; releases: Array<{ tagName: string; draft: boolean; prerelease: boolean }> } }): "absent" | "present-stable" | "present-draft-or-prerelease" | "lookup-failed"`, `validateReleaseAttestationIdentity(contextInput, attestation, releaseContextSha256, releaseBundleSha256)`, `validateReleaseOperationAuthorization(root, operationId, request, dependencies?)`, `resolveCandidateSnapshot(root, requestedChangeId?)`.
Constraints: Only lightweight release tags are accepted; annotated tags fail before artifact production with `RELEASE_TAG_CANDIDATE_MISMATCH` and an annotated-tag-specific message, making `GITHUB_SHA` the exact candidate commit and strict-OIDC commit claim. A pushed `v*` tag runs validation and bundle production only. Manual dispatch runs only from the same lightweight tag named by `release_tag`, accepts `evidence_commit` only as a full SHA, requires one `release_operation_id`, and has no npm publication input or job. The selected authorization must have `status: authorized`, scope exactly `release`, and matching candidate, tag, and independently derived approval digest; any mismatch emits `RELEASE_OPERATION_NOT_AUTHORIZED`. It uses a full-history checkout, obtains the default branch from `github.event.repository.default_branch`, fetches tags and `origin/<default>` before candidate-snapshot resolution, verifies that the tagged candidate is an ancestor of `origin/<default>`, and verifies that the evidence commit is a descendant of the tagged candidate and reachable from `origin/<default>`; squash or rebase integration that changes the candidate identity is rejected. Post-candidate evidence is read from a separate checkout by the tagged candidate's built CLI without mutating the tagged candidate workspace. Candidate snapshot resolution verifies the DES-M5-003 canonical repository identity, exact persisted commit existence, and reachability through at least one fetched repository ref; authorization validity does not depend on retaining or creating a same-named local or remote-tracking candidate branch. Direct snapshot consumers retain `APPROVAL_CANDIDATE_UNAVAILABLE`, while the DES-M5-016 external-operation guard wraps any non-current approval or snapshot result as `RELEASE_OPERATION_NOT_AUTHORIZED`. The CLI independently obtains the current release-approval SHA-256 through DES-M5-006, compares it with the release authorization record, returns `verifiedReleaseApprovalSha256` for attestation binding, and rejects self-reported or stale approval hashes with `RELEASE_OPERATION_NOT_AUTHORIZED`. Version validation covers every `version` value in `package.json`, `packages/*/package.json`, `plugin.json`, and both the catalog and plugin entries in `.github/plugin/marketplace.json`. It also reads the three release documents as strict UTF-8, applies the REQ-M5-RELEASE-003 newline, NFC, locator, heading, and transient-qualifier rules through one shared pure validator, and fails with `RELEASE_VERSION_MISMATCH` before artifact production. README title and locator scans deliberately inspect all normalized lines, including fenced code blocks; the exact-title uniqueness rule therefore fails closed if a fenced example duplicates `# musubix5`. CHANGELOG fencing toggles only on lines beginning with three backticks, ignores tilde and indented fences, and treats an unterminated fence as `RELEASE_VERSION_MISMATCH`; the table-driven source and tarball cases include that failure. The validation job requires typecheck, build, full tests, compatibility tests, package checks, and package smoke tests to exit zero; the package-content check requires `README.md`, `README-ja.md`, and `CHANGELOG.md`; formal classification is advisory. Each workflow run produces and verifies its own run-scoped bundle; a tag-push bundle is validation evidence only and is never consumed by a later dispatch. Bundle production uses `ubuntu-24.04` and exact npm 11.5.1, performs two complete clean checkout, install, build, and pack cycles, and fails with `RELEASE_PACKAGE_DIGEST_MISMATCH` unless their tarballs are byte-identical. It creates the npm tarball, CycloneDX SBOM, canonical `release-context.json`, and `SHA256SUMS` covering all three files, then signs a GitHub-OIDC-authorized ephemeral Ed25519 attestation. In both modes, the `repository` member is exactly the DES-M5-003 canonical `repository:<sha256>` digest. In `mode: tag-push`, `release-context.json` contains only mode, repository, candidate, workflow, and tag; evidence-commit and release-approval members are omitted rather than serialized as null or empty strings. In `mode: dispatch`, it additionally contains the release evidence commit and independently derived release-approval SHA-256. The bundle-verification path derives expected mode from its trigger gate and independently derives repository, workflow, candidate, and tag; tag-push expected context omits dispatch-only members, while dispatch expected context includes verified evidence and approval members. Both modes strict-decode and parse the sealed context, validate its schema, and require the exact on-disk bytes to equal `releaseContextBytes(expected)`. The GitHub Release side-effect job is dispatch-only, checks out the tagged candidate, and repeats that verification using the DES-M5-003 canonical repository identity derived from the candidate checkout, the fixed workflow policy, lightweight tag, and verified authorization path without consulting the sealed context for expected values. Decode, parse, schema, and canonical-byte mismatch each emit `RELEASE_ATTESTATION_INVALID` with a stable stage-specific reason before a side effect. The canonical-byte comparison is the complete equality decision; it must not be followed by `JSON.stringify` or any other property-order-, whitespace-, or non-canonical-serialization-sensitive comparison. Behavioral regression coverage constructs expected context in non-sorted property insertion order and accepts it when `releaseContextBytes(expected)` equals the sealed bytes. A structural assertion scoped to the named `Verify checksums, attestation, authorization, and target` step requires the byte comparison and forbids direct `JSON.stringify(context)` or `JSON.stringify(expected)` equality checks in that step. Canonical serialization omits absent members, and its digest is the equality-checked `releaseContext` evidence head, while the checksum-file digest is the `releaseBundle` evidence head. The attestation directly binds mode, repository, candidate commit, workflow identity, tag, release evidence commit, and release-approval SHA-256 in its expected identity and binds the canonical context and checksum digests through `evidenceHeads`; DES-M5-021 verifies both the direct identity and digest-linked context. Release transport fixes workflow identity to `.github/workflows/release.yml`, maximum age to 2592000 seconds, and future skew to 60 seconds. Before every Release CLI/API operation, the side-effect job derives DES-M5-003 canonical identity from `https://github.com/$GITHUB_REPOSITORY` and requires equality with the identity derived from the candidate checkout; mismatch emits `RELEASE_OPERATION_NOT_AUTHORIZED`. Every operation explicitly addresses that verified repository and never infers it from the process directory or an ambient checkout. The exact-tag lookup uses `gh api --include` so its HTTP status is captured in stdout separately from diagnostics. Draft-inclusive enumeration uses a separate `gh api --paginate --slurp` invocation whose successful exit and complete JSON array-of-pages parse establish completeness without mixing repeated header blocks into JSON. `classifyReleaseTargetLookup` returns a neutral outcome: exact-tag 200 with a valid body returns `present-stable` or `present-draft-or-prerelease`; exact-tag 404 returns `absent` when enumeration is omitted; exact-tag 404 with enumeration returns `absent` only when `complete` is true and no release has the requested `tagName`; any exact or enumerated matching tag returns the corresponding present outcome; all other statuses, incomplete pagination, malformed headers or JSON, authentication, permission, network, or repository-resolution failures return `lookup-failed`. The release-creation caller must always supply enumeration and must reject an enumeration-free `absent` result rather than treating it as creation authority. The release workflow maps both present outcomes to `RELEASE_OPERATION_NOT_AUTHORIZED`, `lookup-failed` or missing enumeration to `RELEASE_TARGET_LOOKUP_FAILED`, and only an enumeration-backed `absent` to creation. Release creation and its asset uploads also pass the verified repository explicitly, use operation-specific non-cancelling concurrency, and emit a run-scoped terminal outcome artifact and job summary. Validation jobs receive `contents: read`; only the bundle attestation job additionally receives `id-token: write`; the GitHub Release job receives only `contents: write`.
Generation 13 verification refinement: The tag-push bundle step derives expected mode `tag-push`, repository, workflow, candidate, and tag independently, omits dispatch-only members, re-reads its written context, and applies the same strict decode, parse, schema, and canonical-byte comparison before upload. Decode, parse, schema, and canonical-byte mismatch use stable reason tokens `context-decode`, `context-parse`, `context-schema`, and `context-canonical-bytes`, respectively, under `RELEASE_ATTESTATION_INVALID`. The attestation identity always binds mode, repository, candidate commit, workflow identity, and tag; only `dispatch` binds release evidence commit and release-approval SHA-256, and `tag-push` omits those members. Structural regression assertions scope their inspection to the named `Build reproducible package and release context` and `Verify checksums, attestation, authorization, and target` steps, require canonical `releaseContextBytes` production or comparison, and forbid direct `JSON.stringify(context)` or `JSON.stringify(expected)` equality checks in either step.
Generation 15 repository-targeting refinement: Structural regression assertions scope their inspection to the Release target lookup and creation/upload commands, require the canonical event-repository equality guard in the same side-effect step, require each GitHub Release CLI/API invocation to identify the verified event repository explicitly through `--repo "$GITHUB_REPOSITORY"` or the exact `repos/$GITHUB_REPOSITORY/...` API path, and forbid bare repository-inferred `gh release` invocations. The target lookup assertion additionally requires separate `gh api --include` exact lookup and `gh api --paginate --slurp` draft-inclusive enumeration, requires the parsed enumeration object to be passed into the pure neutral classifier before creation, requires complete pagination and machine-readable HTTP-status classification, and forbids human-readable stderr matching as evidence of authoritative absence. Behavioral coverage exercises exact-tag 200 stable, exact-tag 200 prerelease, 404 plus no draft match, 404 plus draft match, enumeration-free 404 blocked from creation, non-404 failure, incomplete pagination, and malformed status/JSON.
Requirements: REQ-M5-RELEASE-001 REQ-M5-RELEASE-003
ADRs: ADR-0008 ADR-0010 ADR-0011
Depends-On: DES-M5-003 DES-M5-006 DES-M5-012 DES-M5-014 DES-M5-015 DES-M5-016 DES-M5-019

## DES-M5-021: Immutable GitHub Release npm publisher
Responsibilities: Authenticate an explicitly authorized npm publication, download and validate one stable GitHub Release, re-establish its candidate and approval bindings, and publish its exact package tarball without rebuilding or repacking.
Interfaces: `.github/workflows/npm-publish.yml`, `npmPublishTransportPolicy()` fixing npm 11.6.0, six attempts, 15-second query timeout, 2-second kill allowance, and 240-second outer deadline, DES-M5-020 `releaseTransportPolicy()` as the single source for the release-workflow identity verified by the publisher, DES-M5-020 `classifyReleaseTargetLookup(input)`, `validateReleaseAssetManifest(releaseTag, assetNames, checksums)`, `validateReleaseContext(value)`, `releaseContextBytes(context)`, `validateReleaseAttestationIdentity(contextInput, attestation, releaseContextSha256, releaseBundleSha256)`, `extractPackagedReleasePackage(tarball)`, compatibility projection `extractPackagedVersion(tarball)`, `validateReleaseDocumentation(documents, expectedVersion)`, `computeTarballIntegrity(tarball)`, `classifyNpmRegistryQuery(exitCode, stdout)`, `validateReleaseOperationAuthorization(root, operationId, request, dependencies?)`, `resolveCandidateSnapshot(root, requestedChangeId?)`, `npm view <package>@<version> version|dist.integrity --json`.
Constraints: The workflow runs only by `workflow_dispatch` with `release_tag`, full-SHA `evidence_commit`, and `publish_operation_id`. It checks out the tagged candidate and `evidence_commit` separately with complete history, fetches tags and `origin/<default_branch>` from `github.event.repository.default_branch`, requires `git cat-file -t refs/tags/<release_tag>` to equal `commit`, and resolves that lightweight tag to the exact candidate. Annotated or absent tags fail with `RELEASE_TAG_CANDIDATE_MISMATCH`. Before interpreting evidence, it requires `git merge-base --is-ancestor <candidate> <evidence_commit>` and `git merge-base --is-ancestor <evidence_commit> origin/<default_branch>`; candidate ancestry failure emits `RELEASE_TAG_CANDIDATE_MISMATCH`, and default-branch reachability failure emits `RELEASE_OPERATION_NOT_AUTHORIZED`. Candidate snapshot resolution verifies the DES-M5-003 canonical repository identity, exact persisted commit existence, and reachability through at least one fetched repository ref without requiring a same-named local or remote-tracking candidate branch. Direct snapshot consumers retain `APPROVAL_CANDIDATE_UNAVAILABLE`, while DES-M5-016 wraps any non-current approval or snapshot result as `RELEASE_OPERATION_NOT_AUTHORIZED`. The tagged candidate's built CLI, never code built from the mutable evidence commit, independently validates the approval and authorization against the separate evidence checkout.

The workflow requires a non-draft, non-prerelease GitHub Release for the tag. Before lookup it derives DES-M5-003 canonical identity from the tagged candidate checkout and from `https://github.com/$GITHUB_REPOSITORY`, requires equality, and emits `RELEASE_OPERATION_NOT_AUTHORIZED` on mismatch. Every Release CLI/API operation explicitly addresses that verified event repository and never infers it from the workflow process directory or an ambient checkout. Stable-release lookup uses `gh api --include` for the exact Releases-by-tag path and reuses DES-M5-020 `classifyReleaseTargetLookup` without enumeration input: `absent` maps to `RELEASE_TAG_CANDIDATE_MISMATCH`, `present-draft-or-prerelease` maps to the same diagnostic, `present-stable` permits asset download, and `lookup-failed` maps to `RELEASE_TARGET_LOOKUP_FAILED`. It downloads all assets through authenticated `gh release download --repo "$GITHUB_REPOSITORY"`; download failure emits `RELEASE_TARGET_LOOKUP_FAILED` before npm token use. The expected assets include exactly one `musubix5-<version>.tgz`, `SHA256SUMS`, the SBOM, canonical `release-context.json`, and the release attestation. `sha256sum --check` must pass and the tarball, SBOM, and release context must be listed in `SHA256SUMS`, otherwise validation emits `RELEASE_ARTIFACT_CHECKSUM_MISMATCH`. The publisher validates the downloaded context schema and canonical exact-byte encoding, then establishes context identity through the attested canonical-context digest over those exact downloaded bytes plus the independently derived mode, repository, workflow, candidate, tag, evidence, and approval bindings; no property-order-sensitive comparison of parsed context is permitted. The attestation is verified using the closed DES-M5-020 release transport policy and must bind mode `dispatch`, the locally derived DES-M5-003 canonical repository digest of the publish checkout, `.github/workflows/release.yml`, tagged candidate, tag, the release evidence commit from `release-context.json`, independently derived release-approval SHA-256, canonical release-context digest, and checksum digest before any tarball decompression or tar entry parsing. The workflow creates a third read-only detached worktree from fetched history at the attested release evidence commit and uses the tagged candidate's CLI to derive its release-approval digest. The release evidence commit must be an ancestor of the current publish `evidence_commit`, and the release-approval digest independently derived from both commits must be identical; this permits a later publish authorization commit without changing the attested Release identity. Absent, stale, untrusted, or mismatched trust emits `RELEASE_ATTESTATION_INVALID` before npm authentication, tarball decoding, or publication. After trust is established, one bounded extraction pass returns the package version and three release documents. Gzip expansion is capped at 64 MiB, each selected regular-file entry is capped at 8 MiB, and the parser rejects truncated archives, duplicate or missing targets, non-regular typeflags, links, directories, `./` aliases, and PAX/GNU renamed aliases of `package/package.json`, `package/README.md`, `package/README-ja.md`, and `package/CHANGELOG.md`. `extractPackagedVersion` is only a compatibility projection over that same complete extraction result, does not perform an independent scan, and intentionally inherits missing-document and archive-structure failures despite retaining its legacy name. Embedded-version, missing-document, extraction, or packaged-document validation failure emits `RELEASE_VERSION_MISMATCH` before token use. The three documents are strict-decoded and passed to the same DES-M5-020 pure validator with the tag-derived expected version. Publication must occur within the DES-M5-020 2592000-second attestation freshness window; expiry requires a new candidate and patch-version Release rather than weakening trust.
Generation 15 repository-targeting refinement: Structural regression assertions scope their inspection to the pre-lookup identity guard, stable-Release lookup, and authenticated asset-download steps; require equality between the candidate-derived and event-URL-derived canonical repository identities; require `gh api --include` with the exact `repos/$GITHUB_REPOSITORY/...` path for lookup and `--repo "$GITHUB_REPOSITORY"` for `gh release download`; and forbid bare repository-inferred `gh release` invocations. Behavioral coverage exercises 200 stable, 200 draft/prerelease, 404 absent, non-404 failure, and malformed status/JSON. The download assertion requires an explicit `RELEASE_TARGET_LOOKUP_FAILED` failure path before any npm-token step.

The authorization record selected by `publish_operation_id` must be current, `authorized`, scope `publish`, and match candidate, tag, and approval digest. After authorization and artifact validation but before any token-scoped step, `npm view musubix5@<version> version --json` must exit nonzero with stdout parsing to JSON whose `error.code` equals `E404`; stderr is retained only for diagnostics and is not mixed into the JSON parser. Exit zero means the version already exists and emits `RELEASE_OPERATION_NOT_AUTHORIZED`; any other exit or parse result emits `RELEASE_REGISTRY_QUERY_FAILED`. The job runs on `ubuntu-24.04` with exact npm 11.6.0 in protected environment `npm-publish`; this matches the musubix3 token/provenance transport and supplies the approved provenance behavior for exact-tarball publication. `NPM_TOKEN` is present only for `npm whoami`, `npm publish`, and registry verification. Publication runs from an empty temporary directory without `package.json` using `npm publish <absolute-tarball> --provenance --access public --ignore-scripts`. Concurrency key is `publish-<release_tag>` with `cancel-in-progress: false`.

Registry verification computes local SHA-512 SRI and performs six attempts, each with a 15-second query timeout and 2-second forced-termination allowance, separated by 5, 10, 15, 20, and 25 second sleeps, under a 240-second wall-clock deadline including process startup and workflow overhead. The 240-second bound leaves 63 seconds of margin beyond the 177-second timeout-plus-backoff maximum. A nonzero `npm view ... dist.integrity --json` result is classified as not-yet-visible only when stdout parses to JSON whose `error.code` equals `E404`; stderr remains separate, and any other nonzero or unparsable result is an unclassified registry failure. A not-yet-visible result is retried and recorded separately from a visible integrity mismatch. After publication, any unresolved not-yet-visible result, integrity mismatch, unclassified registry failure, or outer timeout is folded into `RELEASE_PUBLISH_INTEGRITY_MISMATCH` with `manualReconciliationRequired: true`; `RELEASE_REGISTRY_QUERY_FAILED` is reserved for the pre-token replay query. An always-running run-scoped JSON outcome artifact and job summary record `published`, `registryVisible`, `integrityMatched`, and `manualReconciliationRequired`; the final field is true whenever `published` is true and registry verification did not pass. Re-running publication is forbidden once the version exists; manual reconciliation uses the documented read-only `npm view musubix5@<version> dist.integrity --json` command and compares it with `computeTarballIntegrity` without executing a token-scoped publish step. The workflow grants only `contents: read` and `id-token: write`.
Generation 13 verification refinement: The publisher requires the exact downloaded bytes to equal `releaseContextBytes(validateReleaseContext(parse(downloadedBytes)))`, and the attested canonical-context digest to equal SHA-256 over those same exact bytes. It derives the canonical repository digest from the tagged candidate checkout. DES-M5-020 `releaseTransportPolicy()` is the sole source for the verified release-workflow identity; `npmPublishTransportPolicy()` supplies only npm/runtime/retry parameters.
Requirements: REQ-M5-RELEASE-001 REQ-M5-RELEASE-004
ADRs: ADR-0008 ADR-0010 ADR-0011
Depends-On: DES-M5-003 DES-M5-006 DES-M5-012 DES-M5-014 DES-M5-016 DES-M5-020

## Lifecycle transitions

| Current state | Event | Guard | Next state |
|---|---|---|---|
| completed-generation | impact reopen requested | prior generation has terminal quality; exact CHANGE requirement set | next-generation initialized |
| incomplete-generation | abandon confirmed | human authority; CHANGE lease held | no-active-generation |
| incomplete-generation | impact reopen requested | generation not abandoned and lacks terminal quality | rejected with `CHANGE_GENERATION_PHASE` |
| no-active-generation | impact reopen requested | exact CHANGE requirement set | next-generation initialized |
| no-active-generation | any other phase/evidence/approval operation | none | rejected with `CHANGE_GENERATION_PHASE` |
| initialized | requirements validated | validator pass | requirements-valid |
| requirements-valid | review completed | zero findings | requirements-review-clean |
| requirements-review-clean | exact hash approved | current manifest | requirements-approved |
| requirements-approved | design validated | design and ADR validation pass | design-valid |
| design-valid | review completed | zero findings | design-review-clean |
| design-review-clean | exact hash approved | current manifest | design-approved |
| design-approved | Red recorded | target test failed for expected reason | red-recorded |
| red-recorded | implementation recorded | same requirement batch and candidate lineage | implementation-recorded |
| implementation-recorded | Green recorded | target test passed | green-recorded |
| green-recorded | Refactor recorded | optional passing refactor evidence | refactored |
| green-recorded or refactored | integration completed | required integration commands pass | integrated |
| integrated | trace/formal evaluated | trace current; formal classified | trace-formal-complete |
| trace-formal-complete | quality completed | every mandatory check current and pass | quality-pass |
| quality-pass | candidate matrix gate completed | all five current candidate/fingerprint-matched jobs pass and pre/post tracked-tree checks are clean | candidate-gate-complete |
| candidate-gate-complete | release review completed | zero findings | release-review-clean |
| release-review-clean | exact hash approved | current release manifest; candidate gate remains current and complete | release-approved |
| any approved-or-later state | upstream head changed | dependency digest differs | stale |
| stale | revalidation completed | return only to the latest predecessor whose bound evidence remains current under DES-M5-007; a changed normative head invalidates its review-clean state | current predecessor state |

Any changed upstream normative head moves dependent states to stale rather than
deleting their history. State names are evaluated within the active generation;
superseded and abandoned generations remain reportable history and never
contribute current evidence.

## Verified-auto boundary states

| State | Durable action | Failure/next state |
|---|---|---|
| producer-output | assign output ordinal and manifest digest | schema-invalid or schema-valid |
| schema-valid | check duplicate rejected digest | duplicate-rejected-manifest or reserve-reviewer |
| reserve-reviewer | atomically reserve and bind pending invocation without incrementing attempt or nonce | budget-exhausted or reviewer-pending |
| reviewer-pending | invoke Reviewer once for idempotency key, record actual usage, then atomically increment attempt and nonce with the terminal result | accepted, repairable, or rejected-terminal; overrun is an attached usage classification |
| repairable | check repair limit | repair-limit-exceeded or reserve-repair |
| reserve-repair | atomically reserve and bind pending repair without incrementing repair count | budget-exhausted or repair-pending |
| repair-pending | invoke Planner with findings, record actual usage, then atomically increment repair count with the terminal result | producer-output; overrun is an attached usage classification |

## Persistence layout

```text
.git/musubix5/
  control-root
  leases/
  scratch/
.musubix/
  journal/
    normal/
    bootstrap/
  runs/
  evidence/
    approvals/
      native/
    bootstrap/
    changes.json
    order.json
    tdd.json
    workflow.json
    formal.json
    mutation.json
    model-correspondence.json
    knowledge/
    trace/
    graph/
    quality.json
    performance.json
    native/
      test/
    release/
      gates/
    benchmarks/
    waivers/
    budgets/
```

Each journal record contains:

```text
schemaVersion, recordId, kind, changeId, repositoryId, candidateId,
producer, inputDigest, status, order, previousRecordHash, payload, recordHash
```

The normal journal is one repository-global tracked hash chain serialized by
the global order lease. Bootstrap has a separate tracked chain. A fresh clone
verifies each chain and seeds its order floor from the greatest valid committed
order. Compatibility JSON files under `.musubix/evidence` and feature-local
`trace.json` are rebuildable projections of the normal journal or deterministic
analysis inputs. Missing or corrupt journal history is `journal-unavailable`
and cannot be replaced by a projection.

DES-M5-006 owns compatibility and native approval projections under
`.musubix/evidence/approvals/`. DES-M5-010 owns run-local diagnostics under
`.musubix/runs/`. DES-M5-015 owns gate-regenerated `quality.json`,
`performance.json`, and `.musubix/evidence/native/<command-name>/`; benchmark execution
records remain separately owned under `.musubix/evidence/benchmarks/`.
DES-M5-014 owns feature-local `.musubix/features/*/trace.json` projections.
DES-M5-018 owns privacy-minimized workflow source metadata and the generation-
bound workflow projection. DES-M5-019 owns candidate-bound matrix gate journal
records and `.musubix/evidence/release/gates/` projections outside the candidate
snapshot.

DES-M5-004 owns `order.json` and journal projections, DES-M5-005 owns
`changes.json`, DES-M5-014 owns trace/graph/formal cache projections, and
DES-M5-018 owns `workflow.json`. Matrix runners never append the journal or
write `.musubix/evidence/release/gates/` in a QA workspace; only the designated
control worktree ingests those artifacts.

DES-M5-011 owns `tdd.json`; DES-M5-014 owns knowledge, mutation, and model-
correspondence projections; DES-M5-007 owns waivers; DES-M5-009 owns budgets;
and benchmark execution records under `benchmarks/` are owned jointly by
DES-M5-009 accounting and DES-M5-015 quality classification.

When any bootstrap run exists for a CHANGE, the normal orchestrator shall
ingest its summary before readiness evaluation by verifying the bootstrap
journal head and writing
`.musubix/evidence/bootstrap/<change-id>-attestation.json` under the normal
producer identity. Bootstrap never writes that record directly.

## Additive compatibility registry

| Surface | Addition | Compatibility behavior |
|---|---|---|
| gate/status JSON | `missing-command` diagnostic | Additive diagnostic; baseline `commands` check remains `skipped`, gate exits 1, status exits 0 with `ready: false` |
| approval manifest | canonical requirements-policy projection | Intentional extension governed by ADR-0008 |
| approval manifest | canonical execution-policy projection | Intentional extension governed by ADR-0008 |
| normative approval paths | `approval-normative-path-set-v1`: domain-scoped feature selection, non-transitive design `ADRs:` references, and required-path failures | Intentional extension governed by REQ-M5-COMPAT-013 and ADR-0008 |
| approval manifest | `approval-manifest-schema-v1`, domain binding, effective defaults, NFC path ordering, and displayed included/excluded hashes | Intentional extension governed by REQ-M5-COMPAT-013 and ADR-0008 |
| release manifest source | persisted immutable `release-candidate-tree-v1` commit instead of mutable worktree files | Intentional extension governed by REQ-M5-COMPAT-013 and ADR-0008 |
| release exclusions | `symlink`, `generated-trace`, `package-archive`, `log-directory`, `historical`, `run-local`, `release-self-reference`, `gate-self-reference`, and `foreign-change-evidence` in closed first-match order | Intentional extension governed by REQ-M5-COMPAT-013 and ADR-0008 |
| approval diagnostics | `APPROVAL_DOMAIN_MISMATCH`, `APPROVAL_NORMATIVE_MISSING`, `APPROVAL_NORMATIVE_SYMLINK`, `APPROVAL_CANDIDATE_UNAVAILABLE`, `APPROVAL_PATH_ENCODING`, `APPROVAL_PATH_COLLISION`, and `APPROVAL_GITLINK_UNSUPPORTED` | Intentional classified failure surface governed by REQ-M5-COMPAT-013 and ADR-0008 |
| lifecycle CLI/JSON | `--reopen`, `change generation`, `change generation abandon`, positive `generation`, null active generation, active/superseded/abandoned summaries, `change-generation-v1`, and `CHANGE_GENERATION_PHASE`, `CHANGE_GENERATION_REQUIREMENTS`, `CHANGE_GENERATION_DUPLICATE`, `CHANGE_GENERATION_MIXED`, `CHANGE_GENERATION_INCOMPLETE` | Intentional versioned-cycle extension governed by REQ-M5-LIFECYCLE-005 and ADR-0010 |
| workflow CLI/JSON | `workflow-sanitize --compatible`, per-source raw/safe digests and modes, per-Skill matching, `WORKFLOW_DECLARATION_NONPASS`, `WORKFLOW_SKILL_NOT_INVOKED`, `WORKFLOW_INVOCATION_INCOMPLETE`, `WORKFLOW_INVOCATION_FAILED`, `WORKFLOW_INVOCATION_REUSED`, `WORKFLOW_INVOCATION_ORDER`, `WORKFLOW_SANITIZE_INVALID`, `WORKFLOW_TRANSCRIPT_SIZE`, `WORKFLOW_DUPLICATE_SOURCE`, `WORKFLOW_DUPLICATE_EVENT`, and `WORKFLOW_STRICT_SOURCE_MISSING` | Intentional workflow extension governed by REQ-M5-EVIDENCE-006, REQ-M5-EVIDENCE-007, and ADR-0010 |
| release manifest projection | candidate `repositoryId`, `candidateCommit`, `gateInputFingerprint`, `gate-input-fingerprint-v1`, generation, and changed aggregate | Intentional candidate-bound release extension governed by REQ-M5-RELEASE-002 and ADR-0010 |
| candidate gate JSON | `matrix-job-identity-v1`, runtime identity, generation, candidate, fingerprint, tracked-tree checks, `RELEASE_GATE_EVIDENCE_MISSING`, `RELEASE_GATE_EVIDENCE_STALE`, `RELEASE_GATE_CANDIDATE_MISMATCH`, and `RELEASE_CANDIDATE_TREE_MISMATCH` | Intentional external gate evidence governed by REQ-M5-RELEASE-002 and ADR-0010 |
| release-operation CLI/JSON | `release-operation authorize\|validate\|status`, schema version 2, `candidateCommit`, `releaseTag`, `release` scope, and read-only workflow validation | Intentional candidate-bound release extension governed by REQ-M5-RELEASE-001 and ADR-0011 |
| release workflow diagnostics | `APPROVAL_CANDIDATE_UNAVAILABLE`, `RELEASE_TAG_CANDIDATE_MISMATCH`, `RELEASE_VERSION_MISMATCH`, `RELEASE_OPERATION_NOT_AUTHORIZED`, `RELEASE_TARGET_LOOKUP_FAILED`, pre-token `RELEASE_REGISTRY_QUERY_FAILED`, `RELEASE_PACKAGE_DIGEST_MISMATCH`, `RELEASE_ATTESTATION_INVALID`, `RELEASE_ARTIFACT_CHECKSUM_MISMATCH`, and post-hoc `RELEASE_PUBLISH_INTEGRITY_MISMATCH` | Intentional fail-closed release surface governed by REQ-M5-RELEASE-001, REQ-M5-RELEASE-003, REQ-M5-RELEASE-004, and ADR-0011 |
| release workflow | lightweight-tag validation, release-only dispatch, sealed bundle, and release-specific strict OIDC policy | Intentional release automation governed by REQ-M5-RELEASE-003 and ADR-0011 |
| npm publish workflow | manual token-authenticated publication of the exact attested GitHub Release tarball | Intentional release transport extension governed by REQ-M5-RELEASE-004 and ADR-0011 |
| configuration | `approvalAutomation` extension | Additive, design-approved configuration governed by ADR-0009 |
| configuration | top-level `candidateGate` transport extension and strict-attestation fields | Additive, design-approved key allow-list extension governed by REQ-M5-COMPAT-004, REQ-M5-COMPAT-013, and ADR-0010; generic `attestation` behavior is unchanged |

The empty-command baseline behavior fixture is
`docs/baseline/musubix3-v0.1.18-empty-commands.json`, SHA-256
`9d8e9b1ba94cafc0c8bc90fe5dfdcf9f99262b45687072b86f946b8a532ad32b`.

Release manifests are computed from an immutable candidate Git tree. The
release approval record is stored outside that tree, and generated C4 renderings
are review aids rather than normative design inputs.

## C4-like component relationships

The authoritative C4-like diagram is generated by `musubix5 design c4` from
the component `Depends-On` relationships above. A rendered copy may be stored
for review but is generated evidence, not a normative design input.
