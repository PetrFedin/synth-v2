# SYNTH-V2 Fashion KPI Governance

Repository methodology version: **16.0**  
Catalog baseline: **V14, 1,290 governed definitions**  
Native executable bundle: **V16, repository-bound KPI subset**

This directory is the source of truth for how SYNTH-V2 defines, calculates, maps, validates, reconciles and publishes fashion KPI.

The Excel catalog and the repository methodology have different version purposes:

- **catalog baseline V14** identifies the broad 1,290-definition fashion KPI universe (1,191 active calculation KPI, 90 blocked umbrellas, 9 aliases);
- **repository methodology V16** defines how SYNTH-V2 implements that universe safely and already binds an initial subset to real immutable platform sources.

Do not infer that every catalog KPI is already implemented. A KPI becomes production-ready only after all applicable source, calculation, reconciliation and UAT gates pass.

## Start here

| File | Purpose |
|---|---|
| [`calculation-methodology.md`](calculation-methodology.md) | Mathematical primitives, aggregation, temporal semantics, UOM, zero/null/error, anti-gaming and restatement |
| [`data-contracts.md`](data-contracts.md) | Grain, population, event identity, lineage, mapping, join/cardinality and publication contracts |
| [`testing-and-release.md`](testing-and-release.md) | Definition/calculation/population/reconciliation tests and release gates |
| [`kpi-contract.schema.json`](kpi-contract.schema.json) | Machine-readable KPI contract schema |
| [`governance-rules.json`](governance-rules.json) | Machine-readable governance vocabulary and invariants |
| [`native-source-contracts.json`](native-source-contracts.json) | Verified mappings to actual SYNTH-V2 economics/fulfillment source code and persistence contracts |
| [`native-kpi-bundles.json`](native-kpi-bundles.json) | First repository-native KPI definitions using those mappings |
| [`costing-economics-methodology.md`](costing-economics-methodology.md) | Actual cost, FX, reversals, landed cost, margin, allocation and cost-close rules |
| [`fulfillment-quality-methodology.md`](fulfillment-quality-methodology.md) | Fulfillment plan, shipment, receipt, discrepancy, shortage/overage and due-cohort rules |
| [`reconciliation-matrix.md`](reconciliation-matrix.md) | Hard identities, tolerance controls, scale/currency/snapshot and publication gates |
| [`syntha-v2-integration.md`](syntha-v2-integration.md) | Target architecture for definition, mapping, run, observation and DQ persistence |
| [`implementation-checklist.md`](implementation-checklist.md) | Domain-by-domain implementation checklist |
| [`examples/core-kpis.json`](examples/core-kpis.json) | Generic governed examples |
| `src/modules/kpi-governance/public.mjs` | Executable central KPI/DQ primitives |
| `tests/kpi-governance-domain.test.mjs` | Regression tests for executable methodology |
| `scripts/validate-fashion-kpi.mjs` | Repository drift/governance validator used by `npm run verify` |

## Core rule

A KPI is not a label plus a formula.

A governed KPI is the combination of:

`business meaning -> semantic grain -> eligible population -> event/time contract -> mathematical primitive -> numerator/denominator -> UOM/scale -> aggregation -> source lineage -> controls -> publication metadata`.

Two calculations using the same KPI ID, formula version, perimeter and governed source snapshot must reproduce the same result.

## Contract layers

Every active KPI must define, as applicable:

### Business

- stable KPI ID;
- canonical RU/EN name;
- definition and decision use;
- owner and data steward;
- directionality/goal function;
- management guardrails.

### Semantic

- measurement object;
- minimum grain;
- case/event identity;
- eligible population;
- inclusion/exclusion;
- distinctness key;
- alias/split relationship.

### Mathematical

- immutable formula version;
- calculation primitive;
- explicit inputs/numerator/denominator;
- normalizer `K` when applicable;
- range/sign contract;
- denominator-zero behavior.

### Dimensional

- input/output UOM;
- unit algebra;
- conversion version;
- currency/FX basis;
- storage scale;
- display scale.

### Temporal

Examples of governed classes:

- period flow/exposure;
- point-in-time snapshot;
- due cohort;
- completed-case cohort;
- open-as-of cohort;
- balance + flow derived;
- flow + ending balance;
- opening/closing bridge;
- forecast evaluation window;
- matched input/output window;
- project/order cohort.

Event time, as-of, timezone/calendar, late-data and restatement behavior are part of KPI meaning.

### Aggregation

The contract must say whether the KPI is:

- additive;
- semi-additive;
- non-additive;
- ratio of sums;
- weighted mean;
- distinct count;
- percentile recomputed from raw observations;
- product of components;
- snapshot/as-of value;
- composite expression.

Never default to `AVG(precalculated_percentage)` for ratio KPI.

### Data/source

Logical inputs resolve through:

`source system -> schema/table/topic -> field/event -> datatype -> key -> join cardinality -> timestamp -> filter -> UOM/FX conversion`.

For repository-native sources, mappings are versioned in `native-source-contracts.json` and validated against current code/migration history. If a mapped source changes, the contract must change in the same PR.

### Control

Typical controls include:

- zero denominator;
- duplicate event;
- referential integrity;
- join cardinality;
- subset validation;
- UOM/dimension;
- FX consistency;
- event chronology;
- calibration/method validity;
- reconciliation identity/control total;
- positive/boundary/negative fixtures;
- anti-gaming.

### Publication

A published observation must carry enough metadata to reconstruct it, including at least:

`kpi_id, formula_version, organisation, period/as_of, grain keys, numeric value, canonical_uom, data_quality_status, source/run lineage, calculated_at, restatement lineage`.

A formatted dashboard string is not a sufficient stored KPI fact.

## Universal calculation sequence

1. Resolve canonical KPI ID. Alias never calculates independently.
2. Resolve formula version effective for the reporting basis.
3. Freeze organisation/business perimeter.
4. Build minimum-grain eligible population.
5. Resolve case/event identity and governed timestamps.
6. Resolve logical inputs to physical source contracts.
7. Validate keys and expected join cardinality.
8. Normalize UOM, currency, FX, timezone and master-data versions.
9. Apply contract-defined deduplication only.
10. Calculate primitive at minimum grain.
11. Aggregate using the KPI aggregation contract.
12. Apply zero/N/A/missing/invalid policy.
13. Validate unit algebra and mathematical range.
14. Reconcile to hard identities/control totals where applicable.
15. Execute positive, boundary and negative fixtures.
16. Persist DQ/reconciliation results.
17. Complete owner/data-steward UAT where required.
18. Publish observation plus lineage metadata.

## Data states are not interchangeable

- `ZERO`: valid observed value equals zero.
- `VALUE`: valid non-zero value.
- `NOT_APPLICABLE`: mathematically/semantically not applicable for the population.
- `MISSING`: required governed source input is absent.
- `INVALID`: data exists but violates the contract.

Example for `DefectiveUnits / InspectedUnits`:

- `0 / 100 -> ZERO, value 0`;
- `0 / 0 -> NOT_APPLICABLE`;
- missing inspection exposure -> `MISSING`;
- `5 / 0 -> INVALID`.

Never coalesce all four non-value conditions to zero.

## Canonical mathematical patterns

### Ratio of sums

Line A: `9 / 10 = 90%`.  
Line B: `400 / 500 = 80%`.

Wrong rollup:

`(90% + 80%) / 2 = 85%`.

Correct:

`(9 + 400) / (10 + 500) = 80.196%`.

### Normalized event rate

`Rate = SUM(Events) / SUM(Exposure) * K`.

`K` is part of the formula definition. A normalizer of 100 does not automatically make the metric a percentage.

### DHU vs defective-unit rate

`DHU = DefectEvents / InspectedUnits * 100`.

130 defects on 100 inspected units = **130 defects per 100 units**. It may exceed 100.

`DefectiveUnitRate = UniqueDefectiveUnits / InspectedUnits`.

42 defective units out of 100 = **42%**. It is a true subset share and cannot exceed 100% under valid data.

### Duration vs SLA compliance

Duration normally uses completed cases:

`Duration_i = EndTimestamp_i - StartTimestamp_i`.

SLA compliance normally uses a due cohort. Open overdue cases remain in the denominator. Closed-only SLA is prohibited because it creates survivorship bias.

### Percentile

Recompute from raw observations under the governed quantile method. Do not average department/factory P90 values to obtain enterprise P90.

### Weighted mean

`WeightedMean = SUM(Value_i * Weight_i) / SUM(Weight_i)`.

Weight definition/UOM is part of the KPI contract.

### OEE

`Availability = RunTime / PlannedProductionTime`  
`Performance = IdealCycleTime * TotalCount / RunTime`  
`Quality = GoodCount / TotalCount`  
`OEE = Availability * Performance * Quality`

Components are decimal ratios. Example:

`0.8750 * 0.9048 * 0.9671 = 0.7657 -> 76.57%`.

### Forecast error

`WAPE = SUM(ABS(Forecast-Actual)) / SUM(ABS(Actual))`

`Bias = SUM(Forecast-Actual) / SUM(ABS(Actual))`

WAPE, bias and any derived accuracy score are separate outputs.

### Financial days

`FinancialDays = AverageBalance / PeriodFlow * DaysInPeriod`.

Average-balance method must be versioned. Daily average and `(opening+closing)/2` approximation are not silently interchangeable.

### Sell-through

A stock-based form:

`SalesUnits / (SalesUnits + EndingInventoryUnits)`.

This mixes period flow with ending balance and is non-additive across time.

### CPM

`CPM = MediaCost / Impressions * 1000`.

A generic event-count formula is wrong because the numerator is money.

## Native V16 layer

V16 binds the first KPI subset to real SYNTH-V2 immutable sources in order economics and fulfillment.

The source chain currently includes:

`OrderCommit -> SupplyCommitment -> ActualCostLedger -> LandedCost -> MarginActualization -> CostAllocation -> CostCloseReadiness`

and:

`FulfillmentPlan -> ShipmentNotice -> Receipt -> ReceiptDiscrepancy`.

For physical actual cost, immutable shipment/receipt lineage is also attached to cost ledger entries.

### Critical contribution-margin scale contract

Current order-economics `contributionMarginPercent` is produced on a **0-100 percentage-points scale** because the shared money helper multiplies a ratio by 100.

Canonical KPI storage for contribution margin ratio remains decimal:

`ContributionMarginRatio = ContributionMarginAmount / NetRevenue`.

Example:

- revenue = 1,000;
- margin amount = 240;
- canonical KPI = `0.24`;
- display = `24.00%`;
- native source percentage mirror = `24.0000`;
- reconciliation = `24.0000 / 100 = 0.24`.

Copying native `24.0000` directly into a decimal-ratio observation would create a 100x error when percent-formatted and is explicitly prohibited/tested.

### Receipt quality identity

Native receipt line:

`Accepted = Received - Damaged - Rejected`.

At a valid aggregate perimeter:

`SUM(Accepted) + SUM(Damaged) + SUM(Rejected) = SUM(Received)`.

Acceptance, damage and rejection rates are computed from the summed quantities, not averaged line percentages.

### Finalized shortage

Shortage is recognized by the native discrepancy model only when the receipt sequence is finalized:

`Shortage = finalized ? MAX(Shipped - Received, 0) : 0`.

For the governed shortage KPI, non-finalized snapshots are **NOT_APPLICABLE**, not “zero shortage”. Use one latest finalized discrepancy snapshot per shipment.

### Overage

`Overage = MAX(Received - Shipped, 0)`.

`Overage / Shipped` is not a true subset share and may exceed 1. Do not silently cap it at 100%.

### On-time final receipt

Denominator is all distinct shipment deadlines due in the reporting cohort. Open overdue shipments remain failures in the denominator.

Example: 10 due; 7 on-time, 1 late, 2 still open overdue.

Wrong closed-only result: `7/8 = 87.5%`.  
Correct governed result: `7/10 = 70%`.

## Release states

A useful staged lifecycle is:

`DRAFT -> DEFINED -> MAPPING_PENDING -> MAPPED_UNVERIFIED -> VALIDATION_PENDING -> UAT_PENDING -> PRODUCTION_READY`.

Separate non-publishing states exist for blocked umbrellas and aliases.

A physical mapping being `VERIFIED` means the source path exists and is governed. It does **not** by itself make the KPI production-ready.

Production readiness additionally requires, as applicable:

- formula/population/time tests;
- reconciliation;
- DQ controls;
- owner/steward UAT;
- restatement/publication readiness.

## Repository enforcement

`npm run verify` includes `scripts/validate-fashion-kpi.mjs`.

The validator checks, among other things:

- required methodology artifacts;
- governed vocabularies;
- unique KPI/source-contract IDs;
- active contract completeness;
- native source-file existence;
- native persistence/migration existence;
- required source tokens and runtime fields;
- native input mapping resolution;
- mapping status;
- due-cohort anti-gaming language;
- percentage scale normalization;
- mandatory methodology/testing sections.

`tests/kpi-governance-domain.test.mjs` also executes the central calculation/DQ primitives.

The purpose is deliberate: source/model drift should fail repository verification rather than silently changing a KPI after deployment.

## What is not yet claimed

The broad 1,191 active catalog KPI are **not** all production-ready in SYNTH-V2.

V16 verifies an initial repository-native economics/fulfillment subset. PLM, sourcing, production execution, quality and external ERP/WMS/TMS/POS/CRM/ESG adapters should be added domain by domain under the same contracts.

Do not invent external physical fields before their schemas are available.
