---
schemaVersion: 1
feature: example
---
# Design / 設計

Parallel-Policy: {"agentCommitIdentity":{"email":"musubix5-agent@localhost","name":"musubix5-agent"},"defaultConcurrency":3,"integratorOwnedDefaults":[".musubix/**"],"maxConcurrency":8,"prohibitedAgentOperations":[{"argsPrefix":["push"],"command":"git"},{"argsPrefix":["pull"],"command":"git"},{"argsPrefix":["fetch"],"command":"git"},{"argsPrefix":["tag"],"command":"git"},{"argsPrefix":["branch"],"command":"git"},{"argsPrefix":["rebase"],"command":"git"},{"argsPrefix":["reset"],"command":"git"},{"argsPrefix":["restore"],"command":"git"},{"argsPrefix":["worktree"],"command":"git"},{"argsPrefix":["submodule"],"command":"git"},{"argsPrefix":["notes"],"command":"git"},{"argsPrefix":["replace"],"command":"git"},{"argsPrefix":["prune"],"command":"git"},{"argsPrefix":["gc"],"command":"git"},{"argsPrefix":["update-ref"],"command":"git"},{"argsPrefix":["reflog"],"command":"git"},{"argsPrefix":["config"],"command":"git"},{"argsPrefix":["remote"],"command":"git"},{"argsPrefix":["filter-branch"],"command":"git"},{"argsPrefix":["commit","--amend"],"command":"git"},{"argsPrefix":["checkout"],"command":"git"},{"argsPrefix":["switch"],"command":"git"},{"argsPrefix":["merge"],"command":"git"},{"argsPrefix":["cherry-pick"],"command":"git"},{"argsPrefix":["clean"],"command":"git"},{"argsPrefix":["stash"],"command":"git"}],"provisionCommands":[{"args":["ci","--ignore-scripts"],"command":"npm","name":"npm-ci","timeoutMs":300000}],"runnerEnvironment":{"fixed":{"CI":"true"},"managedHome":true,"passThrough":["PATH","SystemRoot","ComSpec","PATHEXT","TMP","TEMP"]},"schemaVersion":1}

## DES-EXAMPLE-001: Readiness component / 準備状況コンポーネント
Responsibilities: Aggregate explicit readiness evidence without inventing success.
Interfaces: reportReadiness() returns pass, fail, or skipped evidence.
Constraints: Missing required evidence cannot count as success.
Requirements: REQ-EXAMPLE-001
ADRs: ADR-0001
Depends-On: none
