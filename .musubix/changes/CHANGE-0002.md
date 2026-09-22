---
schemaVersion: 1
id: CHANGE-0002
summary: Implement the clean musubix5 compatibility and architecture foundation
status: in-progress
---
# CHANGE-0002: musubix5-clean-foundation

Requirements: REQ-M5-RELEASE-003 REQ-M5-RELEASE-004

## Classification

Feature: new clean implementation with compatibility constraints.

Generation 4 defect correction: restore the documented executable release
workflow before creating the first musubix5 tag or package release. Generation
3 was abandoned after requirements review showed that the runtime operation
guard and repository workflow were separate obligations requiring distinct IDs.

Generation 5 behavior change and defect correction: align npm publication with
the musubix3 release transport by moving it to a separate manually dispatched,
token-authenticated workflow that publishes the exact verified GitHub Release
tarball. Correct detached evidence-checkout authorization so fetched reachable
candidate commits do not require a same-named local branch.

The generation-5 changed obligations are `REQ-M5-RELEASE-003` and
`REQ-M5-RELEASE-004`. The prior operation guard is preserved so
automated side effects must consume an exact candidate-bound authorization.
The repository release automation:

- validates the release tag, candidate commit, and all package/plugin versions;
- validates an exact post-candidate evidence commit containing current release
  approval and authorized operation-specific records;
- reruns the documented release validation against the tagged commit;
- produces the npm tarball, CycloneDX SBOM, checksums, and strict GitHub OIDC
  plus ephemeral Ed25519 attestation;
- creates an independently reportable GitHub Release with the release artifacts;
  and
- publishes npm only through a separate protected `npm-publish` workflow that
  verifies and publishes the exact GitHub Release tarball using `NPM_TOKEN`.

Generation 6 was abandoned before implementation because a documentation-only
generation cannot produce the required code implementation fingerprint.

Generation 7 was abandoned before implementation because requirements review
corrections were applied after its requirements checkpoint.

Generation 8 was abandoned before implementation because requirements and
design review corrections were applied after its requirements checkpoint.

Generation 9 is a release-validation behavior change: replace transient
pre-release wording in the README headlines and upgrade sections with neutral,
version-only `0.1.1` wording. Convert the changelog's `Unreleased` heading and
generation-5 candidate status into a durable, undated `0.1.1` version entry
that preserves the `v0.1.0` non-dispatch warning and immutability rationale.
These documents intentionally make no point-in-time availability claim:
operators and users must check npm and GitHub Releases for current publication
state, allowing the same immutable candidate text to remain accurate before
and after authorized publication. The normative statements, acceptance
criteria and approved design of `REQ-M5-RELEASE-003` and
`REQ-M5-RELEASE-004` are extended so release validation covers those packaged
documentation version surfaces. Generation 9 adds one authoritative
repository-document validation test for `REQ-M5-RELEASE-003` and one tarball
document validation test for `REQ-M5-RELEASE-004`, each with its own Red/Green
cycle. The expected version is derived from the release tag after its existing
equality check with `package.json`.

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
- Generation 5 updates every version-bearing package, plugin, and marketplace
  field to `0.1.1`, adds Red/Green coverage for detached-checkout authorization
  and exact GitHub Release asset publication, and updates both release guides.
- Generation 9 changes `README.md`, `README-ja.md`, `CHANGELOG.md`, this CHANGE
  record, release validation code/workflows, requirements/design, and two
  authoritative documentation regression tests. Its recorded phase sequence is
  `impact`, `requirements`, `design`, then a generation-9
  Red/Implementation/Green batch for `REQ-M5-RELEASE-003` followed by a second
  batch for `REQ-M5-RELEASE-004`. The first covers the repository documentation
  happy path, transient qualifiers, an unreleased heading, and an unterminated
  CHANGELOG fence. The second covers exact-tarball document presence, the happy
  path, and missing-document rejection. The implementation additionally
  fail-closes on bounded extraction, malformed checksums and numeric fields,
  duplicate, non-regular, linked, truncated, and aliased selected entries.
- Because the three published-documentation files are part of the package and
  candidate tree, generation 9 establishes a new immutable candidate. All
  package and smoke commands, the five-job external matrix, release manifest,
  and release approval must be regenerated for that candidate.
- Generated approvals, TDD, trace, change-history, order, quality, workflow,
  candidate-gate, and journal evidence are expected candidate/evidence changes
  in addition to the four authored documentation files and focused test.
- Implementation explicitly adds `CHANGELOG.md` to the package-content check
  and rewrites the four governed README headline/upgrade strings plus the
  changelog release-status block to their generation-independent `0.1.1` form.
- Existing `TEST-M5-RELEASE-004-001` fixture packaging is updated to include
  `README.md`, `README-ja.md`, and `CHANGELOG.md`, because the legacy
  `extractPackagedVersion` API intentionally inherits complete-package
  validation in generation 9.

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

## Generation 4 implementation (historical)

- Corrects the executable release workflow for the changed scope
  `REQ-M5-RELEASE-001` and `REQ-M5-RELEASE-003`; generation 4 contained 64
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

## Generation 4 quality evidence (historical)

- The complete suite passes 59 test files and 75 tests; all 71/71 annotated
  test IDs pass.
- `tdd validate` reports 259 cycles and 0 diagnostics.
- Strict trace validation and the graph gate pass.
- All local required checks pass. Before a new immutable candidate is
  established, the expected remaining blockers are missing or stale external
  candidate-bound matrix evidence and release approval.

Generation 5 supersedes generation 4's in-release-workflow npm publication,
publish operation-ID handling, and registry-visibility retries. Those
obligations move to `.github/workflows/npm-publish.yml` under
`REQ-M5-RELEASE-004`; generation 5 contains 65 total must requirements.

## Generation 5 implementation (historical)

- Updates every package, CLI, plugin, marketplace, and lockfile version surface
  to `0.1.1` while preserving the immutable generation-4 `v0.1.0` tag.
- Refactors `.github/workflows/release.yml` to produce the reproducible sealed
  bundle and create only an independently authorized GitHub Release. Release
  creation intentionally has no protected environment; exact repository
  authorization, candidate/evidence ancestry, default-branch reachability,
  attestation verification, and replay rejection are the required gates.
- Adds `.github/workflows/npm-publish.yml` as a separate protected-environment
  dispatch requiring `release_tag`, `evidence_commit`, `publish_operation_id`,
  `NPM_TOKEN`, and `npm whoami`.
- Publishes the exact downloaded GitHub Release tarball without rebuilding or
  repacking after checksum, canonical `release-context-v1`, strict OIDC/Ed25519
  attestation, approval-digest, packaged-version, and registry replay checks.
- Corrects detached evidence validation to accept the exact persisted candidate
  when it is reachable through any fetched repository ref, without requiring a
  same-named local or remote-tracking candidate branch.
- Bounds registry verification with six queries, per-query forced termination,
  an outer hard deadline, and terminal evidence that distinguishes visibility,
  integrity mismatch, and possible partial publication requiring manual
  reconciliation.

## Generation 5 quality evidence (historical)

- The complete suite passes 62 test files and 90 tests; all 86/86 current
  annotated test identities pass in structured Vitest reports.
- `tdd validate` reports 283 cycles with zero diagnostics; current
  generation-5 Red/Green evidence, strict trace validation, and graph
  validation pass.
- TypeScript typecheck/build, the compatibility suite, package-content checks,
  and isolated tarball installation/startup smoke checks pass for `0.1.1`.
- Workflow declarations are reconciled with the privacy-sanitized Copilot
  transcript in configured compatible mode.
- The optional formal check is classified `fail` because 0/65 prose
  requirements are supported by the current Boolean abstraction; all formal
  diagnostics are warnings, the solver is intentionally `none`, and this
  grants no proof credit.
- Before the generation-5 candidate is fixed, the sole required gate blocker is
  the stale generation-4 release approval and candidate-matrix evidence.
  Generation 5 requires a fresh five-job external matrix and release approval
  bound to the new immutable candidate.
- Generation 5 candidate `fa62cba9f9b79ca9611938d5b4bdbace3b19fe23`
  passed its five-job matrix, but generation 9 supersedes that candidate to
  validate the packaged release documentation as part of the release contract.

## Generation 9 implementation

- Extends the 65-must-requirement release contract so repository and packaged
  `README.md`, `README-ja.md`, and `CHANGELOG.md` version surfaces are checked
  against the release tag before release or registry side effects.
- Adds one strict UTF-8/newline/NFC documentation validator shared by source
  release validation and exact-tarball publication validation.
- Adds attestation-before-decode ordering and a single tar extraction pass with
  a 64 MiB decompression cap, 8 MiB selected-entry cap, strict octal and header
  checksum validation, and fail-closed selected-entry structure checks.
- Moves the npm replay query after checksum, attestation, authorization,
  exact-tarball extraction, documentation validation, and local SRI
  calculation.
- Makes package smoke validation parse the repository's real npm tarball with
  the same release extractor before isolated installation.
- Replaces transient pre-release wording with stable `0.1.1` README and
  changelog version surfaces while preserving the immutable `v0.1.0`
  non-dispatch warning.

## Generation 9 quality evidence

- The complete suite passes 62 test files and 92 tests; all 88/88 current
  annotated test identities pass in structured Vitest reports.
- `tdd validate` reports 285 cycles with zero diagnostics; generation-9
  Red/Green evidence covers both changed release requirements.
- TypeScript typecheck/build, full tests, compatibility tests, package-content
  checks, and isolated tarball installation/startup smoke checks all pass.
- Strict trace validation, graph validation, change history/completeness, and
  reconciled compatible-mode workflow evidence pass.
- The optional formal check remains advisory `fail`: 0/65 prose requirements
  are modeled by the current Boolean abstraction and no proof credit is
  claimed.
- Before the generation-9 candidate is committed, the sole required gate
  blocker is stale release approval and external matrix evidence bound to the
  superseded generation-5 candidate.

> **Post-candidate evidence warning:** tracked records from completed prior
> generations are retained as immutable history but are inert because their
> generation, candidate, tag, approval digest, and gate context do not match
> generation 9. This includes the five generation-5 attestations for candidate
> `fa62cba9f9b79ca9611938d5b4bdbace3b19fe23`. New generation-9 release
> approval and gate records are created only after the replacement candidate is
> fixed and therefore are not part of that candidate commit.

## Release boundary

The existing lightweight `v0.1.0` tag and candidate commit
`87f37a7e397036de5f47452868aaffed0a019461` are preserved and are not moved.
Generation 9 targets version `0.1.1` on branch `change/CHANGE-0002`; every
version-bearing file must agree before its new immutable candidate can be
tagged `v0.1.1`. The generation-9 candidate supersedes generation-5 candidate
`fa62cba9f9b79ca9611938d5b4bdbace3b19fe23`; `v0.1.1` must point at the
generation-9 candidate. Its tag, release manifest, GitHub Release, and npm
package publication are distinct from all prior candidates and require fresh
evidence and explicit authorization.

Preserving the immutable `v0.1.0` tag also preserves its historical workflow
and authorization records in old reachable commits. Those records grant no
authorization for any later generation, including generation 9, and no GitHub
Release or npm package currently
exists for `v0.1.0`; however, an operator could still deliberately dispatch the
historical workflow against its old evidence commit. This residual operational
risk is accepted to avoid deleting the tag or rewriting published Git history.
Operators must not dispatch the historical `v0.1.0` release workflow.

A new immutable candidate is established when the current approved
requirements/design and complete local validation are committed. The exact
release manifest and release approval are established afterward, outside the
candidate tree, from all five candidate-bound CI attestations and explicit
human release approval. Generation-4 and generation-5 release approval,
operation authorization, gate evidence, release manifests, and workflow bundles
grant no authorization for a generation-9 operation. No package publication,
Git tag, or release
operation is authorized by this record; remote pushes performed to produce
candidate evidence carry no release authorization. Each external operation
additionally requires separate explicit human authorization bound to the
approved generation-9 candidate.

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

The protected `npm-publish` environment exists with two protection rules.
`NPM_TOKEN` is not currently configured there, so npm publication remains
blocked until a repository administrator adds the environment secret without
exposing it in repository content or conversation logs.
