# Canonical Tech Pack issuing — internal admission candidate

Status: **DRAFT / NOT PRODUCTION / NOT PUBLICLY ROUTED**. Date: 2026-10-13.
Source: PR #280, building on still-Draft integration PR #279. Tracking: Issue #277.

## Implemented code boundaries

The internal `createCanonicalTechPackIssueService` is a separate API from legacy `issueTechPack`; no existing user-facing route, screen, or production writer invokes it. It requires a durable command ID, expected version, current active brand membership, `tech-pack.manage`, and a collision-resistant event-ID provider. It invokes `canonicalTransaction` (`SERIALIZABLE`) and resolves, with locks, the Pack's stored `product_sku_id`, ProductSku and size lineage, published ProductSku BOM, canonical StyleVersion/Colorway/SizeScaleVersion measurement chart, and latest pre-production sample. No fallback by text SKU is permitted.

The strict validator refuses absent, unpublished, cross-brand, different ProductSku, different size scale or supplier and unapproved PPS sources. A successful internal transition attaches a SHA-256 lineage snapshot and exact dependency versions, persists the issued Pack, registered command and outbox event atomically, and can supersede its directly related preceding active Pack. Repeat command returns its recorded result after rechecking access; different parameters on the same command ID are rejected.

## Automated tests added

- Pure immutable source snapshot: exact lineage, status, version and supplier validation, content change fingerprints.
- Transaction-scoped SQL contract: six selected source read queries, `FOR SHARE` locks, `SERIALIZABLE`, lack of heuristic identity resolution.
- Internal service: successful issue, one outbox event, registered command replay, stale-version conflict, cross-brand and revoked membership privacy, rejected sources, incomplete factory document, simulated transactional outbox rollback.
- Isolated actual PostgreSQL negative test: a persisted draft without canonical ProductSku remains draft; two failed issue attempts create no command receipt or new outbox event.

CI for this **exact** commit must still be observed; previous passing source-reader CI cannot be reused. These tests alone do not prove production readiness.

## Explicitly unimplemented or blocked

1. Positive real PostgreSQL canonical issue, persisted read-after-restart and frozen document readback.
2. Concurrency tests for source changes between inspection and issuance, publisher revisions, conflicting issue commands, serialization retry.
3. `product_catalog_sku_links` governance where `product_skus.sku_code` differs from legacy `catalog_skus.sku`. Migration 061 currently requires exact text-code lineage for attached BOM/PPS; do not silently equate unrelated identities.
4. `tech_pack_document_workspace` still renders live legacy BOM/measurement sources in parts of its projection. It must be migrated to read exact immutable canonical evidence before external issuance is considered admitted.
5. Independent reviewer, live authenticated browser proof, exact-head CI, merge order and post-merge CI.

Release gate: neither PR #279 nor #280 should be merged or deployed solely because this internal service passes synthetic tests. No paid resources, main/production unchanged.
