---
schemaVersion: 1
feature: repository-tdd-currency
status: draft
---
# Repository-wide TDD currency requirements

## REQ-M5-TDD-CURRENCY-001: Restore authoritative test source currency
Priority: must
Type: functional
Pattern: event-driven
Statement: active CHANGE が存在しない状態でリポジトリ全体の TDD 証跡を検証するとき、システムは acceptance に列挙する authoritative test に対して current な正規 Green fingerprint を選択し、`TDD_TEST_STALE` を報告してはならない。
Acceptance: GitHub Issue #34 の初期修復集合である `TEST-M5-RELEASE-002-TRUST-001`, `TEST-M5-RELEASE-003`, `TEST-M5-RELEASE-003-GEN5-001`, `TEST-M5-RELEASE-004-001`, `TEST-M5-RELEASE-003-CONTEXT-BINDING-001`, `TEST-M5-RELEASE-003-DOCS-001`, `TEST-M5-PARALLEL-GRAPH-ACYCLIC-001`, `TEST-M5-PARALLEL-INTEGRATION-GATE-001`, `TEST-M5-PARALLEL-REAL-GATE-SUCCESS-001`, `TEST-M5-WORKFLOW-DECLARATION-CORRECTION-CLI-001`, `TEST-M5-APPROVAL-GUIDANCE-001` の各テストは `CHANGE-0013` に結合された genuine Red と Green を持ち、Red と Green の間で異なる non-test source fingerprint を記録すること。全11件の Red は CHANGE Red phase record より前に記録し、CHANGE implementation phase record より後に全11件の Green を記録してから CHANGE Green phase record を作成すること。各 Green は現在の authoritative test source fingerprint と一致すること。11件は `tdd migrate` の旧アルゴリズム一致条件を満たさないため migration を使用しないこと。`DES-M5-TDD-CURRENCY-001` が本要求を参照し、実装 code node が本要求を実装し、11件すべてが本要求を検証することで strict trace の design、implementation、tests coverage が各 1 になること。最終候補では対象テストへの要求 trace 注釈と実装への trace 注釈以外にテスト本文差分を残さず、製品コードの意味的差分を残さないこと。CHANGE 完了前に未追跡ファイルと変更済み証跡を含む control working tree 全体を disposable directory へ複製し、その複製だけで CHANGE 文書を completed として `npx musubix5 tdd validate --json` が `valid: true` かつ `TDD_TEST_STALE` 件数 0 を返し、完了後の control worktree でも同じ結果を返すこと。
