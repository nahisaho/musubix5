# Wave 0 release operations design

## DES-M5-WAVE0-001: Read-only completed CHANGE context resolver
Responsibilities: Resolve the sole active CHANGE for validation, or when no active document exists resolve the latest eligible completed CHANGE without changing mutable active-context semantics.
Interfaces: New `resolveValidationChangeContext(root, options?)` in `packages/analysis/src/change-generation.ts`; existing `resolveChangeContext()` and `activeChangeContext()` remain active-only mutation boundaries; completed eligibility reads `.musubix/changes/CHANGE-<digits>.md` and `.musubix/evidence/changes.json`.
Constraints: Active document selection retains precedence and existing `CHANGE_GENERATION_MIXED` behavior. With no active document, selection first chooses the completed document with the greatest numeric CHANGE identifier and then requires a positive current `activeGeneration` plus current `phases.quality`; a null generation, missing chronology, or missing quality fails closed and cannot fall through to an older completed CHANGE. Duplicate numeric identities and malformed explicit selectors fail closed. The returned context preserves `documentStatus: completed`; it never changes chronology, writes evidence, or exposes a completed context through `activeChangeContext()`. When no CHANGE documents exist, existing chronology-based selection remains unchanged and workflow validation falls back to all history only when no chronology entry has an active generation.
Requirements: REQ-M5-WAVE0-COMPLETION-001
ADRs: ADR-0010 ADR-0031

## DES-M5-WAVE0-002: Completed-context validation adapters
Responsibilities: Apply the read-only completed context consistently to workflow, gate, status, approval validation, and candidate-gate validation while preserving active-only mutation checks.
Interfaces: `validateLoadedWorkflow()` and owner filtering in `packages/analysis/src/workflow.ts`; `projectStatus()` and gate context selection in `packages/analysis/src/gate.ts`; explicit read-only context parameters used by `validateApprovalStage()`, `validateApprovals()`, `validateApprovalsForDomain()`, and `validateApprovalsForFeatureGate()` in `packages/analysis/src/approval.ts`, while `approvalManifest()` defaults to active-only resolution; `publicCandidateSnapshotProjection()` in `packages/cli/src/main.ts`; focused fixtures in `tests/active-change-context.test.ts`, `tests/workflow-generation-reconciliation.test.ts`, `tests/approval-effective-projection.test.ts`, `tests/approval-scope.test.ts`, and `tests/candidate-snapshot-lifecycle.test.ts`.
Constraints: Workflow events are filtered by exact completed CHANGE ID and generation and never fall back to all history when CHANGE documents exist. Repository-wide validation, domain validation, feature-gate validation, `gate`, `status`, and CLI approval validation pass the read-only context explicitly; preparation and recording call `approvalManifest()` without that option and remain active-only. Existing artifact hashes, candidate bindings, strict OIDC validation, and inert stale-waiver classification remain unchanged. Requirements/design/release preparation or recording, workflow recording, TDD mutation, CHANGE phase recording, candidate snapshot create/delete, candidate workspace registration, candidate-gate ingestion, and parallel transitions continue to require active-only context. `publicCandidateSnapshotProjection()` propagates completed-context lifecycle diagnostics into the enclosing status result instead of converting them silently to `not-current`. Approval recording on a completed CHANGE has an explicit negative regression. A completed CHANGE missing its terminal declaration receives scoped `CHANGE_COMPLETION_DECLARATION_MISSING`, which is not added to `WORKFLOW_WAIVABLE_CODES`, plus recovery guidance to restore active status, record once, and complete again. A newer ineligible completed CHANGE blocks validation even when an older eligible CHANGE exists. The end-to-end fixture proves that unrelated historical declarations do not affect the completed CHANGE and that existing approvals, candidate snapshot projection, and candidate evidence remain current.
Requirements: REQ-M5-WAVE0-COMPLETION-001
ADRs: ADR-0010 ADR-0013 ADR-0031
Depends-On: DES-M5-WAVE0-001

## DES-M5-WAVE0-003: Raw NUL porcelain parser boundary
Responsibilities: Preserve byte-significant Git status records for ownership checks while retaining trimmed output for existing textual Git callers.
Interfaces: Shared `parsePorcelainV1Z(output)` in `packages/analysis/src/git-status.ts`; module-private `gitRaw()` and trimmed `git()` helpers plus NUL-output callers in `packages/analysis/src/parallel-runtime.ts`; existing dirty-state parsing in `packages/analysis/src/workspace-manager.ts`; dedicated regressions in `tests/parallel-handoff-porcelain.test.ts`.
Constraints: `gitRaw()` returns successful stdout unchanged and shares existing timeout/error mapping. `git()` delegates to `gitRaw()` and trims only for callers that require textual output. Every `-z` caller in `parallel-runtime.ts`, including porcelain status, `ls-tree`, and `diff-tree --name-only`, uses raw output so leading or trailing path bytes are preserved. `parsePorcelainV1Z()` reads the two status bytes before slicing the path, consumes paired rename/copy paths, and ignores only the empty record caused by an optional final NUL; `isCleanOutsidePaths()` and workspace dirty-state capture reuse it instead of maintaining divergent parsers. `git-status.ts` is imported directly by those analysis modules and is not re-exported from `packages/analysis/src/index.ts`, so the parser remains internal. Tests cover first-record unstaged, staged, untracked, outside-owned, rename/copy, leading-dot, leading-space, trailing-space, and non-ASCII paths; the existing non-`-z` `isClean()` behavior remains unchanged.
Requirements: REQ-M5-WAVE0-HANDOFF-001
ADRs: ADR-0012

## DES-M5-WAVE0-004: Candidate dispatch guidance model
Responsibilities: Derive a deterministic immutable candidate branch and side-effect-free command descriptors from the existing candidate-gate context.
Interfaces: Existing `CandidateGateContext` remains unchanged; additive `CandidateGateCommand`, `CandidateGateDispatchGuidance`, and pure `candidateDispatchGuidance(context)` in `packages/analysis/src/candidate-gate.ts`; the CLI combines the existing context with guidance only for `candidate-gate context`; focused tests in `tests/candidate-gate.test.ts`.
Constraints: `candidateBranch` is the short branch name `candidate/<lowercase-change-id>-g<generation>-<first-12-candidate-commit-hex>` used by `gh workflow run --ref`, while `candidateFullRef` is `refs/heads/<candidateBranch>` and is used by Git inspection, lease, update-ref, and deletion commands. Every command descriptor contains `executable` and `args`; no shell source is evaluated. Inspection commands distinguish absent, exact, and conflicting local/remote refs. Creation uses `--force-with-lease=<candidateFullRef>:` only after absence inspection; cleanup uses candidate-commit compare-and-swap, and dispatch supplies `changeId`, `generation`, `candidateCommit`, `repositoryId`, and `gateInputFingerprint`. `CandidateGateJobResult` and envelope schemas remain structurally unchanged. `sameContext()` continues comparing only identity fields, and fingerprint calculation remains unchanged because guidance is produced after context identity calculation. No helper executes the descriptors.
Requirements: REQ-M5-WAVE0-CANDIDATE-REF-001
ADRs: ADR-0010 ADR-0032
Depends-On: DES-M5-WAVE0-002

## DES-M5-WAVE0-005: Candidate dispatch CLI and documentation projection
Responsibilities: Render candidate ref setup, dispatch, ingestion-order, and cleanup guidance for human and JSON consumers without modifying refs or GitHub state.
Interfaces: Hidden `candidate-gate context` command in `packages/cli/src/main.ts`; `README.md`; `README-ja.md`; `tests/candidate-gate.test.ts`; `tests/cli-help-contract.test.ts`.
Constraints: JSON emits `{ ...context, dispatch }` without changing envelope shapes. Human output renders safely quoted display commands while structured argv remains authoritative. Documentation states that raw SHAs cannot be workflow dispatch refs, the workflow file must already exist on both the repository default branch and candidate commit for manual dispatch, an advanced branch tip violates strict OIDC workflow-SHA binding, `--force-with-lease=<ref>:` requires a Git version supporting explicit empty expected values, the ref must remain unchanged until envelope ingestion completes, collisions must not be force-moved, and cleanup occurs only after ingestion. README changes are integration-owned and do not alter version, release-tag, or upgrade sections.
Requirements: REQ-M5-WAVE0-CANDIDATE-REF-001
ADRs: ADR-0010 ADR-0032
Depends-On: DES-M5-WAVE0-004

## Compatibility and diagnostic registry

| Surface | Addition | Compatibility behavior |
|---|---|---|
| validation context | `resolveValidationChangeContext()` | Additive read-only API; existing `resolveChangeContext()` and `activeChangeContext()` remain active-only |
| workflow/gate diagnostic | `CHANGE_COMPLETION_DECLARATION_MISSING` | Additive non-waivable diagnostic with restore-record-complete recovery guidance |
| candidate-gate context JSON | top-level `dispatch` guidance containing short `candidateBranch`, full `candidateFullRef`, and command descriptors | Additive CLI projection only; `CandidateGateContext`, `CandidateGateJobResult`, envelopes, fingerprints, and OIDC claims remain unchanged |
| Git status parsing | shared `parsePorcelainV1Z()` | Internal parser consolidation; existing public CLI output and non-`-z` Git helper behavior remain unchanged |

All new serialized guidance uses explicit schema-stable field names and argv
arrays. Consumers that ignore additive candidate-gate context fields remain
compatible. No persisted evidence schema, journal record, approval manifest,
or workflow waiver allowlist changes in this CHANGE.
