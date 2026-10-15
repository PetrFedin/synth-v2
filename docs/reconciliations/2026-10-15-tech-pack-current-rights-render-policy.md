# Canonical Tech Pack current-rights render policy

Date: 2026-10-15. Draft stack after PR #291.

The historical Tech Pack records what rights decision was relied on at issue time. That is not a perpetual license. This increment therefore adds a second, present-day admission check without modifying the frozen document or its documentHash.

Rules:
- authorise the Tech Pack before reading current rights;
- query current rights only for exact frozen sketch media IDs;
- require a decision at least as new as the issued rights version;
- fail closed on missing, stale, restricted, expired, revoked or time-expired rights;
- incomplete factory evidence remains blocked even if current rights are cleared;
- produce a separate policyHash for audit.

No public HTTP/PDF route is enabled by this candidate. Public rendering remains a later release gate.
