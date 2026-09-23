---
name: sdd-integration-verification
description: Integrate completed requirement batches deterministically and verify the candidate.
---

# Integration verification

Wait until every required assignment result is CLI-verified. Use only
`npx musubix5 parallel integration` commands to create or resume the numbered
integration attempt. Never cherry-pick manually or auto-resolve conflicts.
When a conflict or verification failure requires new work, reopen with an
explicit reason and dependency-closed completed assignment set.

Run `parallel integration verify`, then `parallel handoff`, then normal
branch-retaining `parallel cleanup`. Handoff must be fast-forward-only and
cleanup must retain every branch plus dirty, failed, blocked, unknown, or
unconsumed worktrees.

Treat provisioning/environment failures as retryable verification failures:
rerun `parallel integration verify` against the retained provisional
provenance. Use `parallel integration reopen` only for an explicit
dependency-closed assignment set after a non-environment integration failure.

Record exactly one terminal declaration:

`npx musubix5 workflow-record sdd-integration-verification complete --status <completed|failed> --change-id <CHANGE-ID>`
