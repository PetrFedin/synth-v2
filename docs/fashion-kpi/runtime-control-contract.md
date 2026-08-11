# SYNTH-V2 KPI Runtime Control Contract

Version: 18.0

A KPI is not publishable merely because no failing quality/reconciliation row exists. The platform must also prove that every **required** control was actually executed.

This closes a dangerous false-positive state:

> required reconciliation was never run -> no FAIL row exists -> dashboard incorrectly treats observation as clean.

## 1. Required controls belong to the definition

Hard calculation/data controls are part of the governed KPI definition and live in `controlContract`.

V18 standardizes these optional keys:

```json
{
  "requiredQualityRules": [
    {"id": "receipt-identity", "version": "1.0"},
    {"id": "uom-dimension", "version": "1.0"}
  ],
  "requiredReconciliationRules": [
    {"id": "receipt-control-total", "version": "1.0"}
  ]
}
```

If an array is absent or empty, no rule of that family is mandatory solely by this definition.

A rule may still execute as diagnostic/non-blocking evidence.

## 2. Rule identity is ID + version

Do not identify a control by label only.

`receipt-control-total v1.0` and `v2.0` may use different tolerance/boundary semantics.

Publication evidence must satisfy the exact required rule ID and rule version selected by the definition version used in the run.

## 3. Valid completion states

For a required quality/reconciliation rule:

- `PASS` -> satisfied;
- `NOT_APPLICABLE` -> satisfied only if the rule contract legitimately permits N/A for that observation/population;
- `FAIL` -> executed and failed, publication blocked when blocking by policy;
- `MISSING_EVIDENCE` -> publication blocked;
- **no result row** -> publication blocked as `REQUIRED_CONTROL_NOT_EXECUTED`.

The runtime read model must distinguish these cases.

## 4. Observation-level vs binding-level controls

A control result can reference:

- a specific `observation_id`; or
- `observation_id = null`, meaning the rule was evaluated for the entire run-definition binding/perimeter.

When checking a specific observation, the platform may use:

- a result explicitly attached to that observation; or
- a binding-level result where the rule contract says one evaluation covers all observations in that binding.

Do not attach one passing control to unrelated definitions/runs.

## 5. Hard identity example — receipt

Definition control contract may require:

```json
{
  "requiredReconciliationRules": [
    {"id": "receipt-quantity-identity", "version": "1.0"}
  ]
}
```

Identity:

`Accepted + Damaged + Rejected = Received`.

If no result exists for `receipt-quantity-identity v1.0`, the observation is **not publishable**, even if acceptance-rate arithmetic itself returned a plausible number.

## 6. Scale reconciliation example — contribution margin

Canonical ratio:

`ContributionMarginAmount / NetRevenue = 0.24`.

Native mirror may store `24.0000` percentage points.

Required rule can be:

`margin-native-scale v1.0`.

Control:

`canonical_ratio ~= native_percentage_points / 100`.

If adapter code silently begins storing native ratio `0.24` while the mapping still says percentage points, this reconciliation should fail and publication must stop.

## 7. Quality rules vs reconciliation rules

### Quality rule

Checks source/input/calculation integrity, e.g.:

- required input present;
- duplicate event;
- referential integrity;
- join cardinality;
- UOM dimension;
- FX policy;
- chronology;
- population contract;
- numerator subset;
- mathematical range;
- calibration/method validity;
- anti-gaming.

### Reconciliation rule

Compares against an independent identity/control total/reference, e.g.:

- accepted + damaged + rejected = received;
- shipment total = sum(shipment lines);
- allocated cost total = source cost pool;
- canonical margin ratio = native percentage-points mirror / 100;
- ledger total = costing close control total.

Keep them separate because a calculation can pass structural DQ but fail an independent reconciliation.

## 8. Tolerances

Tolerance belongs to the reconciliation/control rule or governed tolerance policy.

Examples:

- exact integer quantity identity: tolerance 0;
- currency reconciliation: explicit minor/materiality tolerance;
- floating lab measurement: method-specific tolerance;
- mass balance: documented relative/absolute materiality.

Do not introduce a generic universal `0.01` tolerance.

## 9. Publication decision

A normal observation is a publication candidate only if:

1. run is `SUCCEEDED`;
2. data state is not `MISSING`/`INVALID`;
3. no blocking/error DQ rule failed or lacks evidence;
4. no required quality rule is missing;
5. no required reconciliation rule is missing;
6. no required reconciliation failed/lacks evidence;
7. immutable definition/mapping/run/source lineage is complete.

`NOT_APPLICABLE` may be published as a state but has no canonical numeric value.

## 10. Definition change implications

Adding/removing a hard required control can change release governance even if arithmetic formula is unchanged.

If the new control changes what data/population is considered valid and therefore can change published business values, review whether a new formula/semantic version is required.

If it only strengthens evidence for unchanged values, it may be a governance/control-contract version change according to approved change-classification policy. Do not decide this implicitly in dashboard code.
