---
schemaVersion: 1
id: CHANGE-0007
summary: Expose candidate snapshot creation through the public CLI
status: active
---
# CHANGE-0007: candidate-snapshot-cli

Requirements: REQ-M5-COMPAT-013 REQ-M5-LIFECYCLE-005 REQ-M5-RELEASE-002 REQ-M5-WORKTREE-005 REQ-M5-WORKTREE-006 REQ-M5-WORKTREE-007

Issue: https://github.com/nahisaho/musubix5/issues/10

## Classification

Feature and defect correction. Release approval requires a persisted immutable
candidate snapshot, but the shipped CLI exposes no complete public lifecycle
for creating, inspecting, diagnosing, or retiring snapshots.

## Confirmed intent

- Add public command group `candidate-snapshot create|list|show|delete` with
  common `--root` and `--json` options.
- Use `candidate-snapshot create <change-id>` as the sole creation syntax.
- Use stable IDs `snapshot-<12-digit-journal-order>`.
- Define `artifactManifestDigest` as SHA-256 over the canonical candidate commit
  Git-tree entry manifest.
- Require current requirements/design approvals and terminal full-set quality
  before creation, and reject a second non-deleted snapshot until explicit
  deletion.
- Implement deletion as an append-only tombstone requiring `--deleted-by` and
  `--confirm`; refuse deletion while a current release approval protects the
  snapshot.
- Extend the existing `persistCandidateSnapshot(root, changeId, evaluators)`
  implementation and its clean-worktree, branch-ownership, reachability,
  journal, idempotency, and under-lease evaluation rules.
- Require the named CHANGE to be the sole active generation before calling the
  workspace manager.
- Return the persisted candidate identity in JSON and a concise human-readable
  success message that identifies the generated journal path and instructs the
  user to commit that evidence without amending the candidate commit.
- Recommend the exact command from `status.next` before
  `approval prepare release` when release approval is blocked by a missing
  candidate snapshot.
- Emit distinct `APPROVAL_CANDIDATE_MISSING` recovery guidance from
  `approval prepare release` when no non-deleted snapshot remains; retain
  `APPROVAL_CANDIDATE_UNAVAILABLE` for invalid, foreign-only, legacy,
  non-current-generation, ambiguous, or unreachable persisted snapshots.
- Register the new command as an intentional additive compatibility extension
  in requirements, design, ADR, migration guidance, and CLI help tests.

## Requirements scope

- `REQ-M5-LIFECYCLE-005` is updated to register snapshot show/delete as
  explicit non-credit maintenance operations for known active, abandoned, or
  completed CHANGEs and to define the completed-CHANGE reopen prerequisite.
- `REQ-M5-WORKTREE-005` defines the new public command, its persistence
  preconditions, immutable identity, candidate-tree manifest, and exact
  creation output.
- `REQ-M5-WORKTREE-006` defines deterministic list/show provenance,
  eligibility, and recovery diagnostics.
- `REQ-M5-WORKTREE-007` defines protected append-only snapshot retirement and
  deletion audit evidence.
- `REQ-M5-COMPAT-013` is updated because the top-level command and help entry
  are intentional additions to the pinned musubix3 contract.
- `REQ-M5-RELEASE-002` is updated to bind release gate verification to the
  sole non-deleted snapshot persisted under REQ-M5-WORKTREE-005 without
  requiring public-command provenance.

## Impact

- Add the command handler to `packages/cli/src/main.ts`.
- Validate syntax in the command handler, resolve sole-active CHANGE context
  without passing the requested ID, and compare the result byte-exactly before
  calling `persistCandidateSnapshot(root, changeId, evaluators)`.
- Move journal idempotency lookup before the clean-worktree check after
  resolving commit, branch, reachability, repository identity, and the
  candidate-tree manifest; derive the stable snapshot ID, `journalPath`, and
  replay metadata without duplicating workspace validation.
- Add an explicit missing-snapshot discriminator in the workspace resolver and
  update release-preparation and `status.next` guidance.
- Add candidate snapshot listing, selector resolution, eligibility projection,
  legacy-record projection, conflict detection, and deletion tombstones to the
  workspace manager.
- Widen release-operation schema-v2 candidate object IDs from exactly 40 to the
  full 40-to-64-character Git object-ID range accepted by snapshot persistence.
- Extend the release-diagnostic classifier used by approval status and parallel
  integration readiness; register the changed missing-snapshot output for shared
  candidate-gate context and release-operation validation callers.
- Replace the draft single-command/greatest-order model in
  `REQ-M5-WORKTREE-005`, the REQ-M5-COMPAT-013 registry,
  `REQ-M5-RELEASE-002` and the `release-candidate-tree-v1` inventory,
  `DES-M5-002`, `DES-M5-006`, `DES-M5-012`, `DES-M5-015`, `DES-M5-016`,
  `DES-M5-PARALLEL-007` in
  `.musubix/features/parallel-agent-development/design.md`, ADR-0010, and the
  migration guide with the command-group, sole-live-snapshot, legacy-projection,
  and tombstone model; remove `supersedesOrder`/`supersededByOrder`.
- Update `packages/analysis/src/release-operation-guard.ts` and its contract
  tests so SHA-1 and SHA-256 candidate object IDs share the same authorization
  and validation path.
- Widen Git object-ID validators in `packages/analysis/src/approval.ts`,
  `candidate-gate.ts`, `release-operation-guard.ts`, `release-workflow.ts`, and
  `tdd.ts`, plus `.github/workflows/release.yml` and `npm-publish.yml`, from
  exactly 40 to full 40-to-64 lowercase hexadecimal characters; this includes
  candidate, evidence, tag-resolved, and parallel start commits.
- Update README/README-ja release walkthroughs and command references plus the
  bundled `sdd-quality` Skill so installed workflows commit all candidate
  inputs before snapshot creation, then commit the generated snapshot journal
  evidence without amending the candidate before release approval.
- Make the closed candidate matrix test harness deterministic across operating
  systems by building `dist` once before Vitest workers start and by recording
  the executable fixture mode explicitly in the Git index.
- Add Red/Green tests for create/list/show/delete help and JSON, approval and
  quality preconditions, candidate-tree manifest identity, idempotent recreate,
  post-delete same-commit recreation, second-candidate rejection, legacy
  projection, selector ambiguity, eligibility precedence,
  stale/unreachable/foreign provenance, protected and replayed deletion,
  different-actor delete replay rejection, tombstone audit, release
  invalidation, missing-snapshot diagnostics, parallel readiness,
  domain/non-domain `status.next` ordering, multiple-live list/delete-without-
  create ordering, foreign-only versus tombstoned-only release diagnostics,
  checkpoint-versus-snapshot journal defect precedence, historical
  multi-record exit-zero stale projection, protected replacement
  reopen/delete/create ordering, and release-operation schema-v2 acceptance of
  40-to-64-character lowercase object IDs with rejection outside that range.

## Unchanged behavior

- Candidate contents remain the exact clean reachable HEAD commit; the commands
  do not create commits, branches, tags, pushes, or releases.
- Snapshot deletion is logical and append-only; creation records and Git commits
  are never physically deleted or rewritten.
- Release manifest construction, non-missing candidate validation, and
  non-missing approval hash semantics remain unchanged; the new shared missing
  diagnostic intentionally changes candidate-gate/release-preparation output
  and the diagnostic-derived `currentArtifactSha256` for that case.
- Intentional musubix3 compatibility identities and environment variables are
  unaffected.

## Acceptance

- `candidate-snapshot create` returns the stable snapshot identity, active
  generation, candidate/tree-manifest identity, creation time, storage path,
  replay state, and executable next guidance.
- Recreating the same candidate and manifest while creation preconditions
  remain current is idempotent; a second different non-deleted candidate is
  rejected until the existing snapshot is deleted.
- `list` deterministically exposes all live and deleted snapshots and exactly
  identifies per-CHANGE release eligibility without failing on historical
  conflicts; `show` resolves an exact snapshot ID or the sole live snapshot for
  a CHANGE.
- `delete` requires a selector, `--deleted-by`, and `--confirm`, writes a
  tombstone, preserves history, and refuses a snapshot protected by a current
  release approval.
- Syntax validation occurs before active-context resolution. An inactive,
  absent, mismatched, or non-sole active CHANGE fails before persistence with
  the applicable generation/workflow diagnostic and exit 1. A dirty worktree
  for a non-replay, malformed CHANGE ID, cross-CHANGE candidate branch, or
  unreachable HEAD exits 2 `CLI_ERROR`; workspace causes retain their
  `APPROVAL_CANDIDATE_UNAVAILABLE:` message prefix.
- Root help lists `candidate-snapshot`; group help lists
  `create|list|show|delete`; subcommand help lists each exact selector and
  option, including delete `--deleted-by` and `--confirm`.
- `approval prepare release --json` without a snapshot reports
  `APPROVAL_CANDIDATE_MISSING` in its message and the exact
  `musubix5 candidate-snapshot create <active-change-id>` recovery command.
- Foreign-only live records report `APPROVAL_CANDIDATE_UNAVAILABLE`, while
  tombstoned-only history reports `APPROVAL_CANDIDATE_MISSING`; legacy and
  non-current-generation live records require delete-then-create recovery.
- With current requirements/design approvals and no snapshot, non-domain
  and release required or present, `status.next` inserts candidate snapshot
  create immediately before release prepare and release record; it does not
  recommend create until requirements/design approvals and full-set quality are
  current.
- Multiple live snapshots produce list/delete guidance without create; a
  protected replacement emits reopen guidance before delete/create.
- Candidate snapshot create/delete classify the earliest shared-journal defect
  by its later or out-of-sequence record: checkpoint records retain
  `CHANGE_CHECKPOINT_JOURNAL_INVALID`, while snapshot records use the exact
  candidate-journal `CLI_ERROR`.
- Historical multiple-record conflicts remain listable/showable with exit zero,
  stale release-approval projection, and conflict recovery guidance.
- The new missing diagnostic intentionally changes its diagnostic-derived
  approval placeholder hash and is classified consistently by approval status
  and parallel integration readiness; candidate-gate and release-operation
  validation display the registered changed cause.
- Release-operation schema-v2 authorize, parse, and validate paths accept full
  lowercase hexadecimal candidate object IDs of 40 through 64 characters and
  continue rejecting shorter, longer, uppercase, or non-hexadecimal values.
- README.md, README-ja.md, and bundled `sdd-quality` instructions require the
  verified commit-inputs, snapshot, commit-journal-without-amend, candidate
  gate, inspection, and release-approval ordering and document explicit
  deletion/recovery before replacing a candidate.
- The closed candidate matrix preserves the CLI JSON error envelope without
  concurrent `tsc` writes and produces the same canonical executable-file
  manifest on Windows, macOS, and Linux.
