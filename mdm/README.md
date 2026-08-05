# Syntha V2 MDM Reference Core

This directory is the governed master-data and semantic-reference layer for Syntha V2. It is intentionally separate from transactional modules. Orders, BOMs, samples, shipments, invoices and cost calculations consume approved MDM values and store immutable snapshots; they are not themselves dictionaries.

## Invariants

1. Internal IDs are immutable and never replaced by external system codes.
2. RU and EN translations are mandatory for governed user-facing values.
3. Approved records are never physically deleted; use `inactive` or `archived`.
4. Codes are stable after approval. Display names may change through a versioned change request.
5. Rates, prices, taxes, capacities and commercial terms are effective-dated registers.
6. Historical transactions retain the exact version and snapshot used at execution time.
7. Global values may be extended by a tenant, brand, market, account or door without leaking across organisations.
8. Every dictionary, attribute and metric has an owner, a Data Steward, a version and an audit trail.
9. Structured columns hold core semantics; JSON is reserved for governed extensions.
10. External standards are monitored through the source registry. A source change creates a review PR; it never silently rewrites production data.

## Resolution hierarchy

`system global -> tenant -> brand -> market -> account/door -> transaction snapshot`

The resolver must select the most specific active record whose validity period contains the business date. A transaction snapshot is final and has priority over all later master-data changes.

## Repository layout

- `catalog/` — bilingual inventory of classifiers, master objects, registers, templates, transactions and snapshots.
- `attributes/` — reusable attribute definitions and product-type attribute sets.
- `metrics/` — governed KPI definitions, formulas, grains, dimensions and source facts.
- `schemas/` — JSON Schemas for records, attributes and metrics.
- `sources/` — authoritative-source registry and update policy.
- `generated/` — machine-generated source fingerprints. Do not edit manually.
- `db/migrations/022_mdm_core.sql` — PostgreSQL persistence, versioning, approvals, snapshots and audit controls.
- `scripts/validate-mdm.mjs` — deterministic repository validator.
- `scripts/sync-mdm-sources.mjs` — source-change detector and adapter runner.

## Data classes

- `classifier`: controlled values such as categories, statuses, defect reasons and colour families.
- `master`: independent governed entities such as style, material, factory, customer and store.
- `register`: condition- and time-dependent values such as price, tax, FX, labour rate and capacity.
- `template`: configurable structures such as Tech Pack, QC checklist and development calendar.
- `transaction`: business facts such as order, receipt, issue, shipment and payment.
- `snapshot`: frozen state used by a historical business document.

## Change lifecycle

1. Propose a new or changed value in a branch.
2. Validate RU/EN names, stable codes, ownership, validity and references.
3. Submit a governed change request.
4. Data Steward reviews duplicates and source evidence.
5. Domain owner approves critical records.
6. Publish a new version; never overwrite the historical version.
7. Emit an outbox event for caches, search indexes and integrations.
8. Existing transactions remain unchanged because they reference a stored snapshot.

## External-source updates

`npm run sync:mdm-sources` probes only sources marked `automated_probe`. It records a cryptographic or HTTP fingerprint. The scheduled GitHub workflow opens a pull request when a fingerprint changes. Transformation adapters may then update normalized values, run validation and require steward approval. Sources marked `manual_review` or `licensed_import` cannot be automated safely without an approved data licence or authenticated feed.

## Adding a dictionary

Add the declaration to the appropriate file in `catalog/`, assign a unique machine code, RU/EN names, data class, scope and stewardship. Add actual values through imports or tenant administration, not as ad-hoc UI constants.

## Adding an attribute

Add one definition to `attributes/attribute-catalog.json`, then reference it from one or more attribute sets. Do not create a new database column for every dress, shoe or beauty attribute unless it is a cross-domain invariant or high-value indexed field.

## Adding a metric

Add one definition to `metrics/metric-catalog.json`. A metric is incomplete without a formula, grain, time semantics, aggregation rule, source facts, dimensions, owner, steward and validation tests.

## Completeness policy

The catalog is designed to be exhaustive by domain but incrementally populated by values. `declared` means the governed object exists in the semantic inventory. `seeded` means a reviewed baseline value set exists. `connected` means an authoritative source adapter is operational. `production` means application APIs, RBAC, workflows and tests use it end to end.
