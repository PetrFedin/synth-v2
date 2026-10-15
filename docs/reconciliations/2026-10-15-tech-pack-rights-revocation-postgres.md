# Real PostgreSQL retained-sketch and current-rights revocation acceptance

Date: 2026-10-15. Stacked on public canonical Issue cutover PR #295.

The existing real PostgreSQL canonical Tech Pack acceptance now creates an actual ProductMedia design sketch with:
- immutable content hash;
- retained content-addressed asset row;
- publication-rights decision v1 = cleared.

Canonical issue freezes that exact evidence and produces a complete historical document. Before revocation, current-rights render admission is allowed. The test then appends publication-rights v2 = revoked and re-evaluates through the PostgreSQL reader.

Required result:
- current render admission becomes denied with CURRENT_RIGHTS_REVOKED;
- historical frozen documentHash remains exactly unchanged;
- frozen document remains readable through the internal authorised canonical reader;
- no historical rights row or issued document is rewritten.

This is real PostgreSQL authority proof. It still does not expose a public PDF/document route.
