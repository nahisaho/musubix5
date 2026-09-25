---
schemaVersion: 1
id: CHANGE-0009
summary: Include repository-owned Skill sources in strict trace inputs
status: active
---
# CHANGE-0009: trace-skill-source-selection

Requirements: REQ-M5-EVIDENCE-008 REQ-SESSION-SCOPED-DEVELOPMENT-001 REQ-SESSION-SCOPED-DEVELOPMENT-002

Issue: https://github.com/nahisaho/musubix5/issues/12

## Classification

Defect correction with a specification gap. Repository-owned Skill source
declarations are excluded from strict trace inputs because repository detection
still compares the package name with the legacy `musubix3` identity.

## Confirmed intent

- Include `.github/skills/*/SKILL.md` in trace inputs for the musubix5 source
  repository.
- Continue excluding bundled Skill implementation files from ordinary consumer
  project trace inputs.
- Preserve intentional musubix3 compatibility fixtures without treating their
  package identity as the current repository identity.
- Define the two session-scoped development requirements already referenced by
  repository-owned Skill declarations so including those declarations remains
  strict-trace valid.
- Ignore annotation-shaped examples inside Markdown fenced or indented code
  blocks and inline code spans so instructional examples do not become
  authoritative trace declarations.
- Add focused regression coverage for repository and consumer selection.

## Assumptions

- Repository identity for this selector can be determined from exact root
  package name and object-form official repository URL pairs because the
  behavior distinguishes source trees from initialized consumers, including
  consumers that reuse a package name.
- The pinned official musubix3 source identity remains recognized to preserve
  the approved compatibility baseline; name-only matching is removed because
  it incorrectly classifies consumer projects.
- The defect requires a new normative requirement because no approved
  requirement currently specifies repository-owned Skill input selection.
- No CLI output or JSON schema changes are required.
- The intentional selector correction is not an unregistered compatibility
  break: the exact pinned musubix3 source name/repository pair remains
  recognized, while name-only projects were never an approved source identity.

## Impact

- Add `REQ-M5-EVIDENCE-008` with measurable repository and consumer fixture
  acceptance.
- Add `REQ-SESSION-SCOPED-DEVELOPMENT-001` and
  `REQ-SESSION-SCOPED-DEVELOPMENT-002` to define the existing Skill workflow
  declarations exposed by the corrected input selector.
- Add `DES-M5-TRACE-SKILL-001` for trace input selection and Markdown
  declaration boundaries, plus
  `DES-SESSION-SCOPED-DEVELOPMENT-001` and
  `DES-SESSION-SCOPED-DEVELOPMENT-002` for the existing Skill declarations.
- Update `packages/analysis/src/trace.ts` to recognize the musubix5 repository
  and to exclude fenced or indented Markdown code blocks and inline code spans
  from trace annotation parsing.
- Add focused tests that prove Skill source inclusion for a musubix5 fixture,
  exclusion for consumer fixtures, and strict resolution of repository-owned
  Skill declarations without interpreting fenced, indented, or inline code
  examples.
- Repository trace fingerprints, nodes, and edges will expand to include the
  repository-owned Skill declarations; dependent generated evidence will
  become stale until rebuilt.
- Rebuild trace, graph, TDD, workflow, quality, and release evidence.

## Unchanged behavior

- Normative artifacts and supported programming-language sources remain trace
  inputs in every project.
- Ordinary consumer projects do not trace the bundled musubix5 Skill
  implementation declarations.
- Diagnostic rules, persistence format, and strict-check semantics remain
  unchanged.

## Acceptance

- The authoritative regression test fails with the legacy `musubix3`
  repository-name predicate.
- The unchanged test passes after musubix5 repository fixtures include
  `.github/skills/*/SKILL.md`, consumer fixtures exclude the same paths, fenced
  or indented Markdown code blocks and inline code spans produce no
  declarations, and the real repository trace contains the session-scoped
  Skill code nodes with no dangling endpoints.
- Focused tests, typecheck, build, full tests, strict trace, and graph gate pass.

## Quality and release evidence

- `TEST-M5-EVIDENCE-SKILL-INPUT-001` has a current Red/Green cycle for
  `REQ-M5-EVIDENCE-008`; it proves exact current and pinned-legacy repository
  identities, consumer fail-closed cases, non-throwing malformed or unreadable
  manifests, and Skill Markdown code-example masking.
- `TEST-SESSION-SCOPED-DEVELOPMENT-001` has current Red/Green cycles for
  `REQ-SESSION-SCOPED-DEVELOPMENT-001` and
  `REQ-SESSION-SCOPED-DEVELOPMENT-002`; it verifies the authoritative Skill
  contracts and their inclusion in the actual repository trace.
- Typecheck and build pass. The full Vitest suite passes with 233/233 tests,
  including the existing Skill-preservation contract.
- Strict trace passes with 94 mandatory requirements and design,
  implementation, and test link coverage all equal to 1. The repository trace
  contains 473 nodes and 1299 edges with no diagnostics.
- CodeGraph gate passes with no cycles. Its only diagnostic is the existing
  compatible-mode warning for three unsupported workflow YAML inputs.
- Formal generation and checking classify all three changed requirements as
  unsupported prose, run no solver, and make no consistency or correctness
  claim. Formal remains optional under the approved custom quality profile.
- The compatible workflow transcript was sanitized and verified against the
  CHANGE-bound requirements, design, implementation, traceability, and
  formal/codegraph declarations recorded before the quality boundary.
- All configured required commands pass: typecheck, build, full tests,
  CodeGraph tests, compatibility tests, package check, and package smoke. The
  final pre-approval gate's only required failure is the missing release
  approval.

## Residual risks

- The Markdown scanner intentionally implements only the approved fenced,
  top-level indented, and inline code-example subset rather than full CommonMark
  parsing. New Skill authoring constructs outside that subset require a new
  requirement and regression fixture.
- Repository recognition intentionally uses exact manifest pairs. A future
  package or official repository rename must update the approved identity set.
- Non-trace evidence input selection still excludes Skill Markdown even when
  the repository trace treats it as an authoritative implementation source.
  Trace staleness remains enforced, but TDD source fingerprints, changed-mode
  evidence fingerprints, and workspace attestations need aligned source-repo
  handling; tracked separately in #15.
- The existing `FILE_READ_CONCURRENCY` comment resolves its `ADR-0018`
  citation to this change's unrelated repository-identity decision. This is a
  documentation-only provenance defect tracked separately in #14.
- Release readiness still requires an immutable candidate, candidate checks,
  and explicit human release approval.
