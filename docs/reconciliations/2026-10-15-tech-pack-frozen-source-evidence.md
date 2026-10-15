# Canonical Tech Pack - frozen source evidence and source sections

Date: 2026-10-15. Draft candidate for PR #285, stacked on PR #280; Issue #282 remains open. ARCHITECTURE.md contains the synchronized source-section contract and change-register entry.

## Source-freeze safety gate

Inside the SERIALIZABLE issuing transaction, the candidate stores copied JSON payloads from the exact locked ProductSku BOM, canonical measurement chart and same-supplier approved PPS in dependencySnapshot.frozenSources. The bundle is bounded to 8 MiB and its SHA-256 digest is included in lineage. The existing verifier checks bundle digest, lineage and source identities/versions/digests.

## Internal source-section projection

buildFrozenTechPackSourceSections takes only an issued dependency snapshot. It has no live database, catalog, MDM, price, image or preflight resolver. It verifies frozen evidence before projecting it and requires consistent source payload identities, versions, lifecycle, brand and exact StyleVersion/Colorway/SizeScaleVersion.

It preserves BOM quantities, original prices/currencies/FX, placement and totals without recalculation against current data. It creates a complete measurement matrix ordered and keyed by immutable Product SizeValue IDs, retaining frozen RU/EN size and point labels, explicit tolerances, and exact MDM entry/version/dictionary/code references. Missing, duplicate, foreign or code-only cells are rejected rather than replaced by zero or inferred grading. The approved PPS payload, source manifest and deterministic projection hash are retained. Returned data is copied and deeply frozen.

The output explicitly states printAdmitted=false and remaining evidence for issued-document-context, operation-sequence and verified-sketch-content. It is an internal source-section model, NOT a factory PDF or a public endpoint. Image URIs are retained as source data only: no content is downloaded and no rights or immutable bytes are inferred. SHA-256 is an integrity checksum, not an issuer signature or a defence against a writer who can replace all payloads and hashes.

## Damaged-marker fallback correction

Previously the document reader entered canonical verification only for a truthy canonical.lineageHash. A missing/empty lineage hash or partially missing manifest could fall through to mutable legacy data. The reader now recognises the presence of either canonical or frozenSources, including null/empty markers, and rejects damaged evidence. Valid frozen sources still raise TECH_PACK_CANONICAL_PRINT_NOT_ADMITTED.

Membership predicates, transaction isolation, public routes and legacy document shape are unchanged. Removal of the entire dependency snapshot is NOT detected by this guard; that requires an independently persisted issuance-format discriminator and migration/read-model review.

## Tests and admission status

The added suites contain 37 source-section tests and 11 reader-driver contract tests: 48 total. Run 38724038688 on isolated qualification commit 14e51e4903b5c58c0ce97c9829b62cb2a885f02a completed successfully with 48 PASS, 0 failures and 0 skips. The same two test files were rerun from the downloaded source-worktree on Node v22.16.0: 48 PASS, 0 failures and 0 skips. The runtime and test blobs are unchanged between that qualification commit and this candidate. The temporary qualification workflow is not part of PR #285.

The source-section tests cover exact money/FX/placement, ID-mapped complete measurements, RU/EN labels, zero tolerance versus missing data, digest integrity, deep immutability and two snapshots with preserved first-snapshot content after JSON reload. Reader-driver tests cover legacy behavior, missing authorised rows, damaged evidence markers and rollback/release behavior.

These are unit/driver-contract tests. The snapshot revision test is NOT a two-issued-revision PostgreSQL/runtime restart proof; a mocked driver is NOT proof of database tenant isolation. Full candidate CI must be checked against the final PR head; prior green CI on 4c6c9af9601ff4961566ab1d10bc211aa43f022e does not qualify new code. The local full npm test attempt exceeded its command time budget before completion and is not reported as PASS.

## Remaining release gates

1. Freeze exact issued header/product/supplier context, operation sequence and verifiable sketch content in the source-locked transaction.
2. Build the complete canonical document reader/presenter without mutable legacy SQL joins.
3. Real PostgreSQL acceptance across two issued revisions after source changes, historical content equivalence, runtime restart and cross-brand denial.
4. RU/EN print/PDF and phone/tablet/desktop browser evidence; independent review; public endpoint/OpenAPI admission; protected-main and post-merge qualification.

No applied migration edits, production deployments or main writes. PR remains Draft and release HOLD remains in place.
