# Legacy Capability Adoption Register

Status date: **2026-10-07**
Target repository: **PetrFedin/synth-v2**
Audit baseline: **main@af135bcf8e79aea739019b172395c4f25d653778**
Donor repositories: **PetrFedin/Projects**, **PetrFedin/syntha**
Authority: this document governs donor adoption only. **ARCHITECTURE.md remains the single product/runtime authority.**

---

## 0. Why this register exists

The goal is not to “move features from old repositories”. The goal is to strengthen the current Synth-v2 without reintroducing the architectural problems that the current project has already removed.

Every donor capability is therefore evaluated against five questions:

1. **Does Synth-v2 already solve the problem?**
2. **If yes, is the current implementation stronger?**
3. **If no, is the donor idea still strategically useful?**
4. **If useful, what is the correct native Synth-v2 shape rather than the legacy shape?**
5. **How does it connect to canonical Product, Commercial, Production, Supply, Economics, Trust and UX authority without creating a second source of truth?**

A donor capability is never copied because it exists. It must earn one of these dispositions:

- **ADOPT** — concept and most behavioural rules survive;
- **ADAPT** — business capability survives, implementation is redesigned;
- **REPLACE** — donor idea is useful but current Synth-v2 authority is stronger;
- **REJECT** — do not migrate;
- **NATIVE-NEW** — not present in donor, added because it materially strengthens the adopted capability.

---

## 1. Repository and concurrency baseline

### 1.1 Current Synth-v2 truth

Current canonical spine remains:

`ProductStyle → StyleVersion → Colorway → ProductSku → ProductReadinessSnapshot → CommercialProductProjectionVersion → CommercialPublication → PriceListVersion → BuyerCatalogVersion → Selection → WholesaleOrder → OrderCommitSnapshot → SupplyCommitment → Shipment/Receipt → ActualCostLedgerEntry → LandedCostSnapshot → CostAllocationRunSnapshot → MarginActualizationSnapshot → CostCloseReadinessSnapshot → CostCloseSnapshot → PostCloseAdjustment → PostCloseAllocationReconciliationSnapshot`.

No adopted capability may bypass or replace that chain.

### 1.2 Existing live surfaces that must be reused

Synth-v2 already contains:

- Product Identity and immutable versions;
- BOM/material/sourcing and material purchase flows;
- measurements, tech pack, samples and quality;
- operation sequences, production orders and production execution;
- inventory, material lots and traceability;
- showroom, selection, order, amendment and immutable commit revisions;
- supply, fulfillment, receipt claims and recovery;
- cost, landed margin and close;
- Supplier Passport / Trust layers;
- **Awaiting Action** as a derived “whose move is it?” projection;
- calendar milestones;
- notification projection;
- object history;
- Omnidata Design System v1 and responsive UI validation.

The adoption programme extends these surfaces. It does not fork them.

### 1.3 Existing branch/PR conflicts that must not be ignored

There are two important concurrent branches:

**PR #5 — “feat: add collaboration and calendar foundation”** is a stale August branch based on a much older main. It already experimented with:

- `collaboration_threads`;
- `collaboration_messages`;
- generic calendar events;
- `COLLABORATION_READ/WRITE`;
- a dedicated collaboration command table.

It is useful as a historical donor, but **must not be merged as-is** because current main now has a global command registry, richer authorization, Awaiting Action, a newer calendar implementation, significantly broader entity topology and stricter architecture/UX contracts. This programme supersedes its implementation, not its intent.

**PR #242 — AI Product Engineering authority** is an active draft and claims migrations 165–169 on its branch. Current main contains migration 165 for Supplier Trust revocations. To avoid migration-number collisions, this programme does **not** allocate persistent schema in the first domain-kernel commit. Persistent collaboration/exception migrations should be numbered only after #242 is rebased/renumbered or merged; reserve **170+** as the preferred range if 166–169 remain occupied.

---

## 2. Non-negotiable adoption rules

### 2.1 No duplicate authority

Never create:

- a second Product Master;
- a second order lifecycle;
- a second inventory balance;
- a second supplier score;
- a second commercial publication;
- a second cost/margin ledger;
- a second task truth that duplicates Awaiting Action;
- a second calendar truth for deadlines already represented by canonical calendar milestones.

### 2.2 Immutable facts stay immutable

Corrections are expressed by:

- revision;
- superseding decision;
- reversal;
- adjustment;
- reconciliation;
- new evidence;
- new exception state transition.

No adopted feature may silently mutate historical commitments.

### 2.3 AI remains proposal-only

AI may:

- analyse;
- rank;
- explain;
- extract;
- compare;
- propose;
- detect inconsistency;
- suggest next action.

AI may not bypass a Synth-v2 domain command, policy decision or human approval boundary.

### 2.4 Every primary action must be operationally complete

A primary action is not complete unless the application can determine:

- current entity and exact version where relevant;
- actor and organisation;
- required capability;
- preconditions;
- blockers;
- resulting state;
- domain event;
- evidence created;
- next owner;
- next route;
- failure/recovery path.

### 2.5 UI must remain Synth-v2

Adopted functionality must use Omnidata Design System v1:

- compact operational typography;
- neutral surfaces;
- no legacy marketing shell;
- no nested-card maze;
- no giant full-width desktop buttons;
- no module-specific decorative CSS when a shared ODS primitive exists;
- Russian and English labels through the existing i18n runtime;
- stable desktop/tablet/mobile behaviour.

---

# 3. Master donor disposition matrix

| ID | Capability | Donor evidence | Current Synth-v2 gap | Disposition | Target |
|---|---|---|---|---|---|
| L-01 | Exception / SLA authority | `_platform-core-split/platform-core/PLATFORM-CORE-EXCEPTION-SLA-SPEC.md`, `.../exception-sla-gateway.ts` | blockers exist but no persisted generic exception lifecycle | **ADAPT / P0** | Operational Control |
| L-02 | Entity-linked threads | `.../platform-core-comms-contextual-thread.ts`, entity-thread templates, stale Synth-v2 PR #5 | only narrow order-line comments; no universal entity thread | **ADAPT / P0** | Operational Collaboration |
| L-03 | Decision ledger | Action Contracts spec (“Зафиксировать решение”) | no generic immutable decision object | **ADAPT / P0** | Operational Collaboration |
| L-04 | Action contracts / next-owner contract | `PLATFORM-CORE-ACTION-CONTRACTS.md` | commands are strong but no shared action metadata registry | **ADOPT concept / P0** | Action Contract Registry |
| L-05 | Work centres / capacity reservation | `PLATFORM-CORE-PRODUCTION-DEPTH-SPEC.md`, `capacity-gateway.ts` | operation minutes exist, capacity authority does not | **ADAPT / P0** | Production Planning |
| L-06 | Execution profiles | Projects `collection-production-profiles.ts` | development routes exist; scenario execution variants are incomplete | **ADAPT / P0** | Product/Production Policy |
| L-07 | Material substitution approval | `workshop2-brand-alt-material-approval.ts` and supplier counterpart | no formal BOM substitution lifecycle | **ADAPT / P0** | BOM + Sourcing |
| L-08 | Fit review | `workshop2-fit-comments-log.ts`, fit-comments route | sample lifecycle exists; spatial fit issue workflow does not | **ADAPT / P1** | Samples / Product Engineering |
| L-09 | 3D digital sample | Fit3D viewer + vault gate | no production-grade GLB/GLTF workflow on main | **ADAPT / P1** | Product Media / Samples |
| L-10 | Selection revision/diff + collaborative presence | `shop-working-order-version-diff.ts`, collaborative session | approval/order authority already stronger; draft history/presence missing | **ADAPT partial / P1** | Selection |
| L-11 | Sell-through / ATP / replenishment | stock-ATP workspace + replenishment recommendations | inventory exists; closed-loop retail replenishment does not | **ADAPT / P1** | Retail Performance |
| L-12 | Linesheet/catalog syndication | `brand-linesheet-syndication-server.ts` | publication is stronger; external syndication is missing | **ADAPT / P1** | Integration Edge |
| L-13 | AI lab / qualification | `docs/SYNTHA_LEGACY_INTEGRATION_MASTER_PLAN_2026-10-01.md` | active #242 covers part of product-engineering authority; broader lab governance remains | **ADAPT / parallel** | AI R&D / Graduation |

Everything else in Projects/syntha remains donor-only unless explicitly admitted here.

---

# 4. Native strengthening directions added by this programme

These are not “legacy ports”. They are required because simply transplanting legacy functions would still leave structural gaps.

## N-01 — Change Impact & Staleness Graph — P0

**Problem:** a decision can be correct when made and wrong after the entity changes.

Examples:

- approved alternative material changes BOM cost, compliance evidence and production requirements;
- a new measurement revision invalidates an older fit decision;
- an order amendment changes capacity, supply and fulfillment assumptions;
- a supplier certificate expiry invalidates a release gate.

**Target model:**

`source fact changed → dependency edges → impacted artifacts → stale flags → review/exception/Awaiting Action`

The graph is not another source of truth. Edges point from canonical facts to dependent snapshots/decisions.

Minimum capabilities:

- register dependency edge;
- compute impacted artifacts;
- mark derived decisions/checkpoints stale without deleting them;
- create the correct Awaiting Action or Exception only once;
- clear stale state only after a valid replacement decision/snapshot.

## N-02 — Unified Operational Timeline — P0

Every important entity needs one chronological read model combining:

- domain state changes;
- decisions;
- exceptions;
- messages;
- evidence attachments;
- calendar deadlines;
- external integration attempts;
- acknowledgements.

It is a **projection**, not a write authority.

This removes the current cognitive split between “what happened”, “what was discussed”, “what blocked”, and “who decided”.

## N-03 — Policy Decision Engine — P0/P1

Machine-readable policy is separate from AI and separate from UI.

`canonical facts + actor + policy version → allowed | requires_approval | denied`

Use cases:

- supplier qualification expired → PO release blocked;
- material substitution changes composition → quality/compliance approval required;
- price variance > threshold → finance approval;
- capacity shortfall → override forbidden without accepted-risk decision;
- agent action exceeds delegation → human approval.

Policy results are replayable and versioned.

## N-04 — Integration Reliability Journal — P0/P1

Every external adapter must write a durable attempt journal:

`request intent → canonical payload hash → adapter → external request id → ACK/NAK → retry → terminal outcome`

Required for 1C, EDO, EDI, WMS, JOOR, NuORDER and marking.

No UI may display “Synced” because a HTTP request was merely sent.

## N-05 — Scenario Sandbox / What-if — P1

A user can test alternatives without mutating authority:

- substitute material;
- move capacity;
- change order quantity;
- split shipment;
- change delivery window;
- reorder quantity;
- select another supplier.

Scenario outputs explicitly say **proposal / simulation** and cite the exact canonical basis they were calculated from.

## N-06 — Contextual Operational Copilot — P1

AI is attached to the same entity context and evidence graph:

- summarize unresolved thread;
- explain blocker;
- propose recovery actions;
- draft RFQ clarification;
- compare alternative materials;
- explain capacity trade-off.

It never writes authoritative state directly.

## N-07 — Role/device adaptive action placement — P0

The same action contract determines what is visible on:

- desktop;
- tablet;
- mobile.

This prevents each screen from inventing its own action hierarchy.

---

# 5. L-01 Exception / SLA Authority

## 5.1 Donor strength

The Syntha spec correctly defines an exception as a work object, not a warning badge.

Useful donor fields:

- entity;
- owner role/user;
- severity;
- SLA;
- due date;
- chat thread;
- allowed resolution;
- business impact;
- event trace;
- recovery action.

Useful states:

`open → assigned → waiting_for_role / waiting_for_document → escalated → resolved / accepted_with_risk → closed`

The legacy gateway is useful as a detector, but it is not sufficient as authority because it derives a current snapshot rather than owning the lifecycle.

## 5.2 Native Synth-v2 target

New aggregate: **OperationalException**.

Required fields:

- `id`;
- `entityType/entityId`;
- optional exact `entityVersion/contentHash`;
- `category`;
- `severity`;
- `blocking`;
- `ownerRole`;
- optional `ownerUserId`;
- `slaPolicyId/slaPolicyVersion`;
- `openedAt/dueAt`;
- `sourceEventId` or explicit manual source;
- `threadId`;
- optional `calendarMilestoneId`;
- `recoveryAction`;
- optional `businessImpact`;
- `state`;
- `version`.

## 5.3 Deduplication rule

Repeated gate evaluation must not create 50 identical tickets.

Active uniqueness key:

`entity identity + blocker key + policy version + unresolved state`

A later recurrence after closure creates a new exception with `recurrenceOfExceptionId`.

## 5.4 UI

### Local entity surface

Entity header shows at most one compact blocker strip:

`Критично · Не хватает мощности · ответственный Производство · до 15:00`

Actions:

- **Открыть проблему**
- secondary menu: assign, evidence, accept risk if permitted.

### Global

Existing **Ждёт вас / Awaiting Action** receives an `exceptions` group. Do not create a competing “Tasks” inbox.

### Timeline

Exception open/assign/escalate/resolve/close events appear in Unified Operational Timeline.

## 5.5 Failure modes

- exception blocks the very command needed to resolve it;
- duplicate exception created by polling;
- accepted-risk used as a universal bypass;
- stale exception remains open after canonical source clears;
- manual close hides an unresolved canonical blocker;
- escalation job creates repeated escalation events;
- cross-tenant entity reference leaks another organisation.

Mitigations are mandatory before production admission.

---

# 6. L-02 Entity-linked Threads

## 6.1 Why current order-line comments are not enough

Current order-line comments are intentionally narrow and useful, but they do not provide:

- multi-message conversation;
- contextual threads on BOM/sample/RFQ/PO/QC/shipment;
- evidence attachments;
- decisions in context;
- unread state per user;
- cross-party thread lifecycle.

Do not remove them in the first wave. Introduce the generic layer, prove parity, then decide whether a controlled cutover is justified.

## 6.2 Native thread

**EntityThread**

- stable entity identity;
- owner organisation;
- server-authorised participant organisations;
- title/purpose;
- state: `open/resolved/archived`;
- optional `threadKind`: general, clarification, fit, qc, sourcing, handoff, exception;
- created by/at;
- optimistic version.

**ThreadMessage**

- immutable message;
- author user + organisation;
- body;
- mentions;
- evidence references;
- createdAt;
- optional replacement/redaction event rather than destructive edit.

## 6.3 Security

Participant organisations are never trusted because the client sent them.

Application service derives allowed participants from:

- entity ownership;
- active counterparty relationship;
- buyer showroom/order relationship;
- supplier portal grant;
- assigned factory/supplier relationship.

The domain object may accept a validated participant list; the service owns validation.

## 6.4 UI placement

Do **not** add a separate “Messages” tab to every module.

Use a shared contextual control in entity header:

`Обсуждение · 3`

Desktop:
- right inspector 360–420 px;
- timeline/message composer;
- decisions and linked exceptions inline.

Tablet:
- master-detail;
- inspector uses approximately 38–44% width when open;
- collapsible section navigation remains left.

Phone:
- opens as full-height bottom sheet/page;
- sticky composer;
- one primary action per viewport.

---

# 7. L-03 Immutable Decision Ledger

A thread is conversation. A decision is a governed fact about the conversation.

**DecisionRecord**

- `id`;
- entity reference;
- optional `threadId`;
- `decisionType`;
- `outcome`;
- rationale;
- evidence refs;
- actor and organisation;
- exact decided timestamp;
- optional `supersedesDecisionId`;
- exact basis version/hash where known.

No “edit decision”.

If a decision changes:

`decision v1 → decision v2 supersedes v1`.

## Decision staleness

If the pinned basis changes, the decision remains historically valid but current applicability becomes stale.

Change Impact must surface:

`Decision from 04 Oct refers to BOM v7; current BOM is v8 — review required.`

---

# 8. L-04 Action Contract Registry

The donor template is retained conceptually, but implementation must fit current commands.

Each primary action gets metadata:

- `actionId`;
- entity type;
- intent;
- required capability;
- preconditions;
- blocker evaluator IDs;
- resulting event type;
- next-owner resolver;
- next-route resolver;
- recoverable failure map;
- device presentation hint.

It does not execute the command. The current application service remains execution authority.

## UX effect

Entity header can consistently render:

`Состояние → Что мешает → Чей ход → Следующее действие`

without each screen inventing custom logic.

---

# 9. L-05 Work Centres & Capacity Reservation

## Current useful truth

Synth-v2 already has:

- production orders;
- operation sequence revisions;
- standard minutes;
- material requirements;
- production execution.

Missing layer: finite capacity.

## Target objects

**WorkCenter**
- facility;
- line/cell;
- governed capabilities/equipment;
- timezone;
- working calendar;
- active state.

**CapacityBucket**
- work center;
- date/shift/window;
- available minutes;
- source;
- version.

**CapacityReservation**
- production order;
- exact operation sequence revision;
- required minutes;
- reserved window/buckets;
- status;
- basis hash.

## Planning formula

`quantity × standard minutes per unit + setup/changeover allowance = required minutes`

The result must preserve the exact routing revision used.

## Critical concurrency rule

Capacity reservation must use database locking/constraint logic. Two requests must not both read the same free minutes and reserve them successfully.

## Integration

Capacity conflict:
- creates/updates one OperationalException;
- appears in Awaiting Action for Production;
- may open a Scenario Sandbox comparing lines/factories;
- approved replan creates new reservation, not a silent overwrite.

---

# 10. L-06 Execution Profiles

Do not replace current development routes.

Use two orthogonal axes:

**Development Route** — what fundamentally creates the item.

Examples already represented by current readiness routes include own development and ready goods.

**Execution Profile** — how this particular development/production is executed.

Target profiles:

- full development;
- reorder/carryover;
- prototype/muslin first;
- materials on stock;
- CMT;
- finished-goods procurement;
- dropship/3PL;
- MTO/bespoke.

Profile effects are explicit policy:

- which readiness dimensions are applicable;
- which evidence is required;
- which gates are required;
- which production steps are not applicable;
- which approval roles differ.

A profile may never simply “skip validation”.

---

# 11. L-07 Material Substitution

Legacy pending/approve/reject is useful but insufficient.

Native **MaterialSubstitutionProposal** must include:

- BOM revision and line;
- current material spec/version;
- proposed material/version;
- supplier;
- reason;
- quantity impact;
- unit-cost delta;
- landed-cost delta;
- lead-time delta;
- MOQ delta;
- composition delta;
- colour/lab-dip implication;
- compliance/certificate implication;
- sample/test evidence;
- production orders affected.

## Approval outcome

Approval must not mutate the published BOM in place.

Possible outcomes:

1. create next BOM revision; or
2. create scoped production override for a specific production requirement/order.

Change Impact then re-evaluates:

- costing;
- readiness;
- tech pack;
- compliance;
- supplier award;
- production material requirement;
- quality plan.

---

# 12. L-08 Fit Review

Target flow:

`Sample Round → Fit Session → Media → Pin/Issue → Decision → Correction → Next Sample → Gold Sample`

A fit issue:

- sample ID/round;
- media asset ID;
- x/y pin or 3D marker;
- measurement point if relevant;
- text;
- optional voice transcription;
- severity;
- owner;
- open/resolved;
- evidence of resolution.

Gold Sample approval may be blocked by unresolved mandatory fit issues.

Legacy mock photo/voice implementation is explicitly rejected.

---

# 13. L-09 3D Digital Sample

Accepted:

- GLB/GLTF;
- versioned media asset;
- source software/import metadata;
- exact Product/StyleVersion/Colorway applicability;
- content hash;
- viewer;
- optional tension/fit overlays when evidence exists.

Rejected:

- placeholder model reported as production-ready;
- 3D asset as a replacement for Product Master;
- unversioned external URL with no provenance.

Production UI uses the same ODS surface as other sample/media assets.

---

# 14. L-10 Selection Revision & Collaborative Presence

Current Selection approval and WholesaleOrder agreement remain authority.

Add only:

- draft selection revision journal;
- exact diff: added/removed/quantity-changed ProductSku lines;
- optional participant presence;
- review state;
- comments through EntityThread.

No second approval state machine.

After submit, the current immutable order/commit/amendment model remains authoritative.

---

# 15. L-11 Sell-through / ATP / Replenishment

Legacy mock recommendation logic is rejected.

Target:

`Retail sales/stock import → reconciled retail snapshot → sell-through/WOS/stockout risk → proposal → buyer review → Selection/Order`

The recommendation is never an order.

Required basis:

- exact ProductSku;
- retail door/location;
- time window;
- on-hand;
- reservations;
- in-transit;
- sales;
- returns;
- target service level/policy.

Suggested reorder must store its basis so it can be explained and invalidated if stock changes.

---

# 16. L-12 Publication Syndication

Current Synth-v2 publication remains source of truth.

Target adapter flow:

`BuyerCatalogVersion → SyndicationJob → channel adapter → external ACK/NAK → Integration Journal`

Channels may include:

- JOOR;
- NuORDER;
- customer ERP;
- EDI;
- CSV/XLSX/PDF export;
- private API.

Batch unpublish/rollback is allowed only as a new channel publication revision. External rollback cannot mutate the canonical BuyerCatalogVersion.

---

# 17. L-13 AI Lab / Graduation

PR #242 is already implementing product-engineering authority and must be reconciled rather than duplicated.

Broader lab requirements remain:

- provider gateway;
- tracing;
- prompt/model regression;
- versioned evaluation corpora;
- typed outputs;
- RAG source lineage;
- adversarial evaluation;
- human adjudication;
- golden evaluation set;
- explicit graduation scorecard.

Graduation rule:

`experiment → evaluated proposal capability → domain/API acceptance → human graduation decision → Synth-v2 integration`

No tool-specific score may bypass business authority.

---

# 18. Cross-capability dependency map

```text
Canonical entity/version
        │
        ├── Entity Thread ── Message/Evidence
        │          │
        │          └── Decision Record
        │
        ├── Action Contract
        │          │
        │          └── blocker evaluator
        │                     │
        ├──────────── Operational Exception
        │                     │
        │                     ├── Awaiting Action
        │                     ├── Calendar due date
        │                     └── Escalation
        │
        ├── Change Impact / Staleness Graph
        │          │
        │          ├── stale Decision
        │          ├── stale Proposal
        │          └── new review / Exception
        │
        └── Unified Operational Timeline
                   ├── domain events
                   ├── messages
                   ├── decisions
                   ├── exceptions
                   └── integration attempts
```

Production extensions:

```text
OperationSequenceRevision
        │
        └── WorkCenter capability match
                   │
                   └── Capacity Reservation
                              │
                              ├── conflict → Exception
                              └── accepted plan → Production Execution
```

Material substitution:

```text
BOM line
  └── substitution proposal
       ├── Scenario impact
       ├── Thread + Decision
       └── approved
            ├── new BOM revision OR scoped override
            └── Change Impact recomputation
```

---

# 19. UX placement map

The adoption programme must avoid “one more menu item for every feature”.

| Existing area | Local additions | Global link |
|---|---|---|
| Product Master / Model | discussion control, decisions, stale dependencies | Awaiting Action |
| BOM / Materials | substitution proposals, material exceptions | Awaiting Action / Timeline |
| Measurements | decision basis + stale-after-revision warning | Timeline |
| Samples | Fit Review + issues + Gold Sample blocker | Awaiting Action |
| Sourcing / RFQ | clarification thread, SLA exception | Awaiting Action |
| Production Orders | capacity status, blocking exception, decision history | Production planning |
| Production Execution | exception/recovery, operation evidence | Timeline |
| Final Quality | QC decision thread + exception if failed | Awaiting Action |
| Linesheets / Buyer Catalog | syndication status via integration journal | Integration status |
| Selections | revision diff, collaboration presence | Awaiting Action |
| Orders | thread, commercial decisions, existing amendments | Timeline |
| Fulfillment | shipment/receipt exception | Awaiting Action |
| Supplier Passport | qualification/evidence decision | Timeline |
| Global header | “Ждёт вас” count stays primary work inbox | no competing task centre |

## Shared entity header contract

First line:

`Entity · State · Owner · Next action`

Second line only when necessary:

`Blocker / evidence freshness / source confidence`

Controls:

- primary action — one;
- Discussion;
- Timeline;
- secondary actions menu.

---

# 20. Responsive layout contract

## Desktop >= 1200

- left navigation remains compact/collapsible;
- main workspace does not stretch forms/buttons across entire width;
- contextual Collaboration/Timeline inspector opens on right;
- tables remain primary where density matters;
- action controls are compact and aligned to header/toolbar.

## Tablet 768–1199

- left navigation collapsible;
- master-detail where practical;
- right inspector becomes 38–44% split view;
- matrix entry remains touch-capable;
- no desktop-width button stretching.

## Mobile < 768

- single entity context;
- one sticky primary action;
- collaboration/timeline as full-height sheet;
- exception detail collapses into ordered sections;
- no horizontal business table overflow: convert to compact rows/cards or controlled matrix scroller only where the matrix itself is the product.

Every new UI acceptance must test all three breakpoints.

---

# 21. Persistence/API/event design rules

## Command discipline

Every mutation:

- authenticated actor;
- capability check;
- global idempotency command registration;
- transaction;
- optimistic version/CAS where mutable;
- outbox event in the same transaction.

Do not revive PR #5’s dedicated `collaboration_commands` table.

## Event examples

- `collaboration.thread.created.v1`
- `collaboration.message.posted.v1`
- `decision.recorded.v1`
- `decision.superseded.v1`
- `exception.opened.v1`
- `exception.assigned.v1`
- `exception.escalated.v1`
- `exception.resolved.v1`
- `exception.risk-accepted.v1`
- `capacity.reserved.v1`
- `capacity.released.v1`
- `material-substitution.proposed.v1`
- `material-substitution.decided.v1`

## Reads

Reads may project cross-module data. Writes may not.

A Unified Timeline reader can join/projection-read many event sources, but it owns no business truth.

---

# 22. Duplicate-authority and deadlock register

| Risk | Failure | Required prevention |
|---|---|---|
| Generic thread vs order-line comments | two places contain different “latest comment” | no automatic dual-write; define cutover/parity before deprecation |
| Exception vs Awaiting Action | duplicate work inbox | exceptions feed Awaiting Action; never separate global task queue |
| Exception vs canonical blocker | user closes ticket but blocker still exists | derived gate re-check; manual close forbidden while source remains blocking unless policy allows accepted-risk |
| Decision vs canonical state | “approved” decision changes nothing or contradicts state | decision never substitutes domain command |
| Calendar duplication | exception due date and calendar event drift | service creates/links milestone in same transaction or reconciled projection |
| Capacity race | overbooking | row/advisory locking + DB invariant |
| Substitution silent mutation | historical BOM changes | revision/override only |
| Stale decision | old basis presented as current | pin version/hash + Change Impact |
| External ACK fiction | “synced” after POST only | durable Integration Journal + ACK state |
| Retry storm | broken connector floods API | exponential/backoff policy, bounded attempts, dead-letter/retry action |
| Escalation loop | same exception escalates every poll | state/version + last escalation checkpoint |
| Multi-tenant leak | thread exposes another brand/shop | service derives participant scope from canonical relationship |
| Recovery deadlock | blocker forbids its own recovery command | action contract explicitly names allowed recovery actions |
| AI bypass | model calls mutation directly | proposal-only tools + policy/domain command boundary |
| Migration collision | PR #242 and new schema use same numbers | reserve post-#242 range; re-check main immediately before schema PR |

---

# 23. Test and verification matrix

No capability is “done” because unit tests pass.

## Domain

- valid/invalid transitions;
- immutable historical facts;
- exact entity/version lineage;
- stale/supersession rules;
- owner/participant rules;
- due dates/severity/state;
- policy outcomes.

## Service

- capability checks;
- wrong organisation;
- idempotency replay;
- command ID conflict;
- optimistic concurrency;
- atomic outbox;
- recovery paths;
- no client-controlled authority fields.

## PostgreSQL

- foreign keys;
- active uniqueness/dedupe;
- direct SQL cannot bypass critical invariants;
- concurrency race tests;
- query/index inspection;
- migration replay from clean database;
- old database migration forward;
- rollback/recovery where supported.

## HTTP/OpenAPI

- route parity;
- body allowlists;
- unknown fields;
- duplicate query parameters;
- auth;
- correct 4xx mapping;
- idempotency key requirement;
- OpenAPI schema parity.

## UI

- action only when domain allows;
- no stale state after mutation;
- refusal shown in user language;
- no raw enum/ID as visible label where business label exists;
- keyboard/Escape/dialog focus;
- no native confirm;
- unread counters;
- deep-link to exact entity;
- responsive desktop/tablet/mobile;
- Omnidata Design System validation.

## Cross-flow golden paths

1. blocker detected → exception → owner → discussion → evidence → resolution → Awaiting Action disappears;
2. decision pinned to BOM v1 → BOM v2 → stale review appears;
3. capacity reserve conflict under concurrent requests → one succeeds, one exception;
4. substitution → decision → BOM revision → cost/readiness impact;
5. fit issue → resolve → Gold Sample approval;
6. syndication send → external fail → retry → ACK;
7. replenishment proposal → buyer approval → normal Selection/Order, no direct order creation.

---

# 24. Delivery sequence

## Wave A — control-plane foundation

1. adoption register;
2. pure domain kernel for entity reference, threads, decisions and exceptions;
3. unit tests;
4. reconcile/retire stale PR #5 implementation direction;
5. finalize migration numbering after PR #242 state is known.

## Wave B — persisted collaboration

1. schema;
2. PostgreSQL store/readers;
3. capabilities;
4. application service;
5. HTTP/OpenAPI;
6. outbox;
7. contextual inspector UI;
8. unread/read state;
9. PostgreSQL and browser acceptance.

## Wave C — exception/SLA

1. exception store;
2. dedupe;
3. action-contract blocker adapters;
4. Awaiting Action projection;
5. calendar link;
6. escalation worker;
7. accepted-risk decision policy;
8. entity blocker strip.

## Wave D — change impact

1. dependency edge registry;
2. stale projection;
3. review creation;
4. timeline integration.

## Wave E — production depth

1. work centres;
2. shift calendars;
3. capacity buckets;
4. reservations;
5. planning UI;
6. scenario comparison;
7. capacity exceptions.

## Wave F — product/sourcing depth

1. execution profiles;
2. material substitution;
3. fit review;
4. 3D sample.

## Wave G — commercial closed loop

1. selection revision journal;
2. sell-through/ATP;
3. replenishment proposal;
4. syndication adapters.

## Parallel — AI graduation

Reconcile with PR #242 and keep lab tooling outside business authority.

---

# 25. Definition of Done for an adopted capability

An item can be marked **ADOPTED** only when all apply:

- canonical authority boundary documented;
- no duplicate write authority;
- exact schema/API/event contract implemented;
- tenant/capability boundary proven;
- idempotency and concurrency proven;
- source/lineage/version rules proven;
- existing related module regression passes;
- PostgreSQL migration is replayable from clean DB;
- UI is integrated into the existing Synth-v2 route, not a detached demo screen;
- RU/EN complete;
- desktop/tablet/mobile checked;
- Omnidata design-system validation green;
- Awaiting Action/notifications/calendar/history integration is correct where applicable;
- failure and recovery path visible;
- `ARCHITECTURE.md` updated;
- full `npm run verify` green;
- PostgreSQL acceptance green before merge;
- no `PROD-PROVEN` claim without designated live-runtime evidence.

---

# 26. First implementation tranche

The first code tranche intentionally implements the **domain kernel only** for:

- canonical entity references;
- entity threads;
- immutable messages;
- immutable decisions;
- operational exception lifecycle.

This is deliberate:

1. it makes the behavioural contract executable now;
2. it avoids migration-number collision with active PR #242;
3. it avoids reviving stale PR #5’s obsolete command/calendar design;
4. it gives the next persistence/API/UI PR a stable domain target.

It is **not** claimed as a user-visible completed feature until Waves B/C complete.

---

## 27. Implementation checkpoint — Persistent Collaboration wave

Date: **2026-10-07**

Foundation PR #244 merged as `main@bbd46f8b30b997eec7c961f2f6fa0fd76b14360c` after exact-head Verify, PostgreSQL CI and Product Commercialization Acceptance all passed.

Current implementation branch: `feat/operational-collaboration-persistence`.

Implemented in this wave before UI:

- migration 172 for EntityThread, participants, immutable messages, Decision Ledger and dedicated command ledger;
- global command registry scope extension rather than a second idempotency authority;
- collaboration read/write and decision-record capabilities;
- active trade-relationship admission for cross-company threads;
- server-validated acting organisation and participant boundary;
- exactly-once decision supersession chain;
- transactional outbox events;
- authenticated HTTP routes and OpenAPI 1.18 augmentation;
- contextual entity read projection;
- unit/route/migration acceptance coverage.

Still intentionally **not** implemented at this checkpoint:

- Operational Exception persistence;
- SLA policy;
- escalation worker;
- Awaiting Action exception projection;
- calendar linking;
- Change Impact graph.

Those remain blocked until Persistent Collaboration and the ODS contextual inspector pass their own gates.

---

## 28. Implementation checkpoint — ODS Contextual Collaboration Inspector

Date: **2026-10-07**

PR #245 merged as `main@99311b4eaa54b946146c16aa2c5d50683c7d27bb` with exact-head Verify, PostgreSQL CI and Product Commercialization Acceptance green.

Current UI wave introduces a single shared contextual inspector:

- entity-bound read route only;
- Discussion and Decision tabs remain distinct;
- one shared control integrated first into Samples, Production Orders and Wholesale Orders;
- no duplicate global messaging navigation;
- no duplicate task inbox;
- ODS desktop right inspector / tablet bounded split / phone full-height surface;
- actor organisation resolved from active membership + mirrored capability, never from arbitrary free client input;
- thread participants still revalidated server-side;
- decision supersession remains append-only;
- no Operational Exception controls are rendered in this wave.

Runtime admission hardening in this wave additionally requires the complete PostgreSQL runtime to forward the already-constructed canonical `operationalCollaboration` service into its HTTP transport. The full runtime must not instantiate another collaboration store/service, and an automated regression contract locks that invariant.

The inspector remains on the existing canonical ODS module-adapter build identity rather than creating a second visual layer or cache-key lineage.

The next admissible transition remains: **inspector exact-head UI/Verify/PostgreSQL acceptance → merge → then Exception/SLA authority**.
