# Syntha V2 — Platform Master Specification

> **Canonical living specification / architecture / product requirements / UI contract**  
> Status date: **2026-09-05**  
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

When a late cost is recorded after close, the immutable continuation is explicit rather than a rewrite of the close:

```text
CostCloseSnapshot
→ PostCloseAdjustment
→ adjusted LandedCostSnapshot
→ MarginActualizationSnapshot(allocationStatus=pending-post-close)
→ exact new CostAllocationRunSnapshot
→ PostCloseAllocationReconciliationSnapshot
→ reconciled MarginActualizationSnapshot(allocationStatus=current)
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

### 2.6 Product commercialization acceptance runtime — IMPLEMENTED / LIVE EVIDENCE PENDING

`npm run acceptance:product-commercialization` is the P0.3 public-runtime acceptance entry point. It starts from a fresh positive Product Readiness graph created by the existing canonical READY harness, then continues through the current executable commercial boundary without direct SQL business mutation.

The acceptance setup may migrate the configured PostgreSQL target, bootstrap source-controlled governed MDM through the canonical MDM bootstrap, and ensure the reserved acceptance authentication identities. Business facts are then created only through authenticated `/v2` commands with `Idempotency-Key`.

The stable acceptance organisation/membership bootstrap is itself replay-safe command setup. Its durable command IDs always use the deterministic membership `createdAt=2026-08-31T00:00:00.000Z`; wall-clock time is forbidden from that command payload because replaying the same command ID with a different fingerprint must correctly fail with `COMMAND_ID_CONFLICT`. This deterministic timestamp is acceptance namespace metadata only and does not replace the real timestamps of business facts created through public `/v2` mutations. `tests/production-reference-bootstrap-replay.test.mjs` proves two consecutive bootstraps produce identical command fingerprints and references.

Two real actor contexts are required:

- reserved brand owner `syntha-acceptance-brand-owner`, authenticated with `SYNTHA_ACCEPTANCE_EMAIL` / `SYNTHA_ACCEPTANCE_PASSWORD` or optional short-lived `SYNTHA_ACCEPTANCE_TOKEN`;
- reserved shop owner `syntha-acceptance-shop-owner`, authenticated with `SYNTHA_ACCEPTANCE_SHOP_EMAIL` / `SYNTHA_ACCEPTANCE_SHOP_PASSWORD` or optional short-lived `SYNTHA_ACCEPTANCE_SHOP_TOKEN`.

`SYNTHA_ACCEPTANCE_BASE_URL` and the configured database URL must refer to the same environment; PostgreSQL is read after HTTP mutations to prove exact persistence and immutable lineage. Non-local execution remains fail-closed unless the target is HTTPS and `SYNTHA_ACCEPTANCE_ALLOW_REMOTE=true` is explicitly set. The dedicated GitHub workflow `Product Commercialization Acceptance` starts the supported `scripts/start.mjs` process against PostgreSQL 17, waits for `/ready`, executes this same command, terminates the process with SIGTERM and retains diagnostics. Merely defining that workflow is not live evidence; `PROD-PROVEN` is forbidden until the intended acceptance environment actually completes the gate successfully.

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

Readiness, projection, publication, buyer catalog, selection, order commitment, supply, actual cost, allocation, margin, close, post-close adjustment and post-close allocation reconciliation records preserve exact source versions/IDs. Current master labels cannot retroactively redefine historical facts. A reconciliation adds a new immutable fact and a new current margin; it never edits the CostClose, PostCloseAdjustment, pending margin or prior allocation run.

### 3.4 Physical lineage

Canonical supply/physical execution uses exact `ProductSku` plus committed order line. New exact paths must not join by fuzzy SKU/name/date when immutable identifiers exist.

### 3.5 Inventory

Inventory truth is centralized around location/balance/reservation/allocation/movement. ATS is derived centrally from canonical balance semantics. Mutation paths require idempotency, locking and reconciliation; a buyer/order screen must not maintain a second stock balance.

### 3.6 Pricing

Pricing exposed to buyers is server-authoritative and snapshot/version based. Client-calculated price is presentation only and cannot become order truth.

### 3.7 Corrections, not rewrites

Immutable commercial, physical and economic ledgers are corrected through append-only reversal/replacement/adjustment/reconciliation semantics. Historical records are not edited in place to make current totals look correct.

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

`StyleVersion.categoryRef` is the canonical governed category reference for a new technical fact. The compatible dictionary family is exactly `assortment.category`; a new reference pins the exact MDM `(entryId, version)` and is accepted only when that exact version exists, is the current entry version for the new write, belongs to the compatible dictionary, is active, is approved when approval is required, is effective at the business write time, and is global or belongs to the permitted organisation scope. Unknown, stale-version, wrong-dictionary, inactive, unapproved or out-of-effect references fail closed before the StyleVersion is created. The resolved reference is frozen through the immutable MDM usage/version snapshot so later MDM changes cannot redefine historical Product Identity meaning.

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

#### Canonical Measurement Chart — IMPLEMENTED / live execution evidence pending

The canonical Measurement Chart is repository-authoritative measurement evidence for Product Identity and Product Readiness. Its immutable identity context is the exact same-brand tuple `StyleVersion + Colorway + SizeScaleVersion`; it never derives canonical identity from a textual SKU. The chart pins the exact governed MDM version of its `measurement.unit` and every `measurement.point`, preserves the ordered Product `SizeValue` matrix, and is the only measurement-chart family eligible to satisfy the canonical Product Readiness `measurements` gate.

Supported public API contract:

```text
POST  /v2/measurements/canonical
GET   /v2/measurements/canonical/:chartId
PATCH /v2/measurements/canonical/:chartId
POST  /v2/measurements/canonical/:chartId/publish
```

There is deliberately no canonical collection `GET /v2/measurements/canonical` and no canonical `PUT` update route. OpenAPI must describe exactly the supported methods; introducing either absent route as documentation-only behavior is forbidden.

Create accepts exactly these top-level fields and rejects unknown fields:

```text
styleVersionId
colorwayId
sizeScaleVersionId
measurementUnitEntryId
baseSizeValueId
sizes
points
notes
```

Each `sizes` row is exactly `{ sizeValueId }`. Each `points` row is exactly `{ pointEntryId, description, toleranceMinus, tolerancePlus, measurements }`, and every measurement value is exactly `{ sizeValueId, value }`. `notes` is a required request key and may normalize to null/empty semantics according to the domain optional-text rule; callers may not omit the key. The update request is the exact editable set above without the three identity fields plus required optimistic-concurrency `expectedVersion`. Publication accepts exactly `{ expectedVersion }`.

All three canonical mutations require authenticated actor context, the existing measurement-management capability/brand ownership checks and `Idempotency-Key`. The service resolves the exact StyleVersion, Colorway, SizeScaleVersion and SizeValues; resolves the current effective MDM entries for `measurementUnitEntryId` and each `pointEntryId`; and fails closed for missing/mismatched Product Identity, wrong brand, wrong dictionary, inactive/unapproved/not-effective MDM entries, unexpected fields, stale `expectedVersion`, duplicate size/point identities or invalid/incomplete matrices. Russia-first canonical garment measurement units must be governed `measurement.unit` length entries using the metric system.

The canonical runtime MDM truth is the exact version snapshot persisted by the MDM store, not the source-registry JSON shape used before bootstrap. Canonical Measurement point localization therefore reads `pointRef.snapshot.translations.ru.name`, `pointRef.snapshot.translations.en.name` and the RU description from `pointRef.snapshot.translations.ru.description`; semantic properties continue to come from the same versioned `snapshot.attributes`. Source dataset aliases such as `name_ru`, `name_en` and `description_ru` are bootstrap input only and are forbidden as runtime fallback fields. A runtime snapshot without the required normalized translation fails closed with `MEASUREMENT_POINT_NAME_INVALID` rather than silently consulting a second source truth. `tests/measurement-runtime-mdm-snapshot.test.mjs` pins both the normalized runtime success case and the source-alias-only rejection.

Lifecycle is append/history preserving:

```text
DRAFT → PUBLISHED
PUBLISHED --PATCH with expectedVersion--> new DRAFT revision
```

A PATCH to a published chart archives the published revision before saving the new DRAFT revision; it never destructively mutates published historical evidence. Publication requires at least one governed point and a complete ordered value matrix for every selected Product SizeValue, including the base size. Readiness reads the latest exact PUBLISHED canonical chart for the Product Identity context and retains the exact chart/version/MDM evidence rather than reinterpreting it from current master data.

The older SKU-oriented `/v2/measurements`, `/v2/measurements/:sku` and `/v2/measurements/:sku/publish` routes remain a **DEPRECATED compatibility surface for Product Identity/readiness semantics** until consumer/UI migration is audited. They must not be used as canonical evidence for new ProductReadiness writes and must not acquire new Product Identity semantics. PR #117 synchronizes the previously missing canonical runtime routes into the existing measurement OpenAPI module rather than creating a second API truth; `tests/measurement-canonical-openapi.test.mjs` pins exact methods, request fields, idempotency/auth, absence of canonical collection-GET/PUT and continued legacy compatibility. The separate positive READY acceptance harness now consumes this exact public canonical route set and asserts the PUBLISHED chart/MDM/size matrix through same-environment PostgreSQL. The runtime/OpenAPI/acceptance contract is `IMPLEMENTED`; actual intended live acceptance execution is still pending and therefore is not `PROD-PROVEN`.

### 5.3 Operational MDM reference profile — IMPLEMENTED/PARTIAL taxonomy depth

The source-controlled `mdm/reference/*.json` files form the bootstrap operational profile `RU_FASHION_CORE`. They are modular datasets, not independent copies of one monolithic reference file. A modular dataset must still declare RU market, RU/EN language coverage, a registered source, governed dictionary metadata and valid entry governance, but it is not required to duplicate unrelated size/unit dictionaries merely to exist.

`npm run validate:mdm` loads all operational reference datasets first and then validates the required Russia-fashion core across the complete loaded profile. The required size-system codes are `RU_APPAREL_NUMERIC`, `INT_ALPHA` and `EU_FOOTWEAR`; required operational units are `CM`, `MM`, `M`, `G`, `KG` and `PCS`. Those mandatory profile checks are global across `mdm/reference`, while semantic cross-entry references that are deliberately dataset-local remain local: seeded size values/footwear sizes must resolve `size_system_entry_id` to a `size.system` entry in the same dataset, and a seeded `measurement.point` must resolve `default_unit_entry_id` to a `measurement.unit` entry in the same dataset. Universal size-conversion fields remain forbidden; explicit governed brand/market conversion records are required instead.

PR #117 adds `mdm/reference/russia-fashion-assortment-core.json` as an operational governed category seed from registered source `syntha_operational_master`. It defines dictionary:

```text
id: mdm-dictionary:assortment-category
code: assortment.category
data_class: classifier
scope_model: global
hierarchy_enabled: true
effective_dated: true
approval_required: true
```

and the initial active entry:

```text
id: mdm-entry:assortment-category:apparel
version: 1
code: APPAREL
RU: Одежда
EN: Apparel
effective_from: 2026-08-31T00:00:00.000Z
hierarchy_level: category
product_family: apparel
```

`APPAREL` is intentionally only the governed top-level apparel category. It does **not** stand in for a subcategory or `assortment.product_type`, and it must not be overloaded with gender, collection, season or arbitrary style attributes. More detailed category/product-type taxonomy is added only through separately governed MDM versions and registered source/effective-date semantics.

This source-controlled seed makes an exact governed category reference available to the positive Product Readiness path; it does not by itself make Product Readiness or downstream commercialization `PROD-PROVEN`.

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

#### ACC-004 Product Identity → Readiness dual acceptance harness — IMPLEMENTED / LIVE EVIDENCE PENDING

PR #117 implements two independent Product Identity → Product Readiness acceptance scenarios under the existing `npm run acceptance:product-readiness` entry point. The runner uses the same acceptance environment/origin/authentication controls as `acceptance:collection`, migrates the configured PostgreSQL target, idempotently bootstraps every source-controlled `mdm/reference/*.json` dataset through the canonical `bootstrapMdmReference` infrastructure path, bootstraps only the stable acceptance organisations/roles, and performs all business mutations through authenticated public `/v2` API calls. The MDM bootstrap is controlled environment/master-data setup, not a direct SQL business mutation.

**Scenario A — fail-closed, preserved unchanged.** It creates:

```text
ProductStyle
→ StyleVersion(no categoryRef)
→ Colorway
→ SizeScale
→ SizeScaleVersion
→ SizeValue
→ ProductSku
→ ProductMedia(hero)
→ ProductReadinessSnapshot(BLOCKED)
→ rejected CommercialProductProjectionVersion attempt
```

The scenario deliberately uses `developmentRoute=READY_GOODS`, omits governed `StyleVersion.categoryRef`, and creates no canonical Measurement Chart. This remains a controlled negative fixture even though `RU_FASHION_CORE` contains exact governed `assortment.category / APPAREL` data. It supplies immutable external evidence only for `sourcing`, `purchase_or_production_commitment`, `quality` and `compliance`, plus valid commercial media/content/terms/availability. The readiness result must be **blocked** with exactly `category` and `measurements`, with blocked count exactly `2`. Any READY result, missing blocker, extra blocker or changed blocker count fails closed.

After PostgreSQL confirms that blocked snapshot, Scenario A calls `POST /v2/product/readiness/:readinessId/commercial-projection` with `expectedLatestVersionNo=0`. The only accepted outcome is HTTP `422` with `COMMERCIAL_PROJECTION_READINESS_BLOCKED`; exact StyleVersion/brand `commercial_product_projection_versions` rows must be zero both before and after the rejected command. This negative scenario is never replaced by the happy path.

**Scenario B — positive canonical.** A separate graph is created through supported public API:

```text
ProductStyle
→ StyleVersion(categoryRef=APPAREL v1)
→ Colorway
→ SizeScale
→ SizeScaleVersion(size.system=INT_ALPHA v1)
→ SizeValue(M / mdm-entry:size:int-m v1)
→ ProductSku
→ ProductMedia(hero)
→ canonical Measurement Chart DRAFT
   measurement.unit=CM v1
   measurement.point=CHEST_CIRC v1
   exact SizeValue matrix
→ canonical Measurement Chart PUBLISHED
→ ProductReadinessSnapshot(READY, blockers=0)
```

Scenario B does not use external evidence for the canonical `category` or `measurements` gates. It uses repository-authoritative StyleVersion MDM usage plus the exact PUBLISHED canonical Measurement Chart and uses external immutable evidence only for the same route-aware `sourcing`, `purchase_or_production_commitment`, `quality` and `compliance` gates that have no canonical repository source in this READY_GOODS acceptance fixture. Every business mutation is authenticated and idempotent; acceptance command IDs are bounded to the public `Idempotency-Key` maximum of 128 characters even with the maximum accepted 80-character runId.

The positive same-environment PostgreSQL assertion joins the exact StyleVersion category columns and `mdm_usage_snapshots`, Colorway, SizeScaleVersion, SizeValue, ProductSku, ProductMedia, canonical Measurement Chart, chart-size/point/value matrix and ProductReadinessSnapshot. It pins exact `APPAREL`, `INT_ALPHA`, `INT_M`, `CM` and `CHEST_CIRC` entry versions; exact same-brand Product Identity; exact chart StyleVersion/Colorway/SizeScaleVersion/base SizeValue; PUBLISHED chart revision; exact measurement value; and READY with zero blocked dimensions. Before/after isolation counters require no changes to CommercialPublication, PriceListVersion, BuyerCatalogVersion, Selection/Order, ProductSku inventory, warehouse movement, SupplyCommitment or ActualCost state. The standalone `npm run acceptance:product-readiness` command deliberately stops this Scenario B at READY; the separate P0.3 `acceptance:product-commercialization` command creates its own fresh positive READY graph and continues that exact graph downstream without altering Scenario A or weakening the readiness gate.

Automated evidence is split so one scenario cannot weaken the other: `tests/product-readiness-live-acceptance.test.mjs` pins Scenario A, `tests/product-readiness-ready-live-acceptance.test.mjs` pins Scenario B including wrong-actor and MDM/published-chart drift failures, `tests/mdm-assortment-category-reference.test.mjs` pins the operational category dataset/validator contract, `tests/measurement-canonical-openapi.test.mjs` pins the canonical measurement API/OpenAPI contract, and `tests/measurement-runtime-mdm-snapshot.test.mjs` prevents source-registry localization aliases from reappearing as a second runtime MDM truth. These tests and the executable harness establish `IMPLEMENTED` status, not `PROD-PROVEN`. `PROD-PROVEN` requires a successful `npm run acceptance:product-readiness` execution against the intended live runtime and same PostgreSQL environment. The full Product → Margin `ACC-004` gate remains OPEN/PARTIAL.

### 6.2 CommercialProductProjectionVersion — IMPLEMENTED / positive acceptance harness added

Created only from an eligible READY ProductReadinessSnapshot. It is an immutable commercial projection, not a live PLM read model. Projection continuity/version lineage is preserved and the current executable constructor persists it directly with immutable `status=published`.

The P0.3 acceptance runner calls `POST /v2/product/readiness/:readinessId/commercial-projection` with `expectedLatestVersionNo=0` against the exact positive READY snapshot, then reads the result through `GET /v2/product/commercial-projections/:projectionId`. The gate requires version `1`, status `published`, exact `readinessSnapshotId`, exact `styleVersionId` and stable `contentHash`; same-environment PostgreSQL must show the same values. Scenario A from #117 continues to prove the inverse fail-closed boundary: a blocked snapshot cannot create any projection row.

This positive public-runtime harness is `IMPLEMENTED`. A successful intended-environment execution is still required before any `PROD-PROVEN` claim.

### 6.3 CommercialPublication — IMPLEMENTED atomic published snapshot / PARTIAL staged lifecycle

The authoritative current runtime does **not** implement the previously documented staged lifecycle. The executable canonical V2 path today is:

```text
READY ProductReadinessSnapshot
→ CommercialProductProjectionVersion(status=published)
→ POST /v2/commercial-publications
→ CommercialPublication(formatVersion=2, status=published)
```

The V2 CommercialPublication is an immutable projection-backed snapshot. Creation requires the exact brand-owned CommercialProductProjectionVersion and an exact Collection assignment to the same `StyleVersion`; it freezes projection id/version/content hash, readiness snapshot id, StyleVersion id, currency, exact ProductSku line terms and the Style → Colorway → ordered SizeValue/ProductSku hierarchy. PostgreSQL independently checks projection/collection/style/currency/payload lineage and published snapshots are not mutated in place.

The desired production lifecycle remains a required P0 target:

```text
DRAFT → READY → PUBLISHED → SUPERSEDED / ARCHIVED
```

No canonical V2 DRAFT/READY/SUPERSEDED/ARCHIVED CommercialPublication state transitions or public mutation routes exist at this baseline. Therefore that lifecycle is `GAP`, not IMPLEMENTED. It must be added without creating a second publication model, or the target contract must be explicitly revised if product governance chooses a different single canonical lifecycle. Historical flat-catalog publication compatibility remains DEPRECATED migration debt and may not receive new Product semantics.

### 6.4 PriceListVersion — IMPLEMENTED core / PARTIAL production pricing depth

The current V2 PriceListVersion is an immutable server-authored `published` snapshot created from one exact projection-backed CommercialPublication for one buyer shop. It freezes Publication id, exact commercial projection id/version/content hash, readiness snapshot id, StyleVersion id, brand/shop identity, currency and per-ProductSku wholesale price, RRP and MOQ. BuyerCatalogVersion pins this exact PriceListVersion, and downstream commercial truth must not read a later mutable price value after freeze.

Current gaps are explicit rather than hidden:

- PriceListVersion has no canonical explicit `market` field at this boundary;
- it has no price-list-level `effective_from` / `effective_to` contract;
- the buyer-catalog publication command still exposes a compatibility `priceOverrides` shape keyed by textual `sku` plus `unitPrice`; P0.3 acceptance intentionally passes an empty override set and does not treat textual SKU as canonical pricing identity;
- a later pricing-depth pass must make any canonical override ProductSku-exact, add governed market/effective-period semantics, and retain server-side validation/immutable BuyerCatalog pinning.

Until those gaps are closed, the core snapshot is IMPLEMENTED but the full production pricing contract is PARTIAL.

### 6.5 BuyerCatalogVersion — IMPLEMENTED rich backend / PARTIAL buyer-facing depth

The V2 BuyerCatalogVersion is immutable and `published`. It freezes the exact CommercialPublication, exact PriceListVersion, projection/readiness/StyleVersion lineage, brand/shop identity, open Showroom context, accepted invitation/access grant and currency. Its rich payload preserves Style → Colorway → SizeValue/ProductSku hierarchy and exact ProductSku commercial lines rather than requiring a live PLM reconstruction.

The P0.3 acceptance reads the same BuyerCatalogVersion as the brand actor, the authorized shop actor and through the Showroom access route, then joins the exact catalog/price/publication/projection/readiness chain in the same PostgreSQL environment. Browser Showroom/Linesheet and Color × Size UX remain PARTIAL and must consume this frozen rich truth rather than a flat mutable catalog.

### 6.6 P0.3 READY → BuyerCatalog acceptance — IMPLEMENTED / LIVE EVIDENCE PENDING

`npm run acceptance:product-commercialization` executes one fresh namespace-isolated public-runtime slice:

```text
positive Product Identity + governed MDM + canonical Measurement Chart
→ ProductReadinessSnapshot READY
→ CommercialProductProjectionVersion
→ Campaign / Collection
→ exact Collection × StyleVersion assignment while Collection is DRAFT
→ Collection PUBLISHED
→ Showroom OPEN
→ active brand ↔ shop relationship
→ accepted Showroom invitation
→ projection-backed CommercialPublication
→ PriceListVersion
→ BuyerCatalogVersion
```

Every business mutation is made through authenticated `/v2` routes and carries an idempotency key. The brand owner and shop owner are separate real actors so relationship and invitation acceptance cannot be silently performed under one unrestricted context. PostgreSQL is used only for governed setup/persistence proof, not to substitute a business mutation.

Acceptance requires exact continuity of `StyleVersion`, `ProductSku`, ProductReadinessSnapshot, CommercialProductProjectionVersion id/version/content hash, Collection assignment, CommercialPublication, PriceListVersion and BuyerCatalogVersion; it also verifies currency, wholesale price, RRP and MOQ from the frozen positive fixture. Brand read, shop read and Showroom buyer-catalog access must resolve the same immutable BuyerCatalogVersion.

Before/after counters require this slice to create no Selection, WholesaleOrder, SupplyCommitment, ActualCost or inventory movement. Automated evidence is split across `tests/product-commercialization-live-acceptance.test.mjs`, `tests/postgres/product-commercialization-live-acceptance.test.mjs` and `.github/workflows/product-commercialization-acceptance.yml`.

This closes the missing executable acceptance harness for the current atomic-published P0.3 path, but P0.3 as a production contract remains PARTIAL because `COMM-LC-008` and `PRICE-009` below are still open. The new GitHub workflow has to pass on the exact PR head, and an intended live acceptance environment must still execute the command before the slice can be called `PROD-PROVEN`.

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

### 9.4 Landed cost / allocation / margin / close — IMPLEMENTED

The order-level economics spine is immutable and version-pinned:

```text
ActualCostLedgerEntry
→ LandedCostSnapshot
→ CostAllocationRunSnapshot
→ MarginActualizationSnapshot
→ CostCloseReadinessSnapshot
→ CostCloseSnapshot
→ PostCloseAdjustment
→ adjusted LandedCostSnapshot
→ MarginActualizationSnapshot(allocationStatus=pending-post-close)
→ exact new CostAllocationRunSnapshot
→ PostCloseAllocationReconciliationSnapshot
→ reconciled MarginActualizationSnapshot(allocationStatus=current)
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

PR #115 binds the immutable allocation run into downstream aggregate economics without changing aggregate arithmetic:

- canonical ProductSku margin actualization requires an explicit immutable `costAllocationRunSnapshotId`; the application loads that run and the domain validates exact order, order version, OrderCommitSnapshot, LandedCostSnapshot, currency, active cost-entry set, allocation total and `lineageMode=product-sku-v2`;
- a canonical `MarginActualizationSnapshot` records `allocationStatus=current`, `costAllocationRunSnapshotId`, `costAllocationRunContentHash`, `costAllocationPolicyVersionId`, `costAllocationLineageMode=product-sku-v2` and `aggregateContentHash`; its new `contentHash` commits to the previous aggregate hash plus immutable allocation provenance;
- explicit pre-ProductSku legacy margin uses `allocationStatus=legacy-not-applicable` and null allocation pins. Legacy rows never receive inferred ProductSku identity;
- `CostCloseReadinessSnapshot` and `CostCloseSnapshot` must pin the same allocation id/hash/policy/mode as their canonical margin basis. Missing, pending or mismatched canonical allocation lineage fails closed;
- generic post-close ActualCost remains aggregate-only. Because a new exact allocation may require new approved custom weights, the late-cost path creates aggregate landed/margin facts with `allocationStatus=pending-post-close` rather than fabricating ProductSku economics; the adjustment preserves the allocation id/hash frozen by the original close;
- `pending-post-close` is not close-ready and never reuses the closed allocation as if it described the new landed-cost basis;
- existing immutable snapshot tables persist these provenance fields in their full JSONB payloads; the economics store reads immutable allocation runs by exact id for fail-closed validation;
- outbox margin/readiness/close/post-close events expose allocation status and pin fields so projections can distinguish `current`, `legacy-not-applicable` and `pending-post-close` states.

PR #116 completes the explicit exact post-close reconciliation contract:

- entry point: `POST /v2/orders/{orderId}/cost-close/adjustments/{postCloseAdjustmentId}/allocation-reconcile` with an exact `costAllocationRunSnapshotId` and normal command/idempotency identity;
- the caller must first create a new immutable CostAllocationRunSnapshot for the exact adjusted LandedCostSnapshot. Reconciliation never searches for or auto-selects a “latest” allocation run;
- only canonical `product-sku-v2` commits require this ProductSku reconciliation; legacy economics remains explicit and is not upgraded by guessed ProductSku IDs;
- the requested PostCloseAdjustment must be the latest adjustment for that CostClose and must not already have a reconciliation. An older reconciled adjustment remains immutable history but cannot override a later adjustment in the effective economics position;
- the exact CostClose, latest adjustment, adjusted LandedCostSnapshot, pending MarginActualizationSnapshot and supplied CostAllocationRunSnapshot must agree on order, order version, OrderCommitSnapshot, currency, active cost-entry set, allocation total and landed basis;
- success creates one immutable `PostCloseAllocationReconciliationSnapshot` plus one new `MarginActualizationSnapshot(allocationStatus=current)` in the same economics transaction;
- reconciliation is provenance-only for aggregate economics: `aggregateContentHash`, net revenue, landed cost, contribution margin amount and contribution margin percent must exactly equal the pending margin. A reconciliation that changes aggregate arithmetic fails closed;
- `PostCloseAllocationReconciliationSnapshot` freezes close id, adjustment id, pending margin id, adjusted landed id, exact allocation run id/hash/policy/mode, new current margin id, previous/resulting allocation status, timestamp and content hash;
- a later PostCloseAdjustment makes its own pending margin the effective economics basis until that newer adjustment receives its own exact allocation and reconciliation; earlier reconciliations are not rewritten or deleted;
- `GET /v2/orders/{orderId}/economics-position` exposes `postCloseAllocationReconciliationSnapshotId`, `allocationStatus`, exact allocation id/hash/policy/mode and chooses provenance only from the latest effective close/adjustment/reconciliation chain. A pending latest adjustment returns null current allocation pins rather than falling back to the original close;
- successful reconciliation emits `margin.actualized` for the new current margin and `cost-close.allocation-reconciled` for the immutable reconciliation fact;
- authorization is `COST_MANAGE` for reconciliation and existing `MARGIN_READ` for the economics-position read model.

The composed `/v2` OpenAPI version remains `1.17.0`. `CostAllocationRunInput` exposes exact `customLineWeightsByCostEntryId`; `CostAllocationRow`, `SkuEconomics` and `CostAllocationRunSnapshot` expose exact lineage and `lineageMode`. Margin actualization exposes `costAllocationRunSnapshotId`; PR #116 additionally exposes the post-close reconciliation route/schemas and effective economics-position allocation/reconciliation fields without creating a parallel API version.

Automated evidence includes `tests/cost-allocation-product-sku-lineage.test.mjs`, `tests/econ003-allocation-margin-close-lineage.test.mjs`, `tests/econ003-post-close-allocation-reconciliation.test.mjs`, `tests/econ003-post-close-allocation-reconciliation-migration.test.mjs` and `tests/order-economics-position.test.mjs` plus the default/PostgreSQL verification suites. PR #116 implementation head passed repository Verify run `33345573039` and Syntha V2 CI run `33345572980`, including PostgreSQL verification. The known `ECON-003` code/runtime lineage gap is therefore CLOSED at the implementation-contract level; this documentation-sync head must still pass the same required gates before merge. Live ProductSku-bearing economics acceptance remains separately governed by `ACC-004` and is required for `PROD-PROVEN` status.

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

### 12.3 Cost allocation and margin lineage API — IMPLEMENTED

`POST /v2/orders/:orderId/cost-allocation-runs` accepts an exact `landedCostSnapshotId`, approved `policyVersionId`, optional legacy `customWeightsByCostEntryId`, and optional canonical `customLineWeightsByCostEntryId`.

- `customLineWeightsByCostEntryId[costEntryId]` is an array of `{ orderLineNo, productSkuId, weight, sku? }`; duplicate exact pairs, malformed identifiers, negative/non-finite weights and unknown row fields are rejected at HTTP boundary;
- for canonical ProductSku commits the domain accepts exact custom line weights only; textual-SKU custom maps are legacy-only;
- response `CostAllocationRunSnapshot.lineageMode` is `product-sku-v2` or `legacy`;
- every `CostAllocationRow` and compatibility-named `SkuEconomics` response row includes `orderLineNo`, `productSkuId` and `sku`; exact identifiers are null only for explicit legacy commits.

`POST /v2/orders/:orderId/margin/actualize` accepts required `landedCostSnapshotId` and optional-at-transport `costAllocationRunSnapshotId`. For a canonical ProductSku OrderCommit the latter is domain-required and must identify the immutable allocation run matching the exact landed basis. For explicit legacy OrderCommit lineage the field is omitted and no ProductSku allocation reference is synthesized.

`POST /v2/orders/{orderId}/cost-close/adjustments/{postCloseAdjustmentId}/allocation-reconcile` accepts exactly one business field, required `costAllocationRunSnapshotId`, plus the normal `Idempotency-Key` header. It is the only supported mutation that promotes a canonical post-close `pending-post-close` margin back to `current` detailed ProductSku allocation provenance.

The reconciliation route requires `COST_MANAGE`, the exact latest PostCloseAdjustment and an exact immutable allocation run for that adjustment's adjusted LandedCostSnapshot. It returns `{ reconciliation, marginActualization }`; duplicate reconciliation, non-latest adjustment, mismatched landed/allocation basis or changed aggregate economics fail closed. No route auto-selects an allocation run by timestamp.

`GET /v2/orders/{orderId}/economics-position` exposes the effective `postCloseAllocationReconciliationSnapshotId`, `allocationStatus`, allocation run id/hash/policy/mode and effective landed/margin IDs. If the latest adjustment has no reconciliation, allocation status remains `pending-post-close` and current allocation pins are null; an older reconciliation cannot override a newer adjustment.

Public version remains `/v2` / OpenAPI `1.17.0`; these are invariant corrections and completion of the existing economics contract, not a new parallel API version.

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
- PR #115 allocation→margin→readiness→close provenance required no migration because existing immutable economics tables already persisted complete snapshot payload JSONB while scalar accounting columns remained unchanged. The economics store reads an immutable `cost_allocation_run_snapshots.payload` by id for fail-closed validation; historical snapshots are not rewritten.
- Migration `074_post_close_allocation_reconciliation.sql` creates immutable `post_close_allocation_reconciliation_snapshots`. One row is allowed per `post_close_adjustment_id`; one reconciled margin is pinned per reconciliation. Exact foreign keys and the integrity trigger bind order/commit/close/adjustment/pending margin/adjusted landed/allocation policy/allocation run/new current margin; the trigger also validates pending→current allocation status, scalar↔payload identity, exact orderVersion, timestamps/content hash and unchanged aggregate economics. UPDATE/DELETE is rejected by the common economics immutability trigger.

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

Operational `PROD-PROVEN` live acceptance coverage remains deliberately narrow at the currently evidenced baseline:

```text
Campaign → Collection
```

It uses public authenticated HTTP plus same-environment PostgreSQL verification. It is non-destructive outside its reserved acceptance namespace and compares downstream invariant counters.

PR #117 additionally implements two executable Product Readiness scenarios:

```text
Scenario A:
Product Identity → ProductReadinessSnapshot(blocked: category, measurements)
→ rejected CommercialProductProjectionVersion attempt

Scenario B:
Product Identity + governed APPAREL/size MDM
→ canonical Measurement Chart PUBLISHED
→ ProductReadinessSnapshot(READY, blockers=0)
```

`npm run acceptance:product-readiness` first migrates and idempotently bootstraps the source-controlled operational MDM profile through the canonical MDM bootstrap, then executes both scenarios through supported authenticated `/v2` mutations. Scenario A intentionally omits category/measurement repository truth and passes only with exactly `category` + `measurements` blockers plus exact HTTP `422 / COMMERCIAL_PROJECTION_READINESS_BLOCKED` and zero exact projection rows before/after. Scenario B uses exact governed `APPAREL`, `INT_ALPHA`, `INT_M`, `CM` and `CHEST_CIRC` references, creates and publishes a canonical Measurement Chart, and passes only with a READY snapshot and zero blockers plus exact same-environment PostgreSQL lineage. Both require downstream commercial/warehouse/economic isolation. Repository tests validate both harnesses and failure semantics; until this command completes against the intended live acceptance environment, both #117 acceptance slices remain `IMPLEMENTED` rather than `PROD-PROVEN`.

The current P0.3 branch additionally implements `npm run acceptance:product-commercialization`. It creates a fresh positive READY graph, continues it through exact Collection assortment/Showroom/buyer access, CommercialProductProjectionVersion, projection-backed CommercialPublication, PriceListVersion and BuyerCatalogVersion, and checks the immutable chain with both brand and shop actors against the same PostgreSQL target. A dedicated workflow now exists to run that command against the supported runtime process and PostgreSQL 17. The workflow definition, unit tests and PostgreSQL integration test are evidence of IMPLEMENTED coverage only until the exact workflow head succeeds; even a green CI execution does not by itself assert intended-environment `PROD-PROVEN` unless that environment is explicitly the accepted production-evidence target.

### 15.4 Required acceptance expansion order

Expand one business slice at a time, preserving explicit before/after invariants:

1. Campaign → Collection — IMPLEMENTED / PROD-PROVEN.
2. Product Identity → Readiness — negative fail-closed **and** positive canonical READY harnesses IMPLEMENTED in #117; exact MDM/category/size/Measurement Chart PostgreSQL assertions are executable; actual intended live-environment execution is PENDING, so no `PROD-PROVEN` claim.
3. Readiness → Projection → Publication → PriceList → BuyerCatalog — public-runtime harness IMPLEMENTED on `feat/acc004-ready-to-buyer-catalog-live`; exact-head workflow/live evidence is pending and the semantic production contract remains PARTIAL until `COMM-LC-008` and `PRICE-009` are closed.
4. BuyerCatalog → Selection → OrderCommit — PLANNED.
5. OrderCommit → Supply → Shipment — PLANNED.
6. Shipment → SKU-specific ActualCost → exact ProductSku allocation → MarginActualization → Cost Close → post-close adjustment/reconciliation — PLANNED live proof. Exact ActualCost is implemented in #112, exact allocation in #114, pre-close allocation→margin/close provenance in #115, and explicit exact post-close reconciliation in #116. PR #116 implementation head passed required repository Verify and Syntha V2 CI including PostgreSQL verification. Live public-API business proof remains under `ACC-004`.
7. Full connected Product → Margin golden path — final P0 proof.

A direct service/domain test is not a substitute for a live public API acceptance gate. Aggregate legacy PostgreSQL flows may verify compatibility but do not count as proof of the ProductSku-specific acceptance slice. Likewise, a unit-tested acceptance harness is not `PROD-PROVEN` until the harness itself completes against the intended runtime/PostgreSQL acceptance environment.

---

## 16. Capability and completeness register

This is the current high-level master status. Supporting detail is kept in this file’s domain sections and `docs/architecture/syntha-v2-live-capability-register.md`; when status changes, this table must change in the same PR.

| Capability | Status | Main unresolved gate |
|---|---|---|
| Runtime clean-clone/start/readiness/shutdown | PROD-PROVEN | deployment-specific acceptance remains environment responsibility |
| Authentication + organisation foundation | IMPLEMENTED | continue role/capability coverage audits |
| Operational RU fashion MDM reference profile | IMPLEMENTED/PARTIAL taxonomy depth | governed `assortment.category / APPAREL` bootstrap and modular core validation implemented; expand category/product-type taxonomy only as canonical flows require it |
| Product Identity V2 | IMPLEMENTED | exact governed category references supported; UI/legacy catalog convergence plus intended live readiness evidence remain |
| PLM Planning/Styles | PARTIAL | converge all semantics on Product Identity |
| Materials/BOM/Measurements/Samples | IMPLEMENTED/PARTIAL | canonical Measurement Chart runtime/OpenAPI plus positive READY harness are synchronized on exact Product Identity + governed MDM; actual live execution and ODS/remaining workspace convergence remain |
| Sourcing/Tech Pack | IMPLEMENTED/PARTIAL | supplier/sourcing depth + ODS debt for Sourcing |
| Production/Final Quality | IMPLEMENTED | continue physical lineage/readiness E2E proof |
| ProductReadinessSnapshot | IMPLEMENTED | #117 contains separate fail-closed and positive READY public-runtime harnesses; intended live-runtime evidence remains |
| CommercialProjection | IMPLEMENTED | positive READY→projection harness added; exact-head acceptance workflow/intended live evidence remain |
| CommercialPublication | IMPLEMENTED/PARTIAL | projection-native immutable atomic published snapshot exists; staged DRAFT→READY→PUBLISHED→SUPERSEDED/ARCHIVED lifecycle is GAP; eliminate flat-catalog origin debt |
| PriceListVersion | IMPLEMENTED/PARTIAL | exact immutable ProductSku snapshot exists; add market/effective dates and retire textual-SKU override compatibility for canonical pricing |
| BuyerCatalog/Linesheet | IMPLEMENTED/PARTIAL | rich ProductSku backend and P0.3 harness exist; complete variant-rich Showroom/Linesheet buyer UX |
| Color × Size matrix | PARTIAL | exact immutable buyer matrix completion |
| WholesaleOrder/OrderCommit | IMPLEMENTED | expand live acceptance |
| SupplyCommitment | IMPLEMENTED | expand physical acceptance |
| Shipment/Receipt/Supplier Recovery | PARTIAL | exact ProductSku recovery contract implemented; live exact-lineage recovery acceptance remains |
| Inventory | IMPLEMENTED core | continuous reconciliation/golden-path proof |
| Generic aggregate ActualCost | IMPLEMENTED | live economics acceptance; new generic/post-close writes remain aggregate-only |
| SKU-specific ActualCost | IMPLEMENTED | live Shipment → ActualCost → Margin acceptance |
| Cost Allocation | IMPLEMENTED | exact pre/post-close ProductSku allocation contracts and automated PostgreSQL verification complete; live acceptance remains `ACC-004` |
| Landed cost / Margin / Close | IMPLEMENTED | pre-close allocation pin merged in #115; exact post-close reconciliation implemented and verified in #116; live Product → Margin proof remains `ACC-004` |
| KPI governance/methodology | PARTIAL production connection | complete exact runtime/persistence/reconciliation |
| ODS v1 | IMPLEMENTED with compatibility debt | burn legacy layers down; never add new dialect |
| Full Product → Margin live acceptance | PARTIAL | #117 implements both readiness scenarios and P0.3 commercialization harness is now implemented; collect intended live evidence, close P0.3 semantic gaps, then continue slices 4–7 |

---

## 17. Known architecture gaps and debt register

| ID | Priority | Gap | Required outcome | Status |
|---|---|---|---|---|
| `AC-LINEAGE-001` | P0 | Generic ActualCost accepted textual SKU without exact physical lineage | aggregate-only generic path; exact ProductSku physical path; DB fail-closed guard; preserve legacy corrections | CLOSED in #112 |
| `AC-HTTP-002` | P0 | Physical ActualCost resolver supported exact IDs but HTTP/OpenAPI did not expose them | request + response include `orderLineNo` and `productSkuId`; generic SKU scope removed | CLOSED in #112 |
| `ECON-003` | P0 | ActualCost → landed/allocation/margin/close/post-close path could lose or leave unproven ProductSku lineage | exact allocation line identity plus reproducible aggregate margin/close and explicit exact post-close reconciliation from frozen lineage | CLOSED by #116 at code/runtime lineage level — #114 fixed exact allocation, #115 bound pre-close allocation→margin/readiness/close provenance, #116 adds latest-adjustment exact post-close reconciliation plus effective-position provenance; implementation-head Verify `33345573039` and Syntha V2 CI `33345572980` succeeded; live Product → Margin proof remains separately OPEN as `ACC-004` |
| `ACC-004` | P0 | Live acceptance does not yet prove the connected Product → Margin spine | progressively prove canonical Product → Margin spine through public runtime/PostgreSQL slices | OPEN/PARTIAL — #117 implements both Product Identity → blocked Readiness + exact rejected projection and Product Identity → governed category/size + PUBLISHED canonical Measurement Chart → READY. Current P0.3 branch adds READY→Projection→projection-native Publication→PriceList→BuyerCatalog public-runtime/PostgreSQL acceptance with separate brand/shop actors; exact workflow/intended-live evidence plus downstream slices remain open |
| `PUB-005` | P0 | Some historical publication/catalog behavior remains flat-catalog oriented | projection-only variant-rich publication/buyer catalog; no new flat-catalog product/publication truth | OPEN/PARTIAL — current P0.3 harness proves only projection-native V2 writes and never calls `/v2/catalog/skus`; historical/compatibility writers, readers and textual pricing override seams still require full audit/convergence |
| `COMM-LC-008` | P0 | `ARCHITECTURE.md` previously described a staged CommercialPublication lifecycle that the canonical V2 runtime does not actually implement | add one canonical fail-closed `DRAFT → READY → PUBLISHED → SUPERSEDED/ARCHIVED` lifecycle with API/DB/idempotency/tests, or formally revise the single lifecycle contract; no parallel publication truth | OPEN/GAP — runtime currently creates immutable V2 CommercialPublication directly as `published` |
| `PRICE-009` | P0 | PriceListVersion lacks explicit market/effective-period contract and buyer-catalog price overrides still identify override target by textual `sku` | canonical ProductSku-exact pricing override/lines, market, effective_from/effective_to, server validation and immutable BuyerCatalog pin; textual SKU compatibility must not be pricing identity | OPEN/PARTIAL |
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
| StyleVersion | exact ProductStyle + predecessor/version/content identity + governed refs; category is exact current/effective/active/approved `assortment.category` entry version at write time and is frozen thereafter |
| Colorway | exact StyleVersion + brand + colour identity/ref |
| ProductSku | exact StyleVersion + Colorway + SizeValue |
| CanonicalMeasurementChart | exact same-brand StyleVersion + Colorway + SizeScaleVersion; exact ordered SizeValues; exact current/effective/active governed `measurement.unit` and `measurement.point` versions pinned into chart evidence; runtime point names/descriptions come only from that version snapshot `translations` structure, never source JSON aliases; DRAFT/PUBLISHED revision history is immutable across publication replacement |
| ProductReadinessSnapshot | exact StyleVersion + exact source/evidence versions + readiness result |
| CommercialProductProjectionVersion | exact READY ProductReadinessSnapshot + immutable projection version/content hash; current executable state is immutable `published` |
| CommercialPublication | exact CommercialProductProjectionVersion id/version/hash + ProductReadinessSnapshot + StyleVersion + exact Collection assignment + frozen ProductSku hierarchy/terms; current V2 executable record is immutable `published`, while staged lifecycle remains `COMM-LC-008` GAP |
| PriceListVersion | exact CommercialPublication + projection/readiness/StyleVersion + brand/shop + currency + exact ProductSku wholesale/RRP/MOQ snapshot; current gap: no canonical market/effective_from/effective_to and compatibility textual-SKU override input remains |
| BuyerCatalogVersion | exact CommercialPublication + exact PriceListVersion + projection/readiness/StyleVersion + brand/shop + open Showroom + accepted access grant + frozen variant/ProductSku/price hierarchy |
| Selection | exact buyer/catalog version and selected SKU/price context |
| OrderCommitSnapshot | exact agreed order lines/terms/currency/commercial facts |
| SupplyCommitment | exact order commit and physical line allocations |
| ShipmentLine | exact committed order line + ProductSku for canonical lineage |
| ReceiptClaim issue line | exact shipment line facts; when canonical ProductSku lineage exists, preserves `orderLineNo + productSkuId + sku(display)` for downstream recovery |
| ActualCostLedgerEntry | order/commit/supply; exact shipment/orderLine/ProductSku when SKU-specific physical v2; textual SKU is display/legacy compatibility only |
| CostAllocationRunSnapshot | exact order commit + landed snapshot + policy + active cost entry IDs; `lineageMode`; canonical allocation/economics rows preserve `orderLineNo + productSkuId + sku(display)`, legacy rows keep exact IDs null |
| MarginActualizationSnapshot | exact committed revenue + exact LandedCostSnapshot; canonical ProductSku lineage additionally freezes allocation status + exact CostAllocationRunSnapshot id/hash/policy/mode; legacy uses explicit `legacy-not-applicable`; canonical late-cost post-close uses `pending-post-close` until exact reconciliation, after which a new immutable margin on the same aggregate basis becomes `current` |
| CostCloseReadinessSnapshot | exact landed + margin basis and, for canonical ProductSku economics, the same immutable allocation run id/hash/policy/mode |
| CostCloseSnapshot | exact readiness + landed + margin basis and the same canonical allocation pin frozen at close |
| PostCloseAdjustment | immutable close baseline + new ActualCost/Landed/Margin chain; preserves closed allocation provenance and records resulting allocation status without inventing ProductSku allocation |
| PostCloseAllocationReconciliationSnapshot | immutable exact link from latest PostCloseAdjustment/pending margin/adjusted landed basis to an explicit new CostAllocationRunSnapshot and new current MarginActualizationSnapshot; freezes allocation id/hash/policy/mode, pending/current status transition, timestamp and content hash; one per adjustment |
| OrderEconomicsPosition | effective read model over one immutable OrderCommit: exposes close/latest-adjustment/latest-reconciliation IDs, effective landed/margin IDs and current/pending/legacy allocation provenance; an older reconciliation never overrides a newer adjustment |

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
| 2026-08-31 | #115 / `283c058eba5a83f39718e43aca3c9cc31205a120` | Bind immutable CostAllocationRunSnapshot into canonical MarginActualization → CostCloseReadiness → CostClose; preserve explicit legacy semantics; mark canonical post-close late-cost margin `pending-post-close`; expose allocation provenance in events/OpenAPI/store lookup | 1.2, 3.3, 9.4, 12.3, 13, 15, 16, 17, 19, 20 | MERGED; Verify run `33344377731` success; Syntha V2 CI run `33344377707` success; `ECON-003` remained OPEN/PARTIAL pending exact post-close reconciliation at that merge |
| 2026-08-31 | #116 / `fix/econ003-post-close-reallocation` | Add immutable latest-adjustment post-close allocation reconciliation; bind exact new CostAllocationRunSnapshot to a new current margin without changing aggregate economics or rewriting CostClose/adjustment; persist via migration 074; expose effective reconciliation/allocation provenance in economics-position and OpenAPI | 1.2, 3.3, 3.7, 9.4, 12.3, 13, 15, 16, 17, 19, 20, 21 | implementation-head Verify run `33345573039` success; Syntha V2 CI run `33345572980` success including PostgreSQL verification; `ECON-003` code/runtime lineage gap CLOSED; live Product → Margin proof remains OPEN under `ACC-004` |
| 2026-09-01 | #117 / `feat/acc004-product-readiness-live` (implementation head before authoritative sync: `d5477aa417ee11fc5e6a241e1a2fb848775fdc0d`) | Add guarded Product Identity → ProductReadiness live acceptance harness and exact blocked Readiness→Projection negative gate; add governed source-controlled `assortment.category` bootstrap with `APPAREL`; register `syntha_operational_master` impact; correct MDM validation so mandatory RU size systems/units are enforced globally across modular `mdm/reference` datasets while local semantic references remain same-dataset; explicitly preserve the negative fixture’s category+measurements blockers and document the positive exact-category + Measurement Chart prerequisite | 5.1, 5.3, 6.1, 6.2, 15, 16, 17, 19, 20, 22 | IMPLEMENTED harness + MDM bootstrap/validator contract; authoritative documentation synchronization completed in this branch; actual live acceptance environment evidence is still required before any `PROD-PROVEN` claim; positive downstream commercialization and remaining `ACC-004` slices stay OPEN |
| 2026-09-03 | #117 / `9a8490a` + `c6f1662` | Resolve canonical Measurement runtime↔OpenAPI divergence: document exact Product Identity/MDM request-response contract and supported POST/GET/PATCH/publish routes, preserve legacy SKU routes only as readiness compatibility, and add anti-drift regression coverage | 5.2, 6.1, 15, 16, 17, 19, 20 | IMPLEMENTED contract; composed OpenAPI remains 1.17.0; no `PROD-PROVEN` claim |
| 2026-09-03 | #117 / `8745eab` + `07350a6` + `4c420dc` + `26cce39` | Add separate canonical positive Product Readiness scenario without weakening the negative fixture: bootstrap source-controlled operational MDM through canonical infrastructure, create exact APPAREL/INT_ALPHA/INT_M Product Identity, create+publish CM/CHEST_CIRC canonical Measurement Chart, require READY with zero blockers, prove exact same-environment PostgreSQL lineage, preserve downstream isolation and bound idempotency keys | 5.2, 5.3, 6.1, 6.2, 15, 16, 17, 20 | IMPLEMENTED harness and automated contract; actual intended live acceptance execution still required before `PROD-PROVEN` |
| 2026-09-04 | #117 / `a960486c653666c7cd7da5dcb4f9d21c4a674d8e` | Final squash merge of governed assortment-category MDM, modular validation correction, canonical Measurement/OpenAPI synchronization and dual Product Readiness acceptance scenarios | 5.1–5.3, 6.1–6.2, 15–17, 19–20 | MERGED; exact pre-merge head `d92fd1e96ffd4b0a139cef82f23ce061af2d6c46`: Verify `33781485567` success, MDM Reference Data `33781485572` success, Syntha V2 CI `33781485600` success; no intended-live `PROD-PROVEN` claim |
| 2026-09-05 | #118 / `feat/acc004-ready-to-buyer-catalog-live` | Add P0.3 public-runtime READY→Projection→projection-native CommercialPublication→PriceListVersion→BuyerCatalogVersion acceptance with exact Collection assignment, Showroom, relationship/invitation, separate brand/shop actors and same-environment PostgreSQL proof; dedicated supported-runtime workflow; correct stale publication lifecycle claim and surface pricing gaps; exact-head execution exposed and this branch fixes two real integration defects: canonical Measurement now consumes only normalized versioned runtime MDM `translations` instead of source JSON aliases, and stable acceptance reference commands use a deterministic timestamp so replay cannot produce `COMMAND_ID_CONFLICT`. Regression guards: `measurement-runtime-mdm-snapshot.test.mjs` and `production-reference-bootstrap-replay.test.mjs`. | 2.6, 5.2, 6.1–6.6, 15–17, 19–20, 22 | IMPLEMENTED harness/runtime fixes/tests; final exact-head Verify + MDM Reference Data + Syntha V2 CI + Product Commercialization Acceptance must all pass before merge; no `PROD-PROVEN` claim; `COMM-LC-008`, `PRICE-009`, `PUB-005` remain open |

Future implementation PRs add a row here. The row is not a substitute for updating the affected detailed sections.

---

## 21. Supporting specifications and their authority

These files remain useful deep dives and evidence. They must be reconciled into this master specification when behavior changes:

- `docs/architecture/product-identity-v2.md`
- `docs/architecture/product-readiness-commercial-projection-v2.md`
- `docs/architecture/order-supply-cost-margin-baseline.md`
- `docs/architecture/order-margin-bridge.md`
- `docs/architecture/econ003-allocation-margin-close-lineage.md` — exact pre-close allocation provenance plus post-close pending/reconciliation semantics.
- `docs/architecture/syntha-v2-live-capability-register.md`
- `docs/commercial-execution-spine.md`
- `docs/commercial-publication-linesheets.md`
- `docs/omnidata-design-system-v1.md`
- `docs/fashion-kpi/`
- `docs/observability.md`
- `docs/joor-retailer-cabinet-complete-map.md` — research/reference map, not proof that a Syntha capability is implemented.

A supporting document can be more verbose, but it cannot redefine a canonical entity, lifecycle or visual token without the same change being made here. Supporting documents that contain stale “remaining gate” language must be corrected during the relevant audit pass; stale support text is never allowed to override the current status in this master specification.

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
- [ ] acceptance evidence is classified accurately: a defined or mocked harness is not live proof, a green CI runtime gate is not automatically the intended production-evidence environment, and `PROD-PROVEN` requires the accepted intended environment;
- [ ] `ARCHITECTURE.md` records fields/actions/relations/UI/API/status/gaps affected by the change;
- [ ] change register row is added/updated;
- [ ] `npm run verify` passes;
- [ ] `npm run verify:postgres` passes for release-candidate changes;
- [ ] PR is mergeable and required GitHub CI is green.

This checklist is deliberately stricter than “code compiles”. Syntha V2 is treated as one operating platform, so a locally correct screen or service is not complete if its upstream/downstream contract is broken or undocumented.
