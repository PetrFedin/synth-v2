# Commercial Publication → Linesheets

Status: supporting UI/read-model specification aligned with `ARCHITECTURE.md` as of **2026-09-08**. `ARCHITECTURE.md` remains authoritative.

Linesheets/Showroom is a read-only buyer presentation of immutable commercial snapshot truth. Browser code must not derive commercial prices, reconstruct current Product/PLM facts, fabricate variants/buyers, inject demo collections, or invent lifecycle states that the domain does not implement.

## Current publication truth

There are historical compatibility publication records and the canonical V2 projection-backed path. New V2 commercial truth is:

`ProductReadinessSnapshot READY → CommercialProductProjectionVersion → CommercialPublication(formatVersion=2, published) → PriceListVersion → BuyerCatalogVersion`.

The current V2 runtime creates these commercial snapshots directly as immutable `published` records. The target staged CommercialPublication lifecycle `DRAFT → READY → PUBLISHED → SUPERSEDED/ARCHIVED` is not implemented yet and is tracked as `COMM-LC-008`; the Linesheet UI must not display those missing states as though they were executable.

## Collection publication registry

The collection registry is exposed as:

`GET /v2/collections/{collectionId}/commercial-publications?limit=50&cursor=...`

The service authorizes the actor against the collection brand with `DEAL_READ`. PostgreSQL orders snapshots by `(published_at DESC, id DESC)` and uses the same tuple in the opaque cursor. The registry is historical publication evidence, not a live Product Master view.

For canonical V2 publication rows, browser consumers should prefer the frozen projection-native payload: exact projection id/version/hash, readiness snapshot id, StyleVersion id, currency, ProductSku lines and variant-rich Style → Colorway → SizeValue/ProductSku hierarchy. A current PLM value must never overwrite or silently decorate a frozen commercial fact.

Legacy/formatVersion 1 rows remain immutable compatibility history. Their flat fields are not permission to create new flat-catalog product/publication semantics, and migration 075/domain validation now prevent those V1 publication/price snapshots from originating a fresh canonical PriceListVersion or BuyerCatalogVersion.

## Buyer-specific catalog truth

A buyer should consume `BuyerCatalogVersion`, not reconstruct account terms from the collection registry. The canonical V2 BuyerCatalog freezes:

- exact CommercialPublication;
- exact PriceListVersion;
- exact projection/readiness/StyleVersion lineage;
- exact brand/shop context;
- exact Showroom and accepted access grant;
- exact currency and ProductSku price/MOQ lines;
- frozen Style → Colorway → SizeValue/ProductSku hierarchy.

P0.3 acceptance reads the same BuyerCatalogVersion through brand-authorized, shop-authorized and Showroom buyer-catalog access routes and verifies the same immutable PostgreSQL lineage.

## Current pricing boundary

PriceListVersion freezes server-authored currency plus ProductSku-exact wholesale/RRP/MOQ/delivery/availability terms. Optional buyer-specific pricing is keyed only by exact `productSkuId` with integer `wholesalePriceMinor`; the server derives the major-unit price and rejects textual `sku`/client `unitPrice`. The remaining `PRICE-009` gap is market/effective-period and any required policy depth, not pricing identity. Linesheet UI must render the frozen BuyerCatalogVersion and never create a second pricing master.

## UX and localization

Current workspace behavior must continue to cover loading, empty, error and published/read-only states in RU/EN. Error rendering uses localized workspace messaging rather than raw transport text; failed loads resume only after an explicit Retry/Refresh.

The next buyer-facing convergence must use the frozen rich BuyerCatalogVersion for:

- Style card and hero/gallery;
- Colorway selection;
- ordered sizes and exact ProductSku cells;
- wholesale/RRP/currency/MOQ/delivery context;
- buyer eligibility/access context;
- selection quantities and Color × Size matrix.

No buyer surface should fetch mutable PLM fields after publication to fill missing commercial data. Missing frozen data is shown as unavailable until a new governed commercial version is published.

## ODS boundary

Linesheets remains within Omnidata Design System v1 semantic roles/adapters. No page-local stylesheet or new `omnidata-vN` dialect may be introduced. Existing legacy compatibility selectors can be removed only after semantic, screenshot/layout, responsive and interaction verification.
