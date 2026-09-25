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

## Node.js 24 candidate matrix

GitHub Actions now installs Node.js 24 for candidate verification, release, and
npm publication. The candidate matrix emits one opaque envelope artifact for
each of Ubuntu, Windows, and macOS. The published package runtime contract
remains Node.js `>=20`, but Node.js 20 and 22 are no longer continuously
verified by the candidate matrix.

Persisted Ubuntu/20, Ubuntu/22, Windows/22, and macOS/22 candidate-gate records
remain readable for historical status and deletion invalidation. They do not
satisfy or block the current three-job matrix. Ingesting a new envelope for one
of those retired identities fails with `RELEASE_GATE_EVIDENCE_STALE` and
persists no record. Historical candidate snapshots can therefore report
`candidateGateStatus: missing` under the current matrix.

Any in-flight candidate created before this change must rerun candidate gates
to produce Ubuntu/24, Windows/24, and macOS/24 evidence before release approval.

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
worktree files. Create that immutable binding with:

```bash
# Record terminal full-set quality, validate approvals, then commit every
# candidate input and resulting evidence change so the worktree is clean.
CHANGE_ID=CHANGE-0123
npx --no-install musubix5 candidate-snapshot create "$CHANGE_ID" --json
# Commit the generated .musubix/journal/normal/<order>.json evidence without
# amending the candidate, then run candidate-bound gates and prepare release.
```

Creation requires the named CHANGE to be the sole active CHANGE, current
requirements/design approvals, terminal full-set quality, and a clean reachable
owned branch. Its JSON reports a stable `snapshot-<12-digit-order>` ID,
generation, repository/branch/commit, candidate-tree manifest digest, journal
path, replay state, and guidance. Committing the journal does not change the
candidate: QA is checked out at the persisted candidate commit.

Inspect lifecycle state with:

```bash
npx --no-install musubix5 candidate-snapshot list --json
npx --no-install musubix5 candidate-snapshot show "$CHANGE_ID" --json
npx --no-install musubix5 candidate-snapshot show snapshot-000000000123 --json
```

Only one repository-matching live snapshot is allowed. To replace it, retire it
explicitly and then create the new candidate:

```bash
npx --no-install musubix5 candidate-snapshot delete \
  snapshot-000000000123 --deleted-by "$USER" --confirm --json
npx --no-install musubix5 candidate-snapshot create "$CHANGE_ID" --json
```

Deletion appends a tombstone and never removes the creation record or Git
commit. A snapshot selected by a current release approval is protected. For an
active CHANGE, reopen its generation before retrying deletion. For a completed
CHANGE, first make it the sole `status: active` document, then run
`change-record <change-id> impact --reopen`.

Legacy snapshot records remain listable/showable/deletable but project null
generation, manifest digest, and creation time and require replacement before a
new release approval. A legacy record selected by a valid historical release
approval remains protected and cannot be deleted until that approval is made
non-current through the same reopen procedure. Foreign records are visible but
do not block a clone or fork from creating its repository-matching candidate.

Git object IDs widened consistently across candidate snapshot persistence,
approval candidate resolution, candidate-gate evidence, parallel/TDD start
commits, release-operation records, release and npm workflow inputs, shell
guards, ancestry checks, and attestation/context identities. Every changed
boundary accepts only lowercase hexadecimal IDs from 40 through 64 characters;
shorter, longer, uppercase, and non-hexadecimal values are rejected.

The release manifest applies this closed first-match exclusion registry:

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

Candidate lifecycle and manifest construction use these classified diagnostics:

| Diagnostic | Meaning |
|---|---|
| `APPROVAL_DOMAIN_MISMATCH` | Missing, unexpected, colliding, or unknown domain |
| `APPROVAL_NORMATIVE_MISSING` | Required normative path or referenced ADR is absent |
| `APPROVAL_NORMATIVE_SYMLINK` | Normative path, ancestor, or other selected non-regular path is unsafe |
| `APPROVAL_CANDIDATE_MISSING` | No non-deleted snapshot remains; run the reported `candidate-snapshot create` command |
| `APPROVAL_CANDIDATE_UNAVAILABLE` | Live evidence is invalid, foreign-only, legacy, non-current-generation, conflicting, unreachable, or otherwise unresolvable; inspect and follow list/delete/create guidance |
| `CANDIDATE_SNAPSHOT_MISSING` | `show` has no matching record, or a CHANGE-ID `delete` selector has no repository-matching creation record to delete or replay; an exact snapshot ID can resolve foreign-repository or unknown-CHANGE history |
| `CANDIDATE_SNAPSHOT_CONFLICT` | More than one live record prevents CHANGE-ID selection or creation |
| `CANDIDATE_SNAPSHOT_PROTECTED` | Current release approval protects the snapshot; reopen before deletion |
| `CANDIDATE_SNAPSHOT_ALREADY_DELETED` | The snapshot was already deleted by a different actor |
| `CANDIDATE_SNAPSHOT_APPROVAL_STALE` | Creation requires current requirements/design approval; run `musubix5 approval validate` |
| `CANDIDATE_SNAPSHOT_QUALITY_STALE` | Creation requires current full-set quality evidence |
| `JOURNAL_IDEMPOTENCY_CONFLICT` | The same candidate idempotency identity was reused with a different persisted branch or payload; inspect the existing snapshot and journal before retrying |
| `CLI_ERROR` for candidate journal evidence | `create`/`delete` found malformed snapshot/tombstone evidence or a snapshot-attributable chain/order defect; `list`/`show` found any shared-journal defect and intentionally do not attribute it by record kind |
| `CHANGE_CHECKPOINT_JOURNAL_INVALID` | Snapshot create/delete found a checkpoint-attributable shared-journal defect, or gate/status found any shared-chain defect; repair checkpoint/journal evidence before continuing |
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

## Parallel development extensions

musubix5 adds the top-level `parallel` command with plan, preparation,
assignment, status, integration, handoff, and cleanup groups. Parallel plans
are bound to one active CHANGE generation and use managed assignment,
detached-verification, and integration worktrees below the repository's Git
common directory. Assignment worktrees do not write `.musubix/**`; TDD runners
may execute in an assignment worktree while evidence is recorded at the
control repository root through the added `tdd red`, `tdd green`, and
`tdd refactor` workspace and parallel-provenance options.

Integration records consumed assignment ranges as provisional provenance,
runs the complete configured verification set in the integration worktree,
and promotes provenance to verified only after every required check passes.
Candidate handoff remains fast-forward-only. Existing Skills are preserved;
the three parallel-development Skills are additive.

`parallel status --change-id <id>` and targeted stale cleanup accept a known
active, abandoned, or completed CHANGE for maintenance visibility. They never
make a generation current and never grant evidence credit. Stale cleanup
retains branches, removes only clean managed worktrees belonging to stale
plans, preserves active plans, and appends only the non-credit maintenance
record associated with the selected historical generation.

## Workflow declaration correction extension

musubix5 adds `workflow declaration supersede` for the narrow case where a
completed workflow declaration was accidentally recorded again, the later
declaration currently reports declaration-scoped `WORKFLOW_INVOCATION_REUSED`,
and the lowest-positioned identical canonical declaration is bound to an unused
completed Skill invocation by current persisted workflow-verification
evidence. The command does not delete or rewrite the declaration and is not a
waiver. It appends a CHANGE-lease- and fencing-protected correction that
identifies the later duplicate and canonical declaration by absolute event
position and digest.

Only a declaration-scoped `WORKFLOW_INVOCATION_REUSED` may be corrected. The
canonical declaration must have been independently bound to an unused
completed invocation when the correction is recorded. During later
reconciliation, the corrected duplicate consumes no invocation and does not
advance the Skill cursor; it is reported as informational audited superseded
history. Corrections are stored in a separate append-only correction store, not
in `workflow.events`, so declaration positions, declaration digests, and the
verified workflow-events head do not change when a correction is appended. For
three or more identical declarations, each later duplicate needs its own
correction and all corrections use the lowest-positioned canonical declaration.
A corrected declaration cannot later receive a workflow waiver. Duplicate
identity is version- and provenance-scoped, so a cross-version or
cross-provenance repetition requires abandoning and reopening the generation.
Declarations without explicitly persisted CHANGE, generation, and requirement
ownership, sole missing declarations, failed or incomplete invocations,
cross-CHANGE or cross-generation declarations, transcript-level duplicate
events, and declarations already covered by a current waiver remain
non-correctable.

`WORKFLOW_BINDING_MISSING` remains the companion declaration diagnostic when a
completed declaration cannot bind an invocation. A valid correction suppresses
that code only for the corrected duplicate together with its
`WORKFLOW_INVOCATION_REUSED`; canonical and unrelated declarations retain their
normal diagnostics.

## CHANGE ownership and implicit generation selection

`workflow-record` adds `--change-id <id>` so a declaration can be bound to one
specific active CHANGE generation. The stored declaration includes that
CHANGE, generation, and requirement ownership. Unknown or conflicting explicit
owners fail with `WORKFLOW_CHANGE_MISMATCH`; known but completed, abandoned, or
otherwise ineligible owners fail with `CHANGE_GENERATION_PHASE`. Omitting the
option remains valid only when ownership is unambiguous.

Implicit generation-bound commands now select the sole CHANGE document whose
frontmatter has `status: active`. Completed CHANGE documents remain historical
and are excluded from implicit selection. A legacy CHANGE document with no
`status` remains active when its persisted chronology has a positive active
generation without terminal full-set quality, a null active generation after
abandonment, or no generation chronology yet; it is treated as completed after
terminal full-set quality with no later active or abandoned generation.
Selection never rewrites the document.
If more than one document is active, stateful commands and gate fail with
`CHANGE_GENERATION_MIXED` until repository authors set `status: completed` on
each finished document and leave exactly one active document; `status` remains
read-only, exits zero, reports the diagnostic, and keeps `ready: false`. An
active document may temporarily have a null generation after abandonment;
status reports the abandoned history and the reopen command while pass-producing
operations remain blocked.

## Generation abandon and reopen extension

`change generation abandon <change-id> --reason <text> --approver <name>
--confirm` preserves the incomplete generation as non-current history and
leaves no active generation. Missing confirmation or malformed usage is
`CLI_ERROR`; an ineligible lifecycle state is `CHANGE_GENERATION_PHASE`.
Approvals, TDD, pass-producing evidence, and phase recording remain blocked
until `change-record <change-id> impact --reopen` creates or resumes the next
generation.

Both abandon and reopen validate lifecycle eligibility before acquiring the
CHANGE lease, revalidate after acquisition, reconcile all journaled checkpoints
for the departing generation, and only then snapshot or abandon it. During the
no-active-generation interval, gate exits 1, status exits 0 with `ready: false`,
and explicitly targeted parallel status or branch-retaining stale cleanup
remains available only as non-credit maintenance.

## Same-generation approval checkpoint extension

When a requirements or design approval becomes stale inside an active
generation, recording the newly approved phase appends a superseding lifecycle
checkpoint and retains the earlier checkpoint as history. Supply
`--operation-id <id>` matching `^[a-z0-9][a-z0-9-]{0,63}$`; the option is
rejected for the initial checkpoint and required only for supersession. Replay
is scoped by CHANGE, generation, phase, and operation ID, and is checked under
the CHANGE lease after journal-only recovery but before current-state
validation. Exact replay therefore returns the persisted success even after
projection; divergent reuse or a distinct operation against a still-current
checkpoint returns `CHANGE_GENERATION_DUPLICATE`.

The public semantic phase key remains
`change:<changeId>:g<N>:<phase>`. The normal-journal idempotency key is
`change-phase-checkpoint:<changeId>:g<generation>:<phase>:<operationId>`, and
the record persists its approval head, requirement IDs, fingerprints, ordinal,
semantic/evidence-order keys, timestamp, and fencing token. Recovery uses only
those persisted inputs. Invalid checkpoint journal evidence reports
`CHANGE_CHECKPOINT_JOURNAL_INVALID`; gate fails while status remains readable
with `ready: false`. The evidence-order ledger uses
`requirements:<n>` or `design:<n>` after ordinal 1, and `changes.json` exposes
`requirementsHistory`, `designHistory`, `requirementsOrdinal`, and
`designOrdinal`, with operation IDs on superseding checkpoints.
Ordinal-1 checkpoints omit the `operationId` key entirely; they do not persist
`null`, an empty string, or a generated placeholder. Cross-phase
checks use the greatest predecessor checkpoint whose order is less than the
dependent record, so later approval checkpoints do not retroactively reorder
existing TDD batches. Gate and status always include
`unprojectedPhaseCheckpoints`, including an empty array; pending entries are
informational unless their journal evidence is invalid. Reopen snapshots these
history fields with the completed generation, clears them from the new active
generation, and restarts ordinals at 1.

## Release operation authorization

Release approval does not authorize publication, tag creation, or pushing to a
remote. Each external operation requires a separate explicit human
authorization bound to the exact candidate.

musubix5 adds `release-operation authorize`, `release-operation validate`, and
`release-operation status`. New authorization records use schema version 2,
support the closed scopes `publish`, `release`, `tag`, and `push`, and bind the
full 40-to-64-character lowercase hexadecimal candidate object ID, release-
approval SHA-256, release tag, and authorizer into their authorization digest.
Uppercase and non-hexadecimal object IDs are rejected.
Schema-version-1 records remain
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
