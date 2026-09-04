# SYNTH-V2 Live Capability Register

Status date: **2026-09-04**  
Authority: **supporting mirror only**. `ARCHITECTURE.md` is the single authoritative capability/gap/status register.

The former 2026-08 capability matrix in this file was a consolidation checkpoint tied to an obsolete baseline. It contained statements such as “CommercialPublication still originates from the flat catalog”, “BuyerCatalog remains SKU-flat”, old migration-bridge claims and stale PR rescue instructions. Those statements are no longer allowed to compete with current runtime truth, so the old matrix is retired rather than preserved as a second status system.

## Current canonical spine

`ProductStyle → StyleVersion → Colorway → ProductSku → ProductReadinessSnapshot → CommercialProductProjectionVersion → CommercialPublication → PriceListVersion → BuyerCatalogVersion → Selection → WholesaleOrder → OrderCommitSnapshot → SupplyCommitment → Shipment/Receipt → ActualCostLedgerEntry → LandedCostSnapshot → CostAllocationRunSnapshot → MarginActualizationSnapshot → CostCloseReadinessSnapshot → CostCloseSnapshot → PostCloseAdjustment → PostCloseAllocationReconciliationSnapshot`.

Canonical physical line identity after commitment is exact `orderLineNo + productSkuId`. Textual `sku` is display/consistency/legacy only.

## Current high-level mirror

This table intentionally mirrors only the current master status. If it diverges from `ARCHITECTURE.md`, this file is wrong and must be corrected in the same PR.

| Capability | Current status | Current unresolved gate |
|---|---|---|
| Runtime startup/readiness/shutdown | PROD-PROVEN | deployment-specific acceptance remains environment responsibility |
| Authentication / organisation foundation | IMPLEMENTED | continuing role/capability audit |
| RU fashion MDM operational profile | IMPLEMENTED/PARTIAL | expand governed taxonomy only as canonical flows require it |
| Product Identity V2 | IMPLEMENTED | browser/legacy convergence and broader live proof |
| Canonical Measurement Chart | IMPLEMENTED | intended live Product Readiness evidence and remaining UI convergence |
| ProductReadinessSnapshot | IMPLEMENTED | dual public-runtime acceptance harness exists; intended-live evidence pending |
| CommercialProductProjectionVersion | IMPLEMENTED | positive P0.3 acceptance workflow/intended-live evidence pending |
| CommercialPublication | IMPLEMENTED/PARTIAL | projection-native atomic published V2 snapshot exists; staged lifecycle is open `COMM-LC-008`; historical flat-catalog debt remains |
| PriceListVersion | IMPLEMENTED/PARTIAL | market/effective-period and exact ProductSku override convergence under `PRICE-009` |
| BuyerCatalogVersion | IMPLEMENTED/PARTIAL | rich ProductSku backend exists; buyer Showroom/Linesheet/Matrix UX remains partial |
| Selection / Color × Size | PARTIAL | exact buyer matrix and live BuyerCatalog→OrderCommit proof |
| WholesaleOrder / OrderCommit | IMPLEMENTED | expand live acceptance |
| SupplyCommitment | IMPLEMENTED | expand physical acceptance |
| Shipment / Receipt / Recovery | PARTIAL | live exact ProductSku lineage proof |
| Inventory | IMPLEMENTED core | end-to-end ledger/balance/ATS reconciliation proof |
| SKU-specific ActualCost | IMPLEMENTED | live Shipment→economics acceptance |
| Cost Allocation / Margin / Close / Post-close reconciliation | IMPLEMENTED | full live ProductSku-bearing economics proof remains `ACC-004` |
| KPI production connection | PARTIAL | exact operational source/persistence/reconciliation coverage |
| ODS v1 | IMPLEMENTED with compatibility debt | remove legacy dialect dependencies module by module |
| Full Product → Margin live acceptance | PARTIAL | P0.3 harness added; downstream P0 slices remain |

## Current P0 acceptance ladder

1. `Campaign → Collection` — existing live-accepted slice.
2. Product Identity → Readiness — negative fail-closed and positive READY harnesses implemented in #117; intended-live evidence is still governed separately.
3. READY → Projection → projection-backed CommercialPublication → PriceListVersion → BuyerCatalogVersion — harness implemented on `feat/acc004-ready-to-buyer-catalog-live`; exact-head workflow/intended-live evidence pending; `COMM-LC-008` and `PRICE-009` keep the production contract PARTIAL.
4. BuyerCatalogVersion → Selection → OrderCommitSnapshot — next P0 boundary.
5. OrderCommitSnapshot → Supply → Shipment/Receipt — subsequent P0 boundary.
6. Shipment → SKU-specific ActualCost → Landed → exact allocation → Margin → Close → Post-close reconciliation — implementation contracts exist; live connected proof remains.
7. Full Product → Margin golden path — final `ACC-004` closure.

## Consolidation guardrails

- one Product Master: Product Identity V2;
- one technical-to-commerce handoff: Readiness → Projection → Publication;
- no new writes that use `catalog_skus` as new Product semantics;
- no new canonical physical/economic joins by textual SKU where exact IDs exist;
- no second pricing/catalog/inventory/margin truth;
- no new Omnidata version layer; ODS v1 only;
- MDM is governed/versioned/effective-dated reference truth;
- business mutations require authenticated capability checks and idempotency;
- immutable facts are corrected by new version/reversal/adjustment/reconciliation, not destructive overwrite;
- `PROD-PROVEN` requires accepted real public-runtime + PostgreSQL evidence, never merely a spec, unit test or migration.

For exact capability status, gap IDs, evidence references and Definition of Done, use `ARCHITECTURE.md` sections 15–22.
