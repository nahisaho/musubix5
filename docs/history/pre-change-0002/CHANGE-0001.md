---
schemaVersion: 1
id: CHANGE-0001
summary: Establish the clean musubix5 compatibility and architecture foundation
status: in-progress
---
# CHANGE-0001: musubix5-foundation

Requirements: REQ-MUSUBIX5-COMPAT-001 REQ-MUSUBIX5-COMPAT-002 REQ-MUSUBIX5-COMPAT-003 REQ-MUSUBIX5-COMPAT-004 REQ-MUSUBIX5-COMPAT-005 REQ-MUSUBIX5-COMPAT-006 REQ-MUSUBIX5-COMPAT-007 REQ-MUSUBIX5-LIFECYCLE-001 REQ-MUSUBIX5-LIFECYCLE-002 REQ-MUSUBIX5-LIFECYCLE-003 REQ-MUSUBIX5-APPROVAL-001 REQ-MUSUBIX5-APPROVAL-002 REQ-MUSUBIX5-APPROVAL-003 REQ-MUSUBIX5-APPROVAL-004 REQ-MUSUBIX5-APPROVAL-005 REQ-MUSUBIX5-APPROVAL-006 REQ-MUSUBIX5-BUDGET-001 REQ-MUSUBIX5-BUDGET-002 REQ-MUSUBIX5-BUDGET-003 REQ-MUSUBIX5-EVIDENCE-001 REQ-MUSUBIX5-EVIDENCE-002 REQ-MUSUBIX5-EVIDENCE-003 REQ-MUSUBIX5-TDD-001 REQ-MUSUBIX5-TDD-002 REQ-MUSUBIX5-TDD-003 REQ-MUSUBIX5-WORKTREE-001 REQ-MUSUBIX5-WORKTREE-002 REQ-MUSUBIX5-WORKTREE-003 REQ-MUSUBIX5-PLANNER-001 REQ-MUSUBIX5-PLANNER-002 REQ-MUSUBIX5-PLANNER-003 REQ-MUSUBIX5-PLANNER-004 REQ-MUSUBIX5-BOOTSTRAP-001 REQ-MUSUBIX5-BOOTSTRAP-002 REQ-MUSUBIX5-BOOTSTRAP-003 REQ-MUSUBIX5-BOOTSTRAP-004 REQ-MUSUBIX5-QUALITY-001 REQ-MUSUBIX5-QUALITY-002 REQ-MUSUBIX5-QUALITY-003

## Intent

Create musubix5 as a clean implementation using musubix3 v0.1.18 as the
behavior oracle and musubix4 only as a source of design lessons. Do not import
musubix4 CHANGE, approval, waiver, TDD, workflow, trace, quality, release, or
benchmark evidence.

The first protected boundary defines compatibility, lifecycle, approval,
budget, evidence, TDD, worktree, Planner, bootstrap, and quality requirements.
The npm package and sole executable are named `musubix5`; the removal of the
`musubix3` executable name is an intentional compatibility break requiring an
ADR, migration guide, and regression tests.

## Scope

- Build only under `/home/nahisaho/GitHub/musubix5`.
- Treat musubix3 and musubix4 as read-only inputs.
- Obtain current requirements and design exact-hash approvals before code.
- Implement each requirement through real Red, implementation, and Green
  evidence.
- Do not publish, release, tag, or push without explicit human approval.

