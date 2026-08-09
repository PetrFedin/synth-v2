# SYNTH-V2 — Order → Supply → Cost → Margin baseline

## Canonical spine

`WholesaleOrder -> OrderCommitSnapshot -> SupplyCommitmentSnapshot -> ActualCostLedgerEntry -> LandedCostSnapshot -> MarginActualizationSnapshot -> CostCloseReadinessSnapshot -> CostCloseSnapshot -> PostCloseAdjustment -> new LandedCostSnapshot -> new MarginActualizationSnapshot`

SKU economics extends the spine without replacing it:

`LandedCostSnapshot -> CostAllocationPolicyVersion -> CostAllocationRunSnapshot -> SkuEconomics`

Explainability extends the closed economics without replacing it:

`CostCloseSnapshot -> order_margin_bridge_steps -> effective closed economics`

## Truth ownership

- `OrderCommitSnapshot` — immutable accepted commercial deal.
- `SupplyCommitmentSnapshot` — immutable supply commitment basis.
- `ActualCostLedgerEntry` — append-only actual cost truth; corrections use reversal + replacement.
- `OrderFxRateSnapshot` — immutable FX conversion basis.
- `LandedCostSnapshot` — immutable actualized landed cost from an exact cost ledger set.
- `MarginActualizationSnapshot` — immutable margin result from an exact Landed Cost snapshot.
- `CostCloseReadinessSnapshot` — immutable reconciliation evidence for factory/freight/duty/credits.
- `CostCloseSnapshot` — immutable closed economic baseline.
- `PostCloseAdjustment` — serialized late-cost chain; never rewrites cost close.
- `CostAllocationPolicyVersion` — immutable brand allocation policy.
- `CostAllocationRunSnapshot` — immutable allocation of an exact Landed Cost snapshot to SKU economics.

No derived read model may become a second mutable source of financial truth.

## Cost close lifecycle

Readiness states:

`OPEN -> WAITING_FOR_FREIGHT -> WAITING_FOR_DUTY -> WAITING_FOR_CREDITS -> READY_TO_CLOSE`

A completed reconciliation requirement must cite evidence from the exact Landed Cost cost-entry set. A waived requirement must carry an explicit reason. If the ledger changes after readiness evaluation, the basis becomes stale and cost close is blocked until Landed Cost, Margin and Readiness are re-actualized.

After close, normal cost recording is blocked. Late invoice/credit handling is only:

`PostCloseAdjustment -> ActualCostLedgerEntry -> new LandedCostSnapshot -> new MarginActualizationSnapshot`

The immutable close remains the comparison baseline.

## Order Economics Position

Compact current-state read model:

- `OPEN`
- `WAITING_FOR_FREIGHT`
- `WAITING_FOR_DUTY`
- `WAITING_FOR_CREDITS`
- `READY_TO_CLOSE`
- `STALE`
- `CLOSED`
- `ADJUSTED`

It resolves the effective Landed Cost and Margin snapshot identities while preserving the immutable base close and cumulative post-close deltas.

## Margin Bridge

`order_margin_bridge_steps` is a derived PostgreSQL view. It explains every post-close change with:

- late cost/credit source;
- source amount/currency;
- FX snapshot/rate/source;
- converted order-currency amount;
- cost type / SKU / source reference;
- reason;
- prior/result Landed Cost snapshots;
- prior/result Margin snapshots;
- step and cumulative cost/margin delta.

The bridge fails closed if lineage or arithmetic is inconsistent.

## SKU Cost Allocation

Allocation bases:

- `direct` — exact SKU when the cost entry already carries SKU identity;
- `unit` — committed quantity share;
- `net_value` — committed net-revenue share;
- `custom` — explicit non-negative SKU weights supplied for the exact cost entry.

Rules:

1. Allocation runs are pinned to one `OrderCommitSnapshot`, one `LandedCostSnapshot` and one `CostAllocationPolicyVersion`.
2. The supplied actual-cost ledger set must exactly equal the Landed Cost cost-entry set.
3. Every source cost is allocated exactly once across the committed SKU set.
4. Four-decimal rounding remainder is deterministically assigned so allocated totals exactly equal source totals.
5. Negative costs/credits allocate with the same basis and improve contribution margin.
6. Sum of SKU allocated landed cost must equal order Landed Cost.
7. `SkuEconomics` contains committed quantity, net revenue, allocated landed cost, contribution margin amount and contribution margin percent.

## Runtime / contract entrypoints

Order economics:

- `src/runtime/postgres-order-economics-runtime.mjs`
- `src/http/order-economics-route-bundle.mjs`
- `src/http/v2-complete-openapi.mjs`

Complete economics including SKU allocation:

- `src/runtime/postgres-economics-v2-runtime.mjs`
- `src/http/economics-route-bundle.mjs`
- `src/http/v2-economics-openapi.mjs`

Full SYNTH-V2 assembly currently exposes the complete order-economics service/route bundle/OpenAPI through `src/runtime/postgres-syntha-v2-runtime.mjs`; the legacy base handler remains a compatibility surface until its central route registry is switched to the complete economics bundle.

## Next architecture slice

After CI is green on the same head, the next economics slice is `Supplier Economic Performance / Cost of Failure`, fed from immutable sourcing/production/quality/cost lineage rather than supplier-entered mutable scores.
