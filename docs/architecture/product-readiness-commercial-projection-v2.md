# Product Readiness and Commercial Product Projection V2

Status: consolidation implementation slice, 2026-08-12.

## Purpose

This slice creates the single formal bridge between the technical Product Master and Wholesale Commerce:

`ProductStyleVersion + exact variants/MDM + governed execution evidence -> ProductReadinessSnapshot -> CommercialProductProjectionVersion`.

It deliberately does **not** change `CommercialPublication` yet. The next slice will make CommercialPublication consume the immutable Commercial Product Projection instead of reconstructing buyer content from the legacy flat `catalog_skus` surface.

## Why the bridge is necessary

Product Identity V2 is richer than the historical buyer catalog. A buyer-facing publication must not query current BOM, measurements, samples, sourcing, quality, MDM labels or mutable product heads at render time. Doing that would let historical buyer catalogs drift when PLM data changes.

A readiness assessment therefore freezes the exact facts used to make the publication decision. A published commercial projection freezes the exact handoff into commerce. Later commercial/buyer snapshots reference those immutable facts.

## Governed readiness dimensions

Every ProductReadinessSnapshot contains exactly 18 dimensions:

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

Each dimension is one of `ready`, `blocked`, or `not_applicable`. `not_applicable` is only valid when the development route makes the dimension unnecessary; it is not a synonym for missing evidence.

The database independently verifies that all 18 codes occur exactly once, relational counters match the JSON snapshot, required/status semantics are coherent and lineage matches the exact StyleVersion/brand.

## Route ownership

### OWN_DEVELOPMENT

Repository truth is mandatory for:

- BOM;
- measurement chart;
- approved pre-production sample;
- acknowledged Tech Pack;
- allocated sourcing RFQ;
- confirmed Production Order;
- released Final Quality.

External evidence cannot override missing sourcing, production or Final Quality facts. External evidence is currently used only for the compliance/marking perimeter because that perimeter is not yet fully executable inside SYNTH-V2.

### MATERIALS_SEPARATE

The route keeps the same repository requirements for technical development, manufacturing sourcing, Production Order and Final Quality, and additionally requires immutable material-purchase evidence. Until the Material PO bounded context becomes canonical, that material-purchase fact is accepted as a signed external evidence reference.

### READY_GOODS

BOM, pre-production sample and Tech Pack are `not_applicable`. A published measurement/supplier size chart remains required. Supplier selection, Finished Goods PO, incoming QC and compliance are represented by immutable external evidence until their dedicated canonical bounded contexts are implemented.

## External evidence contract

External evidence is not arbitrary JSON. It freezes:

- `evidenceId`;
- `sourceSystem`;
- source `version`;
- SHA-256 `contentHash`;
- `approvedAt`;
- `approvedBy`;
- status `ready`.

Allowed external evidence is route-specific. The domain fails closed if a caller attempts to use an external fact to replace an existing canonical repository source.

## Product attribute coverage

The current `product_attributes` readiness dimension uses an explicit `attributeCoverageConfirmed` attestation plus the frozen Product Identity attribute counts. This is temporary controlled debt: the next MDM/admin slice must validate `ProductAttributeValue.attributeCode`, applicability, cardinality and value type against the governed attribute-definition catalog. The attestation must not become a second attribute truth.

## Commercial preparation snapshot

The readiness snapshot freezes the prepared buyer-facing fields that have passed the gate:

- bilingual commercial title, description and composition;
- country of origin;
- selected immutable media IDs;
- document references;
- currency;
- wholesale price;
- RRP;
- MOQ and optional MOV;
- optional pack ratio;
- delivery window;
- governed availability mode/quantity;
- attribute-coverage attestation.

This is pre-publication commercial preparation, not account-specific buyer pricing or visibility. Buyer-specific price overrides, access and terms remain in PriceListVersion / BuyerCatalogVersion / order snapshots.

## Immutable assessment

`product_readiness_snapshots` is append-only. It contains:

- exact StyleVersion and brand;
- development route;
- all 18 dimensions and evidence;
- exact Product Identity aggregate captured at assessment time;
- exact linked legacy PLM evidence versions used during migration;
- commercial preparation snapshot;
- deterministic content hash;
- assessment actor/time.

A blocked assessment is still a valid historical record. It documents why publication was impossible at that point in time. It cannot be edited into ready; a new assessment is created after the source facts change.

## CommercialProductProjectionVersion

A projection can be created only from a `ready` ProductReadinessSnapshot. It is immutable and versioned per exact StyleVersion. Version allocation is serialized by locking the StyleVersion row before reading the latest projection version, including the first-version case.

The database independently requires the projection payload to contain the exact frozen `technicalSnapshot` and `commercialPreparation` from its readiness snapshot. The projection cannot substitute current Product Master values or a different readiness result.

Version lineage is contiguous:

`Projection v1 -> v2 -> v3 ...`

A later version must reference the immediate predecessor for the same StyleVersion and brand.

## Command, RBAC and outbox contract

Readiness assessment requires `product.manage`. Readiness reads require `product.read`.

Commercial projection publication requires `catalog.manage`; projection reads require the existing commercial `deal.read` boundary. This keeps technical mutation access separate from buyer visibility.

All mutations use durable command IDs through the global command registry. Readiness/projection database inserts publish events through the unified transactional `outbox_events` table:

- `ProductReadinessSnapshotCreated`;
- `CommercialProductProjectionPublished`.

## Current migration bridge

Current BOM, Measurements, Samples, Tech Packs, Sourcing, Production Orders and Final Quality still key many records by the historical `catalog_skus.sku`. Product Identity V2 intentionally preserved `product_catalog_sku_links` as a one-to-one migration bridge.

The readiness source reader uses that explicit bridge to resolve exact current source versions, then freezes those versions into ProductReadinessSnapshot. This is migration architecture, not the desired final Product Master shape. Future PLM migrations should move technical bounded contexts onto canonical ProductSku/StyleVersion lineage and retire the flat bridge without rewriting historical snapshots.

## What this slice does not claim

This slice does not make the buyer catalog variant-rich by itself. The existing CommercialPublication flow still has its historical flat-SKU publication path. Therefore the P0 gap is **narrowed but not closed** until the next slices land:

1. CommercialPublication V2 consumes `CommercialProductProjectionVersion` only.
2. Publication payload freezes Style -> Colorway -> ordered SizeValue -> ProductSku, media, labels and commercial terms.
3. PriceListVersion adds governed price type/RRP/effective semantics without mutating technical truth.
4. BuyerCatalogVersion preserves exact buyer-visible variant hierarchy and account access.
5. Linesheet becomes Style cards/detail rather than a flat SKU table.
6. Buyer Cart and Color x Size Matrix write quantities against exact BuyerCatalogVersion SKU cells.

## Canonical next handoff

The next implementation target is therefore:

`CommercialProductProjectionVersion -> variant-rich CommercialPublication -> PriceListVersion -> BuyerCatalogVersion -> Style Detail -> Color x Size Order Grid`.

No downstream buyer surface should read current PLM masters directly once the immutable commercial projection exists.
