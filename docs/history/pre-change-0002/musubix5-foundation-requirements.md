---
schemaVersion: 1
feature: musubix5-foundation
---
# musubix5 foundation requirements / musubix5 基盤要求

## REQ-MUSUBIX5-COMPAT-001: Preserve the musubix3 command surface
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall provide musubix3 v0.1.18 command names, subcommands, documented options, positional arguments, defaults, and aliases except for the intentionally changed executable name.
Acceptance: A generated compatibility matrix and executable contract tests compare every musubix3 v0.1.18 help entry with musubix5 and report no missing or incompatible command surface other than `musubix3` being replaced by `musubix5`.

## REQ-MUSUBIX5-COMPAT-002: Use the musubix5 executable name
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall publish only one npm executable named `musubix5`.
Acceptance: The packed package exposes exactly the `musubix5` binary, `musubix5 --help` identifies musubix5, invoking `musubix3` from the package is unavailable, and an ADR plus migration guide documents this intentional compatibility break.

## REQ-MUSUBIX5-COMPAT-003: Preserve exit-code semantics
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall map command outcomes to the equivalent musubix3 v0.1.18 exit-code classes.
Acceptance: Contract tests prove exit code 0 for success, 1 for validation or gate failure, and 2 for CLI usage or operational errors across representative commands.

## REQ-MUSUBIX5-COMPAT-004: Preserve machine-readable output contracts
Priority: must
Type: functional
Pattern: event-driven
Statement: When `--json` is requested for a musubix3-compatible command, the system shall return the compatible required fields, value types, and failure envelope without replacing a failure with a success-shaped result.
Acceptance: Golden contract tests compare normalized musubix3 v0.1.18 and musubix5 JSON for validation, trace, graph, approval, gate, status, and CLI-error cases, while documented additive musubix5 fields remain optional to compatibility consumers.

## REQ-MUSUBIX5-COMPAT-005: Preserve configuration compatibility
Priority: must
Type: functional
Pattern: state-driven
Statement: While a valid musubix3 schema-version-1 configuration is loaded, the system shall preserve its defaults and behavior unless an explicitly documented musubix5 extension is configured.
Acceptance: Fixtures covering omitted and explicit musubix3 configuration fields load with equivalent effective values, and every incompatible extension is rejected with a classified diagnostic or documented by ADR and migration guidance.

## REQ-MUSUBIX5-COMPAT-006: Preserve public library compatibility
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall provide compatible `./domain`, `./analysis`, and `./attestation` package exports for the musubix3 v0.1.18 public types and functions selected by the compatibility inventory.
Acceptance: Type-level and runtime contract tests import every inventoried export, compare representative results, and list any intentional incompatibility in the migration guide.

## REQ-MUSUBIX5-COMPAT-007: Preserve installation and packaging behavior
Priority: must
Type: functional
Pattern: event-driven
Statement: When the npm package is built and packed, the system shall include the executable, compiled exports, repository Skills, plugin metadata, documentation, changelog, and license required for an isolated installation.
Acceptance: `npm pack --dry-run`, archive inspection, and a temporary-project smoke test install the archive and successfully run `musubix5 --version`, `musubix5 --help`, and an initialized project command on every supported CI operating system.

## REQ-MUSUBIX5-LIFECYCLE-001: Enforce the protected lifecycle
Priority: must
Type: functional
Pattern: state-driven
Statement: While a CHANGE is active, the system shall permit its protected phases only in the order requirements, requirements approval, design, design approval, Red, implementation, Green, integration, trace or formal, quality, and release approval.
Acceptance: Every invalid phase transition is rejected with the expected predecessor and current state, and every valid transition persists a state record before a later protected phase can begin.

## REQ-MUSUBIX5-LIFECYCLE-002: Prove order with persisted monotonic values
Priority: must
Type: functional
Pattern: event-driven
Statement: When a lifecycle or evidence event is committed, the system shall persist a unique repository-assigned monotonically increasing order value.
Acceptance: Concurrent, clock-skewed, and resumed executions produce unique increasing order values; changing timestamps cannot make an invalid sequence valid.

## REQ-MUSUBIX5-LIFECYCLE-003: Resume without double consumption
Priority: must
Type: functional
Pattern: event-driven
Statement: When execution resumes after interruption, the system shall restore the pending invocation without duplicating any recorded resource consumption.
Acceptance: Crash-injection tests at every persistence boundary resume to the same terminal result and counters as an uninterrupted execution.

## REQ-MUSUBIX5-APPROVAL-001: Preserve manual exact-hash approval
Priority: must
Type: functional
Pattern: event-driven
Statement: When a human requests requirements, design, or release approval recording, the system shall accept it only with the approver, explicit confirmation, and exact SHA-256 of the current sorted artifact manifest.
Acceptance: Missing confirmation, an unknown approver, a stale hash, or changed manifest content records no approval; valid input records the reviewed paths, per-file hashes, manifest hash, stage, approver, and order.

## REQ-MUSUBIX5-APPROVAL-002: Keep public specifications immutable during a run
Priority: must
Type: functional
Pattern: state-driven
Statement: While an orchestrator run evaluates an approved public specification, the system shall restrict generated or repaired artifacts to a run-local workspace.
Acceptance: Producer repair changes only run-local artifacts, and any proposed normative specification change requires a new manifest and manual approval.

## REQ-MUSUBIX5-APPROVAL-003: Repair verified-auto producer findings
Priority: must
Type: functional
Pattern: event-driven
Statement: When a verified-auto requirements or design Reviewer returns repairable findings, the system shall return the structured findings to the producing Planner within the configured boundary repair limit instead of immediately returning `approval-blocked`.
Acceptance: Repairable findings trigger a bounded producer repair, non-repairable findings stop with a classified reason, and no verified-auto path creates or substitutes manual approval evidence.

## REQ-MUSUBIX5-APPROVAL-004: Make repair identity deterministic
Priority: must
Type: functional
Pattern: event-driven
Statement: When a producer repair is scheduled, the system shall derive its identity from the approval boundary key and rejected output ordinal.
Acceptance: Retrying or resuming the same rejected output reuses one repair identity, while a later distinct rejected ordinal receives a distinct identity.

## REQ-MUSUBIX5-APPROVAL-005: Detect duplicate rejected manifests
Priority: must
Type: functional
Pattern: event-driven
Statement: When a manifest digest has already been rejected for the same approval boundary and effective Reviewer policy, the system shall detect it without invoking the Reviewer again.
Acceptance: Re-submitting an identical rejected digest records a duplicate diagnostic, consumes no Reviewer budget or approval attempt, and returns the prior findings reference.

## REQ-MUSUBIX5-APPROVAL-006: Report repair exhaustion explicitly
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If the configured producer repair limit is exceeded at an approval boundary, then the system shall stop with terminal reason `repair-limit-exceeded` and preserve the rejected manifests and findings.
Acceptance: A limit of N permits exactly N repairs after the initial rejection, the next rejection terminates, and crash or resume does not alter the count.

## REQ-MUSUBIX5-BUDGET-001: Reserve Reviewer budget before attempts
Priority: must
Type: functional
Pattern: event-driven
Statement: When a Reviewer invocation is required, the system shall persist an accepted budget reservation before consuming an approval attempt or nonce.
Acceptance: A rejected reservation returns `budget-exhausted`, consumes no attempt or nonce, invokes no Reviewer, and remains idempotent on resume.

## REQ-MUSUBIX5-BUDGET-002: Reserve repair Planner budget before repairs
Priority: must
Type: functional
Pattern: event-driven
Statement: When a producer repair invocation is required, the system shall persist an accepted repair-Planner budget reservation before consuming a repair count.
Acceptance: A rejected reservation returns `budget-exhausted`, consumes no repair count, invokes no Planner, and remains idempotent on resume.

## REQ-MUSUBIX5-BUDGET-003: Record actual usage and overruns
Priority: must
Type: functional
Pattern: event-driven
Statement: When a budgeted role invocation terminates, the system shall persist one actual-usage record with any reservation overrun classified separately from approval findings.
Acceptance: Every started role invocation has one terminal usage record, an overrun produces a budget diagnostic and not a Reviewer finding, and missing usage prevents readiness.

## REQ-MUSUBIX5-EVIDENCE-001: Separate evidence kinds
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall store normative specification, generated trace or graph, TDD execution, workflow, approval, release, benchmark, and waiver information as distinct artifact kinds with independent schemas and freshness rules.
Acceptance: No evidence file is interpreted as more than one kind, normative files are never generated evidence, and gate output identifies missing, stale, invalid, skipped, unsupported, flaky, and waived evidence by kind.

## REQ-MUSUBIX5-EVIDENCE-002: Use only musubix5-generated evidence
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If evidence was produced by musubix3, musubix4, an unknown producer, or a different repository identity, then the system shall not count it as current musubix5 evidence.
Acceptance: Producer and repository identity mismatches are classified as incompatible evidence and cannot satisfy gate or release readiness.

## REQ-MUSUBIX5-EVIDENCE-003: Bind evidence to inputs and ownership
Priority: must
Type: functional
Pattern: event-driven
Statement: When evidence is recorded, the system shall bind it to its CHANGE owner, producer identity, canonical input digest, status, and monotonic order.
Acceptance: Mutating an input, producer version, repository identity, or owning CHANGE makes dependent evidence stale without modifying evidence owned by another CHANGE.

## REQ-MUSUBIX5-TDD-001: Record real requirement-scoped Red and Green
Priority: must
Type: functional
Pattern: event-driven
Statement: When TDD evidence is recorded for a requirement, the system shall require the configured runner to report the authoritative test ID as failing for Red and passing for Green.
Acceptance: Missing, skipped, unrelated, or incorrectly statused test results are rejected and cannot occupy canonical Red or Green order.

## REQ-MUSUBIX5-TDD-002: Isolate full-set and requirement batches
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall represent legacy full-set change batches and requirement-scoped batches with explicit non-overlapping scope identities.
Acceptance: Recording or importing a full-set batch cannot overwrite, shadow, or merge a requirement-scoped batch, and validation reports ambiguous legacy evidence instead of selecting it silently.

## REQ-MUSUBIX5-TDD-003: Select the latest complete cycle deterministically
Priority: must
Type: functional
Pattern: state-driven
Statement: While evaluating requirement coverage, the system shall select the highest monotonic-order complete Red, Implementation, and Green cycle for that requirement rather than the first matching batch.
Acceptance: Given multiple valid, invalid, incomplete, voided, and superseded cycles, repeated evaluation selects the same latest complete cycle and reports why later incomplete cycles are not current.

## REQ-MUSUBIX5-WORKTREE-001: Isolate change workspaces
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall isolate each CHANGE in distinct baseline, candidate, and QA workspaces using one branch or worktree per CHANGE.
Acceptance: A candidate run cannot modify baseline or QA state, QA validates the identified candidate snapshot, and evidence records workspace and commit identities.

## REQ-MUSUBIX5-WORKTREE-002: Preserve unrelated dirty files
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If a workspace contains user-owned dirty paths unrelated to the active CHANGE, then the system shall preserve those paths outside the candidate snapshot.
Acceptance: Byte, mode, staged, unstaged, deletion, and untracked fixtures remain unchanged across success, rejection, crash, recovery, and resume.

## REQ-MUSUBIX5-WORKTREE-003: Prevent cross-change evidence sharing
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If approval, TDD, quality, or generated evidence is owned by another CHANGE, then the system shall not use it to satisfy the active CHANGE.
Acceptance: Parallel CHANGE fixtures with identical requirement or test text retain distinct ownership and cannot satisfy each other's gates.

## REQ-MUSUBIX5-PLANNER-001: Validate structured Planner output
Priority: must
Type: functional
Pattern: event-driven
Statement: When a Planner returns structured priorities, requirements, or design output, the system shall accept only normalized output that conforms to the declared JSON schema.
Acceptance: Missing or invalid fields produce path-specific diagnostics naming the schema violation and retain safe references to the raw response and normalized result.

## REQ-MUSUBIX5-PLANNER-002: Separate role retries from producer repairs
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If Planner output fails transport, parsing, or schema validation, then the system shall apply only the configured role-output retry policy without consuming a producer repair.
Acceptance: Reviewer-requested semantic repairs and Planner-output retries have separate counters, identities, budgets, and terminal reasons.

## REQ-MUSUBIX5-PLANNER-003: Feed retry diagnostics back to the Planner
Priority: must
Type: functional
Pattern: event-driven
Statement: When a role-output retry is permitted, the system shall provide the prior validation diagnostics to the Planner.
Acceptance: Each retry input references the preceding invalid-output ordinal and includes its parse or schema failures without exposing configured secrets.

## REQ-MUSUBIX5-PLANNER-004: Stop repeated invalid output early
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If the Planner repeats the same invalid normalized output and validation failures, then the system shall stop before exhausting unrelated repair or approval budgets.
Acceptance: The repeated digest returns terminal reason `repeated-invalid-output`, records all attempted ordinals, and does not become `unrecoverable-failure`.

## REQ-MUSUBIX5-BOOTSTRAP-001: Separate bootstrap from normal orchestration
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall implement the bootstrap runner as an entry point and state store independent from the normal orchestrator approval state machine.
Acceptance: Bootstrap can start when normal orchestrator state is malformed or blocked, while normal commands never invoke bootstrap implicitly.

## REQ-MUSUBIX5-BOOTSTRAP-002: Require explicit bounded bootstrap authority
Priority: must
Type: functional
Pattern: event-driven
Statement: When bootstrap mode is requested, the system shall require an explicit manifest that limits target paths, operations, permissions, budget, iterations, and duration.
Acceptance: Missing or exceeded limits fail closed, out-of-scope operations are rejected before execution, and the effective authority manifest is persisted.

## REQ-MUSUBIX5-BOOTSTRAP-003: Persist bootstrap history and changes
Priority: must
Type: functional
Pattern: event-driven
Statement: When bootstrap performs an operation, the system shall append its invocation, inputs, outputs, usage, candidate digest, and resulting change set to durable bootstrap evidence.
Acceptance: Crash and resume preserve a single ordered history, and every bootstrap-created byte is attributable to one operation and candidate snapshot.

## REQ-MUSUBIX5-BOOTSTRAP-004: Forbid bootstrap release bypass
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If a release transition is requested from bootstrap mode, then the system shall reject it until the candidate passes the normal current quality gate and receives manual exact-hash release approval.
Acceptance: No bootstrap state, waiver, or role result can create release approval or mark readiness true by itself.

## REQ-MUSUBIX5-QUALITY-001: Report readiness only from current mandatory evidence
Priority: must
Type: functional
Pattern: state-driven
Statement: While release readiness is evaluated, the system shall return ready only when every mandatory evidence kind is current, valid, passing, and owned by the release CHANGE.
Acceptance: Missing, stale, failed, skipped, unsupported, flaky, waived, foreign, or superseded mandatory evidence makes readiness false with a classified diagnostic.

## REQ-MUSUBIX5-QUALITY-002: Limit formal claims
Priority: must
Type: functional
Pattern: event-driven
Statement: When formal checking cannot model a requirement within its declared abstraction, the system shall classify the requirement as unsupported without proof credit.
Acceptance: Formal output distinguishes modeled-pass, modeled-fail, unsupported, and solver-error states, and only modeled obligations contribute to modeled coverage.

## REQ-MUSUBIX5-QUALITY-003: Produce deterministic artifacts
Priority: must
Type: non-functional
Pattern: ubiquitous
Statement: The system shall produce identical canonical bytes and SHA-256 digests for identical normalized inputs, producer versions, and repository identities.
Acceptance: Repeated clean runs on supported operating systems produce identical normative manifests and normalized evidence digests, excluding explicitly non-normative display metadata.
