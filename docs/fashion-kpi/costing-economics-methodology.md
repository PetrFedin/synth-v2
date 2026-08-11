# SYNTH-V2 native costing and economics KPI methodology

Version: 16.0  
Status: governed implementation contract for current SYNTH-V2 order-economics sources.

This document narrows the general KPI methodology to the cost/economics objects that already exist in the repository. It intentionally uses only fields and lineage that exist in current SYNTH-V2 code and migrations. External ERP, supplier invoice, customs, WMS or GL fields are not invented here.

## 1. Source-of-truth hierarchy

For native order economics, KPI computation must respect this lineage:

`Order -> immutable OrderCommitSnapshot -> SupplyCommitmentSnapshot -> ActualCostLedgerEntry -> LandedCostSnapshot -> MarginActualizationSnapshot -> CostAllocationRun -> CostCloseReadinessSnapshot -> CostCloseSnapshot`

Physical fulfillment costs may additionally carry:

`FulfillmentPlanSnapshot -> ShipmentNoticeSnapshot -> ReceiptSnapshot -> ReceiptDiscrepancySnapshot`

A KPI query must not join a cost amount from one order commit to revenue, supply, shipment or allocation data from another order commit. `order_commit_snapshot_id` is therefore a semantic lineage key, not merely a technical foreign key.

## 2. Actual cost ledger semantics

An actual-cost ledger entry contains both source and order-currency amounts:

- `sourceAmount` / `source_amount`;
- `sourceCurrency` / `source_currency`;
- optional `fxRateSnapshotId`;
- converted `amount` in committed order currency;
- `costType`;
- optional `sku`;
- `sourceRef`;
- `occurredAt` and `recordedAt`;
- correction/reversal lineage.

### 2.1 Source amount vs order-currency amount

Do not combine `sourceAmount` values across currencies. A money KPI whose canonical currency is order currency must use the converted `amount` after the exact FX snapshot rules have been applied.

A separate FX-analysis KPI may use source amounts and rate snapshots, but that requires its own formula/version and currency-pair contract.

### 2.2 Event time vs posting time

`occurredAt` answers when the underlying economic event occurred. `recordedAt` answers when SYNTH-V2 recorded it.

They are not interchangeable.

Examples:

- period actual logistics cost by economic occurrence -> use `occurredAt`;
- data latency / late posting -> `recordedAt - occurredAt`;
- audit trail of corrections -> use `recordedAt` and correction lineage.

Changing the period basis from occurred time to recorded time changes KPI semantics and requires a new formula version.

### 2.3 Corrections and reversals

A correction creates a reversal of the previous ledger entry plus a replacement entry. Therefore:

- do not remove reversal entries and keep the replaced original;
- do not count both original and replacement as independent current economic cost without the reversal;
- monetary totals use the signed ledger;
- event-count KPI must specify whether it counts raw ledger rows, economic source events or distinct `correctionId` events.

For cost amounts, the normal calculation is:

`ActualCost = SUM(signed amount)`

for the exact governed ledger population.

For correction incidence, use a separate event definition such as distinct correction IDs per eligible original cost events. Do not infer correction frequency from signed money values.

## 3. Physical actual-cost lineage

The physical actual-cost service adds immutable fulfillment lineage to qualifying cost entries:

- `physicalLineageVersion`;
- `fulfillmentPlanSnapshotId`;
- `shipmentNoticeSnapshotId`;
- optional `receiptSnapshotId`;
- optional `receiptDiscrepancySnapshotId`.

Current native rules include:

- physical cost types are freight, insurance, duty, brokerage, warehouse, quality, rework, packaging and other;
- quality and rework costs require immutable receipt evidence;
- SKU-scoped physical cost must reference a SKU present in the immutable shipment notice;
- a correction must remain on the exact physical execution lineage.

This enables cost-to-service and quality-cost analysis without joining costs to shipment records by fuzzy dates or free-text references.

### Example: receipt-linked rework cost per accepted unit

For a governed set of receipt-linked rework cost entries:

`ReworkCostPerAcceptedUnit = SUM(rework order-currency amount) / SUM(accepted units on matched receipt lineage)`

Controls:

1. every numerator row has `costType = rework`;
2. every numerator row has `receiptSnapshotId`;
3. receipt belongs to the same shipment/order-commit lineage;
4. denominator counts the accepted quantity only once per governed receipt snapshot;
5. zero accepted units with positive rework cost is `INVALID`, not infinity and not zero.

This KPI is not yet added to the canonical bundle because the business choice between receipt-level, shipment-level and SKU-level denominator requires owner confirmation.

## 4. Landed cost

The native landed-cost snapshot is built from the exact set of cost-entry IDs and exposes:

- signed component totals by cost type;
- total cost;
- cost-entry IDs;
- supply commitment lineage;
- `supplyLineageComplete`.

### 4.1 Total landed cost

At one immutable snapshot:

`TotalLandedCost = SUM(Amount_i)`

where every `Amount_i` is already in the committed order currency and belongs to the exact order commit.

The domain requires the resulting total to be positive.

### 4.2 Component share

For a selected component `c`:

`ComponentShare_c = SUM(ComponentAmount_c) / SUM(TotalLandedCost)`

This is a signed ratio, not necessarily a true subset share. A credit/correction may make a component negative. Do not cap at zero and do not force 0..1 validation.

Example:

- factory = 600;
- freight = 100;
- duty = 80;
- warehouse = 20;
- credit = -50;
- total = 750.

Freight share:

`100 / 750 = 0.133333 = 13.33%`.

Credit effect:

`-50 / 750 = -0.066667 = -6.67%`.

The signed credit is economically meaningful and must not disappear because a generic share validator expects only positive subsets.

### 4.3 Version selection

Never sum multiple landed-cost snapshots for the same order commit. For portfolio reporting, select one governed effective snapshot per order commit according to the reporting/restatement policy, then aggregate amounts.

## 5. Contribution margin

The native margin actualization stores:

- `netRevenue`;
- `landedCost`;
- `contributionMarginAmount`;
- `contributionMarginPercent`.

### 5.1 Contribution margin amount

`ContributionMarginAmount = NetRevenue - LandedCost`

Negative values are valid and indicate that landed cost exceeds committed net revenue.

Example:

- net revenue = 1,000;
- landed cost = 760.

`CM amount = 1,000 - 760 = 240`.

### 5.2 Contribution margin ratio

Canonical KPI formula:

`ContributionMarginRatio = ContributionMarginAmount / NetRevenue`

Example:

`240 / 1,000 = 0.24 -> display 24.00%`.

### 5.3 Critical scale rule

Current SYNTH-V2 `calculateMoneyPercentage` multiplies the ratio by 100. Therefore the runtime/source field `contributionMarginPercent` is stored as percentage points, e.g. `24.0000`, not canonical decimal `0.24`.

The governed KPI layer must not silently copy `24.0000` into a decimal-ratio observation and then display it as a percent, which would produce `2,400%`.

Canonical rule:

- KPI storage scale: decimal ratio (`0.24`);
- KPI display: `24.00%`;
- preferred calculation: `contributionMarginAmount / netRevenue`;
- source `contributionMarginPercent / 100` is a reconciliation mirror.

The same rule applies to SKU `contributionMarginPercent` in cost-allocation `skuEconomics`.

### 5.4 Portfolio aggregation

Do not average order-level margin percentages.

Order A:

- margin = 90;
- revenue = 100;
- ratio = 90%.

Order B:

- margin = 400;
- revenue = 500;
- ratio = 80%.

Wrong portfolio result:

`(90% + 80%) / 2 = 85%`.

Correct:

`(90 + 400) / (100 + 500) = 81.6667%`.

The portfolio ratio is a ratio of sums.

## 6. Cost allocation

Current policy bases are:

- `direct`;
- `unit`;
- `net_value`;
- `custom`.

An allocation run is bound to:

- exact order commit;
- exact landed-cost snapshot;
- approved allocation-policy version;
- exact current cost-entry set.

### 6.1 Direct allocation

If the cost entry is already SKU-specific, allocation basis is direct:

`AllocatedAmount = EntryAmount` to that SKU.

### 6.2 Unit-weighted allocation

For a shared entry:

`Weight_sku = CommittedQuantity_sku`

`Share_sku = Weight_sku / SUM(Weight)`

`AllocatedAmount_sku = EntryAmount * Share_sku`

with the final SKU receiving the rounding remainder so the monetary total reconciles exactly.

Example:

- shared freight = 300;
- SKU A quantity = 100;
- SKU B quantity = 200.

Weights 100 and 200, total 300.

A share = 1/3; allocation = 100.  
B share = 2/3; allocation = 200.

### 6.3 Net-value allocation

`Weight_sku = Quantity_sku * UnitPrice_sku`

Use when policy explicitly defines value as the allocation driver. This is not interchangeable with unit allocation.

### 6.4 Custom allocation

Custom weights are governed policy inputs. Requirements:

- every weight finite and non-negative;
- no SKU outside committed order;
- total weight > 0;
- policy version immutable for historical run reproducibility.

### 6.5 Allocation reconciliation

The repository already enforces three important identities:

`SUM(allocation.allocatedAmount) = allocatedTotal`

`SUM(skuEconomics.allocatedLandedCost) = allocatedTotal`

`allocatedTotal = landedCost.totalCost`

The KPI layer should persist these as control results rather than treating a failed identity as a small variance that can be averaged away.

### 6.6 SKU unit landed cost

`SkuUnitLandedCost = SkuAllocatedLandedCost / SkuQuantity`

Example:

- allocated landed cost = 1,250;
- quantity = 50.

`1,250 / 50 = 25 order-currency/unit`.

Portfolio aggregation across SKU must use summed cost divided by summed units when the currency and business perimeter are compatible.

## 7. Cost-close readiness

Every readiness snapshot requires exactly four requirement types:

1. factory;
2. freight;
3. duty;
4. credits.

Each is one of:

- pending;
- complete;
- waived.

### 7.1 Resolution rate

`ResolvedRate = COUNT(status in {complete, waived}) / 4`

Example: factory complete, freight complete, duty pending, credits waived.

`3 / 4 = 75%`.

This does **not** mean 75% evidence completeness because waived is resolved without cost evidence.

### 7.2 Evidence completion rate

If a separate KPI is required:

`EvidenceCompleteRate = COUNT(status = complete) / 4`

The two KPI answer different questions and should not be merged.

### 7.3 Waiver rate

`WaiverRate = COUNT(status = waived) / 4`

Waiver rate is governance/exception information. A lower value may be desirable, but there are legitimate waivers; default publication should therefore be diagnostic unless policy defines a target.

### 7.4 READY_TO_CLOSE is a state, not a percentage

The domain derives a discrete readiness status based on blocking requirements. Do not replace that state with a high percentage. A 75% resolution rate with duty still pending is not ready to close.

A cost close can be created only from a readiness snapshot whose state is `READY_TO_CLOSE`, with exact landed-cost and margin lineage.

## 8. Periodization and restatement

For actual cost reporting, distinguish:

- economic event period (`occurredAt`);
- recording/audit period (`recordedAt`);
- immutable snapshot creation time (`createdAt`);
- cost close time (`closedAt`).

Post-close corrections must not rewrite historical closed snapshots in place. Restated KPI observations need:

- original run/observation reference;
- new run/observation;
- restatement reason;
- source correction lineage;
- recalculation timestamp;
- effective reporting policy.

## 9. Required control tests

Every native cost/economics KPI should select applicable tests from this minimum set:

- exact order-commit lineage;
- no stale landed-cost cost-entry set;
- currency matches committed order currency;
- FX snapshot required when source currency differs;
- signed reversal behavior preserved;
- physical lineage present when KPI requires shipment/receipt attribution;
- source percentage scale normalized before KPI publication;
- ratio denominator positive where contract requires it;
- ratio-of-sums used for portfolio margin/unit cost;
- allocation totals reconcile exactly;
- cost-close readiness requirement set complete and unique;
- waived requirements carry reason and no evidence IDs;
- complete requirements carry valid non-reversed evidence;
- historical immutable versions are never overwritten.

## 10. Release interpretation

A native source mapping can be `VERIFIED` because the repository contains the field and persistence contract, while the KPI itself remains `VALIDATION_PENDING` or `UAT_PENDING`.

These are different gates:

- mapping gate: does the source field truly exist and have governed lineage?;
- calculation gate: does the implementation calculate the intended formula correctly?;
- reconciliation gate: does the result tie to control totals?;
- business gate: do owner and steward accept the population, timing and interpretation?;
- publication gate: is the observation safe to expose to users/automation?

Do not collapse these gates into one boolean `ready` flag.
