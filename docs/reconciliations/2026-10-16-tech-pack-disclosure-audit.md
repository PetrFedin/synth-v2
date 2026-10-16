# Tech Pack disclosure audit - 2026-10-16

Issue: TECH_PACK_READ includes production and quality personas while canonical/legacy documents and stored Tech Pack snapshot fields expose cost-bearing BOM values. Client-side hiding is not a security fix.

This draft contains an isolated server-side projection candidate with a manufacturing-only field allowlist and regression tests, but it is **not connected to HTTP**. It retains exact frozen technical quantities, size-value measurements, PPS and operations, and verifies source hashes/current-rights admission before creating an immutable technical projection. Stored issuance evidence remains intact.

Required before merge: protect all GET/list/mutation responses, qualify real PostgreSQL role isolation and endpoint payload redaction, version OpenAPI, migrate browser UI to technicalView envelope, and keep PDF/export HOLD.
