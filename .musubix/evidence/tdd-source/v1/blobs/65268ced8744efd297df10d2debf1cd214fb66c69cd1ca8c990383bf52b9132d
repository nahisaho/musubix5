# Repository-wide TDD currency design

## DES-M5-TDD-CURRENCY-001: Deterministic authoritative-test currency repair
Responsibilities: GitHub Issue #34 で特定された11件の authoritative test に対して、現在の test source fingerprint と一致する genuine Red/Green 証跡を CHANGE-0013 generation 1 に再構築し、完了状態のリポジトリ全体検証で `TDD_TEST_STALE` を0件にする。
Interfaces: `npx musubix5 tdd red|green <TEST-ID> --requirement REQ-M5-TDD-CURRENCY-001 --command test`; `.musubix/config.json` の Vitest adapter による test path と exact test ID の focused selection および fresh JSON report; `.musubix/evidence/tdd.json`; `.musubix/evidence/order.json`; `npx musubix5 change-record CHANGE-0013 red|implementation|green --requirement REQ-M5-TDD-CURRENCY-001`; `CODE-M5-TDD-CURRENCY-REPAIR-001` trace node attached to `effectiveLatestCycle` in `packages/analysis/src/tdd.ts`; the eleven `TEST-*` nodes listed in `REQ-M5-TDD-CURRENCY-001`.
Constraints: design phase record 後かつ最初の Red 前に、11件の既存 test annotation へ `REQ-M5-TDD-CURRENCY-001` を追加する。test body、test title、assertion、fixture、および runtime behavior は変更しない。各 Red は下表の単一 implementation symbol に限定した一時 fault を導入し、対象 test だけが `failed` の fresh report を生成したことを記録した直後に、fault を完全に復元する。Red と Green は同じ `test` command name を使用する。各 fault の適用前に対象 implementation file の baseline SHA-256 を記録し、次の fault または CHANGE Red phase record の前に baseline hash との一致と `git diff --quiet -- <implementation-file>` の期待済み恒久差分を除く一致で、一時 fault が残っていないことを fail-closed で確認する。fault 適用中は `npm run build` その他 `dist/` を更新する操作を禁止し、誤って build した場合は復元後に再 build してから次の Red または Green へ進む。全11件の Red を記録してから CHANGE Red phase を記録し、その後 `effectiveLatestCycle` に comment-only の `CODE-M5-TDD-CURRENCY-REPAIR-001` annotation を追加して CHANGE implementation phase を記録する。この annotation は requirement の implementation trace coverage と CHANGE implementation checkpoint の実装差分を提供する。全11件の Green は、その単一の復元済み annotated tree で記録し、全 Green 後に CHANGE Green phase を記録する。migration、void、手編集 report、test-only fault、複数 fault の同時適用を禁止する。最終候補では requirements/design/ADR、test の `@verifies` 追加、implementation の trace annotation、および生成された証跡以外の source 差分を残さない。
Requirements: REQ-M5-TDD-CURRENCY-001
ADRs: ADR-0024

### Repair matrix

| Test ID | Temporary implementation fault | Required failing observation |
|---|---|---|
| `TEST-M5-RELEASE-002-TRUST-001` | `packages/analysis/src/candidate-gate.ts` の `candidateGateFingerprintConfig` が policy projection の1値を異なる値で返す | approved policy digest expectation fails |
| `TEST-M5-RELEASE-003` | `packages/analysis/src/release-workflow.ts` の `releaseTransportPolicy` が異なる `runner` を返す | release transport policy expectation fails |
| `TEST-M5-RELEASE-003-GEN5-001` | `packages/analysis/src/release-workflow.ts` の `releaseContextBytes` が canonical payload の末尾 newline を省略する | exact canonical release-context bytes expectation fails |
| `TEST-M5-RELEASE-004-001` | `packages/analysis/src/release-workflow.ts` の `npmCliInvocation` が Windows fallback の `args` を空配列で返す | exact Windows npm invocation expectation fails |
| `TEST-M5-RELEASE-003-CONTEXT-BINDING-001` | `packages/analysis/src/release-workflow.ts` の `validateReleaseAttestationIdentity` が一致する context も拒否する | valid identity `not.toThrow` expectation fails |
| `TEST-M5-RELEASE-003-DOCS-001` | `packages/analysis/src/release-workflow.ts` の `validateReleaseDocumentation` が valid documents を version mismatch として拒否する | valid documentation expectation fails |
| `TEST-M5-PARALLEL-GRAPH-ACYCLIC-001` | `packages/analysis/src/graph.ts` の `graphGate` が `forbidCycles` 入力時の `valid` を false にする | graph validity expectation fails |
| `TEST-M5-PARALLEL-INTEGRATION-GATE-001` | `packages/analysis/src/parallel-runtime.ts` の `integrationGateAcceptable` が許可された pre-release diagnostic pair を拒否する | first acceptable integration-gate expectation fails |
| `TEST-M5-PARALLEL-REAL-GATE-SUCCESS-001` | `packages/analysis/src/tdd.ts` の `canonicalTestFingerprintText` が CRLF/CR を正規化せず返す | fixture creation 後かつ parallel plan creation 前の canonical newline expectation fails |
| `TEST-M5-WORKFLOW-DECLARATION-CORRECTION-CLI-001` | `packages/analysis/src/process.ts` の `resolveProcessCommand` が Windows の `npm` を `npm.cmd` に変換しない | explicit Windows command expectation fails before CLI spawn |
| `TEST-M5-APPROVAL-GUIDANCE-001` | `packages/analysis/src/approval.ts` の `requireApproval` recovery message から `musubix5 approval validate` を除く | source-imported `requireApproval` rejection-message expectation fails |

### Ordering and restoration protocol

1. 11 test annotation の trace-only edit を完了し、`trace build` と `trace check` で test node が `REQ-M5-TDD-CURRENCY-001` を検証することを確認する。
2. repair matrix の順で1件ずつ fault を適用し、focused test を直接実行して期待する assertion failure を確認してから、同じ tree で `tdd red` を記録する。`.musubix/evidence/native/test/<TEST-ID>.json` の raw Vitest adapter output で、対象 test entry が Red では `failed`、Green では `passed` であり、対象外の `TEST-*` entry はすべて `skipped` であることを確認する。正規化後 report の `TDD_REPORT_NOT_SCOPED` だけには依存しない。特に prefix でもある `TEST-M5-RELEASE-003` は test path と raw report test ID/status の両方で scope を確認する。
3. 各 Red の直後に fault hunk を復元し、対象 implementation file が記録済み pre-fault SHA-256 と一致し、期待済み恒久差分以外を `git diff --quiet -- <implementation-file>` が報告しないことを確認する。復元確認が失敗した場合は次の test へ進まない。fault 適用中に build が実行された場合は復元後に build し直し、`dist/` に fault が残らないことを確認する。
4. 全11件の valid Red と report/test ID 一致を確認して CHANGE Red phase を記録する。
5. `effectiveLatestCycle` に `CODE-M5-TDD-CURRENCY-REPAIR-001` の `@implements REQ-M5-TDD-CURRENCY-001` と `@design DES-M5-TDD-CURRENCY-001` を追加し、CHANGE implementation phase を記録する。
6. fault のない同一 tree で11件の `tdd green` を記録し、current test fingerprint、異なる source fingerprint、Red より後の monotonic order を確認して CHANGE Green phase を記録する。
7. focused/full commands、strict trace、graph gate、changed gate、status を実行し、CHANGE quality phase を全 requirement set で記録する。quality order が Green より後であり、generation の必須 phase が完結したことを確認する。
8. CHANGE を completed にした disposable copy で repository-wide `tdd validate --json` の `valid: true` と `TDD_TEST_STALE: 0` を確認する。control tree では release approval 前まで CHANGE を active に保つ。

### Failure and recovery rules

- focused runner が対象外 test を含む、report が fresh でない、または期待と異なる理由で失敗した場合、その結果を Red として記録しない。
- raw adapter output で対象外の `TEST-*` identity が `skipped` 以外の status を持つ場合、または対象 entry が Red の `failed` / Green の `passed` と一致しない場合は hard stop とする。Vitest の `-t` filter が生成する対象外 `skipped` entry は許容するが、正規化後 report や test ID の部分一致だけで成功扱いしない。
- `tdd red` が evidence を記録できなかった場合は fault を先に復元し、原因を修正して同じ test を再実行する。
- Red 記録後の復元に失敗した場合は implementation/Green phase を開始せず、fault を除去して source diff と focused passing test を確認する。
- `TEST-M5-PARALLEL-REAL-GATE-SUCCESS-001` の fault が fixture creation を妨げた場合、その failure は期待した Red として記録せず、canonical newline assertion まで到達する fault に修正する。
- Green が失敗した場合は product behavior を変更せず、残存 fault、trace annotation、report selection、build freshness を調査する。
- completion simulation または control-tree validation に stale diagnostic が残る場合、migration や validator 緩和を行わず、該当 test の fingerprint と verified evidence order を調査する。
