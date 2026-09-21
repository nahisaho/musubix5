---
schemaVersion: 1
id: CHANGE-0002
summary: Define the clean musubix5 compatibility and architecture requirements
status: proposed
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
