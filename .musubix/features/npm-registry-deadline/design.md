# npm registry deadline design

## DES-M5-WAVE1-PUBLISH-001: Deadline-driven registry integrity verifier
Responsibilities: Replace the fixed six-query post-publication visibility check with a deadline-driven retry loop that continues explicit npm registry not-found results until the inner decision deadline; expose that loop through one committed script used directly by the workflow and deterministic tests; compare the first visible `dist.integrity` value with the locally computed tarball SRI; and preserve the existing terminal publish outcome and manual-reconciliation semantics.
Interfaces: `.github/workflows/npm-publish.yml`; committed module/CLI `scripts/verify-npm-registry-integrity.mjs`; exported `runRegistryIntegrityVerification({ packageSpec, localSri, policy, now, query, sleep })`; the `registry_integrity` step's surviving shell wrapper around the script; production adapters for monotonic time, `npm view <package>@<version> dist.integrity --json`, bounded query termination, sleeping, GitHub output emission, and diagnostics; `npmPublishTransportPolicy()`; `classifyNpmRegistryQuery(exitCode, stdout)`; workflow outputs `registry_visible`, `integrity_matched`, and `registry_sri`; run artifact `publish-outcome-<run-id>-<run-attempt>/publish-outcome.json`; job-summary fields `Published`, `Registry visible`, `Integrity matched`, and `Manual reconciliation required`; authoritative deterministic test `TEST-M5-WAVE1-PUBLISH-DEADLINE-001` in `tests/npm-registry-deadline.test.ts`; existing affected tests `tests/release-workflow-hardening.test.ts`, `tests/release-review-fixes.test.ts`, `tests/release-generation5.test.ts`, and the retained E404 classifier contract in `tests/release-0-2-0.test.ts`.
Constraints: `.github/workflows/npm-publish.yml` invokes `scripts/verify-npm-registry-integrity.mjs` from the immutable candidate checkout under the outer watchdog and does not contain a second retry-loop implementation. The script is both an executable CLI and an importable module; import has no side effects. Its runner accepts injected `now`, `query`, and `sleep` functions, and production adapters are the only layer that reads the monotonic clock, launches `npm view`, or sleeps. For normal completion and terminal verifier failures, the CLI maps the runner result to diagnostics and GitHub outputs before exiting. The workflow shell remains outside the `timeout` process, captures its exit status, and is the authoritative fallback writer for watchdog exits 124 and 137: it emits `registry_visible=false` and `integrity_matched=false`, omits `registry_sri`, prints the hard-deadline `RELEASE_PUBLISH_INTEGRITY_MISMATCH` diagnostic, and exits nonzero. `npmPublishTransportPolicy()` removes `registryAttempts`, `registryDeadlineSeconds`, and `registryDeadlineKillAfterSeconds`, and returns exactly the retry-related fields `registryQueryTimeoutSeconds: 15`, `registryQueryKillAfterSeconds: 2`, `registryInnerDeadlineSeconds: 240`, `registryOuterWatchdogSeconds: 260`, `registryOuterWatchdogKillAfterSeconds: 5`, and `registryBackoffSeconds: readonly [5, 10, 15, 20, 25]`, in addition to the retained `workflow`, `npmVersion`, and `reconcileFailedPublication` fields. Backoff selects `registryBackoffSeconds[min(completedMissingQueries - 1, registryBackoffSeconds.length - 1)]`, so every retry after the fifth sleep remains capped at 25 seconds. Query admission requires `now + registryQueryTimeoutSeconds + registryQueryKillAfterSeconds <= startedAt + registryInnerDeadlineSeconds`; sleep is capped at the nonnegative time remaining before the latest admissible query start, and no sleep occurs when another complete query budget cannot be admitted. A query result is accepted only when its completion time is no later than the 240-second inner deadline. The 260-second outer watchdog is crash containment rather than the registry decision clock; its 20 seconds of headroom covers production process startup, a query's forced termination, output emission, and loop finalization. The retry loop has no fixed attempt count and therefore issues a query after the former sixth-attempt boundary when the deterministic fixture makes matching SRI visible before the deadline with a complete next-query budget. A successful match emits `registry_visible=true`, `integrity_matched=true`, and `registry_sri=<matching-sri>`, and records `published: true`, `registryVisible: true`, `integrityMatched: true`, and `manualReconciliationRequired: false`. Only a nonzero query classified by `classifyNpmRegistryQuery` as explicit `E404` is retryable. Invalid or mismatched visible SRI emits `registry_visible=true` and `integrity_matched=false`; explicit `E404` deadline exhaustion, outer-watchdog termination, and every non-`E404`, malformed, or otherwise unclassified query failure emit `registry_visible=false` and `integrity_matched=false`; every failure omits `registry_sri`. All terminal failures use `RELEASE_PUBLISH_INTEGRITY_MISMATCH`, retain `published: true`, and require manual reconciliation. Registry verification never invokes `npm publish`; an already published immutable version is reconciled only through read-only integrity comparison and is never republished.
Requirements: REQ-M5-WAVE1-PUBLISH-001
ADRs: ADR-0011

## Verification and handoff

`TEST-M5-WAVE1-PUBLISH-DEADLINE-001` imports
`runRegistryIntegrityVerification` from the exact script invoked by the
workflow and supplies a deterministic monotonic clock, query fixture, and sleep
fixture. It proves that six explicit `E404` results produce the bounded sleep
sequence 5, 10, 15, 20, 25, 25 rather than terminating verification, a seventh
query with a complete
timeout-plus-forced-kill budget accepts matching SRI before the inner deadline,
and the terminal outcome contains the four required success booleans. The same
test covers the specified workflow outputs for deadline exhaustion, invalid and
mismatched SRI, non-`E404` query failure, outer watchdog termination, watchdog
headroom, and absence of any second publication invocation.

Existing structural tests are updated to require the committed script
invocation instead of matching an inline fixed-attempt shell loop.
`tests/release-review-fixes.test.ts` also binds every policy field to the
workflow/script command and preserves the existing output mapping;
`tests/release-workflow-hardening.test.ts` preserves workflow identity,
classification, timeout, SRI, and terminal-diagnostic assertions;
`tests/release-generation5.test.ts` replaces its inline-loop assertions for
`timeout ... 15s npm view` and `deadline=$((SECONDS + 240))` with assertions
for the committed verifier invocation and preserved publication/outcome
surface; and `tests/release-0-2-0.test.ts` continues proving the shared explicit
`E404` classifier without duplicating retry scheduling.
The authoritative test additionally executes the parsed
`registry_integrity` workflow step in a temporary fixture with controlled
command adapters, proving that the actual shell seam invokes the committed
script and that simulated watchdog exits 124 and 137 produce the required
fallback outputs and terminal diagnostic.
