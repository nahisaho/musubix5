---
schemaVersion: 1
id: CHANGE-0014
summary: Isolate concurrent CHANGE candidate workspaces
status: active
---
# CHANGE-0014: multi-change-candidate-workspaces

Requirements: REQ-M5-COMPAT-013 REQ-M5-LIFECYCLE-005 REQ-M5-WORKTREE-005 REQ-M5-WORKTREE-006 REQ-M5-WORKTREE-007 REQ-M5-RELEASE-002 REQ-M5-PARALLEL-010 REQ-M5-MULTI-CHANGE-001 REQ-M5-MULTI-CHANGE-002 REQ-M5-MULTI-CHANGE-003 REQ-M5-MULTI-CHANGE-004 REQ-M5-MULTI-CHANGE-005 REQ-M5-MULTI-CHANGE-006 REQ-M5-MULTI-CHANGE-007 REQ-M5-MULTI-CHANGE-008

## Classification

Feature and behavior change. GitHub Issue #5 requires independent candidate
workspaces and evidence contexts for multiple concurrently active CHANGE
documents while preserving fail-closed repository-wide integration and release
behavior.

## Confirmed intent

- Allow two or more active CHANGE documents to progress independently when an
  operation explicitly selects one candidate context.
- Bind approvals, TDD, trace, graph, formal, performance, quality, gate, status,
  workflow, attestation, and candidate evidence to the selected CHANGE
  generation and immutable candidate commit.
- Preserve `CHANGE_GENERATION_MIXED` for state-changing operations that omit a
  required selector.
- Detect cross-candidate ownership conflicts and dependencies before
  integration without success-shaped automatic resolution.
- Integrate selected candidates deterministically into a clean worktree and
  rerun complete repository verification.
- Resume and clean candidate workspaces without implicitly deleting
  unintegrated or failed work.
- Preserve the existing single-CHANGE workflow and one-CHANGE parallel plan
  semantics.

## Requirement impact

- Add eight requirements under the new `multi-change-workspaces` feature.
- Amend `REQ-M5-COMPAT-013`, `REQ-M5-LIFECYCLE-005`,
  `REQ-M5-WORKTREE-005`, `REQ-M5-WORKTREE-006`,
  `REQ-M5-WORKTREE-007`, `REQ-M5-RELEASE-002`, and `REQ-M5-PARALLEL-010`
  so explicit candidate contexts are valid while implicit mixed-CHANGE
  operations remain fail-closed.

## Expected design impact

- Define candidate registry identity, base commit, branch/worktree ownership,
  private/shared state boundaries, explicit selection rules, evidence binding,
  dependency/conflict analysis, integration state transitions, and cleanup
  safety.
- Define CLI operations for create/list/show/resume/refresh/integrate/cleanup
  and a common candidate selector used by approval, TDD, gate, and status
  surfaces.
- Record ADRs for state routing and deterministic integration ownership.

## Expected implementation impact

- Extend change context resolution without weakening unselected mixed-change
  rejection.
- Add candidate workspace registry and lifecycle operations.
- Route candidate-owned evidence and state through the selected workspace.
- Bind candidate evaluation and integration results to CHANGE, generation,
  repository identity, base commit, and candidate commit.
- Extend approval and candidate-gate diagnostics with registered
  integration-verification `detail` causes and preserve them through gate
  projection.
- Add pre-integration conflict/dependency checks and clean integration
  verification.
- Add fail-closed resume and cleanup behavior.

## Expected verification

- Independent operations for two active CHANGE candidates cannot read or
  satisfy one another's evidence.
- Omitted selectors retain `CHANGE_GENERATION_MIXED` and do not mutate state.
- Overlapping ownership and stale dependencies block before integration.
- Integration reruns all configured commands, strict trace, graph gate, changed
  gate, and status in a clean integration worktree.
- Existing single-CHANGE and in-CHANGE parallel tests remain passing.

## Residual risks

- The feature adds persistent workspace lifecycle state and Git worktrees,
  increasing recovery and cleanup complexity.
- Candidate-private and shared state boundaries must remain explicit to avoid
  cross-candidate evidence contamination.
- Integration ordering cannot eliminate semantic conflicts between disjoint
  files; complete verification remains mandatory.
