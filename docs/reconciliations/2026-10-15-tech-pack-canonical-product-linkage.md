# Canonical ProductSku linkage for Tech Pack create/revision

Date: 2026-10-15. Stacked on recent-work reconciliation PR #293.

The canonical Product Identity migration already provides immutable one-to-one `product_catalog_sku_links`. This increment makes Tech Pack persistence use that exact bridge when a draft is created. It does not infer ProductSku identity from similar text or current Product Master state.

Rules:
- if a bridge exists at Tech Pack creation, the exact ProductSku ID is persisted both in the row and payload;
- if no bridge exists, the draft remains legacy-compatible with explicit null canonical identity; later canonical issue fails closed rather than guessing;
- reads surface the durable row `product_sku_id` into the aggregate;
- canonical revisions inherit the issued Pack's exact ProductSku ID and persist it without a separate SQL fixture;
- lifecycle updates preserve the exact link.

This closes the public revision-linkage gap needed before canonical Issue cutover. It does not itself switch the public issue route.
