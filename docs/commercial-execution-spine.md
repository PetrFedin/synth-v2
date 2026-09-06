# SYNTH-V2 Commercial & Execution Spine

Status: supporting lineage summary aligned with authoritative `ARCHITECTURE.md` as of **2026-09-04**.

Canonical immutable lineage:

`ProductStyle → StyleVersion → Colorway → ProductSku → ProductReadinessSnapshot → CommercialProductProjectionVersion → CommercialPublication → PriceListVersion → BuyerCatalogVersion → Buyer Selection → WholesaleOrder → OrderCommitSnapshot → SupplyCommitment → Shipment / ShipmentLine → ActualCostLedgerEntry → LandedCostSnapshot → CostAllocationRunSnapshot → MarginActualizationSnapshot → CostCloseReadinessSnapshot → CostCloseSnapshot`.

Post-close continuation is append-only:

`CostCloseSnapshot → PostCloseAdjustment → adjusted LandedCostSnapshot → MarginActualizationSnapshot(allocationStatus=pending-post-close) → exact new CostAllocationRunSnapshot → PostCloseAllocationReconciliationSnapshot → reconciled MarginActualizationSnapshot(allocationStatus=current)`.

Operational rules:

- Product Identity V2 is the only canonical Style/StyleVersion/Colorway/Size/ProductSku hierarchy. Historical `catalog_skus` compatibility does not define new Product semantics.
- The only canonical technical-to-commerce handoff is `ProductReadinessSnapshot → CommercialProductProjectionVersion → CommercialPublication`.
- Buyer-visible Product/variant/price/MOQ facts come from immutable CommercialPublication / PriceListVersion / BuyerCatalogVersion snapshots, never from mutable PLM fields after freeze.
- Current V2 CommercialPublication is an immutable projection-backed `published` snapshot. The staged publication lifecycle is an open gap (`COMM-LC-008`), not current runtime truth.
- Current PriceListVersion freezes exact buyer/shop, currency and ProductSku commercial terms. Market/effective-period and exact override convergence remain `PRICE-009`.
- BuyerCatalogVersion freezes exact Publication + PriceListVersion + Showroom/access context and variant-rich ProductSku hierarchy.
- Order creation consumes submitted Selection truth; OrderCommitSnapshot is the single frozen commercial deal truth for physical/economic downstream use.
- Canonical physical identity is exact `orderLineNo + productSkuId`; textual `sku` is display/consistency/legacy only.
- Inventory is a centralized dynamic state/ledger overlay around location, balance, reservation, allocation and movement. Buyer/order screens do not own a second balance.
- Supply commitments reference the exact OrderCommitSnapshot; shipment/receipt/recovery must preserve the exact committed ProductSku line when canonical lineage exists.
- SKU-specific physical ActualCost requires exact order/commit/supply/shipment/orderLineNo/productSkuId lineage; aggregate cost may remain unscoped to ProductSku.
- Cost corrections are append-only reversal/replacement operations. Historical immutable facts are not edited in place.
- Landed cost freezes exact active ActualCost entry IDs; canonical ProductSku Cost Allocation freezes exact `orderLineNo + productSkuId` rows.
- MarginActualization and Cost Close freeze the exact landed/allocation provenance; late costs do not rewrite a close.
- Post-close allocation reconciliation creates new immutable allocation/reconciliation/current-margin facts and cannot change the old close, old allocation or pending historical margin.
- PostgreSQL independently guards critical commercial, physical and economic lineage in addition to application/domain validation.
- Live/public-runtime proof is tracked under `ACC-004`; unit/PostgreSQL tests alone do not qualify the full spine as `PROD-PROVEN`.
