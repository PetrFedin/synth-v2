# Public canonical Tech Pack document data endpoint

Date: 2026-10-15. Stacked on PR #297.

This candidate exposes the already-frozen canonical document as authenticated JSON data, but only when current publication-rights admission succeeds in the same REPEATABLE READ transaction.

Important boundaries:
- exact membership/Tech Pack lookup occurs before rights lookup;
- document and latest current-rights decisions are read from one database snapshot;
- revoked/restricted/expired/missing rights produce no document response;
- historical documentHash is never rewritten by a later rights decision;
- legacy /document remains unchanged and canonical live-join rendering remains blocked;
- this endpoint is not PDF/print admission.

Both slash-safe by-code and slash-free canonical-document reads are documented in OpenAPI.
