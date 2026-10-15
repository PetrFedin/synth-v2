# Canonical Tech Pack two-revision source mutation acceptance

Date: 2026-10-15. Stacked on Draft PR #290.

The real PostgreSQL acceptance now upgrades the source fixtures to the same frozen-document contract used by the composer. After R1 issue it changes BOM cost/material evidence, measurement value and PPS decision/version in the authoritative source rows. R2 is then issued and must freeze the newer source versions.

Acceptance requires:
- R1 full canonical document is reproducible in a new Node process before mutation.
- R2 has BOM/chart/PPS version 2, a different frozenSourcesHash and a different documentHash.
- R1 context and complete document remain byte-canonical after R2 issue when read from another fresh Node process.
- Cross-brand concealment and public-print HOLD remain unchanged.

This test is isolated PostgreSQL/runtime evidence. It is not deployed production or browser/PDF evidence.
