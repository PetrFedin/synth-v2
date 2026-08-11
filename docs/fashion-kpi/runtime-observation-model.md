# SYNTH-V2 KPI Runtime Observation Model

Status: implementation specification following registry V17.

This document defines the next persistence boundary after the immutable KPI registry. It intentionally does not make observations part of the semantic registry tables.

## 1. Core separation

The platform must keep these histories separate:

1. **definition history** — what the KPI means;
2. **definition release history** — whether that definition is draft/ready/deprecated;
3. **physical mapping history** — where each logical input comes from;
4. **mapping verification history** — whether that path is verified/deprecated;
5. **calculation-run history** — when and from which source snapshot a calculation was executed;
6. **observation history** — calculated values at governed grain/time;
7. **DQ/reconciliation history** — whether those values passed controls;
8. **restatement history** — why a later run replaced or superseded a prior published run;
9. **threshold-policy history** — how values are interpreted against targets/warnings/blocks.

No single `version` or `status` column should represent more than one of these concerns.

## 2. `kpi_calculation_runs`

One reproducible execution attempt.

Suggested fields:

- `id` / run ID;
- `organisation_id`;
- `requested_by`;
- `command_id` for user-triggered runs;
- `definition_selection_policy`;
- exact list/hash of selected definition IDs;
- exact effective mapping-set IDs/hash;
- `period_start`, `period_end`, optional `as_of_timestamp`;
- reporting timezone/calendar version;
- source snapshot/watermark contract;
- calculation engine version/commit SHA;
- started/completed timestamps;
- run status;
- parent/superseded run ID for restatement;
- restatement reason/reference;
- input manifest hash;
- output manifest hash;
- immutable audit metadata.

A run must never mean “whatever data is current now”. It needs a recoverable source-snapshot/watermark basis.

## 3. `kpi_observations`

One calculated KPI fact at the governed publication grain.

Suggested fields:

- `id`;
- `run_id`;
- `kpi_definition_id`;
- `formula_version` copied for convenient audit but definition ID remains authoritative;
- `mapping_set_version` / effective mapping manifest reference;
- `organisation_id`;
- `period_start`, `period_end`, `as_of_timestamp`;
- governed grain JSONB or explicit dimension columns;
- `value_numeric`;
- `canonical_uom`;
- `data_state = VALUE | ZERO | NOT_APPLICABLE | MISSING | INVALID`;
- `data_quality_status`;
- numerator/denominator components when the KPI contract requires explainability;
- source snapshot ID/manifest hash;
- calculated timestamp;
- publication status;
- restatement lineage.

Do not store only formatted strings such as `96.4%`.

For decimal percentages, store `0.964`; formatting into `96.4%` is presentation behavior.

## 4. Component preservation

For ratio KPI, storing only the final ratio can make later rollup impossible.

Example:

Line A: `9/10 = 90%`.

Line B: `400/500 = 80%`.

Enterprise ratio needs:

`(9+400)/(10+500)=80.196%`.

Therefore a ratio observation should preserve governed components or the engine must be able to re-read them from a component fact layer.

Recommended optional fields:

- `numerator_numeric`;
- `denominator_numeric`;
- `normalizer_k`;
- `component_payload` for composite KPI.

Do not calculate enterprise totals by averaging already-published percentages when the aggregation contract is ratio-of-sums.

## 5. Data-state semantics

Observation state is independent from numeric value.

### VALUE

A valid non-zero observation.

### ZERO

A valid observation whose numeric value is exactly zero.

### NOT_APPLICABLE

The KPI does not apply to the selected population/perimeter.

Example: `0 defects / 0 inspected units` for defect rate.

### MISSING

A required source input is absent or incomplete.

### INVALID

Input exists but violates the contract.

Example: `5 defective units / 0 inspected units`.

`NOT_APPLICABLE`, `MISSING` and `INVALID` must not be persisted as numeric zero.

## 6. `kpi_quality_results`

DQ is not a text comment on an observation. Store each rule result separately.

Suggested fields:

- rule-result ID;
- run ID;
- definition ID;
- observation ID or affected grain;
- rule ID/version;
- rule family;
- severity;
- `PASS | FAIL | NOT_APPLICABLE | MISSING_EVIDENCE`;
- observed value/details;
- expected condition/tolerance;
- evidence/lineage pointer;
- evaluated timestamp.

Rule families include:

- schema/type;
- required source input;
- duplicate event;
- referential integrity;
- join cardinality;
- UOM/dimension;
- currency/FX;
- event chronology;
- population integrity;
- numerator subset;
- mathematical range;
- measurement/calibration validity;
- reconciliation/control total;
- publication gate.

## 7. `kpi_reconciliation_results`

Keep reconciliation explicit because a KPI can be mathematically valid and still fail an independent control.

Fields should include:

- reconciliation ID;
- run/definition/observation references;
- reconciliation rule/version;
- source/control identities;
- observed value;
- expected/control value;
- absolute difference;
- relative difference when meaningful;
- tolerance-policy version;
- result state;
- evidence pointers.

Hard identity failures normally make the observation `INVALID`.

Example receipt control:

`Accepted + Damaged + Rejected = Received`.

Example margin scale control:

`CanonicalMarginRatio ~= NativeContributionMarginPercent / 100`.

## 8. Source manifests

A reproducible run needs more than a timestamp.

The run should record a source manifest covering all inputs, for example:

- source contract ID;
- source mapping version ID;
- source table/topic/read-model version;
- watermark or max event timestamp;
- source row/event count;
- source snapshot ID where available;
- query/read-model version or semantic adapter hash;
- UOM conversion table version;
- FX policy/rate-set version;
- calendar/master-data version;
- input content/control hash where practical.

This manifest lets the platform distinguish:

“same formula, newer source facts” from “same facts, new mapping” from “new formula”.

## 9. Event time vs ingestion time vs calculation time

Preserve all three when applicable.

- **event time** decides business period/cohort membership;
- **ingestion/posting time** helps late-arriving-data analysis;
- **calculation time** is audit metadata only.

Do not bucket an event by calculation timestamp just because it arrived late.

## 10. As-of and snapshot KPI

A snapshot KPI must record explicit `as_of_timestamp` and the source snapshot selected at/before that as-of.

Do not sum historical snapshots as independent business facts.

For versioned receipt discrepancies:

- current-issue dashboard may need latest discrepancy state;
- finalized shortage KPI needs latest **finalized** discrepancy state.

These are different source-selection contracts and should produce different adapter/read-model queries.

## 11. Due-cohort KPI

For SLA/on-time KPI, observation metadata should preserve:

- cohort due-period;
- as-of time;
- due count;
- successful on-time count;
- closed-late count;
- open-overdue count.

Example: 10 shipments due; 7 on time, 1 closed late, 2 open overdue.

Published ratio = `7/10 = 70%`.

Keeping components makes survivorship bias visible and debuggable.

## 12. Distinct-count KPI

Distinct counts are non-additive across overlapping populations.

Store/identify the distinctness key and recompute at the target perimeter when possible.

Do not sum:

- campaign reach across overlapping campaigns;
- unique buyers across overlapping channels;
- distinct SKU across overlapping warehouses

unless the definition explicitly uses additive non-overlapping partitions.

## 13. Percentile KPI

P90/P95 must be calculated from the target raw-observation population under one governed quantile method.

Do not roll up department P90 values by averaging or weighted averaging them.

For reproducibility, store:

- quantile method/version;
- raw population count;
- optional sketch/distribution artifact only if the chosen approximation method itself is governed.

## 14. Currency and FX lineage

Every monetary observation should make reporting currency recoverable.

If source currency differs:

- source amount/currency remain traceable;
- FX rate type/date/version recorded;
- converted canonical amount recorded;
- one calculation run does not mix incompatible FX policies.

A change in FX accounting policy can require formula/policy versioning even if the arithmetic remains `SUM(amount)`.

## 15. Restatement

Restatement never overwrites a prior published run.

A restatement creates a new run and references the superseded run.

Minimum restatement reason categories:

- late-arriving source facts;
- source correction/reversal;
- mapping correction;
- formula-definition change explicitly approved for historical restatement;
- FX/reference-data correction;
- duplicate/remediation;
- manual governance correction with evidence.

For each restatement, store:

- old run ID;
- new run ID;
- reason code;
- free-text explanation;
- approver/actor;
- impacted period/scope;
- materiality/delta summary.

## 16. Thresholds are separate policy

Targets, warning bands and blocking thresholds normally must not be embedded in the formula definition.

A future `kpi_threshold_policy_versions` layer should include:

- definition ID;
- scope/grain applicability;
- directionality/goal function;
- target, warning, blocking or target-band values;
- effective dates;
- approver;
- policy source/reference;
- content hash.

Changing a target from 95% to 97% should not silently create a new calculation formula when the measured quantity has not changed.

## 17. Publication gate

Before an observation is visible as normal production KPI:

1. exact definition release state is `PRODUCTION_READY` for new production execution;
2. effective mapping set is verified;
3. calculation succeeded;
4. required DQ rules pass;
5. required reconciliation passes;
6. value/data-state is compatible with publication policy;
7. source/run lineage is complete;
8. restatement policy is satisfied if this replaces prior published output.

A failed observation may still be persisted for audit, but must not masquerade as a normal valid dashboard value.

## 18. Idempotency and atomicity

User/system-triggered calculation requests should use durable command IDs.

Within one transaction where practical:

- register/resolve command;
- create run request/state;
- persist accepted observations and DQ/reconciliation evidence;
- append outbox publication/notification event.

Retries of the same mutation reuse the original command ID.

## 19. Organisation isolation

Every organisation-owned run/observation query is scoped by authenticated organisation membership/capability.

Do not expose arbitrary organisation IDs through unscoped read endpoints.

System definitions can be global metadata, but observations remain organisation/perimeter facts unless the definition explicitly represents a platform aggregate with separate governance.

## 20. Proposed immutable keys

Recommended uniqueness examples:

### Definition

`scope + organisation + KPI code + formula version`.

### Mapping

`definition ID + mapping-set version + logical variable`.

### Run

`run ID` plus command/fingerprint semantics for requested calculation.

### Observation

A run should not emit two normal observations for the same:

`definition ID + organisation + governed grain + period/as-of`.

If the grain is stored as JSONB, also store a canonical grain hash for uniqueness/indexing.

## 21. Example end-to-end lineage

Receipt Acceptance Rate publication can be reconstructed as:

`KPI definition SYNTH-LOG-001`  
`-> formula version X`  
`-> release event PRODUCTION_READY`  
`-> mapping-set version Y`  
`-> VERIFIED events for AcceptedQuantity and ReceivedQuantity`  
`-> source contract NATIVE-RECEIPT`  
`-> receipt snapshot/event manifest`  
`-> run R`  
`-> numerator SUM(Accepted)=482`  
`-> denominator SUM(Received)=500`  
`-> identity reconciliation 482+9+9=500 PASS`  
`-> canonical observation 0.964 ratio`  
`-> display 96.4%`.

That is the level of lineage required for a KPI to become part of the operating platform rather than a dashboard-only calculation.
