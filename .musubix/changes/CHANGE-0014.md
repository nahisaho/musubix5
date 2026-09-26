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
behavior. Issue #39 blocks that behavior on Windows because logical identities
contain a colon that cannot be used as a Windows directory component.

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
- Amend `REQ-M5-MULTI-CHANGE-004` so
  logical candidate and integration identities remain unchanged in evidence
  while every persisted directory component uses one deterministic
  Windows-safe filesystem key.
- Treat #40 as a conformance defect against the existing Node.js 24
  Ubuntu/Windows/macOS verification matrix in `REQ-M5-CI-001`; it changes
  tests, not normative behavior, so `REQ-M5-CI-001` is not part of this
  CHANGE's normative `Requirements:` set.
- Resolve #39 through `REQ-M5-MULTI-CHANGE-004` without changing logical
  candidate/integration identities.

## Expected design impact

- Define candidate registry identity, base commit, branch/worktree ownership,
  private/shared state boundaries, explicit selection rules, evidence binding,
  dependency/conflict analysis, integration state transitions, and cleanup
  safety.
- Define CLI operations for create/list/show/resume/refresh/integrate/cleanup
  and a common candidate selector used by approval, TDD, gate, and status
  surfaces.
- Record ADRs for state routing and deterministic integration ownership.
- Define one canonical logical-ID-to-filesystem-key encoder, platform-native
  in-process path forms, persisted path forms, invalid-directory rejection,
  and the no-legacy-fallback policy.

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
- Centralize candidate/integration filesystem-key encoding without legacy
  fallback and without changing logical IDs or public CLI output.
- Replace POSIX-only absolute-path and LF assumptions in candidate tests with
  platform-native path construction and deterministic Git fixture settings.

## Expected verification

- Independent operations for two active CHANGE candidates cannot read or
  satisfy one another's evidence.
- Omitted selectors retain `CHANGE_GENERATION_MIXED` and do not mutate state.
- Overlapping ownership and stale dependencies block before integration.
- Integration reruns all configured commands, strict trace, graph gate, changed
  gate, and status in a clean integration worktree.
- Existing single-CHANGE and in-CHANGE parallel tests remain passing.
- Node.js 24 Ubuntu, Windows, and macOS jobs create, resume, materialize,
  commit, and freshly check out encoded candidate/integration state paths.
- Byte-sensitive Git fixtures use repository-equivalent LF attributes or
  disable checkout conversion; platform-native absolute paths are asserted
  with path APIs rather than POSIX literals.
- #39/#40 regression tests trace to the existing `REQ-M5-CI-001` three-OS
  matrix and to `REQ-M5-MULTI-CHANGE-004` where they assert encoded state
  paths.

## Release evidence (pre-approval)

- Live candidate snapshot: `snapshot-000000000184`.
- Candidate commit: `57a3b163b619e52a3595910e7df112049b520b1b`.
- Candidate gate run: GitHub Actions run `36220081063`.
- Signed Ubuntu, Windows, and macOS Node.js 24 envelopes are ingested in
  `.musubix/evidence/release/gates/ubuntu-node24.json`,
  `.musubix/evidence/release/gates/windows-node24.json`, and
  `.musubix/evidence/release/gates/macos-node24.json`; all required commands
  passed and candidate-gate validation reports no diagnostics.
- Other Node.js 20/22 records under `.musubix/evidence/release/gates/` are
  historical evidence for earlier CHANGEs and are not release evidence for
  this candidate.
- Moving ADR-0025, ADR-0026, and ADR-0027 to `accepted` makes the prior design
  approval stale. Design must be re-approved before preparing the CHANGE-0014
  generation 1 release approval, after which the final gate and status must be
  regenerated.
- No workflow waiver currently suppresses a diagnostic. Workflow
  reconciliation relies on five append-only declaration corrections. Six stale
  waiver records remain as audit history: three recorded during CHANGE-0014 and
  three that predate it; none is applied.

## Residual risks

- The feature adds persistent workspace lifecycle state and Git worktrees,
  increasing recovery and cleanup complexity.
- Candidate-private and shared state boundaries must remain explicit to avoid
  cross-candidate evidence contamination.
- Integration ordering cannot eliminate semantic conflicts between disjoint
  files; complete verification remains mandatory.
- Existing noncanonical candidate state has no legacy read fallback and must be
  recreated manually after `CANDIDATE_STATE_OWNERSHIP`; unknown state is never
  migrated or deleted automatically.
- Repository-relative owner-root budgets remain fixed at 95 characters for
  candidates and 112 characters for integrations. Independently, a deep
  absolute Windows checkout can be rejected by the platform path API and
  surfaces as the same `CANDIDATE_STATE_OWNERSHIP` diagnostic; relocating the
  repository addresses only that absolute-path failure.
- Local quality evidence is unsigned; cryptographic provenance for the release
  decision comes from the three GitHub OIDC-bound candidate-gate envelopes.
- Formal model correspondence currently covers only a small subset of the
  repository requirements, and mutation testing is not configured as a
  required check for this candidate.
