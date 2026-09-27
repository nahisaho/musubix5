---
schemaVersion: 1
id: CHANGE-0016
summary: Stabilize Wave 0 release operations
status: active
---
# CHANGE-0016: stabilize-wave0-release-operations

Requirements: REQ-M5-WAVE0-COMPLETION-001 REQ-M5-WAVE0-HANDOFF-001 REQ-M5-WAVE0-CANDIDATE-REF-001

## Classification

Defect correction and operational guidance covering GitHub Issues #42, #41,
and #43.

## Confirmed intent

- Preserve the final generation context of a completed CHANGE so workflow,
  approval, candidate, gate, and status validation remain scoped.
- Parse NUL-delimited Git porcelain output without trimming status bytes or
  path characters.
- Make the immutable candidate ref requirement explicit and executable from
  candidate-gate context output and release documentation.
- Keep all historical workflow waivers inert; these corrections must not
  broaden or reactivate waiver scope.

## Requirement impact

- Add three requirements in
  `.musubix/features/wave0-release-operations/requirements.md`.
- Preserve existing lifecycle, parallel handoff, candidate attestation,
  approval, and fail-closed invariants.
- Treat each GitHub Issue as an independent Red-Implementation-Green batch.

## Parallel batches and integration order

| Issue | Requirement batch | Implementation ownership |
|---|---|---|
| #42 | `REQ-M5-WAVE0-COMPLETION-001` | Analysis-layer CHANGE context, workflow selection, approval/gate/status lifecycle, and focused tests. The integrator owns the `packages/cli/src/main.ts` `publicCandidateSnapshotProjection()` call-site and its snapshot projection test. |
| #41 | `REQ-M5-WAVE0-HANDOFF-001` | Parallel runtime Git porcelain parsing and focused tests. |
| #43 | `REQ-M5-WAVE0-CANDIDATE-REF-001` | Candidate-gate context projection after #42, release workflow guidance, and focused tests. |

#41 may be implemented concurrently with #42. #43 depends on #42 because both
batches touch `candidate-gate.ts`; it starts only after #42 is integrated.
`.musubix/**`, `README.md`, `README-ja.md`, and shared CLI entrypoint changes
remain integration-owned. The integrator applies the approved README updates
after the #43 implementation without changing release-version or upgrade
surfaces.

## Expected verification

- A completed CHANGE retains its final generation for validation without
  selecting unrelated historical workflow declarations.
- Requirements, design, and release approvals plus candidate evidence remain
  current after the CHANGE document becomes completed.
- Handoff accepts first-record unstaged modifications covered by
  `integratorOwnedPaths` and preserves rename/copy paths.
- Candidate-gate context emits an immutable candidate ref and ready-to-run
  dispatch/cleanup guidance whose workflow ref resolves exactly to the
  candidate commit.
- Focused tests, typecheck, build, full tests, strict trace, graph gate,
  changed gate, and status pass after integration.

## Integrated result

- Parallel integration attempt 9 was verified and handed off at
  `0ff0b331aa1f3b6cdd22e45fe58eeb33238c224e`.
- The integrator-owned CLI projection and documentation were completed on the
  candidate branch with a Red-Green cycle for
  `TEST-M5-WAVE0-CANDIDATE-DISPATCH-CLI-001`.
- The focused Wave 0 regression set passed 42 tests. The subsequent full
  changed gate passed every non-approval check, including all seven configured
  commands, strict trace, graph, workflow, TDD, and change-history checks.
- Historical workflow waivers remain inactive (`workflowWaivers: []`). Their
  six stale audit diagnostics remain visible and are not used to downgrade any
  workflow error.
- Release review corrections keep explicit approval evidence scoped without
  evaluating unrelated active CHANGE selection and retry only bounded Windows
  `EPERM`, `EACCES`, or `EBUSY` lease filesystem operations. The focused lease
  and original parallel-contention regressions passed in five consecutive runs.
- Candidate snapshot `snapshot-000000000553`, its three-platform gate set, and
  the preceding quality report are historical evidence for candidate
  `0e4b3e30ba0ef2e3e6e8203f9d057dcb162858cc`; the release review corrections
  supersede that candidate, so new quality, snapshot, and signed gates are
  required before release approval.

## Residual risks

- Strict verification of the sanitized transcript for Copilot session
  `6371e116-6cba-4444-b5c7-90b0fab03829` remains blocked because the source
  transcript has no terminal lifecycle event. No event was fabricated and
  compatible reconciliation remains in effect.
- Workspace baseline creation still lacks a public CLI entry point (#46).
- Parallel integration currently allows plan-binding and provisioning mistakes
  to force unnecessary leaf retries (#47).
- Failed or dirty parallel worktrees are retained by cleanup policy for audit
  and require later explicit maintenance.
