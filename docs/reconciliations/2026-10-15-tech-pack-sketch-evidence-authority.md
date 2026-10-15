# Canonical Tech Pack — sketch evidence authority and durable issue format

Date: 2026-10-15. Draft stack after PR #288 / Issue #282. Production remains HOLD.

A saved image URI is neither immutable image content nor publication-rights evidence. Separately, relying only on markers inside dependencySnapshot leaves a fail-open risk if the entire snapshot is removed.

This candidate adds a durable tech_packs.issue_format discriminator outside JSON, an immutable retained-asset authority keyed by ProductMedia, and append-only publication-rights decisions. Canonical issuance reads exact sketch ProductMedia plus retained content evidence and latest rights decision inside the same SERIALIZABLE transaction and freezes them into issued document context. A sketch is verified only when the ProductMedia content hash matches a retained content-addressed object and rights were cleared at issue time. URI-only or hash-only media remains explicit incomplete evidence.

The reader treats canonical-v1 as canonical even when dependencySnapshot is absent, so it fails closed instead of falling through to mutable legacy document joins. The migration only backfills rows whose canonical marker still exists; it cannot reconstruct already-lost evidence and no production incident is claimed.

Public print/PDF remains blocked. A later public renderer must define current-rights revocation policy in addition to historical issue evidence.

Next: complete frozen document composer, two-revision source mutations, public canonical revision linkage, RU/EN PDF/browser acceptance, independent review and protected-main qualification.
