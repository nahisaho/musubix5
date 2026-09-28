# musubix3 and musubix4 migration assessment

## Evidence basis

- musubix3 baseline: v0.1.18, commit
  `c0b20f06727bceb04eeec181d95af9047b1981de`, clean worktree.
- musubix4 reference baseline: v0.1.3, commit
  `06f1831c228b18a12343a688faa1393fe772a6c5`, with extensive uncommitted
  source, test, specification, and generated-evidence changes.
- Primary sources: Git state and history, package manifests, README and
  changelog, CLI source/help, tests, requirements, designs, and ADRs.
- musubix4 uncommitted artifacts are design evidence only and are not a stable
  compatibility baseline.

## Comparison

| Area | musubix3 behavior oracle | musubix4 lesson | musubix5 decision |
|---|---|---|---|
| CLI | Stable v0.1.18 command tree, exit classes, JSON conventions | Extended orchestration while retaining the core command tree | Contract-test the v0.1.18 surface; intentionally rename the executable |
| Package | Node >=20 ESM monorepo; domain, analysis, attestation exports | Same base packaging plus stronger archive checks | Preserve selected exports and isolated install behavior |
| Configuration | `.musubix/config.json`, schema version 1, deterministic defaults | Added autonomous orchestration configuration | Read v3 configuration compatibly; add versioned extensions |
| Specification | EARS requirements, design components, ADRs | More workflow policy encoded in Skills and evidence | Keep normative artifacts separate from generated evidence |
| Trace and graph | Generated trace plus TypeScript graph checks | Freshness-bound graph cache and impact analysis | Adopt producer/input identity and stale-cache rejection |
| TDD | Authoritative TEST IDs and Red/Green/Refactor evidence | Retry history and batch-order lessons | Model attempts separately and select latest complete cycles |
| Approval | Manual exact-manifest SHA-256 stages | Verified-auto repair work exposed failure classification needs | Preserve manual approval; add bounded repair before manual boundaries |
| Orchestration | Direct SDD workflow | Harness-on-Harness introduced durable runs and isolation complexity | Separate normal orchestration from an explicit bootstrap runner |
| Worktree | Repository-local operation | Durable baseline/private-index fixes were needed | Separate baseline, candidate, and QA workspaces from inception |
| Release | Gate, status, approval, package checks | Version/archive consistency and richer evidence | Require current evidence and human release approval |

## Confirmed musubix4 failure causes

1. Candidate baselines held only in process memory were unavailable to a later
   resume process, causing run output to be misclassified as initial user dirt.
2. Rejected candidate changes remained in the real worktree/index, causing a
   later resume to observe orchestrator-owned leftovers as external mutation.
3. Git racily-clean status could report a modification even when effective
   content and mode matched the copied index.
4. Recomputing a baseline from current HEAD would absorb run output into the
   baseline and destroy ownership.
5. Exact approval and generated evidence freshness caused stale states when
   bound artifacts changed; approval failure categories were too coarse for
   repairable verified-auto findings.

## Inference requiring design controls

Approval manifests and generated evidence can become self-referential if a
producer rewrites an artifact included in the manifest authorizing that same
producer. musubix5 must define immutable normative inputs, generated-output
exclusions, and producer/consumer boundaries explicitly and test them.

## Adoption decisions

- Adopt EARS, ADRs, traceability, append-only order, private Git indexes,
  durable baseline identity, bounded repair, and package archive verification.
- Redesign automated approval boundaries, budgets, pending invocations,
  evidence schemas, TDD batch selection, workspace ownership, and Planner
  diagnostics.
- Reject copied historical evidence, timestamp ordering, baseline
  recomputation, release from bootstrap, silent fallback, and any claim that a
  formal or quality gate alone proves behavior correctness.

