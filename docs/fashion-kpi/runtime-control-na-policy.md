# SYNTH-V2 Required Control NOT_APPLICABLE Policy

Version: 18.0 addendum.

`NOT_APPLICABLE` is not a universal substitute for `PASS`.

A required control may satisfy publication with `NOT_APPLICABLE` only when its definition entry explicitly permits that state.

## Rule shape

```json
{
  "id": "receipt-control-total",
  "version": "1.0",
  "scope": "OBSERVATION",
  "allowNotApplicable": false
}
```

Required fields:

- `id`;
- `version`;
- `scope = OBSERVATION | BINDING`;
- `allowNotApplicable = true | false`.

## Default behavior

If `allowNotApplicable` is false or absent in legacy data, only `PASS` satisfies the required-control gate.

`FAIL`, `MISSING_EVIDENCE`, missing result row and unauthorized `NOT_APPLICABLE` all leave the required control unsatisfied.

## When N/A can be legitimate

Examples:

- a measurement/calibration rule for a KPI variant that uses no physical measurement;
- an FX reconciliation rule when the entire governed population is already in canonical currency and the definition explicitly treats FX reconciliation as not applicable;
- a control whose applicability predicate is part of the governed rule contract and is false for that exact observation.

## When N/A is not legitimate

Examples:

- receipt quantity identity when a receipt observation exists;
- required cost-pool reconciliation for a published cost KPI;
- UOM dimension validation for a numeric observation;
- required mapping-lineage completeness for an executable definition.

Returning N/A in these cases must not bypass evidence requirements.

## Evidence expectation

A `NOT_APPLICABLE` result should still contain evidence explaining the applicability predicate and why it evaluated false.

The runtime does not reinterpret an empty/missing result as N/A.

## Governance

Changing `allowNotApplicable` can alter which observations become publishable. Review it as a governed control-contract change under `change-classification.md`.
