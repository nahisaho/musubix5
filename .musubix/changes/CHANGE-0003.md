---
schemaVersion: 1
id: CHANGE-0003
summary: Add parallel worktree development with native Copilot subagents
status: active
---
# CHANGE-0003: parallel-agent-development

Requirements: REQ-M5-COMPAT-013 REQ-M5-EVIDENCE-006 REQ-M5-LIFECYCLE-005 REQ-M5-TDD-003 REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-001 REQ-M5-PARALLEL-002 REQ-M5-PARALLEL-003 REQ-M5-PARALLEL-004 REQ-M5-PARALLEL-005 REQ-M5-PARALLEL-006 REQ-M5-PARALLEL-007 REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-011 REQ-M5-PARALLEL-012 REQ-M5-PARALLEL-013 REQ-M5-PARALLEL-014 REQ-M5-PARALLEL-015 REQ-M5-PARALLEL-016 REQ-M5-PARALLEL-017

## Classification

Feature: additive parallel development coordination and verification.

## Confirmed intent

- Preserve every existing Skill and add three new Skills:
  `sdd-parallel-dispatch`, `sdd-agent-assignment`, and
  `sdd-integration-verification`.
- Use Copilot native subagents for execution; the CLI manages state, Git
  worktrees, assignments, evidence, and validation but does not launch a second
  Agent process system.
- Bind plans to one active CHANGE generation and divide work by requirement
  batches.
- Use one Git worktree and branch per assignment attempt. Each Agent commits
  its result; the integration Agent cherry-picks validated commit ranges.
- Default concurrency is 3 and the maximum is 8.
- Atomically move runnable attempts from queued to running when an instruction
  manifest is issued; successful completion or explicit failure releases the
  slot.
- Continue independent assignments after one failure, block its transitive
  dependents, and prohibit integration until every assignment passes.
- Require assignment-level TDD/focused verification and integration-level full
  quality verification.
- After successful integration, remove clean integrated worktrees, retain
  branches, and retain failed or unintegrated worktrees.
- Require explicit Agent failure declaration instead of fabricating timeout
  failures, and allocate a new worktree/branch attempt for retry.
- Route assignment evidence writes through the control repository state root;
  assignment worktrees must not modify `.musubix/**`.
- Reuse the existing bounded CHANGE lease wait, expiry takeover, and fencing
  semantics; do not add parallel-specific lease configuration.
- Invalidate execution when the active generation changes while preserving
  branch-retaining cleanup for stale plans.
- Persist consumed assignment provenance before the integration quality gate,
  and allow explicit reasoned reopen of named completed assignments after an
  integration conflict or verification failure.
- Treat each integration start/reopen as a numbered attempt with its own
  retained branch and managed worktree.
- Provision dependencies in clean detached verification and integration
  worktrees through design-approved commands.
- Extend `REQ-M5-COMPAT-013` so the new worktree, TDD provenance, integration
  evidence, help, JSON, and diagnostic surfaces are registered extensions.
- Extend `REQ-M5-WORKTREE-001` for role/attempt workspaces and
  `REQ-M5-TDD-003` for provenance-gated parallel TDD selection.
- Extend `REQ-M5-EVIDENCE-006` and add `workflow-record --change-id` so Skill
  declarations remain deterministic when multiple generations coexist.
- Extend `REQ-M5-EVIDENCE-006` with append-only, human-authorized supersession
  records for one or more later accidental duplicate workflow declarations,
  each permitted only when the shared lowest-positioned identical declaration
  is independently bound to an unused completed Skill invocation.
- Extend `REQ-M5-LIFECYCLE-005` so implicit generation resolution ignores
  completed CHANGE documents while preserving their historical generations,
  selects abandoned active documents with a null generation for status, keeps
  status exit 0 on mixed/non-pass state, and permits explicitly targeted
  parallel status/stale cleanup maintenance.
- Extend same-generation requirements/design phase supersession with an
  explicit operation ID so crash retries remain idempotent while a distinct
  invocation against current evidence remains `CHANGE_GENERATION_DUPLICATE`.
- Fast-forward the existing CHANGE candidate workspace to the exact verified
  integration commit before cleanup.

## Impact

- Add a generation-bound parallel plan, assignment, result, integration, and
  cleanup state model using the existing ordered journal and CHANGE lease.
- Extend the CLI with additive `parallel` commands and registered JSON/help
  contracts.
- Extend workspace management from one candidate worktree per CHANGE to
  additional assignment-attempt and integration worktrees under the Git common
  directory, owned by one plan.
- Reuse normal requirement-scoped TDD cycles and integration evidence while
  adding assignment-attempt ownership, commit-range validation, and explicit
  provenance from consumed Agent commits to the final candidate.
- Add the three new Skill directories without modifying or replacing existing
  Skill directories.
- Update configuration, compatibility registries, trace, tests, documentation,
  and package assets directly required by the new public behavior.
- Add audited workflow declaration correction evidence and CLI contracts
  without deleting, rewriting, or granting waiver-based pass credit to existing
  workflow or journal records.

## Unchanged obligations

Existing requirements other than `REQ-M5-COMPAT-013`,
`REQ-M5-EVIDENCE-006`, `REQ-M5-LIFECYCLE-005`, `REQ-M5-WORKTREE-001`, and
`REQ-M5-TDD-003` keep their current normative meaning. Cross-change evidence
rejection, structured Planner validation, and release readiness remain
dependencies of this additive feature.

## Assumptions

- Git is available because musubix5 already requires Git-backed immutable
  candidate identities.
- Agents operate only through Copilot native subagent tools supplied by the
  host; musubix5 does not invoke Copilot CLI subprocesses.
- Parallel plans are created only after current requirements and design
  approvals for the active generation.
