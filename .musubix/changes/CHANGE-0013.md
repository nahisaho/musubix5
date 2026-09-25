---
schemaVersion: 1
id: CHANGE-0013
summary: Restore repository-wide TDD source currency
status: active
---
# CHANGE-0013: repository-tdd-currency

Requirements: REQ-M5-TDD-CURRENCY-001

## Classification

Defect correction and evidence maintenance. Completing CHANGE-0012 exposes
eleven pre-existing `TDD_TEST_STALE` diagnostics tracked by GitHub Issue #34.
The tests pass, but their latest verified Green fingerprints predate real test
source changes and cannot be repaired by the algorithm-only migration command.

## Confirmed intent

- Rebuild genuine Red, Implementation, and Green evidence for all eleven test
  IDs named by `REQ-M5-TDD-CURRENCY-001`.
- Bind every replacement cycle to CHANGE-0013 and the new repository-currency
  requirement.
- Use controlled temporary implementation faults to produce real Red results,
  then restore the existing correct implementation before Green.
- Add every test's new `@verifies` trace link after the design phase record and
  before any Red observation.
- Record all eleven `tdd red` observations before the CHANGE Red phase record.
  For each Red, inject only that test's controlled implementation fault, record
  the failure, and restore the implementation before proceeding to the next
  Red so every temporary fault is absent from the restored annotated tree.
- After the CHANGE Red record, add the implementation trace annotation, record
  the CHANGE implementation phase, and only then record all eleven Greens on
  the single restored annotated tree before the CHANGE Green phase record.
- Leave no semantic product-code change and no test-body change in the final
  candidate other than requirement and implementation trace annotations.
- Validate repository-wide TDD currency after marking the CHANGE completed.
- Keep GitHub Issue #5 out of scope until this maintenance change is complete.

## Requirement impact

- Add `REQ-M5-TDD-CURRENCY-001` as a repository-specific obligation that the
  eleven authoritative tests identified by Issue #34 retain current verified
  Green fingerprints when no CHANGE is active.
- Existing product behavior requirements remain unchanged.

## Expected design impact

- Define a deterministic repair matrix mapping each stale test to a controlled
  temporary implementation fault, focused Vitest command, restoration step,
  and final fingerprint verification.
- Add `DES-M5-TDD-CURRENCY-001` with
  `Requirements: REQ-M5-TDD-CURRENCY-001`.
- Require fail-closed restoration checks so temporary faults cannot enter the
  candidate.

## Expected implementation impact

- Add `REQ-M5-TDD-CURRENCY-001` to the authoritative annotations of the eleven
  existing tests after recording design and before recording any Red.
- After the CHANGE Red phase record and before the implementation phase record,
  add a comment-only implementation trace annotation for
  `REQ-M5-TDD-CURRENCY-001` to the existing TDD currency implementation.
- Persist new TDD and ordered CHANGE evidence for the genuine repair cycles.
- Record the full-requirement quality phase after Green and before completion
  simulation or release approval.
- Do not retain product implementation changes after Green.

## Expected verification

- Every target test records a real failing Red and passing Green.
- Before completion, a disposable full copy of the control working tree,
  including untracked files and modified evidence, with only CHANGE-0013 marked
  completed reports `valid: true` and zero `TDD_TEST_STALE` diagnostics.
- `npx musubix5 tdd validate --json` reports no `TDD_TEST_STALE` diagnostics
  after CHANGE completion.
- Strict trace, graph gate, changed gate, and status complete successfully,
  then the CHANGE quality phase is recorded before completion.

## Residual risks

- The repair intentionally changes evidence history without changing shipped
  runtime behavior.
- Temporary fault injection must be restored and independently checked before
  any candidate or release operation.
