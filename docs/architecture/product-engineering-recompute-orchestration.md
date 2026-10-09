# Product Engineering — deterministic recompute orchestration

**Status:** Tranche A IMPLEMENTED; Tranche B1 IMPLEMENTED/PARTIAL in `feat/recompute-orchestration-persistence`  
**Accepted base:** `main@84f9528e5b2474fbd9ae10dad9f7f81aa45e6ed9`

This document deepens, but does not replace, `ARCHITECTURE.md`.

## Purpose

A verified correction may invalidate exact downstream snapshots. Product Engineering must be able to persist the exact stale set, execute an immutable DAG safely across process restarts, prove each owning-authority result independently and seal admission only when every plan step succeeds.

It is an orchestrator and evidence authority, not a universal downstream writer.

## Canonical chain

```text
verified change-impact correction receipt
→ StaleDependencySet
→ RecomputePlan
→ immutable PlanSteps / DAG
→ automatic durable jobs + explicit human/external evidence steps
→ owning bounded-context result
→ independent read-authority verification
→ RecomputeExecutionReceipt per step
→ fail-closed admission evaluation
→ RecomputeOrchestrationReceipt
```

## Tranche B1 persistence model

### `product_engineering_stale_dependency_sets`

Immutable exact snapshot of the version/hash-bound dependencies made stale by one verified correction receipt. It preserves:

- ChangeCase and brand/style scope;
- exact correction receipt id/hash;
- exact result reference and independent verification hash;
- ordered normalized dependency payload;
- deterministic dependency-set SHA-256;
- detector and timestamp.

### `product_engineering_recompute_plans`

Immutable replayable plan over exactly one dependency set. It preserves plan SHA-256, exact steps, canonical topological levels and trigger lineage.

### `product_engineering_recompute_plan_steps`

One immutable row per plan step:

- exact dependency id;
- owning authority and allowlisted operation code;
- mode `automatic | human_review | external_evidence`;
- source/input references;
- explicit parent step ids;
- evidence and severity.

The row contains no mutable execution status. Execution truth is append-only receipt truth plus the recoverable job queue.

### `product_engineering_recompute_jobs`

Only `automatic` steps receive durable worker jobs. Human-review and external-evidence steps never execute inside the automatic worker.

The queue supports:

- unique plan/step and deterministic dedupe identity;
- claim with `FOR UPDATE SKIP LOCKED`;
- lease expiry and reclaim after process failure;
- bounded attempts and exponential retry scheduling;
- terminal dead letter;
- dependency-aware claiming: a job is claimable only when every parent step has a successful immutable execution receipt.

### Execution and orchestration receipts

`product_engineering_recompute_execution_receipts` is append-only and permits one terminal receipt per exact plan step. An automatic successful receipt requires both an exact canonical result reference and independent verification. A human/external successful receipt requires explicit evidence.

`product_engineering_recompute_orchestration_receipts` is append-only and unique per plan. It may be created only after domain admission confirms every exact step has a successful receipt.

## Application boundary

`createAllowlistedProductEngineeringRecomputeDispatcher()` accepts adapters keyed only by:

```text
<owningAuthority>:<operation>
```

There is deliberately no wildcard, generic repository, generic store or generic mutation callback. An unknown pair fails closed with `PRODUCT_ENGINEERING_RECOMPUTE_OPERATION_UNSUPPORTED`.

The durable worker:

1. claims only ready automatic jobs;
2. dispatches the exact allowlisted authority operation with the original idempotency key;
3. accepts only an exact canonical result reference;
4. independently reads the owning authority through the existing Product Engineering result verifier;
5. creates the immutable execution receipt;
6. commits the receipt and queue completion atomically.

A dispatch error or failed verification is retryable under the job policy. Exhaustion dead-letters the job and leaves plan admission false; it never manufactures a failed correction receipt as if the dependency were repaired.

## Human review and external evidence

B1 persists and discovers ready `human_review` / `external_evidence` steps. They are completed only through `completeEvidenceStep()` with explicit evidence. The Awaiting Action projection, external intake UX/API and capability routing remain B2 work; B1 does not claim those surfaces.

## Crash and replay semantics

- Plan persistence is idempotent by exact hashes and identities.
- A process may die while holding a job; another worker reclaims it after lease expiry.
- Parent receipts gate child claimability, so fan-in cannot run early.
- Receipt insertion and job completion are one PostgreSQL transaction.
- Repeating the exact persistence command returns the same set/plan; a hash bound to another identity fails closed.
- Plan/step/set/receipt UPDATE or DELETE is rejected by PostgreSQL.

## Organisation and authority isolation

The persisted set and plan pin brand/style identity with the canonical ProductStyle composite foreign key. Dispatch and independent read-back still execute under an explicit actor. Owning services retain their existing capability and organisation checks.

## Explicitly not implemented in B1

- runtime/server registration of the recompute worker;
- concrete Cost / Readiness / Commercial / Tech Pack adapters;
- HTTP and OpenAPI routes;
- Awaiting Action projection and human capability assignment;
- external evidence upload/admission/reconciliation;
- original blocked-action replay;
- operational metrics/readiness integration;
- live intended-environment Golden Path.

These are subsequent bounded tranches. They must reuse this persistence/evidence model and must not weaken the owning-authority boundary.

## Evidence

- domain DAG/receipt tests from Tranche A;
- service tests for exact allowlist, independent result verification, explicit evidence completion and sealing;
- migration contract tests for immutable tables, queue constraints and absence of generic downstream writes;
- PostgreSQL integration proof for idempotent persistence, dependency gating, human-review readiness, expired-lease reclaim, fan-in continuation, immutable sealing and mutation refusal.
