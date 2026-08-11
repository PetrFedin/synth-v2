# SYNTH-V2 Fashion KPI Governance

Repository methodology version: **17.0**  
Catalog baseline: **V14, 1,290 governed definitions**  
Native executable bundle: **V16, repository-bound KPI subset**  
Immutable registry layer: **V17**

This directory is the source of truth for how SYNTH-V2 defines, calculates, maps, validates, reconciles, versions and publishes fashion KPI.

The versions have different purposes:

- **catalog baseline V14** identifies the broad 1,290-definition universe (1,191 active calculation KPI, 90 blocked umbrellas, 9 aliases);
- **native bundle V16** binds the first economics/fulfillment subset to real immutable SYNTH-V2 sources and executable calculation primitives;
- **registry V17** makes KPI definitions, source mappings and semantic dependencies first-class immutable domain/persistence objects.

Do not infer that every catalog KPI is implemented or production-ready. `PRODUCTION_READY` remains an evidence-backed state, not a documentation label.

## Start here

| File / component | Purpose |
|---|---|
| [`calculation-methodology.md`](calculation-methodology.md) | Mathematical primitives, aggregation, temporal semantics, UOM, zero/null/error, anti-gaming and restatement |
| [`data-contracts.md`](data-contracts.md) | Grain, population, event identity, lineage, mapping, join/cardinality and publication contracts |
| [`testing-and-release.md`](testing-and-release.md) | Definition/calculation/population/reconciliation tests and release gates |
| [`registry-model.md`](registry-model.md) | Immutable definition/mapping/dependency registry, version semantics and lifecycle |
| [`kpi-contract.schema.json`](kpi-contract.schema.json) | Machine-readable definition contract schema |
| [`governance-rules.json`](governance-rules.json) | Machine-readable governance vocabulary and invariants |
| [`native-source-contracts.json`](native-source-contracts.json) | Verified mappings to current SYNTH-V2 economics/fulfillment source code and persistence |
| [`native-kpi-bundles.json`](native-kpi-bundles.json) | First repository-native KPI definitions using those mappings |
| [`costing-economics-methodology.md`](costing-economics-methodology.md) | Actual cost, FX, reversals, landed cost, margin, allocation and cost-close rules |
| [`fulfillment-quality-methodology.md`](fulfillment-quality-methodology.md) | Shipment/receipt/discrepancy/shortage/overage/due-cohort rules |
| [`reconciliation-matrix.md`](reconciliation-matrix.md) | Hard identities, tolerance controls, scale/currency/snapshot and publication gates |
| [`syntha-v2-integration.md`](syntha-v2-integration.md) | Target architecture for definitions, mappings, runs, observations and DQ |
| [`implementation-checklist.md`](implementation-checklist.md) | Domain-by-domain implementation checklist |
| `src/modules/kpi-governance/public.mjs` | Executable calculation/DQ primitives |
| `src/modules/kpi-registry/public.mjs` | Immutable KPI definition/mapping/dependency domain |
| `src/infrastructure/postgres-kpi-registry-store.mjs` | PostgreSQL registry adapter |
| `db/migrations/044_kpi_registry.sql` | Durable immutable registry schema |
| `scripts/validate-fashion-kpi.mjs` | Methodology/native-source drift validator |
| `scripts/validate-kpi-registry.mjs` | Registry schema/domain/store/lifecycle validator |

## Core rule

A KPI is not a label plus a formula.

A governed KPI is:

`business meaning -> semantic grain -> eligible population -> event/time contract -> mathematical primitive -> numerator/denominator -> UOM/scale -> aggregation -> source lineage -> controls -> publication metadata`.

Two calculations using the same definition ID, mapping set, perimeter and governed source snapshot must reproduce the same result.

## Contract layers

Every active KPI defines, as applicable:

### Business

- stable KPI code;
- canonical RU/EN names;
- definition and decision use;
- owner/data steward;
- directionality and goal function;
- management guardrails.

### Semantic

- measurement object;
- minimum grain;
- case/event identity;
- eligible population;
- inclusion/exclusion;
- distinctness key;
- alias/split/component/driver relations.

### Mathematical

- immutable formula version;
- calculation primitive;
- explicit inputs/numerator/denominator;
- normalizer `K` where applicable;
- range/sign contract;
- denominator-zero behavior.

### Dimensional

- input/output UOM;
- unit algebra;
- conversion version;
- currency/FX basis;
- storage and display scales.

### Temporal

Governed classes include period flow/exposure, point-in-time snapshot, due cohort, completed-case cohort, open-as-of cohort, balance+flow derived, flow+ending balance, opening/closing bridge, forecast evaluation, matched input/output and project/order cohort.

Event timestamp, as-of, timezone/calendar, late-data and restatement behavior are part of KPI meaning.

### Aggregation

The contract must state whether the KPI is additive, semi-additive, non-additive, ratio-of-sums, weighted mean, distinct count, percentile from raw observations, product of components, snapshot/as-of or composite expression.

Never default to `AVG(precalculated_percentage)` for ratio KPI.

### Data/source

Logical inputs resolve through:

`source system -> entity/table/topic -> field/event -> datatype -> key -> join cardinality -> timestamp -> filter -> UOM/FX conversion`.

Repository-native mappings are governed in `native-source-contracts.json` and can then be materialized as versioned `kpi_source_mapping_versions` records.

### Control

Typical controls include zero denominator, duplicate event, referential integrity, join cardinality, subset validation, UOM/dimension, FX consistency, chronology, calibration/method validity, reconciliation identities, positive/boundary/negative fixtures and anti-gaming.

### Publication

A future observation must carry enough metadata to reconstruct it, including definition ID/formula version, organisation, period/as-of, grain keys, numeric value, canonical UOM, DQ status, source/run lineage, calculation time and restatement lineage.

A formatted dashboard string is not a sufficient stored fact.

## Universal calculation sequence

1. Resolve canonical KPI code and exact definition version.
2. Reject alias/blocked umbrella execution.
3. Freeze organisation/business perimeter.
4. Build minimum-grain eligible population.
5. Resolve case/event identity and governed timestamps.
6. Resolve logical inputs through one effective mapping set.
7. Validate keys and expected join cardinality.
8. Normalize UOM, currency, FX, timezone and master-data versions.
9. Apply contract-defined deduplication only.
10. Calculate primitive at minimum grain.
11. Aggregate using the definition contract.
12. Apply zero/N/A/missing/invalid policy.
13. Validate unit algebra and mathematical range.
14. Reconcile to hard identities/control totals where applicable.
15. Execute positive, boundary and negative fixtures.
16. Persist DQ/reconciliation evidence.
17. Complete owner/data-steward UAT where required.
18. Publish observation plus immutable lineage metadata.

## Data states are not interchangeable

- `ZERO`: valid observed value equals zero.
- `VALUE`: valid non-zero value.
- `NOT_APPLICABLE`: mathematically/semantically not applicable.
- `MISSING`: required governed source input is absent.
- `INVALID`: data exists but violates the contract.

For `DefectiveUnits / InspectedUnits`:

- `0 / 100 -> ZERO`;
- `0 / 0 -> NOT_APPLICABLE`;
- missing inspection exposure -> `MISSING`;
- `5 / 0 -> INVALID`.

Never coalesce these states into dashboard zero.

## Canonical calculation examples

### Ratio of sums

Line A: `9 / 10 = 90%`.  
Line B: `400 / 500 = 80%`.

Wrong: `(90% + 80%) / 2 = 85%`.

Correct: `(9 + 400) / (10 + 500) = 80.196%`.

### Normalized event rate

`Rate = SUM(Events) / SUM(Exposure) * K`.

`K` belongs to the definition. `K=100` does not automatically make the result a percentage.

### DHU vs defective-unit rate

`DHU = DefectEvents / InspectedUnits * 100`.

130 defects / 100 inspected units = **130 defects per 100 units** and may exceed 100.

`DefectiveUnitRate = UniqueDefectiveUnits / InspectedUnits`.

42 / 100 = **42%**; this is a true subset share.

### Duration vs SLA

Duration normally uses completed cases: `EndTimestamp - StartTimestamp`.

SLA compliance normally uses a **due cohort**. Open overdue cases remain in the denominator. Closed-only SLA is prohibited because it creates survivorship bias.

### OEE

`Availability = RunTime / PlannedProductionTime`  
`Performance = IdealCycleTime * TotalCount / RunTime`  
`Quality = GoodCount / TotalCount`  
`OEE = Availability * Performance * Quality`

`0.8750 * 0.9048 * 0.9671 = 0.7657 -> 76.57%`.

### WAPE and bias

`WAPE = SUM(ABS(Forecast-Actual)) / SUM(ABS(Actual))`

`Bias = SUM(Forecast-Actual) / SUM(ABS(Actual))`

They are separate outputs and must not be silently substituted by one generic accuracy score.

### Sell-through

A stock-based form is `SalesUnits / (SalesUnits + EndingInventoryUnits)`.

It combines period flow with ending balance and is non-additive across time.

### CPM

`CPM = MediaCost / Impressions * 1000`.

The numerator is money, not an event count.

## Native V16 execution layer

V16 binds the first KPI subset to existing immutable order-economics and fulfillment sources:

`OrderCommit -> SupplyCommitment -> ActualCostLedger -> LandedCost -> MarginActualization -> CostAllocation -> CostCloseReadiness`

and:

`FulfillmentPlan -> ShipmentNotice -> Receipt -> ReceiptDiscrepancy`.

Physical actual-cost entries can carry exact fulfillment/shipment/receipt lineage.

### Contribution-margin scale safeguard

Current native `contributionMarginPercent` is on a **0-100 percentage-points scale** because the money helper multiplies the ratio by 100.

Canonical KPI storage remains decimal:

`ContributionMarginRatio = ContributionMarginAmount / NetRevenue`.

Example: revenue 1,000, margin 240 -> canonical `0.24`, display `24.00%`, native source mirror `24.0000`; reconciliation is `24.0000 / 100 = 0.24`.

Copying native `24.0000` directly into a decimal ratio would create a 100x error and is explicitly prohibited/tested.

### Receipt identity

`Accepted = Received - Damaged - Rejected`.

At a valid aggregate perimeter:

`SUM(Accepted) + SUM(Damaged) + SUM(Rejected) = SUM(Received)`.

Acceptance/damage/rejection rates are calculated from summed quantities.

### Finalized shortage

Native discrepancy logic recognizes shortage only after receipt sequence finalization.

For the governed shortage KPI, non-finalized discrepancy snapshots are `NOT_APPLICABLE`, not “zero shortage”. Historical discrepancy versions must not be summed as independent facts.

### Overage

`Overage = MAX(Received - Shipped, 0)`.

`Overage / Shipped` is not a true subset share and can exceed 1. It must not be capped to 100%.

### On-time final receipt

Due-cohort denominator includes every shipment whose deadline is due in the period. Open overdue shipments remain in the denominator.

Example: 10 due, 7 on time, 1 late, 2 open overdue.

Wrong closed-only result: `7/8 = 87.5%`.  
Correct governed result: `7/10 = 70%`.

## Immutable V17 registry layer

V17 adds durable first-class registry objects:

- `kpi_definition_versions`;
- `kpi_source_mapping_versions`;
- `kpi_definition_dependencies`.

They are append-only. Database triggers reject `UPDATE` and `DELETE`.

### Formula version vs mapping-set version

This is a critical separation.

**New formula version** when business meaning changes: numerator, denominator, population, grain, time basis, UOM algebra, normalizer, aggregation, estimator or another semantic element.

**New mapping-set version** when the semantic KPI is unchanged but the physical field/table/topic/adapter changes.

Moving `ReceivedQuantity` from one governed source path to another is normally a mapping version. Changing denominator from received units to shipped units is a formula version.

### System vs organisation scope

System definitions are platform-governed and cannot be tenant-editable by default.

Organisation-specific definitions require an organisation ID and are reserved for genuine semantic variants. Different target values or dashboard visibility normally belong in policy/presentation, not cloned formulas.

### Dependency graph

`ALIAS_OF`, `SPLIT_FROM`, `COMPONENT_OF`, `DRIVER_OF`, `GUARDRAIL_OF` are version-to-version graph edges.

Alias and blocked umbrella definitions remain non-calculable. Source mappings are rejected for those roles by the domain layer.

### Production-ready assertion

The registry domain requires:

- calculable role;
- verified mapping set;
- calculation tests;
- population/time tests;
- reconciliation;
- owner UAT;
- data-steward UAT.

Physical mapping verification alone is not enough.

## Release lifecycle

Calculable definitions move through:

`DRAFT -> DEFINED -> MAPPING_PENDING -> MAPPED_UNVERIFIED -> VALIDATION_PENDING -> UAT_PENDING -> PRODUCTION_READY -> DEPRECATED`.

Blocked umbrellas and aliases use dedicated non-publishing states.

The registry stores immutable versions; it does not rewrite historical meaning in place.

## Repository enforcement

`npm run verify` now includes both:

- `validate:kpi-methodology` -> `scripts/validate-fashion-kpi.mjs`;
- `validate:kpi-registry` -> `scripts/validate-kpi-registry.mjs`.

The methodology validator protects source mappings, formula semantics, native input resolution, due-cohort safeguards and scale contracts.

The registry validator protects migration/domain/store/doc artifacts, immutability, dependency semantics and production-ready gates.

Tests additionally cover:

- executable KPI/DQ primitives;
- registry domain invariants;
- registry migration immutability;
- PostgreSQL registry-store import/read contract.

The intent is deliberate: semantic or source drift should fail repository verification instead of silently changing a dashboard after deployment.

## What is not yet claimed

The 1,191 active catalog KPI are not all production-ready.

V16 verifies an initial native economics/fulfillment subset. V17 persists semantic definitions/mappings/dependencies but does not yet persist calculation runs or observations.

PLM, sourcing, production execution, quality and external ERP/WMS/TMS/POS/CRM/ESG adapters should be added domain by domain. External physical fields must not be invented before their actual schemas are available.

The next persistence layer is calculation runs + observations + DQ/reconciliation + restatement lineage, each pinned to exact registry definition and mapping versions.
