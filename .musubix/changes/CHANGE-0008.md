---
schemaVersion: 1
id: CHANGE-0008
summary: Break the parallel integration release-approval deadlock
status: active
---
# CHANGE-0008: parallel-integration-approval-boundary

Requirements: REQ-M5-PARALLEL-010

Issue: https://github.com/nahisaho/musubix5/issues/13

## Classification

Defect correction and observable behavior clarification. Parallel integration
verification currently consumes release-readiness checks before terminal
quality, candidate snapshot creation, and release approval can occur.

## Confirmed intent

- Permit integration verification to complete only when every required
  implementation check passes; non-required check outcomes remain observable
  but do not decide integration acceptance, and approval-optional profiles may produce a zero-exit changed gate,
  while release profiles may retain only the exact pre-quality
  `change-history` and pre-candidate `approval` diagnostic sets, including a
  prior completed CHANGE's persisted release approval.
- Keep the integration-stage gate and status non-ready; tolerated diagnostics
  never become pass evidence and never satisfy release readiness.
- Bind verified integration provenance to the exact non-approval command and
  check outcomes plus each present tolerated pre-release diagnostic set.
- Fail closed for malformed output, unknown diagnostics on required checks,
  mixed allowed and disallowed required-check failures, skipped required checks,
  environment failures, stale
  integration state, and any unexpected exit code.

## Assumptions

- `REQ-M5-PARALLEL-010` is the sole normative requirement whose statement or
  acceptance changes.
- Candidate snapshot, release approval, handoff, and cleanup requirements remain
  unchanged; their impact is implementation and design wiring only.
- Integration verification requires the plan-bound CHANGE to be the sole active
  CHANGE; completed historical CHANGE documents do not participate.
- The integration verifier uses a dedicated allowlist of exact check/code pairs
  rather than the broader release diagnostic classifier.

## Impact

- Update `REQ-M5-PARALLEL-010` with the integration-stage approval-boundary
  contract and measurable fail-closed acceptance cases.
- Update `DES-M5-PARALLEL-007` and any ADR needed to define the closed
  diagnostic set, evidence projection, and readiness invariant.
- Tighten `integrationGateAcceptable`, status validation, verification evidence,
  and integration reporting in `packages/analysis/src/parallel-runtime.ts`,
  including plan-bound CHANGE/generation validation.
- Add focused Red/Green tests for the allowed approval-only state and rejection
  of unknown, candidate-invalid, mixed, skipped, malformed, success-shaped, and
  unbound foreign-approval states.

## Unchanged behavior

- Every configured required command, strict trace, graph gate, and every
  non-approval required gate check must pass.
- Provisioning and environment failures retain
  `PARALLEL_VERIFICATION_ENVIRONMENT`.
- Verification never creates a candidate snapshot, records release approval,
  hands off a candidate, cleans worktrees, or marks release readiness true.
- Any failed integration verification leaves provenance provisional.

## Acceptance

- A provisional integration with all required implementation checks passing and only the
  explicitly allowed pre-quality/pre-candidate diagnostic sets, or no required
  gate failures, becomes verified.
- The recorded verification evidence preserves the failed approval check and
  exact diagnostic codes; it does not rewrite them to pass.
- `status.gate.ready` remains false until normal terminal quality, candidate
  snapshot, candidate gates, and release approval complete.
- Unknown or candidate-invalid diagnostics on required checks and every
  required failure other than the two tolerated diagnostic sets keep the
  integration provisional and return `PARALLEL_INTEGRATION_VERIFICATION_FAILED`;
  non-required failures remain recorded but do not decide acceptance.
