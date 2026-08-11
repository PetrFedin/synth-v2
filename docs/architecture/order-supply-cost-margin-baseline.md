# SYNTH-V2 — Order → Supply → Cost → Margin baseline

## Canonical spine

`WholesaleOrder -> OrderCommitSnapshot -> SupplyCommitmentSnapshot -> ActualCostLedgerEntry -> LandedCostSnapshot -> MarginActualizationSnapshot -> CostCloseReadinessSnapshot -> CostCloseSnapshot -> PostCloseAdjustment -> new LandedCostSnapshot -> new MarginActualizationSnapshot`

SKU economics extends the spine without replacing it:

`LandedCostSnapshot -> CostAllocationPolicyVersion -> CostAllocationRunSnapshot -> SkuEconomics`

Explainability extends the closed economics without replacing it:

`CostCloseSnapshot -> order_margin_bridge_steps -> effective closed economics`

Physical recovery extends the same economics without a second financial ledger:

`ReceiptDiscrepancy -> Claim -> Resolution -> SupplierRecovery -> ActualCostLedgerEntry -> LandedCostSnapshot -> MarginActualizationSnapshot`

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
- `SupplierRecovery` — immutable attribution/evidence snapshot for a supplier credit whose financial truth remains the canonical negative Actual Cost entry.

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

## Supplier Economic Performance / Cost of Failure

Supplier performance is derived from immutable operational and economic evidence; no supplier-entered mutable score is authoritative.

Operational evidence:

- Production Orders provide committed supplier, SKU, quantity and due-date context.
- Production Executions provide actual ready-for-QC timing against the immutable delivery due date.
- Final Quality run history provides first-pass outcome, rework incidence, rejection and defect counts.

Economic evidence is currency-separated and deliberately conservative:

- supplier recovery credits come only from immutable `SupplierRecovery` snapshots backed by canonical negative `ActualCostLedgerEntry` records;
- positive physical `quality` / `rework` actual costs are attributed to a supplier only when the exact Receipt Discrepancy has recorded recoveries to one unique supplier;
- a discrepancy linked to more than one supplier is not allocated heuristically and is excluded from supplier monetary attribution;
- costs without a governed supplier attribution path are excluded rather than guessed;
- different currencies are never summed into one supplier total without an explicit immutable FX basis.

Derived read models:

- `supplier_operational_performance` — Production Order, execution-timeliness and Final Quality metrics by brand + supplier;
- `supplier_failure_economics_by_currency` — confirmed physical quality/rework cost, supplier recovery credit and net confirmed failure cost by brand + supplier + currency.

The API projection is read-only and requires brand-side margin visibility. Its attribution contract is versioned as `unique-recovery-supplier-v1`.

## Runtime / contract entrypoints

Order economics:

- `src/runtime/postgres-order-economics-runtime.mjs`
- `src/http/order-economics-route-bundle.mjs`
- `src/http/v2-complete-openapi.mjs`

Complete economics including SKU allocation:

- `src/runtime/postgres-economics-v2-runtime.mjs`
- `src/http/economics-route-bundle.mjs`
- `src/http/v2-economics-openapi.mjs`

Supplier economic performance:

- `src/application/supplier-economic-performance-service.mjs`
- `src/infrastructure/postgres-supplier-economic-performance-reader.mjs`
- `src/http/supplier-economic-performance-routes.mjs`
- `src/http/supplier-economic-performance-openapi.mjs`

Full SYNTH-V2 assembly exposes the complete economics, physical execution, supplier recovery and supplier performance services through the production PostgreSQL runtime and central route/OpenAPI composition.

## Next architecture slice

After Supplier Economic Performance is green on the same head, prioritize enterprise hardening: tenant/isolation stress, concurrency and lock testing, outbox retry/dead-letter recovery, observability/SLOs, migration safety, backup/restore drills and load gates. ODS migration of remaining PLM workspaces continues without creating new local visual dialects.
