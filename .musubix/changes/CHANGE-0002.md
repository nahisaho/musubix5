---
schemaVersion: 1
id: CHANGE-0002
summary: Implement the clean musubix5 compatibility and architecture foundation
status: quality-blocked
---
# CHANGE-0002: musubix5-clean-foundation

Requirements: REQ-M5-COMPAT-001 REQ-M5-COMPAT-002 REQ-M5-COMPAT-003 REQ-M5-COMPAT-004 REQ-M5-COMPAT-005 REQ-M5-COMPAT-006 REQ-M5-COMPAT-007 REQ-M5-COMPAT-008 REQ-M5-COMPAT-009 REQ-M5-COMPAT-010 REQ-M5-COMPAT-011 REQ-M5-COMPAT-012 REQ-M5-COMPAT-013 REQ-M5-LIFECYCLE-001 REQ-M5-LIFECYCLE-002 REQ-M5-LIFECYCLE-003 REQ-M5-LIFECYCLE-004 REQ-M5-APPROVAL-001 REQ-M5-APPROVAL-002 REQ-M5-APPROVAL-003 REQ-M5-APPROVAL-004 REQ-M5-APPROVAL-005 REQ-M5-APPROVAL-006 REQ-M5-APPROVAL-007 REQ-M5-APPROVAL-008 REQ-M5-APPROVAL-009 REQ-M5-BUDGET-001 REQ-M5-BUDGET-002 REQ-M5-BUDGET-003 REQ-M5-BUDGET-004 REQ-M5-BUDGET-005 REQ-M5-EVIDENCE-001 REQ-M5-EVIDENCE-002 REQ-M5-EVIDENCE-003 REQ-M5-EVIDENCE-004 REQ-M5-EVIDENCE-005 REQ-M5-WAIVER-001 REQ-M5-TDD-001 REQ-M5-TDD-002 REQ-M5-TDD-003 REQ-M5-TDD-004 REQ-M5-WORKTREE-001 REQ-M5-WORKTREE-002 REQ-M5-WORKTREE-003 REQ-M5-WORKTREE-004 REQ-M5-PLANNER-001 REQ-M5-PLANNER-002 REQ-M5-PLANNER-003 REQ-M5-PLANNER-004 REQ-M5-BOOTSTRAP-001 REQ-M5-BOOTSTRAP-002 REQ-M5-BOOTSTRAP-003 REQ-M5-BOOTSTRAP-004 REQ-M5-QUALITY-001 REQ-M5-QUALITY-002 REQ-M5-QUALITY-003 REQ-M5-QUALITY-004 REQ-M5-QUALITY-005 REQ-M5-RELEASE-001

## Classification

Feature: new clean implementation with compatibility constraints.

## Intent

Define musubix5 from primary-source comparison of musubix3 v0.1.18 and
musubix4 v0.1.3. Treat musubix3 as the behavior oracle and musubix4 as design
input only.

## Boundaries

- Modify only `/home/nahisaho/GitHub/musubix5`.
- Keep musubix3 and musubix4 read-only.
- Do not reuse `CHANGE-0001` approvals or evidence.
- Do not import generated evidence from musubix3 or musubix4.
- Treat musubix3-produced requirements/design approvals as bootstrap
  authorization only and re-record equivalent native approvals before release.
- Do not start design or implementation before current exact-hash requirements
  approval.
- Do not publish, release, tag, or push without separate explicit human
  authorization.

## Impact

- New normative requirements for compatibility, lifecycle, approval repair,
  budgets, evidence, TDD, worktrees, Planner output, bootstrap, and quality.
- Future design will define architecture, ADRs, schemas, transitions, and C4
  diagrams after requirements approval.
- The human selected a single `musubix5` executable with no `musubix3` alias.
  This is an intentional compatibility break requiring an ADR, migration guide,
  and regression tests.

## Inputs

- `docs/initial-architecture-assessment.md`
- `docs/migration-guide.md`
- `docs/baseline/musubix3-v0.1.18-cli-help.json`
- normative compatibility inventory in
  `.musubix/features/musubix5-clean-foundation/requirements.md`
- musubix3 tag `v0.1.18`
- musubix4 tag `v0.1.3` and its dirty state as non-release design evidence

## Implemented outcome

- Preserved the pinned musubix3 CLI, JSON, exit-code, configuration, trace,
  graph, TDD, approval, gate, status, installation, and startup contracts.
- Added repository-wide monotonic order, durable leases, resumable lifecycle
  transitions, separated evidence registries, native exact-hash approvals,
  budget reservations, repairable verified-auto boundaries, run-local
  specification isolation, deterministic current TDD-cycle selection, and
  isolated candidate/QA workspaces.
- Added an explicit, bounded Bootstrap Runner that cannot write normal
  approval, TDD, trace, graph, workflow, quality, release, package, or waiver
  evidence and cannot authorize a release.
- Added deterministic quality/readiness classification and a separate,
  candidate-bound, single-purpose authorization guard for publish, tag, and
  push operations.
- Removed inherited musubix3 trace declarations so all authoritative trace
  links and generated evidence belong to musubix5.

## Quality evidence

- TypeScript typecheck and build pass.
- The complete Vitest suite and pinned compatibility suite pass.
- Package contents and isolated installation/startup smoke checks pass.
- Strict trace coverage and graph gate pass.
- The current quality checkpoint follows the latest complete Red,
  Implementation, and Green evidence for every requirement.
- The optional formal check reports `fail` because all 59 prose requirements
  are `FORMAL_UNSUPPORTED` by the current Boolean abstraction; it grants no
  proof credit.
- The required overall gate remains `fail` until
  `WORKFLOW_INVOCATION_UNVERIFIED` is reconciled from the completed Copilot
  transcript and the exact release manifest receives human approval.
- `CHANGE_RECORDEDAT_OUT_OF_ORDER` remains a non-blocking historical warning:
  monotonic order 216 precedes 217 even though their wall-clock `recordedAt`
  values are reversed. Persisted order, not wall-clock time, is authoritative.

## Release boundary

The candidate is version `0.1.0` on branch `change/CHANGE-0002`; its immutable
commit and exact release manifest SHA-256 will be established only after these
changes are committed and workflow evidence is reconciled. Release approval
remains pending. No package publication, Git tag, or remote push has been
performed. Each external operation additionally requires a separate explicit
human authorization bound to the approved candidate.
