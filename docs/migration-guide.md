# Migrating from musubix3 to musubix5

## Intentional executable-name change

musubix5 publishes only the `musubix5` executable. It does not publish a
`musubix3` compatibility alias.

This policy was selected by the human for `CHANGE-0002` before requirements
approval. The corresponding ADR and regression tests are required during the
design and implementation phases.

Replace invocations such as:

```sh
npx --no-install musubix3 gate --changed --json
```

with:

```sh
npx --no-install musubix5 gate --changed --json
```

The command names, options, exit-code classes, and compatible JSON fields are
covered by musubix3 v0.1.18 contract tests. Other intentional incompatibilities
must be added to this guide together with an ADR and regression test before
implementation.

## Approval manifest extensions

musubix5 retains exact-manifest SHA-256 approval but extends manifest
composition:

- requirements approval additionally binds a canonical projection of
  `schemaVersion` and `approval` configuration;
- design approval additionally binds a canonical execution-policy projection;
- release approval additionally excludes `docs/history/**`, declared run-local
  paths, and evidence owned by another CHANGE.

These extensions intentionally change aggregate approval hashes from musubix3.
Bootstrap approvals recorded by musubix3 remain development authorizations
only and must be re-recorded natively before release readiness.

## Release operation authorization

Release approval does not authorize publication, tag creation, or pushing to a
remote. Each external operation requires a separate explicit human
authorization bound to the exact candidate.

## Evidence migration

Do not copy musubix3 or musubix4 generated evidence into musubix5. Recreate
requirements, design, approvals, TDD, trace, graph, workflow, quality, release,
benchmark, and waiver evidence using musubix5 in the destination repository.

For an in-place upgrade of an existing musubix3 repository:

1. Preserve normative requirements, designs, ADRs, configuration, source, and
   tests.
2. Expect prior generated evidence to be reported as
   `incompatible-evidence`; it must not satisfy a musubix5 gate.
3. Revalidate requirements and constitution, obtain current requirements and
   design approvals as needed, rerun Red/Green evidence for changed
   requirements, then regenerate trace, graph, workflow, quality, and release
   evidence in lifecycle order.
4. Keep the legacy `MUSUBIX3_Z3` and `MUSUBIX3_LEAN` solver environment
   variables valid. Any future `MUSUBIX5_*` equivalents are additive aliases.

The requirements and design approvals used to bootstrap musubix5 development
may be recorded by the pinned musubix3 tool. They authorize entry into the next
development phase but are not current musubix5 release evidence. Before release
readiness, the same current manifests must be reviewed and approved through the
native musubix5 approval implementation.
