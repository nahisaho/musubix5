---
schemaVersion: 1
id: CHANGE-0010
summary: Standardize GitHub Actions on Node.js 24
status: active
---
# CHANGE-0010: node24-github-actions

Requirements: REQ-M5-RELEASE-002 REQ-M5-CI-001

## Classification

CI behavior change. All GitHub Actions jobs that install Node.js will use
Node.js 24, while the published package runtime contract remains Node.js
`>=20`.

## Confirmed intent

- Replace the mixed candidate-gate Node.js 20/22/24 matrix with Node.js 24 on
  Ubuntu, Windows, and macOS.
- Change every fixed `actions/setup-node` version in repository workflows to
  Node.js 24.
- Preserve `package.json` `engines.node` as `>=20`; this change updates CI
  execution policy, not the supported package runtime range.
- `REQ-M5-RELEASE-002` remains registered as an intentional extension by the
  unchanged `REQ-M5-COMPAT-013`; this change does not alter that registry.

## Impact

- `.github/workflows/candidate-gate.yml`
- `.github/workflows/release.yml`
- `.github/workflows/npm-publish.yml`
- `packages/analysis/src/candidate-gate.ts`
- `packages/cli/src/main.ts`
- `.musubix/features/node24-github-actions/requirements.md`
- `.musubix/features/node24-github-actions/design.md`
- `.musubix/features/musubix5-clean-foundation/requirements.md`
- `.musubix/features/musubix5-clean-foundation/design.md`
- candidate-gate and workflow contract tests
- English and Japanese CI documentation
- the normative musubix5 verification-matrix inventory
- a decision record for the Node.js 24-only CI policy
- the migration guide's intentional-difference inventory

## Acceptance

- Every `actions/setup-node` invocation in `.github/workflows/*.yml` and
  `.github/workflows/*.yaml` resolves deterministically to Node.js 24.
- The required candidate matrix contains exactly Ubuntu/24, Windows/24, and
  macOS/24.
- The candidate matrix emits one opaque envelope artifact per job, currently
  exactly three, and English and Japanese lifecycle documentation says so.
- Candidate-gate validation rejects missing or substituted jobs against that
  exact matrix.
- Retired Ubuntu/20, Ubuntu/22, Windows/22, and macOS/22 records remain
  readable and projected for historical status and deletion invalidation;
  current-set validation ignores them, while ingestion rejects a new retired
  envelope with `RELEASE_GATE_EVIDENCE_STALE` and appends no record.
- `package.json` continues to declare `engines.node` as `>=20`.
- Every CI-version passage in `README.md` and `README-ja.md` describes the
  Node.js 24 three-OS policy while retaining Node.js `>=20` package support.
- The pinned musubix3 baseline `CI compatibility`, `runtime`, and `package
  runtime range` entries remain byte-unchanged.
- An approved ADR and migration-guide entry document the intentional reduction
  in continuously tested Node.js versions without reducing runtime support.
- `TEST-M5-CI-NODE24-001` and `TEST-M5-CI-HISTORICAL-GATES-001` pass and enforce
  the Node.js 24 policy, compatibility governance, and historical gate behavior.
- Focused tests, typecheck, build, the full test suite, strict trace, CodeGraph,
  and the configured quality gate pass.

## Residual risks

- Removing Node.js 20 and 22 from the candidate matrix reduces continuous
  compatibility coverage for the still-supported `>=20` runtime range.
- Node.js 20/22 compatibility remains a package contract but will rely on local
  testing and user reports unless a separate compatibility workflow is added.
- Before the CHANGE-0010 candidate's three new Node.js 24 records are ingested,
  candidate readiness is expected to report missing or stale gate evidence.
- GitHub issue #17 tracks the remaining macOS default-`TMPDIR` Unix-socket path
  limit. The candidate gate currently mitigates it by running verification
  under `${{ runner.temp }}`, so local macOS verification can still require a
  shorter temporary directory until the socket-path construction is fixed.
