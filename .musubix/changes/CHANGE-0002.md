---
schemaVersion: 1
id: CHANGE-0002
summary: Implement the clean musubix5 compatibility and architecture foundation
status: approval-pending
---
# CHANGE-0002: musubix5-clean-foundation

Requirements: REQ-M5-RELEASE-001 REQ-M5-RELEASE-003

## Classification

Feature: new clean implementation with compatibility constraints.

Generation 4 defect correction: restore the documented executable release
workflow before creating the first musubix5 tag or package release. Generation
3 was abandoned after requirements review showed that the runtime operation
guard and repository workflow were separate obligations requiring distinct IDs.

The changed obligations are `REQ-M5-RELEASE-001` and
`REQ-M5-RELEASE-003`. The prior operation guard is preserved and extended so
automated side effects must consume an exact candidate-bound authorization.
The separate repository release automation:

- validates the release tag, candidate commit, and all package/plugin versions;
- validates an exact post-candidate evidence commit containing current release
  approval and authorized operation-specific records;
- reruns the documented release validation against the tagged commit;
- produces the npm tarball, CycloneDX SBOM, checksums, and strict GitHub OIDC
  plus ephemeral Ed25519 attestation;
- publishes npm only through the protected `npm-publish` environment; and
- creates an independently reportable GitHub Release with the release artifacts.

Other requirements remain unchanged. The affected non-normative surfaces are
the release workflow, package/plugin version consistency checks, release
workflow regression tests, and English/Japanese release documentation.

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

## Generation 2 implementation (historical)

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

## Generation 2 quality evidence (historical)

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

## Generation 4 implementation

- Corrects the executable release workflow for the changed scope
  `REQ-M5-RELEASE-001` and `REQ-M5-RELEASE-003`; the repository contains 64
  total must requirements.
- Passes release and publish operation IDs into shell steps only through
  environment variables, quotes every use, and validates each non-empty value
  against the operation guard's strict
  `^[A-Za-z0-9][A-Za-z0-9._-]*$` identifier rule before use.
- Keeps bundle artifacts isolated by GitHub run ID while allowing
  **Re-run failed jobs** to overwrite and consume the same sealed bundle name.
- Retries npm registry visibility five times with bounded backoff (30 seconds
  total), distinguishes registry visibility/API failure from a confirmed SRI
  mismatch, and consistently queries the tag-stripped package version.
- Adds authoritative workflow trace annotations and YAML-structural regression
  tests for side-effect job guards, exact permissions, operation-ID handling,
  artifact retry semantics, and registry integrity retries.
- Preserves the protected `npm-publish` environment as a publication
  invariant. Because that GitHub environment does not currently exist,
  repository administrators must create, configure, and verify it before any
  manual release dispatch; this change does not create it.

## Generation 4 quality evidence

- The complete suite passes 59 test files and 75 tests; all 71/71 annotated
  test IDs pass.
- `tdd validate` reports 259 cycles and 0 diagnostics.
- Strict trace validation and the graph gate pass.
- All local required checks pass. Before a new immutable candidate is
  established, the expected remaining blockers are missing or stale external
  candidate-bound matrix evidence and release approval.

> **Post-candidate evidence warning:** `.musubix/evidence/approvals/release.json`
> and `.musubix/evidence/release/gates/*.json` are created only after the
> candidate is fixed. They must not be staged into the candidate commit.

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

The release workflow can run only when `.github/workflows/release.yml` exists
on the tagged candidate and repository default branch. The candidate must first
be integrated into the default branch so the later evidence commit can be its
descendant and remain reachable from that branch. Pushing that candidate, the
separate post-candidate evidence commit, and the release tag are distinct
external operations requiring explicit human authorization.
