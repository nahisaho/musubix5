---
name: sdd-agent-assignment
description: Execute one generated requirement-batch assignment in its dedicated worktree.
---

# Agent assignment

Follow one `parallel assignment instruction` manifest exactly. Work only in the
declared assignment worktree and owned paths. Do not edit `.musubix/**`, switch
branches, rewrite history, fetch, pull, merge, rebase, cherry-pick, clean,
stash, alter Git configuration, or operate on another worktree.

Run the declared focused Red/Implementation/Green commands, preserve the test
between Red and Green, and commit the completed owned changes with the supplied
non-secret commit identity. Submit the exact head using `parallel assignment
result`; on an unrecoverable error use `parallel assignment fail` with a
non-empty reason. Agent assertions never replace CLI verification.

Execute each manifest `tddCommands` argv array exactly through
`npx musubix5`: Red and Green include `--root <controlRoot>` plus
`--workspace <worktree>`, while Implementation writes only to
`--root <controlRoot>`. Never create, edit, delete, stage, or commit any
`.musubix/**` path in the assignment worktree.

Record exactly one terminal declaration:

`npx musubix5 workflow-record sdd-agent-assignment complete --status <completed|failed> --change-id <CHANGE-ID>`
