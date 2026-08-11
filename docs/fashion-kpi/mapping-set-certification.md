# SYNTH-V2 KPI Mapping-Set Certification

Version: 18.0 addendum to registry V17.

A physical source mapping being `VERIFIED` proves that the logical variable points to the intended field/event. It does **not** by itself prove that a complete replacement mapping set preserves KPI behavior.

Example:

`ReceivedQuantity` and `AcceptedQuantity` are both correctly mapped to a new read model, but the read model may select a different receipt snapshot population than the old adapter. Every field mapping can be individually correct while the aggregate KPI changes.

Therefore runtime activation requires both **mapping verification** and **mapping-set certification**.

## 1. Certification evidence

An activation event intended for runtime execution must carry at least:

```json
{
  "activationReason": "migrate receipt KPI to governed receipt read model",
  "calculationRegressionPassed": true,
  "populationRegressionPassed": true,
  "reconciliationStatus": "PASS",
  "dataStewardUatPassed": true,
  "ownerUatStatus": "PASS"
}
```

Permitted reconciliation status:

- `PASS`;
- `NOT_APPLICABLE` only when the KPI/mapping genuinely has no independent reconciliation requirement.

Permitted owner UAT status:

- `PASS`;
- `NOT_REQUIRED` only when approved governance policy explicitly allows a non-material physical adapter change without business-owner retest.

Data-steward UAT is still required because the physical lineage changed.

## 2. Calculation regression

Proves that the new mapping set feeds the governed calculation primitive correctly.

Typical checks:

- same formula version;
- same canonical UOM/scale;
- same normalizer;
- same zero/null/error behavior;
- same ratio components under controlled fixture;
- no rounding/precision regression.

## 3. Population regression

Proves that source-selection semantics did not change silently.

Typical checks:

- same eligible object population;
- same event-time basis;
- same due/open/completed cohort behavior;
- same snapshot latest/effective rule;
- same cancellation/reversal handling;
- no duplicate expansion from changed joins.

If population meaning intentionally changes, that is usually a **new formula/semantic version**, not merely a mapping-set replacement.

## 4. Reconciliation certification

A replacement mapping should be reconciled to independent controls where possible.

Examples:

- receipt quantities reconcile to shipment/receipt control totals;
- actual cost reconciles to immutable ledger totals;
- margin ratio reconciles to amount/revenue and native percentage mirror;
- allocated cost reconciles to source pool total.

A mapping can be syntactically correct and still be economically wrong if joins or snapshot selection are wrong.

## 5. Runtime binding rule

A V18 calculation run may bind an activation event only when its evidence satisfies the certification contract.

This rule also protects historical V17 activation rows: if an old activation event predates the certification requirement and lacks evidence, V18 will not execute against it until a new certified activation event is appended.

No historical activation is rewritten.

## 6. Why release status is not changed

The semantic formula can remain unchanged and already be `PRODUCTION_READY`.

Changing source implementation should not create a fake formula version or fake semantic release change.

Instead:

1. create mapping-set version N+1;
2. verify every mapping;
3. run calculation/population regression;
4. reconcile;
5. obtain steward/owner evidence;
6. append certified activation event;
7. future runs bind the new activation event.

Historical runs remain pinned to the prior mapping-set activation.

## 7. Failure behavior

If activation evidence is incomplete:

- mapping rows remain immutable;
- verification evidence remains valid;
- activation is not runtime-certified;
- `execution_ready` for V18 is false;
- normal run binding is rejected;
- no silent fallback to `MAX(mapping_set_version)` or another source is permitted.
