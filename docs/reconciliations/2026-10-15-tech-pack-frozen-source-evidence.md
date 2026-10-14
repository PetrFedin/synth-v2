# Canonical Tech Pack — frozen source evidence / safety gate

Date: 2026-10-15. Scope: draft stacked candidate on top of PR #280. Source: Issue #282, verified migration 151, and the canonical issue source-locking service.

## Verified gap

The existing `tech_pack_document_workspace` view reads a published BOM through `bom.sku = pack.sku` and a measurement chart through a legacy SKU lookup. A canonical issued Tech Pack only had IDs, versions and SHA-256 hashes. These hashes alone are not enough to reproduce the exact source content if the originating source changes or becomes unavailable.

## Bounded implemented candidate

- During the same isolated SERIALIZABLE issuance transaction, store **copied JSON source payloads** from the exact locked ProductSku BOM, StyleVersion/Colorway/SizeScaleVersion measurement chart, and same-supplier approved PPS in `tech_packs.payload.dependencySnapshot.frozenSources`.
- Preserve exact IDs/versions and independent per-source digests; add `canonical.frozenSourcesHash` and include it in the lineage hash. Require the full bundle to stay under 8 MiB to prevent unbounded issuance documents.
- Independent verifier validates the overall payload digest, the lineage manifest, and every source's exact ID, version and payload digest. Missing/corrupted evidence is refused.
- PostgreSQL acceptance tests check both persisted evidence after fresh connection and inability of an unauthorised actor to read another brand's pack.
- For canonical issued Tech Packs, the existing printable document reader **fails closed** rather than re-render a misleading legacy-SKU-based live BOM/chart. Legacy historical document readback is left intact.

## Deliberately not implemented or claimed

This is a **source-freeze safety tranche**, NOT the full Issue #282 document projector. It does not yet prove that a print/PDF uses a fully frozen view of operations, images or factory annotations. The canonical `/document` endpoint explicitly rejects printing until a source-specific projector is qualified. No public canonical issuance cutover is enabled here.

Required next increments:

1. Approved canonical document presenter over frozen source payloads: size-value-mapped complete measurement matrix, actual BOM costs/placement, PPS evidence and source manifest with RU/EN labels.
2. Freeze or independently validate operation sequence and imagery; exclude/restrict off-catalog assets and prove appropriate publication rights.
3. Positive PostgreSQL acceptance across revision one and revision two after BOM/chart/PPS changes, with byte/content-equivalent historical readback and reboot.
4. Print/PDF full-width/mobile browser visual evidence and independent reviewer, then public endpoint/OpenAPI admission.
5. Three exact-head CI gates, protected main and post-merge main qualification; no PROD-PROVEN claim from CI alone.

No new paid resources, migrations, main writes or production deployment.
