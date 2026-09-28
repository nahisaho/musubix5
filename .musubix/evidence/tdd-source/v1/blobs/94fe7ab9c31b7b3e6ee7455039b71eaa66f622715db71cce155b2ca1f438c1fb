# Trace Skill source selection requirements

## REQ-M5-EVIDENCE-008: Select repository-owned Skill trace inputs
Priority: must
Type: functional
Pattern: event-driven
Statement: When trace inputs are collected and interpreted, the system shall treat `.github/skills/*/SKILL.md` as repository-owned Skill inputs only for an explicitly recognized musubix source repository, with annotation-shaped text inside Markdown code examples excluded from authoritative trace declarations.
Acceptance: Authoritative isolated fixtures contain identical normative, supported-language source, and `.github/skills/example/SKILL.md` files. Current-source identity requires `package.json.name` to equal `musubix5` and object-form `package.json.repository.url` to equal `https://github.com/nahisaho/musubix5.git` byte-for-byte; pinned legacy-source identity requires the corresponding exact values `musubix3` and `https://github.com/nahisaho/musubix3.git`. String repository shorthand, `git+https` variants, other names or URLs, a missing name, missing or non-object repository metadata, a missing manifest, and malformed JSON are independently tested non-matches. Every fixture resolves without throwing and still includes the normative and supported-language source paths. `TEST-M5-EVIDENCE-SKILL-INPUT-001` is a trace-annotated test node that verifies this requirement by proving selection for both recognized source identities, exclusion for every non-match, real Skill declaration nodes and edges in the current-source graph, and no node or edge from annotation-shaped text inside fenced or indented code blocks or inline code spans. `DES-M5-TRACE-SKILL-001` satisfies this requirement. Building and strictly checking the actual repository trace includes `CODE-SESSION-SCOPED-DEVELOPMENT-001` and `CODE-SESSION-SCOPED-DEVELOPMENT-002` with zero dangling endpoints.

## REQ-SESSION-SCOPED-DEVELOPMENT-001: Start each development request as a fresh change
Priority: must
Type: functional
Pattern: event-driven
Statement: When a natural-language development request starts, the development workflow shall create a fresh CHANGE and feature artifact scope unless the requester explicitly identifies an existing CHANGE to continue.
Acceptance: `TEST-SESSION-SCOPED-DEVELOPMENT-001` is a trace-annotated test node that verifies this requirement by inspecting `.github/skills/sdd-change/SKILL.md` and `.github/skills/sdd-requirements/SKILL.md` and proving that both workflows require a new CHANGE or feature artifact for an unnamed request, permit reuse only for an explicitly identified continuation, and prohibit treating prior-session approval or evidence as current authorization. `DES-SESSION-SCOPED-DEVELOPMENT-001` and `DES-SESSION-SCOPED-DEVELOPMENT-002` satisfy this requirement.

## REQ-SESSION-SCOPED-DEVELOPMENT-002: Require approved specifications before implementation
Priority: must
Type: functional
Pattern: event-driven
Statement: When a development workflow reaches implementation, the workflow shall require validated and currently approved requirements and design artifacts for the selected CHANGE before implementation code is edited.
Acceptance: `TEST-SESSION-SCOPED-DEVELOPMENT-001` is a trace-annotated test node that verifies this requirement by inspecting `.github/skills/sdd-change/SKILL.md` and proving that the integrated workflow prohibits implementation before current requirements and design approval, prohibits inferred approval from a development request, and requires returning to requirements or design when approval is absent, stale, or invalid; the same test inspects `.github/skills/sdd-requirements/SKILL.md` and proves that requirements validation is not approval, explicit current requirements approval is mandatory before design, and rejection or an intervening requirements-artifact change requires renewed review and approval. `DES-SESSION-SCOPED-DEVELOPMENT-001` and `DES-SESSION-SCOPED-DEVELOPMENT-002` satisfy this requirement.
