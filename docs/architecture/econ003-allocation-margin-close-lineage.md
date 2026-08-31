# ECON-003 — Cost Allocation → Margin → Close lineage

Status: IMPLEMENTED at code/runtime lineage level in PR #116 after repository Verify and PostgreSQL/Syntha V2 CI passed on the implementation head. Final merge still requires the documentation-sync head to pass the same required gates. Live Product → Margin business acceptance remains tracked separately by `ACC-004`.

## Purpose

Close the ProductSku economics lineage from immutable actual cost through allocation, margin and close, including late costs recorded after Cost Close.

Margin and Cost Close remain aggregate order economics. Exact ProductSku allocation is immutable provenance attached to the aggregate snapshots; reconciliation must never silently invent ProductSku identity, select an arbitrary allocation run, or rewrite the closed historical basis.

## Canonical lineage

```text
ActualCostLedgerEntry
→ LandedCostSnapshot
→ CostAllocationRunSnapshot
→ MarginActualizationSnapshot(allocationStatus=current)
→ CostCloseReadinessSnapshot
→ CostCloseSnapshot
→ PostCloseAdjustment
→ adjusted LandedCostSnapshot
→ MarginActualizationSnapshot(allocationStatus=pending-post-close)
→ exact new CostAllocationRunSnapshot
→ PostCloseAllocationReconciliationSnapshot
→ reconciled MarginActualizationSnapshot(allocationStatus=current)
```

Canonical committed line identity remains `orderLineNo + productSkuId`; textual `sku` is display/compatibility only.

## Lineage modes

The mode is resolved only from immutable OrderCommit lines:

- every line has positive `orderLineNo` plus nonblank `productSkuId` → `product-sku-v2`;
- no line has either canonical identity field → `legacy`;
- mixed or partially populated identity fails closed with `ORDER_COMMIT_ECONOMICS_LINEAGE_MIXED`.

No code may infer ProductSku from textual SKU.

## Pre-close margin actualization

`POST /v2/orders/:orderId/margin/actualize` accepts:

- required `landedCostSnapshotId`;
- optional at HTTP schema level `costAllocationRunSnapshotId`; it is domain-required for canonical ProductSku commits and omitted for explicit legacy commits.

For canonical ProductSku, the immutable allocation run must match the exact order, order version, OrderCommitSnapshot, LandedCostSnapshot, currency, active `costEntryIds` set and landed total; it must carry `lineageMode=product-sku-v2` and an approved allocation policy version.

A valid canonical MarginActualizationSnapshot carries `allocationStatus=current`, exact allocation run id/hash/policy/mode, `aggregateContentHash`, and a content hash committing to aggregate economics plus allocation provenance. Legacy margin carries `allocationStatus=legacy-not-applicable` and null allocation pins.

## Cost-close readiness and close

Canonical readiness is allowed only from a MarginActualizationSnapshot whose allocation status is `current`. Readiness freezes the same allocation run id, content hash, policy version and lineage mode.

Cost Close requires readiness and margin to agree on that exact immutable allocation pin. Close freezes it again. Neither readiness nor close may use a canonical `pending-post-close` margin.

Legacy readiness/close remain valid with `legacy-not-applicable` and null ProductSku allocation pins.

## Generic post-close late cost

The generic post-close adjustment endpoint is deliberately aggregate-first. A late cost creates a new exact ActualCost ledger entry, a new LandedCostSnapshot and a new aggregate MarginActualizationSnapshot. It cannot automatically create ProductSku allocation because the approved policy may be `custom` and require explicit per-entry/per-line weights.

For canonical ProductSku commits the immediate result is therefore:

- `allocationStatus=pending-post-close`;
- current allocation run id/hash/policy pins are null;
- lineage mode remains `product-sku-v2`;
- the immutable PostCloseAdjustment preserves the allocation run id/hash frozen by the original close and records previous/resulting allocation statuses.

This pending state is valid aggregate economics but is not current detailed ProductSku economics.

## Exact post-close allocation reconciliation

Entry point:

```text
POST /v2/orders/{orderId}/cost-close/adjustments/{postCloseAdjustmentId}/allocation-reconcile
Idempotency-Key: <command id>
{
  "costAllocationRunSnapshotId": "..."
}
```

The caller must first create an exact immutable CostAllocationRunSnapshot for the adjusted LandedCostSnapshot through the existing cost-allocation capability. The reconciliation command never searches for, guesses, or auto-selects a run.

The command is allowed only when all of the following are true:

1. the OrderCommit is canonical `product-sku-v2`;
2. the CostClose is immutable and belongs to the exact order/commit;
3. the requested PostCloseAdjustment is the latest adjustment for that CostClose;
4. that adjustment has not already been reconciled;
5. its exact adjusted LandedCostSnapshot and pending MarginActualizationSnapshot are used;
6. pending margin has `allocationStatus=pending-post-close`;
7. the supplied CostAllocationRunSnapshot matches that exact landed-cost basis, order/version/commit, currency, active cost-entry set and total;
8. the allocation run has a valid timestamp and the reconciliation does not predate either the adjustment or allocation run.

Success creates two new immutable facts in one transaction:

- `PostCloseAllocationReconciliationSnapshot`;
- a new MarginActualizationSnapshot with `allocationStatus=current` bound to the exact allocation run id/hash/policy/mode.

The reconciliation is provenance-only with respect to aggregate economics. It must preserve the pending margin's `aggregateContentHash`, revenue, landed cost, contribution margin amount and contribution margin percent exactly. If any aggregate amount changes, reconciliation fails closed.

The original CostClose, PostCloseAdjustment, pending margin and previous allocation snapshots remain immutable history.

A later PostCloseAdjustment does not rewrite or delete an earlier reconciliation. It becomes the latest effective aggregate basis and returns the effective allocation status to `pending-post-close` until that later adjustment receives its own exact allocation and reconciliation.

## Effective order economics position

`GET /v2/orders/{orderId}/economics-position` is the canonical effective read model for close/post-close economics.

It now exposes:

- `postCloseAllocationReconciliationSnapshotId`;
- `allocationStatus`;
- `costAllocationRunSnapshotId`;
- `costAllocationRunContentHash`;
- `costAllocationPolicyVersionId`;
- `costAllocationLineageMode`.

Resolution rules:

- pre-close/readiness: provenance comes from the effective margin;
- closed with no adjustment: provenance comes from the immutable CostClose;
- latest adjustment without reconciliation: the effective pending margin is returned and current allocation pins remain null;
- latest adjustment with reconciliation: the reconciled current margin and exact new allocation provenance are returned;
- reconciliation attached to an older adjustment can never override a newer adjustment.

## Persistence

Migration `074_post_close_allocation_reconciliation.sql` adds `post_close_allocation_reconciliation_snapshots`.

Database guarantees include:

- one reconciliation per `post_close_adjustment_id`;
- one reconciled margin snapshot per reconciliation row;
- exact foreign-key lineage to order/commit/close/adjustment/pending margin/landed cost/allocation policy/allocation run/current margin;
- scalar ↔ JSON payload checks for identity, orderVersion, timestamps, statuses and content hash;
- exact pending/current allocation-status and allocation-provenance validation;
- unchanged aggregate economics validation;
- immutable UPDATE/DELETE rejection.

The PostgreSQL order-economics store exposes the transactional readers/writer needed by reconciliation and the effective economics-position projection.

## Runtime and authorization

Both the dedicated PostgreSQL economics runtime and the main production PostgreSQL runtime compose `createPostCloseAllocationReconciliationService` into `orderEconomics`.

Mutation authorization requires `COST_MANAGE`; reads of the effective economics position continue to require `MARGIN_READ`.

The reconciliation mutation is command-idempotent. Reusing an Idempotency-Key with a different order/adjustment/allocation fingerprint fails closed.

## Events

Successful reconciliation emits:

- `margin.actualized` for the new current margin, including exact allocation provenance and reconciliation id;
- `cost-close.allocation-reconciled` for the immutable reconciliation fact.

Existing close/adjustment events remain unchanged historical facts.

## API/OpenAPI

The public namespace remains `/v2` and composed OpenAPI version remains `1.17.0`; this closes a v2 invariant gap rather than creating a parallel API version.

OpenAPI exposes the reconciliation input/result/snapshot schemas, the new mutation path, and the effective economics-position reconciliation/allocation fields.

## Failure behavior

Canonical mismatches fail closed: wrong order/version/commit/landed basis, wrong currency, wrong cost-entry set/total, missing/invalid allocation timestamp, non-latest adjustment, duplicate reconciliation, wrong pending margin, changed aggregate economics, invalid temporal order, or stale/mismatched effective reconciliation.

No fallback may infer ProductSku from textual SKU, pick the newest allocation by timestamp, reuse the closed allocation after a late-cost adjustment, or silently present pending detailed economics as current.

## Automated evidence

Focused regressions:

- `tests/econ003-allocation-margin-close-lineage.test.mjs`;
- `tests/econ003-post-close-allocation-reconciliation.test.mjs`;
- `tests/econ003-post-close-allocation-reconciliation-migration.test.mjs`;
- `tests/order-economics-position.test.mjs`.

Implementation-head GitHub evidence on PR #116:

- repository Verify run `33345573039` — success;
- Syntha V2 CI run `33345572980`, including PostgreSQL verification — success;
- PR diff audited for runtime, migration and authoritative ТЗ scope.

The final documentation-sync head must pass the same required gates before merge; a green implementation head is evidence for code-level closure but is not permission to merge a later unverified head.

## Remaining acceptance boundary

The known code/runtime gap for exact post-close ProductSku reallocation/reconciliation is closed by PR #116 once the final PR head is green and merged. Live Product → Margin business evidence remains governed separately by `ACC-004` and must not be conflated with code-level lineage completeness or `PROD-PROVEN` status.
