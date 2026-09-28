# Release 0.2.0 Design

## Scope

This design specializes the existing candidate-bound release architecture for
the one-time musubix5 `0.2.0` release. It does not change release automation,
authorization, attestation, or publication behavior. The generic components in
the clean-foundation design remain authoritative for those contracts.

## DES-M5-REL020-001: Immutable 0.2.0 candidate assembler
Responsibilities: Change every release-validated version surface and packaged release document from `0.1.1` to `0.2.0`, retain the historical `0.1.1` changelog entry, verify the three parallel-development Skills are packaged, and produce one immutable candidate for the five-job candidate matrix.
Interfaces: `package.json`; `package-lock.json`; `packages/*/package.json`; `packages/cli/src/main.ts`; `plugin.json`; `.github/plugin/marketplace.json`; `README.md`; `README-ja.md`; `CHANGELOG.md`; `tests/release-workflow.test.ts`; `tests/release-generation5.test.ts`; package archive entries under `package/.github/skills/`; authoritative test `TEST-M5-REL020-VERSION-001`; package-content verification in `scripts/check-package.mjs`; authoritative code nodes `CODE-M5-COMPAT-001` in `createProgram` and `CODE-M5-RELEASE-WORKFLOW-001` in `validateReleaseVersions`; configured typecheck, build, full-test, compatibility-test, package-check, package-smoke, candidate creation, and candidate-matrix commands.
Constraints: Every version-bearing manifest value, every root/workspace package-lock version value, and the CLI-reported program version identifies exactly `0.2.0`; both `README.md` and `README-ja.md` have `0.2.0` release preambles and Upgrade paragraphs; the first changelog release heading identifies `0.2.0` and `CHANGELOG.md` retains the `0.1.1` entry; the version test is written and recorded Red before any version surface changes, asserts the CLI version and all five `package-lock.json` version occurrences in addition to the requirement-listed surfaces, and passes unchanged afterward; every existing test assertion that calls `validateReleaseVersions` against the actual repository root changes only from `v0.1.1`/`0.1.1` to `v0.2.0`/`0.2.0`, preserving its assertion structure, verification target, and trace annotations, while temp-directory, literal-document, and other self-contained historical `0.1.1` fixtures remain unchanged; package contents include `sdd-parallel-dispatch`, `sdd-agent-assignment`, and `sdd-integration-verification`, with archive verification delegated to the existing `npm pack --dry-run --json` package-check projection, whose unprefixed file-list entries correspond to the final tar archive's `package/`-prefixed paths; implementation traceability is supplied by adding only `@implements REQ-M5-REL020-001` and `@design DES-M5-REL020-001` to the two named code nodes, without changing release validation behavior; no release workflow, authorization, attestation, or publication behavior changes; candidate creation occurs only after all local verification commands pass; the persisted candidate commit is immutable and all five candidate-matrix jobs bind that same commit and candidate-derived fingerprint.
Requirements: REQ-M5-REL020-001
ADRs: ADR-0010 ADR-0011
Depends-On: DES-M5-002 DES-M5-012 DES-M5-015 DES-M5-019 DES-M5-020

## DES-M5-REL020-002: Stable v0.2.0 GitHub Release execution
Responsibilities: Exercise the existing fail-closed release architecture for the approved `0.2.0` candidate, persist current candidate-bound release approval, preserve candidate identity while integrating its evidence history into the default branch, obtain separate tag, push, and release operation authorizations, verify the release workflow contract with fixture-based regression coverage, and create one stable `v0.2.0` GitHub Release with the sealed assets and terminal outcome evidence.
Interfaces: authoritative regression test `TEST-M5-REL020-RELEASE-001`; authoritative code nodes `CODE-M5-RELEASE-WORKFLOW-YAML-001`, `CODE-M5-RELEASE-WORKFLOW-001`, and `CODE-M5-RELEASE-TARGET-LOOKUP-001`; candidate-bound release approval commands; `release-operation authorize|validate|status`; lightweight tag `v0.2.0`; `.github/workflows/release.yml` tag-push and manual-dispatch modes; full-SHA `evidence_commit`; release assets `musubix5-0.2.0.tgz`, `sbom.cdx.json`, `release-context.json`, `SHA256SUMS`, `attestation.json`, and `attestation-public.pem`; run artifact `release-outcome-<run-id>-<run-attempt>/release-outcome.json`.
Constraints: The regression test uses only fixture candidate, tag, approval, authorization, and target-lookup inputs and performs no external side effect; implementation traceability is supplied by adding `REQ-M5-REL020-002` and `DES-M5-REL020-002` annotations to the named existing release code nodes without changing behavior; after the candidate matrix passes, release approval is regenerated against that exact candidate and evidence state; integration into the default branch uses a merge that preserves the candidate commit as an ancestor, never squash or rebase; each schema-version-2 operation authorization record binds scope, candidate commit, `v0.2.0`, authorizer, and current release-approval SHA-256, and the authorized record occurrence is bound to the selected evidence commit because the exact Git commit cryptographically contains that record at its governed path, the dispatch selects that full-SHA commit, and candidate/evidence/default-branch ancestry is validated; separate `tag` and `push` records exist before the lightweight tag is created or pushed, and a separate `release` record exists before manual dispatch; the evidence commit containing current approval and authorization is a descendant of the candidate and reachable from the default branch; the tag points directly to the immutable candidate; the stable Release is created only after candidate ancestry, approval, authorization, repository identity, authoritative target absence, sealed checksums, and attestation all validate; the Release is neither draft nor prerelease; any mismatch or non-authoritative lookup fails before Release creation; the terminal outcome records the successful stable Release URL and release operation identity in a run-scoped artifact and is not written back into the candidate.
Requirements: REQ-M5-REL020-002
ADRs: ADR-0010 ADR-0011
Depends-On: DES-M5-REL020-001 DES-M5-006 DES-M5-012 DES-M5-016 DES-M5-020

## DES-M5-REL020-003: Exact v0.2.0 npm publication
Responsibilities: Exercise the existing immutable-package publisher for the stable `v0.2.0` GitHub Release, obtain a separate publish authorization, verify the publication workflow contract with fixture-based regression coverage, and publish the exact verified Release tarball to npm.
Interfaces: authoritative regression test `TEST-M5-REL020-PUBLISH-001`; authoritative code nodes `CODE-M5-NPM-PUBLISH-WORKFLOW-YAML-001`, `CODE-M5-NPM-PUBLISH-POLICY-001`, and `CODE-M5-RELEASE-ASSET-VALIDATION-001`; `release-operation authorize|validate|status`; `.github/workflows/npm-publish.yml`; full-SHA `evidence_commit`; the stable `v0.2.0` Release and its sealed assets; `npm view musubix5@0.2.0 version|dist.integrity --json`; `npm publish <verified-tarball> --provenance --access public --ignore-scripts`; run artifact `publish-outcome-<run-id>-<run-attempt>/publish-outcome.json`.
Constraints: The regression test uses only fixture authorization, stable-Release metadata, asset, checksum, and registry inputs and performs no publication side effect; implementation traceability is supplied by adding `REQ-M5-REL020-003` and `DES-M5-REL020-003` annotations to the named existing publisher code nodes without changing behavior; the schema-version-2 `publish` authorization record binds scope, approved candidate, `v0.2.0`, authorizer, and current release-approval SHA-256, and the authorized record occurrence is bound to the selected evidence commit because the exact Git commit cryptographically contains that record at its governed path, the dispatch selects that full-SHA commit, and candidate/release-evidence/default-branch ancestry is validated; the publish evidence commit contains the current publish authorization, descends from the attested release evidence commit, and is reachable from the default branch; the workflow accepts only the existing stable non-draft, non-prerelease Release; repository identity, release context, strict attestation, checksums, packaged documents, embedded version, and replay query validate before npm token use; the tarball submitted to npm is byte-for-byte the downloaded and verified `musubix5-0.2.0.tgz`, without rebuilding or repacking; an existing version or any identity, authorization, Release, asset, checksum, or registry classification mismatch fails before publication; the outcome records package `musubix5`, version `0.2.0`, registry visibility, and matched integrity, and npm must report `musubix5@0.2.0` before the operation is considered successful.
Requirements: REQ-M5-REL020-003
ADRs: ADR-0010 ADR-0011
Depends-On: DES-M5-REL020-001 DES-M5-REL020-002 DES-M5-006 DES-M5-012 DES-M5-016 DES-M5-021

## Verification and handoff

Implementation proceeds as three ordered evidence batches:

1. `REQ-M5-REL020-001` / `TEST-M5-REL020-VERSION-001`: record Red against
   `0.1.1`, update all version and release-document surfaces, then record Green
   and complete local verification before candidate creation. Run and ingest
   all five candidate-matrix jobs against that immutable commit.
2. `REQ-M5-REL020-002` / `TEST-M5-REL020-RELEASE-001`: prove the existing
   release workflow remains fail-closed with fixtures; regenerate candidate-bound
   release approval; merge the candidate/evidence history into the default
   branch without changing candidate identity; persist an evidence commit
   containing the current approval and separate tag/push authorizations; create
   and push the lightweight tag; then persist a current release authorization
   and dispatch the stable Release operation from its exact evidence commit.
3. `REQ-M5-REL020-003` / `TEST-M5-REL020-PUBLISH-001`: prove the existing
   publisher remains fail-closed with fixtures; persist a descendant,
   default-branch-reachable evidence commit containing the separate publish
   authorization; then publish the exact stable-Release tarball from that
   evidence commit.

External operations remain outside Green implementation evidence and require
their own current operation authorization immediately before each side effect.
