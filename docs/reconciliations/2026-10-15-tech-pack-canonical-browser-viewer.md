# Canonical Tech Pack RU/EN browser viewer

Date: 2026-10-15. Stacked on exact-green PR #298.

The existing Tech Pack workspace now distinguishes document authority by the durable issue format:
- legacy Packs continue to use the historical legacy /document view;
- canonical-v1 Packs request only the rights-gated /canonical-document endpoint.

Before every document request the previous document is removed from UI state. A revoked or otherwise denied current-rights check therefore cannot leave a stale previously admitted document visible.

The canonical viewer is bilingual RU/EN and renders only immutable issued evidence: header/product/supplier, document/source/context hashes, rights policy hash, frozen sketches and rights versions, BOM, measurement matrix, operation sequence and production notes.

It intentionally has no Print/PDF action. The toolbar states that printing is still gated because the frozen model keeps publicPrintAdmitted=false until the separate deterministic PDF/visual acceptance tranche.
