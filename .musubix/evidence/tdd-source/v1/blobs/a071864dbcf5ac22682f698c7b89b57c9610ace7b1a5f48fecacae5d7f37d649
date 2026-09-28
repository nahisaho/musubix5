---
schemaVersion: 1
id: CHANGE-0011
summary: Include repository Skill sources in non-trace evidence inputs
status: completed
---
# CHANGE-0011: skill-evidence-inputs

Requirements: REQ-M5-EVIDENCE-009

## Classification

Defect correction. Strict trace already treats repository-owned Skill files as
implementation sources, but TDD, changed-mode quality, and workspace
attestation fingerprints omit the same files.

## Confirmed intent

- Reuse the exact current and pinned legacy source-repository identities already
  accepted by `REQ-M5-EVIDENCE-008`.
- Include `.github/skills/*/SKILL.md` in non-trace evidence inputs only for
  recognized musubix source repositories.
- Preserve fail-closed exclusion for consumer, missing-manifest, unreadable, and
  malformed-manifest repositories.
- Cover TDD source fingerprints, changed-mode evidence snapshots, and workspace
  attestation through their shared evidence-input selector.

## Impact

- `packages/analysis/src/files.ts`
- `packages/analysis/src/trace.ts`
- `packages/analysis/src/tdd.ts`
- `packages/analysis/src/gate.ts`
- `packages/analysis/src/attestation.ts`
- `README.md`
- `.musubix/features/skill-evidence-inputs/requirements.md`
- `.musubix/features/skill-evidence-inputs/design.md`
- `.musubix/features/*/trace.json`
- `.musubix/features/trace-skill-source-selection/design.md`
- `.musubix/decisions/ADR-0021.md`
- focused evidence-input and integration tests
- trace, TDD, quality, workflow, approval, and release evidence

## Acceptance

- Recognized musubix5 and pinned musubix3 source repositories include
  `.github/skills/*/SKILL.md` in shared non-trace evidence inputs.
- Consumer and malformed repository fixtures continue to exclude Skill files
  without throwing.
- Skill-only edits change the TDD source fingerprint, in-run quality
  input-stability snapshot, persisted-quality staleness recomputation, and
  workspace attestation digest.
- Persisted-quality input currency uses the directly tested
  `qualityInputsCurrent` helper; missing, malformed, or mismatched fingerprints
  fail closed without throwing while other stale conditions remain unchanged.
- `CODE-M5-EVIDENCE-SKILL-CURRENCY-001` traces the gate helper independently
  from the shared selector node.
- Persisted quality evidence is regenerated under the expanded input scope;
  this repository has no persisted attestation artifact, while the workspace
  attestation digest behavior is verified by the focused test.
- The root-aware selector owns `files(root)` enumeration, evaluates repository
  identity once, preserves deterministic file order, and leaves TDD-specific
  test/excluded-path filtering downstream.
- The quality snapshot contains recognized Skill path/digest entries and reports
  a Skill edit between its pre-run and post-run captures as `modified`.
- Shared predicate extraction leaves strict-trace Skill selection unchanged for
  all existing source-identity fixtures.
- Workspace-attestation documentation describes the root-aware selector and the
  recognized-source Skill inclusion.
- Generated trace files, package archives, logs, and session logs retain their
  existing evidence-input exclusions.
- Focused tests, typecheck, build, the full test suite, strict trace, CodeGraph,
  and the configured quality gate pass.

## Residual risks

- Adding authoritative Skill files to shared fingerprints intentionally makes
  more evidence stale after a Skill-only implementation change.
- In a recognized source repository, a Skill edit is an eligible non-test
  source change and can satisfy the Red-to-Green source-change guard. Keeping
  unrelated Skill edits out of an open cycle is process discipline, not an
  enforced restart.
- The current architecture guard uses a fixed consumer list and the focused
  test does not exercise `projectStatus` end to end; #18 tracks broader
  consumer discovery and persisted-quality stale integration coverage.
- Repository recognition remains intentionally byte-exact; repository URL
  aliases and shorthand remain consumer identities.
