# SYNTH-V2 native fulfillment and receipt-quality KPI methodology

Version: 16.0  
Status: governed implementation contract for current SYNTH-V2 fulfillment sources.

This document defines how shipment, receipt, discrepancy and service KPI must be calculated from the immutable fulfillment snapshots already present in SYNTH-V2.

## 1. Execution lineage

The native fulfillment chain is:

`OrderCommitSnapshot -> SupplyCommitmentSnapshot -> FulfillmentPlanSnapshot -> ShipmentNoticeSnapshot -> ReceiptSnapshot(s) -> ReceiptDiscrepancySnapshot(s)`

The same shipment may have multiple partial receipt snapshots before one final receipt. The same shipment may also have multiple discrepancy snapshots as receipts accumulate. KPI queries must therefore control version/snapshot selection explicitly.

## 2. Fulfillment-plan semantics

A fulfillment plan contains:

- one immutable order/supply lineage;
- ship-from and ship-to location snapshots;
- `plannedShipAt`;
- `expectedDeliveryAt`;
- one or more lines;
- per-line SKU, planned quantity, supply source type and source reference;
- optional expected supply availability.

The domain enforces:

- expected delivery is after planned shipment;
- planned shipment cannot predate known committed supply availability;
- inventory-backed plan quantity cannot exceed pinned inventory reservation.

### 2.1 Plan quantity

`PlanQuantity` is a commitment/execution exposure, not sales. It can be used as denominator for fulfillment-completion measures only if the KPI contract says whether partial shipments are measured as-of a timestamp or after completion.

### 2.2 Supply-source mix

A useful native diagnostic is:

`SourceTypeShare = SUM(PlanQuantity for SourceType) / SUM(PlanQuantity)`

for each of inventory, inbound, production and drop-ship.

This is a true subset share because each planned line has exactly one source type.

Do not interpret one source type as universally favorable. It is a composition diagnostic unless strategy defines targets.

## 3. Shipment semantics

A shipment notice is immutable and contains:

- `shipmentNumber`;
- carrier;
- service level;
- optional tracking number;
- `shippedAt`;
- shipment-specific `expectedDeliveryAt`;
- lines with planned lineage and shipped quantity.

Cumulative shipment quantity for a fulfillment line cannot exceed planned quantity.

### 3.1 Partial shipments

A fulfillment plan can have multiple shipment notices. Therefore a KPI called simply `On-time Shipment Rate` is ambiguous.

It can mean at least:

- first-shipment on-time rate;
- full-quantity ship-complete on-time rate;
- shipped-unit on-time rate;
- shipment-notice event on-time rate.

These must be separate KPI IDs because their numerator, denominator and business decisions differ.

V16 does not create one generic umbrella metric. A concrete child KPI should be added only after the intended business meaning is selected.

### 3.2 Full-quantity completion

If later required, a full-quantity completion event must be derived when cumulative shipped quantity for every plan line reaches plan quantity. It cannot be approximated from the date of the first shipment notice.

## 4. Receipt semantics

A receipt snapshot contains line-level:

- `shippedQuantity`;
- `receivedQuantity`;
- `damagedQuantity`;
- `rejectedQuantity`;
- `acceptedQuantity`.

The domain identity is:

`AcceptedQuantity = ReceivedQuantity - DamagedQuantity - RejectedQuantity`

and:

`DamagedQuantity + RejectedQuantity <= ReceivedQuantity`.

These are hard reconciliation rules, not soft KPI targets.

## 5. Receipt Acceptance Rate

Canonical formula:

`ReceiptAcceptanceRate = SUM(AcceptedQuantity) / SUM(ReceivedQuantity)`

Example:

Receipt line A:

- received = 100;
- damaged = 5;
- rejected = 3;
- accepted = 92.

Receipt line B:

- received = 400;
- damaged = 4;
- rejected = 6;
- accepted = 390.

Wrong aggregation:

- A acceptance = 92%;
- B acceptance = 97.5%;
- average = 94.75%.

Correct:

`(92 + 390) / (100 + 400) = 482 / 500 = 96.4%`.

This is a ratio of summed components.

## 6. Damage Rate

`DamageRate = SUM(DamagedQuantity) / SUM(ReceivedQuantity)`

Using the same example:

`(5 + 4) / 500 = 1.8%`.

Damage is a true subset of received quantity.

Controls:

- damage >= 0;
- damage <= received;
- receipt lineage valid;
- do not substitute shipment quantity for receipt quantity unless a different KPI is intentionally defined.

## 7. Rejection Rate

`RejectionRate = SUM(RejectedQuantity) / SUM(ReceivedQuantity)`

Example:

`(3 + 6) / 500 = 1.8%`.

Damage rate and rejection rate are separate because a damaged item may be operationally different from a rejected item and can drive different claims, rework or insurance processes.

## 8. Accepted + damaged + rejected reconciliation

At line grain:

`Accepted + Damaged + Rejected = Received`.

At any correctly deduplicated aggregate perimeter:

`SUM(Accepted) + SUM(Damaged) + SUM(Rejected) = SUM(Received)`.

A failure means the source population or join is wrong. Do not publish three percentages that add to something other than 100% and call it rounding unless the absolute quantity identity also reconciles.

## 9. Receipt discrepancy snapshots

A discrepancy snapshot aggregates all receipts known for one shipment at that time.

It contains, by shipment line:

- shipped quantity;
- cumulative received quantity;
- cumulative accepted quantity;
- cumulative damaged quantity;
- cumulative rejected quantity;
- shortage quantity;
- overage quantity.

It also carries:

- finalization flag;
- status (`pending`, `clear`, `open`);
- issue count;
- exact receipt-snapshot IDs.

### 9.1 Shortage is finalization-sensitive

Native logic computes:

`ShortageQuantity = MAX(ShippedQuantity - ReceivedQuantity, 0)`

only after the receipt sequence is finalized.

Before finalization, shortage is set to zero because missing quantity may still arrive in a later partial receipt.

Therefore:

- `0 shortage` on a non-finalized discrepancy does not mean the shipment has no shortage;
- for shortage KPI, a non-finalized snapshot is `NOT_APPLICABLE` or excluded according to the contract;
- do not mix interim and final discrepancy snapshots.

### 9.2 Overage

Native logic computes:

`OverageQuantity = MAX(ReceivedQuantity - ShippedQuantity, 0)`.

Unlike shortage, overage can be visible before finalization because physically received quantity has already exceeded shipped quantity.

## 10. Finalized Shipment Shortage Rate

Canonical formula:

`ShortageRate = SUM(ShortageQuantity) / SUM(ShippedQuantity)`

Population:

- one latest finalized discrepancy snapshot per shipment;
- only shipment lines from that selected snapshot.

Example:

- shipped = 1,000;
- final cumulative received = 970;
- shortage = 30.

`30 / 1,000 = 3.0%`.

Do not average line-level shortage percentages if line quantities differ.

## 11. Overage Ratio

Canonical formula:

`OverageRatio = SUM(OverageQuantity) / SUM(ShippedQuantity)`.

This is **not** declared a true subset share because overage quantity is not a subset of shipped quantity. In abnormal data/physical scenarios received quantity may exceed shipped quantity by more than 100% of shipped quantity.

Therefore:

- ratio >= 0;
- values > 1 are possible and must not be silently capped;
- a very high value should trigger investigation/DQ review, not be converted to 100%.

Example:

- shipped = 100;
- received = 120;
- overage = 20;
- ratio = 20%.

## 12. On-time Final Receipt Rate

This KPI uses a **due cohort**, not a completed-only cohort.

Denominator:

`ShipmentsDueInPeriod = distinct shipment notices whose expectedDeliveryAt falls in the reporting period`.

Numerator:

`OnTimeFinalReceipts = distinct denominator shipments with a final receipt and final receivedAt <= shipment expectedDeliveryAt`.

Formula:

`OnTimeFinalReceiptRate = OnTimeFinalReceipts / ShipmentsDueInPeriod`.

### 12.1 Why completed-only is wrong

Suppose 10 shipments were due this week:

- 7 final receipts arrived on time;
- 1 arrived late;
- 2 remain open and overdue.

Wrong closed-only result:

`7 / (7 + 1) = 87.5%`.

Correct due-cohort result:

`7 / 10 = 70%`.

The two open overdue shipments are failures for this due cohort until/unless business policy later defines a restatement mechanism. They must not disappear from the denominator.

### 12.2 No due shipments

If no shipment deadline falls in the reporting period, result is `N/A`, not 0% and not 100%.

## 13. Delivery lead-time duration

If a duration KPI is needed:

`ReceiptLeadTime_i = FinalReceivedAt_i - ShippedAt_i`.

Population:

- completed final receipts only;
- exact shipment lineage;
- valid chronological pair.

Mean:

`SUM(Duration_i) / N`.

P90:

- recompute from raw durations;
- do not average carrier-level P90 values.

This duration KPI is separate from on-time compliance. One uses completed cases to describe elapsed duration; the other uses due cohort to prevent survivorship bias.

## 14. Snapshot deduplication

Receipt discrepancy is versioned/as-of data. A portfolio query must not sum every historical discrepancy snapshot for the same shipment.

Recommended selection key:

`ROW_NUMBER() OVER (PARTITION BY shipment_notice_snapshot_id ORDER BY created_at DESC, id DESC)`

and keep only row 1 for current-as-of analysis, subject to the query watermark.

For finalized-shortage KPI, select the latest finalized snapshot per shipment.

For historical as-of reports, select the latest snapshot whose `created_at <= as_of_timestamp`.

This selection logic is part of the temporal contract and must be tested.

## 15. Join-cardinality controls

Important lineage joins:

- one fulfillment plan -> many shipment notices;
- one shipment notice -> many receipt snapshots;
- one shipment notice -> many discrepancy snapshots over time;
- one discrepancy snapshot -> many receipt IDs in its evidence set;
- each final receipt is unique per shipment by database constraint.

Typical dangerous join:

`shipment -> receipts -> discrepancy snapshots`

without version selection. This can multiply quantities by receipt count x discrepancy count.

Controls:

1. state expected cardinality before query;
2. select one intended discrepancy version before exploding lines;
3. do not join receipt lines and discrepancy lines simultaneously unless keys and purposes are explicit;
4. reconcile total shipped quantity before and after join;
5. reconcile distinct shipment count before and after join.

## 16. Physical cost linkage

Receipt and discrepancy snapshots can be referenced by physical actual-cost ledger entries.

This enables native measures such as:

- quality cost per received unit;
- rework cost per accepted unit;
- freight cost per shipped unit;
- cost associated with damaged/rejected receipts;
- claim/recovery extensions when a governed claim entity exists.

But denominator choice is business-sensitive. Example: freight cost can be expressed per shipped unit, received unit, accepted unit, gross kg or chargeable kg. These are different KPI and must not share one ID.

## 17. Required fulfillment KPI tests

Minimum test library:

- shipment cumulative quantity cannot exceed plan quantity;
- receipt damage + rejection cannot exceed received;
- accepted identity reconciles;
- final receipt uniqueness per shipment;
- shortage is excluded/not-applicable before finalization;
- latest snapshot selection prevents historical double counting;
- overage is not capped at 100%;
- due-cohort on-time denominator includes open overdue shipments;
- no-due population returns N/A;
- time pair validates `receivedAt >= shippedAt` for duration KPI;
- ratio rollups use summed components;
- one shipment cannot be counted twice after joins;
- organisation/order-commit lineage remains intact.

## 18. Dashboard interpretation

A fulfillment dashboard should not show only favorable percentages. At minimum expose drill-down quantities behind a rate:

- numerator quantity/count;
- denominator quantity/count;
- period/as-of;
- selected snapshot status;
- number of open/unfinalized shipments;
- DQ status;
- formula version.

For example, `Shortage Rate = 2%` is incomplete without showing whether 80% of shipments are still unfinalized. The finalization population is part of the KPI meaning.
