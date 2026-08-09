# Fashion KPI executable layer for SYNTH-V2

This document translates the KPI methodology into an implementation plan for the current SYNTH-V2 architecture.

## Architectural position

The platform README defines SYNTH-V2 as a fashion B2B operating platform whose direction includes PLM, BOM, samples, production, QC, logistics, landed cost, analytics and integrations. The repository also enforces module boundaries, organisation isolation, durable command IDs and transactional outbox behavior for mutations.

The KPI layer should therefore be a governed analytics capability, not duplicated calculations inside each workspace.

## Proposed model

### `kpi_definition`

Versioned semantic definition.

Suggested fields:

- `id` UUID;
- `organisation_id` where definition is tenant-specific, otherwise system/global scope;
- `kpi_code` stable business ID such as `PRD-020`;
- `formula_version`;
- `canonical_name_ru`, `canonical_name_en`;
- `domain_code`;
- `lifecycle_status`;
- `business_definition`;
- `calculation_primitive`;
- `business_formula`;
- `canonical_uom`;
- `directionality`, `goal_function`;
- `grain_contract` JSONB;
- `population_contract` JSONB;
- `temporal_contract` JSONB;
- `aggregation_contract` JSONB;
- `zero_null_error_policy` JSONB;
- `publication_contract` JSONB;
- `effective_from`, `effective_to`;
- immutable audit metadata.

Unique business key: `(organisation_scope, kpi_code, formula_version)`.

Never update an effective historical formula in place. Create a new formula version.

### `kpi_source_mapping`

Adapter between semantic variables and actual domain/source fields.

Suggested fields:

- `kpi_definition_id`;
- `variable_name`;
- `source_system`;
- `source_entity_or_topic`;
- `source_field_or_event`;
- `datatype`;
- `primary_or_event_key`;
- `event_timestamp_field`;
- `uom_field`;
- `currency_field`;
- `join_contract` JSONB;
- `filter_contract` JSONB;
- `mapping_status`;
- `verified_at`, `verified_by`.

A KPI cannot be production-ready while required mappings are pending.

### `kpi_run`

One reproducible calculation run.

Fields should include:

- `run_id`;
- `organisation_id`;
- source snapshot/watermark;
- calculation engine version;
- requested period/as-of;
- started/completed timestamps;
- status;
- restatement reason/reference;
- correlation/command ID where the run is user-triggered.

### `kpi_observation`

The calculated fact table.

Minimum fields:

- `run_id`;
- `kpi_definition_id`;
- `organisation_id`;
- `period_start`, `period_end`, `as_of_timestamp`;
- governed grain dimensions;
- `value_numeric`;
- `canonical_uom`;
- `data_quality_status`;
- `calculated_at`;
- `source_snapshot_id`;
- `restatement_id`.

Do not store only a formatted percentage string.

### `kpi_quality_result`

Persist validation results separately from observations:

- rule ID;
- severity;
- pass/fail;
- observed value;
- expected condition/tolerance;
- affected grain keys;
- evidence/lineage pointer.

### `kpi_threshold_version`

Thresholds are policy, not formula.

Fields:

- KPI definition;
- scope/grain applicability;
- warning/blocking/target-band values;
- directionality;
- effective dates;
- approver;
- policy reference.

Do not hard-code universal benchmark numbers into formulas when category/factory/channel policy differs.

## Domain integration

### PLM / product development

Existing modules such as styles/catalog, materials, BOM, measurements, samples and tech packs can provide events for:

- sample right-first-time;
- pattern/measurement conformance;
- BOM completeness/readiness;
- tech-pack completeness and release timing;
- material readiness and substitution;
- development lead time.

KPI code should depend on public domain interfaces/read models, not private module internals.

### Sourcing

Sourcing and counterparty relationships can support:

- supplier quotation response time;
- price variance;
- MOQ/lead-time compliance;
- claim rate and recovery;
- dual-source readiness;
- supplier scorecard components.

Supplier claims must distinguish event count, affected units and monetary claim value; they are different denominators and must not share one umbrella KPI.

### Production

Production orders/execution can support:

- schedule adherence;
- WIP age;
- actual cycle time;
- line efficiency/productivity;
- good output yield;
- rework;
- downtime and changeover;
- OEE components when equipment-time data is available.

`PRD-020 Good output yield` requires a period flow plus opening/closing WIP bridge; it must not be implemented as a pure snapshot.

### Quality

Final Quality and external QMS/LIMS can support:

- first-time release;
- DHU;
- defective-unit rate;
- audit findings;
- CAPA due-cohort compliance;
- inspection/sample results;
- measurement validity.

AQL is an acceptance-sampling parameter, not the same KPI as observed defect rate.

### Wholesale / orders

Orders, commercial cycle, DealSpace and showroom/selection data can support:

- prebook conversion;
- order confirmation and cancellation;
- MOQ/ATS exceptions;
- account retention/profitability;
- partner sell-through when partner sell-out and ending stock are available.

Partner sell-through is a flow-plus-ending-balance ratio and is non-additive across time.

### External enterprise systems

ERP/GL, WMS, TMS/customs, POS, e-commerce, marketplace, CRM/CDP, HRIS, CMMS, EHS/ESG, utilities and lab systems should be connected through explicit adapters. The catalog must not invent source field names before those schemas are known.

## Calculation service behavior

A calculation service should:

1. resolve canonical KPI and formula version;
2. reject blocked umbrella/alias execution;
3. load the physical mapping version effective for the run;
4. build eligible population at minimum grain;
5. execute the primitive;
6. aggregate according to contract;
7. run dimensional and DQ validations;
8. reconcile where required;
9. write observations and quality results atomically;
10. emit an outbox event for publication/notification if the run is accepted.

For a retry of the same business mutation/run request, reuse the original idempotency/command key in accordance with repository rules.

## API/read-model proposal

Possible read endpoints:

- `GET /api/kpis/definitions`;
- `GET /api/kpis/definitions/:code`;
- `GET /api/kpis/observations?code=&period=&grain=`;
- `GET /api/kpis/runs/:runId`;
- `GET /api/kpis/quality?runId=`.

Possible governed mutations:

- create new formula version;
- approve physical mapping;
- approve threshold version;
- request/restate a calculation run.

All mutations require organisation/capability checks, durable command IDs and audit evidence.

## UI integration

KPI surfaces should use the existing Omnidata Design System roles/parts rather than introduce a KPI-specific visual dialect. A metric card can display:

- canonical name;
- value and UOM;
- target/direction;
- trend;
- DQ status;
- formula version;
- period/as-of;
- drill-down action.

The inspector should expose formula, numerator/denominator, population, source lineage and test/reconciliation status. RU/EN user-facing labels must use the shared i18n runtime.

## Definition validation rules

A repository validator can later fail `npm run verify` when:

- duplicate active KPI ID/version exists;
- active KPI has missing grain/population/time/UOM;
- ratio lacks denominator-zero policy;
- true share has no subset rule;
- percentile has no quantile method;
- distinct count has no distinctness key;
- snapshot is marked additive across time;
- alias/blocked parent is publishable;
- production-ready KPI has incomplete physical mapping;
- semantic SQL/DAX operator conflicts with business formula;
- formula version changed without a new definition version.

## Rollout order

1. Load definition catalog and schema without calculating values.
2. Implement validator and definition API.
3. Map existing SYNTH-V2-native data first: PLM, sourcing, production, final quality, orders.
4. Add physical adapters for external ERP/WMS/TMS/POS/CRM/ESG systems.
5. Implement observations, quality results and run lineage.
6. Add dashboards only after the underlying KPI reaches the required release status.

This order keeps semantic governance ahead of visualization and prevents dashboards from becoming the accidental source of truth.