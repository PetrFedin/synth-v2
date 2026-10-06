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

## Additional wave — demand plan, inbound receiving and controlled product revisions

This wave strengthens the commercial-to-supply loop after Product Master, PLM, assortment scenarios and order authority are stable.

### Demand Plan / Statistical Baseline — ADOPT/ADAPT

Reference: https://github.com/skforecast/skforecast

Create a versioned demand-plan entity that clearly separates:

- observed sales/history;
- planner overrides;
- statistical baseline;
- campaign/event effects;
- final approved planning scenario.

Use statistical forecasting only where history/coverage is sufficient. The result is a planning input, not an order command.

Required lineage:

- product/category/brand grain;
- training window;
- features;
- model/version;
- forecast horizon;
- error metrics;
- override reason;
- approved scenario/version.

For sparse/new-fashion items, category/style analogue methods may be more appropriate than a misleading SKU forecast. The system should explicitly allow "insufficient history".

### ASN / Inbound Receiving Authority — ADOPT

Add supplier Advanced Shipping Notice / inbound workflow:

`PO/order -> supplier ASN -> expected cartons/items -> arrival -> receiving -> discrepancy -> QC -> accepted/quarantine -> stock availability`

Track:

- supplier shipment ID;
- expected/received quantities;
- carton/package IDs;
- expected/actual dates;
- warehouse/location;
- discrepancy reason;
- damage/QC;
- document references;
- receiving user/time.

This closes the current gap between confirmed order and actual received stock.

### Landed Cost Actualisation — ADOPT

Extend landed-cost logic from analytical formula to a versioned allocation authority:

`supplier cost + freight + duty + insurance + broker/handling + allocation rule -> expected landed cost -> actual landed cost -> variance`

Allocation rules must be explicit and versioned (units/value/weight/volume or approved custom driver).

Preserve:

- expected vs actual;
- currency/rate source and date;
- Incoterm;
- allocation run/version;
- unapplied residual;
- manual adjustment with reason.

Margin/GMROI should be able to show whether it uses provisional or actual landed cost.

### Product / BOM Change Control — ADOPT

Add controlled revision workflow for material/spec/BOM changes after a product reaches defined readiness:

`change request -> impacted product/BOM/measurements/cost/orders -> review -> approved/rejected -> new revision -> downstream propagation`

Never overwrite an approved historic tech-pack/BOM in place.

Impact analysis should identify:

- affected supplier quote;
- sample status;
- production order;
- compliance/passport fields;
- cost/margin;
- customer/order commitments.

### Line Planning Canvas — ADOPT/CONDITIONAL UI

Reference: https://github.com/xyflow/xyflow

Use a visual canvas only as a projection/editor over canonical product/collection/order entities.

Possible nodes/links:

- collection;
- category/story;
- style;
- colourway;
- delivery;
- supplier;
- readiness blocker.

The canvas may propose reordering/grouping and open domain commands, but the graph UI must not become the only place where product relations exist.

### Additional acceptance

- forecast scenario is reproducible and never auto-orders;
- ASN/receiving discrepancies reconcile to ordered quantities;
- actual landed cost can be traced to source cost components/allocation rules;
- approved product revisions preserve prior versions;
- line-plan UI reloads entirely from canonical PostgreSQL state.

**Sequencing:** governed imports/rules -> assortment scenarios -> demand-plan baseline -> PO/ASN/receiving -> landed-cost actualisation -> controlled revision/line-plan UX.

**Dependency hygiene:** external forecasting/UI libraries remain replaceable; pin versions and review current licenses/security before production adoption.

## Additional wave — EPCIS traceability exchange and supplier-facility identity

This wave strengthens DPP and supply-chain interoperability without replacing Synth-v2 inventory, production, supplier or order authorities.

### EPCIS 2.0 event projection — ADAPT

Reference implementation: https://github.com/openepcis/epcis-repository-ce

Use GS1 EPCIS 2.0 concepts as an external interchange/read projection for selected traceability events.

Candidate Synth-v2 source events:

- item/batch commissioned or identified;
- material received;
- components aggregated into production/packing units;
- production/transformation completed;
- QC event;
- shipment/despatch;
- warehouse receipt;
- return/rework where relevant.

Map approved native facts into EPCIS event types/fields while keeping:

- canonical Synth-v2 event ID;
- EPCIS event ID;
- source entity IDs;
- event time;
- business step/disposition mapping;
- read point/location mapping;
- transformation/batch relationships;
- schema/profile version.

OpenEPCIS may be used as a test/reference repository or bounded interoperability sidecar. It must not become the transactional stock or production database.

### Traceability Chain for Digital Product Passport — ADOPT

Build a native chain that can resolve:

product / batch -> BOM/material lots -> supplier/facility -> transformation/production -> QC -> shipment/receipt -> passport projection

The passport only exposes fields approved for its audience. Commercially sensitive supplier/cost data remains private even if used internally to establish provenance.

### Open Supply Hub facility identity — ADAPT

Reference: https://github.com/opensupplyhub/open-supply-hub

Add optional external facility identity links for supplier/manufacturing sites.

Store:

- Synth-v2 supplier/facility ID;
- external provider;
- OSH/external facility ID;
- matched name/address/country at reconciliation time;
- confidence/status;
- reviewer;
- last verified time.

External facility data helps normalize identity and reduce duplicates; it does not certify compliance, ownership, capacity or supplier performance.

### Facility Reconciliation Queue — ADOPT

When an import/supplier declares a new manufacturing site:

candidate facility -> normalization -> external lookup candidates -> reviewer confirms/new internal identity -> future orders/production reference canonical facility

Never auto-merge two facilities solely on fuzzy name/address similarity.

### Additional acceptance

- EPCIS export can be regenerated from canonical Synth-v2 source events;
- external EPCIS ingestion goes through staging/schema/domain admission, never direct stock mutation;
- passport trace links resolve to actual approved material/production/QC records;
- external facility identity has human-reviewed status/confidence;
- Open Supply Hub data is not presented as compliance certification.

**Sequencing:** ASN/Receiving + production/QC/batch identity first -> native trace chain -> EPCIS export/interchange -> facility reconciliation -> DPP enrichment.

**Dependency note:** OpenEPCIS and Open Supply Hub remain external interoperability/reference systems; pin versions and re-check license/API terms before runtime use.

## Additional integration wave — lifecycle-impact modeling and colour-quality authority

This wave strengthens Product Passport, material sourcing and QC with two bounded technical capabilities: environmental-impact calculation and objective colour measurement.

### Product / Material LCA Projection — ADAPT/SIDECAR

Reference:

https://github.com/GreenDelta/olca-app

Use openLCA concepts/tooling as a separate analytical sidecar for lifecycle-impact calculations.

Authoritative Synth-v2 inputs may include:

- approved BOM/material composition;
- material mass/quantity;
- supplier/facility;
- geography;
- production/process mapping;
- energy/process factors when available;
- transport stage;
- packaging;
- source evidence/version.

Flow:

approved Synth-v2 snapshot -> LCA mapping/export -> calculation sidecar -> result dataset -> reviewed import -> Product Passport / sustainability projection

openLCA never owns product, BOM, supplier or passport state.

### Sustainability Evidence Authority — ADOPT

Every sustainability figure shown in Product Passport or internal sourcing analysis must store:

- metric;
- value/unit;
- scope/boundary;
- methodology;
- dataset/database source;
- dataset version;
- mapping assumptions;
- calculated_at;
- reviewer/status.

Unknown data remains unknown; do not substitute generic averages without labeling them.

### Colour Measurement / Delta-E QA — ADOPT/ADAPT

Reference:

https://github.com/colour-science/colour

Create controlled colour records for sample/production QC when measured instrument data is available.

Store:

- product/colourway;
- reference target;
- measurement source/device;
- colour space/illuminant/observer;
- Lab/LCH or other normalized values;
- Delta-E method/value;
- tolerance rule/version;
- measurement time;
- reviewer/QC outcome.

Use objective colour difference as QC evidence, not as a replacement for visual/brand approval.

### Colour Reference Authority — ADOPT

Keep separate:

- commercial colour name;
- internal colour code;
- supplier colour reference;
- measured colour target;
- optional external standard reference.

Do not infer exact measured colour from ordinary product photography.

### Batch / Lot Colour Drift — ADOPT

Where multiple material/production lots are measured:

reference -> lot measurement -> Delta-E -> tolerance -> QC disposition

This can connect to supplier performance and production batch traceability.

### Additional acceptance

- LCA result resolves to exact BOM/material/supplier snapshot + methodology/dataset version;
- generic/default environmental factors are explicitly labeled;
- openLCA sidecar cannot write product/BOM records;
- colour measurement stores instrument/condition context;
- photo-derived colour is never presented as calibrated instrument truth unless a validated calibrated workflow exists;
- QC outcome remains a Synth-v2 domain decision.

**Sequencing:** Product/BOM/Supplier/Traceability first -> sustainability evidence mapping -> openLCA analytical sidecar -> Passport projection; Sample/QC authority -> colour reference -> measured Delta-E/batch drift.

**Dependency note:** openLCA upstream is MPL-2.0 and Colour is BSD-3-Clause in the verified repositories; review database/license terms separately from application code because LCA datasets can have independent licensing.

## Additional wave — 3D digital sample and material-authoring authority

This wave positions Synth-v2 as a premium fashion PLM with versioned digital samples rather than decorative 3D files.

### 3D Sample Authority — ADOPT

Add a native digital-sample record linked to:

- product/style;
- colourway;
- sample iteration;
- pattern/spec/BOM revision;
- supplier;
- source application/provider;
- source file/checksum;
- web derivative;
- review status;
- reviewer comments;
- approved/superseded relation.

Digital approval does not silently replace physical sample/QC gates.

### OpenUSD Interchange — ADAPT

Reference: https://github.com/PixarAnimationStudios/OpenUSD

Use OpenUSD as an optional scene/interchange boundary for compatible upstream 3D-fashion tools.

Track source format/version, conversion tool/version, scale/units and product/sample mapping.

Synth-v2 remains product/sample authority.

### MaterialX Digital Material Definitions — ADOPT/ADAPT

Reference: https://github.com/AcademySoftwareFoundation/MaterialX

Connect:

physical material/BOM item -> digital material definition -> approved digital sample

Store digital material revision separately from physical sourcing/compliance truth.

A visually accurate shader does not prove physical colour, drape or performance.

### GLB/GLTF Web Derivative — ADOPT

Generate validated lightweight derivatives for:

- buyer/showroom preview;
- PLM review;
- mobile/tablet;
- Product Passport/media surfaces.

The derivative is not the editing master.

### 3D Review / Annotation — ADOPT

Allow reviewer comments anchored to mesh/part/material/view/sample revision.

A review may create:

- sample change request;
- BOM/material change request;
- fit/spec review task.

It cannot rewrite the product/BOM directly.

### Digital-vs-Physical Sample Evidence — ADOPT

Track whether a decision was based on digital, physical or both, plus discrepancy classes:

- colour;
- construction detail;
- trim/material;
- silhouette/fit;
- visual drape.

Measure whether digital sampling actually reduces physical iterations and lead time.

### Additional acceptance

- every 3D sample resolves to exact product/sample/BOM revision;
- historic approved digital revisions remain immutable;
- digital material remains distinct from physical-material authority;
- 3D viewer failure does not block core PLM;
- sample comments create explicit domain change requests;
- digital-sample ROI is based on observed iteration/time evidence.

**Sequencing:** sample/BOM/revision authority -> 3D sample records -> MaterialX/USD boundaries -> GLB derivatives -> review/annotation -> benefit measurement.

**Dependency note:** MaterialX is Apache-2.0 upstream; review exact OpenUSD license/distribution terms before bundling.

## Premium commercial wave — should-cost and supplier negotiation workbench

This wave strengthens Synth-v2 as a commercial fashion operating system, connecting sourcing decisions directly to margin and realised landed cost.

### Supplier Quote Version Authority — ADOPT

For each style/material/service quotation store:

- supplier;
- product/material;
- quote version/date;
- MOQ;
- tiered quantities;
- unit cost;
- currency;
- Incoterm;
- payment terms;
- lead time;
- tooling/development cost;
- freight/other known components;
- validity period;
- attachments/source;
- reviewer/status.

Never overwrite a prior quote.

### Cost Breakdown / Should-Cost Model — ADOPT

Create a versioned target-cost model using approved inputs such as:

- fabric/material consumption;
- material price;
- trims;
- CM/labour;
- wash/finish;
- packaging;
- tooling/development;
- freight/duty/handling scenario;
- quality/inspection allowance where defined;
- FX assumptions.

Clearly distinguish:

- supplier quoted cost;
- internally estimated should-cost;
- negotiated agreed cost;
- expected landed cost;
- actual landed cost.

### Negotiation Round Workspace — ADOPT

Flow:

quote -> internal target -> negotiation round -> supplier response -> revised quote -> agreed / rejected / alternate supplier

Store:

- round;
- requested changes;
- response;
- commercial concessions;
- MOQ/lead-time tradeoff;
- validity;
- owner;
- attachments/communications reference.

Do not turn private commercial negotiation notes into supplier-visible data by default.

### Margin Impact Simulator — ADOPT

For a quote/scenario show effect on:

- wholesale/retail price;
- intake margin;
- contribution;
- landed cost;
- MOQ/budget;
- scenario GMROI/stock risk where applicable.

Reuse the existing rules, Assortment Scenario Engine and Landed Cost authorities rather than creating parallel formulas.

### Supplier Comparison — ADOPT

Compare qualified suppliers on explainable dimensions:

- quote/cost;
- MOQ;
- lead time;
- capacity/commitment where known;
- quality/QC history;
- OTIF;
- sample performance;
- payment terms;
- facility/provenance status.

Do not collapse this into a black-box single supplier score unless components are visible.

### Realised Negotiation Effect — ADOPT

After receiving/actual-cost data exists:

baseline quote -> agreed quote -> actual landed cost -> realised effect

Separate:

- negotiated unit-cost effect;
- FX;
- freight/duty;
- quantity/MOQ;
- quality/rework;
- mix.

This prevents fake "savings" claims that disappear in landed cost.

### Additional acceptance

- quote history is immutable/versioned;
- should-cost assumptions are visible;
- supplier negotiation cannot bypass sourcing/approval roles;
- margin simulator uses canonical price/cost formulas;
- realised effect reconciles to actual landed cost;
- supplier comparison is explainable and evidence-linked.

**Sequencing:** Supplier/Quote/Sourcing + Cost/Landed Cost authorities -> should-cost -> negotiation rounds -> margin scenarios -> actual-effect reconciliation.

**Commercial framing:** sell as a negotiation and sourcing-control cockpit that turns PLM data into measurable procurement margin improvement.

## Premium enterprise wave — Peppol / UBL B2B interoperability

This wave adds enterprise electronic-document interchange for retailers, distributors, suppliers and finance systems.

### Official interoperability source — ADOPT/REFERENCE

Primary specifications:

https://peppol.org/documentation/technical-documentation/post-award-documentation/

https://docs.peppol.eu/

Use the applicable current release and jurisdiction rules at implementation time.

### B2B Document Exchange Authority — ADOPT

Support projections for:

- purchase/order;
- order response/agreement;
- despatch advice / ASN;
- invoice;
- credit note;
- catalogue/price update where appropriate.

Store:

- canonical source entity/version;
- external document type;
- UBL/Peppol profile/version;
- sender/receiver identifiers;
- generated/received time;
- validation result;
- transport/provider;
- external message ID;
- acknowledgement;
- raw checksum.

### Outbound Mapping — ADOPT

confirmed canonical entity -> UBL/Peppol projection -> schema/Schematron validation -> access-point/provider adapter -> acknowledgement

A sent document is immutable projection of one canonical version.

### Inbound Staging — REQUIRED

raw external document -> checksum -> syntax/profile validation -> partner mapping -> staging -> reconciliation -> preview/diff -> explicit commit

No inbound document directly mutates Order, ASN, Invoice or Product state.

### Access Point Boundary — ADAPT

Synth-v2 does not implement the whole Peppol network.

Use certified/approved provider/access point where required.

Synth-v2 owns mapping, validation, partner identity mapping, reconciliation and canonical state.

### Rule Pack Versioning — ADOPT

Store exact:

- BIS/PINT profile;
- release;
- jurisdiction rule set;
- validation artifact/version.

### EDI Exception Desk — ADOPT

Surface:

- rejected document;
- validation error;
- identifier mismatch;
- quantity/price mismatch;
- unknown SKU;
- duplicate;
- invoice/order discrepancy.

Every exception links to raw document and canonical entities.

### Additional acceptance

- outbound document reproduces from exact canonical version;
- inbound raw is immutable;
- validation happens before admission;
- EDI cannot bypass bilateral order authority;
- partner identifiers/rule packs are versioned;
- provider is replaceable;
- CSV/email import is never mislabeled Peppol-compliant.

**Sequencing:** Order/Confirmation + ASN/Receiving + invoice readiness -> UBL mapping -> validation -> provider adapter -> inbound staging -> exception desk.

**Commercial framing:** enterprise B2B infrastructure capable of integrating with large retailers and supply-chain partners.

## Moat wave — supplier capacity exchange and production-slot reservations

This wave turns supplier data from static profiles into a governed network for production-capacity commitments.

### Capacity Offer Authority — ADOPT

Supplier/factory can publish or confirm a bounded capacity offer:

- facility;
- capability/product family;
- production process;
- period/week/month;
- available quantity/hours/lines;
- MOQ;
- lead-time assumptions;
- material dependency;
- currency/commercial note where allowed;
- confidence/status;
- valid-until;
- source/owner.

Capacity is a commitment candidate, not guaranteed output.

### Capacity Request — ADOPT

Brand/buyer creates a request from approved demand/order planning:

- product/category;
- quantity;
- delivery window;
- required process/capability;
- compliance/facility constraints;
- target cost range where shareable;
- priority;
- confidentiality scope.

Do not expose full commercial plan to every supplier.

### Capacity Match / Optimizer — ADAPT

Reference:

https://github.com/google/or-tools

Use a scenario solver to propose:

demand -> qualified facility -> feasible capacity slot -> shipment/delivery implication

Constraints may include:

- facility capability;
- approved supplier status;
- reserved/available capacity;
- lead time;
- MOQ;
- QC/compliance;
- logistics calendar;
- priority.

Solver output is a proposal, never a supplier commitment.

### Production Slot Reservation — ADOPT

Lifecycle:

capacity offer -> request/match -> provisional hold -> bilateral confirmation -> reserved slot -> linked PO/production order -> consumed/released/expired

Store:

- capacity version;
- held quantity/time;
- expiry;
- parties;
- confirmation;
- linked canonical order;
- release reason.

### Confidentiality Boundary — REQUIRED

Multi-supplier/network deployment must protect:

- other brands' forecasts;
- supplier private capacity;
- negotiated cost;
- buyer identity where anonymised sourcing is intended.

No cross-tenant leakage for "network intelligence".

### Capacity Reliability History — ADOPT

Compare:

reserved -> confirmed -> actual start -> output -> ship -> receipt

Derive explainable supplier metrics:

- commitment adherence;
- capacity cancellation;
- late start;
- realised output;
- OTIF context.

This becomes a defensible network data asset.

### Supplier Network Product — CONDITIONAL

If multiple organisations use Synth-v2, offer opt-in network discovery for approved suppliers/facilities.

Network participation is not automatic and must separate public profile, shared capacity and private commercial data.

### Additional acceptance

- capacity offer/request versions are immutable/auditable;
- reservation cannot exceed configured available capacity without override;
- supplier confirmation is explicit;
- solver cannot create PO/production order;
- cross-tenant forecasts/costs remain isolated;
- reliability metrics trace to actual production/shipment facts.

**Sequencing:** Supplier/Facility + Production + Order + Planning -> capacity offers -> requests/matching -> slot reservation -> actual reliability -> optional network.

**Commercial framing:** creates a two-sided supplier-capacity network and longitudinal reliability moat, moving Synth-v2 beyond PLM into supply-network orchestration.

## Platform economics wave — verified Supplier Passport and Network API

This wave packages the growing supplier/facility/capacity/performance graph into a reusable network product for brands and approved suppliers.

### Supplier Passport Authority — ADOPT

Create a governed passport projection over existing source facts:

- supplier/facility identity;
- manufacturing capabilities;
- categories/processes;
- locations;
- external facility IDs;
- compliance/document references;
- sample/QC history;
- OTIF/performance;
- quote/MOQ/lead-time ranges only where shareable;
- capacity offer status;
- sustainability/traceability evidence;
- last verified date;
- visibility scope.

Passport is a projection, not a replacement for Supplier/Facility authority.

### Evidence Classes — ADOPT

Each passport field is labelled:

- self-declared;
- document-verified;
- externally referenced;
- Synth-v2 transaction-history verified;
- expired/stale;
- disputed.

This creates trust without a black-box supplier score.

### Capability Credential — ADOPT

For selected verified capabilities, issue a versioned signed attestation inside Synth-v2 such as:

- facility identity verified;
- category capability verified by completed production;
- QC evidence-ready;
- traceability-ready;
- Peppol/EDI-ready;
- capacity-sharing participant.

A credential states exactly what was verified and when; it is not a general certification unless issued by an authorised certifier.

### Supplier Network API — ADOPT

For authorised brands expose:

- supplier/facility search;
- capability filters;
- passport fields allowed by supplier policy;
- current shared capacity offers;
- evidence/credential status;
- request/match creation;
- performance facts from that brand's own relationship.

No competitor quotes/costs/forecasts are exposed.

### Supplier Self-service Portal — ADOPT

Approved supplier may:

- maintain public/shared profile;
- submit evidence;
- update capabilities;
- publish capacity;
- respond to requests;
- view verification issues;
- manage visibility.

All changes go through validation/review where required.

### Network Data Moat — ADOPT

Longitudinal graph:

supplier/facility -> sample -> quote -> reservation -> production -> QC -> ship -> receipt -> actual performance

This evidence becomes increasingly hard to replicate.

### Commercial Packaging — ADOPT

Potential products:

- Supplier Passport;
- Network Discovery;
- Capacity Network;
- Enterprise API;
- Verification/Onboarding service.

### Additional acceptance

- passport fields preserve evidence class/freshness;
- supplier controls shareable profile fields;
- cross-brand private commercial data stays isolated;
- capability credential scope is explicit;
- API cannot expose competitor-specific performance/cost;
- network metrics trace to canonical production/shipment evidence.

**Sequencing:** Supplier/Facility + Capacity + QC/Performance + Traceability -> passport projection -> self-service -> credentials -> Network API -> commercial packaging.

**Commercial framing:** Synth-v2 gains a verified supplier network whose trust and performance history compound with usage, creating a defensible multi-tenant data moat.

## Defensibility wave — Supplier Trust Graph and portable production credentials

This wave turns the Supplier Passport and capacity/performance network into a trust system based on verified production history rather than self-declared profiles.

### Supplier Trust Graph — ADOPT

Graph entities:

- supplier;
- facility;
- capability/process;
- product/category;
- sample;
- quote;
- capacity reservation;
- production order;
- QC result;
- shipment;
- receipt;
- traceability evidence;
- external facility identity.

Relations are derived from canonical Synth-v2 facts.

### Evidence-backed Trust Dimensions — ADOPT

Expose separate dimensions:

- identity/facility verified;
- capability self-declared vs production-verified;
- sample pass history;
- QC first-pass/rework;
- reserved-capacity adherence;
- OTIF;
- traceability completeness;
- EDI/Peppol readiness;
- evidence freshness.

Never collapse these into one unexplained supplier score.

### Portable Production Credential — ADAPT

Reference:

https://github.com/w3c/vc-data-model

Issue scoped credentials such as:

- Facility Identity Verified;
- Production Capability Verified for category/process;
- Traceability-ready;
- Peppol/EDI integration verified;
- Capacity-sharing participant;
- QC evidence-ready.

Each states exact evidence standard/version and expiry/review date.

Credential does not certify labour/environmental compliance unless an authorised certifier/evidence process explicitly does so.

### Privacy-safe Cross-brand Reputation — ADOPT

Network-level trust can use aggregated facts only where allowed.

A supplier may show:

- N verified completed productions;
- OTIF band/period;
- QC evidence band/period;

without exposing which competing brand, negotiated price or confidential product.

Minimum cohort/privacy rules are required.

### Supplier-issued / Third-party Evidence — ADOPT

Separate evidence classes:

- supplier self-declared;
- Synth-v2 observed;
- external registry;
- third-party certificate;
- brand-confirmed.

Never convert self-declared evidence into Synth-v2-verified status automatically.

### Credential Verification API — ADOPT

Allow partner systems to verify:

- credential ID;
- subject facility/supplier;
- scope;
- status;
- issued/review dates;
- issuer.

Minimum disclosure only.

### Additional acceptance

- every trust dimension resolves to source facts;
- no competitor-specific commercial data leaks;
- credential scope is explicit;
- expired external certificate affects only dependent credential;
- new suppliers receive no-history state rather than a low reputation score;
- graph remains reconstructable from canonical events.

**Sequencing:** Supplier Passport + Capacity + QC + Traceability -> Trust Graph -> dimension rules -> credentials -> privacy-safe network reputation -> verification API.

**Moat:** the longitudinal supplier/facility performance graph compounds across transactions and becomes difficult for a new PLM/sourcing competitor to reproduce.

