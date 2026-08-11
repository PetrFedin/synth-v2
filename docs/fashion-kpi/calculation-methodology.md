# SYNTH-V2 Fashion KPI Calculation Methodology

Status: governed project methodology.  
Scope: PLM, sourcing, production, quality, costing, logistics, wholesale, retail, e-commerce, CRM, ESG, traceability and data governance.

This document defines **how** SYNTH-V2 must calculate a KPI. The catalog gives the individual definition; this methodology defines the common calculation semantics that every implementation must obey.

## 1. KPI is a governed calculation contract

A KPI is considered fully specified only when the following chain is complete:

`business question -> measurement object -> grain -> eligible population -> event/time basis -> inputs -> formula -> unit algebra -> aggregation -> controls -> publication`.

A formula without population, time and grain is incomplete. A dashboard value without source lineage and formula version is not a governed observation.

## 2. Required calculation layers

### 2.1 Business layer

Define:

- the decision the KPI supports;
- the accountable owner;
- the data steward;
- whether higher, lower, a target band, a sign or a diagnostic interpretation is favorable;
- explicit guardrails.

Example: sell-through may be favorable when higher, but must be read together with margin, markdown and availability; therefore the KPI must not be used as a single-objective optimization target.

### 2.2 Semantic layer

Define one measurement object and one minimum grain.

Examples:

- `StyleID x ColorID x SizeID x FactoryID x WorkOrderID x ProductionDate`;
- `SupplierID x PurchaseOrderID x POLineID`;
- `InspectionID x DefectCode`;
- `ShipmentID x LegID`;
- `CampaignID x ChannelID x Day`.

Do not use ambiguous grain text such as `PO or MO`. Use a governed event/object key plus a `source_document_type` dimension if several source documents are valid.

### 2.3 Population layer

The eligible population must be constructed **before** calculating numerator and denominator.

Define:

- inclusion conditions;
- exclusion conditions;
- cancellation/reopen rules;
- due-cohort or as-of rules;
- distinctness key;
- boundary/perimeter.

For SLA compliance, use the due cohort unless the metric explicitly measures completed-case duration.

Example:

`OnTimeRate = CasesClosedOnTime / CasesDueInPeriod`.

If 10 cases were due, 7 closed on time, 1 late and 2 remain overdue-open, result is `7/10 = 70%`; using only closed cases would incorrectly give `7/8 = 87.5%`.

### 2.4 Temporal layer

Every KPI must be assigned to one temporal class.

Governed classes include:

- `PERIOD_FLOW` — additive events over a period;
- `PERIOD_EXPOSURE` — time/quantity exposure accumulated over a period;
- `POINT_IN_TIME_SNAPSHOT` — stock/state at an as-of timestamp;
- `DUE_COHORT` — cases whose SLA due date falls in the period;
- `COMPLETED_CASE_COHORT` — completed cases used for duration statistics;
- `OPEN_AS_OF_COHORT` — cases still open at the as-of timestamp;
- `BALANCE_AND_FLOW_DERIVED` — average balance plus period flow, e.g. DIO/DSO/DPO/CCC;
- `FLOW_PLUS_ENDING_BALANCE` — e.g. sell-through;
- `OPENING_CLOSING_BRIDGE` — period flow reconciled to opening/closing WIP or inventory;
- `FORECAST_EVALUATION_WINDOW` — forecast issue date, horizon and actual window;
- `MATCHED_INPUT_OUTPUT_WINDOW` — e.g. influent/effluent treatment efficiency;
- `PROJECT_COHORT` — project-based financial or development KPI.

Snapshot KPI are not additive across time. Percentages from different snapshots must not be summed.

### 2.5 Mathematical layer

Every active KPI must declare exactly one calculation primitive or an explicit composite expression.

Common primitives:

- `RATIO_OF_SUMS`;
- `TRUE_SUBSET_SHARE`;
- `NORMALIZED_EVENT_RATE`;
- `UNIT_RATE`;
- `WEIGHTED_MEAN`;
- `DISTINCT_COUNT`;
- `MEAN_DURATION`;
- `PERCENTILE`;
- `SIGNED_RELATIVE_CHANGE`;
- `ABSOLUTE_RELATIVE_ERROR`;
- `WAPE`;
- `BIAS`;
- `CV`;
- `PRODUCT_OF_COMPONENTS`;
- `FINANCIAL_DAYS`;
- `ADDITIVE_FLOW`;
- `SNAPSHOT_VALUE`;
- `BALANCE_BRIDGE`;
- `COMPOSITE_EXPRESSION`.

## 3. Formula patterns

### 3.1 True subset share

`share = SUM(subset) / SUM(eligible_population)`

Rules:

- numerator must be a subset of denominator;
- both must use the same unit and population perimeter;
- normal mathematical range: `0..1`;
- store as decimal; render as percentage.

Example: 92 compliant lots out of 100 inspected lots -> `0.92`, displayed `92%`.

If numerator > denominator, raise a DQ error unless the KPI is not actually a true share.

### 3.2 Ratio of sums

`ratio = SUM(numerator) / SUM(denominator)`

Do not average row-level percentages unless the KPI contract explicitly defines an equal-weight mean of ratios.

Example:

- line A: 9 good / 10 total = 90%;
- line B: 400 good / 500 total = 80%.

Correct combined rate: `409/510 = 80.196%`, not 85%.

### 3.3 Unit rate

`unit_rate = SUM(resource_or_time) / SUM(output_or_exposure)`.

Example actual cycle time:

`SUM(ProductiveMinutes) / SUM(GoodUnits)`.

For 480 minutes and 120 good units -> `4 min/unit`.

### 3.4 Normalized event rate

`rate = SUM(events) / SUM(exposure) * K`.

`K` is part of the formula version.

Examples:

- DHU: `DefectEvents / InspectedUnits * 100` -> defects per 100 inspected units;
- LTIFR: `LostTimeInjuries / HoursWorked * 1,000,000`.

Do not format a normalized frequency automatically as `%`.

### 3.5 Weighted mean

`weighted_mean = SUM(value_i * weight_i) / SUM(weight_i)`.

The weight unit and basis must be fixed. A quantity-weighted KPI cannot silently become value-weighted at another aggregation level.

### 3.6 Mean duration

For eligible completed cases:

`duration_i = end_i - start_i`  
`mean = SUM(duration_i) / COUNT(case_i)`.

Start/end event IDs, timezone, calendar, reopen and cancellation rules are mandatory.

### 3.7 Percentile

Percentiles must be recomputed from raw observations at the target perimeter. Never average departmental/factory P90 values.

The quantile method must be versioned. SYNTH-V2 default internal method: continuous linear interpolation unless the KPI definition states otherwise.

### 3.8 CV

`CV = SD / ABS(mean)`.

The contract must specify:

- sample or population standard deviation;
- materiality floor for a near-zero mean;
- minimum sample size if applicable.

If `ABS(mean) < materiality_floor`, return `N/A` unless a separately named stabilized metric is defined.

### 3.9 WAPE and bias

`WAPE = SUM(ABS(Forecast-Actual)) / SUM(ABS(Actual))`.

`Bias = SUM(Forecast-Actual) / SUM(ABS(Actual))`.

Do not replace WAPE with average row-level APE.

A bounded accuracy score may be defined as `MAX(0, 1-WAPE)`, but it is a different output and must not replace WAPE and bias in diagnostics.

### 3.10 Financial days

`days = average_balance / period_flow * days_in_period`.

Examples:

- DIO: average inventory / COGS * days;
- DSO: average receivables / credit sales or governed revenue flow * days;
- DPO: average payables / governed purchase flow * days.

The average-balance method must be versioned: daily average preferred; opening-closing average is an explicit approximation.

### 3.11 Cash conversion cycle

`CCC = DIO + DSO - DPO`.

All components must use one currency, entity perimeter, period basis and accounting policy.

### 3.12 OEE

`Availability = RunTime / PlannedProductionTime`  
`Performance = IdealCycleTime * TotalCount / RunTime`  
`Quality = GoodCount / TotalCount`  
`OEE = Availability * Performance * Quality`.

Components are decimals, not percentage-formatted numbers.

### 3.13 Sell-through

A stock-based form:

`SellThrough = SalesUnits / (SalesUnits + EndingInventoryUnits)`.

This is `FLOW_PLUS_ENDING_BALANCE`, non-additive across time. Recompute from components at the requested perimeter.

### 3.14 CPM

`CPM = MediaCost / Impressions * 1000`.

Currency, media-cost inclusion and impression source must be fixed by contract.

### 3.15 Treatment removal efficiency

`RemovalEfficiency = (InfluentLoad - EffluentLoad) / InfluentLoad`.

Input and output load must be matched to the same treatment boundary and compatible time window. If influent load is zero, apply the explicit zero rule rather than dividing by zero.

## 4. Dimensional analysis

Before calculating a KPI, validate unit algebra.

Allowed examples:

- `kg/kg -> dimensionless`;
- `currency/units -> currency/unit`;
- `minutes/units -> min/unit`;
- `events/hours * K -> events per K hours`;
- `m2/m2 -> dimensionless`.

Blocked examples:

- `kg + L` without density conversion;
- `units / currency` when the KPI is described as a percentage;
- `m or currency` in one canonical UOM;
- numerator in orders and denominator in units for a true share.

UOM conversion must occur before aggregation and must use a versioned conversion source.

## 5. Currency and FX

A monetary KPI must define:

- transaction currency;
- reporting currency;
- FX source;
- rate type;
- rate date/time;
- treatment of hedging where relevant;
- restatement rule.

Supplier-price variance and FX variance must be separated when management requires independent diagnosis.

## 6. Zero/null/error semantics

Four states are mandatory:

- `ZERO`: valid result equals zero;
- `NOT_APPLICABLE`: denominator/population makes the KPI semantically inapplicable;
- `MISSING`: required source value does not exist;
- `INVALID`: data exists but violates the contract.

Example: defective units / inspected units:

- `0/100 -> ZERO`;
- `0/0 -> NOT_APPLICABLE`;
- missing inspected count -> `MISSING`;
- `5/0 -> INVALID`.

Do not coalesce these states to zero in the calculation engine or BI layer.

## 7. Aggregation semantics

Declare additivity along both entity and time axes.

Examples:

- period revenue: additive over non-overlapping time and entity scopes, subject to currency/perimeter controls;
- ratio/share: non-additive; aggregate components then recalculate;
- ending inventory: additive across compatible entities at one timestamp but non-additive across time;
- distinct reach: non-additive across overlapping identity sets;
- percentile: non-additive in both axes;
- CCC: derived, non-additive.

The observation layer should store components or lineage references when recomputation is required at higher aggregation levels.

## 8. Directionality

Allowed goal semantics:

- `MAXIMIZE`;
- `MINIMIZE`;
- `TARGET_BAND`;
- `AT_LEAST`;
- `AT_MOST`;
- `SIGN_DEPENDENT`;
- `DIAGNOSTIC`.

Directionality must be stored in the definition and threshold version, never inferred only from a dashboard label.

## 9. Anti-gaming requirements

For each KPI, document at least one manipulation risk when material.

Examples:

- SLA: excluding overdue-open cases;
- defect rate: moving defective units to WIP or second quality before denominator cut-off;
- inventory: changing snapshot timing;
- sell-through: reducing denominator by stock transfers;
- productivity: shifting rework or idle minutes outside the measured window;
- forecast accuracy: changing horizon after actuals become known.

The control may be a reconciliation, frozen cohort, source-system immutability rule, anomaly check or audit sample.

## 10. Restatement

A historical KPI observation may change only through a governed restatement process.

Restatement metadata must identify:

- original run;
- replacement run;
- reason code;
- formula version;
- source watermark/snapshot;
- affected periods;
- approver where required.

Never silently overwrite a published historical observation.

## 11. Publication minimum

A published KPI observation must contain or resolve to:

- KPI ID;
- formula version;
- organisation scope;
- period/as-of;
- grain dimensions;
- numeric value;
- canonical UOM;
- display rule;
- DQ status;
- run/source snapshot;
- calculated timestamp;
- restatement lineage;
- threshold/goal version when visual status is shown.

A bare number is not a publishable observation.
