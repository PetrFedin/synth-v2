# Buyer Showroom Look — verified price and availability boundary

Date: 2026-10-15. Draft fix on branch `fix/showroom-look-buyer-price-fail-closed-20261015`. Relates to PUB-005 / Issue #283.

## Grounded defect

The existing `showroom_look_workspace` SQL view in migration 100 embeds mutable `catalog_skus.wholesale_price`, MOQ and available quantity. `createShowroomSelectionService().withBuyerCatalogFacts()` previously passed these commercial facts to a buyer unchanged when the BuyerCatalog reader was absent, when no published BuyerCatalog existed, or for a Look product missing from the buyer's catalog. That gave a second commercial-price path outside the frozen BuyerCatalog, even though the invited buyer's order should use published buyer-specific commercial terms.

The UI in `public/modules/showroom-looks.js` additionally treated `Number(null)` as 0 and would render a deliberately withheld price as a fictitious `0.00`. Both problems are source-verified; this document does **not** claim a reproduced production leak.

## Candidate behaviour

- Brand owner: unchanged, can see the brand's editorial Look and live internal catalog facts.
- Invited buyer with a valid, matching published BuyerCatalog: matching unique SKU line uses exactly that Buyer's price, MOQ and available-to-sell quantity, and identifies `priceSource: buyer-catalog`.
- Missing, unpublished, wrong-shop, wrong-showroom or cross-brand BuyerCatalog: same Look imagery/product names remain but price, currency, available quantity and MOQ are `null`, `orderable: false`, `priceSource: unavailable`.
- Look product absent from the Buyer's publication or duplicate/ambiguous legacy SKU: same safe withholding. Do not invent a price by selecting one arbitrary ProductSku.
- UI: RU/EN "Цена для покупателя не опубликована / Buyer price not published"; neither fake zero nor a stale internal wholesale amount appears.

## Validation and release gate

Unit regression tests cover all permission and publication boundaries and rendering source contract. Fresh exact-head Verify, Syntha V2 PostgreSQL CI and Product Commercialization Acceptance must all pass, followed by two-account authenticated HTTP read tests, phone/tablet/desktop browser visual proof, independent review and post-merge exact-head checks. Current publication/selection business authority is not modified; the broader Selection → OrderCommit canonical cutover remains P0 PUB-005 and must be addressed separately.

Status: **DRAFT CANDIDATE, NOT LIVE-PROVEN**. No production, main, schema or paid-infrastructure changes.
