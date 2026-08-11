# SYNTH-V2 fashion KPI reconciliation matrix

Version: 16.0

A KPI is not accepted because its formula returns a number. It is accepted when the number can be reconciled to its governed source population and, where applicable, to an independent control total or invariant.

This matrix defines required reconciliation classes for the native SYNTH-V2 domains currently mapped by the KPI methodology.

## 1. Reconciliation result model

Each reconciliation should emit a structured result with at least:

- `rule_id`;
- `kpi_id` or control family;
- `run_id`;
- `scope/grain keys`;
- `observed_value`;
- `expected_value` or expected condition;
- `absolute_difference` where meaningful;
- `relative_difference` where meaningful;
- `tolerance_version`;
- `status = PASS | FAIL | NOT_APPLICABLE | MISSING_EVIDENCE`;
- evidence/source pointers;
- evaluated timestamp.

Never convert a failed control into a KPI value of zero.

## 2. Hard identity vs tolerance reconciliation

### Hard identity

Used when the domain model itself defines an exact accounting/quantity identity.

Examples:

`Accepted = Received - Damaged - Rejected`

`AllocatedTotal = LandedCostTotal`

A hard-identity failure is `INVALID` unless a specifically versioned rounding rule explains the difference.

### Tolerance reconciliation

Used when independent systems, measurement precision or FX/rounding can cause immaterial difference.

Example:

`CanonicalContributionMarginRatio ~= SourceContributionMarginPercent / 100`

Tolerance must be versioned. Do not embed an arbitrary `0.01` or `1%` across all KPI.

## 3. Order economics controls

| Rule ID | Control | Expected result | Failure meaning |
|---|---|---|---|
| REC-FIN-001 | Landed cost ledger identity | `SUM(signed exact cost entries) = landed total` | stale/incorrect cost-entry population |
| REC-FIN-002 | Cost-entry currency | every ledger `amount.currency = orderCommit.currency` | FX/mapping failure |
| REC-FIN-003 | Supply lineage completeness | close-grade landed/margin snapshots have complete supply lineage | lineage incomplete |
| REC-FIN-004 | Margin amount identity | `netRevenue - landedCost = contributionMarginAmount` | calculation/source mismatch |
| REC-FIN-005 | Margin scale mirror | `CM ratio ~= contributionMarginPercent / 100` | percent/decimal scale or rounding mismatch |
| REC-FIN-006 | Allocation monetary total | `SUM(allocations.allocatedAmount) = allocatedTotal` | allocation loss/double count |
| REC-FIN-007 | Allocation SKU total | `SUM(skuEconomics.allocatedLandedCost) = allocatedTotal` | SKU allocation inconsistency |
| REC-FIN-008 | Allocation landed basis | `allocatedTotal = landedCost.totalCost` | stale/mismatched landed basis |
| REC-FIN-009 | Allocation cost-entry set | run cost-entry IDs equal current ledger IDs for commit | stale run/source population |
| REC-FIN-010 | Cost-close readiness lineage | readiness landed and margin snapshots match exact order commit | wrong economic basis |

## 4. Cost allocation share controls

For every shared cost entry allocated across SKU:

`SUM(AllocationShare by CostEntryId) = 1`

subject only to the repository's explicit rounding representation.

For direct allocation:

- one allocation row;
- share = 1;
- allocated amount = entry amount;
- SKU exists in committed order.

For unit/net-value/custom allocation:

- weights >= 0;
- total weight > 0;
- no SKU outside order;
- final rounding remainder does not change total money.

Do not use allocation shares as a replacement for monetary reconciliation. Both share and money identities should pass.

## 5. Fulfillment controls

| Rule ID | Control | Expected result | Failure meaning |
|---|---|---|---|
| REC-LOG-001 | Plan delivery window | `expectedDeliveryAt > plannedShipAt` | invalid temporal contract |
| REC-LOG-002 | Inventory plan vs reservation | inventory-backed plan quantity <= pinned reservation | unbacked inventory fulfillment |
| REC-LOG-003 | Shipment cumulative limit | cumulative shipped line quantity <= plan line quantity | duplicate/over-shipment |
| REC-LOG-004 | Receipt disposition identity | `accepted + damaged + rejected = received` | receipt math/population error |
| REC-LOG-005 | Receipt disposition upper bound | `damaged + rejected <= received` | impossible disposition |
| REC-LOG-006 | One final receipt | max one `receiptComplete=true` per shipment | ambiguous completion event |
| REC-LOG-007 | Final shortage | finalized shortage = `max(shipped - cumulative received,0)` | discrepancy derivation error |
| REC-LOG-008 | Overage | overage = `max(cumulative received - shipped,0)` | discrepancy derivation error |
| REC-LOG-009 | Discrepancy state | open/clear/pending consistent with issue count and finalization | stale/invalid state |
| REC-LOG-010 | Snapshot selection | one intended latest/as-of discrepancy per shipment in KPI query | historical double counting |

## 6. Physical actual cost controls

A physical actual-cost entry must preserve the execution chain:

`order commit -> supply commitment -> fulfillment plan -> shipment -> optional receipt/discrepancy`.

Additional rules:

- quality/rework cost requires receipt evidence;
- SKU-scoped cost references a SKU on the immutable shipment;
- correction/reversal remains on the same physical lineage;
- no pre-close cost mutation is accepted after cost close through the ordinary path;
- post-close adjustment uses the governed post-close mechanism instead of rewriting history.

A KPI such as rework cost per accepted unit cannot pass reconciliation if its cost numerator and receipt denominator are linked only by SKU/date while exact receipt lineage is available.

## 7. Due-cohort service controls

For `On-time Final Receipt Rate`:

Denominator:

`all distinct shipments whose expectedDeliveryAt is in period`.

Numerator:

`subset with final receivedAt <= expectedDeliveryAt`.

Controls:

- open overdue shipment remains denominator;
- future-due shipment is excluded;
- one shipment counted once;
- partial non-final receipts do not mark shipment completed;
- final receipt after deadline remains late;
- no due shipments -> N/A.

## 8. Snapshot controls

For point-in-time KPI:

- define `as_of_timestamp`;
- select latest source snapshot at or before as-of;
- do not sum historical versions;
- store selected snapshot ID with KPI observation.

For receipt discrepancy:

`latest per shipment` is not the same as `latest finalized per shipment`.

Shortage KPI needs the latter. Current open-issue dashboard may need the former. These are different source-selection contracts.

## 9. Ratio controls

For every ratio KPI:

1. verify numerator/denominator UOM algebra;
2. verify denominator population is the intended exposure;
3. verify aggregation as components, not average of row ratios unless formula explicitly says arithmetic mean;
4. verify denominator-zero state;
5. verify mathematical range based on primitive, not formatting.

Examples:

- acceptance rate: true subset, expected 0..1;
- overage ratio: non-negative but may exceed 1;
- contribution margin ratio: can be negative and can exceed 1 in unusual economics; do not force 0..1;
- cost allocation reconciliation ratio: target exactly 1, not maximize.

## 10. Scale controls

Every percentage-like source must declare whether it stores:

- decimal ratio: `0.24`;
- percentage points: `24.0`;
- basis points;
- normalized events per K.

Current order-economics `contributionMarginPercent` is percentage-points scale because the money helper multiplies by 100. Canonical KPI ratio should store decimal.

Required reconciliation:

`canonical_ratio - source_percent/100 ~= 0`.

A scale mismatch is a critical failure because it can create 100x dashboard errors without any SQL exception.

## 11. Currency controls

When a KPI aggregates money:

- all rows must be in one canonical reporting currency, or converted under one explicit FX policy;
- source currency, target currency, rate type and effective date remain traceable;
- do not aggregate raw source amounts from mixed currencies;
- order-currency native `amount` can be aggregated only within compatible currency perimeter unless converted further.

Changing FX policy changes business meaning and requires a formula/policy version.

## 12. Reconciliation precedence

Recommended execution order:

1. identity/lineage;
2. population and deduplication;
3. UOM/currency;
4. temporal selection;
5. base quantity/money identities;
6. formula calculation;
7. cross-source/control-total reconciliation;
8. range/threshold checks;
9. publication gate.

Do not run red/green target logic before source reconciliation. A favorable value calculated from a duplicated join is still invalid.

## 13. Publication policy on failures

Recommended states:

- hard identity fail -> observation `INVALID`, no normal publication;
- required source missing -> `MISSING`, no fake zero;
- not applicable denominator/population -> `NOT_APPLICABLE`;
- reconciliation within tolerance -> publish with `PASS` evidence;
- warning tolerance -> only if explicitly allowed by policy and clearly marked;
- blocking tolerance -> do not publish as normal KPI.

## 14. Example: contribution margin end-to-end

Inputs:

- net revenue = 1,000;
- landed cost = 760;
- source runtime contribution margin percent = 24.0000.

Step 1 — amount:

`CM amount = 1,000 - 760 = 240`.

Step 2 — canonical ratio:

`240 / 1,000 = 0.24`.

Step 3 — source scale mirror:

`24.0000 / 100 = 0.24`.

Step 4 — reconciliation:

`0.24 - 0.24 = 0` -> PASS.

Published KPI value:

- storage = `0.24`;
- display = `24.00%`;
- source snapshot IDs attached;
- formula version attached.

## 15. Example: receipt acceptance end-to-end

Inputs:

- received = 500;
- damaged = 9;
- rejected = 9;
- accepted = 482.

Identity:

`482 + 9 + 9 = 500` -> PASS.

Acceptance rate:

`482 / 500 = 0.964` -> 96.4%.

Damage rate:

`9 / 500 = 1.8%`.

Rejection rate:

`9 / 500 = 1.8%`.

Component shares sum:

`96.4% + 1.8% + 1.8% = 100%` -> PASS.

If the identity fails in quantities, do not repair percentages by normalization; fix the population/source issue.
