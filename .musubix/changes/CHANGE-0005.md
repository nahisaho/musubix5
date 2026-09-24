---
schemaVersion: 1
id: CHANGE-0005
summary: Improve CodeGraph incremental indexing and traversal performance
status: active
---
# CHANGE-0005: codegraph-performance

Requirements: REQ-M5-GRAPH-001 REQ-M5-GRAPH-002

Issue: https://github.com/nahisaho/musubix5/issues/3

## Classification

Behavior change and performance improvement. Existing CodeGraph results and
CLI compatibility remain normative while indexing and graph traversal avoid
unnecessary repeated work.

## Confirmed intent

- Make `graph index --changed` perform a safe incremental refresh when a valid
  prior cache and a conservatively bounded invalidation set are available.
- Derive invalidation from cached and current graph-input fingerprints; Git
  working-tree changes remain informational and never determine reuse safety.
- Let `graph index --changed` continue successfully with `changed: null` when
  Git metadata is unavailable because fingerprint invalidation is independent
  of Git.
- Fall back explicitly to a full rebuild when an incremental refresh cannot be
  proven equivalent.
- Preserve deterministic graph contents, diagnostics, stale-cache rejection,
  architecture checks, and existing CLI behavior.
- Build reusable adjacency indexes once per graph operation instead of
  repeatedly filtering the complete import-edge collection.
- Add deterministic operation-count evidence rather than relying on elapsed
  wall-clock thresholds.

## Impact

- Extend the persisted CodeGraph cache with analyzer-versioned, per-file
  analysis metadata and replace it atomically.
- Refactor graph indexing into reusable per-file analysis units with explicit
  importer-closure invalidation and full-rebuild fallback rules for added,
  deleted, declaration-input, global-scope, declaration-map, or
  resolution/configuration changes.
- Refactor impact, cycle, and gate traversal around adjacency and reverse-
  adjacency indexes.
- Add focused TDD fixtures and operation-count reports for incremental reuse
  and linear traversal bounds.
- Add the required `codegraph-tests` quality command and its structured-report
  harness so the nine CodeGraph acceptance tests are gate evidence.
- Measure contributing extraction and graph traversal deterministically;
  complete TypeScript program construction remains required for correctness
  and is intentionally outside the incremental operation budget.
- Update directly related CLI output and documentation to expose whether
  indexing was incremental or a full fallback without persisting run-mode
  fields in the semantic graph.

## Unchanged obligations

- A clean full index remains the semantic reference result.
- Unsupported languages, unresolved imports, dynamic loading, architecture
  rules, cycle detection, and strict/compatible mode semantics do not change.
- No new language, GraphRAG implementation, external graph database, or broad
  call-resolution redesign is included.

## Acceptance

- `TEST-M5-GRAPH-INCREMENTAL-001` proves that a six-source leaf change analyzes
  two sources, reuses four, and persists the same graph as a clean full index
  after excluding only `generatedAt`.
- `TEST-M5-GRAPH-INCREMENTAL-NOCHANGE-001`,
  `TEST-M5-GRAPH-INCREMENTAL-FALLBACK-001`,
  `TEST-M5-GRAPH-INCREMENTAL-GIT-001`, and
  `TEST-M5-GRAPH-CACHE-WRITE-001` cover no-change reuse, conservative fallback
  reasons and precedence, Git-unavailable operation, and atomic cache failure.
- `TEST-M5-GRAPH-TRAVERSAL-001`, `TEST-M5-GRAPH-CYCLES-001`,
  `TEST-M5-GRAPH-GATE-SCAN-001`, and `TEST-M5-GRAPH-GATE-ORDER-001`
  preserve traversal, architecture diagnostic behavior, and deterministic
  ordering. The traversal budget is `forwardAdjacencyVisits <= 13`; the
  authoritative fixture also asserts 13 reverse visits and zero complete
  import rescans.

## Quality and release evidence

- The full gate passes requirements, design, constitution, trace, graph,
  workflow, TDD, change history/completeness, all seven required commands,
  191/191 annotated test identities, and the deterministic performance budget.
- The optional formal check fails non-blockingly because there is no explicit
  model (`0/87`, solver not requested). Policy, mutation, and attestation are
  optional and skipped because no trusted policy baseline or mutation evidence
  is configured and local evidence is explicitly unsigned.
- The only remaining required gate failure is release approval. The existing
  release approval belongs to CHANGE-0004 generation 2 and is not evidence for
  this change.
- CHANGE-0005 release approval will bind a persisted clean committed candidate
  snapshot. No new external candidate-gate matrix or release operation is in
  scope; existing `.musubix/evidence/release/gates` and
  `.musubix/evidence/release/operations` artifacts belong to CHANGE-0004.
