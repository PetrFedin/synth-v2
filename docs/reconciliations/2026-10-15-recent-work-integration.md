# Recent-work integration reconciliation — 2026-10-15

This candidate is stacked on exact-green Tech Pack PR #292 and reconciles two parallel recent workstreams without weakening either authority.

Included:
- Showroom buyer Look price/stock fail-closed isolation from PR #284.
- Recompute Human Review authority from PR #270.
- Existing cumulative canonical Tech Pack stack through PR #292.

Migration reconciliation:
- Tech Pack keeps `181_tech_pack_issue_format_and_sketch_evidence.sql`.
- Human Review is re-admitted as `182_recompute_human_review_authority.sql`.
- No applied migration is edited. The old PR #270 filename remains historical only; this integration candidate uses 182.

Release boundary:
- Human Review remains foundation only: no public API/UI activation is claimed.
- Showroom buyer pricing remains BuyerCatalog-authoritative and fail-closed.
- Public Tech Pack Issue is still legacy until a separate canonical cutover slice.
- Production/main remain HOLD until exact-head CI, PostgreSQL acceptance and review are complete.
