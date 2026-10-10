# Synth V2 — post-B1 governance reconciliation and B2 runtime boundary

**Date:** 2026-10-10  
**Accepted main:** `b2a015ac866ffde7a537ae5e0655ed423c3da104`  
**Source PR:** #259, merged from exact head `9486c1f8be8ae5b7b0420a48a56f1a1e9ca7b791`

## 1. B1 admission result

PR #259 is merged. The exact merge SHA passed post-merge qualification:

- Product Commercialization Acceptance #622 — GREEN;
- Verify #1780 — GREEN;
- Syntha V2 CI #2238 — GREEN.

Accepted B1 authority now includes:

- immutable PostgreSQL StaleDependencySet / RecomputePlan / PlanStep / execution receipt / orchestration receipt persistence;
- durable automatic recompute jobs;
- dependency-aware claiming with `FOR UPDATE SKIP LOCKED`;
- lease expiry and reclaim;
- bounded retry and dead-letter;
- exact `<authority>:<operation>` allowlist;
- independent owning-authority result verification;
- explicit human-review / external-evidence completion boundary;
- DAG-ready enforcement for evidence steps;
- immutable sealing only after exact successful admission.

Product Engineering remains an orchestrator/evidence authority. It does not receive generic downstream write authority.

## 2. PR #258 reconciliation

PR #258 is an earlier competing implementation of the same persistence tranche. It contains useful ideas but cannot be merged after #259 because it carries a second incompatible migration `180_product_engineering_recompute_orchestration.sql`, alternative table/store contracts and an older execution model without the accepted durable job queue.

Do not cherry-pick its persistence/store/service implementation.

Useful concepts to preserve for B2 reimplementation against the accepted #259 model:

- HTTP/OpenAPI surface for plan creation, inspection, step/evidence completion and sealing;
- runtime composition/wiring;
- Product Engineering PostgreSQL Golden Path coverage;
- explicit public contract tests.

These are B2 requirements, not reasons to retain a competing PostgreSQL authority.

## 3. B2 strict scope

B2 may start only from accepted `main@b2a015ac866ffde7a537ae5e0655ed423c3da104`.

Required order:

1. register the recompute worker in the supported runtime and readiness registry;
2. expose bounded metrics/readiness for pending/running/retry/dead-letter recompute jobs;
3. add concrete owning-domain adapters one bounded context at a time;
4. expose Awaiting Action for ready `human_review` steps with capability ownership;
5. add governed external-evidence intake/reconciliation;
6. add explicit blocked-action replay candidates after admission reopens;
7. prove a PostgreSQL/public-runtime Product Engineering Golden Path.

## 4. Adapter order

Initial adapter order:

1. Measurement;
2. Material;
3. Tech Pack;
4. Product Readiness;
5. Commercial Projection;
6. Commercial Publication;
7. Sourcing;
8. Cost.

Every adapter must preserve:

`exact plan step -> allowlisted owning command -> canonical result -> independent read-back -> immutable execution receipt`.

No generic repository, SQL writer, patch command or wildcard operation is permitted.

## 5. Golden Path target

`verified material/source correction`
→ ChangeCase
→ exact stale dependency set
→ recompute/re-review DAG
→ human/external evidence where required
→ new BOM/Measurement/Tech Pack evidence
→ new Cost / Product Readiness
→ new Commercial Projection
→ governed Commercial Publication
→ Buyer Catalog
→ previously blocked action becomes explicitly replayable
→ order uses the new confirmed version.

## 6. Work intentionally deferred

Until B2 Golden Path is admitted, do not pre-empt this sequence with:

- PUB-005 / PRICE-009 / COMM-LC-008 implementation work;
- SHOWROOM-RAIL-001;
- 3D;
- DPP / EPCIS;
- Supplier Network / advanced moat.

The next system-value increase comes from converting B1 from durable persisted mechanism into a supported runtime/user workflow, not by adding another parallel capability.
