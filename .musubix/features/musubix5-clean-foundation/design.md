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
{"architecture":{"forbidCycles":true,"rules":[]},"attestation":{"githubOidc":{"mode":"off"},"maxAgeSeconds":3600,"maxFutureSkewSeconds":60,"mode":"local","trustedPublicKeys":[]},"codeGraph":{"mode":"compatible"},"commands":[{"args":["run","typecheck"],"command":"npm","name":"typecheck","required":true,"timeoutMs":120000},{"args":["run","build"],"command":"npm","name":"build","required":true,"timeoutMs":120000},{"adapter":"vitest","args":["vitest","run"],"command":"npx","name":"test","required":true,"timeoutMs":180000},{"args":["run","test:compat"],"command":"npm","name":"compatibility","required":true,"timeoutMs":180000},{"args":["run","pack:check"],"command":"npm","name":"pack-check","required":true,"timeoutMs":120000},{"args":["run","pack:smoke"],"command":"npm","name":"pack-smoke","required":true,"timeoutMs":180000}],"formal":{"minModeledFraction":0,"solver":"none","timeoutMs":12000},"mutation":{"mode":"compatible"},"requiredChecks":["requirements","design","constitution","trace","graph","commands"],"tdd":{"redPreflightCommands":[]},"thresholds":{"design":1,"implementation":1,"tests":1},"workflow":{"maxAgeSeconds":3600,"maxFutureSkewSeconds":60,"mode":"compatible"}}
```

SHA-256:
`ce8ea54dfa8aec62583e1097119c262e497ed66fe175e05830fc934e4dc51798`

`qualityProfile` is excluded because the projection contains every effective
policy field and the profile label has no independent enforcement effect.
`language` is display-only.

The musubix5-only orchestration extension is also design-approved. It is
disabled by default at both repairable boundaries but fixes positive limits
before verified-auto can be enabled:

```json
{"approvalAutomation":{"design":{"mode":"manual","producerRepairLimit":3,"repairPlannerBudgetUnits":1000,"reviewerBudgetUnits":1000},"release":{"mode":"manual"},"requirements":{"mode":"manual","producerRepairLimit":3,"repairPlannerBudgetUnits":1000,"reviewerBudgetUnits":1000}}}
```

SHA-256:
`d2b5761764ecc3cb7cf10f81ef77157efc56286c587d11048c55c2b78f1c13d9`

If `approvalAutomation` is absent, configuration normalization materializes
exactly the object above before hashing. The digest covers both modes and
limits. Enabling verified-auto changes the digest and therefore requires a new
design approval before execution; tests exercise enabled configurations through
explicit approved test manifests.

## DES-M5-001: Compatibility oracle adapter
Responsibilities: Build the pinned musubix3 v0.1.18 source, capture command contracts, execute the approved Node.js and operating-system matrix, normalize only approved package or executable tokens, and compare observable CLI, API, configuration, package, and filesystem behavior.
Interfaces: `BaselineOracle.acquire()`, `BaselineOracle.capture(invocation)`, `ContractComparator.compare(expected, actual)`.
Constraints: The pinned commit and fixture hashes are mandatory; `MUSUBIX3_Z3` and `MUSUBIX3_LEAN` are not renamed during normalization; mismatches are classified and cannot be silently accepted.
Requirements: REQ-M5-COMPAT-001 REQ-M5-COMPAT-002 REQ-M5-COMPAT-003 REQ-M5-COMPAT-004 REQ-M5-COMPAT-005 REQ-M5-COMPAT-008 REQ-M5-COMPAT-009 REQ-M5-COMPAT-011 REQ-M5-COMPAT-012
ADRs: ADR-0002 ADR-0007
Depends-On: DES-M5-003

## DES-M5-002: Public CLI and package facade
Responsibilities: Expose the `musubix5` executable, compatible command hierarchy, public library exports, package assets, and isolated-installation behavior.
Interfaces: `runCli(argv, environment)`, package exports `./domain`, `./analysis`, `./attestation`.
Constraints: Only the `musubix5` bin is published; every other intentional difference requires registered governance artifacts; command handlers return typed outcomes mapped centrally to exit codes.
Requirements: REQ-M5-COMPAT-001 REQ-M5-COMPAT-002 REQ-M5-COMPAT-003 REQ-M5-COMPAT-005 REQ-M5-COMPAT-006 REQ-M5-COMPAT-007 REQ-M5-COMPAT-013
ADRs: ADR-0002 ADR-0006 ADR-0007
Depends-On: DES-M5-003 DES-M5-005 DES-M5-006 DES-M5-008 DES-M5-011 DES-M5-013 DES-M5-014 DES-M5-015 DES-M5-016 DES-M5-017

## DES-M5-003: Canonical serialization and identity service
Responsibilities: Canonicalize typed records, hash bytes, derive repository and candidate identities, verify producer identity, and expose deterministic comparison helpers.
Interfaces: `canonicalBytes(value)`, `sha256(bytes)`, `identityForRepository()`, `identityForCandidate()`, `verifyBinding(record, context)`.
Constraints: Canonical bytes exclude schema-declared display metadata only; no caller may invent its own hashing or path normalization.
Requirements: REQ-M5-COMPAT-003 REQ-M5-EVIDENCE-002 REQ-M5-EVIDENCE-003 REQ-M5-EVIDENCE-005 REQ-M5-QUALITY-003
ADRs: ADR-0003 ADR-0005

## DES-M5-004: Ordered journal and lease service
Responsibilities: Allocate repository-wide order values, serialize stateful writers, maintain fencing tokens, verify journal chains, rebuild projections, diagnose corruption, and recover interrupted writes.
Interfaces: `withChangeLease(changeId, operation)`, `withOrderLease(operation)`, `allocateOrder()`, `append(record)`, `verifyJournal()`, `rebuildProjection(kind)`, `loadByIdempotencyKey(key)`, `reconcilePending()`.
Constraints: Authoritative normal and bootstrap journals are tracked under `.musubix/journal`; the repository common Git directory contains only shared leases, scratch files, and the control-worktree locator; stateful writes target the designated control worktree; a fresh clone verifies the tracked chain and seeds the next order from its maximum valid order; duplicate or divergent orders are a non-pass merge diagnostic; atomic directory creation provides lease acquisition; leases use a 30-second TTL and renew every 10 seconds; process-monotonic elapsed time drives renewal while persisted wall-clock deadlines are used only for liveness takeover and never chronology; every commit verifies the latest fencing token; writes use create-new temporary files and platform-safe atomic replacement without assuming directory fsync support on Windows.
Requirements: REQ-M5-LIFECYCLE-002 REQ-M5-LIFECYCLE-003 REQ-M5-LIFECYCLE-004 REQ-M5-EVIDENCE-005
ADRs: ADR-0003
Depends-On: DES-M5-003

## DES-M5-005: Lifecycle state machine
Responsibilities: Enforce predecessor rules, persist phase transitions, reject invalid transitions, and expose resumable CHANGE status.
Interfaces: `transition(changeId, requestedPhase, evidenceHeads)`, `status(changeId)`, `resume(invocationId)`.
Constraints: A transition commits only after validation and required evidence checks; optional Refactor occurs only after Green; unsupported formal obligations are classified without proof credit; stale states retain the last completed phase and a stale dependency set until re-entry validation succeeds.
Requirements: REQ-M5-LIFECYCLE-001 REQ-M5-LIFECYCLE-002 REQ-M5-LIFECYCLE-003 REQ-M5-QUALITY-002
ADRs: ADR-0003 ADR-0005
Depends-On: DES-M5-003 DES-M5-004 DES-M5-007

## DES-M5-006: Approval manifest service
Responsibilities: Resolve stage-owned normative paths and configuration projections, produce sorted manifests, record exact-hash approvals, and propagate supersession.
Interfaces: `prepareApproval(stage, domain?)`, `recordApproval(input)`, `validateApprovals()`, `supersedeFrom(change)`.
Constraints: Requirements, design, and release scopes follow REQ-M5-APPROVAL-007; manual confirmation is mandatory; bootstrap approvals authorize development only; native approval is required before release; release manifests read an immutable candidate Git tree and write the release approval outside that tree, preventing self-reference.
Requirements: REQ-M5-APPROVAL-001 REQ-M5-APPROVAL-002 REQ-M5-APPROVAL-007 REQ-M5-APPROVAL-008 REQ-M5-APPROVAL-009 REQ-M5-COMPAT-013
ADRs: ADR-0002 ADR-0004 ADR-0008
Depends-On: DES-M5-003 DES-M5-004 DES-M5-007

## DES-M5-007: Evidence registry
Responsibilities: Validate evidence schemas, ownership, producer and input bindings, dependency heads, currency, status taxonomy, and derived projections.
Interfaces: `appendEvidence(kind, record)`, `currentEvidence(query)`, `classifyCurrency(record, context)`, `project(kind)`.
Constraints: Normative specifications are never generated evidence; foreign, stale, skipped, unsupported, flaky, waived, failed, or superseded records do not become pass.
Requirements: REQ-M5-EVIDENCE-001 REQ-M5-EVIDENCE-002 REQ-M5-EVIDENCE-003 REQ-M5-EVIDENCE-004 REQ-M5-EVIDENCE-005 REQ-M5-WAIVER-001
ADRs: ADR-0003 ADR-0005
Depends-On: DES-M5-003 DES-M5-004

## DES-M5-008: Approval boundary coordinator
Responsibilities: Coordinate producer output, Reviewer execution, duplicate-manifest detection, bounded repair, durable attempt, nonce, and repair counters, terminal reasons, and manual-boundary handoff.
Interfaces: `evaluateBoundary(boundaryKey, manifest)`, `resumeBoundary(pendingId)`, `classifyFinding(finding)`.
Constraints: Verified-auto is explicit opt-in for requirements or design only; release remains manual; effective `approvalAutomation` configuration must hash to the design-approved extension digest or execution fails closed; repair identity is boundary key plus rejected ordinal; duplicate rejection and repair exhaustion terminate deterministically; counters increment only in the idempotent terminal commit for the bound pending invocation.
Requirements: REQ-M5-APPROVAL-003 REQ-M5-APPROVAL-004 REQ-M5-APPROVAL-005 REQ-M5-APPROVAL-006
ADRs: ADR-0004 ADR-0009
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
Interfaces: `recordRed(input)`, `recordImplementation(changeRecord)`, `recordGreen(input)`, `recordRefactor(input)`, `selectCurrentCycle(requirementId)`.
Constraints: Red and Green come from `tdd` commands; Implementation comes from the matching `change-record <change-id> implementation` checkpoint; all three bind one requirement batch and candidate lineage with strictly increasing order; Refactor follows current Green; legacy full-set and requirement batches never merge.
Requirements: REQ-M5-TDD-001 REQ-M5-TDD-002 REQ-M5-TDD-003 REQ-M5-TDD-004
ADRs: ADR-0005
Depends-On: DES-M5-003 DES-M5-004 DES-M5-007

## DES-M5-012: Workspace manager
Responsibilities: Create and identify baseline, candidate, and QA workspaces; preserve unrelated dirty paths; track generated-output ownership; and recover rejected candidates.
Interfaces: `captureBaseline()`, `createCandidate(changeId)`, `createQa(candidateId)`, `collectOwnedChanges(changeId)`, `recover(candidateId)`.
Constraints: Candidate work requires an immutable baseline commit; one CHANGE owns one branch or worktree; byte, mode, staged, unstaged, deleted, and untracked identities are preserved.
Requirements: REQ-M5-WORKTREE-001 REQ-M5-WORKTREE-002 REQ-M5-WORKTREE-003 REQ-M5-WORKTREE-004
ADRs: ADR-0006
Depends-On: DES-M5-003 DES-M5-004 DES-M5-007

## DES-M5-013: Bootstrap runner
Responsibilities: Start independently of normal orchestrator state, validate explicit authority, execute bounded operations in a candidate workspace, and persist bootstrap history in bootstrap-scoped ledgers.
Interfaces: `bootstrapRun(manifest)`, `bootstrapResume(runId)`, `bootstrapStatus(runId)`, `requestNormalIngestion(runId)`.
Constraints: Evidence and budget services are parameterized by an explicit store root; bootstrap always receives the bootstrap root; the normal evidence registry rejects bootstrap producer identity; no implicit invocation; no writes to normal approvals or mandatory evidence; no readiness, publish, tag, or push authority.
Requirements: REQ-M5-BOOTSTRAP-001 REQ-M5-BOOTSTRAP-002 REQ-M5-BOOTSTRAP-003 REQ-M5-BOOTSTRAP-004
ADRs: ADR-0004 ADR-0006
Depends-On: DES-M5-003 DES-M5-004 DES-M5-007 DES-M5-009 DES-M5-012

## DES-M5-014: Analysis adapters
Responsibilities: Provide compatible requirements/design validation, trace, graph, formal, mutation, correspondence, workflow, attestation, and knowledge operations.
Interfaces: Compatibility-preserving domain and analysis exports plus CLI handlers for each inventoried command.
Constraints: Formal results distinguish modeled pass, modeled fail, unsupported, and solver error; generated artifacts use the evidence registry and cannot mutate normative inputs.
Requirements: REQ-M5-COMPAT-001 REQ-M5-COMPAT-003 REQ-M5-COMPAT-004 REQ-M5-QUALITY-002 REQ-M5-QUALITY-003
ADRs: ADR-0002 ADR-0005 ADR-0007
Depends-On: DES-M5-003 DES-M5-007

## DES-M5-015: Quality and readiness engine
Responsibilities: Run required commands and deterministic checks, classify every evidence state, aggregate readiness, and expose compatible gate/status JSON.
Interfaces: `runGate(scope)`, `getStatus(scope)`, `refreshEvidence(scope)`.
Constraints: Required commands cannot be empty; `gate` returns exit 1 for non-pass while `status` preserves exit 0; configuration cannot remove mandatory evidence kinds.
Requirements: REQ-M5-EVIDENCE-004 REQ-M5-QUALITY-001 REQ-M5-QUALITY-002 REQ-M5-QUALITY-003 REQ-M5-QUALITY-004 REQ-M5-QUALITY-005
ADRs: ADR-0005 ADR-0007 ADR-0009
Depends-On: DES-M5-005 DES-M5-007 DES-M5-011 DES-M5-014

## DES-M5-016: Release operation guard
Responsibilities: Separate release approval from publish, tag, and push authorization and bind each external operation to an exact candidate.
Interfaces: `authorizeReleaseOperation(request)`, `executeReleaseOperation(authorization)`.
Constraints: Release approval alone grants no external side effect; authorization is single-purpose, confirmed, candidate-bound, and auditable.
Requirements: REQ-M5-RELEASE-001 REQ-M5-BOOTSTRAP-004
ADRs: ADR-0008
Depends-On: DES-M5-006 DES-M5-007 DES-M5-015

## DES-M5-017: Repository migration service
Responsibilities: Detect an existing musubix3 repository, preserve normative and user-owned files, classify legacy evidence, and orchestrate the documented regeneration sequence.
Interfaces: `planMigration(root)`, `applyMigration(plan)`, `migrationStatus(root)`.
Constraints: Migration never imports legacy generated evidence as current, never overwrites normative files without an explicit conflict result, and performs no publish, tag, or push.
Requirements: REQ-M5-COMPAT-010 REQ-M5-EVIDENCE-002 REQ-M5-WORKTREE-002
ADRs: ADR-0002 ADR-0005 ADR-0006
Depends-On: DES-M5-003 DES-M5-007 DES-M5-012 DES-M5-014

## Lifecycle transitions

| Current state | Event | Guard | Next state |
|---|---|---|---|
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
| quality-pass | release review completed | zero findings | release-review-clean |
| release-review-clean | exact hash approved | current release manifest | release-approved |
| any approved-or-later state | upstream head changed | dependency digest differs | stale |
| stale | revalidation completed | return only to the latest predecessor whose bound evidence remains current under DES-M5-007; a changed normative head invalidates its review-clean state | current predecessor state |

Any changed upstream normative head moves dependent states to stale rather than
deleting their history.

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
  evidence/
    approvals/
    bootstrap/
    changes.json
    order.json
    tdd/
    workflow.json
    formal.json
    mutation.json
    model-correspondence.json
    knowledge/
    trace/
    graph/
    quality.json
    release/
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
| release exclusions | history, run-local, and foreign-CHANGE paths | Intentional extension governed by ADR-0008 |
| configuration | `approvalAutomation` extension | Additive, design-approved configuration governed by ADR-0009 |
| CLI | `bootstrap run`, `bootstrap resume`, and `bootstrap status` | musubix5-only explicit mode governed by REQ-M5-BOOTSTRAP-001 and ADR-0006 |

The empty-command baseline behavior fixture is
`docs/baseline/musubix3-v0.1.18-empty-commands.json`, SHA-256
`9d8e9b1ba94cafc0c8bc90fe5dfdcf9f99262b45687072b86f946b8a532ad32b`.

Release manifests are computed from an immutable candidate Git tree. The
release approval record is stored outside that tree, and generated C4 renderings
are review aids rather than normative design inputs.

## C4-like component relationships

The authoritative C4-like diagram is generated by `musubix3 design c4` from
the component `Depends-On` relationships above. A rendered copy may be stored
for review but is generated evidence, not a normative design input.
