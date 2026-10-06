---
schemaVersion: 1
id: CHANGE-0018
summary: Stabilize and accelerate candidate verification
status: completed
---
# CHANGE-0018: stabilize-and-accelerate-candidate-verification

Requirements: REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-002 REQ-M5-CI-EFFICIENCY-003 REQ-M5-CI-EFFICIENCY-004 REQ-M5-CI-EFFICIENCY-005 REQ-M5-CI-EFFICIENCY-006

## Superseded release closure

CHANGE-0018 completed its implementation and local quality evidence but did not
produce an approved calibration, stable candidate pair, or release. The user
replaced its three-platform candidate and release boundary with Linux-only
delivery under CHANGE-0019. Run `37437846314` and every earlier CHANGE-0018
calibration remain diagnostic-only and grant no calibration, stability, or
release credit. Here `completed` means administratively closed and superseded,
not released.

## Classification

Defect correction and non-functional behavior change for the Node.js 24
candidate-verification matrix.

## Confirmed intent

- Preserve Generation 50 and Actions run `37257023320` as immutable failed
  diagnostic evidence.
- Complete each Ubuntu, Windows, and macOS candidate job within 20 minutes from
  job start through signed envelope artifact creation.
- Require two consecutive complete three-platform successes for the same
  candidate commit and gate input without automatic test or job retries.
- Preserve every existing fail-closed quality, trace, TDD, performance,
  candidate-tree, LFS, attestation, and approval obligation.
- Make resource-heavy verification deterministic instead of relying on hosted
  runner scheduling luck.
- Make temporary paths, module URLs, runtime bindings, and concurrency fixtures
  portable across Ubuntu, Windows, and macOS.
- Preserve actionable failure evidence that identifies the exact command, test,
  execution partition, and bounded native cause on the first failed attempt.

## Observed impact

- Generation 50 completed with all three matrix jobs failed.
- macOS terminated the test command after 224,867 ms with an incomplete runtime
  acknowledgment.
- Ubuntu failed the 100 MB Git LFS boundary test and nested Vitest worker-pool
  initialization test.
- Windows failed the full test, Code Graph test, and compatibility commands,
  including runtime-binding mismatches, POSIX-only temporary paths, unsupported
  ESM path forms, concurrency budgets exceeded under contention, and LFS
  representation differences.
- The candidate workflow, gate/test-runtime orchestration, portable fixtures,
  structured reports, stability evidence, and release readiness projection are
  therefore in scope.

## Deferred work

- Local Red-Green cycle optimization outside candidate-matrix execution.
- General SDD approval and snapshot automation unrelated to candidate stability.
- Unrelated dependency vulnerability upgrades.
