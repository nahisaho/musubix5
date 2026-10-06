# Linux-only candidate and release requirements

## Scope

These requirements replace the Ubuntu, Windows, and macOS candidate and release
matrix obligations with one Ubuntu Node.js 24 delivery platform. They preserve
the closed seven-command gate, deterministic execution plan, immutable
candidate binding, no-retry policy, signed evidence, timeout calibration,
first-attempt stability, and fail-closed release verification.

For candidate calibration, candidate stability, release readiness, and release
execution, these requirements supersede only the exact-three-platform,
three-envelope calibration, six-envelope stability, and three-platform
release-revalidation clauses in `REQ-M5-CI-EFFICIENCY-003`,
`REQ-M5-CI-EFFICIENCY-005`, and `REQ-M5-CI-EFFICIENCY-006`. Each Ubuntu job
remains the bounded unit governed by `REQ-M5-CI-EFFICIENCY-003`; its
1,200,000-millisecond limit and all unrelated quality, portability, diagnostic,
and integrity obligations remain in force.

## REQ-M5-LINUX-DELIVERY-001: Execute candidate verification on one Linux platform
Priority: must
Type: functional
Statement: When candidate calibration or candidate verification is dispatched, the system shall execute exactly one Ubuntu Node.js 24 job.
Acceptance: `.github/workflows/candidate-calibration.yml` and `.github/workflows/candidate-gate.yml` each define exactly one supported job identity `{os:"ubuntu",nodeMajor:24}`; their job and artifact names are unique without a platform matrix; runtime context, signed envelopes, OIDC claims, Jobs API projections, and gate-input bindings identify Ubuntu and Node.js 24 and include the immutable delivery profile `linux-only-v1`; calibration ingestion, stability verification, and release verification reject with `LINUX_DELIVERY_EVIDENCE_INVALID` when their bound run contains any Windows, macOS, additional operating-system, additional Node-major, duplicate job identity, or artifact not owned by the single expected Ubuntu job; no automatic retry or rerun grants credit; and `TEST-M5-LINUX-CANDIDATE-WORKFLOW-001` verifies the accepted and rejected workflow shapes.

## REQ-M5-LINUX-DELIVERY-002: Calibrate deadlines from Linux evidence
Priority: must
Type: non-functional
Statement: When candidate timeout calibration is requested, the system shall derive candidate deadlines from one successful first-attempt Ubuntu Node.js 24 no-credit envelope.
Acceptance: Accepted calibration binds exactly one workflow run, one Ubuntu job, one uniquely named artifact, one valid `linux-only-v1` signed envelope, one OIDC-verification digest, one Jobs API timing projection, one runtime LFS-manifest digest, and one logical LFS-closure digest; the source commit, CHANGE ID, generation, repository ID, execution-plan shape, gate-input projection, commands, reports, acknowledgments, preconditions, post-conditions, persistence, signing, and upload remain fail-closed; the delivery profile is an input to the gate-input fingerprint so a CHANGE-0018 or other three-platform envelope cannot replay as Linux-only evidence; any missing, duplicate, censored, timed-out, nonzero, rerun, non-Ubuntu, non-Node.js-24, cross-profile, or context-mismatched observation rejects calibration with `LINUX_DELIVERY_EVIDENCE_INVALID`; the calibrated regions and candidate caps remain those defined by `REQ-M5-CI-EFFICIENCY-003`, but each previous three-platform maximum is replaced by its one completed Ubuntu observation, then ceiling-rounded to a multiple of 1,000 milliseconds with an exact multiple left unchanged before the exact 3/2 multiplier is applied, and a value above an existing cap rejects rather than clamps; and `TEST-M5-LINUX-CALIBRATION-001` verifies the exact one-job schema, calculation order, and rejection matrix.

## REQ-M5-LINUX-DELIVERY-003: Prove repeatable Linux candidate stability
Priority: must
Type: non-functional
Statement: When candidate stability is evaluated, the system shall require two consecutive successful first-attempt Ubuntu Node.js 24 candidate-gate runs for the same immutable candidate and gate input.
Acceptance: Stability evidence contains exactly two distinct candidate-gate workflow run IDs in deterministic creation order and exactly two `linux-only-v1` Ubuntu signed envelopes; deterministic creation order sorts by `created_at` ascending and then by numeric run ID ascending when timestamps tie; both runs have event `workflow_dispatch`, the same immutable candidate commit, CHANGE ID, generation, execution-plan digest, calibration digest, timeout-excluded gate-input digest, logical LFS-closure digest, delivery profile, and final gate-input fingerprint; each current run and first-attempt endpoint concludes `success` with `run_attempt === 1`; the verifier exhaustively paginates all Runs API results matching the resolved candidate workflow identity, event, and head SHA, applies the same total order, and treats every matching run whose total-order key is strictly between the two selected keys as intervening regardless of whether it is queued, in progress, cancelled, failed, successful, or rerun, so tied timestamps cannot hide a run and any intervening run invalidates the pair; unavailable or incomplete pagination fails closed; a missing or expired artifact, extra bound-run job or artifact, Windows or macOS envelope, cross-profile evidence, invalid OIDC/API binding, failed job, timeout, API unavailability, or mismatched context also invalidates the pair with `LINUX_DELIVERY_EVIDENCE_INVALID`; each accepted API job `started_at` to artifact `created_at` duration remains at most 1,200,000 milliseconds; only the later run supplies the authoritative current gate set while the earlier run remains bound stability evidence; and `TEST-M5-LINUX-STABILITY-001` verifies the full acceptance and rejection matrix.
Formal: {"kind":"temporal","trigger":"linux_candidate_job_started","response":"signed_linux_candidate_artifact_created","withinMs":1200000}

## REQ-M5-LINUX-DELIVERY-004: Release using Linux evidence only
Priority: must
Type: functional
Statement: When release readiness or release execution is evaluated, the system shall require and revalidate only the approved Linux calibration and two-run Linux candidate evidence.
Acceptance: Release verification requires the approved `linux-only-v1` calibration artifact and the later authoritative Ubuntu candidate envelope from the accepted consecutive pair while retaining the earlier Ubuntu run as stability evidence; it re-fetches and revalidates both candidate runs, both first-attempt endpoints, both Ubuntu jobs, both bound-run artifact sets, both OIDC claims and signed envelopes, their common delivery profile and context, and it repeats the exhaustive no-intervening-run check before granting release credit; it also validates the calibration workflow identity and artifact, candidate/source tree relation, execution-plan and calibration digests, LFS bindings, time limits, quality evidence, and release approval; it neither queries nor requires Windows or macOS candidate jobs or envelopes, but rejects with `LINUX_DELIVERY_EVIDENCE_INVALID` if any bound calibration or candidate run contains an extra job or artifact; every CHANGE-0018, three-platform, missing, expired, unavailable, ambiguous, cross-profile, or stale artifact whose candidate commit, generation, delivery profile, or gate-input fingerprint is not the current approved context grants no calibration, stability, or release credit; GitHub API, pagination, artifact-fetch, signature, or OIDC unavailability fails closed and cannot use cached success as a fallback; npm publication and release workflows consume the Linux-only verified context without changing package contents or approval requirements; and `TEST-M5-LINUX-RELEASE-001` verifies Linux-only readiness, publication binding, API/fetch failure behavior, and rejection of historical cross-platform, extra-platform, stale, or incomplete evidence.
