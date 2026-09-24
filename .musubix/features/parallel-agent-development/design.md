---
schemaVersion: 1
feature: parallel-agent-development
status: approval-pending
---
# Parallel agent development design

## Design-approved parallel policy

The policy is parsed from this exact single-line JSON. Plans may reference only
the named provisioning command and configured quality commands; changing this
line reopens design approval.

Parallel-Policy: {"agentCommitIdentity":{"email":"musubix5-agent@localhost","name":"musubix5-agent"},"defaultConcurrency":3,"integratorOwnedDefaults":[".musubix/**"],"maxConcurrency":8,"prohibitedAgentOperations":[{"argsPrefix":["push"],"command":"git"},{"argsPrefix":["pull"],"command":"git"},{"argsPrefix":["fetch"],"command":"git"},{"argsPrefix":["tag"],"command":"git"},{"argsPrefix":["branch"],"command":"git"},{"argsPrefix":["rebase"],"command":"git"},{"argsPrefix":["reset"],"command":"git"},{"argsPrefix":["restore"],"command":"git"},{"argsPrefix":["worktree"],"command":"git"},{"argsPrefix":["submodule"],"command":"git"},{"argsPrefix":["notes"],"command":"git"},{"argsPrefix":["replace"],"command":"git"},{"argsPrefix":["prune"],"command":"git"},{"argsPrefix":["gc"],"command":"git"},{"argsPrefix":["update-ref"],"command":"git"},{"argsPrefix":["reflog"],"command":"git"},{"argsPrefix":["config"],"command":"git"},{"argsPrefix":["remote"],"command":"git"},{"argsPrefix":["filter-branch"],"command":"git"},{"argsPrefix":["commit","--amend"],"command":"git"},{"argsPrefix":["checkout"],"command":"git"},{"argsPrefix":["switch"],"command":"git"},{"argsPrefix":["merge"],"command":"git"},{"argsPrefix":["cherry-pick"],"command":"git"},{"argsPrefix":["clean"],"command":"git"},{"argsPrefix":["stash"],"command":"git"}],"provisionCommands":[{"args":["ci","--ignore-scripts"],"command":"npm","name":"npm-ci","timeoutMs":180000}],"runnerEnvironment":{"fixed":{"CI":"true"},"managedHome":true,"passThrough":["PATH","SystemRoot","ComSpec","PATHEXT","TMP","TEMP"]},"schemaVersion":1}

Canonical encoding uses UTF-8 JSON with lexicographically sorted object keys,
no insignificant whitespace, and one trailing LF. The CLI parses the
`Parallel-Policy:` line from the currently approved design artifact and compares
the normalized object with the plan. It never executes a caller-supplied command
that is absent from this policy or the approved `.musubix/config.json` command
set.
`managedHome: true` creates an empty managed home and sets `HOME` on every
platform plus `USERPROFILE`, `APPDATA`, and `LOCALAPPDATA` to managed
subdirectories on Windows. Agent manifests set `GIT_AUTHOR_NAME`,
`GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, and `GIT_COMMITTER_EMAIL` from
`agentCommitIdentity`; agents never need `git config`.

## State model

The authored plan document does not contain identity or approval fields. Plan
identity is
`parallel-plan:<sha256(changeId,generation,baseCommit,requirementsApprovalSha256,designApprovalSha256,commandSetSha256,normalizedAuthoredPlan)>`.
`normalizedAuthoredPlan` contains the authored schema-v1 fields plus the
effective concurrency: the authored value, otherwise the CLI value, otherwise
3, materialized before hashing. `commandSetSha256` binds the
canonical resolved `.musubix/config.json` command set plus the approved
provisioning policy. The persisted plan record contains the normalized authored
plan, including its effective concurrency, and adds `planId`, CHANGE,
generation, base commit, approval digests, command-set digest, and created
order. Every operation revalidates all bindings; drift makes the plan stale.
One plan is allowed per CHANGE generation.

Assignment attempt states persist only `running`, `completed`, and `failed`
transitions. A retry request persists a separate ordered `retry` record naming
attempt N+1; `waiting` or `queued` for that attempt derives from the retry
record plus dependency state. `blocked` and occupied concurrency slots are also
derived projections. Integration attempt 1 starts on the first integration
request; only `parallel integration reopen` creates attempt N+1.

| Operation | Required state | Terminal effect |
|---|---|---|
| `plan create` | approved requirements/design, clean candidate at base | persist plan |
| `prepare` | persisted plan, bindings current | preflight refs/root/policy/provisioner and persist prepared |
| `assignment instruction` | prepared, derived queued, slot available | create worktree and persist running |
| `assignment result` | running | independently verify, persist completed |
| `assignment fail` | running, or current attempt already failed | persist failed or return idempotent result |
| `assignment retry` | latest attempt failed | persist idempotent retry record for N+1; derive names and waiting/queued state |
| `integration start` | every assignment completed | create/resume integration attempt and provisional provenance |
| `integration reopen` | conflict or verification failure | close attempt, invalidate provisional provenance, fail named assignments |
| `integration verify` | provisional provenance current | record verified provenance and integration evidence |
| `handoff` | verified integration | fast-forward candidate |
| `cleanup` | handoff pass, or explicit stale maintenance | remove only authorized clean worktrees |

## CLI contract

- `parallel plan validate <plan-file>`
- `parallel plan create <plan-file> [--concurrency <1..8>]`
- `parallel prepare <plan-id>`
- `parallel assignment instruction <plan-id> <assignment-id>`
- `parallel assignment heartbeat <plan-id> <assignment-id> --attempt <n>`
- `parallel assignment fail <plan-id> <assignment-id> --attempt <n> --reason <text>`
- `parallel assignment result <plan-id> <assignment-id> --attempt <n> --head <sha>`
- `parallel assignment retry <plan-id> <assignment-id>`
- `parallel status <plan-id>`
- `parallel status --change-id <id>`
- `parallel integration start <plan-id>`
- `parallel integration reopen <plan-id> --assignment <ids...> --reason <text>`
- `parallel integration verify <plan-id>`
- `parallel handoff <plan-id>`
- `parallel cleanup <plan-id>`
- `parallel cleanup --change-id <id>`
- `workflow-record <skill> <phase> [--change-id <id>]`

All commands support `--root` and `--json`. Domain/state failures use exit 1;
usage failures use exit 2 and `CLI_ERROR`. JSON domain failures use
`{"error":{"code":<diagnostic>,"message":<text>,"details":<object?>}}`.
The plan-ID forms are normal current-plan operations. The `--change-id` status
form projects every persisted plan for the named known CHANGE, including stale
historical generations. The `--change-id` cleanup form is the explicit
non-credit stale-maintenance operation and removes eligible clean managed
worktrees for every persisted stale plan of that CHANGE while retaining every
branch, dirty worktree, and refusal reason.

## Plan schema

The canonical authored schema-v1 plan contains exactly:

- `schemaVersion`, optional `concurrency`, and `provisionCommandNames`;
- `integratorOwnedPaths`;
- `assignments[]` with `id`, `role`, `requirementIds`, `dependsOn`,
  `ownedPaths`, and `focusedCommands[]`;
- each focused command has a configured command `name` and argument vector with
  requirement/test selectors;
- no command string is interpreted by a shell.

Assignment IDs match `^[a-z0-9][a-z0-9-]{0,63}$`; a plan contains at most 64
assignments. Path patterns are normalized root-relative POSIX globs without
absolute paths, `..`, backslashes, empty segments, or symlink traversal.

## DES-M5-PARALLEL-001: Active CHANGE context resolver
Responsibilities: Adapt the lifecycle service's CHANGE document selection for parallel maintenance and workflow ownership, distinguish active, completed, and abandoned-generation contexts, and preserve historical generations without selecting completed CHANGEs for current operations.
Interfaces: `listChangeDocuments(root)`, `validateExplicitChangeId(changeId)`, `resolveParallelMaintenanceTarget(changeId)`.
Constraints: This component consumes DES-M5-005 `resolveChangeContext` as the sole lifecycle-context implementation. Implicit selection permits at most one explicit active or chronology-classified legacy-active document; status keeps exit 0 with `ready: false` for mixed state; explicit workflow targeting never falls back; targeted parallel status/cleanup may select known active, abandoned, or completed CHANGEs but grant no evidence credit; status-less legacy CHANGE documents use DES-M5-005's chronology-based active/completed classification and are never rewritten during selection.
Requirements: REQ-M5-LIFECYCLE-005 REQ-M5-EVIDENCE-006 REQ-M5-PARALLEL-001 REQ-M5-PARALLEL-017
ADRs: ADR-0010 ADR-0013
Depends-On: DES-M5-005

## DES-M5-PARALLEL-002: Parallel plan policy and DAG validator
Responsibilities: Parse the approved `Parallel-Policy`, normalize authored plan schema v1, derive persisted plan identity, validate requirement coverage, configured command references, assignment DAGs, concurrency, ownership disjointness, integrator-owned defaults, and command-set currency.
Interfaces: `loadParallelPolicy(approvedDesign)`, `validateParallelPlan(authoredPlan, context)`, `stableTopologicalOrder(assignments)`, `deriveParallelPlanId(binding, normalizedAuthoredPlan)`, `resolvedCommandSetDigest(config, policy)`.
Constraints: One plan per generation; default concurrency 3 and maximum 8 are approved values; at most 64 assignments; incomparable assignments cannot own intersecting paths; every assignment `.musubix/**` ownership request fails during plan validation; provisioning and focused commands are argument arrays from approved registries; the CLI flag supplies concurrency only when the authored document omits it and a differing double specification is exit 2 `CLI_ERROR`; command-set drift yields `PARALLEL_PLAN_STALE`; invalid plans persist nothing.
Requirements: REQ-M5-PARALLEL-001 REQ-M5-PARALLEL-002 REQ-M5-PARALLEL-003 REQ-M5-PARALLEL-005 REQ-M5-PARALLEL-013
ADRs: ADR-0005 ADR-0012
Depends-On: DES-M5-003 DES-M5-006 DES-M5-PARALLEL-001

## DES-M5-PARALLEL-003: Parallel journal and projection service
Responsibilities: Persist plan, preparation, assignment, integration-attempt, provenance, handoff, retry, failure, and cleanup-maintenance records through the existing ordered journal; rebuild the derived parallel projection and state counts.
Interfaces: `appendParallelTransition(input)`, `loadParallelPlan(planId)`, `listPlansForChange(changeId)`, `projectParallelStatus(planId)`, `markPlanStale({ planId, reason })`, `recordMaintenance(input)`.
Constraints: Every ordered stateful transition holds the existing CHANGE lease and fencing token; idempotency keys include CHANGE, generation, plan, entity, attempt, and transition; heartbeat writes are lease-free non-ordered display records under the Git common directory and never enter chronology; maintenance records for abandoned/completed CHANGEs are segregated and grant no pass evidence; no assignment writes `.musubix` directly.
Requirements: REQ-M5-LIFECYCLE-005 REQ-M5-PARALLEL-003 REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-011 REQ-M5-PARALLEL-012 REQ-M5-PARALLEL-015
ADRs: ADR-0003 ADR-0010 ADR-0012 ADR-0013
Depends-On: DES-M5-004 DES-M5-005 DES-M5-007 DES-M5-PARALLEL-001 DES-M5-PARALLEL-002

## DES-M5-PARALLEL-004: Assignment and integration workspace manager
Responsibilities: Create deterministic assignment-attempt, detached verification, and integration-attempt branches/worktrees; materialize dependency ranges; inspect commit ancestry and changed paths; and remove only authorized clean worktrees.
Interfaces: `preflightPlanCreation(context)`, `prepareParallelPlan(plan)`, `createAssignmentAttempt(plan, assignment, attempt)`, `createVerificationWorkspace({ planId, assignmentId, attempt, head })`, `createIntegrationAttempt(plan, attempt)`, `assignmentCommitRange(context)`, `removeManagedWorktree(context)`.
Constraints: Plan-creation preflight proves the candidate head equals the requested base, the candidate is clean, the base descends from the persisted baseline, and no removable clean stale managed worktree remains. Preparation preflights refs, managed-root ancestors, policy parsing, command availability, and provisioning metadata without creating assignment worktrees or consuming slots. All paths are below `<git-common-dir>/musubix5/workspaces/<change>/parallel/<plan>/`; path ancestors are non-symlinks; assignment branches and every integration-attempt branch are retained; verification worktrees are detached and temporary; retry derives names but materializes its worktree only when instruction is issued; every result and integration revalidates dependency start commits against current latest-successful dependency heads; worktree identity and cleanliness are checked before reuse or removal; the control worktree's unrelated dirty state is unchanged.
Requirements: REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-004 REQ-M5-PARALLEL-006 REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-012 REQ-M5-PARALLEL-016
ADRs: ADR-0006 ADR-0012
Depends-On: DES-M5-003 DES-M5-004 DES-M5-012 DES-M5-PARALLEL-002 DES-M5-PARALLEL-003

## DES-M5-PARALLEL-005: Agent instruction and result gateway
Responsibilities: Generate complete Agent instruction manifests, route evidence writes to the control root while runners execute in assignment worktrees, validate Agent heads and owned paths, provision detached verification worktrees, run focused commands, and persist completion or explicit failure.
Interfaces: `issueAssignmentInstruction(planId, assignmentId)`, `recordAssignmentHeartbeat(input)`, `verifyAssignmentResult(input)`, `failAssignment(input)`, `retryAssignment(input)`.
Constraints: Issuance atomically consumes one derived slot; manifests contain no secrets, include the approved non-secret commit identity environment, and declaratively prohibit matching operations by exact executable plus argument-prefix comparison. Prefix matching is not claimed to intercept every reordered Git option, so result verification also proves ancestry, retained prior assignment commits and branches, reflog/head, ownership, and commit-range facts. Result verification ignores Agent-asserted status, executes approved commands directly in the sanitized managed-home environment, rejects `.musubix/**` assignment changes, uses the provenance-free `assignmentCycleComplete` predicate, and leaves rejected attempts running; repeated failure retains the first reason.
Requirements: REQ-M5-PARALLEL-003 REQ-M5-PARALLEL-005 REQ-M5-PARALLEL-006 REQ-M5-PARALLEL-007 REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-011 REQ-M5-PARALLEL-015
ADRs: ADR-0004 ADR-0005 ADR-0012
Depends-On: DES-M5-009 DES-M5-010 DES-M5-011 DES-M5-PARALLEL-002 DES-M5-PARALLEL-003 DES-M5-PARALLEL-004

## DES-M5-PARALLEL-006: Provenance-gated TDD selector
Responsibilities: Construct and validate assignment-attempt and consumed-range provenance bindings for normal requirement-scoped TDD cycles, and expose provisional or verified provenance to the TDD ledger.
Interfaces: `parallelCycleBinding(cycle)`, `validateConsumedRangeProvenance(provenance)`, `provenanceForTddSelection(planId)`.
Constraints: Assignment admission consumes DES-M5-011 `assignmentCycleComplete(binding)` and does not require integration provenance. DES-M5-011 is the sole coverage selector and currency classifier. This component supplies validated provenance; every assignment, consumed-range, integration, and parallel-start commit field accepts lowercase hexadecimal object IDs of length 40 through 64 and rejects shorter, longer, uppercase, or non-hexadecimal values. Provisional provenance may be supplied only during integration verification and cannot satisfy integration evidence, release readiness, handoff, or cleanup.
Requirements: REQ-M5-COMPAT-013 REQ-M5-RELEASE-002 REQ-M5-TDD-003 REQ-M5-PARALLEL-007 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010
ADRs: ADR-0005 ADR-0010 ADR-0012
Depends-On: DES-M5-007 DES-M5-011 DES-M5-PARALLEL-003

## DES-M5-PARALLEL-007: Deterministic integration verifier
Responsibilities: Create/resume numbered integration attempts, cherry-pick assignment-owned commit ranges in stable topological order, persist provisional provenance, run provisioning and complete required verification, and atomically mark provenance verified with integration evidence.
Interfaces: `startIntegration(planId)`, `resumeIntegration(planId)`, `reopenIntegration(input)`, `verifyIntegration(planId)`, `currentIntegrationProvenance(planId)`.
Constraints: A stopped command resumes one attempt; only reopen increments it. The caller's named completed assignment set must be dependency-closed over completed transitive dependents; an incomplete set fails `PARALLEL_ASSIGNMENT_STATE` without mutation. Reopen transitions only that explicit named set to failed, then recomputes non-named descendant projections and start commits; every other persisted completed transition remains unchanged. There is no automatic content conflict resolution; provisional provenance is plan-wide and invalidated completely on reopen; verification runs every required configured command plus strict trace, graph gate, changed gate, and status. Integration reporting consumes DES-M5-006 `classifyReleaseApprovalDiagnostic` so missing, foreign-only, legacy, non-current, conflicting, unreachable, or gate-stale candidate states retain their expected approval-stage classification and DES-M5-015 recovery guidance. Per REQ-M5-PARALLEL-010, every absent, failed, or skipped required command still fails integration verification, contributes no pass evidence, and leaves provenance provisional.
Requirements: REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-011 REQ-M5-WORKTREE-005 REQ-M5-WORKTREE-006 REQ-M5-WORKTREE-007
ADRs: ADR-0005 ADR-0010 ADR-0012
Depends-On: DES-M5-006 DES-M5-014 DES-M5-015 DES-M5-PARALLEL-003 DES-M5-PARALLEL-004 DES-M5-PARALLEL-006

## DES-M5-PARALLEL-008: Candidate handoff and cleanup coordinator
Responsibilities: Fast-forward the active CHANGE candidate to the verified integration commit, classify candidate divergence, record candidate identity, perform successful cleanup, and execute explicitly targeted stale maintenance cleanup.
Interfaces: `handoffParallelCandidate(planId)`, `classifyCandidateDivergence(candidate, base)`, `cleanupIntegratedPlan(planId)`, `cleanupStalePlan(changeId, planId)`.
Constraints: Handoff never rewrites history; only `dirty-at-base` is retryable in-generation; `missing` and `not-at-base` require generation abandon/reopen; successful cleanup requires verified provenance; stale maintenance can target completed CHANGEs but removes only clean managed worktrees and retains every branch.
Requirements: REQ-M5-LIFECYCLE-005 REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-001 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-012 REQ-M5-PARALLEL-016
ADRs: ADR-0006 ADR-0010 ADR-0012 ADR-0013
Depends-On: DES-M5-003 DES-M5-004 DES-M5-007 DES-M5-012 DES-M5-PARALLEL-003 DES-M5-PARALLEL-004 DES-M5-PARALLEL-007

## DES-M5-PARALLEL-009: Parallel CLI and JSON facade
Responsibilities: Expose the additive `parallel` hierarchy and explicit workflow CHANGE targeting, map typed domain outcomes to stable exit codes/JSON, and register help, diagnostics, and compatibility contracts.
Interfaces: CLI commands in the approved CLI contract; `recordWorkflow(root, event, { changeId? })`; `parallelCommandResult(outcome)`.
Constraints: Existing command output remains compatible; status reports new generation diagnostics through its existing diagnostics collection and keeps exit 0 for non-pass/mixed projections; malformed options use exit 2 `CLI_ERROR`; shell command strings are never accepted. `parallel plan create` orchestrates DES-M5-PARALLEL-004 plan-creation and stale-worktree preflight before DES-M5-PARALLEL-002 validation and DES-M5-PARALLEL-003 persistence; any failed preflight persists no plan. Plan-scoped parallel commands with no active generation return `PARALLEL_PLAN_STALE` before lifecycle phase diagnostics. Explicit workflow targeting never falls back to implicit ownership; workflow records persist changeId, positive generation, and current requirement IDs; unknown/conflicting explicit owners use `WORKFLOW_CHANGE_MISMATCH`, known ineligible owners use `CHANGE_GENERATION_PHASE`, and omitted ambiguous ownership uses `CHANGE_GENERATION_MIXED`; help, JSON fields, migration guidance, maintenance schema, integration evidence, worktree roles, TDD provenance, diagnostics, and aggregate hashes are registered compatibility additions.
Requirements: REQ-M5-COMPAT-013 REQ-M5-EVIDENCE-006 REQ-M5-LIFECYCLE-005 REQ-M5-PARALLEL-013 REQ-M5-PARALLEL-017
ADRs: ADR-0002 ADR-0007 ADR-0013 ADR-0014
Depends-On: DES-M5-002 DES-M5-018 DES-M5-PARALLEL-001 DES-M5-PARALLEL-002 DES-M5-PARALLEL-003 DES-M5-PARALLEL-004 DES-M5-PARALLEL-005 DES-M5-PARALLEL-007 DES-M5-PARALLEL-008

## DES-M5-PARALLEL-010: Native Agent Skill protocol
Responsibilities: Define `sdd-parallel-dispatch`, `sdd-agent-assignment`, and `sdd-integration-verification`; translate CLI manifests to Copilot native subagent prompts; enforce concurrency; propagate failure; and return integration control to the parent Agent.
Interfaces: `.github/skills/sdd-parallel-dispatch/SKILL.md`, `.github/skills/sdd-agent-assignment/SKILL.md`, `.github/skills/sdd-integration-verification/SKILL.md`.
Constraints: Skills depend only on the CLI facade, call only Copilot native subagent tools and repository CLI commands, and invoke `workflow-record --change-id` exactly once per Skill invocation; no Skill launches Copilot subprocesses, creates a second task system, replaces an existing Skill, or silently edits outside a manifest.
Requirements: REQ-M5-PARALLEL-005 REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-013 REQ-M5-PARALLEL-014
ADRs: ADR-0012 ADR-0013
Depends-On: DES-M5-PARALLEL-009

## Diagnostic ownership

| Code | Owner | Exit |
|---|---|---:|
| `PARALLEL_PLAN_EXISTS` | DES-M5-PARALLEL-002 | 1 |
| `PARALLEL_PLAN_STALE` | DES-M5-PARALLEL-001/003 | 1 |
| `PARALLEL_STALE_WORKTREES_PRESENT` | DES-M5-PARALLEL-004 | 1 |
| `PARALLEL_PLAN_INVALID` | DES-M5-PARALLEL-002 | 1 |
| `PARALLEL_PLAN_OWNERSHIP_OVERLAP` | DES-M5-PARALLEL-002 | 1 |
| `PARALLEL_CONCURRENCY_INVALID` | DES-M5-PARALLEL-009 | 2 `CLI_ERROR` message |
| `PARALLEL_CONCURRENCY_LIMIT` | DES-M5-PARALLEL-003/005 | 1 |
| `PARALLEL_WORKTREE_CONFLICT` | DES-M5-PARALLEL-004 | 1 |
| `PARALLEL_RESULT_OWNERSHIP` | DES-M5-PARALLEL-005 | 1 |
| `PARALLEL_RESULT_UNVERIFIED` | DES-M5-PARALLEL-005/006 | 1 |
| `PARALLEL_VERIFICATION_ENVIRONMENT` | DES-M5-PARALLEL-005/007 | 1 |
| `PARALLEL_TDD_UNCONSUMED` | DES-M5-011 | 1 |
| `PARALLEL_INTEGRATION_INCOMPLETE` | DES-M5-PARALLEL-007 | 1 |
| `PARALLEL_INTEGRATION_CONFLICT` | DES-M5-PARALLEL-007 | 1 |
| `PARALLEL_INTEGRATION_VERIFICATION_FAILED` | DES-M5-PARALLEL-007 | 1 |
| `PARALLEL_ASSIGNMENT_STATE` | DES-M5-PARALLEL-003/005/007 | 1 |
| `PARALLEL_LEASE_BUSY` | DES-M5-PARALLEL-003 | 1 |
| `LEASE_FENCED` | DES-M5-004/PARALLEL-003 | 1 |
| `PARALLEL_CANDIDATE_DIVERGED` | DES-M5-PARALLEL-008 | 1 |
| `WORKFLOW_CHANGE_MISMATCH` | DES-M5-PARALLEL-001/009 | 1 |
| `WORKFLOW_DECLARATION_CORRECTION_INVALID` | DES-M5-002/007/015/018 | 1 |
| `CHANGE_GENERATION_DUPLICATE` | DES-M5-005 | 1 |
| `WORKFLOW_DECLARATION_SUPERSEDED` | DES-M5-015/018 | informational |
| `CHANGE_GENERATION_PHASE` | DES-M5-005/PARALLEL-001/009 | 1 |
| `CHANGE_GENERATION_MIXED` | DES-M5-005/PARALLEL-001/009 | gate 1, status 0 |

## C4-like component flow

The authoritative C4-like diagram is generated by `musubix5 design c4` from
the component `Depends-On` relationships above. A rendered copy may be stored
for review but is generated evidence, not a normative design input.
