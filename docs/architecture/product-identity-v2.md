# Product Identity V2

Status: executable consolidation slice, 2026-08-12.

## Purpose

Product Identity V2 closes the structural gap between the richer PLM/product specification and the historical flat operational buyer catalog. It introduces one canonical technical Product Master without replacing the already-working commercial-publication/economics spine.

The canonical technical hierarchy is:

`ProductStyle -> ProductStyleVersion -> ProductColorway -> ProductSku`

with the SKU variant dimension pinned to:

`ProductSizeScale -> ProductSizeScaleVersion -> ordered ProductSizeValue`

and governed enrichment through:

`ProductMedia` + `ProductAttributeValue` + exact `mdm_entry_versions` references.

A canonical sellable Product SKU therefore means:

`exact StyleVersion + exact Colorway + exact SizeValue`.

## What Product Identity does not own

Product Identity is not a buyer catalog. It does not own:

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

with side states `on_hold`, `rejected`, `superseded`.

### ProductStyleVersion

`product_style_versions` is immutable technical meaning. Version 1 has no source. Every later version points to the immediately preceding version of the same Style and brand. A semantic change to construction/product/category/type/gender or governed technical payload creates a new StyleVersion instead of rewriting an old one.

The row pins exact MDM entry versions for core high-value filters such as category, product type and gender. The content carries a deterministic SHA-256 hash for publication/readiness lineage.

### ProductColorway

A Colorway belongs to exactly one StyleVersion. It may pin an exact governed colour MDM version and stores bilingual names, swatch HEX and a content hash. A Colorway cannot silently float to another StyleVersion.

### ProductSizeScale / ProductSizeScaleVersion / ProductSizeValue

`product_size_scales` is the stable scale identity. `product_size_scale_versions` freezes scale semantics and the optional exact MDM size-system version. Every version after 1 points to its immediate predecessor.

`product_size_values` freezes buyer display/order ordering through explicit `sort_order`. Size values can pin exact governed size-entry versions. Alphabetical sorting of size labels is not authoritative.

### ProductSku

`product_skus` is immutable and enforces exact lineage through database foreign keys:

- SKU brand + StyleVersion must match;
- Colorway must belong to that exact StyleVersion and brand;
- SizeValue must belong to the same brand;
- `StyleVersion + Colorway + SizeValue` is unique.

A technical revision that changes exact variant meaning creates a new canonical Product SKU identity/code according to product/versioning policy; historical buyer/order snapshots are never silently rebound to a different StyleVersion.

## Product media

`product_media` belongs to an exact StyleVersion and optionally an exact Colorway. Roles cover hero/gallery/detail/swatch/technical/video/document. Ordering is explicit. Media records are immutable; changed content creates a new identity row and the later commercial projection chooses which exact media records to publish.

## Product attributes

`product_attribute_values` stores governed reusable attributes against an immutable `style_version`, `colorway` or `sku` owner. Each value freezes:

- `attribute_code`;
- repository attribute-catalog version;
- JSON value;
- optional exact MDM entry version for reference-valued attributes.

The attribute catalog declares semantics; this table does not turn every fashion attribute into a new database column.

## Governed MDM runtime contract

The executable Product Identity service resolves MDM references before creating new technical facts. A new reference must satisfy all of the following:

1. the exact `(entryId, version)` exists;
2. the requested version is the current MDM entry version for a new fact;
3. the entry belongs to the compatible dictionary family;
4. the entry is global or belongs to the same brand/tenant;
5. it is active;
6. it is approved or does not require approval;
7. it is effective at the business write time.

After resolution, the service writes an immutable `mdm_usage_snapshots` record whose JSON is forced by PostgreSQL to equal the exact persisted `mdm_entry_versions.snapshot`. Historical Product Identity meaning therefore does not float when a dictionary later changes.

Dictionary compatibility currently covers the high-value structural references:

- category -> `assortment.category`;
- product type -> `assortment.product_type`;
- gender -> `assortment.gender`;
- colour -> `colour.colour`;
- size system -> `size.system`;
- size value -> `size.size`, `size.footwear_size`, `size.accessory_size`.

Reference-valued generic product attributes can pin any governed MDM entry version; the next MDM admin/import slice will also validate the attribute definition itself against the governed attribute catalog.

## Command, concurrency and outbox contract

Public Product Identity mutations use the global durable command registry under the `product-identity` scope. Reusing a command ID with a different fingerprint fails. Replaying the same completed command re-authorizes the actor and returns the original result without reapplying volatile current-state checks such as a later MDM head version.

Stable heads use optimistic version checks. StyleVersion and SizeScaleVersion creation require `expectedLatestVersionNo`, preventing two writers from silently creating competing next versions.

Product Identity database triggers publish domain-specific events into the existing unified transactional outbox in the same PostgreSQL transaction. The application service intentionally does not create a second outbox event path.

## Executable runtime surface

The PostgreSQL runtime now composes Product Identity command/query services. The HTTP surface is strict and documented in the extended OpenAPI:

- read Style aggregate by latest or exact technical version;
- read Size Scale aggregate by latest or exact version;
- create/transition Style;
- create immutable StyleVersion;
- create Colorway;
- create/update SizeScale head;
- create immutable SizeScaleVersion;
- create ordered SizeValue;
- create canonical Product SKU;
- add immutable media;
- add immutable governed attribute value;
- link one canonical Product SKU to one legacy flat `catalog_skus` record during migration.

Technical Product Master access is protected by dedicated `product.read` / `product.manage` capabilities. Buyer role does not receive technical Product Master access; buyer UX consumes commercial projection/catalog instead.

## Flat catalog compatibility

The existing `catalog_skus` implementation remains operational during migration. Product Identity does not repurpose or overwrite it.

`product_catalog_sku_links` is an explicit one-to-one compatibility bridge:

`ProductSku <-> catalog_skus.sku`

The link requires the same brand and SKU code. This keeps existing selection/order/inventory behavior working while Commercial Projection V2 and BuyerCatalog V2 move to canonical Product Identity.

The bridge is temporary architecture debt with a named boundary; it must not become a second Product Master.

## Commercial handoff invariant

Product Identity is upstream of readiness and commercial publication. The only approved commercial handoff is:

`ProductStyleVersion + exact variants/MDM -> ProductReadinessSnapshot -> CommercialProductProjectionVersion -> CommercialPublication -> PriceListVersion -> BuyerCatalogVersion`.

Buyer catalog must never reconstruct current product truth by joining mutable live masters after publication.

## Remaining gates

1. Validate generic `ProductAttributeValue.attributeCode` against the governed attribute-definition catalog/admin model, not syntax alone.
2. Reconcile existing flat `catalog_skus` to canonical ProductSku through an explicit migration/import workflow without rewriting order history.
3. Rescue only unique readiness invariants/tests from stale PR #50 and create canonical `ProductReadinessSnapshot` for one exact StyleVersion.
4. Create immutable `CommercialProductProjectionVersion` with approved exact variants/media/labels and no account-specific mutable reads.
5. Extend immutable CommercialPublication/BuyerCatalog payloads with Style -> Colorway -> ordered SizeValue -> SKU.
6. Replace table-only buyer lines with Style cards/detail and then Color x Size order grid.
