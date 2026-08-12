# SYNTH-V2 Live Capability Register

Status date: 2026-08-12  
Baseline main reviewed for this consolidation wave: `53bae4e062af200e4d6593909f743d868506df8d`  
Current implementation slice: `codex/product-readiness-projection-20260812` on top of merged MDM Core + Product Identity V2/runtime.

This register is the operational architecture checkpoint for the current SYNTH-V2 codebase. It prevents specifications, stale pull requests and executable capabilities from being treated as the same thing.

## Status language

- `YES` — capability exists in the named layer on the current consolidation baseline/branch.
- `PARTIAL` — useful implementation exists, but the canonical end-to-end contract is not complete.
- `NO` — no canonical implementation is confirmed in that layer.
- `DECLARED` — governed semantic/spec object exists, but is not yet production-connected.
- `BLOCKED` — implementation exists on a stale/stacked/conflicting branch and must be rescued before it can become canonical.

`PROD` means end-to-end production readiness, not merely that code or a migration exists.

## Capability matrix

| Capability | SPEC | DB | DOMAIN | SERVICE | API | UI | E2E | ODS | PROD | Current truth / next gate |
|---|---|---|---|---|---|---|---|---|---|---|
| Governed MDM reference core | YES | YES | YES | PARTIAL | PARTIAL | NO | PARTIAL | N/A | NO | Versioned MDM persistence, exact immutable usage snapshots and Product Identity resolver are canonical. Next: admin/import API, governed seed sets and dictionary/attribute management UI. |
| Category / assortment hierarchy | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NO | StyleVersion pins exact compatible category/product-type MDM versions. Production hierarchy seeds/admin workflow remain incomplete. |
| Size systems / scales / values | YES | YES | YES | YES | YES | NO | PARTIAL | NO | NO | Stable SizeScale + immutable SizeScaleVersion + ordered SizeValue are executable with exact MDM resolution. Buyer publication snapshot is next. |
| Colour master / swatches | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | NO | NO | Colorway pins exact StyleVersion and optional current compatible colour MDM version; buyer-facing projection now freezes it but catalog UI is not migrated yet. |
| Product attributes / attribute sets | YES | YES | YES | YES | YES | NO | PARTIAL | NO | NO | ProductAttributeValue is executable and can pin exact MDM. Governed attribute-definition applicability/type/cardinality validation is still pending; readiness currently uses an explicit coverage attestation. |
| Product Identity V2: Style | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | PARTIAL | NO | Stable ProductStyle lifecycle, RBAC, idempotent mutation/read API and PostgreSQL runtime are merged. |
| Product Identity V2: StyleVersion | YES | YES | YES | YES | YES | NO | PARTIAL | NO | NO | Immutable exact technical StyleVersion with contiguous predecessor chain, bilingual titles, MDM refs and content hash is executable. |
| Product Identity V2: Colorway | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | NO | NO | Immutable Colorway belongs to one exact StyleVersion/brand and can pin exact colour MDM version. |
| Product Identity V2: SizeScale / SizeValue | YES | YES | YES | YES | YES | NO | PARTIAL | NO | NO | Ordered immutable size structure is executable and ready to feed BuyerCatalog/Order Grid. |
| Product Identity V2: SKU | YES | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | NO | Canonical immutable ProductSku = exact StyleVersion + Colorway + same-brand SizeValue. Existing `catalog_skus` is isolated behind an explicit one-to-one compatibility bridge. |
| Product media / gallery / swatches | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | NO | NO | Immutable StyleVersion/Colorway-scoped media with explicit ordering is executable and can be selected into readiness/commercial projection. Buyer gallery remains next. |
| ProductReadinessSnapshot | YES | YES | YES | YES | YES | NO | PARTIAL | NO | NO | Current slice freezes exactly 18 route-aware readiness dimensions, exact Product Identity/legacy PLM source versions, commercial preparation and external evidence contracts. Blocked snapshots remain immutable history. |
| CommercialProductProjectionVersion | YES | YES | YES | YES | YES | NO | PARTIAL | NO | NO | Current slice creates immutable contiguous projections only from ready snapshots and requires exact frozen readiness payload. Next: make CommercialPublication consume this projection exclusively. |
| CommercialPublication | YES | YES | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | Immutable publication spine exists, but current production path still originates from the historical flat catalog. Next: projection-only variant-rich publication. |
| PriceListVersion | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Immutable price version exists; richer price type/RRP/effective semantics must be connected to projection-backed publication. |
| BuyerCatalogVersion | YES | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | NO | Immutable buyer catalog exists, but payload/read model remains too SKU-flat. Next: preserve projection-backed Style/Colorway/ordered Size/SKU hierarchy. |
| Buyer Linesheet | YES | PARTIAL | PARTIAL | YES | YES | YES | PARTIAL | PARTIAL | NO | Current linesheet is a publication projection; next gate is Product Identity-backed Style cards -> Style detail -> colorways/sizes/media. |
| Buyer Style Detail | YES | PARTIAL | PARTIAL | NO | NO | NO | NO | NO | NO | Product Identity + immutable Commercial Projection prerequisites now exist. Variant-rich publication/read model is the remaining dependency. |
| Draft Buyer Cart | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NO | Selection/order flow exists, but draft context must freeze buyer catalog, door, price type and delivery terms. |
| Color x Size Order Grid | YES | PARTIAL | PARTIAL | NO | NO | NO | NO | NO | NO | Canonical ordered SizeValue and SKU matrix prerequisites exist. BuyerCatalog variant projection and matrix write model remain missing. |
| Retailer / Door master | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NO | PARTIAL | NO | Organisation/relationship foundation exists; door/location/commercial master depth is insufficient for immutable order snapshots. |
| Wholesale Order | YES | YES | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | Strong bilateral order lifecycle exists; next gate is variant matrix + door/address/terms snapshots from canonical masters. |
| OrderCommitSnapshot | YES | YES | YES | YES | YES | PARTIAL | YES | N/A | PARTIAL | Immutable commercial deal snapshot is part of the canonical economics spine. |
| Supply / production execution | YES | YES | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | Strong execution backbone; derived performance remains separated from product master truth. |
| Shipment / receipt / physical recovery | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NO | Receipt discrepancies/recoveries exist; older outbound-shipment work still needs selective comparison/rescue. |
| Actual cost / landed cost / margin / close | YES | YES | YES | YES | YES | PARTIAL | YES | N/A | PARTIAL | One of the strongest areas. Immutable lineage/corrections/allocation/close architecture is established. |
| Supplier recovery / performance | YES | YES | YES | YES | YES | PARTIAL | YES | N/A | PARTIAL | Derived from immutable production, quality, discrepancy, recovery and actual-cost evidence. |
| KPI methodology / source contracts | YES | N/A | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | N/A | PARTIAL | Governed methodology exists; not every catalog KPI is executable/production-ready. |
| Persistent KPI Registry | YES | BLOCKED | BLOCKED | BLOCKED | NO | NO | NO | N/A | NO | PR #72 must be rebased/renumbered; old `044_kpi_registry.sql` collides with current main migration 044. |
| Exact KPI runtime | YES | BLOCKED | BLOCKED | BLOCKED | NO | NO | NO | N/A | NO | PR #76 is stacked on #72. Rebase only after canonical Registry lands. |
| ODS shared role/component system | YES | YES | YES | N/A | N/A | YES | PARTIAL | YES | PARTIAL | ODS-native workspaces exist, but legacy CSS/JS compatibility stack remains. No new `omnidata-vN` layers. |
| Sourcing ODS migration | YES | N/A | YES | YES | YES | YES | PARTIAL | PARTIAL | NO | Next ODS debt-burn-down workspace. |
| Measurements ODS migration | YES | N/A | YES | YES | YES | YES | PARTIAL | PARTIAL | NO | Migrate after Sourcing; remove local stylesheet/static serving only after semantic/screenshot/i18n/responsive validation. |
| BOM ODS migration | YES | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | NO | Same migration rule; do not create another visual version layer. |
| Materials ODS migration | YES | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | NO | Same migration rule. |
| Styles / Collection Planning ODS migration | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | YES | PARTIAL | PARTIAL | NO | Must align UI/ODS work with canonical Product Identity/readiness instead of styling a second product model. |
| Shared shell/navigation ODS convergence | YES | N/A | YES | N/A | N/A | YES | PARTIAL | PARTIAL | NO | Final ODS convergence step after PLM workspaces. |
| Buyer discovery / connection management | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NO | NO | PARTIAL | NO | P1 after P0 publication-to-order journey. |
| Retailer profile / settings / messages | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NO | PARTIAL | NO | Notifications are not a buyer Inbox; messaging requires its own bounded context. |
| Visual Assortment / Looks / Styleboards | YES | NO | NO | NO | NO | NO | NO | NO | NO | Premium P2 after Product Identity, catalog and order matrix are stable. |
| 1C / EDO / marking / customs perimeter | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NO | PARTIAL | NO | Russian production perimeter is specified but not yet a complete executable chain. Compliance is currently admitted to readiness only as immutable external evidence. |

## Canonical spine to protect

`Line Plan -> CollectionItem -> StyleVersion -> BOM / Measurements / Tech Pack -> Material & Factory RFQ -> Samples -> Supplier Award -> Material PO / Production PO / Finished Goods PO -> Production Execution -> QC -> Receipt / Compliance -> ProductReadinessSnapshot -> CommercialProductProjectionVersion -> CommercialPublication -> PriceListVersion -> BuyerCatalogVersion -> Showroom / Linesheet -> Buyer Cart -> Color x Size Matrix -> Wholesale Order -> OrderCommitSnapshot -> Supply / Shipment / Receipt -> Actual Cost -> Landed Cost -> Margin -> Cost Close -> Supplier Recovery / Performance -> KPI Registry / Analytics`

## Consolidation guardrails

1. **No second Product Master.** Product Identity is the canonical Style/StyleVersion/Colorway/Size/SKU lineage. Existing `catalog_skus` remains a compatibility surface until migration is complete.
2. **One formal handoff into commerce.** Technical/runtime objects may not be read ad hoc by buyer catalog. The handoff is `ProductReadinessSnapshot -> CommercialProductProjectionVersion -> CommercialPublication`.
3. **Route evidence is fail-closed.** Existing repository sources cannot be overridden with arbitrary external readiness evidence. External facts are allowed only where the bounded context is intentionally outside/not yet canonical.
4. **MDM is reference truth, not formula truth.** Persistent KPI Registry owns formulas. `docs/fashion-kpi/` owns methodology/source contracts. No parallel editable formula catalog under MDM.
5. **Historical business facts freeze versions.** Readiness, commercial projection, buyer catalog, order, cost and later KPI observations keep exact version/lineage references instead of resolving current masters retroactively.
6. **No new Omnidata version stylesheet.** ODS migration burns compatibility debt down; it never adds `omnidata-v15.css`, `v16`, or another page-local visual dialect.
7. **No blind stale-PR merges.** Every old PR is compared with current main. Keep unique invariants/tests; rebase or extract them; close superseded parallel implementations.
8. **Cross-module imports only through `public.mjs`.** Existing repository boundary rule remains mandatory.
9. **Mutations require idempotency/outbox.** MDM, Product Identity and readiness/projection mutations follow durable command and unified transactional-outbox discipline.
10. **RU/EN is mandatory for user-facing governed values and UI.**
11. **PROD is earned end to end.** A spec, migration or UI mock alone never upgrades a capability to production-ready.

## Consolidation Wave order

1. MDM Core Rescue — merged.
2. Product Identity V2 — merged.
3. Product Identity runtime + exact MDM binding — merged.
4. ProductReadinessSnapshot -> CommercialProductProjectionVersion — current slice.
5. Variant-rich projection-only CommercialPublication / BuyerCatalog snapshots.
6. Buyer Linesheet / Style Detail.
7. Draft Buyer Cart + Color x Size Matrix.
8. Door/address/commercial master snapshots.
9. Close P0 connected-retailer -> publication -> variant matrix -> submit -> brand response -> immutable agreed order.
10. Reconcile stale PRs and selectively recover unique shipping/quality/readiness invariants.
11. Rebase/renumber KPI Registry #72, then rebase exact runtime #76.
12. ODS debt burn-down: Sourcing -> Measurements -> BOM -> Materials -> Styles/Collection Planning -> shared shell/navigation.
13. Only then expand P1/P2 buyer discovery, messaging, Visual Assortment, Looks/Styleboards, payment/integration and advanced analytics surfaces.
