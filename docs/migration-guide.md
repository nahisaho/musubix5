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

Native musubix5 approvals use `approval-manifest-schema-v1`. Requirements and
design approvals read selected raw files from the invoking `--root` worktree
using `approval-normative-path-set-v1`, including domain-scoped feature paths,
non-transitive ADR references parsed from design `ADRs:` fields, and
required-path failure behavior. They also bind effective, default-resolved
configuration projections. If `approval.domains` is nonempty, `--domain` is
mandatory for requirements and design; release is always repository-wide and
rejects `--domain`. Making an implicit default explicit does not change the
hash, but changing a declared default does and requires renewed approval.

Release approval reads the persisted candidate commit rather than mutable
worktree files. It applies this closed first-match exclusion registry:

| Precedence | Reason | Predicate |
|---:|---|---|
| 1 | `symlink` | Non-normative symbolic-link blob; symlinks at the four normative release path patterns fail with `APPROVAL_NORMATIVE_SYMLINK` instead |
| 2 | `generated-trace` | `.musubix/features/*/trace.json` |
| 3 | `package-archive` | `**/*.tgz` |
| 4 | `log-directory` | Blob below a lowercase `log`, `logs`, `session-log`, or `session-logs` directory segment |
| 5 | `historical` | `docs/history/**` |
| 6 | `run-local` | `.musubix/runs/**` |
| 7 | `release-self-reference` | `.musubix/evidence/approvals/release.json` or `.musubix/evidence/approvals/native/release.json` |
| 8 | `gate-self-reference` | `.musubix/evidence/formal.json`, `.musubix/evidence/model-correspondence.json`, `.musubix/evidence/mutation.json`, `.musubix/evidence/performance.json`, `.musubix/evidence/quality.json`, or `.musubix/evidence/native/test/**` |
| 9 | `foreign-change-evidence` | A lowercase-suffix `.json` blob at or below `.musubix/evidence/` whose effective nonempty CHANGE ID differs byte-exactly from the active CHANGE |

For rule 9, a nonempty top-level `changeId` wins over
`metadata.changeId`. When no active CHANGE is bound, the rule never matches.
Invalid JSON, non-object roots, and missing or empty IDs remain included.

Included blobs are displayed with raw SHA-256. Excluded blobs are displayed
with reason and raw SHA-256, but excluded raw hashes are informational and do
not enter the aggregate; their normalized path/reason pairs do.

Manifest construction fails with classified diagnostics:

| Diagnostic | Meaning |
|---|---|
| `APPROVAL_DOMAIN_MISMATCH` | Missing, unexpected, colliding, or unknown domain |
| `APPROVAL_NORMATIVE_MISSING` | Required normative path or referenced ADR is absent |
| `APPROVAL_NORMATIVE_SYMLINK` | Normative path, ancestor, or other selected non-regular path is unsafe |
| `APPROVAL_CANDIDATE_UNAVAILABLE` | Persisted release candidate commit is absent or unresolvable |
| `APPROVAL_PATH_ENCODING` | A selected path is not valid UTF-8 |
| `APPROVAL_PATH_COLLISION` | Distinct paths normalize to the same NFC identity |
| `APPROVAL_GITLINK_UNSUPPORTED` | Candidate tree contains a Gitlink/submodule |

These schema, projection, candidate-tree, exclusion, display, and diagnostic
extensions intentionally change approval output and aggregate hashes from
musubix3. Bootstrap approvals recorded by pinned musubix3 remain development
authorizations only and must be re-recorded natively before release readiness.

## Configuration and gate extensions

- `approvalAutomation` is a versioned musubix5 configuration extension. It is
  manual by default. An absent key materializes the approved default object.
  Its modes and limits are bound by a separate normative design digest, so
  enabling verified-auto requires a new design approval with the revised
  extension digest.
- When required command verification has no configured commands, musubix5
  preserves the musubix3 `skipped` check status, gate exit code 1, and status
  exit code 0 with `ready: false`, and adds a structured `missing-command`
  diagnostic.

## Bootstrap command extension

musubix5 adds explicit `bootstrap run`, `bootstrap resume`, and
`bootstrap status` commands. They have no musubix3 equivalent, are never
invoked by normal commands, and cannot produce normal approval, quality, or
release authority.

## Release operation authorization

Release approval does not authorize publication, tag creation, or pushing to a
remote. Each external operation requires a separate explicit human
authorization bound to the exact candidate.

musubix5 adds `release-operation authorize`, `release-operation validate`, and
`release-operation status`. New authorization records use schema version 2,
support the closed scopes `publish`, `release`, `tag`, and `push`, and bind the
exact 40-character candidate commit, release-approval SHA-256, release tag, and
authorizer into their authorization digest. Schema-version-1 records remain
readable for historical status but cannot authorize workflow side effects.
Release automation uses the candidate-built `validate` command against a
separate post-candidate evidence checkout; it never trusts the approval digest
reported by the authorization record without independently validating the
current release approval.

Release runs may be retried with the same still-authorized operation record
when they fail before the corresponding side effect. Npm publication is a
separate dispatch of `.github/workflows/npm-publish.yml` with `release_tag`,
`evidence_commit`, and `publish_operation_id`; it publishes the exact stable
GitHub Release tarball and never reconstructs the package. If publication
reports `RELEASE_PUBLISH_INTEGRITY_MISMATCH` or
`manualReconciliationRequired: true`, do not rerun `npm publish` after the
version exists. Use the read-only
`npm view musubix5@<version> dist.integrity --json` command and compare it with
the SHA-512 SRI of the exact Release tarball. A missing or mismatched result
requires investigation and a corrected candidate with a new patch version;
never overwrite or republish an existing npm version.

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
