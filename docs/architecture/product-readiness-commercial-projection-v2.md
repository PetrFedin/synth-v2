# Product Readiness and Commercial Product Projection V2

Status: **supporting specification aligned with `ARCHITECTURE.md` as of 2026-09-04**.  
Authority: `ARCHITECTURE.md` remains the only authoritative living platform contract. This file provides implementation rationale and must not redefine current status or lifecycle.

## Purpose

The canonical technical-to-commercial handoff is:

`ProductStyle → StyleVersion → Colorway → ProductSku → ProductReadinessSnapshot → CommercialProductProjectionVersion → CommercialPublication`.

The handoff exists so buyer-facing history never has to reconstruct an already-published commercial fact from mutable Product/PLM/MDM heads.

## Product Readiness

`ProductReadinessSnapshot` is immutable and contains exactly 18 governed dimensions:

1. `product_identity`
2. `category`
3. `colorways`
4. `size_scale`
5. `sku_matrix`
6. `product_attributes`
7. `bom`
8. `measurements`
9. `samples`
10. `tech_pack`
11. `sourcing`
12. `purchase_or_production_commitment`
13. `quality`
14. `compliance`
15. `commercial_media`
16. `commercial_content`
17. `commercial_terms`
18. `availability_delivery`

Each dimension is `ready`, `blocked` or route-valid `not_applicable`. A missing canonical repository fact cannot be replaced by arbitrary external evidence.

### Current canonical Product Identity evidence

New StyleVersion category truth is an exact governed `assortment.category` MDM reference. The operational profile contains `APPAREL` v1 as the top-level apparel category. It is not a product type or subcategory.

Canonical Measurement evidence is the Product Identity-native Measurement Chart anchored to exact `StyleVersion + Colorway + SizeScaleVersion`, exact ordered Product SizeValues and exact governed `measurement.unit` / `measurement.point` versions. Only a valid PUBLISHED canonical chart can satisfy the canonical readiness `measurements` dimension.

The older SKU-oriented Measurement routes are compatibility-only for new Product Identity/readiness semantics.

### Route-aware evidence

For READY_GOODS, canonical category and Measurement truth come from repository-authoritative Product Identity/Measurement sources. The current acceptance fixture still uses immutable external evidence for `sourcing`, `purchase_or_production_commitment`, `quality` and `compliance` because that READY_GOODS slice has no complete canonical repository sources for those gates yet.

For development routes where BOM, Samples, Tech Pack, Sourcing, Production or Final Quality already have repository-authoritative sources, external evidence may not bypass those facts.

## Commercial preparation

Readiness freezes the commercial preparation that has passed its gates, including bilingual content, origin, selected media, currency, wholesale price, RRP, MOQ/MOV where applicable, delivery context and governed availability context. This remains distinct from buyer-specific price/access snapshots.

## Immutable assessment

A blocked snapshot is historical evidence and is never edited into READY. A new assessment is created after its sources change. Exact MDM/source versions and hashes remain pinned so current master data cannot redefine past readiness.

## CommercialProductProjectionVersion

A projection can be created only from one eligible READY `ProductReadinessSnapshot`. It is immutable and versioned per exact StyleVersion. The current executable state is created directly as immutable `published` projection data; it is not a mutable live Product read model.

Version lineage remains contiguous (`v1 → v2 → v3 ...`) and the projection freezes the exact readiness technical/commercial handoff rather than re-reading current Product Master data.

## Current downstream publication truth

The old statement that CommercialPublication still had to be made projection-native is obsolete. The canonical V2 new-write path is now:

`ProductReadinessSnapshot READY → CommercialProductProjectionVersion → CommercialPublication(formatVersion=2) → PriceListVersion → BuyerCatalogVersion`.

Projection-backed V2 CommercialPublication freezes exact projection id/version/hash, readiness snapshot, StyleVersion and ProductSku-rich hierarchy. PriceListVersion and BuyerCatalogVersion freeze the same upstream lineage.

Historical flat-catalog records remain compatibility history; they are not a source for new V2 product semantics.

## Current lifecycle limitation

The canonical V2 runtime currently creates CommercialProductProjectionVersion, CommercialPublication, PriceListVersion and BuyerCatalogVersion as immutable `published` snapshots. The planned staged CommercialPublication lifecycle:

`DRAFT → READY → PUBLISHED → SUPERSEDED / ARCHIVED`

is **not implemented at this baseline** and is tracked as `COMM-LC-008` in `ARCHITECTURE.md`. This supporting file must not describe that target as executable until the API/domain/PostgreSQL lifecycle is actually implemented.

## Current pricing limitation

PriceListVersion freezes exact buyer/shop, currency and ProductSku commercial terms, including wholesale/RRP/MOQ. Explicit market/effective-period semantics are still incomplete, and buyer-catalog publication retains a compatibility textual-SKU price-override input. These are tracked under `PRICE-009`; canonical pricing must converge on exact ProductSku identity.

## Acceptance evidence

### Product Identity → Product Readiness

`npm run acceptance:product-readiness` contains two independent public-runtime scenarios:

- fail-closed READY_GOODS without categoryRef/canonical Measurement → BLOCKED exactly on `category + measurements`, followed by rejected projection (`422 / COMMERCIAL_PROJECTION_READINESS_BLOCKED`) and zero projection writes;
- positive Product Identity with governed APPAREL/INT_ALPHA/INT_M plus PUBLISHED CM/CHEST_CIRC canonical Measurement Chart → READY with zero blockers and exact same-environment PostgreSQL lineage.

### READY → BuyerCatalog

`npm run acceptance:product-commercialization` creates a fresh positive READY graph and continues it through exact Collection assortment assignment, Showroom/buyer access, CommercialProductProjectionVersion, projection-backed CommercialPublication, PriceListVersion and BuyerCatalogVersion using separate brand/shop actor contexts. The gate verifies the exact frozen lineage and proves Selection/Order/Supply/ActualCost/inventory movements are not created by this slice.

A harness or a green unit/PostgreSQL test is not `PROD-PROVEN`. The intended live acceptance environment must execute the supported runtime gate before the corresponding path receives that status.

## Remaining canonical handoff

After closing staged-publication and pricing-depth gaps, the next P0 boundary is:

`BuyerCatalogVersion → variant-rich Selection / Color × Size Matrix → WholesaleOrder → OrderCommitSnapshot`.

No downstream buyer surface may fall back to current mutable PLM or flat catalog truth when an immutable publication/catalog version already exists.
