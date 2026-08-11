# SYNTH-V2 KPI Change Classification

Version: 17.0

This matrix answers a critical implementation question: **when something changes, which KPI history must change?**

Using the wrong history creates false lineage. For example, changing a database column name is not a new KPI formula; approving an unchanged source path is not a new mapping version; changing a target from 95% to 97% is not necessarily a new calculation formula.

## 1. Histories are orthogonal

SYNTH-V2 distinguishes:

- semantic definition/formula version;
- definition release lifecycle event;
- physical mapping-set version;
- physical mapping verification event;
- semantic dependency edge;
- future calculation run;
- future observation/DQ/reconciliation;
- future threshold-policy version;
- future restatement record.

One business change may intentionally affect several histories, but the reason must be explicit.

## 2. Decision matrix

| Change | New formula version | New mapping-set version | New verification event | New release event | New run/restatement | New threshold policy |
|---|---:|---:|---:|---:|---:|---:|
| Rename source database column, meaning unchanged | No | Yes | Yes | Possibly | Future runs | No |
| Move source from ERP table to governed read model, same meaning | No | Yes | Yes | Possibly | Future runs | No |
| Steward verifies already-mapped unchanged path | No | No | Yes | Possibly | No | No |
| Numerator changes | **Yes** | Usually yes/review | Yes | **Yes** | New runs | Review |
| Denominator/exposure changes | **Yes** | Usually yes/review | Yes | **Yes** | New runs | Review |
| Grain changes | **Yes** | Review | Review | **Yes** | New runs | Review |
| Eligible population changes | **Yes** | Review | Review | **Yes** | New runs | Review |
| Inclusion/exclusion changes | **Yes** | Review | Review | **Yes** | New runs | Review |
| Event-time basis changes | **Yes** | Review | Review | **Yes** | New runs | Review |
| Snapshot becomes due cohort | **Yes** | Review | Review | **Yes** | New runs | Review |
| Aggregation changes AVG% -> ratio of sums | **Yes** | No if same inputs | Existing mapping may remain | **Yes** | New/restated runs | Review |
| Normalizer K changes 200k -> 1m | **Yes** | No | No | **Yes** | New/restated runs | Review |
| UOM output meaning changes kg -> tonne | Usually yes unless governed pure presentation conversion | Maybe | Review | Review | New runs | Threshold review |
| Display 0.24 -> 24% only, storage unchanged | No | No | No | No | No | No |
| Source stores percent 24 instead of ratio 0.24 | No if semantic ratio unchanged | **Yes** adapter/scale | **Yes** | Possibly | Future/reconciled runs | No |
| Quantile estimator changes percentile_cont -> another method | **Yes** | No | No | **Yes** | New/restated runs | Review |
| Sample SD -> population SD | **Yes** | No | No | **Yes** | New/restated runs | Review |
| FX rate provider changes, same approved FX policy | Usually mapping/reference version | Yes/reference lineage | Yes | Possibly | Future runs | No |
| FX accounting policy changes | **Yes/policy version** | Review | Review | **Yes** | New/restated runs | Review |
| Target 95% -> 97%, measured quantity unchanged | No | No | No | No | No | **Yes** |
| Warning band changes | No | No | No | No | No | **Yes** |
| KPI passes technical validation | No | No | No | **Yes** | No | No |
| KPI passes owner UAT | No | No | No | **Yes** | No | No |
| KPI deprecated | No | No | Mapping may separately deprecate | **Yes** | No new normal runs | Policy deprecates separately |
| Late source fact arrives for closed period | No | No | No | No | **Restatement run** | No |
| Source correction/reversal arrives | No | No | No | No | **Restatement/new run** | No |
| Original source mapping was wrong | No if business meaning unchanged | **Yes** | **Yes** | Release review | **Restatement** if historical output affected | No |
| Original formula was wrong | **Yes** | Review | Review | **Yes** | **Restatement** if policy requires | Review |

## 3. Semantic-change test

Ask:

> If two analysts used the old and new rule on the exact same source facts, could they legitimately produce different business values?

If yes because the rule itself changed, it is normally a **formula/semantic version change**.

Examples:

- denominator changed received -> shipped: semantic change;
- open overdue cases added to SLA denominator: semantic change;
- P90 estimator changed: semantic change;
- source field renamed but resolves to identical semantic variable: not a formula change.

## 4. Physical-mapping-change test

Ask:

> Does the logical variable still mean exactly the same business thing, but its physical source path/query/adapter changed?

If yes, create a new **mapping-set version**.

Examples:

- `ReceivedQuantity` moves from `external_wms.receipt_qty` to `receipt_snapshots.lines[].quantity`;
- `NetRevenue` moves from a raw order table to the immutable order-commit snapshot;
- the event topic changes while event semantics remain identical.

A mapping-set change requires re-verification.

## 5. Verification-event test

Ask:

> Did the physical source path itself change?

If **no**, but a steward independently reviewed/tested the path, append a **verification event** only.

Do not create mapping version 2 where the bytes/meaning/path are identical to mapping version 1 merely to record approval.

## 6. Release-event test

Release lifecycle answers:

> How ready is this unchanged semantic definition for governed use?

It does not answer what the KPI means.

Examples:

- DRAFT -> DEFINED: semantic review completed;
- MAPPING_PENDING -> MAPPED_UNVERIFIED: mappings identified;
- MAPPED_UNVERIFIED -> VALIDATION_PENDING: mappings verified, tests remain;
- UAT_PENDING -> PRODUCTION_READY: all required evidence complete;
- any active stage -> DEPRECATED: definition retired.

Changing lifecycle never mutates semantic definition fields.

## 7. Threshold-policy test

Ask:

> Did the measured value definition change, or only what management considers good/bad/acceptable?

If only interpretation threshold changes, it belongs to a **threshold-policy version**, not the formula.

Example:

Receipt Acceptance Rate remains:

`Accepted / Received`.

Target changing from 98% to 99% does not change the measured rate.

## 8. Restatement test

Ask:

> Was a previously calculated/published period wrong or incomplete under the chosen historical/restatement policy?

If yes, do not overwrite the old observation/run. Create a new run with supersession/restatement lineage.

Common reasons:

- late-arriving receipt;
- actual freight invoice replaced accrual;
- corrected FX/reference data;
- reversal/correction of cost entry;
- corrected mapping;
- approved historical application of a corrected formula.

## 9. Examples from current SYNTH-V2 native sources

### Contribution margin source scale correction

Native source stores `contributionMarginPercent = 24.0000` percentage points.

Canonical KPI stores ratio `0.24`.

If a developer previously copied `24.0000` directly into canonical ratio storage, the business formula did not necessarily change; the **adapter/scale mapping was wrong**.

Correct action:

- fix mapping/scale contract;
- verify mapping;
- restate affected observations;
- do not invent a new formula if `MarginAmount / NetRevenue` remained the intended formula.

### Receipt SLA denominator correction

Old implementation: only completed shipments in denominator.

Correct implementation: all due shipments, including open overdue.

This changes eligible population and therefore **requires a new formula/semantic version**, not merely a query patch under the same formula version.

### Receipt source moved to a new read model

If accepted/received quantities and receipt event semantics remain identical:

- same formula version;
- new mapping-set version;
- new verification events;
- release evidence reviewed;
- future runs use new mapping.

## 10. Change review checklist

Before merging a KPI-related change, answer:

1. Did business meaning change?
2. Did formula components change?
3. Did population/grain/time basis change?
4. Did UOM/scale/FX policy change?
5. Did only physical source path change?
6. Did only verification/readiness state change?
7. Did only target/warning policy change?
8. Are historical observations affected?
9. Is restatement required?
10. Have docs/tests/source contracts and registry histories been updated consistently?

If these questions cannot be answered, the change is not ready for implementation.
