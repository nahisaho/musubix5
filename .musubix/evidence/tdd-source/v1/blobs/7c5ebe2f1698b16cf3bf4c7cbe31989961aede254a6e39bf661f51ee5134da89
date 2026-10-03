# Migrating from musubix3 to musubix5

## Intentional executable-name change

musubix5 publishes only the `musubix5` executable. It does not publish a
`musubix3` compatibility alias.

This policy was selected by the human for `CHANGE-0002` before requirements
approval. The corresponding ADR and regression tests are required during the
design and implementation phases.

Replace invocations such as:

```sh
npx --no-install musubix3 gate --changed --json
```

with:

```sh
npx --no-install musubix5 gate --changed --json
```

The command names, options, exit-code classes, and compatible JSON fields are
covered by musubix3 v0.1.18 contract tests. Other intentional incompatibilities
must be added to this guide together with an ADR and regression test before
implementation.

## Concurrent TDD ledger writes

CHANGE-0017 adds `TDD_EVIDENCE_LEASE_BUSY` (exit 1) for ordinary and no-active
TDD append-lease timeouts. CHANGE/projection timeouts retain
`CHANGE_PROJECTION_LEASE_BUSY`; expired or replaced handles retain
`LEASE_FENCED`. Candidate TDD retains its candidate lease/journal/ownership
diagnostics. All ledger writers reload and merge within short ordered
critical sections; configured runners do not hold shared leases. No evidence
format migration, historical rehash, or new TDD credit is implied.

Lease renewal keeps the 30-second TTL but never reduces the currently
authorized owner's expiry when the wall clock moves backward. Concurrent
renewals for the same owner are serialized; expired, replaced, or fenced
owners cannot supply an expiry floor or authorize a write.

## Explicit test-source supersession

The additive `tdd source-supersession prepare|approve|record|resume|replay`
family implements ADR-0036 under REQ-M5-LIFECYCLE-006 and REQ-M5-COMPAT-013.
Every invocation names `--change`, positive `--generation`, and
`--operation-id`; preparation additionally confirms the exact test, cycle,
terminal kind/order/payload hash, old fingerprint, requirement, and runner.
Use `tdd validate --json` or `status --json` for `sourceTerminalSelectors`.
Parent and child `--help` list the closed option sets; no force or waiver
mode exists.

Repository blob publication and admission verify effective Git attributes
with argv-based `git check-attr`: blob paths must have `text: unset` (`-text`).
Raw paths have no active filter; exact oversized paths admit only verified
standard Git LFS. Both require explicit eol, working-tree encoding and ident
resets. Rejected
attributes fail closed with `TDD_SOURCE_ADMISSION_INVALID` /
`snapshot-unverifiable`; Git execution failures, including non-Git roots,
use `TDD_SOURCE_IO_FAILED` / `execute`. Keep the `-text` rule in committed
`.gitattributes`. Low-level isolated archive storage still verifies raw
content hashes; it does not itself constitute repository admission.

## Git LFS source distribution (ADR-0039)

Source evidence keeps its logical SHA-256 filename and identity. New logical
files below **100,000,000 decimal bytes** remain raw. Files at or above that
threshold, through **1,073,741,824 bytes**, require canonical three-line Git
LFS v1 pointers in Git and complete verified logical objects in LFS. Declare
each measured oversized digest explicitly in `.gitattributes`; publication
does not silently edit attributes or stage files. Git LFS **3.4.1 or newer**
and its standard filter configuration are required. Local installation uses
`git lfs install --local --skip-repo`, preserving existing hooks.

`readSourceBlobStream` resolves the immutable commit or current index entry,
not pointer-looking raw input. It independently verifies cache and hydrated
size, digest and mode. `readSourceBlob` is the bounded Buffer adapter; legacy
raw local evidence remains readable. Executable materialization streams to
a verified, fsynced temporary and atomically publishes the recorded mode.
Raw Git readers and candidate manifests still bind pointer Git bytes/OIDs.
Manifest evidence ownership uses the first nonempty `changeId` in the top-level
record, `metadata`, then `result`; foreign-change result envelopes remain
excluded. Hydrated worktree bytes never replace immutable pointer hashes.

Compatible workflow sanitization removes unrelated pointer payloads without
inventing a session identity or terminal proof. Invalid UTF-8/JSON uses
`WORKFLOW_SANITIZE_INVALID`; byte/line/event bounds use
`WORKFLOW_TRANSCRIPT_SIZE`. Failed sanitization preserves the prior output and
workflow evidence, and does not relax the configured transcript policy.

Source verification reuses immutable Git object bindings only within one read
session, while rechecking the complete index/attribute frame and hashing logical
bytes at the closing fence. Raw ancestor admission is scoped and rechecked;
individual file identity, mode, size and digest checks remain mandatory. Small
verified raw buffers use a 32 MiB session cache with an 8 MiB per-blob limit,
stat-identity invalidation and defensive copies.

Snapshot capture bounds active file reads/publications to 32 and deduplicates
identical content within that capture. Directory flush cohorts contain at most
64 already-published links/renames; every caller still waits for its covering
directory fsync. No completed metadata result or durability acknowledgment is
reused across operations. These optimizations do not change logical limits,
test selection, configured timeouts or transcript policy.

Candidate preparation scans the complete reachable Git closure, rejecting
current-tree and historical raw blobs at the threshold. Historical source
pointers are inventoried separately in bounded disk-backed runs. Local media
verification is **not remote availability proof**: independently fetch into
an initially empty repository/cache after separately authorized LFS upload
and before Git ref publication. The workflows fetch the exact commit closure,
hydrate, and independently verify logical bytes before dependency installation
and trust; candidate QA repeats verification after its gate.

`planSourceLfsMigration` only freezes a scoped import plan; it does not migrate,
upload, adopt or create a snapshot. Receipt/map verification never grants TDD
or lifecycle credit. Planning requires a standalone non-bare repository:
linked worktrees sharing a Git common directory reject with
`TDD_SOURCE_LFS_MIGRATION_CONFLICT: raw-object-binding`, without changing HEAD
or refs. Actual integration must preserve published protected refs,
normal ancestry and immutable journal/TDD/approval bytes, retain the original
local history and verified commit map, and pin verified migrated output before
same-actor tombstone/adoption and ordinary clean-HEAD snapshot creation.
Do not use `--everything`, `--no-rewrite`, force-push, or backup/raw refs in a
published closure. Renew all candidate-bound evidence after migration.

Exit-1 diagnostics expose only safe identities, never credentials, endpoints,
object contents or subprocess stderr:

| Code | Closed causes |
| --- | --- |
| `TDD_SOURCE_LFS_UNAVAILABLE` | `tool-missing`, `version-unsupported`, `authentication`, `quota`, `network`, `remote-object-missing` |
| `TDD_SOURCE_LFS_INVALID` | `pointer-schema`, `pointer-path-digest`, `pointer-size`, `logical-size`, `logical-digest`, `mode`, `attributes`, `cache-integrity`, `worktree-integrity`, `download-integrity` |
| `TDD_SOURCE_LFS_MIGRATION_CONFLICT` | `raw-object-binding`, `source-ref-drift`, `protected-ref-overlap`, `commit-map-divergence`, `receipt-divergence`, `actor-mismatch` |
| `TDD_SOURCE_LFS_MIGRATION_PENDING` | `migration-incomplete`, `adoption-incomplete`, `tombstone-incomplete`, `snapshot-incomplete` |

Git ref/incomplete-scan/current-tree/history failures use respectively
`CANDIDATE_GIT_REF_INVALID`, `CANDIDATE_GIT_OBJECT_SCAN_FAILED`,
`CANDIDATE_GIT_TREE_OVERSIZE`, and `CANDIDATE_GIT_HISTORY_OVERSIZE`.
Attribute admission/query failures retain their existing source classes;
raw hash failure remains `TDD_SOURCE_APPROVAL_INVALID` / `blob-hash`.
Production rejects local/loopback origins, endpoint overrides and custom
transfers. Credential-free fixture admission exists only through explicit
dependency injection, never a configuration or environment bypass.

`prepare --mode test-only --old-block FILE --hunk-review FILE --reason TEXT`
validates the historical canonical block and exact reviewed hunks, then runs
both block variants independently on one current declared input snapshot.
It is not historical execution replay. Behavior changes instead use
`--mode behavior-change --replacement-cycle ID` with an independent genuine
Red/Green cycle. Never manufacture a Red for an already-passing clock change.

Preparation returns `artifactPath` and `artifactSha256`. Dedicated
exact-hash human approval is mandatory:
`approve --artifact-sha256 HASH --approver NAME --confirm`.
Requirements/design approval does not substitute for this approval.
Approval returns `approvalPath` and `approvalSha256`; only
`record --artifact-sha256 HASH --approval-sha256 HASH` admits the operation.
The versioned immutable files live below
`.musubix/evidence/tdd-source/v1/CHANGE-ID/gGENERATION/OPERATION-ID/`.
Review, approval, reports and content-addressed blobs are source-input neutral.

Recording is journal-first: journal, evidence order, then one atomic
`tdd.json` update containing both the source chain entry and
`sourceSupersessions`. A pending operation requires explicit
`resume --request-sha256 HASH`; `replay --request-sha256 HASH` only reads a
completed exact match. All three completed results are identical, with no
invocation-local replay flag. Resume uses sealed admission without rerunning
tests or rebinding mutable source/general approvals. It still requires the
current explicit generation and valid archived review/approval references.

Source completion changes source currency and the relevant completed TDD
digest, not coverage, batch Green, or quality credit. Refresh ordinary quality
evidence after current batch validation. Migrate remains legacy-only;
Refactor still requires the original Red fingerprint. Generation-4 order
3274 remains immutable, historical and non-credit. Pending operations block
only their exact test scope or explicit endpoints; corruption fails closed
globally. Gate/status expose `sourceSupersessions` and quoted recovery
arguments; status remains read-only and reports `ready: false` when blocked.
Usage errors exit 2 as `CLI_ERROR`; source domain errors exit 1; operational
errors exit 2 as `TDD_SOURCE_IO_FAILED`. Never edit projections to clear them.

## Generation-9 r29 online recovery operator interface (design only)

R29 keeps this root Copilot session alive. Do not run `/exit`, do not restart
the r28 guardian/offline observer, and do not copy or rebind a private runtime.
All r27/r28 outputs remain read-only history.

Before presentation, seal the allowed writer role/capability classes and
pre-create/fsync the design-specified fence inode in the session-owned G29 root,
outside repository authority. Pin and hash the existing host Node, native CLI,
Git, shell/loader and dry-run-observed exec closure together with exact argv,
cwd and closed environment. No r28 runtime-copy or diagnostic-cap admission
applies to this online binding.

After zero-finding review, show the user every exact design artifact path and
hash, the prepared manifest hash, writer-policy hash, runtime binding hash,
prepared fence identity, exact native command, residual risks and the fact that
intent sealing permanently consumes the only recovery invocation. Accept only
the next explicit ordinary root user message; do not use historical consent,
forwarded agent/tool text or an `ask_user` result.

After consent, obtain the concrete inventory of every process/principal that
can mutate the control worktree or its Git authority. Each must be gone or
have a controller-verifiable paused-no-write acknowledgement with no queued
repository operation and no writable repository descriptor. The live
transcript may continue only because it is outside repository authority; any
transcript process that also has repository mutation capability must pause
that capability. An unknown class or undeclared new writer stops before
intent. Launch the exact attached long-lived `flock` holder against the
prepared G29 inode, verify contention, and bind its PID/startTicks/bootId.

While writers are paused and the fence is held:

1. Run complete read-only SearchRecheck and full text approval validation.
2. Require current requirements `approved` and design `stale`.
3. Seal the exact online intent; this permanently consumes the allowance even
   if child spawn is never observed.
4. Invoke one native `approval record design` child; the root and wrappers must
   not author approval bytes.
5. Capture actual wait status and bounded stdout/stderr.
6. Recheck the runtime, fence, SearchRecheck and native approval state. Outside
   `.musubix/evidence/approvals/design.json`, every repository authority byte
   must be identical during Epoch A; the atomic staging file must be absent.

Success requires exit0, one exact design approval matching the prepared
manifest, requirements/design both `approved`, and no unauthorized authority
change. Nonzero, signal, timeout, lost wait, absent outcome or ambiguous state
enters terminal `consumed-no-reinvoke`: preserve all evidence, do not invoke
again, and do not continue to P or D1. After verified success, seal the r29
gap/history/authority result, terminate the Epoch-A holder by specific PID,
capture its wait, verify lock reacquisition, seal the separate Epoch-A release
record and keep writers paused. Epoch B cannot start without that release
record, and no commit or HEAD change is permitted between epochs.

For P, start a separate Epoch B: recollect and pause the concrete writers,
reacquire the same fence inode and run a fresh SearchRecheck against the exact
current approval and RecoveryAuthority29, requiring exact controlHead equality.
Here `controlHead` is the full Git HEAD object ID; SearchRecheck separately
binds the worktree and approval bytes.
Before writing P, seal the exact Epoch-B expected-delta allowlist against the
Epoch-A post-state. It must enumerate every final P-tree, registry/index and
claim path and expected hash, preseal every timestamp/sequence/nonce/identity,
name each existing atomic publication and exact transient pattern, require all
transients absent in the final state, and reject every other repository
change.
Reuse authorityKey
`9dc882e33a5b453757c4b3a5ca16593aac43fc8375cde648c74e8e50553c482b`
and pId `fe27129bcb82de2245c321e2a8af1e01704a87101fb6013e497881b4c77cd690`
only as immutable allocation identity. GapPRegistry.authority must reference
RecoveryAuthority29. Publish the unchanged PreparationReservation-v4/table/
genesis/seal mechanism and verify P wholly unclaimed. While the Epoch-B fence
is still held, reverify the bridge/P bytes, current approval and controlHead,
then append the sole claim and verify the exact Epoch-B delta. Seal the
release intent before terminating the holder. A durable claim requires fsync,
absence of transients, an independent exact-hash reread and the sole
registry/index edge. Immediately before the claim write, fsync
`ClaimDispatch29` in G29 with the presealed claim hash, target and publication.
If this record exists, or any claim/transient path exists without it, abort is
unavailable. The no-record/present-path case is ambiguous. If the controller
restarts after claim dispatch, inspect
all declared claim/transient paths under the same fence and classify the claim
as verified, present-unverified or ambiguous. Seal a release-only intent in
all three cases; a null claim after dispatch is ambiguous and only verified
may continue recovery. The intent permits only
idempotent holder-release observation and Epoch-B release-record sealing; it
never permits another approval, P write or claim.

If a terminal state occurs before claim dispatch, prove every claim/transient
path absent under the fence, then seal a no-authority/no-credit abort-release
record. The between-epochs abort may have no holder but still requires paused
inventory and claim-absence SearchRecheck. Abort is invalid after dispatch or
if any claim/transient path may exist.

On verified success, keep repository mutation entries disabled after the
Epoch-B release record, complete RecoveryAdmission-v6 and durable D1, then
resume writers and seal the separate writer-resume record. For abort,
present-unverified or ambiguous claim disposition, resume after the applicable
release record and never continue to v6. Preserve all partial bytes and never
reinvoke approval, rewrite P or append another claim.

## Generation-9 r28 offline operator interface (historical; do not execute)

<!-- G9-R28-SYNC-BEGIN -->
R28 historically replaced only the undefined r27 fence/writer/executor interface and its
private policy/consent/typed admission bindings. DES-M5-015 G9-R28-OFFLINE
is superseded by G9-R29-ONLINE; r27 core incident/raw custody/one record/P/preparation rules stay
conjunctive. Old consent/policy/operator paths are not current alternatives.
Requirements bytes/approval, six IDs, D0/order3821 and all main caps remain.
R27 attempt2 actual presentation a3a1cedc-d700-4c8a-9b73-fea54b62fc6e and
consent ebcbc2aa-b62c-448c-aa7d-45552737313a are immutable history, NOT r28
approval. New review/full manifest+source+inventory presentation/fresh
APPROVE-R28-FORWARD-ONCE consent is required; policy has no future hash cycle.

G/.git-relative common-root musubix5/g9-recovery-v1/fence/<gapKey> holds the
stable owned lock inode and atomic state/state.pending index. Exact C/S/G
locations, closed schemas, no-follow/owner checks and command shapes are
normative in design. Exclusive nonblocking flock, durable monotonic counter,
actual PID/startTicks/bootId, serialized 10-second renewal and recorded release
are separate from native CHANGE/projection leases. Live lock cannot expire
or be stolen; partial/unknown index or dispatched record stops without retry.

Closed writer inventory covers root/child transcripts, database/WAL,
scheduler, background/control writers and planned launcher/supervisor.
Requests are not acks: each actual identity must be exited/stopped or the
design's owned-no-write participant. Missing controller/unknown actor stops;
Schedule #3 alone is not all writers. Root seals both launch copies then
exits/suspends; the hash-bound supervisor survives with explicit human
authorization. Session-only executable prototype/audit/spikes are now supplied, size/mode/
runtime bound. They reject product roots and emit only fixture surrogates.
Actual CLI shutdown/flush and all-writer completeness remain blockers.

Same supervisor PID owns fence -> quiescence -> full two-root SearchRecheck
-> present-time r23/r26 custody -> guard/one intent -> one real native record
-> raw outcome/current custody/validation -> versioned gap/history/authority
-> deterministic P seal -> authority-sealed-P-unclaimed result/normal release.
Root and foreign writers remain stopped until this PREFIX result/release.
Resumed root verifies RootHandoff28/original bytes/wait/unclaimed P, then
owns one claim/source/tooling/fixtures/build/final P/W/v5/D1. Offline script
neither authors nor audits those stages; no native intent/owner transfer.
During
search no dialogue, agent forward, native command or C/S output; complete
before/after enumeration and all-row stability, including events/database,
must agree. Observations/renewal stay outside both roots; report publishes
only after the observed end. Prefix copying is never complete search.

Launcher ready/seal pipes bind actual process and final launch hash without
future argv/hash cycles. Stdin is /dev/null; bounded native-raw stdio and
actual wait status are retained. Exit0 needs the sealed unclaimed prefix;
exit1 is safe-stop, never preparation/D1 credit.
An owned launcher wait-monitor observes actual supervisor waitpid; it has
no fence/intent authority, writes only its declared native-raw wait slot
after return, and adds no setup file. No result status substitutes for wait.
exit2 prelaunch/input failure; lost/signal/absent outcome is unknown. Intent
owner cannot transfer, old intent cannot invoke again. Root resumes only to
rehash original result/raw objects, never to infer success or execute replay.
Sealed r28 launch cannot be reassigned after owner loss: no same-consent
process relaunch, even before intent. Preserve complete custody read-only;
new reviewed revision/fresh consent is required, with zero invocation only
when complete intent/registry absence is proved. This closes immutable paths.

Gap-setup stays786432 bytes/64 files: base524288/32 + forward262144/32.
Explicit28 physical forward files reserve249856 bytes; remaining12288/4 is
bounded retry/terminal reserve, not free copies or a new owner. Keep every
raw/search/custody owner cap. P266/W102 and combined534118400 <536870912,
unwritable margin2752512, one permanent gapKey and 42-path closure remain.
Current schema/model/primitive command spikes are non-authority only; actual
executable prototype command/survival/full-search spikes are archived.
Human actor is explicit: actual /exit or proved suspend/flush request;
120000ms human-exit,30000ms ack,10000ms fence deadlines stop before intent
with approvalInvocations=0. Shutdown/final events/DB flush precede epoch.
Binding hash in fresh consent covers source/interpreter/runtime/audit/spikes.
Runtime metadata<=65536/1 existing native-raw; originals<=33554432/256
count in I-source, not free or duplicated inline setup metadata.
Real authenticated CLI exit/suspend/flush and all shared DB/scheduler/
background controllers remain unproved: NOT review-ready/presentable.
External diagnostic-only probe at G/.git/musubix5/design-evidence/
CHANGE-0017/g9/r28-shutdown-probe is outside C/S/recovery fence; no SDK/
SQLite write/approval/custody/P; historical r3/r4 had no current-root target. Fresh hash-named
input runs bind source/interpreter/PID/startTicks/bootId/session/task; fsync
ready/observations/stdio/result, unknown/timeout blocked, zero invocations.
Separate design-only16777216/128 cap plus retained33554432/512 yields
50331648/640, not enlarged P/W/setup; original runtime union is charged.
Historical r3 detached fixture passed, but CLI help/workspace readiness
failed within75000ms. Observer-ready and `/exit` were not reached; cleanup
SIGTERM/return0 is not natural exit. First failure safe-stop, raw retained,
reviewReady=false. Group/known-descendant absence is not escaping-producer,
DB-flush/shared-writer/scheduler completeness or Copilot-parent-survival proof.
Explicit r4 continuation diagnosed a help-modal false-negative, not auth
failure: signed-in/workspace/model evidence exists; local taskId is null.
Fresh forkpty36x120/--screen-reader/--no-color, ordinary HOME/XDG, child-only
agent-env removal, empty owned /tmp cwd; no credentials/config copies.
Composite alive+log+workspace id/cwd+post-request GLOBAL/INPUT help response,
ESC/prompt close, observer-ready hash, then /exit passed with natural
CLI0/observer wait0 and known-target/group absence; no SIGTERM success.
Plan3698991b19a9ebd112204d335cc7fb5716dd124fe61fb9f41632ab8f53afacd3;
observer inputdae463c04f61b3b69515c4a993ef43c7f6ec4dbfa58325e21ce1fd24f6d83065.
Retain both previous failures/raw/source mappings, fresh paths and owners.
No current-root exit/SDK-parent survival, DB flush, escaping-producer or
all-shared-writer/API proof; no retroactive pass or invented task/session
evidence. Existing design-only caps apply to all target/scratch outputs.
reviewReady=false; this scoped disposable pass is not recovery authority.
Stop before Claude review, approval prepare/record, implementation/P/tooling/
D1/HOST/runtime/Red/Green and workflow completion.
Actual current-root diagnostic failure and minimal retry contract:
Bundle ddcd44480ffb320980b0772f22ec6510586a85677e4aba843b11ebbafcf4ed8f
completed safely with status=blocked, reason=root-exit-timeout; original result
SHA e9db6e6fe48aa84fe1e896d187111bd2be2964a7d4077a720e0c27ccfccc9210.
The root PID51841/startTicks1856377/boot2d7fa8a9-b68d-4e61-9b66-258c90723ca9
did NOT exit within120000ms. targetExitAndKnownGroupAbsent=false,
firstAbsenceMonotonicNs=null, finalObservedFiles=null; actual ready existed,
but readiness and safe observer termination are NOT root shutdown.
logicalFlushProved=false; schedulerBackgroundCompleteness=false;
escapingProducerCompleteness=false; approvalInvocations=0; recoveryAllowed=false.
Preserve original seven holder rows, including root51841 and external
shared DB/WAL holders65735,171853,724752,817574 and VS Code166961,829102.
Do not stop, kill, close, exempt or claim acknowledgement from these holders.
Preserve unknownConditions verbatim: logical-flush-not-proved;
scheduler/background-root-capabilities-not-proved;
escaping/other-UID/remote-producers-not-exhaustively-proved.
The old bundle-index is an inert preparation snapshot, NOT current launch/
ready state. Retain all original bytes; no timeout-to-pass reinterpretation.
Retry requires a new fresh content-addressed bundle after agent/tools return,
with fresh nonce, root identity/group/session, source/interpreter, control/
scheduler/holder inventories and input hashes; snapshot age<=30000ms.
Launch the external diagnostic observer and verify actual observer-ready
original bytes against expected-ready and exact input/source/target bindings.
Only then the user must execute the literal slash command `/exit` and press
Enter in the Copilot CLI, not shell commands or task bullets. Do not resume
or submit agent/tools while waiting; wait for observer completion, then verify
its original bound result and stopped identity before resuming. Exit deadline
remains120000ms, settle deadline30000ms; timeout/unknown stays blocked and
requires another fresh bundle. No new bundle/observer is launched here.
reviewReady=false; requirements/approval unchanged. This procedure is diagnostic
only, not recovery fence/custody/authority/P/tooling/D1 or workflow completion.
<!-- G9-R28-SYNC-END -->

## Generation-9 r28 diagnostic archive operator contract (unapproved)

<!-- G9-R28-FULL-SYNC-BEGIN -->
<!-- G9-R28-B2-SYNC-BEGIN -->
**r28 B2 alternatives are diagnostic-only; no cap/owner change.** Original
read-only Node/git/library bytes and identities remain fully charged; metadata
alone is never admission. Startup ELF union11/135763704 and Node124836408
exceed runtime33554432. Sizing floor134443657/2155 is not execution;
gap/native-raw margins60591479/30925901 cannot hold the host union;
P/W2752512 is unwritable. Hypothetical host150994944 + other144572416 +
documents46268416 + gap195035136 = total536870912, but reduces the original
other-source allowance by150994944, lacks complete future-floor inventory,
and does not authorize bypassing the independent runtime cap.
Candidate B's exact PATH=/usr/bin/Git-config sanitized environment produces
real native results but is not current SupervisorBinding28; source still
invokes bare git and has no absolute-git environment override. C's unchanged
native writer API has fixture semantic/hash equivalence, not full CLI/validation
equivalence; validationContext=null bypass is forbidden. NVM Node/bun are
oversized and unsupported/unspiked. Pin/recheck original path/dev/inode/
mode/UID/GID/SHA/ELF closure at every mutation boundary and return; pre/post
fixture stability is not continuous host immutability. Dynamic closure and
host mutation exclusion remain unproved. B2/reviewReady stay blocked/false.
No actual consent/migration/observer/approval/P/D1 or workflow completion.
Measured B catalog169/146903507 and C subset141/141564684 remain oversized.
B native record/validate exits0/1; C native writer/stage validator exits0.
Latest full-check evidence append safe-stopped at retained512/33554432;
historical5761 is not current B2 verification. Pending isolated fixture bytes
remain hash-inventoried; no deletion, cap change or owner transfer is authorized.
<!-- G9-R28-B2-SYNC-END -->
Sole current r28 ordering is design.md G9-R28-FULL-CORRECTION:
reviewed immutable manifest/policy/exact paths+hashes/review verdict+index/
residuals -> full presentation -> fresh original ROOT FeasibilityConsent28
-> diagnostic-only non-credit migration and retired receipt -> same consent
observer -> verified raw outcomes -> docs/indexes reconciliation. Manifest
drift requires review/new consent; unchanged manifest permits HUMAN design
presentation -> fresh r28 Consent28/RestartConsent -> offline ONE native
record -> v5 RecoveryAuthority28/P-unclaimed -> verified RootHandoff28 ->
separately approved root suffix. No feasibility authority/P/Red/source credit
or permanent native-invocation consumption. Native current design approval
is NOT prerequisite for feasibility; current requirements approval and every
original reviewed/consented hash are checked at EACH mutation boundary.
No real feasibility consent, migration, observer or native approval here.
No npx/npm/PATH/network fetching in current r28 command shapes; exact original
/usr/bin/node + C/dist/packages/cli/src/main.js, cwd C, sanitized fixed env
and complete package/dist/native writer/ELF closure in SupervisorBinding28/
RuntimeInventory28. Executable INCLUDED in unchanged256/33554432 runtime cap.
Installed Node v22.23.2 alone124836408 bytes: native admission BLOCKED.
Measured static/ELF catalog166/142098931, dynamic closure not proved.
Strict empty-PATH control validation exits2: spawn git ENOENT. No workaround
PATH population or fake current native predicate; B2 remains blocked.
Isolated copied-approval native parser/writer spike is NON-AUTHORITY and
cannot waive that cap or certify production closure/readiness.
Epoch writer set is exactly writes/capability under C OR COMPLETE S plus
planned launcher/supervisor. Home/VSCode global shared DB holders outside
C/S are informational, never epoch ack/exempt/kill targets. Preserve old
holder bytes/unknownConditions. Root C/S descriptors and complete S producer
absence remain mandatory. C/S holders need exact PID/startTicks/bootId
presentation, human normal owning CLI/editor closure and independent thread/
descendant/fd identity-gone ack; controller-less holder ineligible.
Fresh root schedule list0/running agents0/active shells0 AND post-exit absence
are required; no shell echo or graceful-return proxy.
Feasibility maximumAttempts=2, monotonic/no reset. Zero-invocation timeout
retry needs fresh full presentation/new ROOT consent/new hash path/input;
prior safe-stop remains original. At102 files, one14-file attempt gives116;
second7+10 reserve133 BLOCKED. Conditional second-slot <=1MiB timeout archive
and single retry-1.json<=16384 (shared pending/5-control-file cap), full
reference/consumer audit and exact retirement yield104+17=121. Oversized/
unsealed/unknown/conflicting data or any cap refuses retry with0 new files.
Original ddcd timeout and legacy Base64 stay live. All later r27/v4 headings,
tables and operator chains are HISTORICAL only; current chain is r28/v5.
verify-result checks original result bytes/hash, actual wait/code/signal,
supervisor identity, immutable fence release and closed epoch END/acks/
enumeration plus authority/P-unclaimed edges; never reinvoke on conflict.
Requirements/approval/caps/D0/order3821/gapKey/pre-D1 prohibitions unchanged.
Full re-review/feasibility readiness FALSE while native runtime exceeds cap.
<!-- G9-R28-FULL-SYNC-END -->

<!-- G9-R28-ARCHIVE-SYNC-BEGIN -->
DES-M5-015 G9-R28-DIAGNOSTIC-ARCHIVE is the sole closed archive contract.
Requirements statement/acceptance/approval and D0/order3821/P/W are unchanged.
Current D120 files/3261900 bytes is bound by inventory SHA
5e5598d45569ae13fca49b7700ea84ff82816cff358649fd40041d6e8780c8ec.
One r28-diagnostic-retention owner keeps128/16777216 TOTAL, including all
source+dest/pending/metadata/output overlap: live121/14483456,
archive2/2097152, migration-control5/196608; no additional/free owner.
Only D/archives-v1/<archiveSha>.json and .<planSha>.pending, and
D/migrations-v1/<planSha>/{plan.json,index.json,verified.json,retired.json,
.pending}. Metadata limits65536/32768/16384/16384 plus one65536 pending.
No-replace canonical ASCII JSON/LF sorted keys and member paths, uid/gid/
mtime0, original mode292, kind regular, raw SHA/size/padded Base64; no tar,
compression, extraction, symlink/hardlink members or unknown fields.
Fsync and renameat2(RENAME_NOREPLACE), same-plan exact-byte replay only.
Complete owned pending0600/0444 replays fsync/fchmod0444/fsync/rename;
owned partial0600 must equal the expected canonical exact prefix, reserve
the full length, reopen O_RDWR/no-follow, append suffix THEN truncate to
expected length/fsync/fchmod/fsync/rename. Never unlink or repair foreign/
non-prefix pending. Apply to container and all four metadata phases; shared
pending is checked against the next missing eligible phase. Mkdir crashes
revalidate/recreate only declared directories, then fsync bottom-up through
plan/migrations/archives/D/D-parent before any seal. Newly created directories
are opened via no-follow directory FD, identity checked, fchmod0755 despite
umask077, then directory/parent fsynced bottom-up. Never chmod existing
foreign/mode-mismatched directories. The only pre-chmod replay exception is
same-plan declared exact0700 path, no-symlink lstat, owner uid, plan/prestate
device/inode and parent binding, authenticated original creation receipt,
and empty/no child pending. Open O_DIRECTORY|O_NOFOLLOW, recheck identity,
emptiness and parent/path, reread authorization, fchmod0755 and fsync
dir+parent bottom-up; every path/mode/uid/dev/ino/content conflict blocks.
Receipt absence/drift blocks. Receipt canonical bytes bind plan/absent
prestate/root/parent/created identities and owner authorization hashes;
surviving admitted supervisor durably captures them in the EXISTING bounded
caller evidence ledger before the pre-chmod crash boundary. No new D file,
storage owner or cap: retained ledger512/33554432, D128/16777216 unchanged.
Real receipt transport/authentication/durability must be supplied/audited;
fixture capture is not production implementation or ownership by hash alone.
Exact-prefix guarantees and fixtures concern PROCESS crashes only. Power
loss/fs reordering can leave zero tails/non-prefix bytes: preserve, charge,
safe-stop, no speculative repair and no power-loss proof.
Diagnostic directory-FD flock serializes ALL admitted D writers; it is NOT
the recovery fence or DB/root quiescence. Unknown legacy writers stop.
Select ALL8 files of183d0fe38aef53d8859ac504ac206ee854a1998f9d1670a41048b5d701dae682,
ALL8 of7f4631aebfb2b31de6ee6b4b82e69cffd5597cda4e4abaa3865ed81c3fa91363,
ALL7 of2e91ddff41c810328b0f89f6aae5ee2af660b3e5aa2f27d43aa360d710182e61.
Their23/541760 originals predict728215-byte container SHA
115f736664279f8f799acaa6e73f20282167b77aec2dc6a3d9ee14729e976d69.
Peak127/4914938; after verified retirement102/<=3579427, freeing18 net
file slots. Fresh prefix7/<=1048576 plus10/10485760 output/partial reserve
yields119/<=15113763. Capacity/partition/freshness check BEFORE ANY prepare
allocation; failure emits explicit diagnostic, writes zero files.
Seal plan/container/index, verify all member/source bytes and durable
verified receipt BEFORE exact23 approved source unlinks; parent fsync.
Before verified, resolver-audit138 unique logical identities/1493 hash refs
with selected23 paths projected absent. Enumerate69/300 logical-index Ref
hits (299 D logical occurrences plus one drift-file Ref) and23 hash hits at
externalDesignEvidence[45..67]; later added refs also require audit.
Hash-bound consumer registry requires resolver compatibility or current
disabled/absence proof; unknown direct consumers stop. Embed compact report
and its SHA in verified.json<=16384, no extra file. retired.json binds the
actual verified.json raw SHA and same report hash. Real tools revalidate
record raw SHA, native current design approval and artifact hash equal the
plan requiredDesignManifest before every mutation/replay; all-zero hash is
fixtureOnly at the pinned fixture, never real approval. Real plans additionally
bind original requirements and requirements-approval raw hashes. Immediately
before EACH pending create/repair/write/truncate/fchmod, rename, source unlink
and receipt publication, reopen/rehash all three original authorization inputs,
check native current requirements/design predicates and reread after validation.
Guard mkdir/new-directory chmod too; drift after unlink1 prevents unlink2.
An audited real tool must exclude concurrent authorization publication or stop.
Seal retired receipt only after all selected sources absent. Foreign/
non-prefix pending or missing source before verified stops; verified partial
retirement rechecks remaining originals; final replay is read-only.
Logical refs retain original D/path/rawSHA/size/mode and use verified
archive member resolution, never rewrite old raw indexes or extract.
Timed-out ddcd44480ffb320980b0772f22ec6510586a85677e4aba843b11ebbafcf4ed8f
14 files/result e9db6e6fe48aa84fe1e896d187111bd2be2964a7d4077a720e0c27ccfccc9210
remain live/blocked/root-exit-timeout;2e91's7 remain failed partial logical refs.
Existing648415-byte Base64 container7ab55b16c75e12b2148411ecaa6e2a47947031a016a87bedcb96e6de356f93c5
retains16 originals via explicit legacy resolver; no retrospective permission.
Historical root-control SHAe0a4a6311eea6f3e780056293ca306a5fb4c76df2f03a390ca6d7b05908f5b5b
resolves ddcd/control-state; current SHA05a6850a1b99dd795b263305a5fa6dabdb96c30757cb1f2ed758f755481a170c
is DIFFERENT. Preserve both observations and old index raw bytes/drift.
Current root-control bytes equal failed2e91/control-state: failed prepare
overwrote the current path; equal SHA is not equal path identity or success.
Five named fresh caps sum184320, leaving864256, not817152; actual prefix
has two32768-byte sources, so six non-baseline maxima217088 leave831488
for baseline.json. Charge both sources within unchanged1048576/seven files.
plan/archive/verify/migrate/resolve/preflight/spike are diagnostic-only shapes;
design.md G9-R28-ARCHIVE and closed schemas are authoritative, not prototype
patches. Current checkpack mutates ONLY its fixed bounded session fixture;
fixture authorization/drift checks are not production implementation or
certification. productionImplementationSupplied=false; powerLossProved=false.
No actual archive migration without reviewed explicit FeasibilityConsent28;
current native design approval is not the diagnostic gate (FULL correction).
Archive-correction Claude-review readiness is SCOPED, not whole recovery
readiness/Claude review/approval. Current task stops before actual migration,
observer retry, approval prepare/record, recovery/P/tooling/D1/workflow.
<!-- G9-R28-ARCHIVE-SYNC-END -->

## Generation-9 r27 bounded forward approval (historical interface)

<!-- G9-R27-SYNC-BEGIN -->
R27 is design-only, unreviewed/unapproved. DES-M5-015 G9-R27-RESTART is
current for this single branch; retained r26/r25 text is historical where
it assumes live r23 or uses the replaced consent/authority/admission types.
Requirements bytes/approval and all six IDs remain unchanged.

The design's normative supersession table applies everywhere: live r23 ->
pinned r26 raw approval; r25/r26 consent -> fresh RestartConsent; retained
r23 custody -> present-tense Custody27 r23-history/r26-predecessor after
fence/SearchRecheck; old approval-prefix GapLaunchEntry -> RestartLaunchEntry;
v3/old targets -> v4/HistoricalEvidenceGap27/RetainedDesignHistory27/
RecoveryAuthority27; r25 authority/operative policy -> RecoveryAuthority27/
RestartPolicy. Only the post-prefix claim/D1 suffix retains GapLaunchEntry.
Retained conjunctive rules cannot reactivate any superseded operator path.

Pin native-approved/recovery-unapproved r26 raw approval
47992519e1e50caf28121a621178ffc2dbc3beb478c201b979fab0dd6e58c663,
manifest ce1ccb29fc7b44680026af2f2683e016f21e89d9dbc6921f443bc9ad1128f5a8,
approvedAt 2026-09-30T06:45:45.580Z. Original native record offsets
233673332/233675080 precede complete presentation
2f787cc5-e429-4484-9425-6e9510f5dc11 (235473822) and root consent
9c7a9ea2-80bf-4b09-9b36-d17bbbed7173 (235508873).
Those authentic r26 events remain history, not fresh r27 consent.
R23 raw 64f8fd0a1ccc7af6b7c9c67bebb5c3926a12535ff709247592522392a480515a
and all 68 approved artifacts are available; no new raw-content gap.

RestartPolicy H =
4d84679d9ce3db8452d65f485fa536b76f61fdc53e049f962dc7a54578f0488e.
It embeds the unchanged base policy ad6b838223e9d3d8eeb115f2f4218ec7a5a996967244466788a169efcabd2703,
but has no current/future r27 manifest, outcome or own hash.
Permanent gapKey remains 604514880a44924d56a8f0f3177a62540de526f7101b356271be67fc33977af9;
authorityKey is 9dc882e33a5b453757c4b3a5ca16593aac43fc8375cde648c74e8e50553c482b,
pId fe27129bcb82de2245c321e2a8af1e01704a87101fb6013e497881b4c77cd690.
No identity is a published P or authority.

Separate review -> full new native manifest/policy/risk presentation ->
fresh exact root `APPROVE-R27-FORWARD-ONCE manifest=<64hex> policy=<64hex> gapKey=<64hex> approver=<name>`
-> fenced writer quiescence/SearchRecheck -> present-tense r23/r26
Custody27 seals -> guard/one intent -> actual new design approval record ->
raw before/after capture/current custody/exact native validation ->
versioned gap/history/authority -> deterministic P seal -> one claim ->
source/preparation -> final P charge/W/v4 admission -> genuine D1.
The presentation discloses r16 loss, r26 premature ordering, no retroactive
compliance and mandatory permanent release disclosure; it is not release.

The sole approval-attempt domain is restart/<gapKey>/r27 under the recovery
cache. A sealed intent consumes its single invocation even when dispatch
is unknown. Unknown/nonzero return, drift, lost fence, competing/partial
publication or duplicate attempt blocks without re-record. A durable
successful outcome may resume wholly absent current custody or the missing
verification tail against exact retained inputs, NEVER repeat the CLI.
Replay of a completed prefix is read-only. Raw approvedAt values are
retained observations; only ordered actual launch bytes prove chronology.
Custody27 always says provesPriorCustody=false and binds fresh consent.

A crash during pre-intent predecessor custody sealing is an unrecoverable
non-campaign diagnostic for this revision: retain all owned partial bytes,
no invocation consumed without sealed intent, no same-revision retry or
exact-prefix resume. Retry requires a new reviewed revision, full new
presentation and fresh exact consent; permanent-key guards and caps remain.

Only when BOTH predecessor Custody27 seals are complete/verified and all
guard/intent/registry/prefix paths absent, reuse their immutable bytes under
a NEW exclusive fence with the SAME reviewed r27 revision/RestartConsent.
Reverify all inputs/hashes/owners/caps and run fresh SearchRecheck; retain
old observations, never recreate/overwrite custody. RestartGuard's closed
nullable custodyReuse binds the original recheck and actual new owner;
new guard/recheck/registry share the current fence/owner, old fence is audit
only. No invocation consumed before intent; no extra metadata file/cap.
Partial/conflict/unknown still stops unrecoverably under the preceding rule.

Closed r27 schemas and their exact prefix table are normative in design.
RecoveryAdmission-v4 keeps v3's field set but binds only the new typed
gap/history/authority. No old v2/v3 admission or r26 approval supplies it.
All other genuine preparation/fingerprint/native-D1 predicates remain.
No prior authority/P/pending P/claim/source/Red is eligible for this branch;
changing a policy never resets the permanent key.

No higher cap or new top-level owner. r25-custody's 8,388,608 bytes/128 files
jointly cover predecessor r26 and current r27 with verified single physical
objects, not hash-only copy discounts. Gap-setup's 786,432/64 partitions
589,824/48 base plus 196,608/16 forward metadata. Historical and future
human events share 2,097,152/8; future events each <=983,040, response <=512.
Complete custody/ownership, raw overwrite, crash/replay/rejection, schema
and overflow models are mandatory, never execution evidence.
P/W 266/102 slots, maximum 534,118,400 <536,870,912, all existing owner
caps, D0/order3821/70-file archive and 42-path closure remain unchanged.
No requirements edit, native approval record, workflow complete, P,
tooling, runtime/HOST, freeze/Red or D1 is performed by this design task.
<!-- G9-R27-SYNC-END -->

## Generation-9 r22 operator contract (design only)

### R27 operator reservation/stop boundary (r26 rationale retained)

Do not run preparation from r23 or the premature r26 approval. First obtain
new r27 review/full presentation/fresh exact RestartConsent; keep the
current invocation design-only. The current native CLI has no gap waiver
switch: its approval/checkpoint success cannot enforce or bypass the
design-level Custody27, RestartLaunchEntry, claim registry or v4 admission
consumer. Follow the sole R27 order below; the R26 path is historical. Missing
implementation of any guard is a stop, not permission to invoke D1 directly.
The following replaces older operator instructions requiring unavailable
r16 raw approval bytes; those retained sequences are history only.

<!-- G9-R25-SYNC-BEGIN -->
Historical r25/r26 decision basis only; the G9-R27-RESTART supersession
table controls current operator/type/state bindings throughout this block.
R26 corrects the two r25 ownership/replay findings without widening the
exception. R25 wire kinds/revision fields, consent grammar and policy hash
are historical base-policy inputs, not operative r27 consent or authority.
The prior five unreplaced constraints remain.
It supersedes ONLY the impossible r23 requirement to retain/resolve the raw
r16 replacement approval. Expected SHA
58972d59459b6dbad8a9427a1784cc6b527830d75abe1c303078da5e0fabf9dd
(11,080 bytes), reported manifest
89c0b99ced55705dbfc9c050708289e0b46f3d8abb13f1691f6d0a9eb3a29f97:
known historical evidence loss, NOT retained bytes or proof of contents.
R23 was approved as f149ea3d95e6b9af297c8aeba7d933bc21f698645cc6a7b3f31852a4c774482d
and safe-stopped before P/source/tooling/build/fixture/D1/HOST/Red.
Exact safe-stop SHA d256a63bdee457a416c064b848a7b3f4ee21c921e25305c19421f0d08d5815c3;
exhaustive bounded search SHA 8f61daac55c079cdf2194dd2859fea75921d3ce600f837ca8ab9b23bc9c41f3e
hashed 19,493 control and 1,300 complete-session regular files: zero matches
or read-instability/errors. No global absence or reconstructed history.

DES-M5-015's G9-R27-RESTART is the sole normative operator path:
RestartPolicy/RestartConsent/Custody27/RestartLaunchEntry and the new
HistoricalEvidenceGap27/RetainedDesignHistory27/RecoveryAuthority27 typed
targets in RecoveryAdmission-v4. G9-R25-GAP's replaced schemas/v3 remain
historical input only. The gap is NOT the missing approval, cannot prove its
contents, cannot alter D0, cannot stand in for a Ref, and cannot excuse any
other missing artifact. Only new reviewed r27 presentation/fresh exact
RestartConsent starts the fenced prospective path from pinned r26 raw bytes;
old r25/r26 consent and r16/r23 approvals cannot authorize it.
Native requirements remain unchanged/current at 7ac689e4d1073880f023ca42fcb8e63fd355dd6d8704f724c229a3dee8a395ea:
no acceptance, six-ID set, test boundary, CLI or native evidence rule changes.
This records a real preservation failure, not retrospective compliance.

Historical r27 order ONLY, superseded by current r28/v5/RootHandoff28:
design-only checks -> separate zero-finding r27 review -> full new
manifest/policy/risk presentation -> fresh exact RestartConsent ->
fenced quiescence/SearchRecheck and D0/tests/native rechecks -> present-tense
Custody27 r23-history/r26-predecessor -> RestartLaunchEntry guard/intent ->
one new r27 native record -> raw before/after/current custody/validation ->
new r27 gap/history/authority -> seal P with
fixed metadata reservations -> one durable claim bound to that P -> source
authoring/genuine bootstrap/audit/preparation -> P-charge-sealed -> W -> v4
admission -> actual native D1 -> unchanged HOST/diagnostic/feasibility/
freeze/Red. Permanent repository-scoped gapKey, not a replaceable approval
hash, limits this to one campaign/one D1; exact crash replay resumes the
same journal/claim, divergence/drift/another loss stops. No inferred orders.
No workflow complete before review/approval; this revision stops before both.

D0 order 3821 and archive d78d4ca1d2307434170d122f37cc0b8a9d5d34cc31f5817f9b4ab52d209dafac
remain immutable/read-only: 70 files, 68 approved artifact references and
raw ea9c9e07ca7fb7f45eccb289a1ac7c58421bce0c9aceb8804bd570fac2cc9bed
(11,080 bytes) must verify on admission/replay. Preserve available r16
launch/stop bytes, all prior observations, worker and unrelated dirty work.
V3 replaces priorDesignApprovalHistory with historicalEvidenceGap,
recoveryAuthority and retainedDesignHistory; it transitively binds D0 and
the gap without substituting either. Same 42-path closure/list SHA
8d20cbff579b61377acce5efd7a9579333f6713856205762ec4c01bac227196d;
same P/W slots 266/102 and all caps. Existing payload/ObjectEntry custody
owns every raw byte; extra history inputs use I-source, new metadata
P-control, admission W-admission. Actual overflow fails, never expands caps.

R25 pins gapPolicySha256
ad6b838223e9d3d8eeb115f2f4218ec7a5a996967244466788a169efcabd2703
and permanent gapKey
604514880a44924d56a8f0f3177a62540de526f7101b356271be67fc33977af9.
Only exact raw human content
`APPROVE-R25-GAP-ONCE manifest=<64hex> policy=<64hex> gapKey=<64hex> approver=<name>`
is consent: one ASCII line without LF, fixed order/spaces, lowercase hex,
name `[A-Za-z0-9][A-Za-z0-9_.-]{0,63}`. Retain original root-user event
UUID/raw JSONL bytes/offset and prior presentation UUID/raw bytes; reject
agent/schedule/generated events and compare parsed approver to native
argv/approval. Hash literals are outside the policy; no self-cycle.

Post-record approval validate requires requirements/design approved with
exact recorded/current manifests, release stale ONLY, overall valid=false,
exit 1 and signal null, without other errors. This expected scoped result
is not a passing overall approval or release waiver; anything else stops.
availableObservations is exactly the 24 SHA-sorted unique raw objects
derived from the ten pinned inputs, sixteen DIRECT pinned r23-index rows
and five specified r16 outputs/observations, including 8cce6e8c... and
aa797182... . NO transitive Ref/path/hash traversal is allowed.

Explicit I-source slices total 195,035,136 bytes/4,624 files within its
existing 512 MiB cap: full histories/D0, report, ONE report-derived
enumeration, raw consent/provenance/native outputs and BOTH complete
custodies. Realistic floor includes complete pre/post-D1 native copies,
not just Ref metadata. P-control retains 4,194,304 total with gap-setup
786,432 and gap-P-lifecycle 262,144 reserved; base metadata is 2,801,664.
W-abort retains 901,120 with fixed gap-W-lifecycle 262,144 for post-P-charge-seal
stops/D1-intent/D1-observed and base-abort 638,976. Full physical byte/file
sums apply before writes; sealed P/admission never gains future suffix
bytes. Trace/output maximum stays 534,118,400 <536,870,912, separate from
I-source; no extra trace allowance. Seal P FIRST, append one P-bound claim
SECOND, source authoring THIRD, with no optional/reversed ordering.

P-sealed-unclaimed means only the reservation was published. P-charge-sealed
means the FINAL actual PreparationCharge is durably verified after all P
writers stop; these are different states. Gap-P-lifecycle owns ONLY claim,
registry and fence, never stops. Every GapCampaignStop/campaign-stop occurs
after first sealing that final charge and belongs to gap-W-lifecycle,
including early failures. Stop points before normal finalization first seal
all actual retained P bytes, then write W stop; unverifiable accounting
blocks without a fake complete charge/stop. Charge -> stop is acyclic;
P roots never contain stops and W walks resolve P charge as an already
owned immutable input, not another W-owned copy. Exactly one owner per
physical allocation; overlapping/unowned/duplicate roots reject.

P id is H(["CHANGE-0017",9,"preparation-reservation",authorityKey]); its sole
path is campaigns/<gapKey>/p/<pId>/header/P.json under the recovery cache.
GapPRegistry and GapPSeal bind exact current authority/P/table/genesis.
No-replace seal publication is idempotent for byte-identical inputs only.
Crash after seal enters P-sealed-unclaimed: reverify exactly one matching
P and append the claim to THAT P without rewriting/resealing or allocating
another. Second/different/multiple P, unregistered pending bytes, drift or
an existing final charge/stop block. Owned incomplete publication remains
retained/non-authorizing, never orphaned or silently cleaned. Claim replay
reuses the same one-shot P; W suffix lives in a sibling w-gap root.

Release must explicitly disclose the unrecoverable r16 contents, all bound
search/stop/gap/approval/admission/D1 identities and consumed authority, with
human acknowledgment. No disclosure means no release; no other failed or
skipped check is cleared. If review finds a requirements/constitution
conflict or the human rejects the residual risk, remain blocked and seek
separate safe abandonment/new-generation authority, never repair/backfill
history or carry g9 credit into a new generation.
<!-- G9-R25-SYNC-END -->

<!-- G9-R17-SYNC-BEGIN -->
R22/r23's tracer contract is retained subject to r25 above. The reported r16 manifest is
89c0b99ced55705dbfc9c050708289e0b46f3d8abb13f1691f6d0a9eb3a29f97;
its expected, unavailable raw approval SHA is
58972d59459b6dbad8a9427a1784cc6b527830d75abe1c303078da5e0fabf9dd.
Preserve D0/order 3821 and the published r16 D0 archive
d78d4ca1d2307434170d122f37cc0b8a9d5d34cc31f5817f9b4ab52d209dafac.
Requirements stay SHA ede0d7761bdd7cf738c2285dbb4607553b928f6077035f84e684ec8dcbaee199;
no observable behavior/acceptance changes and no requirements reapproval.
DES-M5-015's r22 section (retained G9-R17-CONTRACT anchor) is the single normative implementation interface,
overriding earlier v1 tracer/namespace/build shapes, not r14 write-set semantics.

Order: draft -> separate review/human exact-hash reapproval -> r25 authority
-> seal P with reserved metadata -> unique P-bound claim -> source-authored
(non-credit, not executed) -> parent/executor bootstrap-built ->
audited-prepared -> admission-sealed -> native verified D1 -> existing
HOST/diagnostic/27-shape feasibility/freeze/Red sequence. No stage skipping.
The source author may author the complete deterministic driver without
executing it; the parent owns mount/namespace/build/fixture execution.
Source/spec changes invalidate later evidence; design changes reopen approval.
All five tests, absent runtime and native history remain protected.

Five future authored inputs: tooling/tracer.c, tooling/tracer-bootstrap.py,
tooling/tracer-build-spec.json, tooling/tracer-policy-spec.json,
tooling/tracer-fixtures.json. Their excluded authoring root is
C/.musubix/cache/g9-recovery-v1/source-authoring/<design-manifest-sha256>/.
Only later actual outputs may occupy tooling/tracer and tooling/tracer-build.json;
the latter is NEVER an unbuilt recipe. Future F copies all seven exact bytes.
The ordered closure is 42 files (previous 38 followed by build-spec,
policy-spec, fixtures, bootstrap.py); SHA
8d20cbff579b61377acce5efd7a9579333f6713856205762ec4c01bac227196d.
41 files are 100644, only tooling/tracer is 100755; publish 41 then manifest,
ready-41. Old 38-path hashes remain historical, not current closure authority.

Tracer v2 accepts only the design's fixed argv arrays with --policy,
--catalogue, --audit, --bootstrap-proof-fd 3, --cwd and -- command separator;
fixture-only --fixture/--case cannot grant official authority. No shell parsing.
Canonical closed TracePolicy, source/namespace/process/fd/write/Git/allocator/
seccomp/budget schemas and deterministic diagnostics are authoritative there.
policySha256 excludes only itself. TraceLog/Terminal contain actual ordered
events, child waits, content-addressed chunks, stdout/stderr, completeness,
network/violation/budget counters and source/spec/binary/provenance bindings.
Wrapper exits are 0,20,21,64,65,66,70,71,72,73,74; root status is never rewritten.
Bootstrap's fixed Python -I -B -S argv reads BuildSpec/Request/catalogue, creates
mapped-root user/mount/net views, nested same-host-owner command uid/gid,
private namespace /tmp and /var/tmp, read-only masks and exact writable sets,
then sealed-fd handoff to the tracer's barrier/filter/ptrace custody.
Parent checks host invariance, owned process closure and cleanup.

BuildSpec pins compiler/linker/interpreter/observer identities and exact
GCC compile/ld link argv, names inventory kinds and requires two builds.
SeedPlan records actual raw tool/header/library/Python dependency inputs;
BuildProvenance records the verified inventories and observed build outputs.
No future output hash or execution claim occurs in BuildSpec.
BuildProvenance precedes policy; 22 ordered FixtureDefinitions produce only
actual FixtureResults; independent accepted source/bootstrap/binary audit
is required before TracerBuild publication. Seed compiler observations are
explicitly not tracer evidence. The historical RecoveryAdmission-v2 base binds
sourceSnapshot, buildSpec, policySpec, fixtureDefinitions, bootstrapSource,
buildProvenance, bootstrapEvidence, tracerAudit and priorDesignApprovalHistory.
R25 v3 replaces that last unavailable-history predicate with its required
historicalEvidenceGap/recoveryAuthority/retainedDesignHistory triad.
Its full hash, never a recipe hash, is the existing native operationId.
Preserve all r14 9,398 model cases/Git semantics and r16 archive/recovery cases.
R2/R3 concerns agent execution restrictions, not kernel incapability;
parent capability probes do not satisfy preparation.

R22 fixes exactly the three r21 blockers and direct consistency regressions:
complete physical case-file ownership, normative slot derivation and capped
single-store input custody. Requirements/history remain unchanged.
Schema-derived populated object models are required; synthetic metadata is
NOT a dispatched fixture measurement.
Keep all 9,398 fixture-21 cases in order, but use 37 batches of <=256
(36*256+182), one request/namespace and lossless per-case logs/terminals/
handoffs/actual comparisons each. Other 189 cases stay single: 226 corpus
requests. Fresh case trees/roots, baseline restoration and cumulative
stored/decoded quota checks are mandatory; no per-case quota reset.
P has 266 slots including author, eight seed probes, two fixture-shaped
guards and 24 retries. Slot bytes 261,488,640 + six capped shared owners
25,165,824 =286,654,464; only 524,288 is P-carried.
Shared owners explicitly include case arrays (8 MiB stored/32 MiB expanded
combined), charge ledger (2 MiB including itself), BootstrapEvidence
(2 MiB including entries AND attempts), control/base/table (4 MiB),
build/audit (4 MiB) and census/policy (4 MiB). Failed bytes remain charged.
W has 102*2.25 MiB =240,648,192 slot bytes plus 6,291,456 shared bytes with
capped header/table/post-source contract/census/results/admission/abort
owners. P maximum 287,178,752 +240,648,192 +6,291,456 =534,118,400.
This is 509.375 MiB; the remaining 2,752,512 bytes below 536,870,912 are
unallocated safety margin, NOT an owner, overflow capacity or dispatch grant.
Fixture-batch caps are 4,325,376 (metadata3,407,872/data917,504);
guard caps are 4,456,448 (metadata3,538,944/data917,504, duplicate index included);
light131,072 (metadata98,304/data32,768); heavy/seed/probe2 MiB;
post2.25 MiB (metadata262,144/data2,097,152). Terminal4,096 is inside metadata.
Each case physically retains five WireObjects (descriptor+payload) for
handoff/log/Terminal/actual/comparison, event chunk descriptors, every
registration/stdout/stderr/argv WireStream AND all their chunk descriptors,
their compressed payloads, raw filter <=2,048, and raw summary.json.
No descriptor is implicitly inside a compressed per-case envelope. The
per-case tracer writes log/Terminal, streams/events/filter/summary directly;
bootstrap writes handoff and actual/comparison. Metadata payloads/descriptors,
raw filter/summary and partial writes charge metadata; event/raw-stream
compressed payloads charge data. Supervisor stdout is compared, not retained
as an uncounted duplicate. Multiple execs/chunks grow the same capped owners.
After separate approval/build, actually dispatch env-hop positive and
the full 256-case Git batch36 before corpus admission. Reclassify their
measured complete owners against corpus caps; record all actual bytes.
Neither guard nor campaign has run. Failure stops, not sampled success.
BudgetSpec has the exact DES-M5-015 schema/tables, immutable
preparation/budget-spec.json; P leaf.sourceContractSha256=H(BudgetSpec).
W binds preparation/post-source-contract.json; W leaf uses
H(PostSourceContract). The latter contains declared per-class metadata/
data caps and W owner caps. Independent verifier reconstructs the exact
tables from the normative G9-R22-DERIVATION table, including every entry
field, and recomputes slotsSha256 and Merkle roots (P depth9/W depth7).
P families are author; build[1,2], dist[1,2], npx[1]; seed retries;
probes[1..8]; probe retries; env-hop and Git-batch guards; guard retry;
one original fixture-order segment (batches only at fixture21); light,
heavy, batch retries. Seed ordinal is null, never its build index. Pool
retry ordinal/fixtureId/caseId/batchIndex are null; the failed target is
bound by PreparationRetry, not a mutated leaf. Only primary probes/guards
have ordinal in P. Exact W strings/order: diagnostic:plain:NN:00,
diagnostic:observed:NN:00 (NN=01..12 each), feasibility:NN:00 (01..27),
then official:NN:AA (01..27, interleaved AA=00 then 01 except 13/14/27
have only 00). W ordinal=NN as integer; all W fixture/case/batch fields
null; official retryClass=official iff AA=01, all other W retries=none.
Every maximumBytes comes from its exact derived class; BS/PS hashes and
all null/string rules are fixed by the normative table, not model choices.
Request membership is only header/entry/proof, not whole tables.
Catalogue row files resolve relative to the OWNING catalogue. Immutable
base path is preparation/catalogues/base/<viewSha256>/catalogue.json,
viewSha256=H(the base with base=null); delta remains
preparation/catalogues/<nonce>/catalogue.json. No mutable base, shadowing
or base chains. Raw original inputs have one immutable content-addressed
store at preparation/input-store/objects/<sha>; row.file remains
objects/<sha> relative to its OWNING catalogue, via verified hardlinks.
I-source <=536,870,912 bytes/16,000 canonical files is a subcap of aggregate
2 GiB/60,000 snapshot limits; I-dependency shares existing 2 GiB/100,000
dependency limits. Actual copies across views count again; input/F/inline/
sidecar limits are AND constraints, not extra trace allowance. Current
documents and all 9,587 FixtureDefinitions are size-modeled; the five
authored files keep explicit source/spec caps. Ten specified input maxima
total 46,268,416, not the P-control 2,801,664 base-metadata partition.
Catalogue JSON/identity registry/generated policies/evidence retain P/W
owners even when consumed as inputs. Global device/inode accounting verifies
canonical origin, all aliases, bytes/modes/nlink and sealed custody. Root
commitments include zero-charge alias rows; only verified original input
identities are excluded from P/W totals. No prefix exclusion, hash-only
deduplication, output-to-input laundering, symlink or unknown alias.
Four modeled base views share source inodes but retain charged catalogue
JSON; actual other inventories/views must pass caps. Storage remains
O(K+N log N), where K includes actual base/view/alias rows.
HOST_PROC is driver-held OUTSIDE ProcBindPlan. The shared plan contains
only boot-stable paths/topology/constants; actual boot/source/mount/PID
namespace identities remain request-bound before/after observations.
AUDIT/OBSERVATIONS stay /__g9_audit, never a host output pathname.
Pinned zlib1.3 keeps every byte/decision and existing framing/hash/flush,
1 MiB chunk/64 MiB entire request or batch/8 GiB decoded-program limits.
The retained 58 strace streams' 4,348,937 stored/71,655,205 raw bytes are
log-only evidence, not full tracer/fixture fit. No future success claim.
BootstrapEvidence has 241 logical requests, 241..265 actual attempts;
9,587 corpus case results remain lossless and exclude measurement duplicates.
Requirements remain approved; design approval remains stale. Stop before
review/approval, source authoring, preparation, D1, HOST/runtime, freeze or Red.
<!-- G9-R17-SYNC-END -->

After a separately completed reapproval, the authorized parent executes only
the fixed Python argv in DES-M5-015, with reviewed Request/canonical catalogue;
do not turn a JSON command array or GCC plan into a shell string. The agent
may deliver source bytes without mounting anything. The operator must not
publish tracer-build.json until two builds, 22 real fixtures and actual audit
are complete. Keep observed failure logs; do not substitute this guide, a
parent capability probe or an r14 model result for that evidence.
The historical r15/r16 text below retains archival reasoning; r22 governs
all new source/bootstrap/admission interfaces and current closure.

## Generation-9 recovery contract (r15/r16 historical design interface)

CHANGE-0017/g9 requirements approval is
`7ac689e4d1073880f023ca42fcb8e63fd355dd6d8704f724c229a3dee8a395ea`,
checkpoint **3820**. DES-M5-015 and ADR-0036 now define r15/r16 recovery of initial
design checkpoint **D0=3821**, which is not preflight readiness. Superseding
approval/checkpoint D1, test preparation and runtime implementation remain future
steps. The generation-7/8 procedures retained below are historical only.
Their policy/clock/packaging semantics remain unchanged where the g9 design
explicitly adopts them, but their approvals, v3 recipes and receipts cannot
authorize g9 execution.

First publish/verify the D0 archive below before recording replacement
approval; session-only preservation is insufficient. After exact-hash r16
design approval but BEFORE D1/every later superseding design
checkpoint D, provision/audit the private tools and reproducibly built tracer
in excluded content-addressed storage, then perform the guarded dist inventory/archive/reset and BuildProof
verification, binding the actual pre-D order tip and rechecking it before D.
Keep all five archived tests and absent runtime source/profile fixed. Store
the non-credit hygiene records in excluded preparation storage for later
diagnostic catalogue resolution; this is not an implementation/test edit.
Every g9 design checkpoint must see worker source hash `5591efa0...`.
Only afterward may the exact HOST-BOUNDARY assertion hunk be replaced, yielding
`fd56d9197047a59d6d60152a223f9df3a4b266e461ce13db29aaf427c75b9f25`.
The acquisition and `LeaseAcquisitionTimeout` constructor come from the same
block-local dynamic import; top-level imports and other test bytes stay fixed.
The new assertion checks actual instance identity, code, lease kind/name and
message. Production still throws `LEASE_ACQUISITION_TIMEOUT`, not a remapped
BUSY diagnostic. The source-bound 25ms/400-attempt monotonic budget is verified
against the pinned journal source; the existing 60s test timeout is a watchdog.
Any later pre-Red design revision first restores the archived worker, then
reverifies the retained D0 archive before approval record, then repeats
checkpoint, edit, diagnostics and preparation.

### R15 operator boundary: D0 is history, D1 is preparation-bound

Never delete/backdate D0=3821, record
`429a728050f64472c6fca7f8569711d55e22cc5ff7ef462251b06b07264a3616`.
Preserve blocker `g9-preparation-r1-blocker.json` raw SHA
`5ffdd41889829ce1417a6086d81c4f784350d3b74925ad521e704b1282fa6fca`
and the seven other raw result/finding/index hashes in DES-M5-015's r15 table.
It found missing tools/tracer storage and stale compiled runtime outputs;
no HOST/preparation/feasibility/freeze/Red was executed. All g9 operational
references to D/pre-D/post-D mean D1 or a later admitted supersession.
The old r14 rule requiring hygiene before every initial checkpoint is
superseded, not a claim that 3821 satisfied it.

Requirements remain byte-identical SHA
`ede0d7761bdd7cf738c2285dbb4607553b928f6077035f84e684ec8dcbaee199`.
COMPAT-013 requires diagnostics before Red; LIFECYCLE-006 requires archived
tests at every checkpoint and HOST after the latest checkpoint, and explicitly
supports design revision/reset. Neither requires tooling/dist before the
first checkpoint. No requirements revision/reapproval or stable-ID change
is needed; contrary normative evidence stops for requirements reapproval.

R15 edits invalidate the current design approval. After a separate native
review, use `approval prepare design`, show the exact full manifest/hash and
obtain explicit human approval. R16 inserts a mandatory step BEFORE
`approval record design --approver <human> --artifact-sha256 <reviewed-hash>
--confirm`: publish/seal/verify the D0 archive while live approval is still D0.
RecoveryAdmission.initialDesignApproval:Ref must resolve exact raw SHA
`ea9c9e07ca7fb7f45eccb289a1ac7c58421bce0c9aceb8804bd570fac2cc9bed`
(11,080 bytes), whose parsed/native-recomputed artifactSha256 is
`e0e626f78b37dba5bd09b56e5bd6798b7f8c21602f40a81ff95743d7cb997bd5`,
equal to D0's approvalManifestSha256. RecoveryAdmission.initialDesignArtifacts:Ref
binds DES-M5-015's closed D0ArtifactManifest and all 68 approved byte objects.
Only design.md `bb65622f77c0c374c2f161f4647f9402e183e4724bd9c228127e90ec07af51fd`
and ADR-0036.md `acb759ccd9231e1413cce5569382e79ec9dd1da8a11d53b59cc8d657d45e5397`
differ at r16 inspection; compare every path again and preserve any additional
old approved bytes. Use immutable content-addressed
`.musubix/cache/g9-recovery-v1/initial-design/<H(D0ArtifactManifest)>/`,
never only a session snapshot. Keep writer exclusion across full archive/
live-approval recheck and native record; retain actual verification-before-
record launch observations without manufacturing native orders/timestamps.
Missing/tampered approval/artifact/manifest, mismatched identity, archive after
overwrite or missing ordering evidence stops before reapproval/preparation/D1.
Bind both Refs, the full archive closure and observations through
preparationEvidence and H(RecoveryAdmission); later use the same existing F
payload/ObjectEntry addresses, never the newly overwritten approval as D0.
Only successful guarded approval recording permits the following steps:

1. Non-credit bootstrap: materialize/audit pinned tools/tracer; inventory and
   quarantine the complete old dist; perform the guarded two-clean-build
   reset and complete actual Toolchain/TracePolicy/TracerBuild/BuildProof.
   Do not change HOST, runtime source/scripts/profile or record
   Red/implementation/Green, official ordinals or workflow completion.
2. Verify DES-M5-015's closed RecoveryAdmission, all raw inputs/dependencies,
   current approval/order tip and native fingerprints. Require worker
   `5591efa0440a03a201df78c47b547b61939b118f68ef83e6b88237c24ab0a600`,
   other four archived hashes, six baseline paths, source/scripts/profile
   absence and complete compiled runtime absence. Require exact 42-path/mode
   manifest digest `8d20cbff579b61377acce5efd7a9579333f6713856205762ec4c01bac227196d`.
   It binds future closure paths, NOT uncreated HOST/diagnostic/F/M content.
3. Use the full 64-hex H(RecoveryAdmission) as `--operation-id` on
   `change-record CHANGE-0017 design`, with all six CHANGE requirement IDs.
   Require actual ordinal-2 g9:design:2, D0 retained in designHistory, exact
   approval/fingerprints and independently verified admission. No numeric
   order prediction, manual projection edit, or native CLI claim that it
   understands the admission hash. The designed executor resolves it from
   the existing diagnostic object catalogue; no 39th freeze file is added.
4. Only admitted D1 enables HOST, then full scratch diagnostic/fingerprint/
   feasibility checks, immutable freeze/replay and genuine Red as designed.

Any preparation mismatch stops before D1. Writer exclusion and post-append
prefix verification are mandatory; concurrent drift preserves failed D1
history and blocks HOST. Later pre-Red design edits restore archived worker
first, reverify the retained D0 archive before approval record, and repeat
review/approval/preparation/checkpoint; post-Red source
freezing forbids reset. The CLI's `--dry-run` acquires leases and can recover
pending writes, so use an isolated model copy, never control, for preview.
Exact same-ID replay requires all original inputs; a new ID cannot supersede
a still-current checkpoint. Do not misuse workflow declaration supersession:
event 270 is D0's legitimate invocation, not a duplicate. A distinct completed
new invocation may append exactly one completion and must be reconciled to
unused native invocation evidence; this task/bootstrap append none.
R14 Git/write-set/27-shape/22-fixture and 9,398-case semantics remain unchanged.
Stop here before review, approval prepare/record, archive creation, preparation or checkpoint
for this design-only revision.

Other frozen regex/bare/stderr matchers are inventoried unchanged. Diagnostics
must prove the actual exact error contract and matcher acceptance, including
the intended diagnostic for bare `toThrow()`. Matcher syntax alone is not a
failure. All twelve tests must pass in an isolated completed-runtime copy,
both normally and with a separately bound non-remapping diagnostic observer.
The actual official overall/COMPAT/LIFECYCLE implementation fingerprint deltas
must be demonstrated, then the implementation removed from the comparison
copy; control stays runtime-absent for genuine Reds.
That proof includes compiled outputs. Ignored control dist currently contains
three stale test-runtime outputs despite absent source. Future preparation
must inventory/archive the exact dist tree, build into fresh private output
and publish through the recorded guarded reset; never run tsc over leftovers.
This design-only correction does not perform that reset.
The archived-test currentChangeFingerprints calculation must also reproduce
all seven D.fingerprints fields exactly using Authority's full six IDs/order
(verified against D's enclosing CHANGE generation, not phase.requirementIds) and
D-time inputs: impact, requirements, design, tests, implementation,
requirementImplementations and tdd. Raw outputs are bound in archivedTestOutputs;
the resolved mismatch pointer is /materialization/calculatorOutputs/0/value/
<field>. This deterministic comparison replaces observed-read instrumentation,
not the separate baseline/completed serial implementation-delta proof.

EVIDENCE-001 continues to read the immutable g8 freeze and exercise historical
structural compatibility. It is not edited or repurposed as g9 authority.
The pure structural validator is generation-agnostic and enforces internal
identity consistency, so g7-foreign is structurally valid. Generation
rejection belongs only to current-activation admission.
The current-phase facade additionally verifies g9 live approval/checkpoint/
generation context, and an independent g9 diagnostic harness proves both a
reachable positive and rejection of otherwise valid foreign-generation data.
No structural fixture success is TDD or approval credit.
The observed EVIDENCE run captures exactly its 47 actual validator inputs,
including random UUID outcomes and own undefined fields. Authoritative
replay decodes those lossless stored objects; it does not rerun the g8 factory.

The new `change0017-g9-recovery-*-v1` schemas and
`g9-recovery-preflight-v1` recipe use a **42-file** immutable Git closure,
not the old twelve-file list. The exact ordered list in DES-M5-015 hashes to
`8d20cbff579b61377acce5efd7a9579333f6713856205762ec4c01bac227196d`.
The previous 35 paths remain ordered, followed by tooling/tracer.c,
tooling/tracer-build.json and tooling/tracer, then tooling/tracer-build-spec.json,
tooling/tracer-policy-spec.json, tooling/tracer-fixtures.json and
tooling/tracer-bootstrap.py: 35+3+4=42 paths.
It contains current approval sources, the five test copies, the HOST edit,
matcher/results/implementation/fingerprint proofs, lineage seed and complete
historical/diagnostic byte capsules backed by exact Git commit/tree/blob
identities plus enumerated overlays, not a base64 worktree dump. Eight history
and eight diagnostic partitions are deterministically packed to <=64 MiB
each, <=320 MiB decoded inline total and <=512 MiB total closure. Preserve archive `83eb781f...`, transition
result `2ea7fd5c...`, g8 freeze `6b981dcd...` and commit `f117bbab...`;
their archived sources are independently reverified, never relabeled.
The inline raw-row cap is 46 MiB, with <=64 MiB encoded envelopes. Measured
live/archive changes ledgers (35,683,457 / 35,515,600 B) now fit with explicit
headroom. The 126,595,440 B Git source blob is referenced by commit/tree/OID,
not subject to that inline cap or copied into F. Git bytes count against the
2 GiB materialization and replay budgets. DES-M5-015 contains exact hashes.
Versioned Git/live/transition/archive addresses plus raw SHA/size prevent
collisions between identically named ledger versions.
Native.sourceRoot control/sharedGit maps bijectively to live-address segments
control/shared-git respectively; do not interchange their spellings.
Snapshot paths/bytes are aggregate per replay: 60,000 paths / 2,147,483,648 B.
The measured three full views use 28,740 paths / 905,073,501 B, leaving
31,260 paths / 1,242,410,147 B before overlays, private Git metadata and
additional source copies. Each physical copy counts; the old 20,000 path
aggregate cap could not admit those views.

Cache preparation lives at `.musubix/cache/g9-recovery-v1/<inputsSha256>/`.
Freeze roots are `.musubix/evidence/test-file-freeze/CHANGE-0017/g9/<manifestSha256>/`.
Post-commit seals and append-only intents/receipts/reports live separately at
`.musubix/evidence/runtime-recovery-calls/CHANGE-0017/g9/<manifestSha256>/`.
Two deterministic cache runs and committed, cache-independent replay must
agree. All 42 are normal blobs: 41 at 100644, tooling/tracer alone at 100755;
the manifest excludes its own
hash and the external seal binds the introducing commit without circularity.
The prior unpublished 35-file list is superseded, not silently extended.
New JSON containers must equal canonicalBytes(parsed); native raw sources/
reports retain their original byte hashes. DES-M5-015 closes all field types,
range/pointer/hash semantics and pre-manifest predicates.

Replay requires pinned Node v24.21.0/linux/x64, TypeScript 5.9.3 and vite-node
3.2.4/Vite 7.3.6/esbuild 0.28.2, with exact raw entry hashes and lock-bound
dependency inventory. No node_modules bundle or unspecified TS loader.
Private physical dependency copies, isolated caches/temp and offline verified
consumer tarballs avoid shared writable leakage. The observer preserves the
configured logical command/bootstrap and allows only its declared overlay.
Bounded operation/time/RSS/file budgets fail with G9_RECOVERY_INVALID.
Recorded runtime observations are verified as recorded, not represented as
fresh executions during deterministic replay.
The same R-root argv/cwd/environment is used for cache and committed replay:
./tools/node --max-old-space-size=2048 ./preflight/executor.mjs
--inputs ./preflight/inputs.json --output ./out. No flat-cache variant.
Use exactly DES-M5-015's 17-variable environment table, stored unexpanded.
`${R}` denotes realpath(replay cwd); expand by literal substitution, never
shell evaluation. It pins HOME/temp/cache/npm-prefix paths, both empty
read-only npm config files, the private-only PATH, locale/timezone and every
Node/npm flag. Start from an empty environment: no inherited variables,
lowercase npm aliases, credential variables or host PATH fallback.
Official calculators get a fixed inventory-sized operation reservation,
not invasive instrumentation of their internals. Validation views have closed
shapes and numeric indices. currentContextValid is structuralValid AND current
binding; g9-positive has null/null diagnostics.
Snapshot has an explicit CHANGE document overlay bound to D's impact
fingerprint, plus read-only non-calculator migration-guide/trace rows.
Unlisted dirty runner/calculator inputs block; unrelated dirty files remain
untouched rather than being implicitly copied into the diagnostic workspace.

Execute only after separately authorized preparation: twelve fresh Reds
(ordinals 1-12), serial batch Red (13), implementation intent/restore/focused
validation/checkpoint (14), twelve Greens (15-26), batch Green (27).
All three batch commands explicitly include `--workspace .` from control,
selecting the existing journal-first CLI path. No shared lease surrounds a
runner. Every intent checks source-to-dist CLI build provenance; ordinal 14
additionally binds its post-restore build through the exact content-addressed
implementation-supplement-v1, and ordinal 15 rechecks it. S records commit via
fsync and an external durability-seal chain without changing the immutable F.
Receipt recovery uses persisted facts and exact native reports only.
A TDD Dispatch.nativeTarget binds its path and ALREADY archived exact
before:Source|null, with immutable version-address path, mode 100644 and raw
SHA/size. All twelve TDD targets exist: missing before is an admission failure,
not permission to create one. nativeTarget.identity binds exact
device/inode/ctimeNs/size/sha256; bigint stat values are decimal strings.
Batch targets are {path:null,before:null,identity:null}.
Set Attempt.nativeReport only for present byte-different after output.
Identical g8/earlier g9 bytes are not a newly produced report; removal is
terminal. TDD receipt/recovery also needs changed bytes, not an old report SHA.
After sealing the real failed/interrupted AA=00 Attempt and pre/post Facts, one exact-intent
TDD retry may be eligible only with unchanged target bytes AND all five
identity fields, proven dead owner, unchanged facts/guards/build and
no changed attempt-owned report, receipt or native phase/order/
journal persistence. Pre-call Facts and archived historical output are not
attempt persistence. BuildProof binds ONLY DES-M5-015's seven ordered AST/
source slices and clean compiled closure, not whole-file post-restore equality.
Every build recomputes ranges/hashes/order; legitimate edits elsewhere in
tdd.ts/adapters.ts remain allowed. Pre-D TracePolicy binds pre-authority
slices; ordinal-14 supplement/policy binds post-restore slices.
namespace.distProof is a Ref to canonical isolatedDist [{path,mode,sha256}],
published before policy with no BuildProof/Toolchain hash, equal to dispatch
BuildProof.dist. Supplement TracePolicy replaces ONLY retrySourceContractSha256
and namespace.distProof; all other canonical bytes equal pre-D policy.
Validate replacements against dispatch BuildProof; unchanged values are allowed.
Ordinals 14..27 verify supplement.tracePolicy (15..27 via receipt 14);
Toolchain/toolchainSha256 stay pre-D. Feasibility tracePolicy is per shape:
1..13 pre-D and 14..27 supplement, not global. Dist/slices precede policy,
then fixtures/audit/TracerBuild/Toolchain/BuildProof, then supplement with
its policy; verify hash-DAG acyclicity before publication. A pre-authority
completed-implementation scratch SliceProof must preserve all seven hashes/
order/relationships even when file hashes/offsets move: pre-run lease
acquisition precedes unlink of the existing report, which precedes runner
launch. Unchanged device/inode/ctimeNs/size/sha256 under sole custody is the
mechanical pre-run proof; changed/disappeared/reappeared/unmeasurable identity
defeats it. No code-only or fabricated launch/output-range proof. G8's
LEASE_FENCED remains stage-unknown, not retrospectively retryable.
Seal Retry.priorAttemptSha256 and preRunProof with the build hash, before/
after identities and complete trace; 01 retains intent, target and environment.
Missing/unsealed Attempt blocks retry. This supersedes the unpublished
no-Attempt rule so outcome comes from durable observation, not a guessed pass.
A CHANGED report must have Red's expected selected failure or Green's pass;
archive/seal it and continue persistence only through a real native no-run
continuation, never rerun. The ordinary CLI exposes no such report resume;
absent continuation stops at /sidecar/resumeCapability. Unexpected reports
are terminal. Batch ordinals 13/14/27 permit dispatch 00 only:
journaled-pending/interrupted states stop at /sidecar/batchPending, not a
reissued change-record or imagined continuation. Complete exact facts allow
receipt recovery only absent the overriding fencing/ambiguity condition.
From dispatch through attempt seal and immediate retry classification/dispatch, no other
musubix5 process acquiring relevant leases may run. Use sole-coordinator
launch exclusion, not shared leases around a runner. Lease loss/fencing after
test/report execution or persistence ambiguity requires official g9 abandonment
at /sidecar/generationAbandonRequired; no later g9 calls. The existing
approver/confirmation contract still applies; no self-approved automatic
abandonment. Not every lease failure is retryable. G8's
abandoned intents are never retried or completed by this rule. No post-later-call
backfill, test rewrite, source supersession, waiver, void, repair, migrate or
refactor workaround is introduced. No change to general CLI evidence formats
or a new publicly available recovery command is claimed by this proposal.
Facts deduplicate immutable ledger objects by content hash, not ordinal.
The enforced upper bound is 844 MiB of ledger/tip/fact objects plus <=1,024 MiB
other S content: <=1,868 MiB, below 2 GiB, with every version reconstructable.
Unexpected growth or versions stop without dropping facts.

### Official-call environment and terminal outcomes

All ordinals 1-27 and NN-01 use cwd `${C}`=realpath(control) and exactly this
unexpanded key-sorted Dispatch.environment, hashed as H(the ordered list).
Expand only `${C}` literally, spawn from an empty environment, and unset ALL
other variables. The replay `${R}` template stays separate; NODE_PATH is empty.

```text
CI=true
GIT_ATTR_NOSYSTEM=1
GIT_CONFIG_GLOBAL=${C}/.musubix/cache/g9-official-v1/private/gitconfig
GIT_CONFIG_NOSYSTEM=1
GIT_EXEC_PATH=${C}/.musubix/cache/g9-official-v1/lib/git-core
GIT_TEMPLATE_DIR=${C}/.musubix/cache/g9-official-v1/private/git-template
HOME=${C}/.musubix/cache/g9-official-v1/private/home
LANG=C.UTF-8
LC_ALL=C.UTF-8
NODE_OPTIONS=--max-old-space-size=2048
NODE_PATH=
NPM_CONFIG_AUDIT=false
NPM_CONFIG_CACHE=${C}/.musubix/cache/g9-official-v1/private/npm-cache
NPM_CONFIG_FUND=false
NPM_CONFIG_GLOBALCONFIG=${C}/.musubix/cache/g9-official-v1/private/npm-globalconfig
NPM_CONFIG_OFFLINE=true
NPM_CONFIG_PREFER_OFFLINE=true
NPM_CONFIG_PREFIX=${C}/.musubix/cache/g9-official-v1/private/npm-prefix
NPM_CONFIG_SCRIPT_SHELL=${C}/.musubix/cache/g9-official-v1/bin/sh
NPM_CONFIG_UPDATE_NOTIFIER=false
NPM_CONFIG_USERCONFIG=${C}/.musubix/cache/g9-official-v1/private/npm-userconfig
NPM_CONFIG_YES=true
PATH=${C}/.musubix/cache/g9-official-v1/bin:${C}/node_modules/.bin
TMPDIR=${C}/.musubix/cache/g9-official-v1/private/tmp
TZ=UTC
XDG_CACHE_HOME=${C}/.musubix/cache/g9-official-v1/private/cache
```

Exactly 26 keys are allowed. Private bin/node v24.21.0, npm 11.19.0 lib/npm/bin/npm-cli.js/npx-cli.js,
bin/git and bin/sh use DES-M5-015's exact Toolchain.official paths/raw hashes
and complete dependency/interpreter inventories. The pinned ptrace tracer
observes every fork/vfork/clone/exec/exit, hashes and durably records each
exec-stop BEFORE continuation, including /usr/bin/env, esbuild and Git helpers.
Interpreter/native-tool roles are explicit; /proc sampling is insufficient.
EXITKILL and stopped child registration cover short-lived descendants;
PTRACE_SEIZE behind a pre-exec barrier (not TRACEME/late attachment) enables
TRACEFORK/TRACEVFORK/TRACECLONE/TRACEEXEC/TRACEEXIT/TRACESECCOMP and
EXITKILL/TRACESYSGOOD. Hash-bound seccomp/no_new_privs routes clone/clone3,
ptrace, setns/unshare, mount, io_uring and declared write/network operations;
coverage is restricted to that filtered set. Deny escape, return ENOSYS for
clone3, and trace/register glibc's clone fallback. Retain early unknown-TID
stops in pendingUnknownTids until exact parent-event joining; unmatched stops
lose custody. Handle exec-TID/seccomp/exit/event/signal/group/terminal stops;
pass real signals, PTRACE_LISTEN group-stops, suppress only known synthetic
traps. Set/record umask 0022 before first exec; verify it at every exec-stop.
escape, lost identity or tracer death after dispatch loses custody.
Dispatch.launcherProof binds the tracer; Attempt.processProofs is the complete
ordered JSONL log. Unsupported Linux/x64 ptrace/namespace/exact-stat capability fails platform,
never skips; wrong/missing identity fails executableIdentity.
Both npm config files are empty/read-only; owned caches/temp cannot alias or
mutate admitted read-only private dependencies or become authority.
No inherited environment, shared chmod, network or global executable fallback.
Only approved native runtime augmentation and pinned npm child variables
follow the exact parent template.
The source/binary/build-proof files are newly required tooling, not implemented
here. Pin GCC 13.3.0/ld.bfd 2.42 and all compiler/headers/libraries using the
design's raw inventories; two private builds must yield identical actual
binary hashes. All 22 non-credit tracer fixtures must pass: the original
fourteen plus untraced-clone-denied, clone3-enosys-fallback,
early-child-stop-order, namespace-change-denied, signal-passthrough,
vitest-results-write and ancestor-mkdir (permitted writes/no-ops, discard,
and unlisted/symlink rejection), plus ancestor-mkdir-runtime-blobs.
The ancestor-mkdir extension enumerates all 14 frozen mkdtemp sites and four
explicit mkdir sites below, every registered root/chain, per-test limits,
empty probes, Git/lease children and fixed official-command parents. In both
views check wrong-owner/over-limit registration, every unregistered sibling
and descendant, TMP/unlisted, cross-view paths and native EEXIST/ENOENT.
Also replay the pinned Git file-operation manifest, including exact per-writer
flags/modes, config lock rounds, transient init symlink lifecycle, commit
HEAD/ref/reflog/object routes, absent unlink probes and maintenance child lock.
Mutate writer/path/op/mode/order/identity and deny every unlisted boundary.
For commit fanout, learn the per-case full ID from access before mkdir and
deny a second unknown commit; never use a precomputed commit ID.
Execute fixed-parent EEXIST/missing-parent/foreign-writer/sibling checks on
actual model nodes. Derive ordinal owners independently from the frozen
invocation inventory, then attempt registration; equal copies of a registry
or an expected-result expression are not tests. Keep valid prior cases and
report revised executed counts, excluding the 120 replaced tautologies.
ancestor-mkdir-runtime-blobs checks C-rooted and every registered R-rooted
chain, including nested-run IDs: parent-first 0700 creation after the required
parents exist, before/after identities, unchanged EEXIST and actor/control-copy
parity. For C/registered R it checks exact 0600 blob/temp filenames and
create-only publication/fsync/cleanup, rejecting unregistered roots outside
admitted private TMP, undeclared children, wrong actors, modes/order, symlinks,
races and chmod repair. It also admits caller-supplied private-TMP call-511
linux and win32 cases under the existing private TMP row plus the registered
private-runtime-blobs allocations below, including their blob-directory chains.
It checks TMP/unlisted denial, registered root/chain admission and denial of
unregistered siblings under a registered root. Private behavior still includes
win32 temporary unlink without directory fsync, test-side blob overwrite/restore,
injected sync/rehash-fault leftovers and cleanup, without applying C/R
fsync/publication rules to these private writes.
They provide neither C/R grammar authority nor publication evidence.
An unregistered non-private root remains denied. This widens the existing fixture;
the ordered fixture count remains 22.
Exec fixtures also check umask. TracerBuild.audit uses TracerAudit's actual
reviewer/report, source/binary hashes, H(build provenance), H(fixture results)
and zero-findings accepted verdict. Exclude enclosing audit/proof hashes;
never invent future hashes or claim an unperformed audit.
Bootstrap order is raw tool/tracer builds, normalized TS/dist and private npx
binding, then final policy/fixtures/TracerBuild/BuildProof before D. Policy
hashes exclude themselves/enclosing proofs; compiler inputs are a fully hashed
external prerequisite, not a compiler bundle or provisional phase authority.
GitRuntime includes the complete recursive private git-core/helper tree
(166 measured top-level entries), maintenance, interpreters and exact config/
include/template inputs. Five GIT_ variables select private helpers, empty
read-only global config/templates and disabled system config.
GIT_ATTR_NOSYSTEM=1 excludes system attributes; bind repository/worktree attributes.

TracePolicy.namespace follows DES-M5-015's closed OfficialNamespace: current
uid/gid maps, deny setgroups, tracer-created mounts before first exec,
network none, read-only masks at /run/WSL, /run/user and /mnt/wslg. Private
C/node_modules/.vite-temp tmpfs is empty before/after. Add vitest-results:
private empty tmpfs exactly at C/node_modules/.vite/vitest; only these two
paths are dependency-inventory exclusions, and other .vite remains read-only.
Only pinned Vitest <sha1(label)> bucket mkdir/results.json write is admitted
(label=projectName or empty string); audit/discard at tree exit.
ancestor-mkdir records EEXIST for existing non-symlink parents of admitted
paths. Missing creation is limited to G/musubix5, its leases and leases/fencing,
the closed runtime parent grammar below and other explicitly registered bounded
directory allocations. Provision
all other static parents before first exec; every other mkdir fails closed.
The closed authoritative runtime parent grammar has two durableBlob root
categories outside admitted private TMP.
For C, admit C/.musubix/evidence/test-runtime,
C/.musubix/evidence/test-runtime/v1 and C/.musubix/evidence/test-runtime/v1/blobs.
R is an exact entry in the registered run-directory inventory at
C/.musubix/cache/test-runtime/<runId>, including each separately registered
nested-run ID; a writable prefix or caller-supplied root is not registration.
For every R, after R and R/worker-acks exist, admit only
R/.musubix, R/.musubix/evidence, R/.musubix/evidence/test-runtime,
R/.musubix/evidence/test-runtime/v1 and R/.musubix/evidence/test-runtime/v1/blobs.
Only pinned durableBlob creates either chain, parent-first, mode 0700.
C/.musubix/cache/test-runtime remains an exact parent allocation only for
pinned prepareTestRuntimeProvider, mode 0700; its registered R and R/worker-acks
allocations are unchanged. Require C's evidence/cache ancestors to exist.
Before/after identity/mode checks require absence -> owned non-symlink/0700,
or existing 0700 -> unchanged identity/mode through EEXIST; no chmod repair.
Nonmutating recursive-mkdir ENOENT probes retain the error without advancing
creation order. Hold parent identities stable through each child creation;
reject races, symlinks, wrong actor/order/mode and undeclared children.
At B=C or any registered B=R, only pinned durableBlob may create
B/.musubix/evidence/test-runtime/v1/blobs/<raw SHA-256> and its exact temporary
B/.musubix/evidence/test-runtime/v1/blobs/.<sha>.<UUID>.tmp, mode 0600;
sha is the same lowercase raw SHA-256 of the blob bytes. Open the temporary
exclusively (wx), write/file-fsync/close, then hard-link to the create-only
target; EEXIST is accepted only with exact existing-byte verification.
On POSIX, directory-fsync after publication, unlink that temporary,
directory-fsync again and rehash the target. No replacing rename of a blob
target is admitted; existing transport-file rename semantics stay unchanged.
Bind the temporary, target and cleanup to the same pinned writer/root.
Outside admitted private TMP, no arbitrary root, other filename, sibling
or descendant is authorized by this grammar.
The explicitly registered private-runtime-blobs allocations cover only the
frozen EVIDENCE-001 shared helper and BLOB-PLATFORM-001 mkdtemp roots
TMP/musubix5-runtime-{evidence,publication,publication-failure}-<six-character suffix>.
The braces denote exactly those three prefixes; bind each realized root to its
pinned frozen test/helper mkdtemp call before admitting creation. Register only
that root and its exact parent-first directory chain: <root>/.musubix,
<root>/.musubix/evidence, <root>/.musubix/evidence/test-runtime,
<root>/.musubix/evidence/test-runtime/v1 and
<root>/.musubix/evidence/test-runtime/v1/blobs, for the pinned frozen helper
or durableBlob writer as applicable. Root-pattern membership is not registration.
The ancestor-mkdir checks still apply: keep identities under custody, reject
symlinks/escapes, and deny TMP/unlisted and every unregistered root, sibling or
descendant directory, including siblings beneath a registered root.
These private durableBlob roots are governed by the existing private TMP row
plus these registered private allocations, including linux behavior, win32
temporary unlink without directory fsync, test-side blob overwrite/restore,
injected sync/rehash-fault leftovers and cleanup. C/R-specific directory, actor,
mode and fsync/publication rules do not constrain these private TMP writes;
the private allocation's own writer/path/identity bounds still apply.
They are neither C/R grammar authority nor publication evidence, and do not
establish a third authoritative runtime blob-root category.
The following frozen directory-allocation registry is exhaustive for the
twelve-test batch. SIX means exactly six ASCII alphanumeric characters
returned by the pinned mkdtemp call, not a wildcard permission. Q denotes
that call's exact registered root. Test labels abbreviate the frozen IDs;
TRUST denotes TEST-M5-RELEASE-002-TRUST-001. Limits are per selected test
execution, reset only for a new traced invocation, not a retry within it.
Shared helpers inherit the selected test owner and their actual loop slot.
Register the view, ordinal/test ID, source hash/range, call/loop slot,
realized path, operation/writer set and parent identity BEFORE admitting
the first mkdir. Failed candidate-name collisions retain EEXIST without
authorizing an existing foreign root; only a successful owned allocation
consumes its slot. No registration by matching a prefix alone.

| Allocation | Exact root | Owner, maximum successful roots | Admitted directories/files beneath Q |
|---|---|---|---|
| blob-evidence | TMP/musubix5-runtime-evidence-SIX | EVIDENCE-001: 4, one per tdd/command/result/integration role; BLOB-PLATFORM-001: 2, one per linux/win32 | The five-component blob chain above, then only helper-generated SHA-256 blob files, their frozen tamper/restore/delete cases and registered publication temporaries as applicable. |
| blob-publication | TMP/musubix5-runtime-publication-SIX | BLOB-PLATFORM-001: 2, one per platform | The same blob chain; pinned durableBlob and frozen observation/fault writers only, retaining the private publication semantics above. |
| blob-publication-failure | TMP/musubix5-runtime-publication-failure-SIX | BLOB-PLATFORM-001: 3, linux sync and win32 sync/rehash | The same blob chain; only the corresponding injected fault's targets/temporaries and cleanup. |
| untransferred | TMP/musubix5-runtime-untransferred-SIX | EVIDENCE-001: 4, one per role | None: create/remove Q only; missing blob reads must stay missing. |
| aggregate-a | TMP/musubix5 runtime A SIX | AGGREGATE-001: 6, one per logical invocation | None: create/remove Q only. |
| aggregate-b | TMP/musubix5 runtime B SIX | AGGREGATE-001: 6, one per logical invocation | None: create/remove Q only. |
| child | TMP/musubix5 runtime child SIX | CHILD-001: 1 | No subdirectories; only child observation.mjs and package.json written by the frozen test. Node/npm/npx execute those inputs, with npm derived outputs confined to the separate private cache. |
| gate-config | TMP/musubix5-runtime-gate-SIX | GATE-FINGERPRINT-001: 1 | Only .musubix and .musubix/config.json, including the frozen config replacements. |
| timers | TMP/musubix5-test-runtime-timers-SIX | TIMERS-001: 1 | Only the private Git-init and CHANGE-0017 lease grammar below. |
| mtime | TMP/musubix5-runtime-mtime-SIX | HOST-BOUNDARY-001: 1 | The same Git/lease grammar; the frozen test may recreate only its released lease directory and set that directory's mtime. |
| trust | TMP/musubix5-candidate-trust-SIX | TRUST: 1 | Only .musubix/config.json, package.json, their .musubix parent and the per-writer private Git-init/config/add/commit/maintenance grammar below; unsigned ingestion rejects before any evidence writer. |
| nested-worker | C/.musubix/cache/worker-runtime-probe-SIX | MODULE-ORDER-001: 4, one per forks/threads/vmForks/vmThreads; CHILD-001: 1, forks | No subdirectories; only observation.json, worker.test.ts, vitest.config.mjs and native.json. |
| type-boundary | C/.musubix/cache/runtime-type-boundary-SIX | EVIDENCE-001: 1 | No subdirectories; only unvalidated.mjs. Both tsc invocations use --noEmit; no build output is allocated here. |
| groups | C/.musubix/cache/runtime-groups-SIX | AGGREGATE-001: 1 | None: --describe-groups emits stdout only. native.json must remain absent; described runId/run/command-run/report paths are values, not directory allocations. |

There are 14 mkdtemp source sites, four explicit mkdir source sites and at
most 39 successful test-body root allocations across one complete twelve-test
pass. A failed Red may exercise a strict subset; it gets no other allocation.
In particular, the evidence helper serves EVIDENCE-001 as well as
BLOB-PLATFORM-001. No empty aggregate/untransferred/groups root may acquire
a .musubix, run, command-run, worker-acks or arbitrary UUID child.
These roots are not registered runtime R entries merely because an API
parameter is called repo, run or controlRoot. Cache placement grants no C
publication authority; private Git common roots are not the authority G.

For timers/mtime/trust Q only, use Git 2.43.0, /usr/bin/git raw SHA-256
2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668
(the official private copy has identical bytes), umask 0022, the exact
26-key environment, empty read-only global config/template and pinned
private git-core. Bind each process to its frozen caller: candidate-gate-trust
24-26/33-34, timers 118, worker 537; no permission from a Git basename alone.
The safe isolated file-operation probe is non-credit, not the official tracer.
Its operation manifest retains native flags/modes/results, writer PID/exec,
ordered paths, raw trace/tool/helper/environment/source hashes and cleanup.
The following is the closed per-writer Git write-set; paths are relative to Q.

| Pinned writer | Exact operations and lifecycle |
|---|---|
| git init --quiet Q (timers/mtime/trust) | mkdir .git, .git/objects, .git/objects/info, .git/objects/pack, .git/refs, .git/refs/heads, .git/refs/tags with native 0777 (0755 under umask). Create/write/close .git/HEAD.lock then rename to HEAD (refs/heads/master); four serial config.lock create/write/close/rename-to-config rounds for the pinned empty-template init. Lock opens are O_RDWR\|O_CREAT\|O_EXCL\|O_CLOEXEC, 0666 (0644). After the first config publication, chmod that exact regular file 0100744 then restore 0100644; each subsequent config.lock chmod is exactly 0644 after open and before write/close/rename. No chmod repair, other mode or other target. |
| init filesystem probe (same init PID only) | Exactly one successful .git/tSIX leaf: O_RDWR\|O_CREAT\|O_EXCL, 0600 regular-file creation, close, unlink; then symlink("testing", SAME leaf), no-follow lstat, unlink. Both objects must be absent before init exits. Register the actual six ASCII alphanumeric suffix before creation; EEXIST candidate collisions grant no existing-object permission. This is the sole symlink exception, not a writable symlink subtree. |
| git -C Q config user.email test@example.com (trust line 25) | One .git/config.lock exclusive 0666/0644 open, chmod 0644, write/close, rename to .git/config. Bound to this exact process/argv/key/value; no direct config write, config chmod, directory creation or borrowed init permission. |
| git -C Q config user.name "Test User" (trust line 26) | The same single config.lock lifecycle, separately registered to this second exact process/argv/key/value, not permission for arbitrary git config. |
| git -C Q add . (trust line 33) | One .git/index.lock exclusive 0666/0644 open, write/close and rename to index; only the two content-bound staged blobs and their object publication lifecycle below. No config, refs, reflogs or maintenance writes. |
| git -C Q commit --quiet -m candidate (trust line 34) | One index.lock exclusive 0666/0644 write/close/rename-to-index; .git/COMMIT_EDITMSG O_WRONLY\|O_CREAT\|O_TRUNC 0666/0644 write/close; the two trees and at most one unknown commit object below. Create/close .git/HEAD.lock and unlink it (NOT rename to HEAD); create/write/close .git/refs/heads/master.lock and rename only to master. mkdir .git/logs, .git/logs/refs, .git/logs/refs/heads (0777/0755); open/write/close only logs/HEAD and logs/refs/heads/master with O_WRONLY\|O_CREAT\|O_APPEND 0666/0644. Missing-parent open probes retain native ENOENT, then parent-first mkdir/retry. |
| commit absent-state probes (same commit PID only) | unlink only .git/AUTO_MERGE, .git/MERGE_HEAD, .git/MERGE_MSG, .git/MERGE_MODE and .git/SQUASH_MSG, each independently no-follow checked absent and returning native ENOENT without mutation. Existing entries, symlinks, races, foreign writers or another name are denied, never deleted or translated to ENOENT. |
| commit's pinned maintenance run --auto --quiet child | Verify the child exec image/hash and parent/argv binding. Only .git/objects/maintenance.lock O_RDWR\|O_CREAT\|O_EXCL\|O_CLOEXEC 0666/0644 create/close/unlink. No lock-content write, pack/repack, maintenance directory, ref/config or other object mutation; unexpected auto-maintenance work blocks authority. |

Only trust add/commit may allocate object fanout directories. Derive the
complete IDs of the two blobs and two trees independently from the frozen
staged bytes/tree encoding. Do NOT precompute or reuse a commit ID: its native
timestamp varies. For each case, observe the pinned commit process's
access(".git/objects/<two lowercase hex>/<38 lowercase hex>", F_OK) at entry,
after the two known trees and COMMIT_EDITMSG, and register that full unknown
40-hex ID before any corresponding fanout mkdir. Bind it to this Q/view/
invocation/PID; admit at most ONE distinct unknown commit ID per case, including
retries. A prefix alone, later link destination, post-exit object enumeration,
another process's access or a previous case's commit ID cannot authorize it.
Retain the native access result. Only that registered full-ID route may mkdir
its fanout (0777/0755); an existing owned fanout is unchanged through EEXIST.
Known blobs/trees also require their writer's observed complete-path access
before their fanout/publication, not hex-prefix matching.
For each registered object, admit its writer's exclusive
.git/objects/<bound fanout>/tmp_obj_SIX open (O_RDWR|O_CREAT|O_EXCL, 0444),
write/close, hard-link to that exact full-ID destination and unlink the same
temporary; never replacing rename or a link to a different object. A failed
pre-mkdir temporary open retains ENOENT without allocating; a new suffix on
retry is separately bound, at most one live successful temporary per object.
EEXIST collision probes cannot adopt foreign objects; existing owned targets
require exact content/type verification. Rehash/decompress the published
object and verify its type/content; the sole commit must reference the two
bound trees, have no parents, and bind the configured author/committer,
observed native timestamp and candidate message. No pack, new branch, hook,
template/hooks/branches subtree or maintenance directory is allocated.

The init .git/tSIX exception overrides reject-symlink ONLY for creating,
no-follow inspecting and unlinking that registered leaf in the same init
lifecycle. It never permits traversal, read/write through the link, children,
rename/link destinations, another target, another writer or a surviving link.
Keep .git and all ancestor identities pinned; hold absence/identity checks
through each syscall. General no-symlink/escape and unregistered-descendant
denial remains mandatory everywhere else, including cleanup. A leftover probe,
wrong lifecycle/flags/mode, missing required removal or unexpected operation
fails closed; do not chmod, follow or delete an unregistered object to recover.
For timers/mtime only, journal.ts may create Q/.git/musubix5,
Q/.git/musubix5/leases, its fencing child and its change-CHANGE-0017 child.
Admit only that lease's owner.json, owner-<UUID>.tmp, fencing counter and
counter.<UUID>.tmp; takeover may rename the exact lease to its registered
change-CHANGE-0017.stale-<UUID> sibling solely for removal. A stale sibling
is not a mkdir allocation. The HOST test's ownerless recreation/utimes is
restricted to its exact released lease. These are private test artifacts,
not control leases, journal/order evidence or runtime publication.

Except for the exact transient init tSIX leaf above, all root/child
admissions retain ancestor-mkdir identity/no-symlink checks,
parent-first creation, native EEXIST/ENOENT and the pinned writer's own flags/
modes; the C/R 0700/0600/fsync contract is not imposed on frozen helpers'
ordinary mkdir/write calls. Cleanup may remove only the owned allocation
and registered descendants, never pre-existing parents or an unregistered
sibling. Unregistered descendants fail closed even under a registered root.
No non-test writer may borrow a frozen test's registration or slot.
The private row is not an alternate permit for a denied registered/unlisted
test root. TMP/unlisted, prefix lookalikes, wrong-view roots and C/G/R
substitutions remain denied.

Official ordinals 1..12 and 15..26 select exactly their frozen test; 13, 14
and 27 are batch checkpoints and receive no test-body allocations. Their
existing native/ledger/journal/source-blob/atomic-temp/external-lease rules
remain unchanged. Before first exec, provision and pin the fixed C parents
.musubix/cache, .musubix/evidence/native/test, .musubix/journal/normal,
.musubix/trace and .musubix/evidence/tdd-source/v1/blobs, including ancestors;
provision BuildProof's exact dist parent inventory, the two Vite mount roots
and the declared private HOME/npm/cache parents from their closed inventories.
Their recursive mkdir calls are EEXIST checks, not new dynamic authority.
Only the already registered Vitest label bucket, G lease chain, provider
test-runtime/R/worker-acks and C/R blob chains may add their listed dynamic
parents outside the frozen registry. Npm/npx/cache writers must use the
pinned derived-output inventory, with parents provisioned before dispatch;
any newly required directory needs pre-authority revision, not a TMP escape.
Ordinal 14's authorized restore/build uses only restored source paths and
the supplement BuildProof's exact parent inventory, provisioned by the
supervisor before the traced build/checkpoint; it grants no test fixture root.
The supervisor's separate S publication allocations are not runner writes.
Source-supersession pair scratch, unselected test suites, npm installs and
executing described codegraph groups are not these 27 command shapes.
The real-command spike must check every actual mkdir against this complete
allocation/fixed-parent inventory, including nested Node/npm/npx/Vitest,
Git and tsc operations. A new dependency writer blocks authority until a
design revision; this source enumeration/model is not an executed trace.
Source enumeration: worker 178/396/536/545; evidence
104/106/717/736/773/774/838/902/943; gate 66/68; timers 117;
candidate-gate-trust 22/27. Lines name the five frozen test files, not a
combined worker file. Archived runtime mkdir sites are 251/579/580/581;
journal.ts 149/184/192/521, adapters.ts 193 and files.ts 126 cover the
selected production parent writers. Read-only runtime augmentation and
group validation create no directories.
Direct source: archived packages/analysis/src/test-runtime.ts SHA-256
92bd7ebfad27fcfdecb29bdb32e9f00ecf6b5200ee8db2432b374a76bb389296,
lines 197/249-271 (directory and durableBlob; temporary/publication/fsync at
252-264), 502-511 (publishTestRuntimeClosure passes caller-supplied controlRoot;
the frozen call-511 cases use private TMP, not C), 548-559/582 (snapshotRuntime into R),
578-581 (provider allocations), and 612-653 (R dispatch/request/anchor,
worker and completed-ack blobs).
Frozen TEST-M5-TEST-CLOCK-BLOB-PLATFORM-001 in tests/test-runtime-evidence.test.ts,
SHA-256 51444711ff40986c9bd5359a89e5b9ded2fbf98f81387d36df678be6c605fb18:
99-112 (private-TMP source/blob helper), 588-632 (observedPublication and
injected sync/rehash faults), 900-908 (linux/win32 mkdtemp controlRoot calls),
920-923 (platform-specific directory sync), 930-966 (repeat calls, overwrite/
restore, fault leftovers and cleanup). The labels control/controlRoot do not
establish C identity. Apply identical closed lists/checks in
control and feasibility copy, resolving C and its registered R inventory
to that view only; neither view authorizes the other's paths.

Closed frozen write-set summary (same per-owner/slot/identity bounds as the
registry; no recursive permission): private-runtime-blobs are exactly
TMP/musubix5-runtime-evidence-SIX, TMP/musubix5-runtime-publication-SIX and
TMP/musubix5-runtime-publication-failure-SIX, with their registered blob chains,
files, private tamper/fault/cleanup behavior, never C/R publication authority.
Private-frozen-tests are exactly TMP/musubix5-runtime-untransferred-SIX,
TMP/musubix5 runtime A SIX and TMP/musubix5 runtime B SIX (empty);
TMP/musubix5 runtime child SIX (child observation.mjs and package.json);
TMP/musubix5-runtime-gate-SIX (.musubix/config.json and its parent);
TMP/musubix5-test-runtime-timers-SIX and TMP/musubix5-runtime-mtime-SIX
(only their registered Git-init/probe and CHANGE-0017 lease operations);
TMP/musubix5-candidate-trust-SIX (the two staged files/.musubix parent and
only the per-writer Git init/config/add/commit/maintenance operations above).
Control-cache probes are exactly C/.musubix/cache/worker-runtime-probe-SIX
(observation.json, worker.test.ts, vitest.config.mjs, native.json),
C/.musubix/cache/runtime-type-boundary-SIX (unvalidated.mjs only), and
C/.musubix/cache/runtime-groups-SIX (empty; no native.json).
These 14 allocation families cover at most 32 private-TMP and seven
control-cache roots per twelve-test pass. Neither cache probe is R; no private
Git root is G. Empty roots stay empty. Unregistered descendants/siblings,
wrong writers/views and C/G/R substitutions remain denied. The init tSIX
symlink is only the exact transient exception above, never path traversal.
Deterministic checks must compare all four mirrored registries AND this
summary against every registry root, allowed child and owner/limit; omitting
a family or either control-cache probe fails even when mirrors agree.

Dist permits global-
setup/nested Vitest rebuilds only with post-call BuildProof bytes/modes/path
equality. Exact write rules include ALL bounded private frozen-test and
control-cache allocations in the closed frozen write-set summary above,
separate nested runtime runIds, selected native report, order/tdd/
changes, trace index, next normal journal record, runtime/source blobs and
pinned atomic temporaries. External G/musubix5/leases is limited to registered
invocation lease/fencing/owner paths. Private HOME/TMP/npm/XDG follow closed
rules; pack stays HOME/TMP-only. Everything else is read-only/no-write; F,
prior S and sidecar authority cannot be runner outputs. Parent writability
never admits siblings. Audit filtered mutations and fail undeclared writes
or dist drift rather than widening the executing policy.

Before F/S authority/intent, after actual tracer/audit/policy/namespace/env
preparation, execute the real-command feasibility spike in an isolated
non-credit copy with separate Git common root/leases. Cover ordinals 1..27:
twelve Red shapes, Red batch, full ordinal-14 restore/build/slice-policy
supplement and implementation batch, twelve completed-implementation Greens,
Green batch. results.feasibility binds Feasibility/SliceProof and actual
per-shape namespaceProof equal to its TraceLog.namespaceProof Ref, checked
against selected tracePolicy.namespace/distProof (pre-D 1..13, supplement
14..27); no top-level proof or cross-shape/policy substitution. Capture
exec/write/mount closure, trace bytes and wall time. Each shape/nested window
must stay <=50% of its tightest enclosing timeout (30,000-ms child <=15,000 ms,
less with a tighter test). Missing authority/hash cycles fail rather than
fabricating phases. Hash cache keys are ONLY dev/inode/size/mtimeNs/ctimeNs;
re-stat each exec-stop, rehash any change. Failure permits pre-authority
policy/design revision, never control mutation or TDD credit. Existing
campaign/memory/storage caps and payload Refs apply; no added closure file.
This correction does not execute that future spike.

Retain npx musubix5; direct Node entry equivalence alone does not prove npm
PATH/environment equivalence. Both clean builds and dist reset use umask
0022 and normalize only dist/packages/cli/src/main.js to 0755 BEFORE hashing.
Admit only the private cache/_npx local-package link tree with that exact
real target/bytes/mode, never global/shared cache. Rebind at ordinal 14 and
recheck before 15. Inventory npm's actual ancestor node_modules/.bin,
explicit binPaths and node-gyp-bin before/after and at exec-stop; shared
parents must be read-only, contain none of node/npm/npx/git/sh/env/vitest/
musubix5, and never supply an approved executable. No shared chmod or assumed
protection from the initial PATH alone.
Existing outside-parent bins receive empty read-only masks only in the owned
namespace, with separate host/effective inventories and no host modification.
Absent paths stay absent; admitted control/cache bins are never masked.

Read-only HOME/.npmrc preserves offline/prefer-offline, disabled notifier/
audit/fund and private HOME cache/prefix/global-config/log policy for the
frozen ISOLATION npm pack child even when NPM_CONFIG_* and TMPDIR are absent.
Owned user/mount/network namespaces provide private /tmp and /var/tmp;
only declared HOME/TMP writes are admitted for pack. Ptrace syscall checks
deny network/registry attempts, io_uring/namespace bypass and other writes.
Require zero network attempts, not merely exit 0. Missing capabilities block
execution; never weaken the frozen test or change global mounts/permissions.
Tracer source/binary/build proof caps are 64 KiB/4 MiB/4 MiB within existing
F/dependency/payload budgets. R22 selected wire-output slot caps and decoded
<=64 MiB/call apply, with
<=512 MiB aggregate within S's miscellaneous cap; <=100,000 process/exec
and <=5,000,000 pack syscall events per call. P<=287,178,752 bytes admits separately
approved source/seed/fixture/probe work including all P shared owners and
capped carry; W before D1 adds post slot caps<=240,648,192 bytes (102×2,359,296)
PLUS seven W shared owners<=6,291,456 bytes to actual P charges;
combined <=534,118,400 bytes with 2,752,512 bytes unallocated margin.
Overflow blocks admission/Red. No 54-dispatch
shortcut, aggregate cap increase or sampled fallback.

The complete ordered /sidecar enum is generationAbandonRequired, batchPending,
resumeCapability, platform, environment, executableIdentity, isolation,
sourceContract, targetIdentity, nativeReport, retryConsumed, retryEligibility,
ownership, facts, authority, lineage, durability, capacity, callFailed,
callInterrupted, missingPersistence, admission: exactly 22 fields.
No suffix/extra field is allowed. Abandon > pending > resume outranks all other
validation failures. Abandon requires the official confirmation/approver
contract, never automatic self-approval. Pending/resume/retryConsumed/
retryEligibility/ownership/lineage/callFailed/callInterrupted/missingPersistence
require suspension/manual investigation
with no mutation. Every other field is a deterministic preparation failure:
retry only before any F/S authority/intent; after publication suspend instead.

Full raw native before/after order/journal/TDD/changes snapshots determine
O,J,T,P: U=unchanged; E=one exact expected native delta with valid linkage and
all other records preserved; X=anything else, including unknown/torn data.
UUUU is clean, TDD EUEU complete, batch EEUE complete, batch UEUU/EEUU known
pending. Every other tuple/any X after dispatch is persistenceAmbiguity.
Dispatched custody loss or lease failure without unchanged identity likewise
requires abandonment. Known batch pending stays terminal; expected changed
report + clean TDD facts + unavailable continuation selects resumeCapability.
Outcome=success|failed|interrupted is derived from the sealed Attempt's actual
outer exit/signal. Failed/interrupted AA=00 may retry only with unchanged
identity, clean facts and all guards; AA=01 failure is terminal. Missing
targets, unexpected reports and higher-ranked failures still take precedence.
Success/clean official calls fail missingPersistence; only success/complete
with full proofs selects receipt. Failed/interrupted complete facts suspend.
Rank 2 is batch-only; receipt requires dispatched=true. Fallback covers ALL
dispatched calls. Undispatched non-base execution fields (excluding admission
metadata authorityPublished/flags) reject facts/suspend if authorityPublished=true,
otherwise facts/prepare before classification,
never allowing published-authority mutation/recovery; base flags use P/M.
Exhaust 279,936 states (3^4 deltas * 3 outcomes * 2 kinds * 4 targets *
3 reports * 2 lease * 2 custody * 2 attempts * 3 retry reasons * 2 guards),
fixing dispatched/authorityPublished true, continuation false and flags empty.
Require exactly one decision, no dispatched none and no TDD batchPending.
DES-M5-015 closes all predicates and 66 non-credit fixtures covering each
action and priority collision. Results extend checks.terminalCases inside
the 42-file closure, including retry-collision with leaseFailure=true and two
undispatched facts/prepare cases plus sealed-undispatched-failure/facts-suspend,
not frozen tests or native evidence.

## Generation-8 test runtime and graph scope

The approved `stable-test-wall-clock-v1` runtime is implemented behind the
optional top-level `testRuntime` policy. Configured test, compatibility and
codegraph runners append the explicit coordinator reporter after native
arguments, validate worker acknowledgments and publish their immutable blob
closure before temporary verification roots are removed. A bare unmanaged
Vitest invocation cannot claim this policy: focused diagnostics must explicitly
add `--reporter=<absolute-repository-path>/scripts/test-runtime/coordinator-reporter.mjs`
alongside any native reporter. Existing projects without the extension retain
their legacy configuration and approval projection.

The worker setup installs only the stable `Date.now` clock; native timers,
Date construction and explicit test-local clock mocks retain their behavior.
Build setup removes both inherited clock bindings in its environment copy.
Plain, undecorated Buffers use byte-exact native equality to avoid per-byte
matcher allocations; decorated buffers retain Vitest's recursive comparison.
This does not change any authoritative test bytes, assertion outcomes or
timeouts. Implementation availability is not SDD approval or completion credit;
the recorded generation histories and the following preparation protocol remain
unchanged.

Generation 7 was abandoned after its frozen positive activation fixture
reused unchanged design/Red/implementation fingerprints. Its twelve Reds
3789-3800 and batch 3801/journal 939, five source files and native reports
remain preserved; exact hashes are in
`.musubix/cache/g8-transition/g7-frozen-report.json`. No in-g7
void/source-supersession/repair/migrate/refactor correction or credit transfer
is authorized. Generation-8 impact is order 3802; no g7 plan cleanup was needed.

Keep all existing tests unchanged while preparing/reviewing initial g8 requirements
and design. Human approval of each stage and its full-set checkpoint must
precede g8 test preparation. At the initial design checkpoint, capture the traced-test
input inventory/hashes with all five files still equal to the g7 archive.
Only afterward correct the EVIDENCE helper/fixture-data regions enumerated in
DES-M5-015; all other test bytes, including TRUST's already-correct 327baa...
expectation/annotation, must remain unchanged. The positive fixture binds
CHANGE-0017/g8/repository, exact two-requirement serial scope, closed twelve
TEST assignments, checkpoint-bound g8 approval SHAs and verified checkpoint references.
Before any g8 Red, preflight every runtime-independent conjunct, including
generation/membership/scope/approval references and strict design < each Red <
batch Red < implementation < each Green fixture order, plus journal schema
and existing checkpoint change predicates:
design/Red tests and Red/implementation implementation fingerprints must
differ; Red/Green test fingerprints must agree. Recompute linked hashes and
reject unchanged-history and preserved-g7 foreign-binding negative cases.
Runtime absence alone is not fixture validity. Separately prove the actual
prepared workspace test-set fingerprint differs from the design checkpoint
solely because of the post-design EVIDENCE correction; historical TRUST edits
cannot count. Follow DES-M5-015's #51 workaround: persist the exact five-file
freeze manifest and preflight under the content-addressed
`.musubix/evidence/test-file-freeze/CHANGE-0017/g8/<manifestSha256>/` directory,
bound to design approval/checkpoint, batch and twelve TEST assignments.
Use `.musubix/cache/g8-freeze-preflight/<preparationSha256>/preflight.mjs`
before first Red. Its inputs hash precedes the final manifest hash, avoiding
a circular address. First verify the live EVIDENCE whole-file hash, then all
five hashes and the pinned parser extraction anchors/byte ranges/hashes.
Evaluate only the approved factory/mutation-data regions and separately the
pinned consumer initializer under its sealed-capability contract, never the full
test module/top-level inject or a future runtime function. Existing generic
journal/order/checkpoint validators and explicit Node assertions check all
runtime-independent conjuncts for deterministic g8-positive/g7-foreign cases.
Record harness/source/extraction/helper hashes, argv, observed versions,
parent-observed exit/status and each conjunct in preflight.json; failure
blocks Red, and runtime-only checks remain deferred to Green.

**Correction after design checkpoint 3804:** Preserve 3804/g8:design and its
f877988d... approval binding, requirements 3803/current approval, and the one
already-completed g8 sdd-design event; do not repeat completion. Preserve the
authorized prepared EVIDENCE SHA
1e73b80d3e77d4ec615b6abebab0f05856100dfcd09c7fc6e09ea58dbf79f6ac
and all other test bytes through review/approval/checkpoint. After a renewed
human design approval, dry-run then record official full-six-ID design
supersession with operation ID g8-native-order-strings-v1, verifying ordinal 2,
key g8:design:2, new approval and actual order D. No approval preparation or
checkpoint is part of this design-only correction.
D captures the already-prepared fingerprint b7793f09... (full pin in DES-M5-015).
Only afterward change activationCases' valid initializer to decode the native
strings; retain the prepared fixture, imports, factory, mutations and test
bodies. Prove the real workspace test fingerprint changed from ACTIVE D solely
through that functional decoder, not whitespace, historical TRUST or a 3804
baseline override. All new preflight/freeze/receipt bindings use
D/checkpoint-bound approval.

Canonical-object order prefixes broke native insertion-order hashing. Use the
v2 native-string transport retained by the v3 cache inputs/recipe with
DES-M5-015's evidence-order-native-strings-v1 descriptor:
ordered compact JSON strings from persisted records, source path/byte SHA,
schema/extraction algorithm/version, prefix length/tip sequence/hash,
H(ordered strings) and the full extraction digest. Validate source UTF-8 and
duplicate decoded keys, then each compact string's exact parse/stringify
round trip; parse strings back in array order and run unchanged
validateEvidenceOrderLog with zero diagnostics. Never canonicalize an individual
record or rewrite its hash. Pinned string aggregates, not self-recomputed
candidate expectations, reject key/byte/record/order/add/remove mutations,
including moving only recordSha256.
Snapshot source SHA:
1df8b145134bb48a2d48fec52dea5e82649339c4b47702990b7bbbba2dbc0f2e.
Aggregates: prefix 3788 =
749a7e4d694338e4e3903a6191bdb71de3bd14000f66c15181c73c2c9c8cc7df;
prefix 3804 =
599d0d1a644d8443eb863efa29164bee5912189176472b9dccd11a0ce4be0af8.
Exact snapshot extraction digests/proof are in DES-M5-015. Re-extract after D
with its real source-byte hash, require both retained prefix aggregates,
and use D as the g8 prefix tip. Replay uses archived inputs strings, never
live-source fallback. Synthetic g7 suffix records follow official native
construction/key order and the same string transport/validator; bind
nativeOrderReplay outputs. Fail with
PREFLIGHT_ASSERTION_FAILED:native-order-prefix-binding after lineage checks,
before fixture evaluation, not as an expected g7 rejection.
No additional closure file is needed: keep all twelve immutable paths,
the 23 mutation rows/hashes and the runtime policy unchanged.

Do not infer test-consumer correctness from the independent harness decoder.
Pin the exact activationCases valid initializer as fourth extraction in inputs
(after activationFixture, changed, mutations), including locked-parser AST
identity, unique anchor, UTF-8 range and raw SHA. The unchanged review source
has range [19556,22669), SHA
799c444c1e5fafb5ef4b9217fca742a42e02b24bf78349732fa9146b33c36d28.
This is the legacy object consumer, not an executed corrected decoder; derive
the new extraction only after approved checkpoint D and its authorized edit.
Execute only that expression in DES-M5-015's sealed consumer VM, with closed
free identifiers/effects, read-only deterministic discovery/input stubs and
an activationFixture argument-capture stub. Reject unknown dependencies or
side effects; no test-module import, runtime/provider, actual factory or UUIDs.
Supply complete native-transport inputs bytes, never predecoded records.
Compare its captured bindings with a separately parsed independent decoder
AND each original pinned native string; require exact schema/length/order/tip/
source/aggregate, unchanged native validator zero diagnostics, and complete
current positive g8 approval/phase bindings.

Step 2 is staging BEFORE F publication: structural transport, native prefix
checks g7 then g8, consumer, then factory/mutation preflight. Import the same
staged harness and require byte-identical canonical exported consumer/structural
results and CLI results before writing preflight/computing F.
Step 3 is the SOLE partial consumer-replay exception, REPEATABLE read-only in
fresh processes: ALL eleven non-manifest files must
be durably published/rehashed/byte-identical to staging, the shared A/B/C
manifest-finalization state classifier must pass,
F's final segment equal the step-2 prospective manifest byte SHA, and the
content-derived ready-eleven seal verified. Run consumer-only read verification
from F's source/inputs with no candidate committed-tip claim (C verifies
its present manifest bytes);
committed predecessors remain verified. It cannot write; incomplete execution
may restart in a fresh process after rechecking the same seal.
Step 4 publishes manifest last, commits/verifies twelve files and requires real
manifest, committed-tip and full lineage guards before committed transport/
g7/g8 prefix/consumer replay. Every other partial rerun remains terminal.
The hashed harness's read-only, root-explicit
verifyConsumerDecoder({repositoryRoot,sourceBytes,inputsBytes}) export makes these
replays; it does not run the factory/mutation contexts. Use the declared
predecessorFreeze-only discovery view and logical path identities so no final
F/manifest address is needed upstream. Resolve repository/tooling only from the
same explicit verified control repositoryRoot in steps 2/3/4 (CLI verifies cwd),
never import.meta.url or staged/archived file location. Defer repository-dependent
imports until root verification; import alone never executes preflight.
Its read-monitor rejects other manifest
fields, enumeration or reflection. Replays must match existing results,
not update checks or append closure files.
Enforce exact AST positions across all branches: value only in the outer
factory arguments value.provenance and value.executionBinding.logicalCommandSha256;
root only once as argument 0 of
join(root, '.musubix/evidence/test-file-freeze/CHANGE-0017/g8').
No aliases, destructuring, other reads/passes/branches/interpolation, optional/
computed access or shadowing; violations are dependency-stage failures.
Derived root paths may feed only approved joins/filesystem path arguments,
never text inspection/branching that observes the logical root indirectly.
Further restrict these flows to the pinned six-statement discovery subtree:
base only in readdirSync and the two exact joins; each listing name only in
candidate.name, the manifest join, predecessors.has and the selected inputs
join. No later decoder alias/use or transformation. Preserve
join(base, tips[0]!.name, 'preflight/inputs.json') exactly: the four-argument
variant is path-equivalent but not AST-identical. All decoder edits start
AFTER inputs read. The discovery range is [19650,20412), raw SHA
eb5b3f45f6c22c3de4fec283b40f12c1727c8fc5eabc69d136c516721c9ed83f,
descriptor H 0d4532bc720e88426873aa2f9f074fc075ca6d0413cb162865ffa3522131a4e5.
AST/byte/taint mismatch rejects at dependency; 17 static negative probes cover it.
JSON is frozen-native-json-v1, not an unrestricted native global: frozen native
delegates, deep-frozen parse results, a logged read-monitor only for exact
discovery text, native stringify ordering and no mutation/prototype escape.
Bind its version, twelve fixed capability-probe outcomes and access log.
Replace semantic wall time with consumer-operation-budget-v1, 100000000 units:
instrument source statements, calls/new and arrow entries with
ts-statement-call-arrow-v1; account JSON parse/stringify bytes and freeze nodes.
Bind exact counters/sum and instrumented-source SHA across CLI/import/replays.
Read-only consumer host watchdog expiry leaves INCOMPLETE, never a persisted
pass/fail or abandon decision from that replay.
Step 2 can rerun the same staged work. Step 3 can restart in a fresh process
after rechecking the identical ready-eleven seal, address, current bindings and
no-call/predecessor rules; replay writes nothing. Only a deterministic match
permits distinct manifest-only finalization/commit, not repair of eleven files.
Step 4 similarly restarts under full committed guards. Persisted complete
results/destinations are reusable only byte-identically; partial output counts
as no result. Only the exact manifest/temp gets bounded finalization recovery.
Step-3 entry, seal, manifest-only recovery and diagnostics use the SAME states:
A = absent manifest/no temp; B = absent manifest/one exact destination-derived
manifest temp in F, target manifest.json only, with fixed grammar/no-follow/
euid/0600/single-link/identity checks; C = independently reconstructed manifest
present byte-identically, closure uncommitted, no temp. No other temp/entry/state.
Each fresh process re-verifies eleven files and reruns the same consumer/budget
read-only before any write. Only deterministic success allows B's alias-safe
publication/durability or C's durability/commit verification/commit.
For B use target-absent safety checks; a target appearing inside the already
authorized atomic operation uses the target-existing branch, never opening/
writing/truncating the temp there. A fresh scan with both target and temp
rejects, not a fourth recovery state. A read-only consumer watchdog leaves the
phase incomplete/replayable;
B/C are bounded manifest finalization, never generic partial-closure repair.
All other incomplete roots retain terminal behavior under the same diagnostic
stage/kind/path ordering.
The contract uses portable no-replace hard-link publication, not a new
renameat2 or Windows API dependency, and prefers fail-closed evidence integrity
over guaranteeing crash recovery for every write window. Interruption/watchdog
during read-only consumer replay or before the first write leaves the phase
incomplete and repeatable under the approved state classifier. Once any
eleven-file publication write begins, or during B's manifest temp/write/link/
unlink/durability steps (also normal publication from A), a crash may leave
a non-A/B/C snapshot, including manifest-plus-temp. That snapshot is terminal
PREFLIGHT_ASSERTION_FAILED:g8-freeze-lineage-binding and requires abandon/reopen.
No automatic deletion, backfill or reclassification may make it recoverable.
Alias-safe cleanup is only within an already admitted uninterrupted operation,
never before fresh-entry classification. Never restore an incomplete first
preparation's creation capability or reuse a partial eleven-file set: fresh
admission needs the complete verified A/B/C seal or committed root.
Supply all required values, never undefined defaults. Follow exact precedence:
mode-specific structural guard, structural transport/approval/historical-phase
checks, native-order-prefix-binding g7 then g8, consumer-decoder-binding,
then factory/mutation evaluation; use DES-M5-015's stage/index/path/AST-byte ties.
Envelope/recipe/source/helper failures use
PREFLIGHT_ASSERTION_FAILED:preflight-structural-transport. Never run a consumer
on an invalid prefix. Consumer failure uses
PREFLIGHT_ASSERTION_FAILED:consumer-decoder-binding and blocks Red.
A correction after complete F1 requires the existing eligible pre-Red
F2 superseding preflight, never in-place repair. Invalid partial publication
fails closed outside the ready-eleven/manifest-only exception; write-window
crashes use the portable publication boundary, not the read-only interruption
rule. No correction after first Red.

The approved source-index registry covers exactly 23 mutations, with source
array SHA a5ab48c352889f35f9902c0567c697337927452fc74fb7f953107d5674449543
and canonical mutationTable SHA
dfacfa903da1da85ccb59c793a9d00060f7de1d015907978fbc0188f13ea09c0.
inputs.json carries the table; preflight.json binds its SHA and checks.json's
complete ordered mutationResults. Added/removed/reordered/changed source,
wrong names/dispositions/checks or uncovered indices reject before Red.
Do not regenerate the expected table to accept an edit.
Require 20 rejections by the exact named structural check/diagnostic.
Indices 10/11/12 (kind/profile/runs) are only registered as deferred-to-green,
not executed or counted as passing/rejected preflight checks. Their Green
owner is TEST-M5-TEST-CLOCK-EVIDENCE-001 in tests/test-runtime-evidence.test.ts,
activationCases.mutations[index]: actual validateLegacyRuntimeActivation
must reject both plain and with-reconstruction variants with
TEST_RUNTIME_BOOTSTRAP_INVALID.*phase-runtime-transition. The Green loop
still evaluates all 23 source entries. Generation-6 mutation index 15 is not
the separate g7-foreign scenario. Necessary source/registry changes require
design review before Red; no new preflight validator or silent reclassification.

The positive valid object must pass all 20 checks through the SAME pure
evaluator used for mutation rows. cases[g8-positive].checks has exactly the
20 reject-row checkIds in registry order, expected=true/observed=true.
Missing/extra/duplicate IDs reject with PREFLIGHT_MUTATION_REGISTRY_MISMATCH;
false rejects with PREFLIGHT_ASSERTION_FAILED:<checkId>. Other generic
prerequisites remain mandatory in structuralChecks, not extra positive IDs.
Construct factory, changed and full mutations once in caseId=g8-mutations,
using one counter initialized once at zero and continuing through construction;
g8-positive reports that same valid, not a second factory invocation.
Other synthetic contexts, including g7-foreign, keep isolated counters.
inputs binds evaluationRecipe; checks/preflight binds UUID draws/counts and
factory boundary. Mutation 14 must produce a cycleId distinct from valid's,
otherwise registry mismatch blocks Red without reseeding/retrying.
The existing 23-row table, source-array hash and table hash are unchanged.

The isolated g7-foreign context calls the extracted factory once, then uses
DES-M5-015's named, ordered g7-foreign-rewrite-v1 recipe: clone/pin, retarget
identities, rebuild synthetic order suffix, Red chain and TDD digest, rebuild
checkpoint journal, rebind activation, verify/evaluate. Use exact pinned g7
approvals/checkpoints 3786/3788 and generationOrderPhase(7,...), including
the selected design:2 key rather than the earlier design key; retain cycle
IDs and distinct fingerprints, with no historical credit or unspecified
rewrite. inputs binds the recipe/pins and checks/preflight binds resulting
hashes/identities through g7RewriteResult. All 20 check IDs use the same
evaluator with unchanged g8 expectations. Exactly design-approval-reference
and generation-eight must be false with their named assertion diagnostics;
all other 18 must be true. Those expected failures are the required negative
outcome, not an overall preflight failure. Generic journal/order/hash/reference
checks must pass and both unchanged-condition defect predicates must be false.
No UUID draws occur during rewriting: g7-foreign finalCounter must equal
factoryEndCounter. Unexpected outcomes fail before Red without reseeding.

Use the existing byte-pinned approval cache sources, not the subsequently overwritten
live design approval: `.musubix/cache/g8-requirements-approved/prior-approval/.musubix/evidence/approvals/requirements.json`
(byte SHA-256 `fd2a90bb4a65d09d924b7790195f10b51e7570a21c76ad77896e451f651157de`)
and `.musubix/cache/g7-worker-observation-red-20260929/design-approval-record.json`
(byte SHA-256 `8f15732a02c49e5f6bb1d4692d042de5889427a46547cbb2c33aea9a2efb63f7`).
inputs.fixtureBindings.g7.approvalSources binds both paths/hashes. Read exact
bytes, preserve full objects and recompute their artifact hashes using the
existing approval identity algorithm; do not reconstruct approver/approvedAt,
which are protected by byte pins rather than artifact hashes.
Source failure uses PREFLIGHT_ASSERTION_FAILED:g7-approval-source-binding.
Cache files are ignored, not durable evidence. Each source descriptor also
binds archivePath=`preflight/approval-sources/<byteSha256>` relative to F and
archiveSha256=byteSha256; inputs/manifest/receipts carry the same two-entry
historicalApprovalSources binding. Once initial preflight determines F,
publish both raw byte copies atomically with no-replace/fsync/reopen/rehash,
complete the freeze closure, publish manifest last and commit before Red.
Relative archive paths prevent a manifest-hash cycle. All subsequent
preflight/replay/receipt checks read the archived raw files only; cache/live
fallback is forbidden. Partial publication blocks reruns except the exact
restartable sealed step-3 eleven-file/address-verified consumer read check without a
committed guard; every other partial rerun is terminal. Conflicting/corrupt
immutable archives or loss after publication require generation abandon/reopen.
When a preparation change before the first Red call/intent replaces published
F1 with F2, obtain both raw approval buffers only by reopening F1's committed
archives, rehashing against their bound byte hashes and comparing pinned commit
blobs. Cache/live approval paths are never reread after F1 manifest publication.
F2 inputs.manifestCore and manifest bind DES-M5-015's predecessorFreeze:
unique predecessor root/manifest SHA/commit and both source archive paths/hashes
plus F2-relative archive paths/hashes. Publish byte-identical F2 copies with
the same no-replace/fsync/reopen/rehash rules. Missing/drifted predecessors,
ambiguous lineage, differing copies or failed/interrupted partial replacement
publication outside the ready-eleven/manifest-only states remains fail-closed.
Fresh-process sealed read replay/fixed-manifest completion is the sole bounded
exception; read-only interruption is incomplete, but write-window crashes may
leave terminal non-A/B/C snapshots. Preserve both
roots; after Red the existing generation immutability forbids replacement.
Before preparing F2, check EVERY g8 freeze root for call intents/receipts;
any occurrence forbids supersession and requires abandon/reopen. Use
DES-M5-015's deterministic all-root scan before every call, each intent/receipt
publication and all recovery/republication for ordinals 1-27. The chosen F
must be the unique committed complete linear-chain tip, with no competing,
orphaned, cyclic, ambiguous or unfinished root and no other root containing
an intent/receipt. Bind activeFreezeRoot and the complete lineageSha256 into
every intent/receipt and compare against all roots, never a selected subset.
Failures are terminal PREFLIGHT_ASSERTION_FAILED:g8-freeze-lineage-binding;
this overrides the source diagnostic for lineage failures. Old-root recovery,
partial completion and post-Red supersession cannot bypass the guard.
All freeze destinations use only `.<destinationBasename>.tmp-<lowercase-v4-uuid>`
with DES-M5-015's exact grammar and same-directory target reconstruction.
Temps never count as published evidence. Only one at the active committed
tip may match the independently bound current target/operation/ordinal;
calls/ temps nevertheless count as attempts and forbid F2 supersession.
Non-tip/multiple/invalid/orphan/other-target temps or unrecognized entries
are terminal. Outside the single context, a temp invalidates root completeness;
precommit temps are limited to uninterrupted preparation OR B's single
manifest.json temp in bounded manifest-only finalization, never generic
unfinished-root/official-call recovery. Remove only after successful target rehash/directory
fsync and fsync removal; otherwise retain for diagnosis.
Diagnostic precedence is entry/name/temp, per-root manifest/completeness/hash,
then DES-M5-015's fixed graph-kind order, with its exact root/path lexical ties.
After the applicable structural guard (the bounded eleven-file guard ONLY in
step 3), run structural transport/approval/historical-phase checks, native
prefixes g7 then g8, consumer, then factory/mutation semantics, in that order.
The first structural violation selects the lineage diagnostic/details;
filesystem enumeration order and exception timing cannot select another error.
Recovery must use the alias-safe branches in DES-M5-015. If destination exists,
never open/write/truncate temp: verify expected destination bytes/hash and
identities/link counts, complete durability, unlink only temp, fsync and rehash.
If absent, require no-follow metadata/open/fstat proving a regular executor-owned
correctly permissioned temp with link count 1 before rewriting. Once hard-link
publication occurs, use only the non-writing branch. Any anomaly is terminal
lineage failure; a second crash cannot authorize published-destination mutation.
In uninterrupted preparation only context.root is excluded from the three
stage-2 missing/uncommitted checks and stage-3 committed graph. Every present
final file must equal independently prepared bytes. Compare prospective
manifestCore predecessor only after the committed graph passes, using final
graph kind prospective-predecessor-mismatch: exact root/manifest/archive
bindings, null only without committed roots, and a recorded ancestor commit
containing the exact closure, not necessarily equal to current HEAD.
Other unfinished roots are terminal. Initial failure merely blocks only before
ANY entry/root under B exists; once a root/temp/destination exists, failed or
interrupted arbitrary file creation cannot be reused. Content-verified
ready-eleven replay/manifest-only finalization and committed official-phase
recovery are the bounded exceptions. Read-only consumer watchdog expiry leaves
the phase incomplete; write-window crashes may leave terminal non-A/B/C snapshots.
Filesystem safety is explicit: traversed repository ancestors must be euid-owned
no-symlink directories without group/other write bits. Create B/root/descendants
one level at a time with non-recursive requested/effective 0700 mkdir, verify
no-follow uid/mode/identity immediately and fsync parents. Temps are exclusive/
no-follow regular euid-owned 0600 with fstat/link-count checks; destinations
remain 0600. Unsafe umask/effective modes reject, never later chmod/chown repair.
Platforms unable to prove these invariants fail before Red.
Every preparation starts with ordinary all-root guard and no exclusion.
Genesis B is absent or verified-safe empty; create safe ancestors, B, then
the ENOENT-checked root by exclusive mkdir. Only this process's volatile
dev+inode/nonce capability can authorize its preparation exception, rechecked
at every guard and never serialized/restored. Empty safe B alone can precede
a fresh attempt. Crash does not restore a creation lease; fresh-process
ready-eleven replay/manifest-only finalization uses its separate content guard,
with read-only watchdog expiry remaining incomplete. Write-window crashes
remain subject to terminal state classification.
Verify identifying commit ancestry and regular Git blob bytes against the
closure, HEAD/index/live files. Dirty/uncommitted closure is invalid; a valid
older recorded commit is not rejected merely because HEAD advanced.
The immutable Git closure has exactly the 12 individual paths enumerated in
DES-M5-015: manifest.json, preflight.json, three preflight recipe files, two
raw approval archives and five source copies. It is not eleven files, and
neither top-level JSON file is optional or inline-only. Verify EVERY listed
path as a normal non-executable blob in the identifying commit with identical
bytes and no dirty/untracked closure path. Manifest immutableClosure binds
the exact ordered list, path-list digest and aggregation kind; each lineage
root binds immutableClosureSha256 over all twelve complete files.
The aggregate stays outside the manifest to avoid self-reference while still
including its full bytes. Calls/receipts/reports remain later phase evidence,
not members of the immutable preparation closure.

Historical phase sources are the unique CHANGE-0017 generationHistory entry
with generation===7 in `.musubix/evidence/changes.json`, phases.requirements
and phases.design. Pin DES-M5-015's observed source and exact object digests
in inputs with the complete objects; archived inputs retain them without a
duplicate full projection. Apply its enumerated seven-key historical phase
schemas and four-key batch schemas before skipping those containers.
All four fingerprints have exactly impact, requirements, design, implementation,
tests, tdd, requirementImplementations; historical maps contain the six CHANGE
requirements and synthetic maps only the two serial requirements. Require
closed `{paths,fingerprints}` entries with digest-only leaves, pinned complete
historical objects, and synthetic equality
to the single original factory output except prescribed orders.
Synthetic entries use the pinned historical path inventories and the fixed
DES-M5-015 phase/requirement/path hash recipe, never discovered key sets.
Missing/extra keys or wrong values/hashes emit
PREFLIGHT_ASSERTION_FAILED:g7-phase-container-schema. No implementation-time
allowlist discovery; bind checked hashes in g7RewriteResult.phaseContainers.
After step 7, use DES-M5-015's deterministic JSON Pointer traversal and closed
skip list: only the verified old order prefix, two approvals and four separately
validated phase containers. Require the exact 28 generation paths with value 7,
eight raw g7 phase-key paths and two wrapped journal idempotency-key paths;
full values must match, and aliases are visited separately. Missing/extra paths
or other values fail PREFLIGHT_ASSERTION_FAILED:g7-identity-location-closure.
Keep the boolean summary in structuralChecks; record observed path/value lists
in top-level identityAudits in BOTH checks.json and parent preflight.json.
The closed identityAudits.g7IdentityLocationClosure object has schemaVersion=1,
checkId=g7-identity-location-closure, generation/rawPhase/wrappedIdempotency
arrays of closed {path,value} entries, literal counts 28/8/2 and sha256.
Require exact observed sets, strictly increasing JSON-Pointer lexical order,
no duplicates or extra keys, and sha256=H(the full audit excluding ONLY its own
sha256 field). Do not double-canonicalize bytes. Its four-field structural
summary {id,expected,observed,diagnostic} is true/true/null iff the traversal
and complete audit schema/sets/counts/hash validate; no optional audit payload.
Successful checks has exactly cases, structuralChecks, identityAudits,
uuidContexts, g7RewriteResult, nativeOrderReplay, consumerDecoder, mutationResults.
The parent's closed preflight fields add identityAudits and require the same
canonical audit as checks. checksSha256/preflightSha256 bind audit SHA/counts
through the existing manifest and twelve files, without an output hash in
inputs or a new file. Failure writes no new checks/preflight or partial audit:
emit the deterministic stderr diagnostic/pointer and exit nonzero. Observation
faults point into the traversed candidate; audit schema/order/count/parent-copy/
hash faults point to the ordinal-lexically first offending
`/identityAudits/g7IdentityLocationClosure/<field>` pointer. Use
`/identityAudits` for a non-object or extra sibling and
`/identityAudits/g7IdentityLocationClosure` for a missing/whole-object fault.
Prior cache results stay unchanged but cannot stand in for a failed invocation.
Watchdog interruption stays incomplete. Neither this structural check nor the
approval-source check changes the 20 evaluator IDs or 23 mutation rows.
For the post-3805 schema-only review, preserve 3805/g8:design:2, journal 940,
the corrected decoder and prepared inputs/harness/cache artifacts. The earlier
3804-to-3805 procedure is history, not a restart instruction. Do not prepare
approval, record checkpoint/workflow completion, edit tests/harness/evidence,
publish a freeze or run Red now. After renewed exact-hash design approval,
record no g8:design:3 supersession: checkpoint 3805 stays active, and the new
live approval gates only `tdd red`'s current-approval check. Manifest,
checkpoint and fixture approval aliases remain bound to artifact 28a2f554...
using preserved 78b67d9d.../inputs.json bytes verified by
`H(identity) === artifactSha256`, not the replaced live approval file.
Preserve the v2 preparation/harness unchanged and generate corrected v3
inputs/recipe at a new cache address. Resume after ordinary admission checks;
do not manufacture test churn to bypass unchanged-test admission.

Use mandatory crash-safe companion receipts for every Red/native report and
checkpoint. Each derives only from persisted phase/order/chain/checkpoint/
journal facts, stored runner exit/status/reportSha256 and matching live five
hashes. Do not claim transient outer CLI exit/argv as persisted evidence;
checkpoint recorded status has no process exit code. Archive exact native
bytes at the freeze store's `reports/<reportSha256>` before the receipt.
Bind archive path/hash and phase.reportSha256; Green's overwritten live
per-TEST report is never a historical Red validation source. Verify every
archive at batch acceptance.

Publish via exclusive same-directory temp, file fsync, atomic no-replace,
directory fsync where supported and reopen/rehash; existing content must
be byte-identical. Before every later phase call/intent, require its
predecessor receipt/archive to verify. Exact receipt reconstruction/republish
from persisted facts is permitted only before any later call/intent.
Torn/different receipt, unreconstructible facts/report, five-file drift
or a later call without its predecessor is terminal g8 abandonment/reopen
through the existing authorized CLI protocol, preserving all evidence,
branches and dirty worktrees and requiring fresh human approvals.
No post-later-call backfill or in-g8 source/repair exception is allowed.
Check all five whole-file hashes before/after calls, before each Green and
at batch Green, with no block-fingerprint fallback. A
pre-Red source/binding change requires a new preflight/manifest; no post-Red
test edit or replacement baseline is permitted. The temporary executor guard
does not fix or weaken generic TDD and remains until #51 is fixed and removal
is authorized. Record twelve fresh ordinary g8 Reds, one batch Red,
implementation/checkpoint, twelve unchanged-test Greens and one batch Green;
do not reuse g7 orders or approvals. Current recovery stops before human
requirements approval and does not edit tests or implement the runtime.

CHANGE-0017's proposed generation-8 runtime (not implemented) adds the optional TOP-LEVEL
testRuntime versioned extension following ADR-0009. Design fixes its kind,
schemaVersion, commandNames, calibration, reporterMode and exact 21-path input
inventory before approval, with canonical JSON+LF SHA-256
`f9fbe94729722eaaea1f1e49bbaf6c48053ea1ed6a8498a2287dbfe4a20bf06e`.
The existing approval-projection top-level allowlist excludes it unchanged;
the new gate fingerprint includes it. Effective policy matches a
(kind,schemaVersion)-keyed constant in packages/analysis/src/test-runtime.ts;
runtime does not query current approval records. Regressions prove constant/
design/config equality; policy changes require a new kind and fresh design
approval. No approval transfer or projection exception is added.
Parser/config-instance/candidate-gate changes follow fresh Red, not this proposal.
DES-M5-015 defines the closed inventory, coordinator-only
`.musubix/cache/test-runtime/<runId>/ack.json` (`test-runtime-ack-v1`),
and command-provenance hashes for TDD/result/integration.

Incomplete native commands are rejected before acknowledgment lookup with
`TEST_RUNTIME_BOOTSTRAP_INVALID: acknowledgment-binding`, preserving the actual
timeout/missing/error status and duration. A missing acknowledgment after a
completed command is also a closed failure; neither case fabricates provenance.
The configured command timeout remains unchanged.

Durable schemaVersion:1 authoritative objects live in journal-root CONTROL at
`.musubix/evidence/test-runtime/v1/blobs/<sha256>`: policy,
requests, input inventory/file snapshots, anchors, worker packets, dispatch,
acks and results. Before child/detached/source-pair cleanup, the parent
collects/rehashes/schema-verifies and publishes the closure to control, then
appends references. Failure rejects blob-io. POSIX publication requires file+
directory fsync and atomic no-replace. win32 explicitly lacks directory fsync;
file flush + atomic no-replace + post-write rehash follows the existing platform
contract without excluding Windows candidates.
reuse requires identical bytes. Transfers must include and verify the entire
reference closure. Missing/deleted/untransferred/tampered evidence rejects;
source input fingerprints and legacy encoding do not change just from blob
publication. Control commits blobs/references before plan clean checks, not in
assignment commits. Source-pair output manifests bind hashes after parent
publication without changing ordinary source schemas. Integration/handoff
verifies closure in control. This is not a new source-maintenance operation.

Reporter collection does not depend on Vitest config reporters. The profile-aware
coordinator/adapter appends the runtime reporter after constructing native
ordinary/focused/gate/matrix/codegraph argv, preserving JSON/default reporters,
outputFile, selection, counters and exits. Ack has a separate fixed path.
Configured commands/timeouts stay fixed, but effective reporter argv additions
are explicitly recorded. Bare unmanaged Vitest without the required explicit
reporter cannot claim the profile; it fails rather than silently falling back.
TEST-M5-TEST-CLOCK-AGGREGATE-001 covers CLI JSON override and grouped results.
The fixed worker symbol key is
`Symbol.for("musubix5.testRuntime.stableWallClock.install.v1")`; the sole Vitest
provider key is `"musubix5StableWallClockV1"`. DES-M5-015 specifies the exact
test-runtime-provider-v1 and test-runtime-install-v1 value schemas. Provider
publication occurs only in tests/global-setup.ts's globalSetup(TestProject).
Its existing build/validation runs first; after success it obtains validated
plain cloneable data from the Vitest-independent test-runtime.ts and calls
project.provide before returning. Failure rejects setup and prevents workers.
This intentionally appends g8 publication without suppressing/changing the
existing build behavior. Reporter/coordinator never provide; reporter context
reads via vitest.getProvidedContext occur only after setup/worker execution.
Worker setup validates/freezes the received provider and
publishes a deeply frozen, non-enumerable/non-writable/non-configurable marker
before test modules. The marker contains the actual installedNow reference,
anchor digest, profile/bootstrap digests and immutable calibration data, not
setters or request authority. Tests may inspect both via existing vitest inject
and native global property inspection; they need no future runtime import.
TS setup/tests use identical inline structural StableWallClockProviderV1 types
and typed ProvidedContext augmentation. Checked-JS vitest-setup.mjs instead
uses only `/** @type {(key: string) => unknown} */ (/** @type {unknown} */ (inject))`
with the exact key, then fully validates the unknown result. No unchecked
provider cast or .d.ts workaround is permitted. The explicit standalone
`npx tsc --strict --allowJs --checkJs --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck scripts/test-runtime/vitest-setup.mjs`
must pass; unvalidated use fails the boundary checks. MODULE-ORDER,
EVIDENCE-001 and AGGREGATE-001 cover lifecycle order/error isolation, typing
and late-only reporter correlation respectively.
Partial worker state rejects; valid duplicate imports retain identity and
local mocks, whose restore returns to installedNow. Non-Vitest Node children
use the same marker via validated preload inheritance without a Vitest provider.
MODULE-ORDER/MONOTONIC/TIMERS assert both active bindings before their full
behavior assertions. Old unprofiled workers yield undefined observations and
an ordinary selected assertion failure, not an import/setup error.
Worker packets/acks bind exact observation keys plus canonical provider and
marker-metadata hashes; functions are compared by identity, never hashed as text.
This fills the existing observation contract within the 21 inventoried paths,
not a new configurable policy member. Profile/gate/TRUST digests are unchanged;
the revised design still requires its own current human approval. Prepared
unrecorded tests remain uncredited until the complete approved fresh TDD cycle.
The parent appends reporters to validated --describe-groups native argv.
The pure .mjs codegraph wrapper consumes parent-prepared groups/requests/env/argv unchanged
and launches process.execPath plus root-local vitest.mjs; no TypeScript import
is required. Existing npm -- is reused, not duplicated. Flags precede a Vitest
terminator. All three runtime scripts are .mjs, with no undeclared .d.ts; use
node --check, checked-JS and actual Vitest/preload imports to validate them.

TDD cycle commandSha256 preserves the existing encoding of command plus merged
logical native/focused args BEFORE runtime additions. Runtime reporter/preload/
scoped environment and output additions instead have a closed canonical
augmentation digest and complete resolved execution binding in immutable
request/dispatch/result blobs and acks. Only this CHANGE's g8 serial runtime/
fingerprint batch may activate absent -> stable-test-wall-clock-v1 between Red
and Green. Legacy Red has no persisted config snapshot. Admission requires ALL:
valid enclosing schemaVersion:1/old phase shape with runtime fields absent
(not null/partial); strict design checkpoint < individual Red < batch Red
checkpoint < implementation checkpoint < individual Green in evidence-order
sequences; membership in the design's closed twelve-ID set; equal Red/Green
logical command hashes using the existing formula; only activation to the fixed
profile with complete Green runtime blobs/ack/provenance/augmentation; and
matching cycle/serial batch/CHANGE-0017/g8/repository plus exact requirements/
design approval SHAs and checkpoint journal/order bindings. New Green-only
activation metadata binds these existing references. Unknown schemas, foreign
bindings, equal/reversed orders and missing/tampered conditions reject.
Runtime absence is a bounded inference from legacy field absence, persisted
pre-activation order and the closed TEST set, not a claim about observed config
bytes. Git/worktree/config raw reconstruction is neither required nor allowed
as proof; no retroactive Red snapshot/ack is created. Verify TRUST read-only,
preflight only the approved post-design EVIDENCE helper correction and trace,
then record all individual Reds, one batch Red checkpoint, implementation/checkpoint,
all unchanged-test Greens and the batch Green checkpoint.
Native semantics remain in the logical hash, and
other structural augmentation transitions or unknown/missing additions reject.
Repository-relative runtime tokens and typed run slots yield root-independent
augmentation identity; actual absolute paths/anchors remain bound in blobs.
EVIDENCE-001/AGGREGATE-001 verify the change with fresh ordinary TDD.

TRUST uses a fresh ordinary g8 cycle, same TEST ID/path, under serial
REQ-M5-COMPAT-013 rather than parallel APPROVAL-007. After requirements/design
approval and checkpoints, verify read-only that archived g7 TRUST bytes already
contain the expected digest
`327baa0f399450fd6714f112e41bc23e13de79a9c1113499795ea76d87bcd03e`
and `@verifies REQ-M5-COMPAT-013` BEFORE Red, and that
`tests/candidate-gate-trust.test.ts` has whole-file SHA-256
`f1f6c2f9f26c764225a7a317357879dd85866365e8fd5cf2ddbd6cd273fd43be`.
TRUST must remain byte-identical and cannot count as the g8 design-to-Red
change. Only the approved EVIDENCE helper/fixture regions may change
post-design/pre-Red. Keep all TRUST annotations and unsigned-artifact/other
assertions unchanged. Removing testRuntime from the
design gate object yields current bb4a...; the expected native Red is exactly
that mismatch, not setup/module failure. Trace build/check precedes official
Red; implementation and Green follow with no further test changes.
TDD-003's greatest verified terminal order selects the new cycle, as in the
existing CHANGE-0005 -> CHANGE-0013 TRUST precedent. Older terminals remain
unchanged; ordinary credit is new and recorded once. This is not source
supersession or dedicated human source approval. Temporary TDD_TEST_STALE
before successful Red must not be presented as a passing gate.
QUALITY-COMPLETENESS is separate: preserve its test and resolve current
integration evidence rather than editing its assertion.

The test clock affects Vitest workers and marked Node descendants, which can
include build/typecheck/pack. Commands outside that process tree are unchanged.
Consumer/package isolation uses an environment copy with BOTH runtime marker
and preload removed and checks tarball contents. A fresh nested Vitest with
neither may start independently; partial bindings reject. new Date(), filesystem
mtimes and Git remain host-wall based, including ownerless lease admission.
No production lease semantics or existing test thresholds change.

Ordinary repository architecture indexing will reserve exactly normalized
root-relative `benchmarks/codegraph/labeled/**` for benchmark truth fixtures
and exclude it consistently from index/cache/impact/gate. This is consumer
visible: other repositories using that exact prefix will also exclude those
files from ordinary architecture input. Do not place production source there;
production imports into excluded fixtures remain diagnosable. Other benchmark
directories and production cycles are not suppressed. Explicit indexing with
the corpus itself as root, including materialized benchmark roots, still
includes the intentional cycles and their expected-cycle metrics. Existing
ordinary graph caches must be rebuilt under the new scope policy.

This notice registers the proposed COMPAT-013 surface before implementation;
it does not claim the current binary already provides it.

## Node.js 24 candidate matrix

GitHub Actions now installs Node.js 24 for candidate verification, release, and
npm publication. The candidate matrix emits one opaque envelope artifact for
each of Ubuntu, Windows, and macOS. The published package runtime contract
remains Node.js `>=20`, but Node.js 20 and 22 are no longer continuously
verified by the candidate matrix.

Persisted Ubuntu/20, Ubuntu/22, Windows/22, and macOS/22 candidate-gate records
remain readable for historical status and deletion invalidation. They do not
satisfy or block the current three-job matrix. Ingesting a new envelope for one
of those retired identities fails with `RELEASE_GATE_EVIDENCE_STALE` and
persists no record. Historical candidate snapshots can therefore report
`candidateGateStatus: missing` under the current matrix.

Any in-flight candidate created before this change must rerun candidate gates
to produce Ubuntu/24, Windows/24, and macOS/24 evidence before release approval.

## Portable candidate state paths

Candidate and integration logical IDs remain unchanged in journal, evidence,
CLI, and JSON contracts, but persisted owner directories now use canonical
`candidate-<64-lowercase-hex>` and `integration-<64-lowercase-hex>` filesystem
keys. Raw colon-bearing logical-ID directories, percent-encoded aliases, case
variants, symlink aliases, and other noncanonical owner members are not read or
automatically migrated.

Repositories with unreleased candidate state created under a noncanonical
directory must recreate that candidate state with the current CLI. Detection is
fail-closed with `CANDIDATE_STATE_OWNERSHIP`; the CLI does not delete or merge
unknown state automatically. Deep checkout locations can also exceed the
platform path API limit even though the fixed repository-relative owner-root
budgets remain within 95 characters for candidates and 112 characters for
integrations. Move the repository to a shorter absolute path before recreating
the candidate only when `CANDIDATE_STATE_OWNERSHIP` reports that platform path
rejection.

## Approval manifest extensions

Native musubix5 approvals use `approval-manifest-schema-v1`. Requirements and
design approvals read selected raw files from the invoking `--root` worktree
using `approval-normative-path-set-v1`, including domain-scoped feature paths,
non-transitive ADR references parsed from design `ADRs:` fields, and
required-path failure behavior. They also bind effective, default-resolved
configuration projections. If `approval.domains` is nonempty, `--domain` is
mandatory for requirements and design; release is always repository-wide and
rejects `--domain`. Making an implicit default explicit does not change the
hash, but changing a declared default does and requires renewed approval.

Release approval reads the persisted candidate commit rather than mutable
worktree files. Create that immutable binding with:

```bash
# Record terminal full-set quality, validate approvals, then commit every
# candidate input and resulting evidence change so the worktree is clean.
CHANGE_ID=CHANGE-0123
npx --no-install musubix5 candidate-snapshot create "$CHANGE_ID" --json
# Commit the generated .musubix/journal/normal/<order>.json evidence without
# amending the candidate, then run candidate-bound gates and prepare release.
```

Creation requires the named CHANGE to be the sole active CHANGE, current
requirements/design approvals, terminal full-set quality, and a clean reachable
owned branch. Its JSON reports a stable `snapshot-<12-digit-order>` ID,
generation, repository/branch/commit, candidate-tree manifest digest, journal
path, replay state, and guidance. Committing the journal does not change the
candidate: QA is checked out at the persisted candidate commit.

Inspect lifecycle state with:

```bash
npx --no-install musubix5 candidate-snapshot list --json
npx --no-install musubix5 candidate-snapshot show "$CHANGE_ID" --json
npx --no-install musubix5 candidate-snapshot show snapshot-000000000123 --json
```

Only one repository-matching live snapshot is allowed. To replace it, retire it
explicitly and then create the new candidate:

```bash
npx --no-install musubix5 candidate-snapshot delete \
  snapshot-000000000123 --deleted-by "$USER" --confirm --json
npx --no-install musubix5 candidate-snapshot create "$CHANGE_ID" --json
```

Deletion appends a tombstone and never removes the creation record or Git
commit. A snapshot selected by a current release approval is protected. For an
active CHANGE, reopen its generation before retrying deletion. For a completed
CHANGE, first make it the sole `status: active` document, then run
`change-record <change-id> impact --reopen`.

Legacy snapshot records remain listable/showable/deletable but project null
generation, manifest digest, and creation time and require replacement before a
new release approval. A legacy record selected by a valid historical release
approval remains protected and cannot be deleted until that approval is made
non-current through the same reopen procedure. Foreign records are visible but
do not block a clone or fork from creating its repository-matching candidate.

Git object IDs widened consistently across candidate snapshot persistence,
approval candidate resolution, candidate-gate evidence, parallel/TDD start
commits, release-operation records, release and npm workflow inputs, shell
guards, ancestry checks, and attestation/context identities. Every changed
boundary accepts only lowercase hexadecimal IDs from 40 through 64 characters;
shorter, longer, uppercase, and non-hexadecimal values are rejected.

The release manifest applies this closed first-match exclusion registry:

| Precedence | Reason | Predicate |
|---:|---|---|
| 1 | `symlink` | Non-normative symbolic-link blob; symlinks at the four normative release path patterns fail with `APPROVAL_NORMATIVE_SYMLINK` instead |
| 2 | `generated-trace` | `.musubix/trace/index.json` or migration-era `.musubix/features/*/trace.json` |
| 3 | `package-archive` | `**/*.tgz` |
| 4 | `log-directory` | Blob below a lowercase `log`, `logs`, `session-log`, or `session-logs` directory segment |
| 5 | `historical` | `docs/history/**` |
| 6 | `run-local` | `.musubix/runs/**` |
| 7 | `release-self-reference` | `.musubix/evidence/approvals/release.json` or `.musubix/evidence/approvals/native/release.json` |
| 8 | `gate-self-reference` | `.musubix/evidence/formal.json`, `.musubix/evidence/model-correspondence.json`, `.musubix/evidence/mutation.json`, `.musubix/evidence/performance.json`, `.musubix/evidence/quality.json`, or `.musubix/evidence/native/test/**` |
| 9 | `foreign-change-evidence` | A lowercase-suffix `.json` blob at or below `.musubix/evidence/` whose effective nonempty CHANGE ID differs byte-exactly from the active CHANGE |

For rule 9, a nonempty top-level `changeId` wins over
`metadata.changeId`. When no active CHANGE is bound, the rule never matches.
Invalid JSON, non-object roots, and missing or empty IDs remain included.

Included blobs are displayed with raw SHA-256. Excluded blobs are displayed
with reason and raw SHA-256, but excluded raw hashes are informational and do
not enter the aggregate; their normalized path/reason pairs do.

Candidate lifecycle and manifest construction use these classified diagnostics:

| Diagnostic | Meaning |
|---|---|
| `APPROVAL_DOMAIN_MISMATCH` | Missing, unexpected, colliding, or unknown domain |
| `APPROVAL_NORMATIVE_MISSING` | Required normative path or referenced ADR is absent |
| `APPROVAL_NORMATIVE_SYMLINK` | Normative path, ancestor, or other selected non-regular path is unsafe |
| `APPROVAL_CANDIDATE_MISSING` | No non-deleted snapshot remains; run the reported `candidate-snapshot create` command |
| `APPROVAL_CANDIDATE_UNAVAILABLE` | Live evidence is invalid, foreign-only, legacy, non-current-generation, conflicting, unreachable, or otherwise unresolvable; inspect and follow list/delete/create guidance |
| `CANDIDATE_SNAPSHOT_MISSING` | `show` has no matching record, or a CHANGE-ID `delete` selector has no repository-matching creation record to delete or replay; an exact snapshot ID can resolve foreign-repository or unknown-CHANGE history |
| `CANDIDATE_SNAPSHOT_CONFLICT` | More than one live record prevents CHANGE-ID selection or creation |
| `CANDIDATE_SNAPSHOT_PROTECTED` | Current release approval protects the snapshot; reopen before deletion |
| `CANDIDATE_SNAPSHOT_ALREADY_DELETED` | The snapshot was already deleted by a different actor |
| `CANDIDATE_SNAPSHOT_APPROVAL_STALE` | Creation requires current requirements/design approval; run `musubix5 approval validate` |
| `CANDIDATE_SNAPSHOT_QUALITY_STALE` | Creation requires current full-set quality evidence |
| `JOURNAL_IDEMPOTENCY_CONFLICT` | The same candidate idempotency identity was reused with a different persisted branch or payload; inspect the existing snapshot and journal before retrying |
| `CLI_ERROR` for candidate journal evidence | `create`/`delete` found malformed snapshot/tombstone evidence or a snapshot-attributable chain/order defect; `list`/`show` found any shared-journal defect and intentionally do not attribute it by record kind |
| `CHANGE_CHECKPOINT_JOURNAL_INVALID` | Snapshot create/delete found a checkpoint-attributable shared-journal defect, or gate/status found any shared-chain defect; repair checkpoint/journal evidence before continuing |
| `APPROVAL_PATH_ENCODING` | A selected path is not valid UTF-8 |
| `APPROVAL_PATH_COLLISION` | Distinct paths normalize to the same NFC identity |
| `APPROVAL_GITLINK_UNSUPPORTED` | Candidate tree contains a Gitlink/submodule |

These schema, projection, candidate-tree, exclusion, display, and diagnostic
extensions intentionally change approval output and aggregate hashes from
musubix3. Bootstrap approvals recorded by pinned musubix3 remain development
authorizations only and must be re-recorded natively before release readiness.

## Configuration and gate extensions

- `approvalAutomation` is a versioned musubix5 configuration extension. It is
  manual by default. An absent key materializes the approved default object.
  Its modes and limits are bound by a separate normative design digest, so
  enabling verified-auto requires a new design approval with the revised
  extension digest.
- When required command verification has no configured commands, musubix5
  preserves the musubix3 `skipped` check status, gate exit code 1, and status
  exit code 0 with `ready: false`, and adds a structured `missing-command`
  diagnostic.

## Bootstrap command extension

musubix5 adds explicit `bootstrap run`, `bootstrap resume`, and
`bootstrap status` commands. They have no musubix3 equivalent, are never
invoked by normal commands, and cannot produce normal approval, quality, or
release authority.

## Parallel development extensions

musubix5 adds the top-level `parallel` command with plan, preparation,
assignment, status, integration, handoff, and cleanup groups. Parallel plans
are bound to one active CHANGE generation and use managed assignment,
detached-verification, and integration worktrees below the repository's Git
common directory. Assignment worktrees do not write `.musubix/**`; TDD runners
may execute in an assignment worktree while evidence is recorded at the
control repository root through the added `tdd red`, `tdd green`, and
`tdd refactor` workspace and parallel-provenance options.

Result admission captures the complete NUL-delimited Git tree with a dedicated
64 MiB byte limit and 30-second timeout. Overflow, Git failure, timeout, or an
unterminated record fails closed with `PARALLEL_RESULT_UNVERIFIED`; no partial
tree is admitted. The general runner's 1,000,000-character output cap is unchanged.

Fresh verification and integration worktrees run only the immutable plan's
`provisionCommandNames`, resolved against its approved policy. For projects
requiring local npm dependencies, select `npm-ci` when creating the plan.
Provisioning an assignment does not provision its detached verifier. An empty
selection never implicitly runs an available policy command or copies dependencies;
assignment retries preserve that selection.

Integration records consumed assignment ranges as provisional provenance,
runs the complete configured verification set in the integration worktree,
and promotes provenance to verified only after every required check passes.
Candidate handoff remains fast-forward-only. Existing Skills are preserved;
the three parallel-development Skills are additive.

`parallel status --change-id <id>` and targeted stale cleanup accept a known
active, abandoned, or completed CHANGE for maintenance visibility. They never
make a generation current and never grant evidence credit. Stale cleanup
retains branches, removes only clean managed worktrees belonging to stale
plans, preserves active plans, and appends only the non-credit maintenance
record associated with the selected historical generation.

## TDD repair extension

musubix5 adds an append-only repair workflow for a stale parallel-bound TDD
cycle. Normal mode is:

```text
tdd repair <test-id> --cycle <cycle-id> (--replacement-cycle <cycle-id> | --retire) --approver <name> --reason <text> --confirm
```

A pending partial repair blocks every TDD writer until it is completed with
`tdd repair --resume <operation-id> --confirm` or audited as unrecoverable with
`tdd repair --abandon-pending <operation-id> --approver <name> --reason <text>
--confirm`. JSON authorization details use `domain: null` when approval domains
are not configured. Successful abandonment is retained in the non-credit
`repairAbandonments[]` projection; it does not create repair disposition or
TDD credit.

All added `TDD_REPAIR_*` diagnostics are domain failures with exit code 1:

| Diagnostic | Meaning |
|---|---|
| `TDD_REPAIR_TARGET_INVALID` | The selected cycle is missing, ambiguous, foreign, not parallel-bound, not stale, or lacks an unambiguous retirement fallback |
| `TDD_REPAIR_BINDING_MISMATCH` | Persisted cycle/order/parallel binding does not match the requested repair |
| `TDD_REPAIR_ALREADY_RECORDED` | The target already has a completed incompatible repair |
| `TDD_REPAIR_REPLACEMENT_INVALID` | The proposed replacement cycle is not an eligible current replacement |
| `TDD_REPAIR_CHAIN_INVALID` | Repair would violate journal, order, or hash-chain continuity |
| `TDD_REPAIR_AUTHORIZATION_INVALID` | Current requirements/design approval or configured domain authorization is missing, stale, or mismatched |
| `TDD_REPAIR_PENDING` | An incomplete repair operation blocks all TDD writers; details include `operationId`, `testId`, and `targetCycleId` |
| `TDD_REPAIR_RESUME_INVALID` | The requested operation cannot be resumed because it is missing, completed, invalid, mismatched, or has incompatible partial projections |
| `TDD_REPAIR_ABANDON_INVALID` | The operation is not an abandonable pending repair or conflicts with existing abandonment evidence |

## Workflow declaration correction extension

musubix5 adds `workflow declaration supersede` for the narrow case where a
completed workflow declaration was accidentally recorded again, the later
declaration currently reports declaration-scoped `WORKFLOW_INVOCATION_REUSED`,
and the lowest-positioned identical canonical declaration is bound to an unused
completed Skill invocation by current persisted workflow-verification
evidence. The command does not delete or rewrite the declaration and is not a
waiver. It appends a CHANGE-lease- and fencing-protected correction that
identifies the later duplicate and canonical declaration by absolute event
position and digest.

Only a declaration-scoped `WORKFLOW_INVOCATION_REUSED` may be corrected. The
canonical declaration must have been independently bound to an unused
completed invocation when the correction is recorded. During later
reconciliation, the corrected duplicate consumes no invocation and does not
advance the Skill cursor; it is reported as informational audited superseded
history. Corrections are stored in a separate append-only correction store, not
in `workflow.events`, so declaration positions, declaration digests, and the
verified workflow-events head do not change when a correction is appended. For
three or more identical declarations, each later duplicate needs its own
correction and all corrections use the lowest-positioned canonical declaration.
A corrected declaration cannot later receive a workflow waiver. Duplicate
identity is version- and provenance-scoped, so a cross-version or
cross-provenance repetition requires abandoning and reopening the generation.
Declarations without explicitly persisted CHANGE, generation, and requirement
ownership, sole missing declarations, failed or incomplete invocations,
cross-CHANGE or cross-generation declarations, transcript-level duplicate
events, and declarations already covered by a current waiver remain
non-correctable.

`WORKFLOW_BINDING_MISSING` remains the companion declaration diagnostic when a
completed declaration cannot bind an invocation. A valid correction suppresses
that code only for the corrected duplicate together with its
`WORKFLOW_INVOCATION_REUSED`; canonical and unrelated declarations retain their
normal diagnostics.

## CHANGE ownership and implicit generation selection

`workflow-record` adds `--change-id <id>` so a declaration can be bound to one
specific active CHANGE generation. The stored declaration includes that
CHANGE, generation, and requirement ownership. Unknown or conflicting explicit
owners fail with `WORKFLOW_CHANGE_MISMATCH`; known but completed, abandoned, or
otherwise ineligible owners fail with `CHANGE_GENERATION_PHASE`. Omitting the
option remains valid only when ownership is unambiguous.

Implicit generation-bound commands now select the sole CHANGE document whose
frontmatter has `status: active`. Completed CHANGE documents remain historical
and are excluded from implicit selection. A legacy CHANGE document with no
`status` remains active when its persisted chronology has a positive active
generation without terminal full-set quality, a null active generation after
abandonment, or no generation chronology yet; it is treated as completed after
terminal full-set quality with no later active or abandoned generation.
Selection never rewrites the document.
If more than one document is active, stateful commands and gate fail with
`CHANGE_GENERATION_MIXED` until repository authors set `status: completed` on
each finished document and leave exactly one active document; `status` remains
read-only, exits zero, reports the diagnostic, and keeps `ready: false`. An
active document may temporarily have a null generation after abandonment;
status reports the abandoned history and the reopen command while pass-producing
operations remain blocked.

## Generation abandon and reopen extension

`change generation abandon <change-id> --reason <text> --approver <name>
--confirm` preserves the incomplete generation as non-current history and
leaves no active generation. Missing confirmation or malformed usage is
`CLI_ERROR`; an ineligible lifecycle state is `CHANGE_GENERATION_PHASE`.
Approvals, TDD, pass-producing evidence, and phase recording remain blocked
until `change-record <change-id> impact --reopen` creates or resumes the next
generation.

Both abandon and reopen validate lifecycle eligibility before acquiring the
CHANGE lease, revalidate after acquisition, reconcile all journaled checkpoints
for the departing generation, and only then snapshot or abandon it. During the
no-active-generation interval, gate exits 1, status exits 0 with `ready: false`,
and explicitly targeted parallel status or branch-retaining stale cleanup
remains available only as non-credit maintenance.

## Same-generation approval checkpoint extension

When a requirements or design approval becomes stale inside an active
generation, recording the newly approved phase appends a superseding lifecycle
checkpoint and retains the earlier checkpoint as history. Supply
`--operation-id <id>` matching `^[a-z0-9][a-z0-9-]{0,63}$`; the option is
rejected for the initial checkpoint and required only for supersession. Replay
is scoped by CHANGE, generation, phase, and operation ID, and is checked under
the CHANGE lease after journal-only recovery but before current-state
validation. Exact replay therefore returns the persisted success even after
projection; divergent reuse or a distinct operation against a still-current
checkpoint returns `CHANGE_GENERATION_DUPLICATE`.

The public semantic phase key remains
`change:<changeId>:g<N>:<phase>`. The normal-journal idempotency key is
`change-phase-checkpoint:<changeId>:g<generation>:<phase>:<operationId>`, and
the record persists its approval head, requirement IDs, fingerprints, ordinal,
semantic/evidence-order keys, timestamp, and fencing token. Recovery uses only
those persisted inputs. Invalid checkpoint journal evidence reports
`CHANGE_CHECKPOINT_JOURNAL_INVALID`; gate fails while status remains readable
with `ready: false`. The evidence-order ledger uses
`requirements:<n>` or `design:<n>` after ordinal 1, and `changes.json` exposes
`requirementsHistory`, `designHistory`, `requirementsOrdinal`, and
`designOrdinal`, with operation IDs on superseding checkpoints.
Ordinal-1 checkpoints omit the `operationId` key entirely; they do not persist
`null`, an empty string, or a generated placeholder. Cross-phase
checks use the greatest predecessor checkpoint whose order is less than the
dependent record, so later approval checkpoints do not retroactively reorder
existing TDD batches. Gate and status always include
`unprojectedPhaseCheckpoints`, including an empty array; pending entries are
informational unless their journal evidence is invalid. Reopen snapshots these
history fields with the completed generation, clears them from the new active
generation, and restarts ordinals at 1.

## Release operation authorization

Release approval does not authorize publication, tag creation, or pushing to a
remote. Each external operation requires a separate explicit human
authorization bound to the exact candidate.

musubix5 adds `release-operation authorize`, `release-operation validate`, and
`release-operation status`. New authorization records use schema version 2,
support the closed scopes `publish`, `release`, `tag`, and `push`, and bind the
full 40-to-64-character lowercase hexadecimal candidate object ID, release-
approval SHA-256, release tag, and authorizer into their authorization digest.
Uppercase and non-hexadecimal object IDs are rejected.
Schema-version-1 records remain
readable for historical status but cannot authorize workflow side effects.
Release automation uses the candidate-built `validate` command against a
separate post-candidate evidence checkout; it never trusts the approval digest
reported by the authorization record without independently validating the
current release approval.

Release runs may be retried with the same still-authorized operation record
when they fail before the corresponding side effect. Npm publication is a
separate dispatch of `.github/workflows/npm-publish.yml` with `release_tag`,
`evidence_commit`, and `publish_operation_id`; it publishes the exact stable
GitHub Release tarball and never reconstructs the package. If publication
reports `RELEASE_PUBLISH_INTEGRITY_MISMATCH` or
`manualReconciliationRequired: true`, do not rerun `npm publish` after the
version exists. Use the read-only
`npm view musubix5@<version> dist.integrity --json` command and compare it with
the SHA-512 SRI of the exact Release tarball. A missing or mismatched result
requires investigation and a corrected candidate with a new patch version;
never overwrite or republish an existing npm version.

## Evidence migration

Do not copy musubix3 or musubix4 generated evidence into musubix5. Recreate
requirements, design, approvals, TDD, trace, graph, workflow, quality, release,
benchmark, and waiver evidence using musubix5 in the destination repository.

### Candidate Unix-socket temporary-directory behavior

Candidate verification no longer overrides the runner's `TMPDIR`. Unix-socket
regression tests instead create a unique mode-0700 directory under the platform
fixed POSIX `/tmp` directory, independent of the platform default temporary
directory, bind through a bounded short alias, and retain the socket entry in
the target `.musubix` directory for the duration of the test. Callers should
not depend on the former workflow-level `TMPDIR` value. This is a CI-internal
portability correction governed by `REQ-M5-CI-002` and `ADR-0022`; it does not
change the public CLI or JSON compatibility surface governed by
`REQ-M5-COMPAT-013`.

### TDD source-currency chronology

TDD source-currency validation, fingerprint migration, and void fallback use
verified monotonic evidence order instead of evidence-array position.
Source-currency validation may select a newer verified scoped Green fingerprint
instead of an older legacy unscoped cycle. During an active CHANGE,
`tdd migrate` and `tdd void` operate only on cycles in the active generation
whose CHANGE owner is absent or matches the active CHANGE; complete or abandon
the active CHANGE before repairing a foreign or prior-generation cycle.
When a CHANGE is selected but has no active generation, validation retains
`CHANGE_GENERATION_PHASE`, while `tdd migrate` and `tdd void` treat maintenance
as having no active operation scope and consider all cycles for the test.
`tdd migrate` rejects a blank or whitespace-only approver before persistence,
using the existing approver-required error and exit code 2; historical
migrations with such an approver are reported with
`TDD_LEGACY_OR_UNSCOPED_EVIDENCE`. Because active migration does not mutate or
use foreign void candidates, its record can remain globally non-current when a
later foreign or prior-generation void bounds repository-wide validation;
complete or abandon the active CHANGE before repository-wide repair.
If no cycle for the test exists at all, migration retains
`No TDD cycle found for <testId>.`; if cycles exist but none has an eligible
Green terminal in the active operation scope, it retains
`<testId> has no valid Green phase to migrate.` Both remain exit-code-2 errors.
A cycle-ID-less or chain-unverified record now follows that no-valid-Green path
instead of the legacy missing-cycle-ID migration error. After verified
selection, any existing migration record, including malformed evidence, retains
`<testId> has already been migrated.` with exit code 2 and is not overwritten;
record a genuine new Red/Green cycle to establish later current evidence.

CodeGraph resolves explicit TypeScript `paths` aliases against the nearest
configuration's source targets, including extensionless targets inside ESM
packages. Exact mappings precede wildcard mappings; wildcard selection uses
the longest matching prefix, and target alternatives retain their configured
order. This source-only fallback does not change ordinary Node package or
relative-import resolution. Missing mapped sources still emit
`GRAPH_UNRESOLVED`, and existing graph caches rebuild for the analyzer revision.

Open TDD work suppresses `TDD_TEST_STALE` only when it is relevant to the
currency target. During an active CHANGE, only work in the active generation
whose CHANGE owner is absent or matches can suppress. Without an active CHANGE,
unscoped work can suppress, while scoped work must match the unbounded greatest
terminal's CHANGE and generation; that scope is fixed before a void boundary is
applied. Foreign or prior-generation open work therefore does not hide a stale
diagnostic for an active target.

The `tdd void` CLI keeps its existing help, JSON shape, exit classes, valid-Green
and already-voided message strings, and no-fallback reason string. Verified
event order and scoped structural guards can change which retained message
applies to a repository state. During an active CHANGE, a test with cycles only
outside the active operation scope now returns `{ voided: false }` with an
exact reason `<testId> has no verifiable dangling TDD cycle in the current
operation scope.` and exit code 1 rather than selecting foreign or
prior-generation evidence; the same result protects a cycle bearing an
unverified void record from being overwritten. Fallback selection is also
restricted to the active operation scope, so a foreign or prior-generation
passing cycle no longer permits the void; the command returns the unchanged
no-fallback reason with exit code 1. Complete or abandon the active CHANGE
before retrying repository-wide repair. These are intentional compatibility differences
governed by REQ-M5-TDD-003, REQ-M5-COMPAT-013, and ADR-0023.

Because active validation can select a newer foreign or prior-generation
terminal while maintenance commands remain active-scoped, a stale diagnostic
can require either a genuine new Red/Green cycle in the active scope or
completion/abandonment of the active CHANGE followed by repository-wide
migration or void repair. Maintenance evidence must not mutate foreign history
merely to clear the active gate.

For an in-place upgrade of an existing musubix3 repository:

1. Preserve normative requirements, designs, ADRs, configuration, source, and
   tests.
2. Expect prior generated evidence to be reported as
   `incompatible-evidence`; it must not satisfy a musubix5 gate.
3. Revalidate requirements and constitution, obtain current requirements and
   design approvals as needed, rerun Red/Green evidence for changed
   requirements, then regenerate trace, graph, workflow, quality, and release
   evidence in lifecycle order.
4. Keep the legacy `MUSUBIX3_Z3` and `MUSUBIX3_LEAN` solver environment
   variables valid. Any future `MUSUBIX5_*` equivalents are additive aliases.

The requirements and design approvals used to bootstrap musubix5 development
may be recorded by the pinned musubix3 tool. They authorize entry into the next
development phase but are not current musubix5 release evidence. Before release
readiness, the same current manifests must be reviewed and approved through the
native musubix5 approval implementation.
