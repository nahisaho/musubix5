---
name: sdd-parallel-dispatch
description: Dispatch approved requirement-batch assignments to native Copilot subagents with bounded concurrency.
---

# Parallel dispatch

Use only after current requirements and design approval. Invoke the repository
`npx musubix5 parallel` CLI to validate/create and prepare the plan. Request
assignment instruction manifests until the plan concurrency is occupied, then
launch only the corresponding Copilot native subagents. Do not launch Copilot
subprocesses, invent a second task system, or edit an assignment worktree from
the parent Agent.

At every dispatch decision, count the currently running assignment attempts
against the configured concurrency bound. Never exceed that configured
concurrency bound, including while replacing failed or completed attempts;
request and launch another instruction only after a slot is verifiably free.

Each subagent prompt must reproduce the complete instruction manifest,
including CHANGE/generation/plan/assignment/attempt identities, worktree,
branch, start commit, requirements, owned paths, dependency heads, focused
commands, commit identity, prohibited operations, and result/failure commands.
Pass through every exact Red/Implementation/Green argv array from
`tddCommands`; do not reconstruct commands or collapse the separate control
root and assignment workspace.
Continue dispatching independent queued assignments after unrelated failures;
never dispatch blocked descendants.

Record exactly one terminal workflow outcome:

`npx musubix5 workflow-record sdd-parallel-dispatch complete --status <completed|failed> --change-id <CHANGE-ID>`
