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

## Execution evidence

- Design approval `5e2b57576c4791421ba7ed19ea29b6b639059a29fb051a5d1836c1821b1c68c5`
  was recorded for generation 1 before any Red.
- The eleven target tests each have a valid genuine Red and Green bound to
  `CHANGE-0013`, generation 1, `REQ-M5-TDD-CURRENCY-001`, and command `test`.
  Red orders are 2087 and 2089 through 2098; Green orders are 2101 through
  2111. Every valid cycle has `red.order < green.order`, a changed non-test
  source fingerprint, and a Green test fingerprint matching the current
  authoritative source.
- A preliminary `TEST-M5-RELEASE-003` Red attempt at order 2088 produced no
  scoped test result and is retained as invalid append-only evidence. The later
  genuine failed observation at order 2089 is the valid Red linked to Green
  order 2102.
- Every temporary implementation fault was removed immediately after its Red.
  SHA-256 restoration checks passed for `candidate-gate.ts`,
  `release-workflow.ts`, `graph.ts`, `parallel-runtime.ts`, `tdd.ts`,
  `process.ts`, and `approval.ts`. No build ran while a fault was present.
- Final source changes are limited to the requirement/design/ADR and CHANGE
  artifacts, the eleven test `@verifies` links, the comment-only
  `CODE-M5-TDD-CURRENCY-REPAIR-001` implementation trace node, and generated
  approval/TDD/order/trace/quality/workflow evidence.
- `npm run typecheck`, `npm run build`, strict trace, graph gate, all configured
  quality commands, TDD validation, performance evidence, and workflow
  verification pass. The optional formal check reports unsupported prose only
  and has no error diagnostic.
- A disposable full copy of the control working tree, including untracked files
  and modified evidence, was marked completed and returned `valid: true` with
  zero `TDD_TEST_STALE` diagnostics from repository-wide
  `npx musubix5 tdd validate --json`.
- The pre-release changed gate has no required non-approval failure. Release
  approval remains fail-closed until the current working candidate is committed,
  a repository-matching CHANGE-0013 generation-1 candidate snapshot is created,
  candidate-bound quality and gate status are current, and release approval for
  that snapshot is explicitly recorded.

## Release residual risks

- The append-only invalid preliminary Red remains in historical evidence but
  cannot satisfy coverage or source currency; the later linked valid cycle has
  greater verified order.
- The repair changes evidence chronology and trace annotations, not runtime
  behavior. A future change to any of the eleven test bodies will correctly
  require a new current Green fingerprint.
- The final control-tree completion validation must be repeated after recording
  release approval and changing this CHANGE to completed.
- At the time of this summary the repair candidate is uncommitted and no live
  CHANGE-0013 generation-1 candidate snapshot exists. Release approval must not
  be prepared or recorded until the candidate commit, snapshot creation, and
  candidate-bound gate refresh are complete.
