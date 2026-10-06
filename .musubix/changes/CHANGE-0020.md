---
schemaVersion: 1
id: CHANGE-0020
summary: Deliver the approved Linux-only candidate and release profile
status: active
---
# CHANGE-0020: linux-only-candidate-release-delivery

Requirements: REQ-M5-LINUX-DELIVERY-001 REQ-M5-LINUX-DELIVERY-002 REQ-M5-LINUX-DELIVERY-003 REQ-M5-LINUX-DELIVERY-004

## Classification

Intentional behavior and release-policy change.

## Confirmed intent

- Candidate calibration and candidate gate workflows execute only on Ubuntu
  with Node.js 24.
- Release readiness and release execution require Linux evidence only.
- Windows and macOS jobs, envelopes, timing observations, and stability
  evidence are neither produced nor required by candidate or release workflows.
- The no-retry, fail-closed, signed-envelope, immutable-candidate, quality-gate,
  calibration, and two-consecutive-run obligations remain.

## Recovery boundary

CHANGE-0020 supersedes the abandoned CHANGE-0019 generations without reusing
their TDD phases, waivers, or release credit. CHANGE-0019 remains immutable
diagnostic history. Requirements and design are re-approved for this change,
and all four requirements receive fresh ordered Red and Green evidence.
It supersedes only the exact-three-platform, three-envelope calibration,
six-envelope stability, and three-platform release-revalidation clauses of
REQ-M5-CI-EFFICIENCY-003, REQ-M5-CI-EFFICIENCY-005, and
REQ-M5-CI-EFFICIENCY-006. All other CHANGE-0018 obligations remain in force.

Partially superseded: REQ-M5-CI-EFFICIENCY-003 REQ-M5-CI-EFFICIENCY-005 REQ-M5-CI-EFFICIENCY-006

## Observed impact

- Candidate/calibration workflows, delivery-profile validation, evidence
  schemas, calibration ingestion, stability verification, release verification,
  release and npm-publication workflow bindings, tests, execution-plan
  inventory, and documentation are in scope.
- Existing CHANGE-0018 and CHANGE-0019 calibration or candidate runs grant no
  release credit.

## Deferred work

- Removing general-purpose Windows or macOS compatibility code and tests.
- Changing non-candidate GitHub Actions unrelated to release evidence.
