# Release 0.2.0 Requirements

## Scope

These requirements define the one-time musubix5 `0.2.0` release outcome after
CHANGE-0003 was merged. Existing generic release authorization, candidate,
GitHub Release, and npm publication requirements remain mandatory dependencies.

## REQ-M5-REL020-001: Prepare the immutable 0.2.0 candidate
Priority: must
Type: functional
Pattern: event-driven
Statement: When the musubix5 `0.2.0` release candidate is prepared, the system shall bind every release-validated version surface and packaged release document to the same immutable candidate.
Acceptance: `package.json`, every `packages/*/package.json`, `plugin.json`, `.github/plugin/marketplace.json#metadata.version`, `.github/plugin/marketplace.json#plugins[0].version`, the English and Japanese README release preambles and Upgrade paragraphs, and the first CHANGELOG release heading identify exactly `0.2.0`; `CHANGELOG.md` retains the historical `0.1.1` entry; the package archive contains file entries `package/.github/skills/sdd-parallel-dispatch/SKILL.md`, `package/.github/skills/sdd-agent-assignment/SKILL.md`, and `package/.github/skills/sdd-integration-verification/SKILL.md`; authoritative test `TEST-M5-REL020-VERSION-001` fails before the version update and passes unchanged afterward; and the five-job candidate matrix passes for one persisted candidate commit.

## REQ-M5-REL020-002: Create the stable v0.2.0 GitHub Release
Priority: must
Type: functional
Pattern: event-driven
Statement: When a human separately authorizes the `v0.2.0` GitHub Release operation, the system shall create one stable GitHub Release from the approved immutable `0.2.0` candidate.
Acceptance: Separately authorized `tag` and `push` operation records bind the approved candidate, lightweight `v0.2.0` tag, evidence commit, and current release-approval SHA-256 before the tag is created or pushed; a separately authorized `release` operation record binds the same candidate, tag, evidence commit, and approval digest; regression test `TEST-M5-REL020-RELEASE-001` uses fixture candidate, tag, approval, authorization, and target-lookup inputs to verify those bindings and the unchanged fail-closed workflow contract; the resulting GitHub Release is neither draft nor prerelease; its assets include `musubix5-0.2.0.tgz`, `sbom.cdx.json`, `release-context.json`, `SHA256SUMS`, `attestation.json`, and `attestation-public.pem`; run artifact `release-outcome-<run-id>-<run-attempt>/release-outcome.json` records the successful stable release URL and operation identity; and any identity, ancestry, approval, authorization, target-lookup, or checksum mismatch produces no GitHub Release side effect.

## REQ-M5-REL020-003: Publish the exact v0.2.0 package to npm
Priority: must
Type: functional
Pattern: event-driven
Statement: When a human separately authorizes npm publication for `v0.2.0`, the system shall publish the exact verified tarball from the stable `v0.2.0` GitHub Release.
Acceptance: The publish authorization binds the `v0.2.0` tag, approved candidate, evidence commit, and current release-approval SHA-256; regression test `TEST-M5-REL020-PUBLISH-001` uses fixture authorization, stable-Release metadata, asset, checksum, and registry inputs to verify that binding, exact-tarball checksum comparison, and replay rejection without performing a publication side effect; the publication workflow verifies the stable GitHub Release and every sealed checksum before the side effect; the SHA-256 of the downloaded Release tarball equals the SHA-256 of the tarball submitted to npm; run artifact `publish-outcome-<run-id>-<run-attempt>/publish-outcome.json` records `musubix5`, version `0.2.0`, successful publication, registry visibility, and matched integrity; npm reports `musubix5@0.2.0` after completion; and an existing npm version or any tag, candidate, approval, authorization, Release, asset, or checksum mismatch produces no npm publication side effect.
