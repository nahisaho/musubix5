# Changelog

All notable changes to musubix5 are documented in this file.

## 0.1.1

### Added

- A clean musubix5 implementation based on the pinned musubix3 v0.1.18
  compatibility oracle and selectively redesigned musubix4 concepts.
- A protected SDD lifecycle with repository-wide monotonic order, durable
  leases, resumable transitions, exact-hash approvals, and separated evidence
  classes.
- Repairable verified-auto requirements and design boundaries with durable
  pending invocations, bounded retries, deterministic repair identities, and
  reservation-first budget accounting.
- An explicit bounded Bootstrap Runner isolated from normal approval, TDD,
  trace, graph, workflow, quality, release, package, and waiver evidence.
- Deterministic current TDD-cycle selection, isolated candidate and QA
  workspaces, strict trace and graph checks, and release-readiness policy.
- Candidate-bound, single-purpose authorization guards for publish, tag, and
  push operations. Release approval alone grants no external side effect.

### Compatibility

- The supported CLI, JSON, exit-code, configuration, validation, trace, graph,
  TDD, approval, gate, status, package installation, and startup behavior is
  checked against the pinned musubix3 baseline.
- The executable is named `musubix5`; no `musubix3` alias is installed. This
  intentional incompatibility is documented in the migration guide and ADRs.

### Release process

- Version `0.1.1` uses separate candidate validation, GitHub Release creation,
  and exact-tarball npm publication workflows.
- Tag `v0.1.0` was created and pushed for validation but has no GitHub Release
  or npm publication.
- Because `v0.1.0` and its history are intentionally immutable, its historical
  release authorization remains present in that old evidence commit. Operators
  must not dispatch the historical `v0.1.0` release workflow; removing that
  capability would require deleting the tag or rewriting history.
