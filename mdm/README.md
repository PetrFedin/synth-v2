# SYNTH-V2 Governed MDM Reference Core

This directory is the canonical governed master-data and semantic-reference layer for SYNTH-V2. It is intentionally separate from transactional modules and from the KPI formula registry. Product, sourcing, commercial and order workflows consume approved MDM values and freeze exact versions/snapshots; they do not redefine dictionaries locally.

## Architectural boundary

MDM owns governed reference semantics such as category hierarchies, size systems, colours, materials, units of measure, attributes, source mappings and other reference/master/register definitions.

MDM does **not** own KPI formulas or calculation runtime. The persistent KPI Registry is the only canonical formula source of truth. `docs/fashion-kpi/` remains the governed methodology/source package. Do not add `mdm/metrics/metric-catalog.json` or a parallel metric-definition schema.

The declarations `analytics.kpi`, `analytics.formula` and `analytics.formula_version` in the semantic catalog describe integration/reference object classes only; they are not editable formula definitions.

## Invariants

1. Internal IDs are immutable and never replaced by external system codes.
2. RU and EN translations are mandatory for governed user-facing values.
3. Governed records and their version snapshots are never physically deleted; use `inactive` or `archived` for current heads.
4. Dictionary identity and tenant ownership are immutable. Approved entry codes are immutable.
5. Every update creates the next exact version; version numbers may not be reused or skipped.
6. Rates, prices, taxes, capacities and commercial terms that are modeled through MDM registers are effective-dated.
7. Historical transactions and projections retain the exact MDM entry version and frozen snapshot used at execution/publication time.
8. Global values may be extended by a tenant/brand/market/account/door without cross-organisation leakage.
9. Hierarchies may only exist in hierarchy-enabled dictionaries, remain inside the same dictionary, may inherit from a global parent, and must not contain cycles.
10. Every dictionary and attribute has an owner, a Data Steward, a version and an audit trail.
11. Structured columns hold core semantics; JSON is reserved for governed extensions and frozen snapshots.
12. External standards are monitored through the source registry. A source change creates a review flow; it never silently rewrites production master data.
13. Business mutations that publish MDM changes use the unified transactional outbox.

## Resolution hierarchy

`system global -> tenant -> brand -> market -> account/door -> transaction snapshot`

The application resolver must select the most specific active record whose validity period contains the business date. A historical transaction/publication snapshot is final and takes precedence over later MDM changes.

## Repository layout

- `catalog/` — bilingual semantic inventory of classifiers, master objects, registers, templates, transactions and snapshots.
- `attributes/` — reusable attribute definitions and product-type attribute sets.
- `schemas/` — JSON Schemas for governed reference records and attributes.
- `sources/` — authoritative-source registry and update policy.
- `generated/` — machine-generated source fingerprints; do not edit manually.
- `db/migrations/050_mdm_reference_core.sql` — PostgreSQL persistence, exact version snapshots, hierarchy/tenant guards, usage snapshots and outbox integration.
- `scripts/validate-mdm.mjs` — deterministic repository validator and formula-boundary guard.
- `scripts/sync-mdm-sources.mjs` — source-change detector. It records fingerprints; it does not publish production values automatically.

## Data classes

- `classifier`: controlled values such as categories, statuses, defect reasons and colour families.
- `master`: independent governed entities/reference concepts such as material/factory/customer/store classifications.
- `register`: condition- and time-dependent reference values.
- `template`: governed structures such as QC or development templates.
- `transaction`: semantic declaration of a business-fact class; the transaction itself remains in its bounded context.
- `snapshot`: frozen semantic state used by a historical business document or projection.

## Change lifecycle

1. Propose a new or changed value.
2. Validate RU/EN names, stable code, ownership, scope, validity and references.
3. Create/submit a governed change request where approval is required.
4. Data Steward reviews duplicates, lineage and source evidence.
5. Domain owner approves critical records.
6. Publish the next exact version; never overwrite historical meaning.
7. Emit an outbox event for caches, search/index and integrations.
8. Existing transactions/publications remain unchanged because they reference an exact frozen MDM version/snapshot.

## External-source updates

`npm run sync:mdm-sources` probes only sources marked `automated_probe`. It records a fingerprint and opens a review path when upstream evidence changes. Sources marked `manual_review` or `licensed_import` require an approved review/import process. No source monitor is permitted to silently mutate production master data.

## Adding a dictionary

Add the declaration to the appropriate file in `catalog/`, assign a globally unique machine code, RU/EN names, data class, scope and stewardship. Add production values through governed import/admin flows, not as ad-hoc UI constants.

## Adding an attribute

Add one definition to `attributes/attribute-catalog.json`, then reference it from one or more attribute sets. Definitions may inherit governance defaults. Do not create a new database column for every apparel/footwear/accessory attribute unless it is a cross-domain invariant or a justified indexed field.

## KPI/formula changes

Do not place formulas in MDM. Formula definition versions, release lifecycle, source-mapping versions, mapping-verification events, dependencies, calculation runs, observations, DQ/reconciliation and restatements belong to the persistent KPI Registry/runtime. Until that registry is merged, `docs/fashion-kpi/` is the governed methodology and native source-contract package.

## Completeness policy

The semantic inventory is broad by design but incrementally made executable:

- `declared` — governed object exists in the semantic inventory.
- `seeded` — a reviewed baseline value set exists.
- `connected` — an authoritative source/import adapter is operational.
- `production` — APIs, RBAC, workflows, historical snapshots and automated tests consume it end to end.

Never describe a declared dictionary as production-ready merely because its semantic record exists in this repository.
