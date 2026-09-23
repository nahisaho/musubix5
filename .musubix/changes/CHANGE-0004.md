---
schemaVersion: 1
id: CHANGE-0004
summary: Release musubix5 0.2.0
status: active
---
# CHANGE-0004: release-0.2.0

Requirements: REQ-M5-REL020-001 REQ-M5-REL020-002 REQ-M5-REL020-003

## Classification

Defect correction and release operation. The merged parallel-development
functionality cannot remain identified as the already-published immutable
`0.1.1` package, so the repository must advance to a new release version before
any external publication.

## Confirmed intent

- Release the merged CHANGE-0003 functionality as musubix5 `0.2.0`.
- Update every version-bearing package, plugin, marketplace, README, and
  changelog surface required by `REQ-M5-RELEASE-003`.
- Preserve the existing candidate-bound release and npm publication workflows;
  no release automation behavior is changed by this CHANGE.
- Create a new immutable `v0.2.0` candidate and regenerate candidate-gate,
  approval, quality, trace, workflow, and release-operation evidence.
- Create the stable GitHub Release only after separate `release` operation
  authorization.
- Publish the exact verified GitHub Release tarball to npm only after separate
  `publish` operation authorization.

## Requirements scope

`REQ-M5-REL020-001`, `REQ-M5-REL020-002`, and `REQ-M5-REL020-003`
define the version-specific candidate, GitHub Release, and npm publication
outcomes for `0.2.0`. Existing generic release requirements
`REQ-M5-RELEASE-001` through `REQ-M5-RELEASE-004` remain unchanged
dependencies.

## Impact

- Change version values from `0.1.1` to `0.2.0` in every release-validated
  package, plugin, and marketplace manifest.
- Update the English and Japanese README release preambles and Upgrade
  paragraphs to `0.2.0`.
- Add `0.2.0` as the first changelog release entry and retain the historical
  `0.1.1` entry.
- Add design entities for all three requirements and link each to authoritative
  code and tests. Existing release workflow logic may receive trace annotations
  without changing its behavior.
- Add authoritative version test `TEST-M5-REL020-VERSION-001` before changing
  version surfaces, then record its fresh Red/Implementation/Green cycle.
- Add regression tests `TEST-M5-REL020-RELEASE-001` and
  `TEST-M5-REL020-PUBLISH-001` for the existing fail-closed workflow contracts;
  these tests use fixtures and do not perform external side effects.
- Rebuild package artifacts and all required release evidence for the new
  immutable candidate.
- Create separate repository-unique authorization records for tag/push,
  GitHub Release creation, and npm publication as required by
  `REQ-M5-RELEASE-001`.

## Unchanged behavior

- The three parallel-development Skills and their runtime behavior remain
  unchanged.
- Release and publication workflows remain fail-closed and continue to require
  candidate, tag, evidence commit, repository identity, approval digest, and
  operation-ID agreement.
- Existing tags, GitHub Releases, npm versions, approvals, and append-only
  evidence are not rewritten or deleted.

## Acceptance

- Every release-validated version surface equals `0.2.0`.
- `TEST-M5-REL020-VERSION-001` fails before the version update and passes
  unchanged afterward.
- The two named workflow regression tests pass against fixture inputs, and the
  actual GitHub Actions runs emit successful `release-outcome.json` and
  `publish-outcome.json` artifacts.
- Typecheck, build, full tests, compatibility tests, package checks, and package
  smoke tests pass.
- The five-job external candidate matrix passes for the persisted candidate.
- Requirements, design, release approval, release-operation authorization, tag,
  GitHub Release, and npm publication evidence bind the same `v0.2.0` candidate.
- npm reports `musubix5@0.2.0` after successful publication.

## Boundaries

- Do not change normative requirements, design, ADRs, or release workflow
  behavior without returning to requirements/design review and human approval.
- Do not create, move, or overwrite `v0.2.0` before the candidate and operation
  authorization are current.
- Do not create the GitHub Release or publish npm from release approval alone.
- Do not delete the retained `change/CHANGE-0003` branch or historical evidence.
