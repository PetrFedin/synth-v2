# Syntha V2 — Platform Master Specification

> **Canonical living specification / architecture / product requirements / UI contract**  
> Status date: **2026-08-31**  
> Baseline when this master specification was established: `main@4f5c452dede1ce9c8ffe518eddb8b6632cc89ad0`  
> Document status: **AUTHORITATIVE / LIVING**

This file is the single authoritative map of what Syntha V2 is, how it works, what is implemented, what is incomplete, how modules are connected, what users see, and what every future change must preserve or update. Detailed documents under `docs/` remain supporting evidence and deep dives; they may add rationale and implementation detail, but they must not contradict this file.

If code, database, API, UI, workflow or another document disagrees with this master specification, the discrepancy is an architecture defect. A change is not complete until implementation, tests and this specification describe the same behavior.

---

## 0. Mandatory documentation governance

### 0.1 Non-negotiable synchronization rule

Every change that affects any of the following MUST update this file in the same pull request:

- business capability, workflow, lifecycle, state transition or action;
- entity, field, identifier, relation, ownership boundary or immutable lineage;
- API route, request/response field, command, error, idempotency or authorization rule;
- PostgreSQL table/column/index/constraint/trigger/migration or persistence semantics;
- UI screen, workspace, block, card, table, inspector, filter, field, button, menu item, icon, status, empty/loading/error state, confirmation or keyboard behavior;
- typography, colour, spacing, radius, elevation, responsive breakpoint or another design token;
- role/capability visibility, action availability or organisation isolation;
- runtime/startup/shutdown, deployment, environment variable, worker, health/readiness, observability or external integration;
- canonical business-chain relation, test/acceptance proof, architecture gap or production-readiness status.

A PR that changes runtime/product behavior without changing `ARCHITECTURE.md` is incomplete even if all unit tests pass. GitHub CI enforces this rule for governed source/runtime surfaces.

### 0.2 What must be recorded for a changed feature

The edited section must answer, where applicable:

1. **Purpose** — why the capability exists and who uses it.
2. **Entry point** — screen, route, command or upstream event that starts it.
3. **Inputs** — every material field, type, required/optional rule, source and validation.
4. **Actions** — buttons/commands and their prerequisites.
5. **State transition** — old state → action → new state; forbidden transitions.
6. **Relations** — upstream/downstream entities and exact immutable IDs/snapshots.
7. **Effects** — records/events/reservations/costs/publications that change or must not change.
8. **Permissions** — actor/capability/organisation boundary.
9. **UI contract** — block placement, fields, icons, labels, controls, states and responsive behavior.
10. **API contract** — route/method/request/response/error/idempotency.
11. **Persistence** — table/columns/constraints/transactional guarantees.
12. **Failure behavior** — fail-closed conditions, recovery/retry/correction path.
13. **Evidence** — tests, PostgreSQL integration and/or live acceptance proving the behavior.
14. **Status** — IMPLEMENTED / PARTIAL / PLANNED / GAP / DEPRECATED.
15. **Change reference** — PR/commit and affected sections in the change register.

### 0.3 Status vocabulary

| Status | Meaning |
|---|---|
| `IMPLEMENTED` | Canonical executable path exists in the named layer and is guarded by automated tests. |
| `PARTIAL` | Useful implementation exists, but one or more required layers/relations/UI/E2E proofs remain incomplete. |
| `PLANNED` | Intended canonical behavior is specified but implementation has not started or is not canonical. |
| `GAP` | A confirmed missing/broken/ambiguous path that can violate the intended end-to-end system. |
| `DEPRECATED` | Compatibility-only behavior retained temporarily; it must not be extended as a new source of truth. |
| `PROD-PROVEN` | The relevant path is exercised end-to-end through supported public/runtime boundaries against PostgreSQL and has operational evidence. |

A file, migration, mock screen or domain function alone does not qualify a capability as `PROD-PROVEN`.

### 0.4 Source hierarchy

When resolving ambiguity, use this order:

1. `ARCHITECTURE.md` — canonical platform contract and current status.
2. Executable invariant + migrations + public API/OpenAPI — actual enforceable behavior.
3. `docs/architecture/*`, governed domain docs, ODS and KPI documents — supporting deep specifications.
4. Tests — executable examples/evidence.
5. README/Cursor instructions — onboarding/operations summaries.
6. Legacy compatibility code or stale PRs — never a source of new semantics.

If levels 1 and 2 disagree, fix the discrepancy; do not silently choose one.

---

## 1. Platform purpose and canonical operating chain

Syntha V2 is a standalone fashion B2B operating platform for brands, retailers, distributors and production partners. It must operate as one connected product rather than a collection of screens.

### 1.1 End-to-end business chain

```text
DESIGN
→ PLAN
→ DEVELOP
→ SOURCE
→ SAMPLE
→ TECH PACK
→ PRODUCE
→ QUALITY
→ PRODUCT READINESS
→ COMMERCIAL PROJECTION
→ PUBLISH
→ COLLECTION / SHOWROOM / LINE SHEET
→ BUYER CATALOG
→ ASSORT / SELECTION / COLOR × SIZE MATRIX
→ WHOLESALE ORDER
→ ORDER COMMIT SNAPSHOT
→ SUPPLY COMMITMENT
→ SHIPMENT / RECEIPT
→ ACTUAL COST / LANDED COST
→ MARGIN ACTUALIZATION / CLOSE
→ SELL-THROUGH / KPI / SUPPLIER PERFORMANCE
```

No downstream module may reconstruct historical truth from mutable upstream masters when an immutable snapshot/version already exists.

### 1.2 Canonical immutable commercial/physical lineage

```text
ProductStyle
→ StyleVersion
→ Colorway
→ ProductSku
→ ProductReadinessSnapshot
→ CommercialProductProjectionVersion
→ CommercialPublication
→ PriceListVersion
→ BuyerCatalogVersion
→ Buyer Selection
→ WholesaleOrder
→ OrderCommitSnapshot
→ SupplyCommitment
→ Shipment / ShipmentLine
→ ActualCostLedgerEntry
→ LandedCostSnapshot
→ CostAllocationRunSnapshot
→ MarginActualizationSnapshot
→ CostCloseReadinessSnapshot
→ CostCloseSnapshot
```

Physical SKU identity after order commitment is not a display string. The canonical line identity is the exact immutable pair:

```text
orderLineNo + productSkuId
```

Textual `sku` remains useful for human display and compatibility but must not replace exact physical lineage where ambiguity is possible.

---

## 2. Repository, runtime and deployment architecture

### 2.1 Repository boundaries — IMPLEMENTED

- Repository: `PetrFedin/synth-v2`.
- Node.js: `>=22`.
- PostgreSQL: version 17 baseline.
- Cross-module imports are allowed only through a module `public.mjs` boundary.
- Applied SQL migrations are immutable and checksum-verified.
- Business mutations use durable command/idempotency identity and transactional outbox discipline where the bounded context mutates durable business state.
- Organisation isolation is mandatory.

### 2.2 Supported process path — PROD-PROVEN for startup lifecycle

Supported entrypoint:

```text
npm start
→ scripts/start.mjs
→ runtime configuration
→ PostgreSQL connection
→ checksum/advisory-lock migrations
→ worker registration/start
→ HTTP listen
→ /health
→ /ready
→ SIGTERM
→ graceful HTTP/workers/PostgreSQL shutdown
```

`npm run smoke:runtime` runs this real process against `POSTGRES_TEST_URL`, disables external side effects, proves `/health` and migration/worker-aware `/ready`, then proves clean SIGTERM shutdown. It must never fall back to normal development or production data.

### 2.3 Local database topology — IMPLEMENTED

| Purpose | Variable | Default local endpoint |
|---|---|---|
| Development workspace | `SYNTHA_V2_DATABASE_URL` | PostgreSQL 17 on `127.0.0.1:5434` |
| Verification/tests | `POSTGRES_TEST_URL` | isolated PostgreSQL 17 on `127.0.0.1:5435` |

Verification may create durable fixtures; it must never point at workspace or production data.

### 2.4 Operational endpoints — IMPLEMENTED

- `GET /health` — process liveness.
- `GET /ready` — traffic readiness; includes PostgreSQL, migration state and operational worker registry.
- `GET /openapi.json` — current API contract.
- `/v2/*` — supported business API.
- `/` — standalone browser workspace.

### 2.5 Bootstrap owner — IMPLEMENTED

`npm run bootstrap:owner` is deterministic provisioning, not password reset. It preserves deterministic bootstrap identities, serializes concurrent calls with PostgreSQL advisory locking, replays only exact ownership/password/topology, and fails closed on mismatch or ambiguity.

---

## 3. Architecture invariants
### 3.1 One Product Master

Product Identity V2 is the only canonical Style/StyleVersion/Colorway/Size/SKU hierarchy. `catalog_skus` is a temporary compatibility surface and must not receive new product semantics.

### 3.2 Technical truth is not commercial truth

The only formal PLM-to-commerce handoff is:

```text
ProductReadinessSnapshot
→ CommercialProductProjectionVersion
→ CommercialPublication
```

Buyer/catalog/order code must not bypass this handoff by reading mutable live PLM/MDM fields to reconstruct an already published commercial fact.

### 3.3 Historical facts freeze versions

Readiness, projection, publication, buyer catalog, selection, order commitment, supply, actual cost, allocation and margin records preserve exact source versions/IDs. Current master labels cannot retroactively redefine historical facts.

### 3.4 Physical lineage

Canonical supply/physical execution uses exact `ProductSku` plus committed order line. New exact paths must not join by fuzzy SKU/name/date when immutable identifiers exist.

### 3.5 Inventory

Inventory truth is centralized around location/balance/reservation/allocation/movement. ATS is derived centrally from canonical balance semantics. Mutation paths require idempotency, locking and reconciliation; a buyer/order screen must not maintain a second stock balance.

### 3.6 Pricing

Pricing exposed to buyers is server-authoritative and snapshot/version based. Client-calculated price is presentation only and cannot become order truth.

### 3.7 Corrections, not rewrites

Immutable commercial, physical and economic ledgers are corrected through append-only reversal/replacement/adjustment semantics. Historical records are not edited in place to make current totals look correct.

---

## 4. Identity, authentication, roles and capabilities

### 4.1 Authentication — IMPLEMENTED

Syntha owns authentication; no external identity provider is canonical. Browser session stores the bearer access token under `syntha-v2-session` in `sessionStorage`. Login uses `/v2/auth/login`; authenticated identity is verified via `/v2/auth/me`; logout calls `/v2/auth/logout` and clears local session state.

### 4.2 Organisation context — IMPLEMENTED

Workspace boot loads user identity, workspace data and notifications, then drains membership and organisation pages before declaring the workspace foundation complete. Failure to fully load membership/organisation context fails with `WORKSPACE_FOUNDATION_INCOMPLETE` instead of rendering a potentially cross-organisation partial state.

### 4.3 Capability rule

A visible mutation control is forbidden unless all of the following exist together:

```text
visible action
+ capability/role check
+ handler
+ public API route
+ application method
+ domain validation
+ persistence transaction
+ automated interaction contract
```

Destructive actions require explicit confirmation or a reason form. Client validation mirrors domain boundaries but never replaces backend validation.

---

## 5. Product and development domain model

### 5.1 Product Identity V2 — IMPLEMENTED/PARTIAL UI

#### ProductStyle
Stable product identity. Owns lifecycle identity; versioned technical content belongs to `StyleVersion`, not mutable fields on style.

#### StyleVersion
Immutable exact technical version. It preserves predecessor/version continuity, bilingual title/content references, governed MDM references and content identity. Downstream readiness refers to one exact StyleVersion.

#### Colorway
Immutable variant bound to exactly one StyleVersion and brand context; may pin an exact governed colour reference/version.

#### SizeScale / SizeScaleVersion / SizeValue
Stable size system plus ordered immutable version/value structure. Ordered size truth feeds variant publication and Color × Size ordering.

#### ProductSku
Canonical immutable sellable/physical identity:

```text
exact StyleVersion
+ exact Colorway
+ same-brand ordered SizeValue
```

A ProductSku must never be replaced by a plain textual SKU string in canonical physical lineage.

#### Product media
Immutable media/order references can be scoped to StyleVersion/Colorway and selected into readiness/projection. Buyer gallery depth remains PARTIAL.

Supporting detail: `docs/architecture/product-identity-v2.md`.

### 5.2 PLM/development workspaces

Current executable workspace assets include Planning, Styles, Materials, BOM, Measurements, Samples, Sourcing, Tech Packs, Production Orders, Production Executions and Final Quality. Their visual contract is ODS v1. Their business truth must converge on Product Identity rather than create a second style/SKU model.

| Workspace | Core purpose | Current status | UI/ODS status |
|---|---|---|---|
| Planning | collection/line planning and development readiness context | PARTIAL canonical integration | shared ODS primitives, remaining compatibility debt |
| Styles | development-facing style work | PARTIAL canonical Product Identity convergence | PARTIAL ODS migration |
| Materials | material master/development facts | IMPLEMENTED/PARTIAL integration | PARTIAL ODS migration |
| BOM | component/material composition | IMPLEMENTED | PARTIAL ODS migration |
| Measurements | POM/spec/revision workflow | IMPLEMENTED | PARTIAL ODS migration |
| Samples | sample lifecycle/evidence | IMPLEMENTED | ODS-native |
| Sourcing | RFQ/quote/supplier sourcing | IMPLEMENTED/PARTIAL depth | next ODS debt-burn-down target |
| Tech Packs | frozen technical package/readiness dependencies | IMPLEMENTED | ODS-native |
| Production Orders | production commitment/order view | IMPLEMENTED | ODS-native |
| Production Executions | execution/milestones/progress | IMPLEMENTED | ODS-native |
| Final Quality | final QC evidence/disposition | IMPLEMENTED | ODS-native |

The master specification must be expanded whenever one of these workspaces gains/removes a field, action, state, panel or dependency. Existing module-specific docs remain supporting evidence; they are not permission to omit changes here.

---

## 6. Product readiness and commercialization

### 6.1 ProductReadinessSnapshot — IMPLEMENTED

Purpose: freeze whether a specific StyleVersion is commercially releasable based on authoritative route-aware technical evidence and commercial preparation.

Rules:

- one snapshot is immutable history;
- repository-authoritative evidence is fail-closed;
- external evidence cannot override a missing/failed repository gate when a canonical repository source exists;
- exact Product Identity/PLM source versions are retained;
- blocked snapshots remain historical evidence and are not rewritten to READY later.

### 6.2 CommercialProductProjectionVersion — IMPLEMENTED

Created only from an eligible ready snapshot. It is an immutable commercial projection, not a live PLM read model. Projection continuity/version lineage is preserved.

### 6.3 CommercialPublication — IMPLEMENTED/PARTIAL migration

Lifecycle contract:

```text
DRAFT → READY → PUBLISHED → SUPERSEDED / ARCHIVED
```

Published commercial truth must ultimately originate only from the immutable commercial projection. Existing historical flat-catalog compatibility paths remain migration debt and must not become a second publication model.

### 6.4 PriceListVersion — IMPLEMENTED/PARTIAL depth

Immutable price version exists. Buyer price is server-authoritative. Price type/RRP/effective-period depth remains an active convergence area.

### 6.5 BuyerCatalogVersion — IMPLEMENTED/PARTIAL variant depth

Immutable buyer catalog exists. Target contract preserves published Style → Colorway → ordered Size → ProductSku hierarchy rather than flattening all buyer truth to textual SKU rows.

Supporting detail: `docs/architecture/product-readiness-commercial-projection-v2.md`, `docs/commercial-publication-linesheets.md`.

---

## 7. Wholesale commerce and order commitment

### 7.1 Browser flow already represented in the executable shell

The application defines the commercial stage sequence:

```text
campaign
→ collection
→ showroom
→ selection
→ order-builder
→ order
→ confirmation
→ deal-space
```

### 7.2 Campaign / Collection — IMPLEMENTED and live-accepted slice

`npm run acceptance:collection` exercises the public authenticated API and same-environment PostgreSQL through:

```text
Campaign draft
→ Campaign open
→ Collection draft
→ Collection published
```

The gate proves that this slice does **not** silently mutate downstream commercial publication, buyer catalog, selection/order, ProductSku inventory, warehouse movement, SupplyCommitment or ActualCost state.

### 7.3 Showroom / Linesheet — IMPLEMENTED/PARTIAL Product Identity depth

Showroom/linesheet is a buyer-facing commercial presentation of publication/catalog truth. It must not reconstruct mutable PLM truth. Variant-rich Product Identity-backed style detail remains an area to complete.

### 7.4 Selection / Color × Size matrix — PARTIAL

Selection exists, but the target buyer matrix must preserve exact BuyerCatalogVersion, ProductSku, ordered size, price and commercial context. Draft context must not silently change when mutable catalog/master records change.

### 7.5 WholesaleOrder — IMPLEMENTED
Order lifecycle and bilateral confirmation are executable. Order creation consumes frozen submitted Selection lineage. Currency is derived/validated against the frozen selection lines rather than accepted as an independent mutable client fact.

### 7.6 OrderCommitSnapshot — IMPLEMENTED

Immutable deal snapshot used by supply/economics. Physical/economic facts must refer to the committed order truth, not a subsequently edited buyer/cart view.

---

## 8. Supply, shipment, inventory and physical execution

### 8.1 SupplyCommitment — IMPLEMENTED

Supply allocations preserve committed order lineage. Canonical ProductSku supply lineage uses exact `orderLineNo + productSkuId + sku(display)` rather than textual SKU alone.

### 8.2 Shipment / receipt / supplier recovery — PARTIAL end-to-end depth

Shipment, receipt, claim resolution and supplier recovery capabilities exist. Canonical shipment/claim lines are expected to preserve exact committed order line/ProductSku identity. `POST /v2/receipt-claim-resolutions/:resolutionSnapshotId/supplier-recoveries` accepts either no line identity for aggregate recovery or the exact `orderLineNo + productSkuId` pair for SKU-specific recovery; optional `sku` is display/consistency only. The recovery service resolves the requested exact pair against immutable claim lines before creating the physical ActualCost entry and refuses textual-SKU-only inference. Legacy PostgreSQL fixtures whose committed order lineage predates ProductSku remain valid only for aggregate physical cost/recovery and must not synthesize a ProductSku from display SKU.

### 8.3 Inventory — IMPLEMENTED core

Canonical inventory model includes location, balance, reservation, allocation and movement concepts with centrally derived ATS and transaction/idempotency safeguards. Inventory state must reconcile rather than be independently edited by buyer/order UI.

---

## 9. Actual cost, landed cost and margin

### 9.1 Canonical cost identity

Order-level aggregate ActualCost is allowed without ProductSku. SKU-specific physical cost must resolve to exact physical lineage.

Canonical SKU-specific cost lineage is:

```text
orderId
+ orderCommitId
+ supplyCommitmentId
+ shipmentId
+ orderLineNo
+ productSkuId
+ sku (optional display/consistency)
+ physicalLineageVersion = 2
```

`shipmentLineId` remains shipment execution detail but is not a mandatory ActualCost identity component: one committed `orderLineNo + productSkuId` may be split across more than one shipment row inside the same shipment notice, and the cost scope deliberately resolves that exact immutable committed ProductSku line without inventing a second identity from textual SKU.

### 9.2 Canonical ActualCost write contract — IMPLEMENTED

PR #112 closes the P0 new-write bypass with one contract across HTTP, OpenAPI, application resolution and PostgreSQL:

- `POST /v2/orders/:orderId/actual-costs` is aggregate-only. New generic request bodies do not accept `sku`;
- `POST /v2/orders/:orderId/cost-close/adjustments` is also aggregate-only and cannot introduce SKU scope after close;
- `POST /v2/shipment-notices/:shipmentNoticeId/actual-costs` accepts either no line identity for an aggregate physical cost or the exact pair `orderLineNo + productSkuId` for a SKU-specific cost;
- `POST /v2/receipt-claim-resolutions/:resolutionSnapshotId/supplier-recoveries` follows the same identity rule: aggregate recovery omits line identity; SKU-specific recovery requires exact `orderLineNo + productSkuId` pinned to one immutable claim issue line;
- supplying only `sku`, only `orderLineNo`, or only `productSkuId` is invalid. Optional `sku`, when present with the exact pair, is only a display/consistency assertion and must match immutable shipment/claim lineage;
- physical corrections may omit line identity and inherit the immutable original physical line; if a caller supplies identity, the exact pair is mandatory and correction cannot move to another ProductSku line or between aggregate and SKU-specific scope;
- the composed authoritative `/v2` OpenAPI contract preserves version `1.17.0` without version drift while exposing `orderLineNo` and `productSkuId` on physical ActualCost and supplier-recovery inputs, removing `sku` from generic new-write/post-close inputs, and retaining it on historical correction input;
- migration `073_actual_cost_exact_physical_lineage.sql` installs the forward-only `actual_cost_000_canonical_write_guard_trigger` before the existing physical lineage gate. It blocks fresh generic textual-SKU writes and incomplete physical-v2 SKU identity without rewriting historical rows;
- generic correction of a historical legacy textual-SKU entry remains legal only as append-only reversal + replacement preserving the original SKU/order/commit/supply/brand/shop scope. It cannot introduce SKU scope onto an aggregate row, remove it from a legacy SKU row, move it to another SKU, or route a physical-v2 correction through the generic path;
- legacy physical execution fixtures that lack canonical ProductSku lineage remain aggregate-only. A later exact path must be created from real ProductSku-bearing committed lineage rather than a guessed backfill from textual SKU;
- permissions and organisation scope are unchanged: supported writes continue through the existing authenticated/capability-scoped route/application boundaries and database lineage checks.

Supported-path failures are fail-closed before persistence where possible (`HTTP_BODY_FIELD_UNKNOWN`, `HTTP_BODY_FIELD_INVALID`, `PHYSICAL_ACTUAL_COST_EXACT_IDENTITY_REQUIRED`, `SUPPLIER_RECOVERY_EXACT_PRODUCT_SKU_LINEAGE_REQUIRED`, `SUPPLIER_RECOVERY_PRODUCT_SKU_LINE_NOT_CLAIMED`, `SUPPLIER_RECOVERY_SKU_MISMATCH`); PostgreSQL independently protects bypasses with stable lineage errors including `ACTUAL_COST_LEGACY_SKU_NEW_WRITE_FORBIDDEN`, `ACTUAL_COST_EXACT_PRODUCT_SKU_IDENTITY_REQUIRED` and `ACTUAL_COST_LEGACY_CORRECTION_LINEAGE_MISMATCH`.

Automated evidence includes `tests/product-sku-physical-cost-lineage.test.mjs`, `tests/actual-cost-canonical-lineage-contract.test.mjs`, `tests/supplier-recovery-routes-openapi.test.mjs`, `tests/postgres/actual-cost-canonical-lineage-integrity.test.mjs`, `tests/zr-postgres-fulfillment.test.mjs` and `tests/zt-postgres-supplier-recovery.test.mjs`. The latter two deliberately preserve their legacy pre-ProductSku fixtures as aggregate-only evidence. Live ProductSku-bearing Shipment → ActualCost → Margin acceptance remains a separate production-evidence gate and is not implied by these tests.

### 9.3 Corrections — IMPLEMENTED

ActualCost corrections remain append-only reversal/replacement entries linked to the original entry/correction identity. New physical-v2 SKU-specific corrections preserve exact `orderLineNo + productSkuId`; historical non-physical textual-SKU corrections preserve their original legacy scope exactly. No correction edits an immutable historical entry in place.

### 9.4 Landed cost / allocation / margin / close — IMPLEMENTED/PARTIAL

The order-level economics spine is immutable and version-pinned:

```text
ActualCostLedgerEntry
→ LandedCostSnapshot
→ CostAllocationRunSnapshot
→ MarginActualizationSnapshot
→ CostCloseReadinessSnapshot
→ CostCloseSnapshot
→ PostCloseAdjustment
→ new LandedCostSnapshot
→ new MarginActualizationSnapshot
```

`LandedCostSnapshot` remains the order-commit-level frozen total derived from the exact active ActualCost entry IDs. `MarginActualizationSnapshot` and Cost Close remain aggregate order-commit economics; exact ProductSku allocation is provenance and detailed economics evidence, not a silent conversion of those aggregate snapshots into per-SKU documents.

PR #114 closes the confirmed ProductSku-lineage loss inside Cost Allocation:

- canonical allocation mode is `product-sku-v2`; every committed allocation target is the exact `orderLineNo + productSkuId`, while `sku` is display/consistency only;
- two committed lines with the same textual `sku` but different ProductSku IDs remain distinct allocation/economics rows and are never merged by display SKU;
- physical-v2 ActualCost with exact line identity is allocated directly only to the matching exact committed pair; a forged/missing pair fails closed rather than falling back to textual SKU;
- an old textual-SKU ActualCost without exact IDs on an otherwise canonical ProductSku order is treated as aggregate policy-distributed cost, never as a direct ProductSku match;
- aggregate ActualCost is distributed over exact ProductSku order-line targets using the approved immutable policy basis (`unit`, `net_value` or `custom`);
- canonical `custom` allocation uses `customLineWeightsByCostEntryId`, whose rows require `orderLineNo + productSkuId + weight`; optional `sku` is only a consistency assertion. The older `customWeightsByCostEntryId` textual-SKU map is legacy-only and is rejected for canonical ProductSku custom allocation;
- allocation rows and compatibility-named `skuEconomics` rows both carry `orderLineNo`, `productSkuId` and `sku`; exact identifiers are non-null in `product-sku-v2` mode and null in explicit `legacy` mode;
- pre-ProductSku OrderCommit snapshots keep their historical textual-SKU grouping in `legacy` mode and never receive inferred/backfilled ProductSku IDs;
- immutable allocation snapshots continue to persist the richer rows in existing `cost_allocation_run_snapshots.allocations`, `sku_economics` and full `payload` JSONB. No migration is required because the persistence envelope already stores the complete immutable JSON structure;
- Cost Allocation authorization remains `COST_MANAGE` for mutation and `MARGIN_READ` for reads, with existing command/idempotency and transactional-outbox behavior unchanged.

Current `ECON-003` pass binds that immutable allocation into downstream aggregate economics without changing aggregate arithmetic:

- canonical ProductSku margin actualization requires an explicit immutable `costAllocationRunSnapshotId`; the application loads that run and the domain validates exact order, order version, OrderCommitSnapshot, LandedCostSnapshot, currency, active cost-entry set, allocation total and `lineageMode=product-sku-v2`;
- a canonical `MarginActualizationSnapshot` records `allocationStatus=current`, `costAllocationRunSnapshotId`, `costAllocationRunContentHash`, `costAllocationPolicyVersionId`, `costAllocationLineageMode=product-sku-v2` and `aggregateContentHash`; its new `contentHash` commits to the previous aggregate hash plus the immutable allocation provenance;
- explicit pre-ProductSku legacy margin uses `allocationStatus=legacy-not-applicable` and null allocation pins. Legacy rows never receive inferred ProductSku identity;
- `CostCloseReadinessSnapshot` and `CostCloseSnapshot` must pin the same allocation id/hash/policy/mode as their canonical margin basis. Missing, pending or mismatched canonical allocation lineage fails closed;
- generic post-close ActualCost remains aggregate-only. Because a new exact allocation may require new approved custom weights, the late-cost path creates aggregate landed/margin facts with `allocationStatus=pending-post-close` rather than fabricating ProductSku economics; the adjustment preserves the allocation id/hash frozen by the original close;
- `pending-post-close` is not close-ready and must be reconciled by a future explicit exact reallocation/reconciliation command before detailed ProductSku economics can again be called current;
- existing immutable snapshot tables persist these new provenance fields in their full JSONB payloads; `postgres-order-economics-store` gains read-only lookup of `cost_allocation_run_snapshots` by immutable id. No SQL migration is required in this pass because existing scalar accounting columns and immutable JSONB envelopes remain valid;
- outbox margin/readiness/close/post-close events expose allocation status and pin fields so projections can distinguish current, legacy-not-applicable and pending-post-close states.

The composed `/v2` OpenAPI version remains `1.17.0`. `CostAllocationRunInput` exposes exact `customLineWeightsByCostEntryId`; `CostAllocationRow`, `SkuEconomics` and `CostAllocationRunSnapshot` expose exact lineage and `lineageMode`. Margin actualization exposes `costAllocationRunSnapshotId` within the same v2 namespace; canonical ProductSku requests require it by domain invariant while legacy requests may omit it.

Automated evidence includes `tests/cost-allocation-product-sku-lineage.test.mjs` and `tests/econ003-allocation-margin-close-lineage.test.mjs` plus the existing default/PostgreSQL verification suites. `ECON-003` remains OPEN/PARTIAL until the supported post-close exact reallocation/reconciliation command exists and the full allocation→margin→close→post-close relation is proven through PostgreSQL/runtime/live acceptance. Live ProductSku-bearing economics acceptance also remains under `ACC-004`.

Supporting detail: `docs/architecture/order-supply-cost-margin-baseline.md`, `docs/architecture/order-margin-bridge.md`, `docs/architecture/econ003-allocation-margin-close-lineage.md`.

---

## 10. UI/UX master contract — Omnidata Design System v1

### 10.1 Source and rule

ODS v1 is the only current visual/interaction system. New page-local visual dialects and new `omnidata-vN` layers are forbidden. Compatibility layers may remain only while their semantic coverage is migrated and validated.

Canonical assets:

- `public/omnidata-v14-role-system.css` — exact tokens and role styling;
- `public/modules/omnidata-v14-role-system.js` — semantic role/part mapping and runtime audit;
- `public/modules/omnidata-v14-components.js` — component classification;
- `public/modules/omnidata-v14-module-adapters.js` + CSS — compatibility migration primitives;
- `docs/omnidata-design-system-v1.md` — supporting visual-system rationale and migration detail.

### 10.2 Exact typography

| Token | Value |
|---|---|
| Family | `Arial, "Helvetica Neue", Helvetica, sans-serif` |
| XS | `11px` |
| SM | `12px` |
| MD / body | `13px` |
| LG | `16px` |
| XL / H1 | `22px` |
| Base line-height | `1.42` |
| H1 weight/line-height | `600 / 1.18` |
| H2 weight/line-height | `600 / 1.25` |
| H3 | `13px`, weight `700` |
| H4 | `12px`, weight `700` |

### 10.3 Exact colour tokens

| Meaning | Value |
|---|---|
| workspace | `#f2f4f5` |
| sidebar | `#303640` |
| sidebar deep | `#282e37` |
| surface | `#ffffff` |
| soft surface | `#f7f8f9` |
| hover surface | `#fff8f4` |
| primary text | `#222831` |
| soft text | `#56606a` |
| muted | `#69727d` |
| border | `#d9dee3` |
| strong border | `#c7cdd3` |
| primary accent | `#ff5b22` |
| accent hover | `#e84b15` |
| success | `#477052` |
| warning | `#8c661f` |
| danger | `#a94349` |
| info | `#466b8d` |

Status backgrounds/borders are semantic, not module-specific: success `#f0f7f2/#c9dbce`, warning `#fff8e8/#ead8ab`, danger `#fff2f2/#e5c3c6`, info `#f0f6fb/#c8d7e4`.

### 10.4 Spacing and geometry

| Token/primitive | Value |
|---|---|
| spacing scale | `4 / 8 / 12 / 16 / 24 / 32 px` |
| control height | `34px` |
| standard table row | `42px` |
| radii | `3 / 5 / 8 px` |
| max content width | `1760px` |
| inspector width | `360px` |
| expanded sidebar | `232px` |
| compact desktop/tablet sidebar | `208px` |
| collapsed/icon rail | `68px` |
| topbar minimum height | `50px` |
| brand block minimum height | `56px` |
| table minimum width | `720px` |
| table header height | `36px` |
| status chip min height | `22px` |
| textarea min height | `88px` |

### 10.5 Seven permitted visual roles

Exactly seven top-level ODS roles are canonical:

```text
table
filterbar
card
status
inspector
button
field
```

Structural meaning uses `data-ods-part` (page header, toolbar, tabs, pagination, surface, metric, master-detail, form, list, definition grid, timeline, progress, alert, toast, etc.). A module owns business semantics; ODS owns visual language.

### 10.6 Field behavior

- text/select/textarea ODS fields fill available width;
- control min-height `34px`;
- horizontal padding `10px`;
- border strong token, radius `3px`;
- field text `12px` weight 500;
- focus border uses accent and `0 0 0 2px rgba(255,91,34,.1)` ring;
- checkbox/radio canonical geometry `15×15px`, accent colour orange;
- textarea resizes vertically and starts at least `88px` high;
- invalid client state may guide the user but backend remains authoritative.

### 10.7 Table behavior

- wrapper owns horizontal overflow;
- table header is sticky, uppercase, 10px/700, strong bottom border;
- normal rows are 42px and 12px text;
- hover uses `#fff8f4`;
- selected row uses `#fff0ea`;
- numeric content should use tabular numerals;
- last row removes redundant bottom border;
- inspector/detail must not overlap the registry/table.

### 10.8 Status/alert behavior
- status uses rounded pill (`999px`) and semantic tone;
- success/warning/danger/info meaning must not change by locale;
- alert/toast expands to full width of its containing semantic surface and supports multiline content;
- destructive/error meaning uses danger semantics; never encode critical state only by colour without textual state.

### 10.9 Inspector and responsive behavior

Desktop inspector is sticky at `top:62px`, max-height `calc(100vh - 78px)` and scrolls internally. At `<=920px`, master-detail becomes one column and inspector becomes static. Content padding decreases at `<=1080px`; page header/filterbar/metrics reflow at smaller breakpoints including `620px`.

### 10.10 Shell and navigation

Current main shell top-level navigation is generated from a single `NAV_GROUPS` structure:

| Group | View | Icon name |
|---|---|---|
| — | Overview | `overview` |
| DEVELOPMENT | Catalog | `catalog` |
| WHOLESALE COMMERCE | Showrooms | `showrooms` |
| WHOLESALE COMMERCE | Partners | `partners` |
| WHOLESALE COMMERCE | Selections | `selections` |
| WHOLESALE COMMERCE | Orders | `orders` |
| MANAGEMENT | Calendar | `calendar` |
| MANAGEMENT | Notifications | `notifications` |

Sidebar footer actions and icons:

- Refresh — `refresh`;
- Logout — `logout`, danger semantic;
- Collapse/Expand — `collapse` / `expand`;
- RU/EN locale switcher.

Topbar contract:

- breadcrumb with `back` icon and `SYNTHA / section / view` hierarchy;
- current-section search with `search` icon and `⌘K` hint;
- notifications button with `bell` icon and unread count;
- active organisation with `building` icon;
- user avatar initials + display name/email + role.

The sidebar collapsed preference is stored in `localStorage` under `syntha-v2-sidebar-collapsed` after the one-time readable-shell migration.

### 10.11 Login/startup states

Login screen contains locale switcher, brand block, description, email, password and Sign In action. Password field has a minimum client length of 12; server policy remains authoritative. Startup hydration failure shows an explicit error plus Retry and Sign out; it does not silently render a partial workspace.

### 10.12 Required state coverage for every interactive screen

Every new/changed data screen must specify and implement as applicable:

```text
initial/loading
empty
populated
filtered/no-results
selected row/card
validation error
permission denied/disabled action
server/domain error
network/transient error
mutation busy/idempotent replay
success confirmation/toast
stale/version-conflict handling
responsive narrow layout
```

A button without an implemented end-to-end handler is forbidden.

---

## 11. Browser loading and localization contract

### 11.1 Loading order

The standalone shell loads localization first, then shared DOM/API/pagination/capability/validation foundations, then business workspace modules, then final ODS role/component runtimes, with `app-start.js` last. Changing this dependency order is an architecture change and must be documented here.

### 11.2 Languages

Russian and English are mandatory. User-facing strings route through the shared localization runtime. Business data is not translated by the visual normalizer. Established abbreviations such as PLM, BOM, SKU, POM, MOQ, ATS, RFQ, PO, ERP, WMS, PIM, OMS, QC, QMS and API may remain unchanged.

---

## 12. API and mutation contract

### 12.1 General rules

- API namespace: `/v2`.
- The composed authoritative `/v2` OpenAPI `info.version` remains `1.17.0`; module/schema corrections inside the current v2 namespace must not independently create version drift.
- Auth: bearer access token for protected routes.
- Business mutation retries reuse the original idempotency key.
- Transport failures may be retried according to client policy; domain HTTP errors must not be blindly retried with a new command.
- Request body validation is strict where route contracts define allowed fields.
- Domain validation is authoritative even if the UI prevents invalid input.
- OpenAPI must change in the same PR as a public request/response change.

### 12.2 Error design

Domain failures use stable semantic error codes. New fail-closed invariants should surface a domain-level error before a raw database-trigger error whenever the supported application path can detect the condition. The database still protects direct/internal bypasses.

### 12.3 Cost allocation and margin lineage API — IMPLEMENTED/PARTIAL downstream reconciliation

`POST /v2/orders/:orderId/cost-allocation-runs` accepts an exact `landedCostSnapshotId`, approved `policyVersionId`, optional legacy `customWeightsByCostEntryId`, and optional canonical `customLineWeightsByCostEntryId`.

- `customLineWeightsByCostEntryId[costEntryId]` is an array of `{ orderLineNo, productSkuId, weight, sku? }`; duplicate exact pairs, malformed identifiers, negative/non-finite weights and unknown row fields are rejected at HTTP boundary;
- for canonical ProductSku commits the domain accepts exact custom line weights only; textual-SKU custom maps are legacy-only;
- response `CostAllocationRunSnapshot.lineageMode` is `product-sku-v2` or `legacy`;
- every `CostAllocationRow` and compatibility-named `SkuEconomics` response row includes `orderLineNo`, `productSkuId` and `sku`; exact identifiers are null only for explicit legacy commits.

`POST /v2/orders/:orderId/margin/actualize` accepts required `landedCostSnapshotId` and optional-at-transport `costAllocationRunSnapshotId`. For a canonical ProductSku OrderCommit the latter is domain-required and must identify the immutable allocation run matching the exact landed basis. For explicit legacy OrderCommit lineage the field is omitted and no ProductSku allocation reference is synthesized.

Public version remains `/v2` / OpenAPI `1.17.0`; these are invariant corrections, not a new parallel API version.

---

## 13. PostgreSQL and migration contract

- Every schema change is a new numbered migration.
- Applied migrations are never edited.
- Migration checksum is stored in `schema_migrations`.
- Advisory locking serializes concurrent migrators.
- Referential/lineage invariants that must survive direct SQL/service bypass should be protected at the database boundary where practical.
- Historical immutable rows are not rewritten just to conform to a newer lineage version; use versioned semantics and forward-only enforcement.
- Append-only ledgers require corrections/reversals/adjustments rather than mutable overwrite.
- ActualCost migration 073 is forward-only: generic fresh writes are aggregate-only; new SKU-specific physical writes require exact `order_line_no + product_sku_id`; historical non-physical textual-SKU rows remain immutable and may only be corrected by preserving their original lineage through reversal + replacement.
- Legacy rows/tests that lack ProductSku remain legal only in aggregate cost scope. Neither migration 073 nor application compatibility code may infer/backfill ProductSku from textual SKU.
- Cost Allocation exact-lineage output requires no migration: `cost_allocation_run_snapshots` already persists `allocations`, `sku_economics` and the complete immutable snapshot `payload` as JSONB, so `orderLineNo`, `productSkuId` and `lineageMode` are retained without introducing redundant relational columns or rewriting prior snapshots.
- Allocation→margin→readiness→close provenance in the current `ECON-003` pass also requires no migration: existing immutable economics tables already persist complete snapshot `payload` JSONB while their scalar accounting columns remain unchanged. The economics store reads an immutable `cost_allocation_run_snapshots.payload` by id for fail-closed validation; historical snapshots are not rewritten.

---

## 14. Events, workers and side effects

Business mutations that publish integration effects use the transactional outbox pattern. Verification/runtime smoke disables external webhook side effects. A live acceptance scenario must identify what downstream state is allowed to change and explicitly prove important state that must remain unchanged.

---

## 15. Verification and production-evidence ladder

### 15.1 Default gate

`npm run verify` includes architecture boundaries, PostgreSQL static contract, isolation, UI, ODS, i18n, MDM, governed KPI methodology and application tests.

### 15.2 PostgreSQL release-candidate gate

`npm run verify:postgres` adds PostgreSQL integration coverage and the real runtime process smoke.

### 15.3 Live acceptance

Current live acceptance coverage is deliberately narrow:

```text
Campaign → Collection
```

It uses public authenticated HTTP plus same-environment PostgreSQL verification. It is non-destructive outside its reserved acceptance namespace and compares downstream invariant counters.

### 15.4 Required acceptance expansion order

Expand one business slice at a time, preserving explicit before/after invariants:

1. Campaign → Collection — IMPLEMENTED.
2. Product Identity → Readiness — PLANNED next proof slice.
3. Readiness → Projection → Publication → BuyerCatalog — PLANNED.
4. BuyerCatalog → Selection → OrderCommit — PLANNED.
5. OrderCommit → Supply → Shipment — PLANNED.
6. Shipment → SKU-specific ActualCost → exact ProductSku allocation → MarginActualization — PLANNED live proof; exact ActualCost is implemented in #112, exact allocation in #114, and the current `ECON-003` pass pins canonical allocation into pre-close margin/readiness/close. PostgreSQL/runtime/live proof and post-close exact reallocation remain outstanding.
7. Full connected Product → Margin golden path — final P0 proof.

A direct service/domain test is not a substitute for a live public API acceptance gate. Aggregate legacy PostgreSQL flows may verify compatibility but do not count as proof of the ProductSku-specific acceptance slice.

---

## 16. Capability and completeness register

This is the current high-level master status. Supporting detail is kept in this file’s domain sections and `docs/architecture/syntha-v2-live-capability-register.md`; when status changes, this table must change in the same PR.

| Capability | Status | Main unresolved gate |
|---|---|---|
| Runtime clean-clone/start/readiness/shutdown | PROD-PROVEN | deployment-specific acceptance remains environment responsibility |
| Authentication + organisation foundation | IMPLEMENTED | continue role/capability coverage audits |
| Product Identity V2 | IMPLEMENTED | complete all UI/legacy catalog convergence |
| PLM Planning/Styles | PARTIAL | converge all semantics on Product Identity |
| Materials/BOM/Measurements/Samples | IMPLEMENTED/PARTIAL | ODS debt + canonical readiness integration by workspace |
| Sourcing/Tech Pack | IMPLEMENTED/PARTIAL | supplier/sourcing depth + ODS debt for Sourcing |
| Production/Final Quality | IMPLEMENTED | continue physical lineage/readiness E2E proof |
| ProductReadinessSnapshot | IMPLEMENTED | live acceptance slice |
| CommercialProjection | IMPLEMENTED | publication-only canonical handoff completion |
| CommercialPublication | IMPLEMENTED/PARTIAL | eliminate flat-catalog origin debt |
| BuyerCatalog/Linesheet | IMPLEMENTED/PARTIAL | variant-rich ProductSku hierarchy |
| Color × Size matrix | PARTIAL | exact immutable buyer matrix completion |
| WholesaleOrder/OrderCommit | IMPLEMENTED | expand live acceptance |
| SupplyCommitment | IMPLEMENTED | expand physical acceptance |
| Shipment/Receipt/Supplier Recovery | PARTIAL | exact ProductSku recovery contract implemented; live exact-lineage recovery acceptance remains |
| Inventory | IMPLEMENTED core | continuous reconciliation/golden-path proof |
| Generic aggregate ActualCost | IMPLEMENTED | live economics acceptance; new generic/post-close writes remain aggregate-only |
| SKU-specific ActualCost | IMPLEMENTED | live Shipment → ActualCost → Margin acceptance |
| Cost Allocation | IMPLEMENTED | live ProductSku economics acceptance; post-close exact reallocation/reconciliation |
| Landed cost / Margin / Close | IMPLEMENTED/PARTIAL | canonical pre-close allocation pin implemented in current ECON-003 pass; PostgreSQL/live proof + post-close reconciliation remain |
| KPI governance/methodology | PARTIAL production connection | complete exact runtime/persistence/reconciliation |
| ODS v1 | IMPLEMENTED with compatibility debt | burn legacy layers down; never add new dialect |
| Full Product → Margin live acceptance | PLANNED | progressively extend after P0 lineage gates |

---

## 17. Known architecture gaps and debt register

| ID | Priority | Gap | Required outcome | Status |
|---|---|---|---|---|
| `AC-LINEAGE-001` | P0 | Generic ActualCost accepted textual SKU without exact physical lineage | aggregate-only generic path; exact ProductSku physical path; DB fail-closed guard; preserve legacy corrections | CLOSED in #112 |
| `AC-HTTP-002` | P0 | Physical ActualCost resolver supported exact IDs but HTTP/OpenAPI did not expose them | request + response include `orderLineNo` and `productSkuId`; generic SKU scope removed | CLOSED in #112 |
| `ECON-003` | P0 | ActualCost → landed/allocation/margin path can lose or leave unproven ProductSku lineage | exact allocation line identity plus reproducible aggregate margin/close semantics from frozen lineage | OPEN/PARTIAL — exact allocation fixed in #114; current pass pins exact allocation into canonical pre-close margin/readiness/close and marks post-close late-cost margin `pending-post-close`; explicit post-close reallocation/reconciliation + PostgreSQL/runtime/live proof remain |
| `ACC-004` | P0 | Live acceptance proves only Campaign → Collection | progressively prove canonical Product → Margin spine | OPEN |
| `PUB-005` | P0 | Some historical publication/catalog behavior remains flat-catalog oriented | projection-only variant-rich publication/buyer catalog | OPEN/PARTIAL |
| `UI-006` | P1 | Legacy Omnidata CSS/JS compatibility layers remain loaded | migrate semantics to ODS v1 and remove debt only after validation | OPEN/PARTIAL |
| `SPEC-007` | P0 | Historical architecture/product/UI detail was fragmented across docs/code | authoritative `ARCHITECTURE.md` + CI synchronization rule | CLOSED in #110 |

Every confirmed gap discovered during audit is added here before or with its implementation fix. Closed gaps remain in the table/change history or are moved to the closed section; they are not silently deleted.

---

## 18. Detailed screen/workspace specification rule

For every screen or workspace touched from this point forward, maintain a subsection using this exact schema:

```text
Screen ID / route / navigation entry
Purpose and personas
Upstream context and required IDs
Header / breadcrumb / primary action
Filters and defaults
KPI/metric cards
Main table/list: every column, source, formatting, sorting, filtering
Inspector/detail: every block and field
Forms/dialogs: every field, type, required/default/validation/source
Buttons/actions: icon, label RU/EN, visibility, capability, handler, API, state transition
Statuses: values, semantic tone, transitions
Empty/loading/error/permission/conflict states
Pagination/search/keyboard behavior
Responsive behavior
Data/API dependencies
Persistence/effects
Downstream effects and invariants
Automated evidence
Status/gaps/change reference
```

The existing shell/ODS sections above are already governed at this level. Individual business workspaces will be progressively brought to the same field-level inventory as they are audited or changed; an unaudited detail must be marked as such rather than invented.

---

## 19. Data dictionary rule

Every canonical entity changed from this point forward must list its business key/ID, organisation scope, mutable vs immutable nature, important fields, upstream foreign/version references, downstream consumers and lifecycle. Exact SQL remains in migrations, but this document must explain the business meaning of every material field introduced or changed.

Minimum frozen lineage fields for the current commercial spine include:

| Entity | Mandatory lineage meaning |
|---|---|
| StyleVersion | exact ProductStyle + predecessor/version/content identity + governed refs |
| Colorway | exact StyleVersion + brand + colour identity/ref |
| ProductSku | exact StyleVersion + Colorway + SizeValue |
| ProductReadinessSnapshot | exact StyleVersion + exact source/evidence versions + readiness result |
| CommercialProductProjectionVersion | exact ready snapshot + immutable commercial projection version |
| CommercialPublication | exact projection/source publication version/lifecycle |
| BuyerCatalogVersion | exact publication/price/catalog snapshot |
| Selection | exact buyer/catalog version and selected SKU/price context |
| OrderCommitSnapshot | exact agreed order lines/terms/currency/commercial facts |
| SupplyCommitment | exact order commit and physical line allocations |
| ShipmentLine | exact committed order line + ProductSku for canonical lineage |
| ReceiptClaim issue line | exact shipment line facts; when canonical ProductSku lineage exists, preserves `orderLineNo + productSkuId + sku(display)` for downstream recovery |
| ActualCostLedgerEntry | order/commit/supply; exact shipment/orderLine/ProductSku when SKU-specific physical v2; textual SKU is display/legacy compatibility only |
| CostAllocationRunSnapshot | exact order commit + landed snapshot + policy + active cost entry IDs; `lineageMode`; canonical allocation/economics rows preserve `orderLineNo + productSkuId + sku(display)`, legacy rows keep exact IDs null |
| MarginActualizationSnapshot | exact committed revenue + exact LandedCostSnapshot; canonical ProductSku lineage additionally freezes allocation status + exact CostAllocationRunSnapshot id/hash/policy/mode; legacy uses explicit `legacy-not-applicable`; canonical late-cost post-close uses `pending-post-close` until exact reallocation |
| CostCloseReadinessSnapshot | exact landed + margin basis and, for canonical ProductSku economics, the same immutable allocation run id/hash/policy/mode |
| CostCloseSnapshot | exact readiness + landed + margin basis and the same canonical allocation pin frozen at close |
| PostCloseAdjustment | immutable close baseline + new ActualCost/Landed/Margin chain; preserves closed allocation provenance and records resulting allocation status without inventing ProductSku allocation |

---

## 20. Change register

| Date | PR / commit | Change | Master sections affected | Evidence/status |
|---|---|---|---|---|
| 2026-08 | #106 | Non-destructive live Campaign → Collection acceptance | 7.2, 15 | merged; public HTTP + PostgreSQL acceptance |
| 2026-08 | #107 | Repeatable owner bootstrap + isolated dev/test PostgreSQL clean-clone path | 2.3, 2.5 | merged; CI verified |
| 2026-08 | #108 | Order currency frozen to submitted Selection lineage | 7.5 | merged; Verify/PostgreSQL CI |
| 2026-08 | #109 / `4f5c452dede1ce9c8ffe518eddb8b6632cc89ad0` | Real supported runtime process smoke added to `verify:postgres` | 2.2, 15.2 | merged; Verify/MDM/PostgreSQL CI green |
| 2026-08-28 | #110 | Establish one authoritative platform/UI/data/architecture specification and CI synchronization contract | entire document | merged; `ARCHITECTURE.md` authoritative |
| 2026-08-29 | #112 | Close ActualCost textual-SKU bypass; require exact ProductSku physical and supplier-recovery identity; keep legacy pre-ProductSku physical/recovery fixtures aggregate-only; expose exact fields in authoritative OpenAPI 1.17.0 without version drift; add forward-only PostgreSQL guard and compatibility-safe tests | 1.2, 8, 9, 12, 13, 15, 16, 17, 19 | merged; required Verify/PostgreSQL CI green; supersedes draft #111 |
| 2026-08-29 | #114 / `47b39f5930540f27fe6bebfbe3bceb0e2b114fdf` | Preserve exact `orderLineNo + productSkuId` through Cost Allocation; prohibit canonical textual-SKU direct/custom resolution; retain explicit legacy mode; expose exact HTTP/OpenAPI output and persist through existing JSONB snapshots | 9.4, 12.3, 13, 15, 16, 17, 19 | MERGED; Verify run `33249799746` success; Syntha V2 CI run `33249799764` success; supersedes closed draft #113; `ECON-003` remains OPEN/PARTIAL |
| 2026-08-31 | `fix/econ003-allocation-margin-close-lineage` / PR pending | Bind immutable CostAllocationRunSnapshot into canonical MarginActualization → CostCloseReadiness → CostClose; preserve explicit legacy semantics; mark canonical post-close late-cost margin `pending-post-close`; expose allocation provenance in events and store lookup | 1.2, 3.3, 9.4, 12.3, 13, 15, 16, 17, 19, 20 | implementation + focused regression in branch; OpenAPI synchronization and required CI are mandatory before PR/merge; `ECON-003` remains OPEN/PARTIAL until post-close exact reallocation + live proof |

Future implementation PRs add a row here. The row is not a substitute for updating the affected detailed sections.

---

## 21. Supporting specifications and their authority

These files remain useful deep dives and evidence. They must be reconciled into this master specification when behavior changes:

- `docs/architecture/product-identity-v2.md`
- `docs/architecture/product-readiness-commercial-projection-v2.md`
- `docs/architecture/order-supply-cost-margin-baseline.md`
- `docs/architecture/order-margin-bridge.md`
- `docs/architecture/econ003-allocation-margin-close-lineage.md`
- `docs/architecture/syntha-v2-live-capability-register.md`
- `docs/commercial-execution-spine.md`
- `docs/commercial-publication-linesheets.md`
- `docs/omnidata-design-system-v1.md`
- `docs/fashion-kpi/`
- `docs/observability.md`
- `docs/joor-retailer-cabinet-complete-map.md` — research/reference map, not proof that a Syntha capability is implemented.

A supporting document can be more verbose, but it cannot redefine a canonical entity, lifecycle or visual token without the same change being made here.

---

## 22. Definition of Done for Syntha V2 changes

A change is DONE only when all applicable boxes are true:

- [ ] domain behavior is implemented and fail-closed;
- [ ] exact entity/lineage relations are preserved;
- [ ] API + OpenAPI agree;
- [ ] persistence constraints/transactions agree with domain rules;
- [ ] organisation/RBAC/capabilities are enforced;
- [ ] UI has a real handler and all states, not a decorative control;
- [ ] RU/EN user-facing content is wired through localization;
- [ ] ODS v1 roles/tokens are reused; no local visual dialect is introduced;
- [ ] unit/integration/PostgreSQL tests cover the changed invariant;
- [ ] live acceptance is expanded when the change crosses a previously unproven business boundary;
- [ ] `ARCHITECTURE.md` records fields/actions/relations/UI/API/status/gaps affected by the change;
- [ ] change register row is added/updated;
- [ ] `npm run verify` passes;
- [ ] `npm run verify:postgres` passes for release-candidate changes;
- [ ] PR is mergeable and required GitHub CI is green.

This checklist is deliberately stricter than “code compiles”. Syntha V2 is treated as one operating platform, so a locally correct screen or service is not complete if its upstream/downstream contract is broken or undocumented.