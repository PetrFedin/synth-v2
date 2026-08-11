# SYNTH-V2 Fashion KPI Implementation Checklist

Use this checklist when implementing or reviewing any KPI in SYNTH-V2.

## A. Business definition

- [ ] Stable KPI code exists.
- [ ] RU/EN canonical names are defined where user-facing.
- [ ] Business question and decision use are stated.
- [ ] Accountable owner is named.
- [ ] Data steward is named.
- [ ] Directionality/goal semantics are explicit.
- [ ] Guardrails are stated.
- [ ] KPI is not an unresolved alias or umbrella definition.

## B. Semantic definition

- [ ] Measurement object is singular and unambiguous.
- [ ] Minimum grain is explicit.
- [ ] Case/event identity is explicit where event-based.
- [ ] Eligible population is explicit.
- [ ] Inclusion/exclusion rules are explicit.
- [ ] Distinctness key exists for unique counts.
- [ ] Business perimeter/organisation scope is explicit.

## C. Mathematical definition

- [ ] Formula version is immutable.
- [ ] Calculation primitive is selected.
- [ ] Numerator/inputs are explicit.
- [ ] Denominator/exposure is explicit where applicable.
- [ ] Normalizer K is explicit for normalized rates.
- [ ] Sign convention is explicit.
- [ ] Mathematical range is defined where meaningful.
- [ ] Denominator-zero behavior is defined.
- [ ] Formula does not rely on operator precedence ambiguity.

## D. Dimensional definition

- [ ] Numerator UOM is known.
- [ ] Denominator UOM is known.
- [ ] Canonical output UOM is known.
- [ ] Unit algebra is valid.
- [ ] Conversion factors are governed/versioned.
- [ ] Currency/FX policy is explicit where applicable.
- [ ] Storage scale and display scale are different concepts and both are defined.

## E. Temporal definition

- [ ] Temporal class is selected.
- [ ] Business event timestamp is explicit.
- [ ] Reporting period/as-of is explicit.
- [ ] Timezone/calendar rule is explicit.
- [ ] Due/open/closed cohort semantics are explicit.
- [ ] Late-arriving-data policy is explicit.
- [ ] Restatement behavior is explicit.
- [ ] Snapshot KPI is not treated as additive across time.

## F. Aggregation

- [ ] Additivity over entity dimension is defined.
- [ ] Additivity over time is defined.
- [ ] Ratios aggregate as components/ratio-of-sums unless explicitly specified otherwise.
- [ ] Percentiles recompute from raw observations.
- [ ] Distinct counts recompute from governed identity set.
- [ ] Weighted means name their weight basis.
- [ ] Composite KPI components use the same perimeter and version basis.

## G. Physical mapping

For every required logical variable:

- [ ] Source system is known.
- [ ] Table/view/topic/read model is known.
- [ ] Field/event attribute is known.
- [ ] Datatype is known.
- [ ] Primary/business/event key is known.
- [ ] Event timestamp is known.
- [ ] Tenant/organisation key is known.
- [ ] UOM/currency fields are known.
- [ ] Join path is documented.
- [ ] Expected cardinality is documented.
- [ ] Source freshness is documented.
- [ ] Mapping has been verified against real data.

## H. Data-quality controls

- [ ] Duplicate keys checked.
- [ ] Orphan facts checked.
- [ ] Join multiplication checked.
- [ ] UOM validity checked.
- [ ] Currency/FX validity checked.
- [ ] Event chronology checked.
- [ ] Numerator subset rule checked for true shares.
- [ ] Measurement method/calibration checked where applicable.
- [ ] Cross-organisation leakage test passed.

## I. Reconciliation

- [ ] Independent control total/source exists where possible.
- [ ] Reconciliation equation is documented.
- [ ] Absolute and/or relative tolerance is defined.
- [ ] Unreconciled residual has a reason-code process.
- [ ] Reconciliation evidence is stored with run/quality results.

## J. Testing

- [ ] Positive example passes.
- [ ] Zero numerator case passes.
- [ ] Zero denominator case passes.
- [ ] Missing data case passes.
- [ ] Invalid data case passes.
- [ ] Boundary case passes.
- [ ] Multi-grain aggregation case passes.
- [ ] Duplicate input case passes.
- [ ] Temporal/cohort case passes.
- [ ] Negative/anti-gaming case passes.

## K. Publication

- [ ] Observation contains KPI ID.
- [ ] Formula version is persisted.
- [ ] Period/as-of is persisted.
- [ ] Grain dimensions are persisted or resolvable.
- [ ] Numeric value is stored in canonical scale.
- [ ] Canonical UOM is stored.
- [ ] DQ status is stored.
- [ ] Run/source watermark is stored.
- [ ] Calculation timestamp is stored.
- [ ] Restatement lineage is stored.
- [ ] Threshold version is available if status/traffic-light is shown.

## L. Release

Only mark `PRODUCTION_READY` when:

- [ ] physical mappings are `VERIFIED`;
- [ ] automated methodology validation passes;
- [ ] formula/population tests pass;
- [ ] reconciliation passes where applicable;
- [ ] security/organisation isolation passes;
- [ ] owner UAT passes;
- [ ] data-steward UAT passes;
- [ ] publication metadata is complete.

If any required item is missing, use the appropriate conditional status instead of `PRODUCTION_READY`.
