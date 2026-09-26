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
