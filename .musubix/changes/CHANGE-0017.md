---
schemaVersion: 1
id: CHANGE-0017
summary: Establish Wave 1 development foundations
status: active
---
# CHANGE-0017: establish-wave1-development-foundations

Requirements: REQ-M5-APPROVAL-007 REQ-M5-COMPAT-013 REQ-M5-EVIDENCE-007 REQ-M5-GRAPH-003 REQ-M5-WORKTREE-004

## Classification

Defect correction, workflow UX improvement, public CLI completion, and
benchmark infrastructure covering GitHub Issues #48, #23, #46, and #8.

## Confirmed intent

- Exclude foreign candidate-gate evidence when its effective CHANGE identity is
  stored in the nested gate result.
- Provide a public, fail-closed CLI path for creating the immutable workspace
  baseline required by parallel planning.
- Provide an executable current-session workflow reconciliation path without
  weakening sanitization, transcript limits, or strict release proof.
- Establish deterministic CodeGraph performance and labeled-accuracy
  benchmarks before resolver and symbol-analysis improvements.

## Requirement impact

- Amend `REQ-M5-APPROVAL-007` so release evidence identity falls back through
  top-level `changeId`, `metadata.changeId`, and `result.changeId`.
- Amend `REQ-M5-COMPAT-013` to register the additive public baseline and
  current-workflow verification CLI contracts.
- Amend `REQ-M5-WORKTREE-004` with the public baseline CLI contract and
  actionable missing-baseline recovery.
- Amend `REQ-M5-EVIDENCE-007` with current-session transcript discovery,
  sanitization, and verification orchestration that remains fail-closed.
- Add `REQ-M5-GRAPH-003` for deterministic, non-polluting CodeGraph performance
  and labeled-accuracy benchmark evidence.

## Parallel batches and integration order

| Issue | Requirement batch | Ownership |
|---|---|---|
| #48 | `REQ-M5-APPROVAL-007` | Release-manifest identity extraction and focused tests. |
| #46 | `REQ-M5-WORKTREE-004` | Workspace baseline analysis API/CLI contract and focused tests. |
| #23 | `REQ-M5-EVIDENCE-007` | Workflow transcript discovery/orchestration and focused tests. |
| #8 | `REQ-M5-GRAPH-003` | CodeGraph benchmark model, fixtures, runner, and focused tests. |

The four implementation batches may execute concurrently after requirements
and design approval. Shared CLI registration, package exports, help fixtures,
compatibility registry, README files, `.musubix/**`, and generated evidence are
integration-owned.

## Expected verification

- Each batch records a real focused Red followed by an unchanged-test Green.
- Cross-CHANGE gate envelopes are excluded without weakening malformed-evidence
  handling.
- Public baseline creation preserves immutable commit and dirty-path safety.
- Current-session workflow reconciliation reports every discovered input and
  persists strict proof only after strict sanitization and verification.
- CodeGraph benchmarks emit deterministic operation and accuracy metrics
  without changing normal graph caches or quality evidence.
- Focused tests, typecheck, build, full tests, strict trace, graph gate, changed
  gate, and status pass after integration.
