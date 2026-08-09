# SYNTH-V2 Fashion KPI Testing and Release Methodology

A KPI is not production-ready because its formula looks correct. It is production-ready only when definition, data mapping, calculation, reconciliation and publication controls all pass.

## 1. Test layers

Every active KPI should have tests at five layers.

### 1.1 Definition tests

Validate that the contract is complete and internally consistent.

Examples:

- unique KPI ID + formula version;
- lifecycle role is valid;
- active KPI has grain, population, temporal class, UOM and zero policy;
- alias has canonical target and cannot publish independently;
- blocked umbrella cannot publish;
- true share has numerator/denominator and subset rule;
- normalized rate has normalizer K;
- percentile has quantile method;
- distinct count has distinctness key;
- snapshot is not additive across time;
- production-ready status requires verified physical mapping.

### 1.2 Calculation tests

Use deterministic fixtures with known results.

Required categories:

- normal positive case;
- zero numerator;
- zero denominator;
- boundary value;
- negative value where allowed;
- value above 100% where mathematically allowed;
- multiple-grain aggregation;
- duplicate input row;
- missing input;
- invalid UOM.

### 1.3 Population/time tests

Verify that the correct cases are included.

Examples:

- due-cohort includes overdue-open cases;
- completed-duration KPI excludes still-open cases;
- open-as-of excludes cases closed before as-of;
- forecast KPI uses the forecast version frozen before the evaluation window;
- snapshot uses the governed as-of timestamp;
- late-arriving event follows restatement policy.

### 1.4 Data integration tests

Verify physical mappings and joins.

Examples:

- source key uniqueness;
- expected join cardinality;
- no cross-organisation leakage;
- temporal master-data version resolves exactly once;
- source UOM is convertible;
- currency has a valid FX mapping;
- required event timestamps exist;
- no orphan facts above tolerance.

### 1.5 Reconciliation tests

Verify that calculated components agree with independent control totals.

Examples:

- total production output vs production ledger;
- inventory movement bridge vs closing stock;
- allocated cost vs GL cost pool;
- shipment value vs invoice/customs totals;
- calculated order quantity vs order system control total.

## 2. Canonical worked fixtures

### 2.1 Ratio of sums

Input:

- A: numerator 9, denominator 10;
- B: numerator 400, denominator 500.

Expected:

`409 / 510 = 0.8019607843`.

Failure condition: implementation returns `0.85` from average of percentages.

### 2.2 DHU

Input: 130 defect events, 100 inspected units.

Expected: `130 defects per 100 inspected units`.

Failure condition: value is formatted or validated as `130%` with a hard maximum of 100%.

### 2.3 Defective-unit rate

Input: 42 distinct defective units, 100 inspected units.

Expected: `0.42` stored; `42%` displayed.

Failure condition: defect events rather than unique units are used in numerator.

### 2.4 SLA due cohort

Input:

- 10 cases due in period;
- 7 closed on time;
- 1 closed late;
- 2 still open and overdue.

Expected on-time compliance: `7/10 = 70%`.

Failure condition: `7/8 = 87.5%`.

### 2.5 Actual cycle time

Input:

- group A: 100 productive minutes / 10 good units;
- group B: 500 productive minutes / 100 good units.

Expected: `(100+500)/(10+100) = 5.454545 min/unit`.

Failure condition: `(10 + 5)/2 = 7.5 min/unit`.

### 2.6 OEE

Input:

- availability `0.8750`;
- performance `0.9048`;
- quality `0.9671`.

Expected: about `0.76565`, displayed `76.57%`.

Failure condition: percentages are multiplied as `87.5 * 90.48 * 96.71`.

### 2.7 WAPE and bias

Actual: `100, 300`; Forecast: `120, 270`.

Expected:

- WAPE = `(20+30)/(100+300) = 12.5%`;
- Bias = `(20-30)/400 = -2.5%`.

Failure condition: WAPE is calculated as average APE = 15%.

### 2.8 CPM

Input: media cost 12,000; impressions 800,000.

Expected: `12000/800000*1000 = 15 currency/1000 impressions`.

Failure condition: event count is used as numerator.

### 2.9 Sell-through

Input: sales 400 units; ending inventory 100 units.

Expected: `400/(400+100)=80%`.

Failure condition: monthly sell-through percentages are summed to produce a quarterly value.

### 2.10 Wastewater removal

Input: influent load 100; effluent load 20.

Expected: `(100-20)/100 = 80%`.

Failure condition: influent and effluent samples come from different treatment windows.

## 3. Boundary and negative tests

The following scenarios must be covered where relevant.

| Scenario | Expected behavior |
|---|---|
| numerator = 0, denominator > 0 | valid zero |
| numerator = 0, denominator = 0 | N/A unless contract says otherwise |
| numerator > 0, denominator = 0 | INVALID/DQ error |
| required field missing | MISSING |
| numerator > denominator for true share | INVALID |
| mixed kg and L without density | INVALID |
| mixed currencies without FX rule | INVALID |
| duplicate event key | DQ failure or governed dedup rule |
| future event included in past period | INVALID |
| start timestamp > end timestamp | INVALID |
| percentile derived from aggregate percentiles | INVALID |
| snapshot summed across time | INVALID |
| alias executed directly | rejected |
| blocked umbrella executed | rejected |
| unverified physical mapping + READY status | validator failure |
| cross-tenant source rows | security failure |

## 4. Anti-gaming tests

A test should deliberately reproduce known manipulation patterns.

### SLA survivorship

Keep a bad case open beyond period end. Expected: it remains in the due-cohort denominator.

### Quality denominator shift

Move rejected output to a separate status. Expected: governed inspected/produced population still reflects it according to contract.

### Inventory snapshot timing

Move stock between locations immediately before snapshot. Expected: reconciliation and perimeter rules prevent artificial improvement.

### Forecast backfill

Replace the frozen forecast after actuals are known. Expected: formula version/source snapshot uses the original eligible forecast issue.

### Cost allocation

Reduce output volume and attempt to allocate all fixed OH to fewer units. Expected: normal-capacity rule prevents unit-cost inflation where that accounting policy applies.

## 5. Release statuses

Recommended statuses:

- `DRAFT` — incomplete definition;
- `DEFINED` — semantic/mathematical contract complete;
- `MAPPING_PENDING` — physical mapping incomplete;
- `MAPPED_UNVERIFIED` — source mapping exists but not verified;
- `VALIDATION_PENDING` — tests/reconciliation incomplete;
- `UAT_PENDING` — technical validation passed, owner/steward acceptance pending;
- `PRODUCTION_READY` — all applicable gates passed;
- `DEPRECATED` — superseded but retained historically;
- `BLOCKED_UMBRELLA` — documentation-only parent;
- `ALIAS_NONPUBLISH` — resolves to another KPI.

## 6. Production-ready gates

All applicable gates must pass:

1. stable canonical ID;
2. immutable active formula version;
3. one unambiguous measurement object/grain;
4. explicit eligible population;
5. temporal class and event-time contract complete;
6. numerator/denominator/input definitions complete;
7. unit algebra valid;
8. aggregation/additivity explicit;
9. zero/missing/invalid policy explicit;
10. physical mappings verified;
11. join/cardinality controls passed;
12. formula fixtures passed;
13. population/time fixtures passed;
14. negative/boundary fixtures passed;
15. reconciliation passed within tolerance;
16. anti-gaming controls implemented where material;
17. organisation isolation verified;
18. owner and data-steward UAT passed;
19. publication metadata complete;
20. restatement process available.

## 7. Definition changes

Any change that alters meaning requires a new formula version, including changes to:

- numerator/denominator;
- population;
- temporal class;
- UOM;
- normalizer K;
- aggregation;
- quantile/estimator method;
- FX/accounting basis;
- treatment boundary;
- directionality when used as part of governed decision policy.

Editorial wording changes that do not alter meaning may update documentation without changing formula version, but the change log must still identify them.

## 8. Threshold changes

Thresholds are separately versioned policy. Changing warning/target/blocking levels does not automatically change the formula version.

A published status color or alert must be reproducible from:

`observation + threshold_version + directionality/goal_function`.

## 9. Run-level validation

Every calculation run should persist:

- source watermark;
- definition versions;
- mapping versions;
- row counts at key stages;
- rejected/invalid row counts;
- DQ results;
- reconciliation results;
- calculation-engine version;
- execution timestamps;
- restatement reference.

This allows two runs to be compared without guessing why values changed.
