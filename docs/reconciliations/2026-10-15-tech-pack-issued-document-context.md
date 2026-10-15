# Issued Tech Pack document context - candidate stacked on PR #285

Issue #282 remains open. Base: bd585846d78469dd7528eb40eede93dc318646cd.

## Scope

The internal canonical issue now captures the issued header, exact canonical RU/EN product display fields, supplier contact and register reference, and operation sequence. All reads use the SAME SERIALIZABLE client after pack authorisation/source validation, with exact-key FOR SHARE locks. No legacy text-SKU reconstruction is added.

The copied context is dependencySnapshot.frozenDocumentContext, format 1. canonical.documentContextHash is included in lineage and issuance outbox. Pack, replay receipt and outbox commit atomically. Rebinding is refused. Combined source/context evidence remains bounded to 8 MiB.

Supplier name/email are the issued pack's chosen contact, not a live register name. Register id/version/status are separate evidence, not a new qualification policy. Operations preserve identity, order, RU/EN names, equipment, machine class, measured time, notes and authorship. The existing totalStandardMinutes function owns summation. Empty operations are explicitly missing evidence with null total, not zero measured minutes. Foreign, duplicate or malformed rows fail closed.

Readback verifies digests and immutable pack identity, allowing later lifecycle status/version changes without rewriting the issued header. Source-only historical snapshots remain verifiable but cannot manufacture context. Partial context/digest markers are rejected; the print guard recognises the new context marker too. Legacy response shape and public routes remain unchanged.

Sketches remain unverified. URLs are not downloaded; hashes alone do not establish retained immutable bytes, rights or signatures. Full factory PDF/public canonical issue remains blocked. A complete document composer and durable issuance-format discriminator for total snapshot removal remain next.

## Evidence boundaries

Local focused regression on Node 22: 165 PASS, 0 fail, 0 skipped, including existing overlapping Tech Pack tests. Architectural boundary and PostgreSQL contract validators pass. Full dependency installation/database testing is not locally established; the earlier offline install was missing cached dependencies. Do not count dependency-dependent local failures as successful PostgreSQL verification.

The extended isolated PostgreSQL acceptance creates an operation, issues revision one, reads its context in a fresh Node process, creates and issues revision two with different contact/header/operations, and rereads revision one in another process. It verifies persisted command/outbox hashes and concealment from another active brand owner. Canonical source rows and exact revision link are SQL fixtures. This does NOT prove public canonical revision creation, full BOM/chart/PPS source revision history, deployed HTTP restart or PDF byte equivalence.

Full Verify, PostgreSQL CI and Product Commercialization Acceptance must be checked against the final candidate SHA. Executed run IDs/counts belong in the PR checkpoint; no advance PASS claim is made here.

## Remaining gates

Retained sketch content and rights authority; durable issuance-format discriminator; complete frozen document composition and source-revision history; public canonical linkage; RU/EN print/PDF/phone/tablet/desktop evidence; independent review and protected-main integration.

No applied migration edits, new dependencies, paid resources, main writes or production deployments.
