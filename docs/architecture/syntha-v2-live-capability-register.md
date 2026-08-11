# SYNTH-V2 Live Capability Register

Status date: 2026-08-12  
Baseline main reviewed for this consolidation wave: `11ea2e53aecd609868ab59e89e2bec3d1adcabc3`

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
| Governed MDM reference core | YES | YES | DECLARED | NO | NO | NO | NO | N/A | NO | Rescued semantic catalogs and versioned persistence in migration 050. Next: resolver + RBAC/admin/import APIs + production seed sets. |
| Category / assortment hierarchy | YES | DECLARED | NO | NO | NO | PARTIAL | NO | PARTIAL | NO | Broad hierarchy vocabulary is declared in MDM; no canonical Product Identity binding yet. |
| Size systems / scales / values | YES | DECLARED | NO | NO | NO | NO | NO | NO | NO | Size semantics are declared in MDM. Product Identity V2 must introduce ordered versioned scales/values and SKU binding. |
| Colour master / swatches | YES | DECLARED | NO | NO | NO | PARTIAL | NO | NO | NO | Colour semantics are declared; commercial buyer variants/media are not yet canonical. |
| Product attributes / attribute sets | YES | DECLARED | NO | NO | NO | NO | NO | NO | NO | Governed bilingual attribute definitions exist; Product Identity V2 must store exact attribute values/version references. |
| Product Identity V2: Style | YES | NO | NO | NO | NO | PARTIAL | NO | PARTIAL | NO | Current operational catalog is still SKU-centric. Next canonical object is Style. |
| Product Identity V2: StyleVersion | YES | NO | NO | NO | NO | NO | NO | NO | NO | Required immutable technical identity/version layer is not yet executable. |
| Product Identity V2: Colorway | YES | NO | NO | NO | NO | PARTIAL | NO | NO | NO | No canonical backend Colorway aggregate confirmed. |
| Product Identity V2: SizeScale / SizeValue | YES | NO | NO | NO | NO | NO | NO | NO | NO | Required for ordered buyer order grid and immutable historical SKU identity. |
| Product Identity V2: SKU | YES | PARTIAL | PARTIAL | PARTIAL | YES | YES | PARTIAL | PARTIAL | NO | `catalog_skus` is operational but flat. It remains a compatibility surface until canonical Style/Colorway/Size lineage is attached. |
| Product media / gallery / swatches | YES | NO | NO | NO | NO | PARTIAL | NO | NO | NO | Rich buyer-facing media hierarchy is a P0 buyer catalog gap. |
| ProductReadinessSnapshot | YES | NO | NO | NO | NO | NO | NO | NO | NO | Current-main code search did not confirm a canonical implementation. Old readiness PRs must be diffed; only unique invariants/tests should be rescued. |
| CommercialProductProjectionVersion | YES | NO | NO | NO | NO | NO | NO | NO | NO | Current-main code search did not confirm a canonical aggregate. This must become the single formal handoff from readiness into commerce. |
| CommercialPublication | YES | YES | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | Immutable publication spine exists. Next: snapshot canonical variant hierarchy, media, size ordering, MDM labels, delivery/price metadata. |
| PriceListVersion | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Immutable price version exists; richer price type/RRP/effective semantics remain to be connected. |
| BuyerCatalogVersion | YES | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | NO | Immutable buyer catalog exists, but payload/read model remains too SKU-flat for JOOR/NuORDER-class buyer UX. |
| Buyer Linesheet | YES | PARTIAL | PARTIAL | YES | YES | YES | PARTIAL | PARTIAL | NO | Current linesheet is a publication projection; next gate is Style cards -> Style detail -> colorways/sizes/media. |
| Buyer Style Detail | YES | NO | NO | NO | NO | NO | NO | NO | NO | Depends on Product Identity V2 + Commercial Projection V2. |
| Draft Buyer Cart | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NO | Selection/order flow exists, but draft context must freeze buyer catalog, door, price type and delivery terms. |
| Color x Size Order Grid | YES | NO | NO | NO | NO | NO | NO | NO | NO | Main P0 buyer-workspace gap. Requires ordered SizeScale and canonical SKU variants. |
| Retailer / Door master | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NO | PARTIAL | NO | Organisation/relationship foundation exists; door/location/commercial master depth is insufficient for immutable order snapshots. |
| Wholesale Order | YES | YES | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | Strong bilateral order lifecycle exists; next gate is variant matrix + door/address/terms snapshots from canonical masters. |
| OrderCommitSnapshot | YES | YES | YES | YES | YES | PARTIAL | YES | N/A | PARTIAL | Immutable commercial deal snapshot is part of the canonical economics spine. |
| Supply / production execution | YES | YES | YES | YES | YES | YES | YES | PARTIAL | PARTIAL | Strong execution backbone; keep derived performance separated from product master truth. |
| Shipment / receipt / physical recovery | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NO | Receipt discrepancies/recoveries exist; older outbound-shipment work must be diffed and selectively rescued. |
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
| Styles / Collection Planning ODS migration | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | YES | NO | PARTIAL | NO | Must align with Product Identity V2 instead of styling a second product model. |
| Shared shell/navigation ODS convergence | YES | N/A | YES | N/A | N/A | YES | PARTIAL | PARTIAL | NO | Final ODS convergence step after PLM workspaces. |
| Buyer discovery / connection management | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NO | NO | PARTIAL | NO | P1 after P0 publication-to-order journey. |
| Retailer profile / settings / messages | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NO | PARTIAL | NO | Notifications are not a buyer Inbox; messaging requires its own bounded context. |
| Visual Assortment / Looks / Styleboards | YES | NO | NO | NO | NO | NO | NO | NO | NO | Premium P2 after Product Identity, catalog and order matrix are stable. |
| 1C / EDO / marking / customs perimeter | YES | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NO | PARTIAL | NO | Russian production perimeter is specified but not yet a complete executable chain. |

## Canonical spine to protect

`Line Plan -> CollectionItem -> StyleVersion -> BOM / Measurements / Tech Pack -> Material & Factory RFQ -> Samples -> Supplier Award -> Material PO / Production PO / Finished Goods PO -> Production Execution -> QC -> Receipt / Compliance -> ProductReadinessSnapshot -> CommercialProductProjectionVersion -> CommercialPublication -> PriceListVersion -> BuyerCatalogVersion -> Showroom / Linesheet -> Buyer Cart -> Color x Size Matrix -> Wholesale Order -> OrderCommitSnapshot -> Supply / Shipment / Receipt -> Actual Cost -> Landed Cost -> Margin -> Cost Close -> Supplier Recovery / Performance -> KPI Registry / Analytics`

## Consolidation guardrails

1. **No second Product Master.** New Product Identity work extends one canonical Style/StyleVersion/Colorway/Size/SKU lineage. Existing `catalog_skus` remains a compatibility surface until migration is complete.
2. **One formal handoff into commerce.** Technical/runtime objects may not be read ad hoc by buyer catalog. The handoff is `ProductReadinessSnapshot -> CommercialProductProjectionVersion -> CommercialPublication`.
3. **MDM is reference truth, not formula truth.** Persistent KPI Registry owns formulas. `docs/fashion-kpi/` owns methodology/source contracts. No parallel editable formula catalog under MDM.
4. **Historical business facts freeze versions.** Buyer catalog, order, cost and later KPI observations must keep exact version/lineage references instead of resolving current masters retroactively.
5. **No new Omnidata version stylesheet.** ODS migration burns compatibility debt down; it never adds `omnidata-v15.css`, `v16`, or another page-local visual dialect.
6. **No blind stale-PR merges.** Every old PR is compared with current main. Keep unique invariants/tests; rebase or extract them; close superseded parallel implementations.
7. **Cross-module imports only through `public.mjs`.** Existing repository boundary rule remains mandatory.
8. **Mutations require idempotency/outbox.** MDM and Product Identity mutations must follow the same command/outbox discipline as other SYNTH-V2 bounded contexts.
9. **RU/EN is mandatory for user-facing governed values and UI.**
10. **PROD is earned end to end.** A spec, migration or UI mock alone never upgrades a capability to production-ready.

## Consolidation Wave order

1. MDM Core Rescue — this branch.
2. Product Identity V2 — Style / StyleVersion / Colorway / SizeScale / SizeValue / SKU / Media / AttributeValue.
3. Bind Product Identity to governed MDM versions.
4. Commercial Projection V2 and variant-rich immutable publication snapshots.
5. Buyer Linesheet/Style Detail.
6. Draft Buyer Cart + Color x Size Matrix.
7. Door/address/commercial master snapshots.
8. Close P0 connected-retailer -> publication -> variant matrix -> submit -> brand response -> immutable agreed order.
9. Reconcile stale PRs and selectively recover unique shipping/quality/readiness invariants.
10. Rebase/renumber KPI Registry #72, then rebase exact runtime #76.
11. ODS debt burn-down: Sourcing -> Measurements -> BOM -> Materials -> Styles/Collection Planning -> shared shell/navigation.
12. Only then expand P1/P2 buyer discovery, messaging, Visual Assortment, Looks/Styleboards, payment/integration and advanced analytics surfaces.
