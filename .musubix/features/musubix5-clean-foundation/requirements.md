---
schemaVersion: 1
feature: musubix5-clean-foundation
status: approval-pending
---
# musubix5 clean foundation requirements

## REQ-M5-COMPAT-001: Preserve the command contract
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall provide the inventoried musubix3 v0.1.18 command names, subcommands, options, positional arguments, aliases, and defaults.
Acceptance: Differential contract tests normalize only executable and package-name tokens from `musubix3` to `musubix5`, preserve `MUSUBIX3_Z3` and `MUSUBIX3_LEAN` literals, report every inventoried baseline help entry, allow only help entries and per-entry option or text additions registered in the approved additive-help registry under REQ-M5-COMPAT-013, and treat every other help-text difference as an incompatibility.

## REQ-M5-COMPAT-002: Preserve exit semantics
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall return exit code 0 for success, 1 for validation or gate failure, and 2 for usage or operational failure for every command in the approved compatibility inventory.
Acceptance: Differential fixtures cover each outcome class and reject any command-specific mapping that differs from musubix3 v0.1.18.

## REQ-M5-COMPAT-003: Preserve JSON contracts
Priority: must
Type: functional
Pattern: event-driven
Statement: When a compatible command requests JSON output, the system shall return the required musubix3 v0.1.18 fields, value types, and failure envelope.
Acceptance: Golden tests compare normalized validation, trace, graph, approval, gate, status, and CLI-error results, and any additive field is listed before implementation in a requirements-approved acceptance clause or versioned specification inventory entry, which together form the additive-field registry.

## REQ-M5-COMPAT-004: Preserve configuration compatibility
Priority: must
Type: functional
Pattern: state-driven
Statement: While a valid musubix3 schema-version-1 configuration is loaded, the system shall preserve its effective defaults and compatible behavior.
Acceptance: Omitted-field and explicit-field fixtures produce equivalent effective configuration, and incompatible extensions return classified diagnostics.

## REQ-M5-COMPAT-005: Preserve public APIs and packaging
Priority: must
Type: functional
Pattern: event-driven
Statement: When the package is built and packed, the system shall provide the inventoried domain, analysis, and attestation exports and the required isolated-installation assets.
Acceptance: On the musubix5 verification matrix, type-level and runtime tests cover every inventoried export, `npm pack --dry-run` verifies the archive, and a temporary project runs `musubix5 --version`, `musubix5 --help`, and an initialized-project command.

## REQ-M5-COMPAT-006: Publish only the musubix5 executable
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall publish the npm package `musubix5` with one executable named `musubix5` and without a `musubix3` executable alias.
Acceptance: Archive and isolated-installation tests prove the package and bin names, and an ADR plus migration guide documents the intentional compatibility break.

## REQ-M5-COMPAT-007: Govern intentional incompatibilities
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If an implementation intentionally differs from an approved musubix3 v0.1.18 compatibility contract, then the system shall require a dedicated requirement, ADR, migration-guide entry, and regression test before implementation.
Acceptance: Compatibility-gate fixtures reject every unregistered difference and identify each missing governance artifact.

## REQ-M5-COMPAT-008: Approve a version-pinned compatibility inventory
Priority: must
Type: functional
Pattern: event-driven
Statement: When requirements approval is prepared, the system shall include a normative compatibility inventory bound to musubix3 tag `v0.1.18` and commit `c0b20f06727bceb04eeec181d95af9047b1981de`.
Acceptance: The approved requirements artifact contains the inventory of command, option, default, exit, JSON, configuration, API, packaging, and installation contracts and the SHA-256 of a verbatim CLI-help fixture, and validation returns a compatibility non-pass for a missing or mismatched fixture.

## REQ-M5-COMPAT-009: Use the pinned baseline as oracle
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If the normative inventory conflicts with observed musubix3 v0.1.18 behavior at the pinned commit, then the system shall treat the pinned baseline as authoritative and reopen requirements approval to correct the inventory.
Acceptance: A differential mismatch cannot be waived as an implementation detail, and correction invalidates downstream approval and evidence through the normal supersession cascade.

## REQ-M5-COMPAT-010: Support in-place repository migration
Priority: must
Type: functional
Pattern: event-driven
Statement: When musubix5 is initialized or upgraded in an existing musubix3 repository, the system shall preserve normative project files and classify prior generated evidence as incompatible until regenerated by musubix5.
Acceptance: Migration tests preserve user requirements, designs, ADRs, configuration, and source files, report foreign evidence without counting it as pass, and document the required regeneration order.

## REQ-M5-COMPAT-011: Preserve solver environment variables
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall continue to accept `MUSUBIX3_Z3` and `MUSUBIX3_LEAN` as solver executable environment variables.
Acceptance: Formal command tests resolve each legacy variable exactly as musubix3 v0.1.18, and any additional `MUSUBIX5_*` alias is documented as additive behavior and registered in the additive-help registry when it appears in help output.

## REQ-M5-COMPAT-012: Reproduce the baseline oracle
Priority: must
Type: functional
Pattern: event-driven
Statement: When compatibility fixtures are generated, the system shall build and execute musubix3 from the pinned source commit.
Acceptance: CI records the source identity, build command, invocation, exit code, stdout digest, stderr digest, JSON payload digest, and filesystem-effect digest for every differential fixture.

## REQ-M5-COMPAT-013: Govern intentional compatibility extensions
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall register the lifecycle, approval, workflow, and candidate-bound release additions defined by REQ-M5-LIFECYCLE-005, REQ-M5-APPROVAL-007, REQ-M5-EVIDENCE-006, REQ-M5-EVIDENCE-007, and REQ-M5-RELEASE-002 as intentional extensions to the pinned musubix3 contract.
Acceptance: ADRs, migration-guide entries, additive help and JSON-field registries, and regression tests cover configuration projections, versioned schemas, candidate-tree sourcing, exclusion predicates and reasons, matching semantics, sanitization modes, candidate-bound gate evidence, every added or changed diagnostic and displayed output, and changed aggregate hashes before implementation; unregistered differences remain compatibility failures.

## REQ-M5-LIFECYCLE-001: Enforce the protected lifecycle
Priority: must
Type: functional
Pattern: state-driven
Statement: While a CHANGE is active, the system shall permit protected phases only after their required predecessor phases are complete.
Acceptance: The state table covers requirements validation, requirements review, requirements approval, design validation, design review, design approval, Red, implementation, Green, optional Refactor, integration, trace, applicable formal classification, quality, release review, and release approval, and rejects every invalid transition.

## REQ-M5-LIFECYCLE-002: Prove order with persisted values
Priority: must
Type: functional
Pattern: event-driven
Statement: When a lifecycle or evidence transition is committed, the system shall atomically persist a unique repository-wide monotonically increasing order value.
Acceptance: Concurrent operations from the same or different CHANGEs, clock-skewed operations, and resumed operations produce unique increasing order values, and timestamp changes cannot validate an invalid sequence.

## REQ-M5-LIFECYCLE-003: Resume idempotently
Priority: must
Type: functional
Pattern: event-driven
Statement: When an interrupted execution resumes, the system shall complete or reuse its pending invocation without duplicating persisted consumption.
Acceptance: Crash injection at each persistence boundary produces the same terminal result, attempt count, repair count, nonce count, budget usage, and order records as uninterrupted execution.

## REQ-M5-LIFECYCLE-004: Serialize CHANGE writers
Priority: must
Type: functional
Pattern: event-driven
Statement: When a process starts a stateful operation for a CHANGE, the system shall acquire a durable exclusive lease for that CHANGE before reserving or consuming state.
Acceptance: Concurrent-process tests permit one writer, reject or safely wait other writers, recover expired leases with a fencing token, reject writes from an expired holder, and never duplicate attempts, repairs, nonces, budget, or order records.

## REQ-M5-LIFECYCLE-005: Reopen a superseded CHANGE phase cycle
Priority: must
Type: functional
Pattern: event-driven
Statement: When approved requirements or downstream evidence for an active CHANGE becomes stale, the system shall permit a new versioned lifecycle cycle without altering the completed historical cycle.
Acceptance: Generation-less historical records are interpreted as generation 1 without rewriting them, while all newly written generations including generation 1 use qualified keys; while holding the REQ-M5-LIFECYCLE-004 CHANGE lease, `change-record <change-id> impact --reopen` atomically creates or idempotently resumes the next positive integer generation when the prior active generation has terminal full-set `quality` or was explicitly abandoned by `change generation abandon <change-id> --reason <text> --approver <name> --confirm`; abandon preserves the incomplete generation as non-current history, leaves the CHANGE with no active generation until reopen, rejects every phase operation other than `change-record <change-id> impact --reopen`, every TDD or evidence operation, and every approval prepare, record, or validate operation with exit code 1 and `CHANGE_GENERATION_PHASE`, and cannot make any check pass; during that interval gate and status report a null active generation plus the abandoned generation, gate exits 1, status exits 0, and `ready` is false; reopen resolves its requirement set from supplied `--requirement <ids...>` or, when omitted, from the current CHANGE document `Requirements:` set, and the resolved set must exactly equal that document; the set is revalidated at every later phase, and `CHANGE_GENERATION_REQUIREMENTS` makes gate exit 1 and status exit 0 with `ready` false; the active generation is otherwise the greatest non-abandoned generation, superseded or abandoned generations never satisfy current evidence, and an active generation without terminal `quality` makes release-stage approval preparation or recording and release readiness non-pass with `CHANGE_GENERATION_INCOMPLETE`, while requirements and design approval for that active generation remain available; generation-qualified monotonic keys are `change:<changeId>:g<N>:<phase>` for full-set phases and `change:<changeId>:g<N>:<phase>:<scopeId>` for requirement batches, and duplicate detection treats legacy unqualified keys as generation 1; every normal approval, release, benchmark, budget, TDD, change-phase, integration, trace, graph, workflow, formal, mutation, model-correspondence, performance, quality, package, waiver, release-review, and candidate-bound gate record binds the active generation, while bootstrap records remain bootstrap-scoped and cannot satisfy normal evidence; generation-N coverage uses only generation-N evidence; superseded requirements or design within an active generation may be reviewed and re-approved through REQ-M5-APPROVAL-008 without changing generation, while any phase record invalidated by that cascade may be re-recorded in protected order and the superseded record remains historical; the generation follows the complete protected lifecycle in REQ-M5-LIFECYCLE-001, while `change-record` phase order remains `impact`, `requirements`, `design`, requirement-scoped `red`, `implementation`, `green`, and full-set `quality`; quality and rejected-manifest fingerprint comparison is scoped to the active generation; reopen `impact` is exempt from cross-generation unchanged-fingerprint rejection, `--allow-unchanged` retains baseline behavior within a generation, supplying `--reopen` outside `impact` is a usage error with exit code 2 and `CLI_ERROR`, missing confirmation or other usage errors for abandon exit 2 with `CLI_ERROR`, and invalid reopen or abandon state, duplicate current evidence, prior-generation reuse, or mixed generations fail with exit code 1 and `CHANGE_GENERATION_PHASE`, `CHANGE_GENERATION_DUPLICATE`, or `CHANGE_GENERATION_MIXED`; `CHANGE_GENERATION_INCOMPLETE` makes gate exit 1 and status exit 0 with `ready` false; crash recovery reuses a pending generation and never increments twice; gate and status report the active generation and all superseded or abandoned generations.

## REQ-M5-APPROVAL-001: Preserve manual exact-hash approval
Priority: must
Type: functional
Pattern: event-driven
Statement: When a human submits an approval record, the system shall require an approver, explicit confirmation, and the exact SHA-256 of the current sorted artifact manifest.
Acceptance: Missing confirmation, stale hashes, changed files, or invalid stages create no approval, while valid approval records all reviewed paths, per-file hashes, aggregate hash, approver, stage, and order.

## REQ-M5-APPROVAL-002: Keep public specifications immutable
Priority: must
Type: functional
Pattern: state-driven
Statement: While an orchestrator run evaluates an approved public specification, the system shall restrict generated and repaired output to its run-local workspace.
Acceptance: Producer repair cannot modify approved normative files, and any normative change requires a new manifest and manual approval.

## REQ-M5-APPROVAL-003: Repair verified-auto findings
Priority: must
Type: functional
Pattern: event-driven
Statement: When a verified-auto Reviewer returns repairable findings, the system shall return structured findings to the producer within the configured boundary repair limit.
Acceptance: Only explicitly configured requirements or design boundaries may use verified-auto review, repairable findings start bounded producer repair, non-repairable findings return a classified terminal reason, and release approval remains manual.

## REQ-M5-APPROVAL-004: Identify repair deterministically
Priority: must
Type: functional
Pattern: event-driven
Statement: When producer repair is scheduled, the system shall derive its identity from the approval boundary key and rejected output ordinal.
Acceptance: Retry or resume of one rejected output reuses one repair identity, and a distinct rejected ordinal receives a distinct identity.

## REQ-M5-APPROVAL-005: Detect repeated rejected manifests
Priority: must
Type: functional
Pattern: event-driven
Statement: When a manifest digest was previously rejected for the same boundary and Reviewer policy, the system shall return the prior findings without invoking the Reviewer again.
Acceptance: Duplicate rejection consumes no Reviewer budget, approval attempt, repair count, or nonce and terminates with reason `duplicate-rejected-manifest` while referencing the prior findings.

## REQ-M5-APPROVAL-006: Terminate exhausted repair
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If a rejected approval boundary exceeds its configured producer repair limit, then the system shall stop with terminal reason `repair-limit-exceeded`.
Acceptance: A limit of N permits exactly N repairs after the initial rejection, the next distinct rejection terminates, and crash or resume does not alter the count.

## REQ-M5-APPROVAL-007: Define approval manifest scope
Priority: must
Type: functional
Pattern: event-driven
Statement: When approval is prepared for a stage, the system shall build the sorted manifest from the stage's declared normative path set and apply only explicitly defined exclusions.
Acceptance: Native musubix5 approval uses `approval-manifest-schema-v1`; pinned-musubix3 bootstrap approval is validated only against its exact manifest hash and bound projection digest and is not required to emit schema-v1; requirements and design use `approval-normative-path-set-v1`, read every selected path from the `--root` project directory of the invoking workspace, use its NFC-normalized root-relative POSIX path as the `artifacts` key, and hash its raw on-disk bytes, with cross-platform digest identity required only for byte-identical inputs; when a CHANGE is active, requirements and design manifests bind its `changeId` and active generation even when normative bytes are unchanged; when `approval.domains` is a nonempty list, `--domain` is required for requirements/design, the supplied value is NFC-normalized, must byte-exactly match one NFC-normalized configured domain name, and narrows the path set through that domain's configured feature list; for requirements/design, two configured names with the same NFC form, supplying `--domain` without configured domains, omitting it when domains are nonempty, or naming an unknown domain fails with `APPROVAL_DOMAIN_MISMATCH`; release does not evaluate domain-name collisions and supplying any domain to release approval fails with `APPROVAL_DOMAIN_MISMATCH`; requirements/design inspect every root-relative ancestor segment before existence checks, so a dangling symlink, a symlink at a selected path, or a symlinked ancestor fails first with `APPROVAL_NORMATIVE_SYMLINK`; another non-regular selected path also fails with `APPROVAL_NORMATIVE_SYMLINK`; requirements/design reject non-UTF-8 paths with `APPROVAL_PATH_ENCODING`, reject NFC path collisions with `APPROVAL_PATH_COLLISION`, and include requirements-stage effective configuration fields `schemaVersion` and `approval` or design-stage effective fields `schemaVersion`, `commands`, `requiredChecks`, `thresholds`, `architecture`, `codeGraph`, `formal`, `mutation`, `tdd`, `workflow`, and `attestation`, after default resolution with every declared field present so making an implicit default explicit does not change the projection; release approval always has an active CHANGE, is repository-wide and domain-less, uses `release-candidate-tree-v1`, and then applies rules 1–9 to its surviving blobs; release exclusion uses exactly one first-match reason in this precedence order: (1) a symbolic-link blob outside the four normative release path patterns listed by `release-candidate-tree-v1` as `symlink`, (2) `.musubix/features/*/trace.json` as `generated-trace`, (3) root-relative `**/*.tgz` as `package-archive`, (4) files below a byte-exact lowercase NFC-normalized directory segment named `log`, `logs`, `session-log`, or `session-logs` as `log-directory`, including root-level matching directories but not a regular file with one of those names, (5) `docs/history/**` as `historical`, (6) the fixed `.musubix/runs/**` prefix as `run-local`, (7) both `.musubix/evidence/approvals/release.json` and `.musubix/evidence/approvals/native/release.json` as `release-self-reference`, (8) `.musubix/evidence/formal.json`, `.musubix/evidence/model-correspondence.json`, `.musubix/evidence/mutation.json`, `.musubix/evidence/performance.json`, `.musubix/evidence/quality.json`, and `.musubix/evidence/native/**` as `gate-self-reference`; this is the closed gate-self-reference list and any other evidence path is included unless rule 9 applies, and (9) blobs with a byte-exact lowercase `.json` suffix at or below `.musubix/evidence/`, at any depth, whose effective change ID is a nonempty string byte-exactly different from the active CHANGE as `foreign-change-evidence`; top-level `changeId` wins when it is a nonempty string, otherwise `metadata.changeId` is used; invalid JSON, non-object roots, and missing or empty change IDs remain included; release `artifacts` contains exactly the included blobs and every excluded path appears only in `exclusions`; included blobs are printed with raw SHA-256 only, while excluded blobs are printed with the selected reason and raw SHA-256; re-verification of the same candidate commit and candidate-sourced release projection under the same active CHANGE and generation reproduces the same manifest regardless of worktree-only file creation, deletion, modification, unreadability, or log/run-local activity, while a candidate tree differing in an included blob path or content, a changed repository identity, candidate commit, gate input fingerprint, active CHANGE, active generation, added or removed excluded blob, or changed reason produces a different aggregate.

## REQ-M5-APPROVAL-008: Supersede downstream approval
Priority: must
Type: functional
Pattern: event-driven
Statement: When an approved upstream normative artifact or stage-owned configuration changes, the system shall mark every dependent downstream approval and evidence record stale.
Acceptance: Requirements-policy changes invalidate requirements approval and all dependent state, while execution-command or design changes invalidate design approval and all Red-or-later state without deleting historical records.

## REQ-M5-APPROVAL-009: Transition bootstrap approvals
Priority: must
Type: functional
Pattern: event-driven
Statement: When musubix3 records a bootstrap requirements or design approval for CHANGE-0002, the system shall recognize it only as authorization to enter the next development phase.
Acceptance: Bootstrap approval binds the pinned musubix3 producer, repository identity, exact manifest, embedded configuration projection, stage, and approver, and musubix5 re-records approval for the same normative content set and projection before release readiness can become true.

## REQ-M5-BUDGET-001: Reserve Reviewer budget first
Priority: must
Type: functional
Pattern: event-driven
Statement: When a Reviewer invocation is required, the system shall persist an accepted budget reservation before consuming an approval attempt or nonce.
Acceptance: Reservation rejection returns `budget-exhausted`, invokes no Reviewer, consumes no attempt or nonce, and remains idempotent after resume.

## REQ-M5-BUDGET-002: Reserve repair budget first
Priority: must
Type: functional
Pattern: event-driven
Statement: When a repair-Planner invocation is required, the system shall persist an accepted budget reservation before consuming a repair count.
Acceptance: Reservation rejection returns `budget-exhausted`, invokes no Planner, consumes no repair count, and remains idempotent after resume.

## REQ-M5-BUDGET-003: Record actual usage
Priority: must
Type: functional
Pattern: event-driven
Statement: When a budgeted role invocation terminates, the system shall persist exactly one actual-usage result and classify any reservation overrun separately from approval findings.
Acceptance: Every started invocation has one terminal usage record, overruns produce budget diagnostics, and missing usage prevents readiness.

## REQ-M5-BUDGET-004: Reconcile interrupted reservations
Priority: must
Type: functional
Pattern: event-driven
Statement: When a budget reservation is accepted, the system shall atomically bind it to the pending invocation idempotency key before external role execution.
Acceptance: Resume reuses the bound reservation, classifies and compensates any legacy orphan reservation, and never leaks budget or creates duplicate actual-usage records.

## REQ-M5-BUDGET-005: Fail closed on missing limits
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If a verified-auto boundary lacks a positive Reviewer budget, repair-Planner budget, or producer repair limit, then the system shall stop before role invocation.
Acceptance: Missing, zero, negative, and invalid limits return a classified configuration terminal reason and consume no attempt, repair, nonce, or budget.

## REQ-M5-EVIDENCE-001: Separate artifact kinds
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall store normative specification, trace or graph, TDD, workflow, approval, release, benchmark, waiver, budget, and bootstrap records as distinct artifact kinds.
Acceptance: Each kind has an independent schema and freshness rule, normative files are not generated evidence, and gate output reports each non-pass classification by kind.

## REQ-M5-EVIDENCE-002: Reject foreign evidence
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If evidence has a foreign producer, repository identity, candidate identity, or CHANGE owner, then the system shall not count the evidence as current release evidence.
Acceptance: Foreign and unknown identity fixtures produce incompatible-evidence diagnostics and cannot satisfy quality or release readiness, while the explicitly bound CHANGE-0002 bootstrap approval may authorize development only under REQ-M5-APPROVAL-009.

## REQ-M5-EVIDENCE-003: Bind evidence to inputs and ownership
Priority: must
Type: functional
Pattern: event-driven
Statement: When evidence is recorded, the system shall bind the record to its artifact kind, producer, canonical input digest, repository, candidate, owning CHANGE, status, and monotonic order.
Acceptance: Changing any bound input or identity makes dependent evidence stale without changing evidence owned by another CHANGE.

## REQ-M5-EVIDENCE-004: Fix the mandatory release evidence set
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall require current requirements approval, design approval, requirement-scoped TDD, integration commands, trace, graph, workflow, quality, release review, release approval, and package verification evidence for release readiness.
Acceptance: Configuration cannot remove a mandatory kind; formal classification is required for changed requirements, modeled proof is required only for supported obligations, and budget or bootstrap evidence is additionally mandatory when those facilities were used.

## REQ-M5-EVIDENCE-005: Define evidence currency deterministically
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall determine evidence currency from canonical input digests, producer identity, ownership, dependency heads, and monotonic order without using wall-clock time as chronology authority.
Acceptance: Equal bound identities remain current despite clock skew, and any changed bound identity or superseding order makes the dependent record stale.

## REQ-M5-EVIDENCE-006: Reconcile overlapping Skill lifecycles
Priority: must
Type: functional
Pattern: event-driven
Statement: When workflow declarations are reconciled with Copilot Skill invocations, the system shall bind declarations deterministically without imposing invocation order between different Skills.
Acceptance: Reconciliation processes declarations in their persisted array order and considers only declarations bound to the active CHANGE and active generation; generation-less and change-less historical declarations are treated as generation 1 of the sole CHANGE whose evidence contains them, and ambiguous ownership is foreign evidence under REQ-M5-EVIDENCE-002; superseded-generation declarations are reported but never block the active generation; each declaration uses Skill identity as the invocation key while phase distinguishes separate declarations, and binds the lowest-positioned unused invocation of that Skill whose completed status and timestamps satisfy the configured freshness and event-skew bounds; each Skill maintains its own strictly increasing invocation-position cursor, while different Skills have independent cursors; transcript timestamps are used only for bounded eligibility and never replace persisted declaration order or transcript source position as chronology authority; non-completed declarations and missing, incomplete, failed, reused, duplicate, or same-Skill out-of-order invocations remain non-pass through `WORKFLOW_DECLARATION_NONPASS`, `WORKFLOW_SKILL_NOT_INVOKED`, `WORKFLOW_INVOCATION_INCOMPLETE`, `WORKFLOW_INVOCATION_FAILED`, `WORKFLOW_INVOCATION_REUSED`, `WORKFLOW_DUPLICATE_EVENT`, or `WORKFLOW_INVOCATION_ORDER`; one invocation cannot bind declarations for different CHANGEs or generations; and repeated evaluation of identical inputs yields the same binding set and diagnostics.

## REQ-M5-EVIDENCE-007: Sanitize compatible workflow sources
Priority: must
Type: functional
Pattern: event-driven
Statement: When compatible workflow reconciliation is requested, the system shall sanitize incomplete, resumed, or non-strict Copilot transcripts without claiming strict terminal lifecycle proof.
Acceptance: The intentional additive option `workflow-sanitize --compatible` preserves source order for session lifecycle and Skill invocation/completion events, removes messages and unrelated tool data, and adds no timestamp or value not derived from the input; its JSON command result, not the safe transcript, records raw source SHA-256, safe transcript SHA-256, source bytes, safe bytes, input events, output events, and retained eligible-event count, and the retained count must equal the eligible-event count in the source; malformed UTF-8 or JSON, duplicate event identity, `workflow.maxTranscriptBytes` outside `1..1000000000`, `workflow.maxTranscriptLineBytes` outside `1..10000000`, or either configured limit being exceeded fails closed with `WORKFLOW_SANITIZE_INVALID`, `WORKFLOW_DUPLICATE_EVENT`, or `WORKFLOW_TRANSCRIPT_SIZE`; compatible verification concatenates safe inputs in command-line argument order, rejects duplicate safe-transcript SHA-256 values and duplicate event identities with `WORKFLOW_DUPLICATE_SOURCE` or `WORKFLOW_DUPLICATE_EVENT`, and anchors invocation positions to that total sequence; release workflow evidence records each source's raw source SHA-256, safe transcript SHA-256, and verification mode, and requires at least one default non-`--compatible` strict-sanitized safe transcript whose raw source SHA-256 and session identity equal a successful strict-verification record with terminal proof, otherwise `WORKFLOW_STRICT_SOURCE_MISSING` is non-pass; strict sanitization and strict verification retain all existing terminal, session identity, successful completion, and baseline output requirements.

## REQ-M5-WAIVER-001: Preserve non-pass waiver status
Priority: must
Type: functional
Pattern: event-driven
Statement: When a human records a waiver, the system shall bind its diagnostic code, scope, approver, justification, evidence digest, expiry condition, and monotonic order without changing the underlying result to pass.
Acceptance: Changed bound evidence makes the waiver stale, broad or unconfirmed waivers are rejected, and waived mandatory checks keep release readiness false.

## REQ-M5-TDD-001: Require real TDD results
Priority: must
Type: functional
Pattern: event-driven
Statement: When TDD phase evidence is recorded for a requirement, the system shall require the configured runner to report the authoritative test ID with the phase-appropriate observed status.
Acceptance: Red accepts the target test only as failed, Green and Refactor accept it only as passed, and missing, skipped, unrelated, or error results cannot become canonical evidence.

## REQ-M5-TDD-002: Separate TDD batch scopes
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall represent legacy full-set batches and requirement-scoped batches with explicit non-overlapping scope identities.
Acceptance: A full-set batch cannot overwrite, shadow, merge with, or satisfy a requirement-scoped batch, and ambiguous legacy input is reported.

## REQ-M5-TDD-003: Select the latest complete cycle
Priority: must
Type: functional
Pattern: state-driven
Statement: While requirement coverage is evaluated, the system shall select the complete Red, Implementation, and Green cycle with the greatest terminal monotonic order.
Acceptance: A complete cycle has strict Red order before Implementation order before Green order and binds one CHANGE generation, requirement, test, command, and candidate lineage; selection and coverage are restricted to the active generation, prior-generation cycles are reported as superseded and cannot satisfy coverage, and repeated evaluation selects the same latest complete cycle and explains every excluded record.

## REQ-M5-TDD-004: Preserve optional Refactor evidence
Priority: must
Type: functional
Pattern: event-driven
Statement: When Refactor evidence is recorded, the system shall require a preceding current Green cycle and bind the passing result to the refactored candidate digest.
Acceptance: Refactor cannot replace Red or Green, stale post-Green code fails currency checks, and the musubix3-compatible `tdd refactor` command remains available.

## REQ-M5-WORKTREE-001: Isolate change workspaces
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall isolate each CHANGE in distinct baseline, candidate, and QA workspaces using one branch or worktree per CHANGE.
Acceptance: Candidate execution cannot modify baseline or QA state, QA validates an identified candidate snapshot, and evidence records workspace and commit identities.

## REQ-M5-WORKTREE-002: Preserve unrelated dirty paths
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If a workspace contains unrelated user-owned dirty paths, then the system shall preserve those paths outside the candidate snapshot.
Acceptance: Byte, mode, staged, unstaged, deleted, and untracked fixtures remain unchanged across success, rejection, crash, recovery, and resume.

## REQ-M5-WORKTREE-003: Prevent cross-change evidence sharing
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If approval, TDD, quality, or generated evidence is owned by another CHANGE, then the system shall reject it for the active CHANGE.
Acceptance: Parallel CHANGE fixtures with identical requirement and test text cannot satisfy each other's gates.

## REQ-M5-WORKTREE-004: Require an immutable baseline commit
Priority: must
Type: functional
Pattern: event-driven
Statement: When candidate work begins for the first CHANGE, the system shall require an identified immutable baseline commit before creating candidate and QA workspaces.
Acceptance: A repository without a commit cannot start candidate execution, and the initialized baseline commit identity is persisted without including unrelated dirty paths.

## REQ-M5-PLANNER-001: Validate structured output
Priority: must
Type: functional
Pattern: event-driven
Statement: When the Planner returns structured output, the system shall validate the normalized result against the declared JSON schema.
Acceptance: Missing and invalid fields return path-specific parse or schema diagnostics with safe references to raw and normalized output.

## REQ-M5-PLANNER-002: Separate retries from repairs
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If Planner output fails transport, parsing, or schema validation, then the system shall apply only the role-output retry policy.
Acceptance: Role-output retries and Reviewer-requested producer repairs use separate identities, counters, budgets, and terminal reasons.

## REQ-M5-PLANNER-003: Return diagnostics on retry
Priority: must
Type: functional
Pattern: event-driven
Statement: When a role-output retry is permitted, the system shall provide the preceding validation diagnostics to the Planner.
Acceptance: Retry input references the invalid-output ordinal and includes parse or schema failures without exposing configured secrets.

## REQ-M5-PLANNER-004: Stop repeated invalid output
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If the Planner repeats the same invalid normalized output and validation failures, then the system shall stop with terminal reason `repeated-invalid-output`.
Acceptance: The stop occurs before unrelated repair or approval budgets are exhausted, records all ordinals, and never returns an unexplained `unrecoverable-failure`.

## REQ-M5-BOOTSTRAP-001: Separate bootstrap execution
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall provide a bootstrap entry point and state store that are independent from the normal orchestrator approval state machine.
Acceptance: Bootstrap starts when normal state is malformed or blocked, and normal commands never invoke bootstrap implicitly.

## REQ-M5-BOOTSTRAP-002: Bound bootstrap authority
Priority: must
Type: functional
Pattern: event-driven
Statement: When bootstrap mode is requested, the system shall require an explicit authority manifest that limits target paths, operations, permissions, budget, iterations, and duration.
Acceptance: Missing or exceeded limits fail closed, out-of-scope operations are rejected before execution, and the effective manifest is persisted.

## REQ-M5-BOOTSTRAP-003: Persist bootstrap history
Priority: must
Type: functional
Pattern: event-driven
Statement: When bootstrap performs an operation, the system shall append its invocation, inputs, outputs, usage, candidate digest, and resulting change set to durable bootstrap evidence.
Acceptance: Crash and resume preserve one ordered history, and every bootstrap-created byte is attributable to one operation and candidate snapshot.

## REQ-M5-BOOTSTRAP-004: Forbid release bypass
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If bootstrap attempts to write a normal approval or mandatory evidence record, then the system shall reject the write and require the candidate to re-enter the normal lifecycle.
Acceptance: Bootstrap cannot create requirements, design, or release approval; TDD, trace, graph, workflow, quality, or package-pass evidence; readiness; waivers; publication; tags; or pushes in the normal store.

## REQ-M5-QUALITY-001: Require current mandatory evidence
Priority: must
Type: functional
Pattern: state-driven
Statement: While release readiness is evaluated, the system shall return ready only when every mandatory evidence kind is current, valid, passing, and owned by the release CHANGE.
Acceptance: Missing, stale, failed, skipped, unsupported, flaky, waived, foreign, or superseded mandatory evidence returns readiness false with a classified diagnostic.

## REQ-M5-QUALITY-002: Limit formal claims
Priority: must
Type: functional
Pattern: event-driven
Statement: When formal checking cannot model a requirement within its declared abstraction, the system shall classify the requirement as unsupported without proof credit.
Acceptance: Formal output distinguishes modeled-pass, modeled-fail, unsupported, and solver-error states, and only modeled obligations contribute to modeled coverage.

## REQ-M5-QUALITY-003: Produce deterministic artifacts
Priority: must
Type: non-functional
Pattern: ubiquitous
Statement: The system shall produce identical canonical bytes and SHA-256 digests for identical normalized inputs, producer versions, and repository identities.
Acceptance: Repeated clean runs on the musubix5 verification matrix produce identical normative manifests and normalized evidence digests after excluding metadata declared as display-only by the approved schema.

## REQ-M5-QUALITY-004: Reject an empty mandatory command set
Priority: must
Type: functional
Pattern: state-driven
Statement: While command-backed verification is mandatory, the system shall preserve the baseline `skipped` check status and classify an empty configured command set as non-pass.
Acceptance: Gate and status return an additive `missing-command` diagnostic registered under REQ-M5-COMPAT-003 and never treat zero executed commands as pass; gate exits with code 1 and status preserves the baseline exit code 0 with `ready` false.

## REQ-M5-QUALITY-005: Configure real verification commands
Priority: must
Type: functional
Pattern: event-driven
Statement: When quality or release evaluation begins, the system shall require a non-empty design-approved command set for typecheck, build, full tests, package verification, and compatibility tests.
Acceptance: Each required command records invocation, exit code, output digest, and status, and absent command configuration produces the REQ-M5-QUALITY-004 non-pass result before readiness.

## REQ-M5-RELEASE-001: Separate release operations from release approval
Priority: must
Type: functional
Pattern: event-driven
Statement: When an external release operation is requested, the system shall require explicit human authorization that is separate from release approval.
Acceptance: Release approval alone cannot publish, create a tag, push, publish a package, or create a GitHub Release; each requested external operation records its authorizer, exact candidate identity, current release-approval artifact SHA-256, one scope from `publish | release | tag | push`, release tag, and confirmation before execution. An automated workflow that executes an external operation validates that the corresponding candidate-bound authorization record has `status: authorized` before the side effect, uses operation-specific concurrency, rejects an already existing package version or GitHub Release target as a replay, and records the terminal outcome in an immutable run-scoped artifact and job summary rather than a repository commit; missing, mismatched, non-authorized, or replayed authorization fails closed with `RELEASE_OPERATION_NOT_AUTHORIZED`. A protected GitHub environment review is an additional independent control and does not replace the repository authorization record.

## REQ-M5-RELEASE-003: Provide candidate-bound release automation
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall provide an executable GitHub Actions release workflow that validates and packages an immutable candidate before performing separately authorized release operations.
Acceptance: `.github/workflows/release.yml` runs for pushed `v*` tags and explicit manual dispatch. A tag-push run performs validation and artifact production only and cannot publish npm or create a GitHub Release. A manual-dispatch run requires the workflow ref and `release_tag` input to identify the same tag and exact `GITHUB_SHA`; requires a full-SHA `evidence_commit` input that is a descendant of the tagged candidate and reachable from the repository default branch; requires that evidence commit to contain a current REQ-M5-RELEASE-002 release approval and `status: authorized` REQ-M5-RELEASE-001 records for every requested side effect; and fails closed with `RELEASE_TAG_CANDIDATE_MISMATCH`, `RELEASE_VERSION_MISMATCH`, or `RELEASE_OPERATION_NOT_AUTHORIZED` before a side effect when any binding is absent or inconsistent. The release tag equals `v` plus every `version` value in `package.json`, `packages/*/package.json`, `plugin.json`, and both the catalog and plugin entries in `.github/plugin/marketplace.json`. Validation runs typecheck, build, full tests, compatibility tests, package checks, and package smoke tests with exit code zero against the tagged commit; formal classification remains advisory under REQ-M5-QUALITY-002 and grants no proof credit when unsupported. Artifact production creates the npm tarball, a CycloneDX SBOM, and `SHA256SUMS` covering at least the tarball and SBOM. A strict GitHub-OIDC-bound ephemeral Ed25519 attestation always binds the repository, tagged candidate commit, workflow identity, release tag, and SHA-256 of `SHA256SUMS`; on manual dispatch it additionally binds the evidence commit and release-approval SHA-256. Release and publish jobs re-verify `SHA256SUMS` and the attestation using the strict REQ-M5-EVIDENCE-003 trust rules for issuer, public-key-bound audience, repository, tagged commit, and workflow identity before any side effect. A release job creates the GitHub Release and uploads all artifacts only after validating a `release` authorization. A separate publish job, independent of the release job result, validates a `publish` authorization and runs only in the protected `npm-publish` environment with npm 11.5.1 or newer; Trusted Publishing runs `npm publish --access public` because npm creates provenance automatically, while an explicitly configured token fallback runs `npm publish --provenance --access public`. Each job receives only the minimum GitHub permissions needed for checkout, OIDC, package publication, or release creation.

## REQ-M5-RELEASE-002: Bind release readiness to the immutable candidate
Priority: must
Type: functional
Pattern: event-driven
Statement: When release approval is prepared or recorded, the system shall require passing mandatory gate evidence produced from an isolated QA workspace whose Git tree is identical to the persisted immutable candidate commit.
Acceptance: The QA workspace tracked-blob tree is verified against the exact candidate snapshot commit persisted under REQ-M5-WORKTREE-001 immediately before and after gate execution; ignored and untracked cache paths are outside the comparison, post-gate tracked differences are allowed only at the `generated-trace` and `gate-self-reference` paths defined by REQ-M5-APPROVAL-007, and every other difference fails with `RELEASE_CANDIDATE_TREE_MISMATCH`; one external candidate-bound gate record is required for every job in the musubix5 verification matrix, each record binds repository identity, CHANGE ID, candidate commit, producer identity, runtime Node.js and operating-system identity, and `gate-input-fingerprint-v1` under REQ-M5-EVIDENCE-003, and regenerating records does not change the candidate commit; gate evidence contributing to release readiness is taken only from the complete set of external candidate-bound gate records, any missing or non-pass matrix job blocks readiness, and in-tree gate output is informational and cannot substitute for a matrix record; readiness additionally requires every mandatory evidence kind under REQ-M5-EVIDENCE-004 and REQ-M5-QUALITY-001; the release manifest projection binds the same repository identity, candidate commit, and gate input fingerprint; worktree-only or post-candidate inputs cannot satisfy readiness; a different candidate or gate input makes gate evidence, manifest, and release approval stale; and approval preparation and recording fail with `RELEASE_GATE_EVIDENCE_MISSING`, `RELEASE_GATE_EVIDENCE_STALE`, or `RELEASE_GATE_CANDIDATE_MISMATCH` unless every candidate-bound matrix gate passes.

## Normative musubix3 v0.1.18 compatibility inventory

Baseline identity:

- npm package: `musubix3`
- tag: `v0.1.18`
- commit: `c0b20f06727bceb04eeec181d95af9047b1981de`
- runtime: Node.js `>=20`, ESM
- binary: `musubix3 -> dist/packages/cli/src/main.js`
- public exports: `./domain`, `./analysis`, `./attestation`
- packaged `files` entries: `dist`, `assets`, `.github/skills`,
  `.github/plugin/marketplace.json`, `plugin.json`, `README-ja.md`,
  `CHANGELOG.md`, `LICENSE`
- CI compatibility: Node.js 22 on Ubuntu, Windows, and macOS; Node.js 20 and
  24 on Ubuntu
- package runtime range: Node.js `>=20`
- musubix5 verification matrix: Node.js 22 on Ubuntu, Windows, and macOS, plus
  Node.js 20 and 24 compatibility jobs on Ubuntu
- verbatim CLI-help fixture:
  `docs/baseline/musubix3-v0.1.18-cli-help.json`
- CLI-help fixture SHA-256:
  `675ceaf3fb693488bfcf3da0a9db475b666164db4c304ded0a2524ce09a4ede0`
- bootstrap requirements-policy projection:
  `{"approval":{"domains":[],"mode":"required"},"schemaVersion":1}`
- projection canonical encoding: UTF-8 JSON with object keys sorted by ascending
  byte-wise comparison of their UTF-8 encoding, no insignificant whitespace,
  and exactly one trailing LF byte; strings use RFC 8785 escaping while emitting
  unescaped Unicode as UTF-8; finite JSON numbers use RFC 8785
  shortest-round-trip decimal serialization, negative zero is serialized as
  `0`, and non-finite numbers are rejected
- path-pattern semantics for every path pattern in this document: paths are
  root-relative NFC-normalized POSIX strings; every literal and pattern
  comparison is byte-exact with no case folding; `*` between `/` separators matches exactly one
  path segment; filename-local `*` matches zero or more characters except `/`;
  `**/` matches zero or more path segments; trailing `/**` matches every blob at
  any depth below the literal directory prefix
- `approval-normative-path-set-v1`: requirements includes literal
  `.musubix/constitution.md` and pattern
  `.musubix/features/*/requirements.md`; design includes those entries plus
  `.musubix/features/*/design.md` and the ADR files referenced by the selected
  design components; a design component references ADRs only through its
  parsed `ADRs:` field containing byte-exact `ADR-<digits>` tokens; references
  are non-transitive and every referenced
  `.musubix/decisions/<ADR-ID>.md` must exist or manifest construction fails
  with `APPROVAL_NORMATIVE_MISSING`; the constitution literal and at least one selected
  requirements or design file required by the stage must exist, otherwise
  manifest construction fails with `APPROVAL_NORMATIVE_MISSING`; when
  `approval.domains` is configured, each domain object maps its NFC-normalized
  `name` to an explicit `features` slug list, feature patterns are restricted to
  those slugs, and only ADRs referenced by the selected domain designs are
  included
- `release-candidate-tree-v1`: the exact candidate snapshot commit identified
  and persisted under REQ-M5-WORKTREE-001; enumerate every blob recursively by
  its NFC-normalized, root-relative POSIX path without reading the mutable
  worktree; an absent or unresolvable persisted candidate commit fails with
  `APPROVAL_CANDIDATE_UNAVAILABLE`; a raw Git path that is not valid UTF-8 fails
  with `APPROVAL_PATH_ENCODING`; if two raw Git paths normalize to the same NFC
  path, fail with `APPROVAL_PATH_COLLISION`; omit tree entries; reject Gitlink/submodule entries
  with `APPROVAL_GITLINK_UNSUPPORTED`; reject symbolic-link blobs at
  `.musubix/constitution.md`, `.musubix/features/*/requirements.md`,
  `.musubix/features/*/design.md`, or `.musubix/decisions/ADR-*.md` with
  `APPROVAL_NORMATIVE_SYMLINK`
- `gate-input-fingerprint-v1`: the projection-canonical digest of exactly
  `{"candidateCommit":string,"changeId":string,"commands":[{"args":string[],"command":string,"name":string}],"config":object,"producerVersion":string,"repositoryId":string,"requiredChecks":string[]}`;
  `config` is the complete design-approved effective configuration object;
  `config`, `requiredChecks`, and `commands` are resolved only from candidate
  commit blobs, `producerVersion` is resolved from the candidate `package.json`
  blob, and `repositoryId` is the persisted repository identity; command and
  required-check arrays preserve their configured order
- `change-generation-v1`: `changes.json`, gate JSON, and status JSON add
  positive integer `generation`, active-generation identity, and superseded
  or abandoned generation summaries and represent no active generation as
  `null`; normal approval, release, benchmark, budget, TDD, change-phase,
  integration, trace, graph, workflow, formal, mutation,
  model-correspondence, performance, quality, package, waiver, release-review,
  and candidate-bound gate records add their bound generation, while bootstrap
  records remain generation-less and bootstrap-scoped; `change-record`,
  `approval prepare`, `approval record`, `approval validate`, `tdd`, `gate`,
  and `status` JSON envelopes expose that generation; readers interpret missing
  generation in schema-version-1 historical records and unqualified order keys
  as generation 1 without rewriting stored bytes
- `approval-manifest-schema-v1`: canonical UTF-8 JSON using the projection
  canonical encoding above, with exactly `schemaVersion`, `stage`, optional
  `domain`, optional `changeId`, optional `generation`, `artifacts`,
  `projection`, and `exclusions`;
  `schemaVersion` is `1`; `stage` is exactly `requirements`, `design`, or
  `release`; `domain` is present exactly for domain-scoped requirements or
  design approval and is omitted for repository-wide stages; `changeId` is
  present only when a CHANGE is bound and is omitted otherwise; `generation`
  is present with the active positive integer generation whenever `changeId`
  is present and is omitted otherwise; paths are
  ordered by ascending byte-wise comparison of their NFC-normalized UTF-8
  root-relative POSIX representation; this path ordering overrides the generic
  object-key ordering for path-keyed objects; `artifacts` is an object whose keys use
  that order and whose values are 64-character lowercase hexadecimal raw
  SHA-256 strings; `projection` is the stage-specific canonical configuration
  object for requirements or design and, for release, contains exactly the
  three keys `repositoryId`, `candidateCommit`, and `gateInputFingerprint`,
  serialized in canonical key order;
  `exclusions` is
  an empty array for requirements and design and an array of
  `{"path":string,"reason":string}` entries using the same path order for
  release; the aggregate SHA-256 hashes the canonical bytes of this complete
  object including the required trailing LF byte; displayed
  excluded-file SHA-256 values are outside the aggregate and informational only
- bootstrap requirements-policy projection SHA-256:
  `27f2ac60f53ee975eb97fa919f0ea34e21eac1680b88d085391b9ed8cc38b8df`
- reproducible source oracle:
  `https://github.com/nahisaho/musubix3.git` at commit
  `c0b20f06727bceb04eeec181d95af9047b1981de`, built with `npm ci` followed
  by `npm run build`

Common CLI options:

- `--root <directory>` with default `.` for each command whose entry in the
  pinned CLI-help fixture lists it
- `--json` for each command whose entry in the pinned CLI-help fixture lists it
- top-level `-V, --version` and `-h, --help`

Command inventory:

- the 69 entries in the pinned CLI-help fixture are the normative help-entry
  set, including parent/group entries

- `init` with alias `install`: `--dry-run`, `--force`,
  `--feature <slug>` with default `example`
- `upgrade`: `--dry-run`
- `plugin-install`
- `requirements validate <file>`
- `requirements scaffold <slug>`: `--title <text>`
- `constitution validate [file]`
- `design validate <file>`
- `design c4 <file>`
- `design scaffold <slug>`
- `trace build`
- `trace check`: `--strict`
- `trace impact <id-or-path>`
- `graph index`: `--changed`
- `graph impact <symbol-or-path>`
- `graph cycles`
- `graph gate`
- `knowledge build`
- `knowledge query <text...>`: `--limit <count>` with default `10`
- `formal check <file>`: `--solver <solver>` default `auto`,
  `--timeout <milliseconds>` default `12000`, `--z3-command <path>`,
  `--lean-command <path>`
- `formal generate <file>`: `--format both|smt2|lean` with default `both`
- `formal doctor`: `--timeout <milliseconds>` default `5000`,
  `--z3-command <path>`, `--lean-command <path>`
- `gate`: `--changed`, `--feature <name>`
- `config lint`
- `config scaffold`
- `evidence refresh`: `--changed`
- `mutation doctor`
- `mutation validate`
- `mutation identity <requirementId> <testId> <sourcePath> <operator> <line> <column>`
- `model-correspondence validate`
- `workflow-record <skill> <phase>`: `--status <status>`, `--reason <text>`,
  `--command <text>`
- `workflow-verify <log...>`: `--strict`, `--session-id <uuid>`
- `workflow-sanitize <log> <output-file>`: `--session-id <uuid>`
- `workflow waiver record <code>`: `--skill <skill>`, `--phase <phase>`,
  `--recorded-at <timestamp>`, `--index <n>`, `--approver <name>`,
  `--reason <text>`, `--confirm` default `false`
- `workflow waiver record-all`: `--approver <name>`, `--reason <text>`,
  `--confirm` default `false`
- `attestation oidc-audience`: `--key-id <id>`,
  `--public-key-file <file>`
- `attestation payload`: `--provider <provider>`, `--run-id <id>`,
  `--key-id <id>`, `--public-key-file <file>`,
  `--github-oidc-token-file <file>`
- `attestation verify`
- `change-record <change-id> <phase>`: `--requirement <ids...>`,
  `--allow-unchanged`, `--dry-run`
- `change waiver record <change-id> <code>`:
  `--requirement <req-id>`, `--detail <value>`, `--approver <name>`,
  `--reason <text>`, `--confirm` default `false`
- `approval prepare <stage>`: `--domain <name>`
- `approval record <stage>`: `--approver <name>`,
  `--artifact-sha256 <hash>`, `--confirm`, `--domain <name>`
- `approval validate`: `--domain <name>`
- `tdd validate`
- `tdd red <test-id>`: `--requirement <id>`, `--command <name>`
- `tdd green <test-id>`: `--requirement <id>`, `--command <name>`
- `tdd refactor <test-id>`: `--requirement <id>`, `--command <name>`
- `tdd migrate <test-id>`: `--approver <name>`, `--confirm` default `false`
- `tdd void <test-id>`: `--approver <name>`, `--reason <text>`,
  `--confirm` default `false`
- `status`
- `help [command]`

Musubix5 intentional additive-help registry:

- `workflow-sanitize <log> <output-file>` adds `--compatible`; strict-mode help,
  defaults, output fields, and behavior remain baseline-compatible
- `change-record <change-id> <phase>` adds `--reopen`; only `impact` accepts
  it, other phases reject it with exit code 2 and `CLI_ERROR`, and repeated
  non-reopen checkpoints retain baseline first-generation behavior
- `change generation abandon <change-id>` adds `--reason <text>`,
  `--approver <name>`, and `--confirm`; it never grants readiness
- the `change` parent help adds the `generation` subcommand line;
  `change generation` adds a command-group help entry; and
  `change generation abandon <change-id>` adds its command help entry

Required behavioral contracts:

- exit `0`: success;
- exit `1`: validation, check, or gate failure;
- exit `2`: usage or operational error;
- JSON CLI errors use an `error` object with code `CLI_ERROR` and a message;
- validation output contains `valid`, `value`, and `diagnostics`;
- diagnostics contain code, severity, message, and source location when known;
- trace output contains schema version, generated metadata, nodes, edges,
  diagnostics, and fingerprints;
- status output contains initialization and gate readiness;
- approval records contain stage, approver, and exact artifact SHA-256;
- configuration path is `.musubix/config.json` with schema version 1;
- default required checks are requirements, design, constitution, trace, graph,
  and commands;
- default thresholds for design, implementation, and tests are `1`;
- architecture cycles are forbidden by default;
- code graph and mutation modes default to `compatible`;
- formal solver defaults to `none`, minimum modeled fraction to `0`, and timeout
  to `12000` milliseconds;
- approval defaults to required;
- workflow defaults to compatible with maximum age `3600` seconds and future
  skew `60` seconds; transcript bytes default to `100000000` and transcript
  line bytes default to `1000000`;
- attestation defaults to local with GitHub OIDC off;
- `formal generate --format` defaults to `both`;
- `formal check` and `formal doctor` accept `MUSUBIX3_Z3` and
  `MUSUBIX3_LEAN`;
- requirements/design validation, trace build/check, graph index/gate,
  TDD Red/Green/Refactor, approval prepare/record, gate/status, typecheck,
  build, full tests, package archive verification, isolated installation, and
  CLI startup remain contract-tested.
