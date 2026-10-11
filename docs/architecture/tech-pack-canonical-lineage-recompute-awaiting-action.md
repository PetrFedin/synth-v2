# Tech Pack canonical lineage and Recompute Awaiting Action — admission specification

**Status:** design/reconciliation candidate, not implementation.  
**Accepted base:** `main@74f3bf9f279ce6602572dbd10b61543f78d0bf87`.  
**Post-merge B2 Material proof:** Product Commercialization Acceptance #639, Verify #1797 and Syntha V2 CI #2255 — GREEN.

## 1. What is admitted

The B1 recompute persistence and B2 runtime already exist. Read-only owning-domain adapters have been admitted for published Measurement revisions (PR #265) and published Material revisions (PR #267). The Material adapter proves a newer published version after an exact human-review predecessor; it does not itself amend specifications, prices or composition.

## 2. Tech Pack as-is — verified source contracts

`createTechPackService.issueTechPack` obtains:

- `catalog_skus` by string SKU;
- published `boms` by SKU;
- published `measurement_charts` by SKU;
- approved pre-production `samples` by SKU and supplier;
- current active Tech Pack by SKU.

The issued Tech Pack carries `dependencySnapshot` with SKU/BOM/Measurement/Sample ids and versions, which protects its historical issue evidence **within the legacy SKU context**. There is no demonstrated exact Product Identity tuple `styleVersionId + colorwayId + sizeScaleVersionId` as the owning issue authority. `createRevision` also inherits the SKU context.

**Conclusion:** do not register `tech_pack:tech_pack.recompute`, issue or revise a Tech Pack automatically through Recompute until canonical cutover is proven. A simple `status=issued` check does not establish that the underlying canonical version graph is coherent.

## 3. Canonical cutover requirements — separate implementation PR

1. Introduce or reuse authoritative Product Identity reference `styleVersionId/colorwayId/sizeScaleVersionId` and exact per-product version snapshots. Never create a competing product master.
2. Resolve canonical BOM, canonical Measurement Chart and approved sample through their owning read authorities in a consistent PostgreSQL snapshot; no `catalog_skus` fallback for new canonical Tech Packs.
3. Verify same brand, same Product Identity tuple, exact approved source versions and responsible supplier, using governed ids rather than inferred names.
4. Persist immutable issued Tech Pack dependency evidence: source ids, versions/hashes when available, issue actor, timestamp, supplier, review receipt and `sourceTechPackCode` lineage.
5. Any correction to one dependency yields a new draft/revision and explicit review; old issued documents remain intact.
6. Protect with permissions, optimistic expected version, idempotent command id, transactional outbox and PostgreSQL integrity constraints.
7. Existing legacy SKU Tech Packs remain readable and historically correct; never silently reinterpret them as canonical.
8. An independent read authority must verify the new issued document and every exact source reference before Recompute records a successful automatic receipt.

### Mandatory negative tests

Cross-brand sources; mismatched Colorway/SizeScaleVersion; source version change after draft; unapproved sample; supplier mismatch; missing review; expired permission; duplicate commandId; concurrent revision; old legacy fallback; stale BOM or Measurements; mismatched independent read-back; interruption/retry; historical issued Tech Pack immutability.

**Admission:** exact-head Verify / Product Commercialization Acceptance / PostgreSQL CI all GREEN, zero review threads, merge by expected SHA, post-merge 3/3, then intended-runtime Golden Path. Do not claim Tech Pack adapter ready before that.

## 4. Awaiting Action for Recompute — existing authority only

`src/modules/awaiting-action/public.mjs` is a capability-to-type registry, and `src/infrastructure/postgres-awaiting-action-reader.mjs` is a read-only projection. It must remain **a view of canonical work**, not a second task ledger.

Add a bounded `recompute-human-review` type only after defining an executing command that verifies the assigned actor/capability. The source is the existing immutable Recompute PlanStep plus its absence of terminal ExecutionReceipt and the existence of successful receipts for **all** DAG parents. Do not infer readiness from plan creation alone.

### Required query semantics

- Scope by `product_engineering_recompute_plans.brand_id` + an active membership on the exact organisation.
- Use the **same capability policy** as the executing owning-domain review command; brand `production` and `sales` are not proxies for arbitrary technician/constructor assignments.
- Distinguish reviewer group/person assignment from a generic brand role: technician, pattern maker, buyer, analyst, production manager and admin require explicit authorised responsibility mapping, not invented base roles.
- No supplier visibility via brand membership. External suppliers use explicit portal grants in their own authority.
- Show only `mode='human_review'` steps with no terminal receipt and every predecessor receipt `status='succeeded'`; never show a blocked step as actionable.
- Projection must return planId/stepId, target entity/source exact version, reason, required action, since, urgency, owning domain and version/plan hash where needed. Never surface costs or supplier-private material fields to roles lacking their respective capability.
- Counts and list use the **same repeatable-read snapshot**. Deduplicate (planId, stepId) consistently across multiple memberships and role joins.
- Opening a task is navigation, not approval. Completing it must go through the approved owning-domain human review + `completeEvidenceStep` with exact plan/hash, actor, evidence, idempotency key, independent read-back as required and atomic receipt.
- A successfully completed step disappears from the list; a revoked membership must stop seeing or completing it.

### Required acceptance

PostgreSQL integration: multi-org isolation, capabilities, two memberships, no duplicate tasks, DAG predecessor gating, stale plan, concurrent reviewers, exact receipt completion, role revocation, blocked steps absent, financial field redaction, unreadable supplier scope, single-snapshot list and counters. Browser/mobile: role-specific cards, responsible-action descriptions and deep links; no false approval buttons.

## 5. Sequence after this design gate

1. Tech Pack canonical-lineage design acceptance and a separate implementation/migration PR if needed.
2. Recompute Awaiting Action policy + read-only projection and API contract on the admitted B1 tables.
3. Human review completion flow, actor assignment and idempotent evidence receipt.
4. External evidence intake through scanner/staging/approval (not blind upload → success).
5. Explicit blocked-action replay candidate → authorised retry.
6. Public-runtime and PostgreSQL Golden Path, Product → BOM/Measurements → Cost → Readiness → Commercial Projection → controlled Publication → Buyer Catalog → Selection → Order.
7. Only then PUB-005, PRICE-009, COMM-LC-008, ACC-004 and broader planning/integration modules.

This document claims **requirements and verified gaps only**; it is not proof that Tech Pack canonical cutover or Recompute Awaiting Action is implemented.
