---
schemaVersion: 1
feature: candidate-cleanup-policy
status: draft
---
# Candidate cleanup policy requirements

## REQ-M5-WAVE1-CLEANUP-001: Apply one state-conditional candidate cleanup policy
Priority: must
Type: functional
Pattern: state-driven
Statement: While candidate cleanup is evaluated, the system shall use the same state-conditional safety policy for candidate CLI cleanup and integration cleanup.
Acceptance: dirty、untracked、active lease、またはunresolved conflictを持つ候補は全stateで`CANDIDATE_CLEANUP_UNSAFE`となること。未統合commitを持つ`prepared | active | ready`候補は`CANDIDATE_CLEANUP_UNSAFE`、`integrating | verified`候補は既存の`CANDIDATE_INTEGRATION_CONFLICT`で拒否すること。未統合commitを持つ`failed | abandoned | stale`候補はCLIの`--confirm`がある場合だけworktree削除を許可し、`integrated`候補はcommit到達可能性と通常のcleanliness条件を満たす場合にcleanupでき、`deleted`候補は完了済み同一operation keyのexact replayを除きexit 1 `CANDIDATE_WORKSPACE_NOT_FOUND`で0 writeとなること。public CLI matrix testは全10 stateを検証し、`deleted` rowには完了済みoperation keyと一致しないcleanupを使用して、candidate CLIとintegration cleanupの共有predicateが同じ入力へ同じpolicy decisionを返すこと。authoritative test `TEST-M5-WAVE1-CANDIDATE-CLEANUP-POLICY-001`が検証すること。

## REQ-M5-WAVE1-CLEANUP-002: Retain recoverable history when cleaning terminal candidates
Priority: must
Type: functional
Pattern: event-driven
Statement: When confirmed terminal-candidate cleanup occurs, the system shall remove only the managed worktree while retaining the candidate's branch, commits, registry history, and tombstone references.
Acceptance: cleanup後にworktree pathは存在せず、candidate branchとcandidate commitは到達可能であり、registry/journalからlogical candidate identity、CHANGE ID、generation、commit、およびcleanup actor/reasonを再構築できること。他candidateとcontrol worktree contentは不変であり、同じregistryにdeleted entryが存在しても別CHANGEのcandidate create/list/showが成功すること。cleanup済みcandidateに対するresume、refresh、ready、および同generationのcreateはexit 1 `CANDIDATE_WORKSPACE_NOT_FOUND`で0 writeとなり、showは保存済みtombstoneを返すこと。ただし同一operation keyのexact cleanup replayに限り、初回と同一結果を返し、registry/journalをbyte単位で変更せず、新しい削除またはtombstoneを追加しないこと。authoritative test `TEST-M5-WAVE1-CANDIDATE-CLEANUP-RETENTION-001`が検証すること。
