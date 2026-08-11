# Product Identity V2

Status: consolidation implementation slice, 2026-08-12.

## Purpose

Product Identity V2 closes the structural gap between the richer PLM/product specification and the current flat operational buyer catalog. It introduces one canonical technical product identity without replacing the already-working commercial-publication/economics spine.

The canonical technical hierarchy is:

`ProductStyle -> ProductStyleVersion -> ProductColorway -> ProductSku`

with the SKU variant dimension pinned to:

`ProductSizeScale -> ProductSizeScaleVersion -> ordered ProductSizeValue`

and governed enrichment through:

`ProductMedia` + `ProductAttributeValue` + exact `mdm_entry_versions` references.

A canonical sellable Product SKU therefore means:

`exact StyleVersion + exact Colorway + exact SizeValue`

## What this slice does not do

This slice does not make Product Identity itself a buyer catalog. In particular it does not own:

- buyer-specific visibility;
- wholesale price, price type or RRP;
- MOQ/pack;
- live availability/reservations;
- delivery windows;
- retailer/door terms;
- commercial copy overrides;
- buyer order quantities.

Those belong to the commercial projection/publication/order layers. This separation prevents technical product truth from being mutated by account-specific commercial logic.

## Stable identity vs immutable versions

### ProductStyle

`product_styles` is the stable style identity and current lifecycle head. Brand and style code are immutable. A lifecycle change increments the exact head version and emits an outbox event.

The governed lifecycle vocabulary is:

`draft -> in_development -> sample_review -> technically_approved -> sourcing_approved -> purchase_or_production_ready -> compliance_ready -> commercial_ready -> active -> discontinued`

with side states `on_hold`, `rejected`, `superseded`. The domain module owns allowed transition semantics; later application services must persist the head transition atomically with command/idempotency handling.

### ProductStyleVersion

`product_style_versions` is immutable technical meaning. Version 1 has no source. Every later version points to the immediately preceding version of the same Style and brand. A semantic change to construction/product/category/type/gender or governed technical payload creates a new StyleVersion instead of rewriting an old one.

The row pins exact MDM entry versions for core high-value filters such as category, product type and gender. The content carries a deterministic SHA-256 hash for publication/readiness lineage.

### ProductColorway

A Colorway belongs to exactly one StyleVersion. It may pin an exact governed colour MDM version and stores bilingual names, swatch HEX and a content hash. A Colorway cannot silently float to another StyleVersion.

### ProductSizeScale / ProductSizeScaleVersion / ProductSizeValue

`product_size_scales` is the stable scale identity. `product_size_scale_versions` freezes the scale semantics and optional exact MDM size-system version. Every version after 1 points to its immediate predecessor.

`product_size_values` freezes buyer order and display ordering through an explicit `sort_order`. Size values can pin exact governed size-entry versions. This is the basis for an ordered Color x Size buyer matrix; alphabetical sorting of size labels is not authoritative.

### ProductSku

`product_skus` is immutable and enforces exact lineage through database foreign keys:

- SKU brand + StyleVersion must match;
- Colorway must belong to that exact StyleVersion and brand;
- SizeValue must belong to the same brand;
- the tuple `StyleVersion + Colorway + SizeValue` is unique.

A technical revision that changes the exact variant meaning creates a new canonical Product SKU identity/code according to the product/versioning policy; historical buyer/order snapshots must never be silently rebound to a different StyleVersion.

## Product media

`product_media` belongs to an exact StyleVersion and optionally an exact Colorway. Roles cover hero/gallery/detail/swatch/technical/video/document. Ordering is explicit. Media records are immutable in this slice; changed content creates a new identity row and later commercial projection chooses which exact media records to publish.

## Product attributes

`product_attribute_values` stores governed reusable attributes against an immutable `style_version`, `colorway` or `sku` owner. Each value freezes:

- `attribute_code`;
- the repository attribute-catalog version;
- JSON value;
- optional exact MDM entry version for reference-valued attributes.

The attribute catalog declares semantics; this table does not turn every fashion attribute into a new database column.

## MDM contract

Product Identity references `mdm_entry_versions(entry_id, version)`, never a mutable current display label. Core FKs and optional reference-valued attributes therefore preserve the exact master-data version used by a technical product snapshot.

A later resolver/admin service will enforce dictionary-type compatibility (for example category references must resolve to category dictionaries, colour references to colour dictionaries) and will create `mdm_usage_snapshots` for historical publication/transaction use.

## Flat catalog compatibility

The current `catalog_skus` implementation remains operational during the migration. Product Identity does not repurpose or overwrite it.

`product_catalog_sku_links` is an explicit one-to-one compatibility bridge:

`ProductSku <-> catalog_skus.sku`

The link requires the same brand and SKU code. This keeps existing selection/order/inventory behavior working while Commercial Projection V2 and BuyerCatalog V2 move to canonical Product Identity.

The bridge is temporary architecture debt with a named boundary; it must not become a second Product Master.

## Mutation and event contract

Snapshot tables are immutable at PostgreSQL level. Stable heads (`ProductStyle`, `ProductSizeScale`) require exact +1 version increments. Product Identity writes emit domain-specific events through the existing unified `outbox_events` table.

This migration-level outbox protection does not replace the repository application rule: public business mutations still need durable command IDs/idempotency and must be committed transactionally with their outbox events.

## Next handoff

Product Identity V2 is upstream of readiness and commercial publication. The only approved future commercial handoff is:

`ProductStyleVersion + exact variants/MDM -> ProductReadinessSnapshot -> CommercialProductProjectionVersion -> CommercialPublication -> PriceListVersion -> BuyerCatalogVersion`

Buyer catalog must never reconstruct current product truth by joining mutable live masters after publication.

## Next implementation gates

1. Add PostgreSQL repository/application service/API for Product Identity with RBAC and command registry semantics.
2. Add MDM dictionary-type resolver/usage snapshots for Product Identity refs.
3. Migrate/bridge existing flat `catalog_skus` into canonical Product SKU identities without changing order history.
4. Build `ProductReadinessSnapshot` for one exact StyleVersion and its required BOM/measurements/Tech Pack/sourcing/sample/QC/compliance inputs.
5. Build `CommercialProductProjectionVersion` containing the exact approved variants/media/labels but no account-specific mutable reads.
6. Extend immutable CommercialPublication/BuyerCatalog payloads with Style -> Colorway -> ordered SizeValue -> SKU structure.
7. Replace table-only buyer lines with Style cards/detail and then Color x Size order grid.
