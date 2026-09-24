---
schemaVersion: 1
id: CHANGE-0006
summary: Correct the approval recovery command
status: completed
---
# CHANGE-0006: approval-command-guidance

Requirements: REQ-M5-APPROVAL-010

Issue: https://github.com/nahisaho/musubix5/issues/4

## Classification

Defect correction with a specification gap. The non-approved approval
precondition error exposes the retired `musubix3` executable name instead of
the published `musubix5` command.

## Confirmed intent

- Render `musubix5 approval validate` in approval-precondition recovery
  guidance for every non-approved status.
- Preserve approval validation, status classification, exit behavior, and all
  other compatibility contracts.
- Add a focused regression test for the exact user-facing command through the
  reported `design validate --json` path.

## Requirements scope

`REQ-M5-APPROVAL-010` closes the requirement gap for approval-precondition
recovery guidance. The correction applies the executable-token normalization
sanctioned by `REQ-M5-COMPAT-001` and `REQ-M5-COMPAT-003` while preserving the
error envelope, code, exit semantics, and status classification, so it is not
an intentional incompatibility and requires no `REQ-M5-COMPAT-007` ADR or
migration entry.

## Impact

- Correct the command literal emitted by `requireApproval`.
- Link `REQ-M5-APPROVAL-010` to `DES-M5-002` for CLI envelope/exit ownership
  and extend `DES-M5-006` with the shared recovery-command constraint.
- Add a dedicated code trace declaration for the shared approval precondition
  linking `REQ-M5-APPROVAL-010` and `DES-M5-006`.
- Add `TEST-M5-APPROVAL-GUIDANCE-001` to reproduce a stale requirements
  approval through `design validate --json` and assert the exact recovery
  command.
- Mark completed CHANGE-0005 inactive before opening CHANGE-0006.
- Preserve the abandoned CHANGE-0006 generation 1 audit record: requirements
  review found that `REQ-M5-COMPAT-001` did not normatively cover the runtime
  message, so generation 2 restarted at impact with `REQ-M5-APPROVAL-010`.
- Refresh requirements/design approvals, ordered change and TDD evidence,
  formal/model-correspondence/performance projections, trace caches, and
  quality evidence owned by the active generation.
- Rebuild trace, graph, TDD, quality, workflow, and release evidence for this
  CHANGE.

## Unchanged behavior

- Approval manifests, approval evidence, domain resolution, and stale-status
  detection remain unchanged.
- No `musubix3` executable alias is added.
- Legacy compatibility identities, `MUSUBIX3_Z3`/`MUSUBIX3_LEAN`, and unrelated
  user-facing strings are outside this issue-bounded correction.

## Acceptance

- `TEST-M5-APPROVAL-GUIDANCE-001` invokes the built CLI entry point with
  `design validate <design.md> --root <workspace> --json` and a stale
  requirements approval in a fixture containing `.musubix/config.json` with
  `approval.mode: required`, then asserts exit code 2 and the `CLI_ERROR`
  `error.message`; it also directly exercises a missing approval status through
  the shared precondition. The absence-of-`musubix3` assertion applies only to
  the newly captured CLI envelope, not immutable historical evidence. The test
  builds the current source before spawning the CLI so Red and Green evidence
  cannot use stale `dist` output, and fails against the current implementation.
- The same unchanged test passes after the message uses
  the exact literal `musubix5 approval validate` and contains no `musubix3`
  substring.
- Focused tests, typecheck, build, full tests, trace, and graph pass; all
  required quality checks pass except the pending release approval.

## Quality and release evidence

- `TEST-M5-APPROVAL-GUIDANCE-001` has a fresh valid Red/Green cycle for
  `REQ-M5-APPROVAL-010`. Its name-filtered TDD report contains one passing
  target and one skipped sibling test; a separate unfiltered focused run passes
  both CLI contract tests.
- Typecheck and build pass, and the full Vitest suite passes with 209/209 tests.
- Strict trace checking passes after rebuilding the requirement, design, code,
  and test links included by the current trace configuration. CodeGraph gate is
  valid; its only diagnostic is the existing non-blocking unsupported-language
  warning for workflow YAML files.
- Strict trace inputs currently exclude this repository's `.github/skills/**`
  sources because repository detection still keys on the legacy `musubix3`
  package name; this pre-existing scope defect is tracked separately by #12.
- Formal checking records `fail` with 0/88 requirements modeled, classifies
  `REQ-M5-APPROVAL-010` as unsupported prose, and does not invoke a solver.
  Formal evidence remains optional and non-blocking under the configured custom
  quality profile.
- The workflow check is currently non-required and skipped because no
  declaration exists for active generation 2. The single final
  `sdd-change complete` declaration is intentionally deferred until the
  release boundary; after recording it, workflow reconciliation becomes
  required and final gate evidence must be regenerated.
- `gate --changed` passes every currently evaluated required check except
  release approval. No immutable CHANGE-0006 candidate exists yet, so release
  approval cannot be prepared until the reviewed work is committed and its
  candidate snapshot and gate evidence are created.
- Related stale `musubix3` literals outside approval-precondition guidance are
  intentionally excluded from this change and tracked separately by #11.
- The focused test intentionally builds within each independently selectable
  test case so a TDD name-filtered invocation cannot consume stale `dist`
  output. Local runs remain within the configured timeout; the candidate matrix
  must confirm sufficient margin on all supported environments.
