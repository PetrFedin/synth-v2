# SYNTH-V2 Fashion KPI Specification

Status: governed methodology, catalog version 14.0.  
Purpose: make fashion, sourcing, production, quality, logistics, wholesale, retail, e-commerce, finance, ESG and data-governance metrics reproducible and implementable in SYNTH-V2.

This document is a product/analytics contract. It does **not** make a KPI production-ready by itself. A KPI may be published only after its logical contract is mapped to real source fields, reconciled, tested and accepted by the process owner/data steward.

## 1. Core rule

A KPI is not a label plus a formula. A production-grade KPI is the combination of:

`business meaning -> semantic grain -> eligible population -> event/time contract -> mathematical primitive -> numerator/denominator -> UOM -> aggregation -> source lineage -> controls -> publication metadata`.

Two analysts using the same KPI ID and formula version must be able to reproduce the same result from the same governed source snapshot.

## 2. KPI contract

Every active KPI must define the following contracts.

### Business contract

- stable KPI ID;
- canonical RU/EN name;
- business definition and decision use;
- process/domain;
- accountable owner and data steward;
- directionality: maximize, minimize, target band, at-least, diagnostic or sign-dependent;
- guardrails that prevent a locally favorable KPI from damaging quality, margin, service, safety or compliance.

### Semantic contract

- measurement object;
- minimum grain;
- case/event identity;
- eligible population;
- inclusion and exclusion rules;
- distinctness key where unique objects are counted;
- semantic-equivalence group for aliases/split children.

### Mathematical contract

- immutable formula version;
- formula family and calculation primitive;
- numerator/inputs;
- denominator/exposure;
- normalizer `K` where applicable;
- sign convention;
- mathematical range;
- explicit rule for denominator zero.

### Dimensional contract

- numerator UOM;
- denominator UOM;
- canonical output UOM;
- unit algebra;
- approved UOM conversions;
- currency/FX basis and rate date when monetary values are mixed;
- storage scale and display scale.

### Temporal contract

A KPI must explicitly be one of the governed temporal classes, for example:

- period flow/exposure;
- point-in-time snapshot;
- due cohort;
- completed-case cohort;
- open-as-of cohort;
- balance-and-flow derived metric;
- flow plus ending balance;
- forecast evaluation window;
- matched treatment/input-output window;
- project cohort.

The contract must define event timestamp, reporting period, as-of timestamp where relevant, timezone/calendar, late-arriving-data handling and restatement policy.

### Aggregation contract

The catalog must state whether the KPI is:

- additive;
- semi-additive;
- non-additive;
- ratio of sums;
- weighted mean;
- distinct count;
- percentile recomputed from raw observations;
- product of components;
- snapshot/as-of value;
- derived from multiple component KPI on one perimeter.

Never default to `AVG(precalculated_percentage)` for ratio KPI.

### Data contract

Before release, map logical inputs to real fields:

`source system -> schema/table/topic -> field/event -> datatype -> primary/event key -> join cardinality -> timestamp -> filter -> UOM/FX conversion`.

Physical mapping is deliberately separate from the business formula. SYNTH-V2 should be able to replace an ERP/MES/WMS adapter without changing the semantic KPI ID when the business definition is unchanged.

### Control contract

Required controls include, where applicable:

- denominator-zero handling;
- duplicate-event detection;
- referential integrity;
- join-cardinality checks;
- numerator subset validation for true shares;
- UOM/dimension checks;
- FX consistency;
- event chronology;
- calibration/method validity for measurements;
- reconciliation to control totals/documents;
- positive, boundary and negative tests;
- anti-gaming checks.

### Publication contract

Published observations should carry at least:

`kpi_id, formula_version, organisation_id, period_start, period_end/as_of, grain keys, value, canonical_uom, display_scale, data_quality_status, source_snapshot/run_id, calculated_at, restatement_id`.

## 3. Universal calculation procedure

1. Resolve canonical KPI ID; aliases never calculate independently.
2. Resolve immutable formula version effective for the reporting date.
3. Freeze organisation/business perimeter.
4. Build the minimum-grain eligible population.
5. Resolve case/event identity and governed timestamps.
6. Map logical variables to physical source fields.
7. Validate keys and join cardinality before aggregation.
8. Normalize UOM, currency, FX date, timezone and master-data versions.
9. Remove only contract-defined duplicates; do not use `DISTINCT` as a universal repair tool.
10. Calculate the primitive at the minimum grain.
11. Aggregate using the KPI-specific aggregation contract.
12. Apply zero/null/missing/invalid policy.
13. Validate mathematical range and unit algebra.
14. Reconcile to governed control totals/documents.
15. Run positive, boundary and negative fixtures.
16. Record data-quality status and lineage.
17. Obtain owner/steward UAT where required.
18. Publish observation plus metadata; never publish a bare number.

## 4. Canonical mathematical patterns

### Share / proportion

`share = SUM(eligible_subset) / SUM(eligible_population)`

For a true subset share, numerator must be a subset of denominator and the normal range is 0..1. Store `0.853`, display `85.3%`.

### Ratio of sums, not average of percentages

Line A: `9 / 10 = 90%`.  
Line B: `400 / 500 = 80%`.

Wrong: `(90% + 80%) / 2 = 85%`.  
Correct: `(9 + 400) / (10 + 500) = 80.196%`.

### Normalized event rate

`rate = SUM(events) / SUM(exposure) * K`.

`K` is part of the KPI definition. `K=100` does not automatically make the result a percentage. DHU is a classic example.

### DHU vs defective-unit rate

`DHU = defect_events / inspected_units * 100`.

130 defects on 100 inspected units = **130 defects per 100 units**. This can exceed 100 because one unit may have several defects.

`defective_unit_rate = unique_units_with_at_least_one_defect / inspected_units`.

42 defective units out of 100 = **42%**. These KPI must never share the same upper-bound validation.

### Duration

`duration_i = end_timestamp_i - start_timestamp_i` for an explicitly defined completed-case population. Mean, P50 and P90 are separate KPI.

An SLA-compliance denominator normally uses the **due cohort**, not only closed cases; otherwise open overdue cases disappear and the KPI is biased upward.

### Percentile

Compute from raw observations using the governed quantile method. Never average P90 values of departments/factories to obtain an enterprise P90.

### Weighted mean

`weighted_mean = SUM(value_i * weight_i) / SUM(weight_i)`.

The weight basis must be explicit and dimensionally consistent.

### OEE

`Availability = RunTime / PlannedProductionTime`  
`Performance = IdealCycleTime * TotalCount / RunTime`  
`Quality = GoodCount / TotalCount`  
`OEE = Availability * Performance * Quality`

Components are stored as decimals. Example: `0.8750 * 0.9048 * 0.9671 = 0.7657 = 76.57%`.

### Forecast error

`WAPE = SUM(ABS(Forecast-Actual)) / SUM(ABS(Actual))`  
`Bias = SUM(Forecast-Actual) / SUM(ABS(Actual))`

Accuracy score, WAPE and bias are different outputs and should not be silently substituted for each other.

### Financial days

`financial_days = average_balance / period_flow * days_in_period`.

Average-balance policy must be versioned: daily average is preferable when available; opening/closing average is an approximation and must be declared as such.

### Cash conversion cycle

`CCC = DIO + DSO - DPO`.

DIO, DSO and DPO must be recomputed on the same entity, currency/accounting perimeter and period basis. CCC is a balance-and-flow derived KPI, not a snapshot that can be summed over time.

### Sell-through

A stock-based form is `sales_units / (sales_units + ending_inventory_units)`.

This combines a period flow with an ending balance. It is non-additive across time and must be recomputed at the target perimeter.

### CPM

`CPM = media_cost / impressions * 1000`.

The numerator is media cost. A generic `event_count / exposure * 1000` template is incorrect for CPM.

### Wastewater removal efficiency

`removal_efficiency = (influent_load - effluent_load) / influent_load`.

Influent and effluent loads must be matched to the same treatment boundary and governed time window. Generic signed-change logic is not a substitute.

## 5. Zero, N/A, missing and invalid are different states

- `0`: valid observation, true value is zero.
- `N/A`: metric is mathematically or semantically not applicable.
- `MISSING`: required source data is absent.
- `INVALID/DQ_ERROR`: data exists but violates the KPI contract.

Example for `defective_units / inspected_units`:

- `0 / 100 -> 0%`;
- `0 / 0 -> N/A`;
- missing inspected count -> `MISSING`;
- `5 / 0 -> INVALID`, because defects exist without registered inspection exposure.

## 6. Directionality and target semantics

Directionality is part of the definition, not a dashboard decoration.

- favorable coverage/compliance/success share: normally higher is better;
- defect/exception/loss/overdue share: normally lower is better;
- stock cover, calendar loading and similar capacity/inventory measures: often target-band or context-dependent;
- signed variances: sign-dependent;
- diagnostic measures: no automatic red/green judgement.

Guardrails must be explicit. For example, higher sell-through is favorable only when margin, markdown and availability constraints are respected. Calendar loading should not be blindly maximized because maintenance and resilience require capacity headroom.

## 7. Important V14 semantic corrections

V14 adds a stricter semantic pass over the 1,290-definition catalog. Key corrections include:

- `HRS-034 Incident investigation on time`: numerator is on-time investigations, therefore **higher is better**, not lower.
- `MKT-049 Recommendation index`: `% promoters - % detractors`; **higher is better**.
- `MKT-007 CPM`: SQL/DAX must use `media_cost / impressions * 1000`, not a generic event count.
- `MNT-031 Calendar loading`: capacity-window KPI with target-band/context semantics, not a due-cohort SLA and not blind maximization.
- `PRD-020 Good output yield`: period flow with opening/closing WIP bridge, not a pure snapshot.
- `FIN-037 Cash conversion cycle`: balance-and-flow derived KPI, not a snapshot balance.
- `WHL-016 Partner sell-through` and `RMA-026 Resale sell-through`: flow plus ending balance; non-additive across time.
- `ESG-033/035/037 COD/BOD/TSS removal efficiency`: matched influent/effluent load formula, not generic signed change.
- multiple previously diagnostic positive coverage/yield/retention KPI now carry explicit favorable-high semantics; adverse claim/overdue/damage KPI carry favorable-low semantics.

The catalog still keeps contextual guardrails where a universal maximize/minimize rule would be misleading.

## 8. Blocked parents and aliases

A blocked umbrella definition is documentation only. It must not emit observations. Typical reasons:

- mixed UOM (`kg or L`);
- mixed business objects (`units or orders`);
- physical and monetary basis in one KPI;
- multiple alternative denominators;
- ambiguous scope/boundary.

Split it into canonical child KPI with one basis each.

An alias resolves to a canonical KPI ID and must not calculate independently. This prevents double counting and definition drift.

## 9. SYNTH-V2 implementation model

The repository already has modular PLM/production/commercial domains. KPI implementation should remain a separate governed analytics layer rather than leaking metric logic into UI modules.

Recommended components:

- `kpi_definition`: versioned semantic contract;
- `kpi_source_mapping`: logical variable -> physical field/event adapter;
- `kpi_observation`: calculated value plus grain/time/UOM metadata;
- `kpi_run`: calculation run, source snapshot and restatement lineage;
- `kpi_quality_result`: validation/reconciliation results;
- `kpi_threshold_version`: warning/blocking/target-band policy;
- `kpi_dependency`: parent/component dependency graph;
- `kpi_test_fixture`: positive/boundary/negative fixtures.

Cross-module access must respect the repository rule that module boundaries are exposed through `public.mjs`. KPI computation should consume governed domain/application interfaces or read models, not reach into another module's private implementation.

Business mutations, if KPI workflows create approvals/threshold changes/restatements, must follow SYNTH-V2 durable command IDs and transactional-outbox conventions.

## 10. Suggested domain adapters

Initial mapping priorities for existing SYNTH-V2 modules:

- `catalog`, `collections`, `styles`, `materials`, `bom`, `measurements`, `samples`, `tech-packs`: product/PLM and development KPI;
- `sourcing`, supplier/counterparty relationships: supplier, RFQ, purchase, claim and sourcing KPI;
- `production-orders`, `production-execution`, `final-quality`: production, WIP, yield, cycle-time, quality and release KPI;
- `orders`, `commercial-cycle`, `deal-space`, showrooms/selections: wholesale/order KPI;
- calendar and notifications: due-cohort/SLA event support;
- external adapters/read models: ERP/GL, WMS, TMS/customs, POS, e-commerce, marketplace, CRM/CDP, EHS/ESG, metering and laboratory systems.

Do not invent physical fields. A mapping is complete only when the real source schema/event is known and tested.

## 11. Release gates

A KPI is `PRODUCTION_READY` only when all applicable gates pass:

1. canonical ID and active formula version;
2. no unresolved umbrella/alias ambiguity;
3. explicit grain/population/event-time contract;
4. dimensional consistency;
5. physical source mapping complete;
6. key/cardinality/referential checks pass;
7. calculation primitive and aggregation tests pass;
8. reconciliation passes within approved tolerance;
9. positive/boundary/negative fixtures pass;
10. data-quality state is publishable;
11. owner/data-steward UAT complete;
12. publication metadata and restatement lineage are available.

Until then the correct status is conditional/pending mapping, not a decorative `READY`.

## 12. Catalog numbers for V14

The governed source workbook contains 1,290 definitions inherited from V13: 1,191 active calculation KPI, 90 blocked umbrella definitions and 9 aliases. V14 keeps the population stable and improves semantics rather than adding metrics for volume alone.

The full Excel catalog remains the audit artifact; this repository documentation is the implementation contract for SYNTH-V2. The next implementation step is to materialize physical mappings and executable SQL/DAX/read-model calculations domain by domain.