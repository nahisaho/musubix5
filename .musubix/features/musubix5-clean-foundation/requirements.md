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
Statement: The system shall register the lifecycle, approval, workflow, candidate-bound release, candidate-snapshot CLI, and parallel-development additions defined by REQ-M5-LIFECYCLE-005, REQ-M5-APPROVAL-007, REQ-M5-EVIDENCE-006, REQ-M5-EVIDENCE-007, REQ-M5-RELEASE-002, REQ-M5-TDD-003, REQ-M5-WORKTREE-001, REQ-M5-WORKTREE-005, REQ-M5-WORKTREE-006, REQ-M5-WORKTREE-007, REQ-M5-PARALLEL-013, and REQ-M5-PARALLEL-017 as intentional extensions to the pinned musubix3 contract.
Acceptance: ADRs, migration-guide entries, additive help and JSON-field registries, and regression tests cover configuration projections, versioned schemas, candidate-tree sourcing, the complete REQ-M5-WORKTREE-005 through REQ-M5-WORKTREE-007 public candidate-snapshot lifecycle and its diagnostics, full lowercase hexadecimal Git object IDs from 40 through 64 characters at every changed persistence, validation, workflow, and shell boundary, exclusion predicates and reasons, matching semantics, sanitization modes, candidate-bound gate evidence, parallel worktree, provenance-gated TDD, integration evidence, abandoned-generation maintenance records and their non-credit schema, audited workflow declaration correction records and their non-credit projection, every added or changed diagnostic and displayed output, and changed aggregate hashes before implementation; unregistered differences remain compatibility failures.

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
Acceptance: Generation-less historical records are interpreted as generation 1 without rewriting them, while all newly written generations including generation 1 use qualified keys; while holding the REQ-M5-LIFECYCLE-004 CHANGE lease, `change-record <change-id> impact --reopen` atomically creates or idempotently resumes the next positive integer generation when the prior active generation has terminal full-set `quality` or was explicitly abandoned by `change generation abandon <change-id> --reason <text> --approver <name> --confirm`; abandon preserves the incomplete generation as non-current history, leaves the CHANGE with no active generation until reopen, rejects every phase operation other than `change-record <change-id> impact --reopen`, every TDD or pass-producing evidence operation, and every approval prepare, record, or validate operation with exit code 1 and `CHANGE_GENERATION_PHASE`, and cannot make any check pass; read-only parallel status, candidate-snapshot list, candidate-snapshot show, candidate-snapshot delete, and branch-retaining stale cleanup remain permitted as non-pass maintenance, and maintenance append operations may write only their requirement-defined non-credit audit records; during that interval gate and status report a null active generation plus the abandoned generation, gate exits 1, status exits 0, and `ready` is false; reopen resolves its requirement set from supplied `--requirement <ids...>` or, when omitted, from the current CHANGE document `Requirements:` set, and the resolved set must exactly equal that document; the set is revalidated at every later phase, and `CHANGE_GENERATION_REQUIREMENTS` makes gate exit 1 and status exit 0 with `ready` false; within each CHANGE the active generation is otherwise the greatest non-abandoned generation, while implicit repository-wide generation resolution selects the sole CHANGE document whose frontmatter `status` is `active` whether its active generation is a positive integer or null, treats a legacy CHANGE document with no `status` as active when its persisted chronology has a positive active generation without terminal full-set quality, has a null active generation after explicit abandonment, or has no generation chronology yet, treats it as completed when its chronology has terminal full-set quality with no later active or abandoned generation, never rewrites it, counts such a legacy-active document toward the at-most-one-active rule, excludes `completed` CHANGE documents from implicit selection without altering their historical generation, and requires at most one active or legacy-active CHANGE document; when none is active, stateful generation-bound operations exit 1 with `CHANGE_GENERATION_PHASE` without persistence, gate exits 1, and status exits 0 with `ready: false`; when more than one is active, implicit stateful generation-bound operations and gate exit 1 with `CHANGE_GENERATION_MIXED`, status exits 0 with `ready: false` plus the same diagnostic, and the failing implicit operation persists nothing until repository authors leave only one CHANGE document active; an operation with an explicit CHANGE ID never falls back to implicit resolution and selects only that matching active or legacy-active CHANGE document plus its positive active generation, otherwise it fails with `CHANGE_GENERATION_PHASE`; as an explicit exception, `candidate-snapshot create <change-id>` treats its argument as a confirmation token rather than a selector, resolves the sole implicit active CHANGE, reports `CHANGE_GENERATION_PHASE` when none is active or the token mismatches, and reports `CHANGE_GENERATION_MIXED` when more than one is active; explicitly targeted parallel status, candidate-snapshot list, candidate-snapshot show, candidate-snapshot delete, and branch-retaining stale cleanup are maintenance exceptions that may inspect an active, abandoned, completed, unknown, or mixed CHANGE state and grant no evidence credit; exact-snapshot-ID delete for an unknown or foreign CHANGE acquires the repository CHANGE lease keyed by the persisted CHANGE ID without making that CHANGE active, while list/show remain lease-free and CHANGE-ID selectors still require a known CHANGE document; snapshot deletion of a protected completed CHANGE first requires repository authors to leave no other active CHANGE document and set the target CHANGE document frontmatter to `status: active`, after which `change-record <change-id> impact --reopen` supersedes the protected generation before deletion retry; `workflow-record --change-id` reports `WORKFLOW_CHANGE_MISMATCH` instead of `CHANGE_GENERATION_PHASE` for an unknown or conflicting explicit owner, while a known ineligible owner retains `CHANGE_GENERATION_PHASE`; superseded, abandoned, or completed-CHANGE generations never satisfy current evidence for another CHANGE, and an active generation without terminal `quality` makes release-stage approval preparation or recording and release readiness non-pass with `CHANGE_GENERATION_INCOMPLETE`, while requirements and design approval for that active generation remain available; generation-qualified semantic keys are `change:<changeId>:g<N>:<phase>` for full-set phases and `change:<changeId>:g<N>:<phase>:<scopeId>` for requirement batches, duplicate detection treats legacy unqualified keys as generation 1, and requirements/design checkpoints after ordinal 1 use evidence-order phase names `requirements:<K>` or `design:<K>` without changing those semantic keys; every normal approval, release, benchmark, budget, TDD, change-phase, integration, trace, graph, workflow, formal, mutation, model-correspondence, performance, quality, package, waiver, release-review, and candidate-bound gate record binds the active generation, while bootstrap records remain bootstrap-scoped and cannot satisfy normal evidence; generation-N coverage uses only generation-N evidence; superseded requirements or design within an active generation may be reviewed and re-approved through REQ-M5-APPROVAL-008 without changing generation, and re-recording an invalidated requirements/design checkpoint requires `--operation-id <id>` matching `^[a-z0-9][a-z0-9-]{0,63}$`; processing order is argument, operation-ID syntax, and supported-phase validation with exit 2 and no lease or persistence, then CHANGE/generation resolution with `CHANGE_GENERATION_PHASE` or `CHANGE_GENERATION_MIXED` and no lease or persistence, then CHANGE-lease acquisition, active-generation pending-checkpoint recovery, scoped replay lookup, and supersession state validation; replay scope is active CHANGE, generation, phase, and operation ID, so the same ID text in another phase or generation is a distinct invocation; recovery completes each checkpoint solely from its own journaled bound inputs and never from the current invocation's arguments; when a scoped operation ID already exists, its persisted ordinal is reused, exact equality of the caller-bound approval-manifest SHA-256 and all other bound inputs returns the existing checkpoint and exit 0 at every crash boundary whether or not its projection was already written, and divergent reuse exits 1 with `CHANGE_GENERATION_DUPLICATE` without persisting the requested operation while any pending-checkpoint recovery already completed under the lease remains; only when no scoped operation ID exists does the system validate whether a checkpoint already exists: no checkpoint means `--operation-id` is invalid initial-record usage and exits 2 with `CLI_ERROR`, a still-current checkpoint means the distinct operation exits 1 with `CHANGE_GENERATION_DUPLICATE`, and a cascade-invalidated checkpoint permits deriving the deterministic next generation-scoped ordinal; missing or malformed `--operation-id` when supersession is required or supplying it for an unsupported phase exits 2 with `CLI_ERROR`; requirements/design recording journals a new checkpoint before evidence-order/projection writes, and under the lease recovery completes every already-journaled checkpoint for the active generation, including the requested replay target, by appending or reusing its missing ordinal-qualified evidence-order entry and replacing its projection exactly once; abandon and reopen validate all usage and lifecycle eligibility before acquiring the lease or performing recovery, then under the lease revalidate eligibility, reconcile the departing active generation with the same crash-idempotent exactly-once recovery semantics, and only afterward snapshot or abandon it; a pending checkpoint discovered later in a superseded or abandoned generation is valid historical/unprojected evidence, is reported as such, is not an order-chain, journal-chain, or currency violation, is never projected into the active generation, and grants no evidence credit; the projection retains prior checkpoints in generation-scoped `requirementsHistory` or `designHistory`, stores the persisted `operationId` and `requirementsOrdinal` or `designOrdinal` on every current and historical checkpoint, snapshots and clears those fields on reopen, and restarts ordinals at 1; cross-phase validation selects the contemporaneous predecessor checkpoint with the greatest order less than the dependent record so later approval checkpoints never retroactively invert existing design or TDD order; any other phase record invalidated by the approval cascade may be re-recorded through its existing batch or quality supersession identity and the superseded record remains historical; the generation follows the complete protected lifecycle in REQ-M5-LIFECYCLE-001, while `change-record` phase order remains `impact`, `requirements`, `design`, requirement-scoped `red`, `implementation`, `green`, and full-set `quality`; quality and rejected-manifest fingerprint comparison is scoped to the active generation; reopen `impact` is exempt from cross-generation unchanged-fingerprint rejection, `--allow-unchanged` retains baseline behavior within a generation, supplying `--reopen` outside `impact` is a usage error with exit code 2 and `CLI_ERROR`, missing confirmation or other usage errors for abandon exit 2 with `CLI_ERROR`, and invalid reopen or abandon state, duplicate current evidence, prior-generation reuse, or mixed implicitly selected active CHANGEs fail with exit code 1 and `CHANGE_GENERATION_PHASE`, `CHANGE_GENERATION_DUPLICATE`, or `CHANGE_GENERATION_MIXED`; plan-scoped parallel commands report `PARALLEL_PLAN_STALE` instead of `CHANGE_GENERATION_PHASE` when their persisted plan is stale, while non-parallel generation-scoped commands retain `CHANGE_GENERATION_PHASE`; `CHANGE_GENERATION_INCOMPLETE` makes gate exit 1 and status exits 0 with `ready` false; crash recovery reuses a pending generation or scoped operation ID and never increments twice; gate and status report the selected CHANGE's active generation, including null, plus all superseded or abandoned generations for that CHANGE.
Acceptance-Correction: Normative replacement: within the preceding Acceptance, replace “requirements/design recording journals a new checkpoint before evidence-order/projection writes” with “superseding requirements/design recording journals a new checkpoint before evidence-order/projection writes”, and replace “stores the persisted `operationId` and `requirementsOrdinal` or `designOrdinal` on every current and historical checkpoint” with “stores `requirementsOrdinal` or `designOrdinal` on every current and historical checkpoint and stores persisted `operationId` only on superseding checkpoints”.
Projection-Operation-ID: Normative acceptance detail: the corrected projection clause requires `requirementsOrdinal` or `designOrdinal` on every current and historical requirements/design checkpoint, but requires persisted `operationId` only on superseding checkpoints at ordinal 2 or greater; ordinal-1 checkpoints MUST omit the `operationId` key rather than storing `null`, an empty string, or a generated value.
Checkpoint-Journal: Normative acceptance detail: `phase-checkpoint-journal-v1` is a normal-journal record kind stored under `.musubix/journal/normal`; its payload contains exactly `schemaVersion: 1`, `changeId`, positive `generation`, `phase` (`requirements` or `design`), `operationId`, positive `ordinal`, `approvalManifestSha256`, sorted `requirementIds`, canonical `fingerprints`, `semanticPhaseKey`, `orderPhaseKey`, `recordedAt`, and positive `fencingToken`; its journal envelope contains exactly `schemaVersion: 1`, positive repository-wide `order`, `stream: normal`, `changeId`, `kind: change-phase-checkpoint`, `idempotencyKey`, `payload`, `previousSha256` (`null` for genesis or 64 lowercase hexadecimal characters), and `recordSha256` (64 lowercase hexadecimal characters computed from the canonical envelope without `recordSha256`); envelope `changeId` MUST equal payload `changeId`, and `idempotencyKey` MUST be exactly `change-phase-checkpoint:<changeId>:g<generation>:<phase>:<operationId>`, making it unique in the normal journal for that scoped operation; replay divergence compares caller-bound `approvalManifestSha256`, sorted `requirementIds`, and canonical `fingerprints` after the scoped CHANGE, generation, phase, and operation ID lookup, while `ordinal`, `semanticPhaseKey`, `orderPhaseKey`, `recordedAt`, `fencingToken`, journal order, predecessor hash, record hash, and the derived idempotency key are validated derived/authority fields reused from the persisted record and never recomputed from replay arguments; an append-time journal idempotency conflict for the same derived key is classified by comparing the existing persisted scoped operation to the requested caller-bound inputs and returns `CHANGE_GENERATION_DUPLICATE` for divergence or the persisted success result for equality.
Operation-Ordering: Normative acceptance detail: pre-lease exit-2 validation covers malformed supplied operation IDs and unsupported phases; whether a syntactically valid ID is missing when supersession is required or invalid because no checkpoint exists is determined under the CHANGE lease after journal-only recovery, may leave those recovery completions persisted, and then exits 2 without journaling the requested operation; all recovery uses only the persisted `phase-checkpoint-journal-v1` payload and never caller arguments; superseding requirements/design checkpoints are exempt from unchanged-fingerprint rejection because the changed approval manifest and operation ID provide the audited supersession identity, `--allow-unchanged` is neither required nor part of replay divergence, and divergent replay after input drift leaves the checkpoint unchanged and requires a new current approval plus a new operation ID before another supersession.
Historical-Pending: Normative acceptance detail: gate and status always include `unprojectedPhaseCheckpoints` arrays, including an empty array, in the active, superseded, and abandoned generation summaries; entries contain generation, phase, operation ID, ordinal, and journal order; active-generation entries are informational and gate/status continue evaluating the current projection, while historical entries remain non-current; the array does not independently change gate/status exit codes or `ready`, does not satisfy or invalidate current evidence, and does not make a valid journal chain non-pass.
Invalid-Checkpoint-Journal: Normative acceptance detail: unreadable JSON, an unknown schema version or kind, a missing or malformed envelope/payload field, envelope/payload CHANGE mismatch, a malformed or incorrectly derived idempotency key, a non-canonical hash, a broken journal predecessor/order/hash chain, an invalid fencing token, two or more persisted journal records sharing the same derived idempotency key regardless of payload equality, two persisted journal records sharing a scoped operation ID with divergent payloads, or a duplicate phase ordinal within the same change ID, generation, and phase is `CHANGE_CHECKPOINT_JOURNAL_INVALID`; caller-input divergence against one valid persisted scoped operation is instead `CHANGE_GENERATION_DUPLICATE`; recovery performs no partial evidence-order or projection write for an invalid record, stateful commands and gate exit 1, status exits 0 with `ready: false`, and the diagnostic is never success-shaped or waivable.

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

## REQ-M5-APPROVAL-010: Name the current approval recovery command
Priority: must
Type: functional
Pattern: unwanted-behavior
Statement: If an approval precondition is not approved and recovery guidance is emitted, then the system shall direct the user to the published `musubix5 approval validate` command.
Acceptance: A stale requirements approval reached through `musubix5 design validate <design.md> --root <workspace> --json` exits with code 2 and produces a `CLI_ERROR` JSON envelope on stdout whose `error.message` contains the exact literal `musubix5 approval validate` and no `musubix3` substring; the shared approval precondition uses the same command literal for every non-approved approval status without changing status classification or exit semantics.

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
Acceptance: Reconciliation processes declarations in their persisted array order and scopes each declaration by its persisted `changeId` and generation rather than a repository-global active CHANGE; `workflow-record --change-id <id>` persists the named active CHANGE's `changeId`, active generation, and current requirement ID set, while omitting it preserves legacy inference only when ownership is unambiguous; declarations bound to another CHANGE or generation are reported as out-of-scope or superseded, never block the selected CHANGE, are never rebound, and never cause `CHANGE_GENERATION_MIXED` during verification; generation-less and change-less historical declarations are treated as generation 1 of the sole CHANGE whose evidence contains them, and ambiguous ownership is foreign evidence under REQ-M5-EVIDENCE-002; superseded-generation declarations are reported but never block the active generation; each declaration uses Skill identity as the invocation key while phase distinguishes separate declarations, and binds the lowest-positioned unused invocation of that Skill whose completed status and timestamps satisfy the configured freshness and event-skew bounds; each Skill maintains its own strictly increasing invocation-position cursor, while different Skills have independent cursors; transcript timestamps are used only for bounded eligibility and never replace persisted declaration order or transcript source position as chronology authority; validly corrected duplicate declarations are excluded before invocation selection, consume no invocation, do not advance the per-Skill cursor, suppress only their declaration-scoped `WORKFLOW_INVOCATION_REUSED` and companion `WORKFLOW_BINDING_MISSING`, and leave all remaining declarations bound exactly as if the corrected duplicate were absent; non-completed declarations and missing, incomplete, failed, reused, duplicate, or same-Skill out-of-order invocations remain non-pass through `WORKFLOW_DECLARATION_NONPASS`, `WORKFLOW_SKILL_NOT_INVOKED`, `WORKFLOW_INVOCATION_INCOMPLETE`, `WORKFLOW_INVOCATION_FAILED`, `WORKFLOW_INVOCATION_REUSED`, `WORKFLOW_DUPLICATE_EVENT`, or `WORKFLOW_INVOCATION_ORDER`; one invocation cannot bind declarations for different CHANGEs or generations; transcript-level duplicate invocation evidence without declaration scope is never correctable; `workflow declaration supersede WORKFLOW_INVOCATION_REUSED --skill <skill> --phase <phase> --recorded-at <timestamp> [--index <n>] --approver <name> --reason <text> --confirm` targets only a declaration-scoped `WORKFLOW_INVOCATION_REUSED` diagnostic that includes Skill, phase, and recorded timestamp; `--recorded-at` must equal the persisted `recordedAt` string byte-for-byte after CLI argument decoding and equivalent timestamps with different textual representations do not match; implicit selection with more than one active CHANGE exits 1 with `CHANGE_GENERATION_MIXED`, while an abandoned null generation or otherwise ineligible known sole CHANGE exits 1 with `CHANGE_GENERATION_PHASE`, and neither case appends a correction; within one active CHANGE with a positive active generation, `--index` is the zero-based absolute position in `workflow.events`, a well-formed matching index is accepted whether or not needed for disambiguation, omission is accepted only when Skill, phase, and recorded timestamp select exactly one declaration, an out-of-range or non-matching index or ambiguous omission exits 1 with `WORKFLOW_DECLARATION_CORRECTION_INVALID`, and a malformed non-integer or negative index exits 2 with `CLI_ERROR`; duplicate identity is the canonical digest of persisted `skill`, `version`, `provenance` or null, `changeId`, generation, sorted requirement ownership, phase, status, `reason` or null, and `commandSha256` or null, explicitly excluding `recordedAt`, while the target and canonical declaration digests include the complete persisted declaration including `recordedAt`; declarations lacking an explicitly persisted `changeId`, positive generation, or requirement ownership are inference-owned historical evidence and are non-correctable with `WORKFLOW_DECLARATION_CORRECTION_INVALID`; duplicate identity is intentionally version- and provenance-scoped, so cross-version or cross-provenance declarations are non-correctable and require abandoning and reopening the generation; the workflow-events head is the lowercase SHA-256 of the REQ-M5-EVIDENCE-003 canonical JSON bytes of the complete persisted `workflow.events` array, and the correction evidence head is defined identically over the complete persisted correction-record array; the target must have the same duplicate-identity digest as the lowest-positioned identical uncorrected declaration, that canonical declaration must not itself be a current correction target, and the sole current `workflow.verification` object produced by the most recent persisted `workflow-verify` must bind a workflow-events head equal to the current persisted `workflow.events` head, pass validation under the current `workflow.mode`, `workflow.expectedSessionId`, `workflow.maxAgeSeconds`, `workflow.maxFutureSkewSeconds`, `workflow.maxEventSkewMs`, `workflow.maxTranscriptBytes`, and `workflow.maxTranscriptLineBytes` configuration using the same mode-dependent checks as normal workflow validation independent of declaration-binding pass or fail, and show the canonical declaration bound to a completed invocation not consumed by another declaration while the target has declaration-scoped `WORKFLOW_INVOCATION_REUSED`; `WORKFLOW_STRICT_SOURCE_MISSING` remains exclusively a release-stage rule under REQ-M5-EVIDENCE-007 and is never a correction-recording precondition in compatible or strict mode; three or more identical declarations require one independently validated correction for each later target and every correction uses the same lowest-positioned canonical declaration, while one target can have only one current correction; a target with a current non-stale workflow waiver cannot be corrected, a target with a valid correction cannot receive a new workflow waiver, either conflicting single-record attempt exits 1 with `WORKFLOW_DECLARATION_CORRECTION_INVALID`, `workflow waiver record-all` recomputes current diagnostics and skips validly corrected targets, stale historical waivers do not conflict, and reconciliation emits only `WORKFLOW_DECLARATION_SUPERSEDED` for a corrected target; while holding the REQ-M5-LIFECYCLE-004 CHANGE lease and current fencing token, the system atomically appends a correction to a separate append-only correction store that is not `workflow.events`, never changes declaration absolute positions or digests, and never changes the workflow-events head bound by the recording verification; the correction's stable identity binds the target absolute position and full declaration digest, canonical absolute position and full declaration digest, duplicate-identity digest, explicitly persisted declaration ownership, expected diagnostic code, canonical invocation identity, persisted verification evidence head and mode observed at recording time, approver, nonblank reason, monotonic order, idempotency key, and correction-chain predecessor hash; the idempotency key is the lowercase SHA-256 of the REQ-M5-EVIDENCE-003 canonical bytes of `changeId`, generation, target absolute position and full declaration digest, canonical absolute position and full declaration digest, and expected diagnostic code; a replay is exact only when every persisted correction field other than correction ID, monotonic order, predecessor hash, and recording timestamp equals the existing record, including approver, reason, canonical invocation identity, and recording verification provenance; an exact replay returns the existing correction and exit 0, while any differing replay or concurrent or later divergent correction for the same target exits 1 with `WORKFLOW_DECLARATION_CORRECTION_INVALID`, fencing loss exits 1 with `LEASE_FENCED`, and no rejected attempt appends or mutates correction evidence; success exits 0 and JSON reports schema version, correction ID, target and canonical positions and digests, duplicate-identity digest, canonical invocation identity, recording verification head and mode, `changeId`, generation, Skill, phase, recorded timestamp, diagnostic code, approver, reason, order, idempotent-replay status, and correction evidence head; missing confirmation, missing approver, blank reason, malformed timestamp or index, unsupported diagnostic code, or malformed identifier exits 2 with `CLI_ERROR`, while missing persisted verification, mismatched workflow-events head, or verification that fails any applicable mode-dependent current workflow configuration check exits 1 with `WORKFLOW_DECLARATION_CORRECTION_INVALID`; verification validates the append-only hash chain, unique target, target and canonical stable identities, lowest canonical position, exact duplicate identity, explicitly persisted correction ownership against the immutable ownership stored on the target and canonical declarations, immutable storage of the recording verification provenance and canonical invocation identity, monotonic order, and fencing provenance, but never re-resolves the recorded canonical invocation identity or ownership against later transcript sources or later CHANGE-document edits; malformed, divergent, multiply targeted, cross-owner, or otherwise invalid evidence is non-pass with `WORKFLOW_DECLARATION_CORRECTION_INVALID`; a valid correction reports informational non-waivable `WORKFLOW_DECLARATION_SUPERSEDED` with the correction ID as audited history, does not make workflow verification, gate, or readiness non-pass, grants no evidence credit of its own, and leaves the canonical declaration and every other declaration subject to normal reconciliation; correction validity depends only on immutable declaration identities, recording verification provenance, explicitly persisted ownership, and correction chain, while failure of the canonical declaration to bind under later current transcript sources produces its normal workflow diagnostic without invalidating the correction; correction evidence cannot be deleted, rewritten, refreshed by waiver, or used to correct a sole missing, failed, incomplete, non-completed, successfully bound, inference-owned, differently owned, cross-CHANGE, or cross-generation declaration; and repeated evaluation of identical inputs yields the same binding set, correction projection, and diagnostics.

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
Statement: While requirement coverage is evaluated, the system shall select the complete Red, Implementation, and Green cycle with the greatest terminal monotonic order that satisfies its workspace and integration-provenance predicates.
Acceptance: A complete cycle has strict Red order before Implementation order before Green order and binds one CHANGE generation, requirement, test, command, and candidate lineage; a parallel assignment cycle additionally requires current provisional or verified integration provenance that consumed its exact assignment attempt and commit range. Selection and coverage are restricted to the active generation, unconsumed parallel cycles are reported with `PARALLEL_TDD_UNCONSUMED`, prior-generation cycles are reported as superseded and cannot satisfy coverage, and repeated evaluation selects the same latest complete eligible cycle and explains every excluded record. Provisional provenance can satisfy only TDD coverage during integration verification; release readiness and cleanup still require passing integration verification and verified provenance.

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
Statement: The system shall isolate each CHANGE in distinct baseline, candidate, and QA workspaces and, where parallel development is enabled, in distinct assignment-attempt, integration-attempt, and verification workspaces using one branch or worktree per workspace role or attempt.
Acceptance: Candidate, parallel assignment, integration, and verification execution cannot modify baseline or QA state; assignment and integration attempts cannot modify each other's worktrees; QA validates an identified candidate snapshot; and evidence records workspace role or attempt, commit, and `repository-identity-v1` identities. `repository-identity-v1` removes leading and trailing ASCII whitespace from the configured origin. If and only if the result matches the complete byte-exact, case-sensitive grammar `https://github.com/<owner>/<repository>[.git][/...]`, where `<owner>` and `<repository>` are non-empty and contain no `/`, `?`, or `#`, `[.git]` is at most one exact case-sensitive suffix, `[/...]` contains only zero or more trailing `/` characters, and removing `[.git]` leaves a non-empty repository name, canonicalization removes all trailing `/` characters, removes the optional `.git` suffix, then removes all trailing `/` characters again. This grammar excludes userinfo, ports, queries, fragments, empty or extra path segments, alternate schemes, and alternate host spelling. Every other non-empty origin uses the ASCII-whitespace-trimmed value with no other transformation; an absent origin or one that trims to empty uses the absolute repository root. The identifier is `repository:` followed by lowercase SHA-256 over the REQ-M5-EVIDENCE-003 canonical JSON bytes of `{ "identity": <canonical-origin-or-root> }`. Thus `https://github.com/Owner/Repo.git/` equals `https://github.com/Owner/Repo`, while owner or repository case changes, another scheme or host spelling, SSH form, credentials, a port, query, fragment, or extra path segment remains distinct. Release evidence producers must therefore use the credential-free GitHub HTTPS origin form; a mismatch diagnostic states that precondition without emitting the origin. Persisting, comparing, manifesting, fingerprinting, and reporting repository identity use only the same canonical digest; raw origin URLs are never persisted or emitted in evidence, manifests, or diagnostics.

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

## REQ-M5-WORKTREE-005: Expose candidate snapshot persistence
Priority: must
Type: functional
Pattern: event-driven
Statement: When a user invokes `candidate-snapshot create <change-id>` for the sole active CHANGE with current requirements and design approvals and a current full-set quality phase record, the system shall persist the current clean reachable branch HEAD as that CHANGE's sole non-deleted immutable candidate snapshot.
Acceptance: The public command supports common `--root` and `--json` options. Before workspace persistence, the handler validates the argument against `CHANGE-<digits>`, resolves the sole active context without using the argument as a selector, and byte-exactly compares it with the argument under the explicit REQ-M5-LIFECYCLE-005 confirmation-token exception. It requires requirements and design approval validation status `approved` for the active generation or fails exit 1 `CANDIDATE_SNAPSHOT_APPROVAL_STALE` with guidance containing the exact literal `musubix5 approval validate`; it requires the active generation's current `quality` phase record to cover exactly the CHANGE document's full sorted requirement-ID set and to have fingerprints equal to current fingerprints or fails exit 1 `CANDIDATE_SNAPSHOT_QUALITY_STALE`. Replay lookup, conflict counting, and later CHANGE-ID selection use only records whose persisted repository ID equals the current canonical repository ID; foreign records remain visible through `list` but do not block a fork or clone from creating its own snapshot. The exact-replay lookup derives the idempotency key defined below and matches the sole live repository-matching record carrying that key; byte-equal branch payload returns that record, while the same key with different branch payload fails exit 1 `JOURNAL_IDEMPOTENCY_CONFLICT`; any other non-deleted repository-matching snapshot for the CHANGE fails exit 1 `CANDIDATE_SNAPSHOT_CONFLICT`. Invalid snapshot record/envelope evidence or a shared normal-journal order, predecessor, or hash-chain defect fails closed before replay/conflict resolution or append with exit 2 `CLI_ERROR` and the exact cause `APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot journal is invalid.`. Malformed syntax is exit 2 `CLI_ERROR`; generation/CHANGE-owner diagnostics retain their existing exit 1 codes; branch-owner and workspace availability failures are exit 2 `CLI_ERROR`. Workspace checks occur in this order: commit resolution, current branch, first delimited CHANGE-token ownership, reachability, canonical repository identity, `candidate-tree-manifest-v1` construction, exact live replay or same-key conflict, other live-snapshot conflict, journal idempotency probe, mutable-worktree cleanliness for a non-replay, then journal append; a dirty non-replay persists nothing. `candidate-tree-manifest-v1` is the canonical projection of every recursively enumerated non-tree Git entry at the commit, sorted by NFC-normalized root-relative POSIX path bytes, with exactly `path`, `gitMode`, `objectType`, and full lowercase hexadecimal `objectId`; its SHA-256 is `artifactManifestDigest`, and raw worktree bytes, credentials, environment values, and unrelated paths are never included. A creation payload contains explicit `recordVersion: 1`, change ID, active generation, repository ID, branch, full 40-to-64-character commit object ID, artifact manifest digest, and ISO-8601 creation time; the journal envelope remains schema version 1. Its stable ID is `snapshot-<12-digit-zero-padded-journal-order>` and its storage path is `.musubix/journal/normal/<12-digit-zero-padded-order>.json`. Its idempotency key binds CHANGE, generation, commit, artifact manifest digest, repository ID, and the greatest preceding tombstone order whose persisted repository ID equals the current canonical repository ID for that CHANGE or zero; exact replay returns the same snapshot ID/order with `replayed: true` before cleanliness validation and appends nothing; after deletion, the repository-matching tombstone-order epoch permits a new record even for the same commit. Branch ownership examines the first maximal delimited `CHANGE-<digits>` token, ignores undelimited and later tokens, and rejects a byte-different owner. Workspace candidate-availability messages are exactly: `APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot requires a clean worktree.`, `APPROVAL_CANDIDATE_UNAVAILABLE: candidate branch belongs to another CHANGE.`, `APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot requires a current branch containing HEAD.`, and `APPROVAL_CANDIDATE_UNAVAILABLE: candidate commit is not reachable from its branch.` Success JSON contains exactly `snapshotId`, `changeId`, `generation`, `repositoryId`, `branch`, `commit`, `artifactManifestDigest`, `createdAt`, `order`, `journalPath`, `replayed`, and nonempty `guidance`; the timestamp is generated only for a new record after replay/conflict checks. The journal record is post-candidate evidence, is excluded from the candidate tree and current requirements/design/quality fingerprint basis, and cannot by itself stale the snapshot. Text and JSON guidance instruct committing the new journal record without amending the candidate, inspecting it with `candidate-snapshot show <snapshot-id>`, then running candidate-bound gates before release approval.
Journal-Defect-Classification: Normative replacement: within the preceding Acceptance, replace “Invalid snapshot record/envelope evidence or a shared normal-journal order, predecessor, or hash-chain defect fails closed before replay/conflict resolution or append with exit 2 `CLI_ERROR` and the exact cause `APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot journal is invalid.`” with “Invalid snapshot record/envelope evidence, or a shared normal-journal defect attributable to a snapshot creation or tombstone record, fails closed before replay/conflict resolution or append with exit 2 `CLI_ERROR` and the exact cause `APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot journal is invalid.`; a shared order, predecessor, or hash-chain defect attributable to a `change-phase-checkpoint` record instead retains exit 1 `CHANGE_CHECKPOINT_JOURNAL_INVALID` under REQ-M5-LIFECYCLE-005.”
Journal-Defect-Attribution: Normative detail: a predecessor or hash-chain defect is attributed to the later record in journal order, an order defect is attributed to the duplicate or out-of-sequence record, and when more than one defect exists the lowest journal-order defective record determines create/delete classification.
Duplicate-Order-Attribution: Normative detail: when records share one envelope order, a record whose root-relative storage path is not the canonical `.musubix/journal/normal/<12-digit-zero-padded-order>.json` is defective; if every duplicate has a non-canonical path, the byte-wise lexicographically greatest root-relative path is attributed, and the lowest attributed envelope order still determines create/delete classification.
Create-Lease-Ordering: Normative detail: syntax, sole-active confirmation-token resolution, approval/quality preconditions, commit, branch, ownership, reachability, repository identity, and candidate-tree manifest construction complete before lease acquisition and persist nothing on failure; the command then acquires the REQ-M5-LIFECYCLE-004 CHANGE lease, re-resolves the sole active CHANGE/generation, and repeats the byte-exact argument confirmation, returning `CHANGE_GENERATION_PHASE` for no active CHANGE or token mismatch and `CHANGE_GENERATION_MIXED` for multiple active CHANGEs without persistence. It then re-resolves commit, current branch, branch ownership, reachability, repository identity, candidate-tree manifest, and approval/quality preconditions before journal validation, replay, conflict, idempotency, cleanliness, and append. The post-lease workspace resolution is authoritative for the persisted payload, manifest digest, and idempotency key; drift in commit, branch, manifest digest, or tombstone epoch from pre-lease advisory values is not itself a failure, while CHANGE/generation identity and repository identity must still satisfy their post-lease checks, and any failed post-lease check reuses that check's pre-lease diagnostic and exit code and persists nothing.

## REQ-M5-WORKTREE-006: Inspect candidate snapshot lifecycle
Priority: must
Type: functional
Pattern: event-driven
Statement: When a user invokes `candidate-snapshot list` or `candidate-snapshot show <change-id-or-snapshot-id>`, the system shall expose deterministic, secret-free candidate snapshot provenance and release eligibility without requiring internal APIs.
Acceptance: Both commands support common `--root` and `--json` options and are read-only. `list` exits 0 for every valid journal, including repositories containing conflicting or stale historical CHANGEs and repositories with zero or multiple active CHANGE documents, and returns an array of snapshot projection objects ordered by ascending journal `order`; invalid snapshot record/envelope evidence or a shared normal-journal order, predecessor, or hash-chain defect observed by `list` or `show` makes those commands exit 2 `CLI_ERROR` with the exact cause `APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot journal is invalid.`, while gate and status continue classifying a checkpoint-caused shared-chain defect as `CHANGE_CHECKPOINT_JOURNAL_INVALID` under REQ-M5-LIFECYCLE-005. `show --json` returns exactly one object with the identical projection shape. Each projection contains exactly `snapshotId`, `recordVersion`, `legacy`, `changeId`, `generation`, `repositoryId`, `branch`, `commit`, `artifactManifestDigest`, `createdAt`, `order`, `journalPath`, `deleted`, optional `deletedAt`, optional `deletedBy`, `requirementsApprovalStatus`, `designApprovalStatus`, `qualityStatus`, `candidateGateStatus`, `commitStatus`, `repositoryStatus`, `releaseApprovalStatus`, `eligibilityStatus`, `replacementRequired`, `protected`, and `guidance`; live projections omit `deletedAt` and `deletedBy` rather than emitting null. Boolean fields are `legacy`, `deleted`, `replacementRequired`, and `protected`; approval statuses are `approved | missing | stale | not-current`; `qualityStatus` is `current | missing | stale | not-current`; `candidateGateStatus` is `pass | missing | stale | fail | not-current`; `commitStatus` is `reachable | unreachable`; `repositoryStatus` is `match | foreign`; `releaseApprovalStatus` is `current | missing | stale | not-current`; and `eligibilityStatus` uses first-match precedence `deleted`, `conflicting`, `foreign-repository`, `unreachable`, `stale`, then `eligible`. `repositoryStatus` is `match` exactly when the persisted repository ID equals the current canonical repository ID and otherwise is `foreign`; `commitStatus` is `reachable` exactly when the commit object exists, the persisted branch exists, and the commit is equal to or an ancestor of that branch tip, while a missing object, missing branch, shallow-history absence, or non-ancestor is `unreachable`. For requirements and design, `approved` means the snapshot generation has a validating approved record with current fingerprints, `missing` means no record exists for that stage and generation, `stale` means a record exists for that stage and generation but validation or fingerprints are non-current, and `not-current` means the snapshot is legacy, deleted, belongs to a non-current generation, or its CHANGE is unknown or not the sole active CHANGE. For quality, `current` means the snapshot generation has the exact full sorted requirement set and current fingerprints, `missing` means no quality phase record exists for that generation, `stale` means such a record exists but its set or fingerprints are non-current, and `not-current` means the snapshot is legacy, deleted, belongs to a non-current generation, or its CHANGE is unknown or not the sole active CHANGE. Candidate gate status is `not-current` for a legacy, deleted, non-current-generation, unknown-CHANGE, or non-sole-active snapshot; otherwise it is `missing` when no record binds the commit or any required current matrix job is absent, `stale` when records bind the commit but their gate-input fingerprint, producer, matrix identity, or other required provenance is non-current, `fail` when a complete current-provenance matrix contains a non-pass result, and `pass` only when the complete current-provenance matrix passes. A live snapshot is `stale` when it is legacy, its generation is null or not the current active generation, requirements/design approvals are not `approved`, quality is not `current`, or candidate gate status is not `pass`; only the sole live repository-matching snapshot for the sole active CHANGE can be `eligible`. `replacementRequired` is true only for a live repository-matching snapshot that is legacy, belongs to a non-current generation, is unreachable, or no longer matches current requirements/design/quality basis; missing/stale/failed candidate gates alone leave it false and require gate-run guidance rather than deletion. Multiple live repository-matching snapshots for an inactive CHANGE remain visible as `conflicting` without making `list` fail`; foreign snapshots do not participate in conflict selection. For every known CHANGE document marked active, including during mixed authoring state and including its legacy records, a valid recorded release approval for that document's current generation selects and protects its sole live repository-matching snapshot only when its commit byte-exactly matches the persisted approval candidate; mixed authoring remains non-ready but cannot remove this protection. For a known completed or inactive CHANGE, release selection and protection use the canonical REQ-M5-RELEASE-002 historical rule without rebuilding candidate manifests or requiring gate evidence. Records for unknown CHANGEs have `releaseApprovalStatus: not-current` and `protected: false`. `releaseApprovalStatus` is `current` only for the snapshot selected by the applicable active-document or historical rule, `missing` when no release approval is recorded for the snapshot's CHANGE and generation, `stale` when a same-generation approval exists but is invalid or its persisted candidate does not select that snapshot, and `not-current` when approval exists only for another generation or lifecycle reopening has superseded it; only `current` sets `protected: true`. Display eligibility is diagnostic only and does not retroactively invalidate a recorded approval. `show` exits 0 for an exact snapshot ID including deleted or unknown-CHANGE history, and for a CHANGE ID only when the CHANGE document is known and exactly one live repository-matching snapshot exists; zero live snapshots fail exit 1 `CANDIDATE_SNAPSHOT_MISSING`, multiple fail exit 1 `CANDIDATE_SNAPSHOT_CONFLICT`, an unknown CHANGE-ID selector fails exit 1 `CHANGE_GENERATION_PHASE`, and malformed selectors fail exit 2 `CLI_ERROR`. Human output contains the same fields and executable recovery guidance. Legacy creation payloads are detected only by absence of payload-level `recordVersion` while their journal envelope remains schema version 1; any present value other than integer `1`, including `0`, fails as invalid evidence; `generation`, `artifactManifestDigest`, and `createdAt` are `null`, projected `recordVersion` is `0`, `legacy` and `replacementRequired` are `true`, requirements/design/quality/candidate-gate statuses are `not-current`, commit/repository statuses are computed by the preceding rules, release approval status/protection use the active-document rule when its CHANGE document is marked active, use the canonical historical rule for a known completed/inactive CHANGE, and otherwise are `not-current` and false, and they remain showable and deletable. No output exposes origin URLs, credentials, environment secrets, or unrelated workspace content. When release approval is unavailable because the active CHANGE has no live repository-matching snapshot, `approval prepare release` reports `APPROVAL_CANDIDATE_MISSING` with the exact resolved command `musubix5 candidate-snapshot create CHANGE-<digits>` using the active ID and the diagnostic-derived placeholder hash changes accordingly; when the sole live repository-matching snapshot is legacy or belongs to a non-current generation, and when multiple live snapshots exist, release preparation reports `APPROVAL_CANDIDATE_UNAVAILABLE` with guidance to run `candidate-snapshot list`, delete obsolete or replacement-required snapshots, and then create the current snapshot. `status.next` inserts create immediately before release prepare and record only when release is required or present and create preconditions are current; when one live snapshot has `replacementRequired: true`, it inserts `musubix5 candidate-snapshot delete <snapshot-id> --deleted-by <name> --confirm` before create. When exactly one live repository-matching snapshot exists, `replacementRequired` is false, and only its candidate gates are non-pass, status emits gate-run guidance and never delete/create; candidate-gate status never suppresses create when no live snapshot exists. In domain mode, outstanding domain requirements/design actions precede the same candidate/delete/gate/release ordering; otherwise existing approval/quality recovery guidance precedes candidate commands.
Release-Guidance-Correction: Normative replacement: within the preceding Acceptance, replace the sentence beginning “When release approval is unavailable” through the sentence ending “before create” with: “When release approval is unavailable because the active CHANGE has no non-deleted snapshot record of any repository identity, `approval prepare release` reports `APPROVAL_CANDIDATE_MISSING` with the exact resolved command `musubix5 candidate-snapshot create CHANGE-<digits>` using the active ID and the diagnostic-derived placeholder hash changes accordingly; when non-deleted records exist but all are foreign, when the sole live repository-matching snapshot is legacy or belongs to a non-current generation, and when multiple live repository-matching snapshots exist, release preparation reports `APPROVAL_CANDIDATE_UNAVAILABLE` with guidance to run `candidate-snapshot list`, delete obsolete or replacement-required snapshots when applicable, and then create the current snapshot. `status.next` inserts create immediately before release prepare and record only when release is required or present, create preconditions are current, and no live repository-matching snapshot exists for the sole active CHANGE, or after a preceding delete command when its sole live snapshot has `replacementRequired: true`; when that replacement-required snapshot is protected, status first emits the REQ-M5-WORKTREE-007 reopen recovery guidance before delete and create.”
Historical-Projection: Normative detail: when the canonical REQ-M5-RELEASE-002 historical rule rejects a multiple-record state, `list` and exact-snapshot-ID `show` still exit 0, project `releaseApprovalStatus: stale` and `protected: false`, and provide conflict recovery guidance.
Status-Next-Preconditions: Normative clarification: current create preconditions apply to both alternatives in `Release-Guidance-Correction`; approval and quality recovery actions precede every delete/create insertion, create is never emitted while those preconditions are non-current, and a protected replacement additionally inserts reopen recovery before delete. When multiple live repository-matching snapshots exist for the active CHANGE, `status.next` emits list guidance followed by commands to delete explicitly selected obsolete snapshots, emits no create while multiple remain, and reevaluates the zero-or-sole-live rules after each deletion.
Read-Only-Journal-Classification: Normative detail: `list` and `show` intentionally use the uniform exit 2 candidate-journal cause for every shared-chain defect they observe and do not perform the record-kind attribution required only for state-changing create/delete and gate/status classification.
Gate-Status-Journal-Classification: Normative detail: gate and status classify every shared normal-journal order, predecessor, or hash-chain defect as `CHANGE_CHECKPOINT_JOURNAL_INVALID` regardless of attributed record kind; record-kind attribution changes only `candidate-snapshot create` and `candidate-snapshot delete`.
Multiple-Live-Status-Ordering: Normative replacement: within `Status-Next-Preconditions`, replace “commands to delete explicitly selected obsolete snapshots” through “reevaluates the zero-or-sole-live rules after each deletion” with “one delete command for every live repository-matching snapshot in ascending creation journal order; create is never emitted in that status output, and zero-or-sole-live rules are reevaluated only on the next status invocation after persisted deletions.”
Conflict-Eligibility: Normative detail: `eligibilityStatus` is `conflicting` for every live repository-matching snapshot whenever two or more live repository-matching snapshots exist for the same CHANGE, whether its document is active, completed, otherwise inactive, or absent/unknown; foreign live records do not participate and retain `foreign-repository`. `list` remains exit 0 for every such valid historical, active, or unknown-CHANGE conflict.

## REQ-M5-WORKTREE-007: Retire candidate snapshots audibly
Priority: must
Type: functional
Pattern: event-driven
Statement: When a user invokes `candidate-snapshot delete <change-id-or-snapshot-id> --deleted-by <name> --confirm`, the system shall retire exactly one candidate snapshot through append-only audited evidence without deleting or rewriting its creation record.
Acceptance: The command supports common `--root` and `--json` options and is a non-credit CHANGE maintenance operation permitted by the explicit REQ-M5-LIFECYCLE-005 maintenance exception for active, completed, abandoned, foreign-repository, unknown-CHANGE, or generation-less legacy records under the CHANGE lease, with legacy records treated as generation 1 only for lease ownership. Blank or malformed selectors, blank `--deleted-by`, or missing `--confirm` fail exit 2 `CLI_ERROR`; snapshot IDs resolve exactly, including a foreign-repository or unknown-CHANGE record, and acquire the lease keyed by the persisted CHANGE ID; a CHANGE ID requires a known CHANGE document, considers only repository-matching records, and resolves its sole live snapshot, or when none is live falls back to its sole tombstoned snapshot solely for delete replay. An unknown CHANGE-ID selector fails exit 1 `CHANGE_GENERATION_PHASE`; a known CHANGE with no repository-matching creation record fails exit 1 `CANDIDATE_SNAPSHOT_MISSING`; multiple live or multiple tombstoned fallback candidates fail exit 1 `CANDIDATE_SNAPSHOT_CONFLICT`. Invalid snapshot record/envelope evidence or a shared normal-journal order, predecessor, or hash-chain defect fails closed before replay, protection evaluation, or append with exit 2 `CLI_ERROR` and the exact cause `APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot journal is invalid.`. If the projection defined by REQ-M5-WORKTREE-006 sets `protected: true`, deletion fails exit 1 `CANDIDATE_SNAPSHOT_PROTECTED` with recovery guidance that, for a document marked active, runs `change-record <change-id> impact --reopen` with its current requirement set before retrying deletion, and, for a completed or otherwise inactive known CHANGE, first instructs repository authors to leave no other active CHANGE document and set the target document frontmatter to `status: active`, then runs that same reopen command before retrying; no `--force`, unscoped bulk-delete, or approval-bypass path exists. A new deletion generates `deletedAt` only after replay/protection checks and appends a payload-level `recordVersion: 1` `workspace-candidate-snapshot-deleted` record to `.musubix/journal/normal/<12-digit-zero-padded-tombstone-order>.json` with idempotency key bound to snapshot ID and `deletedBy`; its payload persists the deleted creation record's repository ID, snapshot ID/order, CHANGE ID, commit, nullable artifact manifest digest, `deletedBy`, ISO-8601 `deletedAt`, pre-deletion `releaseApprovalStatus`, nullable `releaseApprovalArtifactSha256`, and `invalidatedStates`. Exact replay with the same snapshot and `deletedBy`, including through the same CHANGE-ID selector, exits 0 with `replayed: true` and returns the existing tombstone fields verbatim; a repeat with a different actor fails exit 1 `CANDIDATE_SNAPSHOT_ALREADY_DELETED`. Success JSON contains exactly `snapshotId`, `changeId`, `commit`, `artifactManifestDigest`, `deletedBy`, `deletedAt`, `releaseApprovalStatus`, `releaseApprovalArtifactSha256`, `tombstoneOrder`, `tombstonePath`, `replayed`, `invalidatedStates`, and `guidance`; persisted `invalidatedStates` is an ascending byte-sorted array containing `candidate-gate` when any candidate-bound gate record binds the snapshot commit, `release-manifest` when any persisted release manifest projection binds it, and `release-approval` when any recorded release approval binds it. The creation record and Git commit remain untouched, list/show retain the full audit history, the tombstoned snapshot cannot satisfy release approval or candidate gates, and only a tombstone whose persisted repository ID equals the current canonical repository ID contributes the next create epoch, so deletion of a foreign snapshot cannot perturb local creation replay and a later local create may persist a new sole live snapshot, including the same commit.
Journal-Defect-Classification: Normative replacement: within the preceding Acceptance, replace “Invalid snapshot record/envelope evidence or a shared normal-journal order, predecessor, or hash-chain defect fails closed before replay, protection evaluation, or append with exit 2 `CLI_ERROR` and the exact cause `APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot journal is invalid.`” with “Invalid snapshot record/envelope evidence, or a shared normal-journal defect attributable to a snapshot creation or tombstone record, fails closed before replay, protection evaluation, or append with exit 2 `CLI_ERROR` and the exact cause `APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot journal is invalid.`; a shared order, predecessor, or hash-chain defect attributable to a `change-phase-checkpoint` record instead retains exit 1 `CHANGE_CHECKPOINT_JOURNAL_INVALID` under REQ-M5-LIFECYCLE-005.”
Journal-Defect-Attribution: Normative detail: deletion uses the REQ-M5-WORKTREE-005 attribution rule, including later-record attribution and lowest-order-defect precedence.
Delete-Lease-Ordering: Normative detail: usage and selector syntax validation plus initial snapshot-ID or known CHANGE-ID resolution complete before lease acquisition and persist nothing; a snapshot-ID operation derives the provisional lease key from the initially read persisted CHANGE ID, while a CHANGE-ID selector uses that known ID. The command acquires the REQ-M5-LIFECYCLE-004 CHANGE lease, re-reads and validates the journal, requires the post-lease selected record's CHANGE ID to equal the lease key, and under the lease re-resolves live/tombstoned selection, exact replay, actor equality, release-approval protection, invalidated states, and tombstone payload before append. Lease-key divergence fails without persistence as exit 2 `CLI_ERROR` with the exact cause `APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot journal is invalid.`; every other post-lease failure persists nothing and uses the corresponding `CHANGE_GENERATION_PHASE`, `CANDIDATE_SNAPSHOT_MISSING`, `CANDIDATE_SNAPSHOT_CONFLICT`, `CANDIDATE_SNAPSHOT_ALREADY_DELETED`, `CANDIDATE_SNAPSHOT_PROTECTED`, `CHANGE_CHECKPOINT_JOURNAL_INVALID`, or candidate-journal `CLI_ERROR` classification already defined by this requirement.

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
Acceptance: Release approval alone cannot publish, create a tag, push, publish a package, or create a GitHub Release; each requested external operation records a repository-unique operation identifier, its authorizer, exact candidate identity, current release-approval artifact SHA-256, one scope from `publish | release | tag | push`, release tag, confirmation, and status from `authorized | executing | completed` before execution. An automated workflow that executes an external operation requires exactly one record matching the requested identifier, validates that the candidate-bound record has `status: authorized` before the side effect, uses operation-specific concurrency, rejects an already existing package version or GitHub Release target as a replay, and records the terminal outcome in an immutable run-scoped artifact and job summary rather than a repository commit; zero matches, duplicate identifiers, missing, mismatched, non-authorized, or replayed authorization fails closed with `RELEASE_OPERATION_NOT_AUTHORIZED`. Repository identity is not accepted as a self-reported operation-record field; it is independently re-established through the current candidate-bound release approval under REQ-M5-RELEASE-002. A protected GitHub environment review is an additional independent control and does not replace the repository authorization record.

For REQ-M5-RELEASE-001, `executing` and `completed` are retained only for the
deprecated local `executeReleaseOperation` compatibility API, whose local
writer records those transitions. Public release workflows are read-only
consumers, accept only `authorized`, never write those states to repository
history, and rely on target-existence checks rather than status mutation for
replay protection.

## REQ-M5-RELEASE-003: Provide candidate-bound release automation
Priority: must
Type: functional
Pattern: ubiquitous
Statement: The system shall provide an executable GitHub Actions release workflow that validates and packages an immutable candidate before creating a separately authorized GitHub Release.
Acceptance: `.github/workflows/release.yml` runs for pushed `v*` tags and explicit manual dispatch. A tag-push run performs validation and artifact production only and cannot publish npm or create a GitHub Release. A manual-dispatch run requires the workflow ref and `release_tag` input to identify the same tag and exact `GITHUB_SHA`; requires a full-SHA `evidence_commit` input that is a descendant of the tagged candidate and reachable from the repository default branch; and requires a `release_operation_id` input identifying the REQ-M5-RELEASE-001 record to validate. That evidence commit contains a current REQ-M5-RELEASE-002 release approval, and the identified operation record has `status: authorized`, scope exactly `release`, release tag equal to `release_tag`, candidate identity equal to the tagged commit, and release-approval SHA-256 equal to the independently derived value at `evidence_commit`; any absent or inconsistent binding fails closed before a side effect. The workflow fetches enough history for the tagged candidate, evidence commit, tag, and default-branch ref to be present before validation; absent or unreachable candidate/tag ancestry emits `RELEASE_TAG_CANDIDATE_MISMATCH`, document or version mismatch emits `RELEASE_VERSION_MISMATCH`, and non-current approval, authorization, or repository identity emits `RELEASE_OPERATION_NOT_AUTHORIZED`. Read-only authorization validation from a detached evidence checkout accepts the persisted candidate when its exact commit is present and reachable through fetched repository refs, compares repository ownership through REQ-M5-WORKTREE-001 `repository-identity-v1`, and does not require a same-named local branch. Only the enumerated GitHub HTTPS trailing-slash and single-`.git` differences are equivalent; any different canonical form, including another scheme, userinfo, SSH form, host case, owner, or repository, fails with `RELEASE_OPERATION_NOT_AUTHORIZED` before candidate reachability can authorize a side effect. The release tag equals `v` plus every `version` value in `package.json`, `packages/*/package.json`, `plugin.json`, and both the catalog and plugin entries in `.github/plugin/marketplace.json`. Let `<version>` be the release tag without its leading `v`. `README.md`, `README-ja.md`, and `CHANGELOG.md` must exist, be readable strict UTF-8, normalize CRLF or CR to LF, and NFC-normalize before inspection. Each README contains exactly one exact `# musubix5` title. Its preamble locator is the first line after that title and before the first subsequent line beginning `## ` whose first two characters are `**`. The section locator is the first non-empty paragraph after the exact `## Upgrade` or `## アップグレード` heading, ending at the next blank line; internal line breaks are replaced by one U+0020 and runs of ASCII spaces are collapsed to one. The `README.md` preamble starts with `**<version> ·`, and its normalized Upgrade paragraph starts with `The \`upgrade\` command is included in musubix5 <version>.` followed by end-of-paragraph or U+0020. The `README-ja.md` preamble starts with `**<version> ·`, and its normalized アップグレード paragraph starts with `` `upgrade` commandはmusubix5 <version>に含まれます。`` with no following-character constraint. On those four located strings, ASCII tokens are compared after ASCII case folding with token boundaries at the start, end, or any non-ASCII-alphanumeric character; no token equals `unreleased`, `candidate`, `prerelease`, `rc`, `beta`, or `alpha`, no string contains ASCII-case-insensitive `pre-release`, and no string contains `未リリース`. In `CHANGELOG.md`, outside fenced code blocks, the first line beginning exactly `## ` is exactly `## <version>`. For every line outside fenced code blocks beginning exactly `## `, the trimmed heading text after `## ` must contain neither ASCII-case-insensitive `unreleased` nor `未リリース`. An absent, unreadable, non-strict-UTF-8 document, missing locator, or mismatch fails with `RELEASE_VERSION_MISMATCH` before artifact production or GitHub Release creation. Validation runs typecheck, build, full tests, compatibility tests, package checks, and package smoke tests with exit code zero against the tagged commit; formal classification remains advisory under REQ-M5-QUALITY-002 and grants no proof credit when unsupported. Artifact production creates the npm tarball, a CycloneDX SBOM, canonical `release-context-v1`, and `SHA256SUMS` covering at least the tarball, SBOM, and release context. The tarball must contain `package/README.md`, `package/README-ja.md`, and `package/CHANGELOG.md` in addition to its package manifest and executable content. `release-context-v1` uses the canonical JSON encoding defined for REQ-M5-EVIDENCE-003 records and SHA-256 over its exact on-disk bytes. In tag-push mode it records and the attestation binds only the repository identity, release tag, tagged candidate commit, workflow identity, canonical release-context digest, and SHA-256 of `SHA256SUMS`; release evidence commit and release-approval members are absent rather than null or empty. In manual-dispatch mode the context and attestation additionally bind the release evidence commit and independently derived current release-approval SHA-256 at that evidence commit. The release job independently derives the expected context from the run trigger mode (`tag-push` for a tag-push run or `dispatch` for manual dispatch), verified repository identity, workflow identity, release tag, tagged candidate, and, in `dispatch` mode only, the evidence commit and release-approval digest; expected mode is never taken from the sealed context. Context equality is established only when the parsed context passes schema validation and the verified exact on-disk bytes equal the canonical encoding of that expected context. A context with equal canonical bytes must not be rejected by any additional serialization, property-insertion-order, whitespace, or key-order comparison. Schema failure or unequal canonical bytes fails closed with `RELEASE_ATTESTATION_INVALID` before GitHub Release creation or any other side effect. The release job re-verifies `SHA256SUMS`, release context, and attestation using the strict REQ-M5-EVIDENCE-003 trust rules before creating the GitHub Release and uploading every sealed artifact including `release-context.json`. The workflow has no npm publication input or job. Before every GitHub Release CLI/API operation, the workflow derives `repository-identity-v1` from the event repository's credential-free GitHub HTTPS URL and requires equality with the canonical identity already derived from the candidate checkout; mismatch fails with `RELEASE_OPERATION_NOT_AUTHORIZED`. Target lookup, creation, and asset upload explicitly address that verified event repository without depending on the process working directory or an ambient Git checkout. Target absence is authoritative only when an authenticated Releases-by-tag query for the exact repository and tag returns a machine-readable HTTP 404 and a complete authenticated draft-inclusive Release enumeration contains no item with that exact tag. That combined result permits creation to continue; any existing stable, prerelease, or draft target fails with `RELEASE_OPERATION_NOT_AUTHORIZED`, while incomplete enumeration, pagination failure, a non-zero command without the exact 404, authentication or permission failure, network failure, repository-resolution failure, unparsable response, or any other non-authoritative result fails closed with `RELEASE_TARGET_LOOKUP_FAILED` before Release creation. The workflow emits a run-scoped terminal outcome artifact and job summary and grants each job only the minimum permissions required for checkout, OIDC, or release creation.

For REQ-M5-RELEASE-003, the following mode-specific member rules govern and
supersede the preceding compact context/attestation member wording. The
authorization record is read from repository state at `evidence_commit`, and
exactly one record must match
`release_operation_id`; zero or duplicate matches fail with
`RELEASE_OPERATION_NOT_AUTHORIZED`. The release tag is a lightweight tag that
points directly at the candidate commit; an annotated tag fails with
`RELEASE_TAG_CANDIDATE_MISMATCH` before artifact production. All version and
document checks read the tagged candidate tree; the evidence checkout is used
only for authorization-record and approval-digest derivation. Artifact
production writes the tarball, SBOM, and canonical release context first, then
writes `SHA256SUMS` over those files, then creates the attestation over the
context and checksum digests. The release context never records either digest.
Its mode is exactly `tag-push` or `dispatch`; any other value fails with
`RELEASE_ATTESTATION_INVALID`. In `tag-push` mode the context records only mode,
repository identity, release tag, tagged candidate commit, and workflow
identity; its attestation binds those members plus the context digest and
checksum digest. In `dispatch` mode the context additionally records the release
evidence commit and independently derived release-approval SHA-256, and the
attestation additionally binds those members. The OIDC-bound Ed25519
attestation uses `id-token: write`; it does not require GitHub
`attestations: write`.

For REQ-M5-RELEASE-003, the README preamble locator wording means the first line
whose first two characters are `**`, searched from the line after the unique
title up to but excluding the first subsequent line beginning `## `. For its
CHANGELOG rules, only a line whose first three characters are three backticks
toggles fenced-code state; tilde and indented fences have no special meaning,
an opening line may contain an info string, and EOF while fenced fails with
`RELEASE_VERSION_MISMATCH`.

## REQ-M5-RELEASE-004: Publish the exact immutable GitHub Release package
Priority: must
Type: functional
Pattern: event-driven
Statement: When npm publication is explicitly requested, the system shall publish the exact verified package tarball from an existing stable GitHub Release through a separate token-authenticated workflow.
Acceptance: `.github/workflows/npm-publish.yml` runs only by explicit manual dispatch with `release_tag`, full-SHA `evidence_commit`, and `publish_operation_id` inputs. It requires the named lightweight `v*` tag and an existing non-draft, non-prerelease GitHub Release created by the REQ-M5-RELEASE-003 workflow for the same tagged candidate. The evidence commit must be a descendant of the tagged candidate and reachable from the repository default branch. Read-only authorization validation from a detached evidence checkout accepts the persisted candidate when its exact commit is present and reachable through fetched repository refs, compares repository ownership through REQ-M5-WORKTREE-001 `repository-identity-v1`, and does not require a same-named local branch. Only the enumerated GitHub HTTPS trailing-slash and single-`.git` differences are equivalent; any different canonical form, including another scheme, userinfo, SSH form, host case, owner, or repository, fails with `RELEASE_OPERATION_NOT_AUTHORIZED`, and the workflow fetches enough history for the tagged candidate, evidence commit, and default-branch ref to be present before validation. The workflow validates the REQ-M5-RELEASE-001 authorization record identified by `publish_operation_id`, requiring `status: authorized`, scope exactly `publish`, release tag equal to `release_tag`, candidate identity equal to the commit named by the `v*` tag, and release-approval artifact SHA-256 equal to the independently derived SHA-256 of the current REQ-M5-RELEASE-002 release approval at `evidence_commit`. A missing record, field mismatch, non-`publish` scope, non-`authorized` status, or already published package version fails closed with `RELEASE_OPERATION_NOT_AUTHORIZED` before publication. An absent tag or absent, draft, or prerelease Release fails with `RELEASE_TAG_CANDIDATE_MISMATCH`.

For REQ-M5-RELEASE-004, the authorization record is read from repository state
at `evidence_commit`, and exactly one record must match
`publish_operation_id`; zero or duplicate matches fail with
`RELEASE_OPERATION_NOT_AUTHORIZED`. The downloaded release context must have
mode `dispatch` and contain the release evidence commit and release-approval
SHA-256; tag-push mode or any missing manual-dispatch member fails with
`RELEASE_ATTESTATION_INVALID` before any registry side effect.

The workflow runs in the protected `npm-publish` environment, requires `NPM_TOKEN`, verifies authentication with `npm whoami`, and exposes the token only to authentication, publication, and registry-verification steps. Before every GitHub Release CLI/API operation, the workflow derives `repository-identity-v1` from the event repository's credential-free GitHub HTTPS URL and requires equality with the canonical identity already derived from the tagged candidate checkout; mismatch fails with `RELEASE_OPERATION_NOT_AUTHORIZED`. Stable-release lookup and asset download explicitly address that verified event repository without depending on the process working directory or an ambient Git checkout. Stable-release existence is established only by an authenticated, machine-readable response for the exact release tag from that verified repository. An exact machine-readable HTTP 404 response from the Releases-by-tag API means the Release is absent and fails with `RELEASE_TAG_CANDIDATE_MISMATCH`; a successful response identifying a draft or prerelease fails with the same diagnostic. A non-zero command without that exact response, authentication or permission failure, network failure, repository-resolution failure, asset-download failure, unparsable response, or any other non-authoritative result fails with `RELEASE_TARGET_LOOKUP_FAILED` before token use or any registry side effect. It downloads the Release assets with authenticated `gh release download`, verifies `SHA256SUMS`, and downloads and re-verifies canonical `release-context-v1` from `release-context.json` and the Release attestation under the strict REQ-M5-EVIDENCE-003 trust rules. The attestation must bind the repository identity, release tag, tagged candidate commit, release evidence commit and release-approval SHA-256 from `release-context.json`, SHA-256 over the exact canonical release-context bytes, and SHA-256 of the locally verified `SHA256SUMS`. The release evidence commit must be an ancestor of the publish dispatch's `evidence_commit`; the release-approval SHA-256 recorded in `release-context.json` must equal the release-approval SHA-256 independently derived at both the release evidence commit and the publish dispatch's `evidence_commit`. An absent, untrusted, stale, or mismatched context or attestation fails with `RELEASE_ATTESTATION_INVALID` before any registry side effect. Attestation verification must complete before any tarball decompression or tar entry parsing. Extraction is one bounded pass with the design-approved decompressed-output and selected-entry byte caps; exceeding a cap or encountering a malformed, duplicate, missing, linked, non-regular, or aliased selected entry fails closed with `RELEASE_VERSION_MISMATCH`. Failed `SHA256SUMS` verification or a tarball, SBOM, or release context not covered by it fails with `RELEASE_ARTIFACT_CHECKSUM_MISMATCH`. The workflow requires exactly one `musubix5-<version>.tgz` and lets `<version>` be `release_tag` without its leading `v`. It verifies that the embedded `package/package.json` version equals `<version>`, and that tar entries `package/README.md`, `package/README-ja.md`, and `package/CHANGELOG.md` exist and satisfy the exact UTF-8, newline, NFC, locator, version, heading, and transient-qualifier rules required by REQ-M5-RELEASE-003 using that same `<version>`. A missing packaged document or mismatch fails with `RELEASE_VERSION_MISMATCH` before token use and before any registry side effect. Before token use, an npm version query returning the existing version fails with `RELEASE_OPERATION_NOT_AUTHORIZED`, an explicit JSON `E404` response permits publication to continue, and any other registry response or unparsable output fails closed with `RELEASE_REGISTRY_QUERY_FAILED`.

The workflow checks out `evidence_commit` for validation only; npm provenance attests the publication run, while artifact-to-candidate binding is established by the verified REQ-M5-RELEASE-003 attestation. It publishes the exact verified tarball without rebuilding or repacking by running `npm publish <tarball> --provenance --access public --ignore-scripts` from a working directory containing no `package.json`. It computes the local tarball SHA-512 SRI and polls registry `dist.integrity` using a design-approved fixed attempt count and total deadline. If registry visibility or integrity does not match within that bound, the run fails with `RELEASE_PUBLISH_INTEGRITY_MISMATCH`, and the run-scoped terminal outcome records that publication may already have occurred and requires manual reconciliation. The workflow uses a concurrency group derived from the `publish` scope and `release_tag` with `cancel-in-progress: false`, emits a run-scoped terminal outcome artifact and job summary, and receives only `contents: read` and `id-token: write` permissions.

## REQ-M5-RELEASE-002: Bind release readiness to the immutable candidate
Priority: must
Type: functional
Pattern: event-driven
Statement: When release approval is prepared or recorded, the system shall require passing mandatory gate evidence produced from an isolated QA workspace whose Git tree is identical to the persisted immutable candidate commit.
Acceptance: The QA workspace is materialized at the persisted candidate snapshot commit itself, not at a later candidate-branch HEAD, and its tracked-blob tree is verified against the exact sole non-deleted repository-matching candidate snapshot commit for the CHANGE under approval and its active generation, identified under REQ-M5-WORKTREE-001 and persisted under the snapshot contract defined by REQ-M5-WORKTREE-005 immediately before and after gate execution; commits made after the candidate commit, including the required snapshot journal commit, are outside that comparison and cannot cause `RELEASE_CANDIDATE_TREE_MISMATCH`; record provenance through the public CLI is not part of candidate-tree identity, foreign records and records for another CHANGE or generation do not participate in selection, and zero or multiple qualifying non-deleted snapshots cannot source a new release approval; candidate, evidence, authorization, tag-resolved, and workflow commit object IDs at changed release boundaries accept full 40-to-64-character lowercase hexadecimal values and reject shorter, longer, uppercase, or non-hexadecimal values; ignored and untracked cache paths are outside the comparison, post-gate tracked differences inside the candidate-materialized QA workspace are allowed only at the `generated-trace` and `gate-self-reference` paths defined by REQ-M5-APPROVAL-007, and every other difference fails with `RELEASE_CANDIDATE_TREE_MISMATCH`; the musubix5 verification matrix contains exactly one Node.js 24 job for each of Ubuntu, Windows, and macOS, and one external candidate-bound gate record is required for every job in that matrix; each record binds repository identity, CHANGE ID, candidate commit, producer identity, runtime Node.js and operating-system identity, and `gate-input-fingerprint-v1` under REQ-M5-EVIDENCE-003, and regenerating records does not change the candidate commit; persisted records for the retired identities Ubuntu/20, Ubuntu/22, Windows/22, and macOS/22 remain schema-readable, evidence loading and projection rebuilds apply no retired-identity filter and preserve the existing greatest-order record per job identity, and those projected records remain visible to historical lifecycle consumers, but at ingestion a new envelope for a retired identity is rejected with `RELEASE_GATE_EVIDENCE_STALE`, an operator-facing message that identifies the retired job as outside the current candidate matrix, and no persisted record; identities absent from the current matrix are ignored before current-set context, duplication, command, status, and missing-job validation, retained Ubuntu/24 records from earlier candidates remain subject to the existing mismatch and stale diagnostics, historical snapshot status may therefore report candidate-gate evidence as missing under the current matrix, and deletion invalidation continues to observe snapshot-bound records that remain authoritative under the greatest-order-per-identity projection; `artifactManifestDigest` remains an inspection/idempotency identity under REQ-M5-WORKTREE-005 and is distinct from gate-record and release-manifest aggregates; gate evidence contributing to release readiness is taken only from the complete set of external candidate-bound gate records, any missing or non-pass matrix job blocks readiness, and in-tree gate output is informational and cannot substitute for a matrix record; readiness additionally requires every mandatory evidence kind under REQ-M5-EVIDENCE-004 and REQ-M5-QUALITY-001; the release manifest projection binds repository identity, candidate commit, and gate input fingerprint; worktree-only or post-candidate inputs cannot satisfy readiness; deleting or replacing a candidate or changing gate input makes gate evidence, manifest, and release approval stale; and approval preparation and recording fail with `RELEASE_GATE_EVIDENCE_MISSING`, `RELEASE_GATE_EVIDENCE_STALE`, or `RELEASE_GATE_CANDIDATE_MISMATCH` unless every candidate-bound matrix gate passes. The canonical historical read-only rule is: for a completed or inactive CHANGE with a recorded approval, select its sole live repository-matching record only when the record commit byte-exactly matches the persisted approval candidate; if multiple live records exist and all are legacy, select only the greatest-order legacy record when its commit matches; every other multiple-record state fails. This rule cannot source a new approval or make a legacy record eligible.
Candidate-Tree-Selection-Ownership: Normative detail: REQ-M5-RELEASE-002 owns the candidate selection, missing/foreign/legacy/non-current/multiple-record diagnostics, and historical exception semantics of the shared `release-candidate-tree-v1` inventory; REQ-M5-APPROVAL-007 continues to own its blob projection and exclusion rules.

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
- musubix5 verification matrix: Node.js 24 on Ubuntu, Windows, and macOS
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
  under REQ-M5-WORKTREE-001 and persisted under the snapshot contract defined
  by REQ-M5-WORKTREE-005, without requiring public-command provenance; exactly
  one repository-matching non-deleted record for the active generation must
  exist for the CHANGE supplied directly or derived from the active CHANGE,
  foreign records and records for another generation do not participate, and
  tombstoned records are historical only; zero non-deleted records of any
  repository identity for a requested/derived CHANGE fail with
  `APPROVAL_CANDIDATE_MISSING`; non-deleted records that are all foreign fail
  with `APPROVAL_CANDIDATE_UNAVAILABLE` plus list/create recovery guidance; a
  sole repository-matching non-deleted record
  that is legacy or belongs to a non-current generation, and multiple
  repository-matching non-deleted records, fail with
  `APPROVAL_CANDIDATE_UNAVAILABLE` plus list/delete/create recovery guidance for
  preparation and recording alike; the
  canonical REQ-M5-RELEASE-002 historical read-only rule overrides the
  multiple-record failure only for its exact completed/inactive approval
  predicate; enumerate
  every blob recursively by
  its NFC-normalized, root-relative POSIX path without reading the mutable
  worktree; a present invalid record, or a selected repository-matching record
  that is unresolvable or unreachable, fails with
  `APPROVAL_CANDIDATE_UNAVAILABLE`; foreign-repository and tombstoned records
  never satisfy selection; a raw Git path that is not valid UTF-8 fails
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
  records remain generation-less and bootstrap-scoped; same-generation
  requirements/design checkpoint supersession adds `requirementsHistory`,
  `designHistory`, `requirementsOrdinal`, and `designOrdinal` on all
  checkpoints, adds persisted `operationId` only on superseding checkpoints at
  ordinal 2 or greater while ordinal-1 checkpoints omit that key, plus
  ordinal-qualified evidence-order phase names
  `requirements:<K>` and `design:<K>` after ordinal 1; `change-record`,
  `approval prepare`, `approval record`, `approval validate`, `tdd`, `gate`,
  and `status` JSON envelopes expose that generation; readers interpret missing
  generation in schema-version-1 historical records and unqualified order keys
  as generation 1 without rewriting stored bytes; active, superseded, and
  abandoned generation summaries always add informational
  `unprojectedPhaseCheckpoints` arrays, including an empty array, with entries
  containing generation, phase, operation ID, ordinal, and journal order
- `phase-checkpoint-journal-v1`: normal-journal kind for same-generation
  requirements/design supersession with the exact payload and replay-comparison
  rules defined by REQ-M5-LIFECYCLE-005 `Checkpoint-Journal`; journal envelope
  order, predecessor hash, record hash, and payload fencing provenance follow
  that registered contract
- lifecycle diagnostics add non-waivable `CHANGE_CHECKPOINT_JOURNAL_INVALID`
  with stateful/gate exit 1 and status exit 0 with `ready: false`
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
- `workflow-record <skill> <phase>` adds `--change-id <id>`; omission retains
  baseline inference when exactly one active CHANGE is selectable, and
  `WORKFLOW_CHANGE_MISMATCH` is the registered domain diagnostic for an
  unknown or conflicting explicit owner; `CHANGE_GENERATION_PHASE` and
  `CHANGE_GENERATION_MIXED` are registered selection diagnostics
- `candidate-snapshot` adds the public `create <change-id>`, `list`,
  `show <change-id-or-snapshot-id>`, and
  `delete <change-id-or-snapshot-id> --deleted-by <name> --confirm` lifecycle
  under REQ-M5-WORKTREE-005 through REQ-M5-WORKTREE-007; the top-level
  `musubix5` and `musubix5 help` output insert its command-group line after
  `change` and before `approval`; command help registers common `--root` and
  `--json`, the exact positional selectors, and delete confirmation/actor
  options; JSON registers the creation, provenance, freshness, eligibility,
  tombstone, and audit fields defined by those requirements;
  `APPROVAL_CANDIDATE_MISSING`, `CANDIDATE_SNAPSHOT_MISSING`,
  `CANDIDATE_SNAPSHOT_CONFLICT`, `CANDIDATE_SNAPSHOT_PROTECTED`,
  `CANDIDATE_SNAPSHOT_ALREADY_DELETED`, `CANDIDATE_SNAPSHOT_APPROVAL_STALE`,
  `CANDIDATE_SNAPSHOT_QUALITY_STALE`, and the publicly surfaced
  `JOURNAL_IDEMPOTENCY_CONFLICT` are registered diagnostics; the exact four
  REQ-M5-WORKTREE-005 workspace cause strings and the exact
  `APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot journal is invalid.`
  cause from REQ-M5-WORKTREE-006 are registered changed output inside exit 2
  `CLI_ERROR` envelopes; `APPROVAL_CANDIDATE_MISSING`
  changes its diagnostic-derived `currentArtifactSha256` and exact recovery
  command, and `status.next` conditionally inserts the create command defined
  by REQ-M5-WORKTREE-006; registered changed guidance also includes the
  replacement-required delete insertion, candidate-gate run branch, and
  multiple-live `APPROVAL_CANDIDATE_UNAVAILABLE` list/delete recovery text;
  registered output additionally includes foreign-only
  `APPROVAL_CANDIDATE_UNAVAILABLE` list/create recovery,
  `CHANGE_CHECKPOINT_JOURNAL_INVALID` from create/delete when the earliest
  attributable shared-chain defect is a checkpoint record, and protected
  replacement-required reopen guidance before status delete/create;
  reused `CHANGE_GENERATION_PHASE` and `CHANGE_GENERATION_MIXED` diagnostics
  are registered for create confirmation-token resolution and unknown
  CHANGE-ID show/delete selectors, and multiple-live `status.next` registers
  list plus ascending-order delete commands without create
- the `workflow` parent help adds the `declaration` subcommand line;
  `workflow declaration` adds a command-group help entry; and
  `workflow declaration supersede WORKFLOW_INVOCATION_REUSED` adds its command
  help entry, audited correction options, and JSON fields defined by
  REQ-M5-EVIDENCE-006; `WORKFLOW_DECLARATION_CORRECTION_INVALID` and
  `WORKFLOW_DECLARATION_SUPERSEDED` are registered additive diagnostics, and
  `workflow waiver record` plus `workflow waiver record-all` register
  `WORKFLOW_DECLARATION_CORRECTION_INVALID` when their target already has a
  valid correction
- `tdd red`, `tdd green`, and `tdd refactor` add visible `--workspace`,
  `--parallel-plan`, `--parallel-assignment`, `--parallel-attempt`, and
  `--parallel-start-commit` options for split-root parallel evidence routing
- the top-level `musubix5` and `musubix5 help` entries add the `parallel`
  command line
- the `parallel` parent help adds `plan`, `prepare`, `assignment`, `status`,
  `integration`, `handoff`, and `cleanup` command groups; registered child
  surfaces include plan creation and validation with `--concurrency`, assignment
  instruction, heartbeat, fail, result and retry, integration start, reopen and
  verify, candidate handoff, status, and branch-retaining cleanup; `parallel
  status` and stale cleanup add `--change-id <id>` for maintenance targeting
  of active, abandoned, or completed known CHANGEs
- `change-record <change-id> <phase>` adds `--reopen`; only `impact` accepts
  it, other phases reject it with exit code 2 and `CLI_ERROR`, and repeated
  non-reopen checkpoints retain baseline first-generation behavior
- `change-record <change-id> <phase>` adds `--operation-id <id>` for an
  invalidated same-generation `requirements` or `design` checkpoint only;
  missing, malformed, initial-checkpoint, or other-phase use is exit 2
  `CLI_ERROR`, exact same-operation replay is exit 0, and a distinct operation
  against current evidence or divergent reuse is exit 1
  `CHANGE_GENERATION_DUPLICATE`
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
