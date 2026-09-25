---
schemaVersion: 1
id: CHANGE-0012
summary: Make Unix-socket verification portable and TDD currency selection deterministic
status: active
---
# CHANGE-0012: portable-unix-socket-and-tdd-currency

Requirements: REQ-M5-CI-002 REQ-M5-TDD-003

## Classification

Defect corrections. The parallel-runtime partial-copy regression test
constructs its Unix-domain socket under the default temporary-directory-derived
fixture root, which can exceed the macOS `sun_path` limit and fail before
exercising the intended overlay-copy rollback behavior. Separately, TDD source
currency validation can select an old legacy unscoped cycle instead of a newer
verified scoped Green cycle and report false `TDD_TEST_STALE` diagnostics.

This change supersedes the temporary `${{ runner.temp }}` mitigation recorded
as a residual risk by CHANGE-0010 and closes GitHub Issues #17 and #19.

## Confirmed intent

- Keep the real Unix-domain socket inside the fixture repository's `.musubix`
  tree so the overlay copy encounters the unsupported entry.
- Bind the socket through a bounded short pathname on POSIX systems, independent
  of the platform default temporary-directory length.
- Remove the candidate-gate `TMPDIR` override that currently masks the defect.
- Preserve the Windows skip because filesystem Unix-domain sockets are not part
  of this regression scenario there.
- Select the effective latest passing TDD cycle by verified monotonic terminal
  order for source-currency validation while preserving the existing
  active-generation scoped-or-unscoped target membership predicate.
- Prevent legacy unscoped cycles from shadowing newer verified scoped cycles.
- Preserve valid-void fallback by bounding source-currency selection to terminal
  fingerprint evidence strictly before the latest valid void order.
- Without an active CHANGE, allow unscoped open work to suppress staleness and
  allow scoped open work only when it matches the unbounded greatest terminal
  scope fixed before a void bound.
- Scope void structural guards, targets, and fallback candidates to the active
  generation's scoped or unscoped cycles, and run
  missing-cycle-ID/missing-chain guards before retained
  valid-Green/already-voided message selection.
- Scope fingerprint migration targets, void candidates, and work events to the
  same active generation while a CHANGE is active.
- Reject blank or whitespace-only migration approvers before persistence and
  classify equivalent historical records with the existing legacy-evidence
  diagnostic.

## Requirement impact

- Add `REQ-M5-CI-002` for portable Unix-socket verification paths in the
  Node.js 24 Ubuntu, Windows, and macOS candidate verification policy.
- Expand `REQ-M5-TDD-003` to define verified-order source-currency selection,
  active and no-active work suppression, migration and void operation scopes,
  void fallback eligibility, retained error precedence and exit classes, and
  the intentional compatibility differences while preserving active-generation
  requirement coverage.
- Register the resulting CLI and diagnostic differences under the existing
  governance requirement `REQ-M5-COMPAT-013` without adding it to this
  generation's implementation requirement set; CHANGE-0012 changes
  `REQ-M5-TDD-003`, while COMPAT-013 supplies the pre-existing registration
  policy.

## Design impact

- Add `DES-M5-CI-002` to define `withShortUnixSocket()` in the dedicated
  `tests/fixtures/short-unix-socket.ts` module. The callback helper creates a
  unique mode-0700 directory under `/tmp`, places a directory symlink to the
  target `.musubix` directory inside it, owns server startup and cleanup through
  `try/finally`, and uses a separately testable
  `createShortSocketDirectory(base = '/tmp')` seam to report an explicit setup
  error naming the failed base directory. It rejects a candidate socket path
  above 90 UTF-8 bytes before creating the symlink or calling `listen()`.
- Add `CODE-M5-CI-SHORT-SOCKET-001` as a dedicated implementation trace block
  on that helper, separate from its `TEST-*` verification annotations.
- Add `ADR-0022` for the fixed `/tmp` directory-alias strategy and removal of
  the workflow-level `TMPDIR` mitigation.
- Update `TEST-M5-CI-NODE24-001` so it no longer requires the candidate
  workflow's temporary `TMPDIR` override, and add
  `TEST-M5-CI-DEFAULT-TMPDIR-001` to verify its complete absence for
  `REQ-M5-CI-002`.
- Add `REQ-M5-CI-002` to the existing candidate-workflow
  `CODE-M5-CI-NODE24-001` implementation annotation.
- Add `DES-M5-TDD-005` so source-currency validation and valid-void fallback
  share effective-latest selection based on verified monotonic terminal
  fingerprint order and never use evidence array position.
- Add `CODE-M5-TDD-EFFECTIVE-LATEST-001` for the shared validation, migration,
  and void selector/index implementation.
- Add `ADR-0023` for separating source-currency chronology from active
  CHANGE/generation coverage selection.
- Add `TEST-M5-TDD-EFFECTIVE-LATEST-001` for the cross-CHANGE legacy/scoped
  ordering regression.
- Add `TEST-M5-TDD-MAINTENANCE-SCOPE-001` for the exact unverified-void
  no-overwrite exit-1 behavior.
- Unannotated companion cases in the same file supplement regression coverage
  for the remaining approved selection, migration, void, integrity, and cache
  matrix without changing either authoritative test fingerprint.

## Implementation impact

- `.musubix/features/node24-github-actions/design.md`
- `.musubix/features/node24-github-actions/requirements.md`
- Generated `.musubix/features/*/trace.json` projections
- `.musubix/decisions/ADR-0022.md`
- `.musubix/decisions/ADR-0023.md`
- `.github/workflows/candidate-gate.yml`
- `tests/candidate-gate.test.ts`
- `tests/fixtures/short-unix-socket.ts`
- `tests/parallel-release-blockers-generation5.test.ts`
- `tests/short-unix-socket.test.ts`
- `.musubix/features/musubix5-clean-foundation/requirements.md`
- `.musubix/features/musubix5-clean-foundation/design.md`
- `docs/migration-guide.md`
- `packages/analysis/src/tdd.ts`
- `tests/tdd-generation-scope.test.ts`
- `vitest.config.ts`
  - Raises the repository-wide bounded test timeout from 20 seconds to 60
    seconds after the first Windows Node.js 24 candidate run showed that
    `TEST-M5-PARALLEL-REAL-GATE-SUCCESS-001` can exceed 20 seconds on the
    hosted Windows runner even though the same test passes locally in about
    seven seconds. The timeout remains finite and changes only failure latency;
    it does not skip or weaken assertions. A per-test timeout would modify the
    authoritative annotated test source and require an unrelated replacement
    TDD fingerprint cycle, so the existing suite-level timeout policy was
    adjusted instead.

## Expected verification

- `TEST-M5-CI-SHORT-SOCKET-PATH-001` proves the unique short alias path remains
  below the configured byte bound, creates the socket entry in the target
  `.musubix` directory, and removes the server, alias, and socket after a forced
  callback failure without deleting a target sentinel; it also verifies handled
  bind failure, Windows rejection, explicit base setup failure, controlled
  overlength rejection, and the dedicated module's dependency constraints.
- `TEST-M5-PARALLEL-WORKSPACE-PARTIAL-COPY-001` continues to prove overlay-copy
  failure with the `z-overlay-copy-failure.sock` basename in the CLI diagnostic,
  non-zero CLI exit, and workspace-state restoration with the bounded helper
  and adds `REQ-M5-CI-002` to its trace annotation.
- `TEST-M5-CI-DEFAULT-TMPDIR-001` proves the candidate workflow contains no
  `TMPDIR` assignment in any `env` mapping or `GITHUB_ENV` write.
- The candidate workflow's removal of the `TMPDIR` override and the dedicated
  short Unix-socket test helper are CI-internal portability corrections governed
  by `REQ-M5-CI-002` and `ADR-0022`; they do not alter the public CLI or JSON
  compatibility surface governed by `REQ-M5-COMPAT-013`.
- The full Node.js 24 macOS candidate-gate job passes with the runner's default
  temporary-directory environment and produces the required macOS envelope.
- A regression test proves that an older legacy unscoped cycle cannot become
  the stale-check target when a newer verified scoped Green cycle has the same
  fingerprint as the current test source
  (`TEST-M5-TDD-EFFECTIVE-LATEST-001`).
- Unannotated companion cases prove unrelated historical test IDs are not newly
  subjected to source-currency diagnostics outside the preserved active-cycle
  valid-Green membership predicate, and proves the no-active-CHANGE
  all-valid-Green-test branch.
- Those companion cases also cover active and no-active open-work suppression,
  foreign-work non-suppression, trimmed migration recording and diagnostics,
  verified-order void targeting including already-voided/unverifiable
  rejection, scoped structural-guard precedence, duplicate chain multiplicity,
  and per-test cache isolation for multiple annotated tests in one file.
- `TEST-M5-TDD-MAINTENANCE-SCOPE-001` owns the unverified-void no-overwrite
  regression; `TEST-M5-TDD-EFFECTIVE-LATEST-001` owns the primary ordering
  regression. The unannotated cases are supplemental regression coverage rather
  than separate trace entities.
- Existing valid-void fallback behavior continues to select the greatest
  verified passing order before the void record.
- Open Red cycles suppress source-currency staleness until Green or valid void,
  preserving the existing TDD working interval.
- Candidate run `36147273379` passed Ubuntu and macOS but failed the Windows
  `command:test` check because
  `TEST-M5-PARALLEL-REAL-GATE-SUCCESS-001` exceeded the former 20-second
  Vitest timeout. That run was dispatched from head `91cd5fe`, not snapshot
  `snapshot-000000000156`'s candidate commit `449c0b9`, so it would not have
  been admissible OIDC-bound candidate evidence even if Windows had passed.
  Snapshot 156 was retired, the bounded suite timeout was raised to 60 seconds,
  and replacement snapshot `snapshot-000000000158` bound candidate commit
  `e2dd762`.
- Replacement candidate run `36149443486`, dispatched from a temporary branch
  whose head was exactly `e2dd762` so the GitHub OIDC `sha` claim matched the
  attested candidate, passed the complete Node.js 24 matrix on Ubuntu, Windows,
  and macOS. All three ingested OIDC-bound envelopes match generation 2, the
  persisted repository identity, gate-input fingerprint
  `f101899e245a586d8bb6f7e4a063cce3826a49c1d0e56afb1c3e09e74a5a319c`,
  the candidate commit, the required command set, and clean pre/post trees.

## Residual risks

- The helper relies on the conventional POSIX `/tmp` directory to obtain a
  pathname whose length is independent of the user-specific macOS temporary
  directory.
- Windows retains its existing early return for the Unix-socket-specific portion
  of the test.
- Source-currency selection intentionally considers historical completed-CHANGE
  cycles; requirement coverage remains restricted to the active generation.
- During an active CHANGE, tests with no scoped or unscoped cycle in that active
  generation containing valid Green evidence are not source-currency targets
  until repository-wide validation runs without an active CHANGE.
- Legacy supersession diagnostics still use their pre-existing array-position
  classification; CHANGE-0012 removes array position only from source-currency,
  migration, and void-fallback chronology.
- While a CHANGE is active, `tdd void` no longer targets foreign or
  prior-generation dangling cycles; complete or abandon the active CHANGE
  before invoking void without an active scope to repair such evidence.
- While a CHANGE is active, `tdd migrate` likewise does not mutate foreign or
  prior-generation cycles; complete or abandon the active CHANGE before
  migrating such evidence without an active scope.
- A successful active-scope migration can remain globally non-current when a
  later valid foreign or prior-generation void bounds repository-wide
  validation; complete or abandon the active CHANGE before repository-wide
  repair.
- Active validation can report staleness from a newer foreign or
  prior-generation terminal that active-scoped migration and void cannot
  mutate; repair requires either a genuine new active-scope Red/Green cycle or
  completing/abandoning the active CHANGE before repository-wide maintenance.
- A malformed persisted migration is not overwritten by `tdd migrate`; the
  retained already-migrated error applies after verified selection, and a
  genuine new Red/Green cycle is required to establish later current evidence.
- Malformed foreign or prior-generation evidence outside the active void scope
  no longer triggers the scoped missing-cycle-ID or missing-chain guard during
  that active CHANGE.
- The suite-level Vitest timeout is now 60 seconds rather than 20 seconds.
  Assertions and command coverage are unchanged, and the replacement candidate
  passed all three hosted operating systems, but a hung test can take up to 40
  seconds longer to fail.
- Completing CHANGE-0012 resumes repository-wide source-currency validation
  and exposes the following 11 pre-existing `TDD_TEST_STALE` debts:
  `TEST-M5-RELEASE-002-TRUST-001`, `TEST-M5-RELEASE-003`,
  `TEST-M5-RELEASE-003-GEN5-001`, `TEST-M5-RELEASE-004-001`,
  `TEST-M5-RELEASE-003-CONTEXT-BINDING-001`,
  `TEST-M5-RELEASE-003-DOCS-001`,
  `TEST-M5-PARALLEL-GRAPH-ACYCLIC-001`,
  `TEST-M5-PARALLEL-INTEGRATION-GATE-001`,
  `TEST-M5-PARALLEL-REAL-GATE-SUCCESS-001`,
  `TEST-M5-WORKFLOW-DECLARATION-CORRECTION-CLI-001`, and
  `TEST-M5-APPROVAL-GUIDANCE-001`. Completion simulation against both the
  pre-change selector and the CHANGE-0012 selector produced the same set, so
  this change introduces no new stale ID. Follow-up is tracked in #34.
- After CHANGE-0012 is marked completed, regenerating repository-wide quality
  evidence produces `tdd: fail` and an overall failing gate until #34 repairs
  those 11 fingerprints. This release authorization therefore relies on the
  complete pre-completion evidence set bound to candidate `e2dd762`; no
  post-completion quality claim is implied.
- Status retains three historical `WORKFLOW_WAIVER_STALE` error-severity
  diagnostics for old `sdd-design`, `sdd-quality`, and `sdd-requirements`
  declarations. The current workflow check passes and these stale waivers do
  not authorize this invocation, but the historical records remain visible.
