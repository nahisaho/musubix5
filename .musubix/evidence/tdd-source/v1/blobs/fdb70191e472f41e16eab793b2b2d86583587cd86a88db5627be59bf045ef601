---
schemaVersion: 1
feature: evidence-selector-guards
status: draft
---
# Evidence selector guard requirements

## REQ-M5-WAVE1-EVIDENCE-001: Enforce the root-aware evidence selector boundary
Priority: must
Type: non-functional
Pattern: ubiquitous
Statement: The system shall automatically verify the architecture invariant that first-party evidence consumers use the root-aware `evidenceInputs` selector rather than directly using the path-only selector.
Acceptance: `packages/*/src/**/*.ts`を決定的に走査するauthoritative testはselector実装自身を除く`evidenceInputPaths`参照を0件とし、新規またはrenameされたconsumerもhard-coded file listなしで検出すること。synthetic fixtureへdirect consumerを追加したRedでは違反pathを報告し、修正後のrepository scanは0件となること。recognized sourceとconsumer repositoryの既存Skill inclusion/exclusion契約は不変であり、authoritative test `TEST-M5-WAVE1-EVIDENCE-GUARDS-001`が本要求と`REQ-M5-WAVE1-EVIDENCE-002`を一体で検証すること。

## REQ-M5-WAVE1-EVIDENCE-002: Prove project status becomes stale after a Skill-only edit
Priority: must
Type: functional
Pattern: event-driven
Statement: When only a Skill file in a recognized source repository changes after current passing quality evidence is recorded, the system shall report the gate as stale and not ready through `projectStatus`.
Acceptance: minimal fixtureでcurrent `evidenceInputs` fingerprintを持つpassing quality evidenceを保存すると最初の`projectStatus`はpassを返し、その後`.github/skills/<name>/SKILL.md`だけを変更すると次の`projectStatus`は`gate.status: stale`かつ`gate.ready: false`を返すこと。unrecognized repositoryまたは非`SKILL.md`変更では既存除外契約を維持すること。authoritative test `TEST-M5-WAVE1-EVIDENCE-GUARDS-001`はarchitecture guardへsynthetic direct-consumer violationを与えることで実装前にRedとなり、同じtest内で本要求の既存production call pathもend-to-endで検証すること。
