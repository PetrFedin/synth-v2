# Order Margin Bridge

## Purpose

`Order Margin Bridge` is an explainability read model for closed wholesale-order economics. It does not own or mutate financial truth.

Canonical economic lineage remains:

`OrderCommitSnapshot -> ActualCostLedgerEntry -> LandedCostSnapshot -> MarginActualizationSnapshot -> CostCloseSnapshot -> PostCloseAdjustment -> new LandedCostSnapshot -> new MarginActualizationSnapshot`

The bridge answers one operational question: **why is the current effective margin different from the immutable margin at cost close?**

## Source of truth

The bridge is derived only from immutable records:

- `cost_close_snapshots`
- `post_close_adjustments`
- `actual_cost_ledger_entries`
- `order_fx_rate_snapshots`
- `landed_cost_snapshots`
- `margin_actualization_snapshots`

It must never persist a second mutable copy of current margin or landed cost.

## Bridge step

Each step represents exactly one post-close actual-cost entry and the economic re-actualization caused by it.

A step carries:

- adjustment identity and chain position;
- original source amount and source currency;
- FX snapshot/rate/type/source when conversion was required;
- converted amount in order currency;
- cost type, SKU and source reference;
- adjustment reason;
- prior and resulting landed-cost snapshot identities and values;
- prior and resulting margin-actualization snapshot identities and values;
- cost delta and opposite margin delta;
- cumulative deltas from immutable cost close.

## Required invariants

1. Step numbers are contiguous inside one `CostCloseSnapshot`.
2. `previousAdjustmentId` forms one unbroken serialized chain.
3. Every step belongs to the same `OrderCommitSnapshot` and `CostCloseSnapshot`.
4. `costDeltaAmount == convertedAmount` for the late actual-cost entry.
5. `marginDeltaAmount == -costDeltaAmount`.
6. Prior landed/margin snapshot ids are the previous step's resulting snapshot ids; the first step starts from cost close.
7. Resulting landed cost equals previous landed cost plus cost delta.
8. Resulting contribution margin equals previous contribution margin plus margin delta.
9. Cumulative deltas reconcile to every preceding step.
10. Immutable cost-close base values never change.

If any invariant is broken, the bridge must fail closed rather than display a plausible but false financial explanation.

## Effective economics

- No post-close adjustments: bridge status = `CLOSED`; effective economics = immutable cost-close economics.
- One or more adjustments: bridge status = `ADJUSTED`; effective economics = the final adjustment's Landed Cost and Margin Actualization snapshots.

`Order Economics Position` remains the compact current-state read model. `Order Margin Bridge` is the detailed explanatory model behind that position.

## PostgreSQL projection

Migration `040_order_margin_bridge_view.sql` creates `order_margin_bridge_steps` as a pure derived view. The view adds deterministic `step_number`, source/FX context and cumulative cost/margin deltas without introducing a writable margin-bridge table.
