# Synth V2 — post-PR #256 reconciliation and Virtual Showroom Rail proposal

**Date:** 2026-10-09  
**Exact accepted base:** `main@83c7f59f1fb660e64f4b3d57008c5de28931fddd`  
**Source documents checked before this record:**

- `docs/backlog-not-yet-integrated.md`;
- `docs/SYNTH_V2_INTEGRATION_MASTER_PLAN_2026-10-01.md`;
- `ARCHITECTURE.md`;
- current Showroom, Showroom Looks, Buyer Catalog, Selection and Product Engineering code on the exact accepted base.

This is a dated reconciliation record. It does not replace the living backlog, master plan or `ARCHITECTURE.md`; it preserves the exact finding and sequencing decision until the corresponding living sections are updated in the next governed implementation PR.

---

## 1. PR #256 admission result

PR #256, **Deterministic Change-Impact Recompute Orchestration — Tranche A**, is merged.

Post-merge qualification on the exact merge SHA is **3/3 GREEN**:

- Product Commercialization Acceptance **#577** — success;
- Verify **#1735** — success;
- Syntha V2 CI **#2193** — success, including PostgreSQL verification.

### Implemented by Tranche A

`verified correction receipt`
→ exact `StaleDependencySet`
→ version/hash-bound dependency edges
→ deterministic dependency-set SHA-256
→ immutable `RecomputePlan`
→ canonical DAG levels with fan-out/fan-in ordering
→ execution mode `automatic | human_review | external_evidence`
→ immutable per-step `RecomputeExecutionReceipt`
→ independent verification required for successful automatic recompute
→ fail-closed admission evaluation
→ immutable sealed `RecomputeOrchestrationReceipt`.

### Still not implemented

- PostgreSQL persistence for dependency sets, plans and receipts;
- durable orchestration jobs with lease/retry/reclaim/dead-letter semantics;
- crash-safe resume;
- allowlisted owning-authority dispatch adapters;
- Awaiting Action projection for `human_review`;
- external-evidence waiting/reconciliation;
- admission replay wiring into the original blocked commercial/production action;
- HTTP/OpenAPI/UI surfaces;
- live PostgreSQL Product Engineering recompute Golden Path.

No previously open commercial debt is closed merely by Tranche A. In particular, `ACC-004`, `PUB-005`, `PRICE-009` and `COMM-LC-008` remain open at their documented scopes.

---

## 2. Next strict engineering slice — Tranche B

### Deterministic Recompute Persistence and Durable Execution

The next allowed Product Engineering slice is:

`StaleDependencySet`
→ PostgreSQL immutable persistence
→ `RecomputePlan` + exact DAG persistence
→ one durable job per executable plan step
→ lease / retry / reclaim / terminal failure
→ idempotent allowlisted dispatch boundary
→ owning-authority result
→ independent result verification
→ immutable execution receipt
→ crash-safe restart and resume
→ plan admission replay.

### Non-negotiable ownership boundary

Product Engineering may:

- detect and prove impact;
- construct an exact plan;
- request an allowlisted operation from the owning bounded context;
- observe and independently verify its result;
- record immutable evidence;
- re-evaluate admission.

Product Engineering may not:

- receive a generic downstream repository/store;
- update Cost, Commercial Publication, Product Readiness, Tech Pack, Production or another authority directly;
- manufacture a successful receipt from a command response without independent authority read-back;
- mark a human-review or external-evidence step complete without explicit evidence.

---

## 3. Confirmed product gap — Virtual Showroom Rail Composer

**Backlog ID:** `SHOWROOM-RAIL-001`  
**Priority:** P1 product/competitive differentiation; does not pre-empt the current P0 orchestration and canonical commerce sequence.  
**Status:** PLANNED / NOT INTEGRATED.

### Current implemented Showroom capability

The current platform already provides:

- Showroom attached to one Collection;
- opening/closing window and governed buyer access;
- buyer-specific immutable Buyer Catalog;
- editorial `ShowroomLook` composition;
- image, RU/EN title and story;
- one to twenty-four products per look;
- buyer-facing price, MOQ and availability facts;
- transition into Selection and Color × Size order matrix.

This is a valid editorial digital showroom, but it is not yet a spatial rail-based showroom.

### Missing capability

The following are not current canonical entities or workflows:

- room/scene version;
- zones inside the showroom;
- physical or virtual rails/racks;
- ordered rail slots/hangers;
- ProductSku or Look placement on a rail;
- drag-and-drop movement between rails;
- immutable publication of one exact layout version;
- buyer navigation through a 2D rail scene;
- hotspot → Product detail → Color × Size → Selection transition;
- rail/product impression, engagement and conversion analytics;
- 3D room, camera path, AR or digital-twin export.

### Proposed canonical hierarchy

```text
Showroom
→ ShowroomSceneVersion
→ ShowroomZone
→ ShowroomRail
→ ShowroomRailSlot
→ placement(ProductSku | ShowroomLook)
→ immutable PublishedSceneVersion
→ Buyer exploration
→ existing BuyerCatalogVersion
→ existing Color × Size Selection
→ existing Wholesale Order
```

### Authority rules

- `ShowroomSceneVersion` owns presentation layout only.
- Product identity remains `ProductStyle / StyleVersion / Colorway / ProductSku`.
- Buyer price, MOQ, delivery and availability remain frozen by `BuyerCatalogVersion`.
- Stock remains owned by Inventory; no quantity is copied into the scene as a second balance.
- A placement stores exact IDs and optional presentation metadata; it does not create another product card master.
- A published scene is immutable. Editing creates a new scene version.
- Buyer order actions resolve through the existing Buyer Catalog and Selection matrix, never from scene-authored price or stock.
- Historical visits and orders retain the exact published scene version that was shown.

### Phased delivery

#### Phase 1 — 2D Rail Composer

- zones and rails;
- rail dimensions and capacity;
- ordered slots;
- ProductSku/Look placement;
- drag-and-drop composer;
- desktop/tablet buyer viewer;
- immutable scene publication;
- Product detail and existing matrix handoff;
- responsive non-spatial fallback for phone/accessibility.

#### Phase 2 — Commercial intelligence

- impression and dwell events by scene/rail/slot/product;
- save, compare and shortlist;
- assisted buyer presentation mode;
- annotations and private buyer notes;
- rail-to-selection and rail-to-order conversion;
- scene performance by buyer, market and appointment;
- A/B scene-version comparison without rewriting history.

#### Phase 3 — 3D / spatial extension

- 3D room and rail geometry;
- camera path and guided walkthrough;
- digital garment assets where available;
- WebGL/WebXR/AR adapter;
- asset qualification and performance budgets;
- optional digital-twin export/import.

Phase 3 must reuse the Phase 1 canonical scene/version/placement model. It must not introduce a second 3D-only commercial truth.

### Admission criteria before implementation

1. Current Showroom/Looks/BuyerCatalog code and backlog are re-read immediately before the branch starts.
2. The scene model is documented in `ARCHITECTURE.md` in the same PR as code.
3. The first implementation is 2D and ProductSku-exact; 3D is not used to avoid designing the canonical model.
4. A published scene cannot expose a SKU absent from the exact buyer catalog available to that buyer.
5. Scene publication and buyer reads are organisation-isolated and access-grant governed.
6. Selection/order lineage proves the exact scene version and buyer-catalog version without making the scene authoritative for price or stock.
7. Browser proof covers brand composer and buyer viewer at monitor/tablet/phone widths.

---

## 4. Sequencing decision

The approved order remains:

1. **Tranche B — PostgreSQL persistence + durable recompute orchestration jobs**;
2. owning-authority adapters, human-review routing and external-evidence reconciliation;
3. admission replay and Product Engineering PostgreSQL Golden Path;
4. re-evaluate the P0 commercial debts and `ACC-004` live proof;
5. begin `SHOWROOM-RAIL-001` as a separate bounded capability, starting with 2D Rail Composer.

The rail showroom is recorded now so it is not lost or incorrectly described as already implemented. It does not interrupt the current evidence-driven Product Engineering sequence.
