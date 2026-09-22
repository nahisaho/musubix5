---
schemaVersion: 1
id: CHANGE-0002
summary: Implement the clean musubix5 compatibility and architecture foundation
status: approval-pending
---
# CHANGE-0002: musubix5-clean-foundation

Requirements: REQ-M5-COMPAT-001 REQ-M5-COMPAT-002 REQ-M5-COMPAT-003 REQ-M5-COMPAT-004 REQ-M5-COMPAT-005 REQ-M5-COMPAT-006 REQ-M5-COMPAT-007 REQ-M5-COMPAT-008 REQ-M5-COMPAT-009 REQ-M5-COMPAT-010 REQ-M5-COMPAT-011 REQ-M5-COMPAT-012 REQ-M5-COMPAT-013 REQ-M5-LIFECYCLE-001 REQ-M5-LIFECYCLE-002 REQ-M5-LIFECYCLE-003 REQ-M5-LIFECYCLE-004 REQ-M5-LIFECYCLE-005 REQ-M5-APPROVAL-001 REQ-M5-APPROVAL-002 REQ-M5-APPROVAL-003 REQ-M5-APPROVAL-004 REQ-M5-APPROVAL-005 REQ-M5-APPROVAL-006 REQ-M5-APPROVAL-007 REQ-M5-APPROVAL-008 REQ-M5-APPROVAL-009 REQ-M5-BUDGET-001 REQ-M5-BUDGET-002 REQ-M5-BUDGET-003 REQ-M5-BUDGET-004 REQ-M5-BUDGET-005 REQ-M5-EVIDENCE-001 REQ-M5-EVIDENCE-002 REQ-M5-EVIDENCE-003 REQ-M5-EVIDENCE-004 REQ-M5-EVIDENCE-005 REQ-M5-EVIDENCE-006 REQ-M5-EVIDENCE-007 REQ-M5-WAIVER-001 REQ-M5-TDD-001 REQ-M5-TDD-002 REQ-M5-TDD-003 REQ-M5-TDD-004 REQ-M5-WORKTREE-001 REQ-M5-WORKTREE-002 REQ-M5-WORKTREE-003 REQ-M5-WORKTREE-004 REQ-M5-PLANNER-001 REQ-M5-PLANNER-002 REQ-M5-PLANNER-003 REQ-M5-PLANNER-004 REQ-M5-BOOTSTRAP-001 REQ-M5-BOOTSTRAP-002 REQ-M5-BOOTSTRAP-003 REQ-M5-BOOTSTRAP-004 REQ-M5-QUALITY-001 REQ-M5-QUALITY-002 REQ-M5-QUALITY-003 REQ-M5-QUALITY-004 REQ-M5-QUALITY-005 REQ-M5-RELEASE-001 REQ-M5-RELEASE-002

## Classification

Feature: new clean implementation with compatibility constraints.

## Intent

Define musubix5 from primary-source comparison of musubix3 v0.1.18 and
musubix4 v0.1.3. Treat musubix3 as the behavior oracle and musubix4 as design
input only.

## Boundaries

- Modify only `/home/nahisaho/GitHub/musubix5`.
- Keep musubix3 and musubix4 read-only.
- Do not reuse `CHANGE-0001` approvals or evidence.
- Do not import generated evidence from musubix3 or musubix4.
- Treat musubix3-produced requirements/design approvals as bootstrap
  authorization only and re-record equivalent native approvals before release.
- Do not start design or implementation before current exact-hash requirements
  approval.
- Do not publish, release, tag, or push without separate explicit human
  authorization.

## Impact

- New normative requirements for compatibility, lifecycle, approval repair,
  budgets, evidence, TDD, worktrees, Planner output, bootstrap, and quality.
- The approved design defines architecture, ADRs, schemas, lifecycle
  transitions, C4 diagrams, and candidate-bound release evidence.
- The human selected a single `musubix5` executable with no `musubix3` alias.
  This is an intentional compatibility break requiring an ADR, migration guide,
  and regression tests.

## Inputs

- `docs/initial-architecture-assessment.md`
- `docs/migration-guide.md`
- `docs/baseline/musubix3-v0.1.18-cli-help.json`
- normative compatibility inventory in
  `.musubix/features/musubix5-clean-foundation/requirements.md`
- musubix3 tag `v0.1.18`
- musubix4 tag `v0.1.3` and its dirty state as non-release design evidence

## Generation 2 implementation

- Preserves the pinned musubix3 CLI, JSON, exit-code, configuration, trace,
  graph, TDD, approval, gate, status, installation, and startup contracts.
- Adds repository-wide monotonic order, durable leases, resumable lifecycle
  transitions, separated evidence registries, native exact-hash approvals,
  budget reservations, repairable verified-auto boundaries, run-local
  specification isolation, deterministic current TDD-cycle selection, and
  isolated candidate/QA workspaces.
- Adds an explicit, bounded Bootstrap Runner that cannot write normal
  approval, TDD, trace, graph, workflow, quality, release, package, or waiver
  evidence and cannot authorize a release.
- Adds deterministic quality/readiness classification and a separate,
  candidate-bound, single-purpose authorization guard for publish, tag, and
  push operations.
- Removes inherited musubix3 trace declarations so all authoritative trace
  links and generated evidence belong to musubix5.
- Materializes the approved workflow, approval-automation, and candidate-gate
  policy defaults into deterministic approval and gate projections.
- Adds the closed five-job GitHub Actions candidate matrix, strict GitHub OIDC
  plus ephemeral Ed25519 artifact verification, journal-backed idempotent
  ingestion, CI run-reuse rejection, and per-job release projections.

## Generation 2 quality evidence

- All 63 normative requirements have generation-2 Red, Implementation, and
  Green evidence; `tdd validate` reports no uncovered or invalid cycles.
- The latest complete validation passed 55 test files and 69 tests,
  TypeScript typecheck/build, the pinned compatibility suite,
  package-content checks, isolated tarball installation/startup smoke checks,
  strict trace, and graph validation.
- Candidate-gate trust has an additional fresh Red-to-Green cycle and focused
  candidate-gate/CLI compatibility tests, typecheck, and build pass after the
  trust implementation.
- The read-only matrix gate executes all six configured commands successfully
  and preserves the tracked tree. After reconciling the privacy-sanitized
  transcripts from both implementation sessions, the matrix gate passes
  locally and workflow verification reconciles the recorded declarations with
  their Copilot Skill invocation events.
- The first external matrix run exposed Windows `.cmd` shim resolution for
  `npm` and `npx`; focused Red-to-Green pure-function tests now verify the
  Windows Node-CLI invocation mapping while native and non-Windows commands
  remain unchanged. Execution-level Windows confirmation is accepted only from
  external candidate-bound matrix evidence.
- Repository text checkouts are pinned to LF through `.gitattributes`, keeping
  persisted byte-level trace, graph, and approval fingerprints stable on the
  Windows matrix runner.
- The optional formal check reports `fail` because the prose requirements
  are `FORMAL_UNSUPPORTED` by the current Boolean abstraction; it grants no
  proof credit.
- `CHANGE_RECORDEDAT_OUT_OF_ORDER` remains a non-blocking historical warning:
  one waiver-related wall-clock `recordedAt` value does not follow journal
  sequence. Persisted monotonic order, not wall-clock time, is authoritative.
- Release readiness is evaluated outside the immutable candidate tree: each
  candidate requires a fresh complete set of five externally produced
  candidate-matrix attestations followed by explicit human release approval.
  These post-candidate records must not be fabricated or projected into the
  candidate itself.

## Release boundary

The target remains version `0.1.0` on branch `change/CHANGE-0002`. The prior
candidate and release manifest are superseded and cannot receive release
approval. A new immutable candidate is established when the current approved
requirements/design and complete local validation are committed. The exact
release manifest and release approval are established afterward, outside the
candidate tree, from all five candidate-bound CI attestations and explicit
human release approval. No package publication, Git tag, or release operation
is authorized by this record; remote pushes performed to produce candidate
evidence carry no release authorization. Each external operation additionally
requires separate explicit human authorization bound to the approved candidate.

The candidate workflow can run only after `.github/workflows/candidate-gate.yml`
is available on the repository default branch and the exact candidate commit is
available to GitHub Actions. Those pushes are prerequisites for external matrix
evidence and require their own explicit human authorization.
