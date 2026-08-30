# ECON-003 — Cost Allocation → Margin → Close lineage

Status: IMPLEMENTED/PARTIAL on `fix/econ003-allocation-margin-close-lineage`; root `ARCHITECTURE.md` synchronization is a mandatory PR gate.

## Purpose

Close the confirmed gap where exact ProductSku cost allocation existed as an immutable analytical snapshot but aggregate MarginActualization and Cost Close did not prove which allocation snapshot produced the detailed ProductSku economics basis.

This change does not redefine margin or close as per-SKU documents. It adds immutable provenance from exact ProductSku allocation into the aggregate margin/close chain.

## Canonical lineage

```text
ActualCostLedgerEntry
→ LandedCostSnapshot
→ CostAllocationRunSnapshot
→ MarginActualizationSnapshot
→ CostCloseReadinessSnapshot
→ CostCloseSnapshot
→ PostCloseAdjustment
→ new LandedCostSnapshot
→ new MarginActualizationSnapshot(allocationStatus=pending-post-close)
```

Canonical committed line identity remains `orderLineNo + productSkuId`; textual `sku` is display/compatibility only.

## Lineage modes

The mode is resolved only from immutable OrderCommit lines:

- every line has positive `orderLineNo` plus nonblank `productSkuId` → `product-sku-v2`;
- no line has either canonical identity field → `legacy`;
- mixed or partially populated identity fails closed with `ORDER_COMMIT_ECONOMICS_LINEAGE_MIXED`.

No code may infer ProductSku from textual SKU.

## Margin actualization

`POST /v2/orders/:orderId/margin/actualize` accepts:

- required `landedCostSnapshotId`;
- optional at HTTP schema level `costAllocationRunSnapshotId`; it is domain-required for canonical ProductSku commits and omitted for explicit legacy commits.

For canonical ProductSku, the immutable allocation run must match the exact:

- order id;
- order version;
- OrderCommitSnapshot id;
- LandedCostSnapshot id;
- currency;
- active `costEntryIds` set;
- landed total (`allocatedTotal === landedCost.totalCost`);
- `lineageMode === product-sku-v2`;
- approved allocation policy version id carried by the run.

A valid canonical MarginActualizationSnapshot carries:

- `allocationStatus = current`;
- `costAllocationRunSnapshotId`;
- `costAllocationRunContentHash`;
- `costAllocationPolicyVersionId`;
- `costAllocationLineageMode = product-sku-v2`;
- `aggregateContentHash` preserving the previous aggregate margin hash;
- a new `contentHash` committing to the aggregate hash plus allocation provenance.

Legacy margin carries `allocationStatus = legacy-not-applicable` and null allocation pins. ProductSku identifiers are never synthesized.

## Cost-close readiness

Canonical readiness is allowed only from a MarginActualizationSnapshot whose allocation status is `current`. Readiness freezes the same allocation run id, content hash, policy version and lineage mode in addition to the existing landed/margin/readiness basis.

A canonical margin in `pending-post-close` or without an allocation pin cannot become close-ready.

Legacy readiness remains valid with `legacy-not-applicable` and null ProductSku allocation pins.

## Cost close

Canonical CostCloseSnapshot must use readiness and margin that agree on the exact immutable allocation pin. Close freezes the same allocation run id/hash/policy/mode. A mismatched or missing readiness allocation basis fails closed.

## Post-close late cost

The generic post-close endpoint remains aggregate-only. A late cost creates a new LandedCostSnapshot and aggregate MarginActualizationSnapshot but cannot automatically invent the exact ProductSku allocation, because approved policy may be `custom` and require new explicit weights.

For canonical ProductSku commits the resulting margin is therefore:

- `allocationStatus = pending-post-close`;
- current allocation run id/hash/policy pins are null;
- lineage mode remains `product-sku-v2`;
- the PostCloseAdjustment preserves the allocation run id/hash frozen by the original close and records previous/resulting allocation statuses.

This is intentionally not presented as reconciled exact ProductSku economics. A subsequent reallocation/reconciliation command remains required to move post-close economics back to `current`.

Legacy post-close stays `legacy-not-applicable`.

## Persistence

No SQL migration is required for the provenance fields introduced in this pass:

- margin, readiness, close and post-close tables already store the complete immutable snapshot payload as JSONB;
- CostAllocationRunSnapshot already exists in `cost_allocation_run_snapshots` and remains immutable;
- `postgres-order-economics-store` gains read-only access to an allocation run by immutable id for application validation;
- existing scalar accounting columns remain unchanged.

A future relational FK/index may be added only if justified by query/reconciliation requirements; it must be forward-only and must not rewrite historical snapshots.

## Events

Existing outbox event types are retained. Margin/readiness/close/post-close payloads expose allocation status and immutable allocation provenance so downstream projections can distinguish `current`, `legacy-not-applicable` and `pending-post-close` rather than assuming detailed ProductSku economics is always current.

## API/OpenAPI

The public namespace remains `/v2` and composed OpenAPI version remains `1.17.0`; this is an invariant correction within v2, not a parallel API version.

The public OpenAPI must expose the margin input allocation id and the allocation lifecycle/pin fields on affected economics snapshots before this branch is PR-ready.

## Failure behavior

Canonical mismatches fail closed with stable domain errors, including missing allocation, wrong order/version/commit/landed basis, wrong currency, wrong cost-entry set, wrong total, wrong lineage mode, missing policy pin, non-current close basis and readiness/close allocation pin mismatch.

## Automated evidence

Focused regression: `tests/econ003-allocation-margin-close-lineage.test.mjs`.

Required before merge:

- default `npm run verify`;
- PostgreSQL verification where required by release gate;
- GitHub Verify and Syntha V2 CI green;
- root `ARCHITECTURE.md` synchronized in the same PR.

## Residual gap

`ECON-003` remains OPEN/PARTIAL after this pass until the supported post-close exact reallocation/reconciliation command exists and the complete ProductSku economics chain is proven through runtime/PostgreSQL/live acceptance. `ACC-004` remains responsible for live Product → Margin evidence.
