---
schemaVersion: 1
id: CHANGE-0019
summary: Make candidate and release verification Linux-only
status: superseded
---
# CHANGE-0019: linux-only-candidate-release

Requirements: REQ-M5-LINUX-DELIVERY-001 REQ-M5-LINUX-DELIVERY-002 REQ-M5-LINUX-DELIVERY-003 REQ-M5-LINUX-DELIVERY-004

## Classification

Intentional behavior and release-policy change.

## Confirmed intent

- Candidate calibration and candidate gate workflows execute only on Ubuntu with
  Node.js 24.
- Release readiness and release execution require Linux evidence only.
- Windows and macOS jobs, envelopes, timing observations, and stability evidence
  are neither produced nor required by the candidate and release workflows.
- The existing no-retry, fail-closed, signed-envelope, immutable-candidate,
  quality-gate, calibration, and two-consecutive-run obligations remain.
- Local source portability may remain in the codebase, but hosted Windows and
  macOS candidate/release verification is outside this change's delivery
  boundary.

## Observed impact

- CHANGE-0018 requires exactly three Ubuntu, Windows, and macOS calibration and
  candidate jobs, six stability envelopes, and three-platform release
  revalidation.
- Candidate calibration run `37437846314` became non-credit when this policy
  decision was made and was cancelled.
- Candidate/calibration workflows, evidence schemas, calibration ingestion,
  stability verification, release verification, tests, and documentation are
  in scope.

## Supersession

This change supersedes only the cross-platform candidate and release
obligations established by CHANGE-0018. It does not grant release credit to any
CHANGE-0018 calibration or candidate run and does not weaken the seven-command
quality gate or evidence integrity requirements.

## Deferred work

- Removing general-purpose Windows or macOS compatibility code and tests.
- Changing non-candidate GitHub Actions that are unrelated to release evidence.

## Superseded recovery closure

Both CHANGE-0019 generations were abandoned with their audit history preserved.
CHANGE-0020 supersedes this change and carries fresh approvals and ordered TDD
evidence; no CHANGE-0019 waiver, candidate run, or release credit is reused.
