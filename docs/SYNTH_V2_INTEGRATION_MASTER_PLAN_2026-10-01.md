# Synth-v2 — Integration Master Plan

**Document:** `docs/SYNTH_V2_INTEGRATION_MASTER_PLAN_2026-10-01.md`  
**Status:** PLANNED  
**Date:** 2026-10-01

## Purpose

Canonical roadmap for evolving Synth-v2 as the authoritative Fashion Operating System. All integrations must strengthen the existing PostgreSQL Product Master -> PLM -> Commercial -> Order graph rather than introduce parallel PIM/ERP/e-commerce authorities.

## Existing authority to preserve

Synth-v2 already owns product/master data, collections, showroom, selection/order builder, order/deal flow, BOM/measurements/samples/sourcing/tech packs/production/quality, readiness gates, pricing/commercial projections and PostgreSQL/outbox behavior.

## Integration disposition

| Capability | Source | Decision |
|---|---|---|
| Governed XLSX import/export | ExcelJS | ADOPT |
| Versioned business rules | json-rules-engine | ADOPT |
| PDF line sheets/docs | pdf-lib | ADOPT |
| GTIN/Digital Link | GS1 Toolkit | ADOPT |
| Decision visualisation | Apache ECharts | ADOPT |
| Assortment Scenario Engine | Timefold patterns | ADAPT |
| Visual product similarity | Qdrant | SIDECAR/ADAPT |
| Supplier Performance Authority | native | ADOPT |
| Semantic metrics | Cube | SIDECAR/ADAPT |
| Enterprise lineage | OpenMetadata/DataHub | DEFER/ADAPT |
| Digital Product Passport | native + standards | ADOPT |
| Long-running workflow | Temporal | DEFER |
| PIM | Akeneo | REFERENCE |
| Commerce | Saleor/Medusa | REFERENCE |
| Inventory/procurement | OpenBoxes/ERPNext | REFERENCE |

## Phase 0 — Do not fragment authority

Before adding external services, define one rule:

**Synth-v2 PostgreSQL remains canonical for every product, supplier, commercial, order and production fact.**

External systems receive versioned projections or send imports through admission/staging.

## Phase 1 — Governed spreadsheet gateway

Use ExcelJS.

Flow:

`upload -> staging -> schema/version detection -> validation -> row errors -> preview diff -> explicit commit -> audit`

Initial formats:

- supplier quotation;
- measurement chart;
- size curve;
- price list;
- assortment/order sheet;
- production/QC upload.

Every import format receives a version and deterministic parser. Never write directly from workbook cells to business tables.

Export uses the same schemas so round-trip is testable.

## Phase 2 — Versioned Commercial Rules

Use json-rules-engine only as execution mechanism; rules remain Synth-v2 domain records.

Rule types:

- MOQ;
- assortment admission;
- market/channel eligibility;
- margin floor;
- price corridor;
- order constraints;
- compliance/readiness prerequisites.

Every rule has:

- ID/version;
- scope;
- effective dates;
- inputs;
- decision/reason;
- superseded-by relationship.

Rule engine output is stored as decision evidence.

## Phase 3 — Assortment Scenario Engine

Use Timefold optimisation patterns without letting the solver become authority.

Input:

`budget + doors/channels + categories + brands + SKU candidates + size curves + MOQ + stock + lead times + margin/GMROI targets`

Output proposals:

- SKU/qty recommendation;
- OTB use;
- predicted margin/GMROI/stock cover;
- constraint violations;
- alternative scenarios.

Human approval creates the canonical assortment/order state.

ECharts renders:

- budget waterfall;
- category/brand mix;
- size-curve heatmap;
- OTB;
- weeks cover;
- scenario delta.

## Phase 4 — Visual Product Intelligence

Use Qdrant as rebuildable vector index.

Pipeline:

`authoritative media -> embedding -> vector index -> similar SKU IDs -> Synth-v2 product lookup`

Use cases:

- find historical analogue;
- duplicate/near-duplicate detection;
- design/reference board retrieval;
- cannibalisation review;
- competitor/reference matching where legal/source data exists.

Never store product truth only in vector metadata.

## Phase 5 — Supplier Performance Authority

Create native supplier facts:

- quote accuracy;
- sample lead time;
- production lead time;
- OTIF;
- defects/QC;
- MOQ adherence;
- cancellation/claim rate;
- cost variance.

Every metric must link to orders/receipts/QC facts.

Supplier scorecards become decision support for sourcing; no black-box score without explainable components.

## Phase 6 — Semantic Metrics Layer

Use Cube as optional semantic/query layer over read models.

Canonical metric definitions:

- Net Sales;
- Intake Margin;
- Landed Cost;
- GMROI;
- Sell-through;
- Weeks Cover;
- Stock Turn;
- order intake;
- supplier OTIF;
- contribution margin.

Metric formula/version must remain documented in Synth-v2 even if Cube serves queries.

## Phase 7 — Identifiers and Commercial Documents

### GS1 Digital Link

Add explicit GTIN/GS1 identifiers where the business process requires them.

Keep internal SKU/product IDs separate from external GTIN.

### pdf-lib

Generate versioned:

- buyer line sheets;
- quotation/order confirmation;
- tech/commercial summary;
- QC/production snapshot.

The PDF is derived evidence, not an editable source of truth.

## Phase 8 — Digital Product Passport

Create a native passport projection connecting:

`product -> material/BOM -> supplier -> origin -> production batch -> QC -> certificates -> care/repair/recycling attributes`

The passport is assembled only from approved source records. Missing provenance stays unknown, not guessed.

## Phase 9 — Data lineage

First implement lightweight native lineage IDs through import -> MDM -> product revision -> commercial version -> order -> actual cost.

Only when dataset/system count justifies it, connect OpenMetadata or DataHub as catalogue/lineage viewers.

They must consume lineage; they do not own product data.

## Phase 10 — Reference systems, not parallel systems

- **Akeneo:** study attribute-family/localisation/approval patterns.
- **Saleor / Medusa:** study commerce API/event patterns.
- **OpenBoxes / ERPNext:** study receipts/procurement/stock workflow.
- **Temporal:** adopt only when long-lived workflows exceed the current outbox/job model.

Do not deploy all of these by default.

## Cross-cutting acceptance

Every phase requires:

- PostgreSQL persistence tests;
- tenant/org isolation;
- deterministic validation;
- import rollback/no partial commit;
- versioned decision evidence;
- API/UI contract tests;
- metric methodology test;
- exact migration state.

## Prohibited

Do not:

- make Akeneo the product master;
- let Saleor/Medusa own orders;
- let Cube become the only metric definition;
- let Qdrant own product metadata;
- auto-commit Timefold scenarios;
- overwrite external identifiers into internal IDs;
- add Temporal before a concrete durable-workflow need exists.

## Suggested issue order

1. SYNTH2-INT-00 Spreadsheet admission framework.
2. SYNTH2-INT-01 Rules authority.
3. SYNTH2-INT-02 Assortment scenarios.
4. SYNTH2-INT-03 ECharts decision cockpit.
5. SYNTH2-INT-04 Visual Product Intelligence.
6. SYNTH2-INT-05 Supplier performance.
7. SYNTH2-INT-06 Semantic metrics.
8. SYNTH2-INT-07 GS1 + PDF documents.
9. SYNTH2-INT-08 Product Passport.
10. SYNTH2-INT-09 Enterprise lineage gate.

**Implementation instruction:** Synth-v2 remains the product/commercial authority. External projects provide algorithms, adapters, views and patterns only.

## Additional wave — schema contracts, analytical interchange and observability

### AJV external-schema validation — ADOPT

Reference: https://github.com/ajv-validator/ajv

Use JSON Schema + AJV for machine-readable external/import/export contracts before data reaches domain validation.

Applicable to:

- supplier JSON/API payloads;
- order/export contracts;
- product/passport exchange;
- integration webhooks;
- generated import manifests.

Layering:

`transport schema (AJV) -> staging -> Synth-v2 domain validation -> command -> PostgreSQL`

AJV does not replace business/readiness rules.

Version schemas explicitly and keep backward-compatibility tests for supported versions.

### Apache Arrow / Parquet analytical interchange — ADOPT

Reference: https://github.com/apache/arrow

Provide versioned read-only analytical exports for large product/order/production datasets.

Use columnar formats for:

- assortment scenario inputs/outputs;
- BI/data-science extracts;
- supplier-performance history;
- production/QC analytical snapshots.

Every export records:

- export schema version;
- source snapshot/as-of time;
- tenant/org scope;
- generation SHA.

Arrow/Parquet is interchange, not a second transactional database.

### OpenTelemetry JS — ADOPT

Reference: https://github.com/open-telemetry/opentelemetry-js

Trace:

`API/import -> validation -> transaction -> outbox -> worker/provider -> projection`

Important attributes:

- org/tenant-safe identifier;
- command/import type;
- schema/rule version;
- outbox event type;
- release SHA;
- error class.

Never export product confidential text/BOM content or commercial pricing into span bodies.

### Additional acceptance

- malformed external payloads are rejected before domain mutation;
- analytical exports can be reproduced from a declared snapshot;
- trace links show command-to-outbox-to-worker lifecycle;
- telemetry cannot cross tenant boundaries.

**Sequencing:** AJV belongs before expanding imports/integrations; Arrow after canonical analytical tables exist; OpenTelemetry can be introduced alongside outbox/import tracing.

