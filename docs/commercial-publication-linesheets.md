# Commercial Publication → Linesheets

Linesheets is a read-only projection of immutable `CommercialPublication` snapshots. Browser code must not derive commercial prices, fabricate colorways/SKUs/buyers, inject demo collections, or expose draft/sent/viewed states that do not exist in the published domain contract.

## Read model

The collection registry is exposed as:

`GET /v2/collections/{collectionId}/commercial-publications?limit=50&cursor=...`

The service authorizes the actor against the collection brand with `DEAL_READ`. The PostgreSQL reader orders snapshots by `(published_at DESC, id DESC)` and uses the same tuple in an opaque base64url cursor. Pages are bounded to 200 items and the store reads `limit + 1` records to determine `nextCursor`.

Each Linesheets row comes only from persisted immutable publication data: publication id, publication time, currency, checksum and `lines[]`. Assortment lines expose the persisted SKU, name, catalog version, unit price, currency and minimum order quantity. Missing commercial data is rendered as unavailable; it is never backfilled from collection budgets or UI state.

## UX and localization

The workspace has explicit loading, empty, error and published/read-only states. All visible workspace labels and state messages use the RU/EN locale switch. Error rendering uses a localized workspace message rather than a raw transport/backend message. Failed loads stop automatic refetching and resume only after an explicit Retry action or Refresh.

## ODS boundary

Linesheets is mapped into the shared Omnidata Design System semantic adapter (`omnidata-v14-module-adapters.js`) using metrics, filterbar, master-detail, table, inspector, definition-grid, status, surface, field and alert roles. No standalone Linesheets stylesheet is loaded or served. Existing frozen legacy visual layers remain compatibility debt until their selectors can be retired without weakening the ODS boundary validator.
