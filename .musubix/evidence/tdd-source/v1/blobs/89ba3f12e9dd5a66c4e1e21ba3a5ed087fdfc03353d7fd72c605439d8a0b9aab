---
schemaVersion: 1
feature: npm-registry-deadline
status: draft
---
# npm registry deadline requirements

## REQ-M5-WAVE1-PUBLISH-001: Retry registry visibility until the hard deadline
Priority: must
Type: functional
Pattern: event-driven
Statement: When the registry still returns an explicit not-found after immutable npm publication succeeds, the system shall continue bounded queries and backoff until the configured hard deadline rather than stopping at a fixed attempt count.
Acceptance: `.github/workflows/npm-publish.yml`はtested retry policyを直接使用するか、authoritative testがworkflowの実行loopを検証すること。15秒以下のquery timeout、bounded backoff、および240秒のinner registry deadlineを持つdeterministic fixtureで、従来の6回目より後かつ次queryのtimeout budgetを確保できるdeadline前にmatching SRIが可視化される場合は追加queryを実行してsuccessとなり、`published: true`、`registryVisible: true`、`integrityMatched: true`、`manualReconciliationRequired: false`を記録すること。outer watchdogはinner deadlineとquery forced-killを完了できるheadroomを持つこと。deadline到達、invalid SRI、mismatched SRI、またはexplicit E404以外のquery failureはpublicationを再実行せず、既存のpost-side-effect manual reconciliation semanticsでfail-closedとなること。authoritative test `TEST-M5-WAVE1-PUBLISH-DEADLINE-001`が検証すること。
Formal: {"kind":"temporal","trigger":"npm_publication_registry_not_found","response":"registry_integrity_inner_decision","withinMs":240000}
