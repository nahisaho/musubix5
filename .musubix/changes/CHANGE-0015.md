---
schemaVersion: 1
id: CHANGE-0015
summary: Stabilize Wave 1 maintenance workflows
status: active
---
# CHANGE-0015: stabilize-maintenance-workflows

Requirements: REQ-M5-COMPAT-013 REQ-M5-EVIDENCE-009 REQ-M5-MULTI-CHANGE-007 REQ-M5-WAVE1-TRACE-001 REQ-M5-WAVE1-TRACE-002 REQ-M5-WAVE1-TDD-001 REQ-M5-WAVE1-TDD-002 REQ-M5-WAVE1-PUBLISH-001 REQ-M5-WAVE1-CLEANUP-001 REQ-M5-WAVE1-CLEANUP-002 REQ-M5-WAVE1-NAMING-001 REQ-M5-WAVE1-EVIDENCE-001 REQ-M5-WAVE1-EVIDENCE-002

## Classification

Defect correction, behavior change, test hardening, and scalability
improvement covering GitHub Issues #2, #11, #18, #25, #35, and #38.

## Confirmed intent

- Make feature trace projections deterministic and avoid unrelated rewrites.
- Add append-only, cycle-scoped repair for stale parallel-bound TDD evidence,
  including deterministic resume and audited abandonment of unrecoverable
  pending operations.
- Continue npm registry visibility checks until the configured hard deadline.
- Reconcile candidate cleanup with the accepted state-conditional design:
  `failed | abandoned | stale` candidates may remove only their worktree while
  retaining unintegrated branch and commit history.
- Replace unintended user-facing/generated `musubix3` literals while
  preserving intentional compatibility identities and environment variables.
- Strengthen evidence selector architecture coverage and prove the
  `projectStatus` stale path end to end.

## Requirement impact

- Add ten requirements across six issue-owned feature artifacts so parallel
  assignments have explicit requirement ownership.
- Amend `REQ-M5-EVIDENCE-009` so generated evidence inputs exclude the shared
  trace index and migration-era feature trace files.
- Amend `REQ-M5-MULTI-CHANGE-007` to replace its unconditional
  unintegrated-commit cleanup rejection with the approved state-conditional
  policy.
- Amend `REQ-M5-COMPAT-013`, the additive-help registry, pinned help fixtures,
  and the CLI domain-exit registry for `tdd repair [test-id]`: normal mode uses
  `--cycle <cycle-id>`, mutually exclusive `--replacement-cycle <cycle-id>` /
  `--retire`, and required `--approver`, `--reason`, and `--confirm`; recovery
  modes use either `--resume <operation-id> --confirm` or
  `--abandon-pending <operation-id> --approver <name> --reason <text>
  --confirm`.
- Existing `tdd red`, `green`, `refactor`, `migrate`, and `void` commands gain
  an exit-1 `TDD_REPAIR_PENDING` fail-closed path while an append-only repair
  operation is journaled but not projected. The diagnostic exposes the pending
  operation identity and exact recovery command without weakening existing
  option-validation behavior.
- Treat each GitHub Issue as an independent Red-Implementation-Green batch.

## Parallel batches and integration order

| Issue | Requirement batch | Integration |
|---|---|---|
| #25 | `REQ-M5-EVIDENCE-009`, `REQ-M5-WAVE1-TRACE-001`, `REQ-M5-WAVE1-TRACE-002` | Parallel assignment owning shared trace source under `packages/**`, the `trace.ts` missing-graph guidance token, release-exclusion, evidence-input, foundation implementation, and affected existing trace/evidence tests; predecessor of #11 and #35. |
| #2 | `REQ-M5-WAVE1-PUBLISH-001` | Independent parallel assignment owning the committed npm registry verifier, publish workflow, and focused release tests; the requirement, DES-M5-021 clauses, and release policy remain integrator-owned pre-dispatch artifacts. |
| #11 | `REQ-M5-WAVE1-NAMING-001` | Parallel assignment with explicit dependency on completed #25; its Red uses the other five legacy-name surfaces and its Green verifies all six. |
| #18 | `REQ-M5-WAVE1-EVIDENCE-001`, `REQ-M5-WAVE1-EVIDENCE-002` | Independent parallel assignment. |
| #35 | `REQ-M5-COMPAT-013`, `REQ-M5-WAVE1-TDD-001`, `REQ-M5-WAVE1-TDD-002` | Parallel assignment depending on #25 because its implementation consumes shared trace and evidence-selection plumbing owned by #25; predecessor of #38 because both touch `main.ts`. |
| #38 | `REQ-M5-MULTI-CHANGE-007`, `REQ-M5-WAVE1-CLEANUP-001`, `REQ-M5-WAVE1-CLEANUP-002` | Parallel assignment with explicit dependency on completed #35. |

Execution uses one CHANGE-0015 `parallel plan`, not six candidate-workspace
registrations. The plan records dependency edges #25 -> #11, #25 -> #35, and
#35 -> #38. #2, #18, and #25 may execute concurrently; #11 and #35 start after
#25, and #38 starts after #35. Assignment ownership patterns are disjoint for
independent nodes, and dependency edges explicitly order shared source and
foundation artifacts. The parallel integrator applies completed assignments
once in stable topological order and performs one clean full verification.

All requirement, design, ADR, CHANGE, approval, generated trace, and
documentation artifacts are completed and committed before dispatch or remain
integrator-owned. Assignments own only declared implementation/test surfaces
under `packages/**`, `tests/**`, `scripts/**`, and `.github/**`; they do not
declare `.musubix/**`, `docs/**`, or `README*.md` paths. Before dispatch, the
integrator updates and commits `docs/migration-guide.md` for the additive TDD
repair contract and retained legacy/shared generated-trace exclusions, plus
`README.md` and `README-ja.md` for the shared trace index. Generated
`.musubix/cache/trace.json`, the portable committed trace index, and legacy
`.musubix/features/*/trace.json` removal are integration-owned outputs. The
integrator regenerates the authoritative trace state once from the integrated
source tree before verification.

## Expected verification

- Each batch has an authoritative failing Red before implementation and an
  unchanged passing Green afterward. #18 uses one authoritative test for both
  evidence requirements and obtains Red from a synthetic direct-consumer
  violation against the new architecture guard rather than claiming the
  already-correct production selector or `projectStatus` path is broken.
- Six issue-owned design artifacts are completed, approved, and committed
  before dispatch. Each assignment owns only its declared implementation and
  test paths, while all `.musubix/**`, `docs/**`, `README*.md`, and generated
  trace/cache paths remain integrator-owned.
- Unrelated trace files remain byte-stable.
- TDD repair preserves unrelated ledger entries and hash-chain integrity.
- Registry visibility can succeed after the former sixth-attempt boundary.
- Candidate cleanup retains recoverable branch and commit history.
- Intentional compatibility references to `musubix3` remain unchanged.
- Skill-only edits make persisted quality status stale through the production
  `projectStatus` path.
- Typecheck, build, complete tests, strict trace, graph gate, changed gate, and
  status all pass after integration.

## Integration and quality evidence

- Parallel integration attempt 14 is verified at commit
  `13ce77e4af7f49e9701304af16955cb691c47fc0`.
- The verified attempt passed every configured required command: typecheck,
  build, full Vitest, codegraph tests, compatibility tests, package checks, and
  package smoke tests. The same required-command suite was rerun after the
  Windows portability corrections before freezing the release candidate.
- Strict trace and graph gates pass. The current
  `.musubix/evidence/quality.json` shows that every required check passes except
  release approval after recording the generation 3 quality checkpoint.
- Failed, abandoned, and stale candidate cleanup retain recoverable branch and
  commit history while removing only the eligible worktree. Active candidates
  remain fail-closed unless their candidate commit is already integrated.
- Workflow declarations pass reconciliation in compatible mode without
  activating or adding a stale workflow waiver. The completed predecessor
  transcript is sanitized without truncation, but strict terminal verification
  remains pending because the shared Copilot CLI runtime has not emitted that
  session's terminal result or routine shutdown event.
- Candidate matrix rehearsals exposed and verified two Windows portability
  corrections before the final freeze: normalized TypeScript source-path
  comparison and OS-resolved synthetic roots, plus candidate refresh fixtures
  isolated from concurrent repository graph scans.
- This document is a fingerprinted quality input and is frozen before the
  final immutable snapshot. Snapshot, signed matrix-envelope, and release
  approval records appended after the freeze are the authoritative
  candidate-bound release evidence.

## Residual risks before release approval

- At document freeze, release approval and the final immutable candidate
  snapshot are not yet recorded. Pre-freeze snapshot
  `snapshot-000000000434` is retired because this fingerprinted document
  changed; its creation and tombstone remain append-only audit records. After
  the freeze, release readiness requires one live snapshot plus fresh strict
  GitHub OIDC-bound Ubuntu, Windows, and macOS Node 24 envelopes for that exact
  candidate.
- Strict verification of predecessor session
  `6371e116-6cba-4444-b5c7-90b0fab03829` cannot complete until its owning
  Copilot CLI runtime emits a terminal lifecycle event; compatible
  reconciliation is not claimed as strict proof. The current session
  `7e0225ea-dc31-49c2-a63e-4adf28641cb8` is re-sanitized through the candidate
  gate import declarations in compatible mode and must be refreshed again
  after its final completion declaration.
- Six historical workflow waiver records remain in
  `.musubix/evidence/workflow-waivers.json` with stale error diagnostics. They
  are inert (`workflowWaivers: []`) and are not active release exceptions.
- `.musubix/evidence/release/gates/` also retains historical envelopes from
  earlier changes and matrices. Candidate validation selects only the exact
  CHANGE generation, candidate commit, fingerprint, and required closed matrix;
  historical records are not accepted as current CHANGE-0015 evidence.
- The handoff cleanliness parser currently trims the leading status space from
  the first unstaged porcelain entry. Staging integrator-owned `.musubix/**`
  evidence avoids the false `dirty-at-base` classification without changing
  evidence content. The defect is tracked in #41; the workaround is required
  for future handoffs until that issue is fixed.
- The final cleanup invocation removed three selected clean assignment
  worktrees and retained three selected dirty assignment worktrees plus the
  dirty verified integration worktree. Including earlier attempts outside that
  cleanup selection, 30 CHANGE-0015 worktrees and 46 local CHANGE-0015 branches
  remain registered for audit.
