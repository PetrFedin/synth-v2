# SYNTH-V2 KPI Runtime Control Scope

Version: 18.0 addendum.

Required DQ/reconciliation controls must declare **where the evidence applies**.

Without explicit scope, one binding-level PASS could accidentally satisfy a rule that must run independently for every observation/grain.

## 1. Supported scope

Each required rule entry uses:

```json
{
  "id": "receipt-quantity-identity",
  "version": "1.0",
  "scope": "OBSERVATION"
}
```

or:

```json
{
  "id": "mapping-lineage-complete",
  "version": "1.0",
  "scope": "BINDING"
}
```

Allowed values:

- `OBSERVATION` — evidence must reference the exact observation ID;
- `BINDING` — evidence must have `observation_id = null` and covers the whole run-definition binding.

## 2. Observation-scoped examples

Typically observation scoped:

- numerator subset check for one grain;
- mathematical range for one value;
- receipt identity for one receipt/period observation;
- measurement calibration validity for one measurement-derived observation;
- reconciliation against one control total at the observation perimeter.

A binding-level PASS must **not** satisfy these rules.

## 3. Binding-scoped examples

Typically binding scoped:

- complete mapping-binding set;
- one consistent FX policy for the whole definition/run binding;
- no duplicate semantic variables in a mapping set;
- definition/mapping lineage completeness;
- a single control that genuinely covers all observations emitted under the binding.

An observation-specific PASS does not replace a required binding-level control.

## 4. Required-control satisfaction

For each observation publication decision:

### OBSERVATION rule

Satisfied only by exact:

`run + definition binding + observation ID + rule ID + rule version`

with result status `PASS` or governed `NOT_APPLICABLE`.

### BINDING rule

Satisfied only by exact:

`run + definition binding + observation_id = null + rule ID + rule version`

with result status `PASS` or governed `NOT_APPLICABLE`.

## 5. Why null does not mean unknown

In `kpi_quality_results` / `kpi_reconciliation_results`, `observation_id = null` is a deliberate semantic state meaning **binding-level control**.

It must not mean “we forgot which observation this belonged to”.

If a control should have an observation ID and it is missing, publication evidence is incomplete.

## 6. Change classification

Changing a required rule from `BINDING` to `OBSERVATION` can materially change which values are publishable. Treat that as a governed control-contract change and review whether a new formula/definition version is required under `change-classification.md`.
