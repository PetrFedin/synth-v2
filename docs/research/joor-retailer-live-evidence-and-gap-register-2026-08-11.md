# JOOR Retailer cabinet: live evidence, synth-v2 coverage and parity gap register

Status: evidence companion, not a replacement for the normative product map  
Audit date: 2026-08-11  
Target repository: `PetrFedin/synth-v2` only  
Legacy repository: `PetrFedin/syntha` is explicitly out of scope and must remain unchanged

## 1. Purpose and reading rules

This document answers three separate questions:

1. What was actually observed in the authenticated JOOR Retailer/LITE cabinet.
2. What is already implemented as executable behavior in `synth-v2`.
3. What is still absent, only partially modeled, or blocked from safe observation and therefore must remain in the parity backlog.

Evidence labels:

- **OBSERVED** вЂ” rendered in the authenticated cabinet and inspected read-only.
- **CODE-CONFIRMED** вЂ” present in executable `synth-v2` code, not merely described in a document.
- **INFERRED** вЂ” required by an observed UI/workflow but not proven through a state-changing action.
- **GATED** вЂ” hidden by plan, missing data, external integration, role, payment, or an unsafe state-changing action.

No Connect, Save, Submit, Send, Export, Download, Pay, Delete, Import, Shopify install, plan purchase, order approval/cancellation, or logout action was executed. Account-specific names, emails, addresses, order numbers, totals and quantities are intentionally omitted.

## 2. Executive result

`synth-v2` already has a strong transactional wholesale core: authentication/RBAC, organisations and relationships, campaigns, collections, showrooms and invitations, immutable commercial publications, SKU price/MOQ/availability, selections, order creation and bilateral lifecycle, inventory reservation, order economics, notifications, calendar, outbox/idempotency/PostgreSQL, plus PLM and production modules.

It does **not** yet reproduce the full retailer cabinet. The largest parity gap is not the happy-path order transition; it is the product-information and buyer-workspace layer around that transition:

- Brand discovery, connection requests, pending/connected states, submissions, favorites and Passport.
- Rich storefront pages and content blocks.
- Style в†’ colorway в†’ SKU/size hierarchy, size scales, images, swatches, attributes and delivery groups.
- Buyer order grid with quantities by color and size, draft cart semantics and JOOR-like order statuses.
- Retailer company profile, doors/locations, people, preferences, privacy and email settings.
- Inbox/compose/comments and file attachment constraints.
- Order list filtering, bulk actions, import/export/downloads, addresses, shipping, billing and payment.
- Shopify mapping/jobs, Data Activity Center, subscriptions, Visual Assortment, Looks and Styleboards.
- Hybrid responsive behavior: modern pages reflow; legacy linesheet/order surfaces retain a wide fixed canvas with horizontal scrolling.

Therefore the current repository is an architectural foundation, not yet a detailed JOOR cabinet analogue. Parity must be claimed surface-by-surface against the acceptance matrix in this document.

## 3. Audited information architecture

| Surface | Representative route | State observed | Required analogue |
|---|---|---:|---|
| Home | `/ra/home` | OBSERVED | Retailer home, counters, connected/new brands, requests, CTAs |
| Linesheet shop | `/collections/shop#dd=all` | OBSERVED | Brand/delivery/category filters, sorting, results and empty states |
| Linesheet detail | `/collections/view/:id` | OBSERVED | Brand rail, grouping, print/order actions, style cards |
| Style detail | `/Styles/view/:id/...` | OBSERVED | Media gallery, colors, size scale, prices, attributes, navigation |
| Connected brands | `/matches/current` | OBSERVED | Search, advanced filters, disconnect affordance |
| Connection requests | `/matches/requests` | OBSERVED | View Profile, Connect, Not Now |
| Pending connections | `/matches/pending` | OBSERVED | Search/filter, pending state and cancel affordance |
| Brands interested | `/ra/submissions?tab=new` | OBSERVED | New/Viewed/All tabs and interest workflow |
| Discover brands | `/ra/find_new_brands` | OBSERVED | Sort, price/currency, JOORPay, categories, request state |
| Favorites | `/r/passport/favorites` | OBSERVED EMPTY | Favorites registry and empty/loading/error contracts |
| Passport | `/r/passport` | GATED/LOADING | Event/discovery surface; requires seeded or entitled account |
| Orders | `/orders` | OBSERVED | Status counters, table, filters, bulk actions, pagination |
| Order detail | `/ra/orders/review/:id?tab=overview` | OBSERVED APPROVED | Overview/Pay, product matrix, comments, downloads, addresses |
| Cart | `/orders/cart` | OBSERVED REDIRECT | Draft/cart existence and empty-cart redirect |
| Product chooser | `/ra/products` | OBSERVED EMPTY | Order context, group/sort/filter/search, selection counter |
| Looks | `/ra/showroom/collections` | OBSERVED EMPTY | Current/Archived, filters and metadata |
| Styleboards | `/ra/showroom/styleboards` | OBSERVED | Board registry, builder shell, comments and order hand-off |
| Visual Assortment | `/ra/visual-assortment` | OBSERVED PAYWALL | Entitlement gate and plan CTA |
| Messages | `/messages` | OBSERVED | Inbox/Invitation/Sent/Trash, bulk state changes, pagination |
| Compose message | `/messages/send` | OBSERVED | Recipient modes, subject/body and image attachment constraints |
| Retailer profile | `/ra/profile/:id` | OBSERVED VIEW/EDIT | Company, people, locations/doors, demographics, verification |
| Account settings | `/accounts/settings` | OBSERVED | User, retailer, language, email, privacy and formatting prefs |
| Shopify product sync | `/ra/shopify/retailer-product-sync/config` | OBSERVED DISCONNECTED | Installation gate, mappings, automation and sync state |
| Activity center | `/ra/data-activity-center` | OBSERVED EMPTY | Async job registry, status/actions/dates/additional info |
| Subscription plans | `/ra/subscriptions` | OBSERVED | VA plan limits, monthly/yearly prices and purchase gates |
| Storefront | `/ra/storefront/:brandId` | OBSERVED CONNECTED/DISCONNECTED | Hero, profile, content sections, connection gate, shop entry |

## 4. Observed surface contracts

### 4.1 Global shell and home

OBSERVED:

- Desktop header exposes discovery, linesheets, Looks, Styleboards, Orders, Visual Assortment, connections, Passport/favorites, profile/settings, messages, cart, subscriptions, Shopify sync and activity center.
- Home exposes count-bearing cards for connection requests and messages, connected brands, new-to-platform brands and Shopify onboarding.
- The inspected account was on a LITE tier; premium-only surfaces appear as paywalls rather than disappearing.
- Header state is contextual: cart and message counts, user/company menu, help and logout.

Required states: loading skeleton, zero data, partial card failure, stale counters, permission hidden/disabled, plan locked, no active organisation, multiple buyer accounts.

### 4.2 Connections and brand discovery

OBSERVED connection states:

- `connected`: visible in Manage Connections; destructive disconnect affordance exists.
- `requested/pending`: request sent and cancellable.
- `incoming request`: View Profile, Connect, Not Now.
- `brand interested`: New, Viewed and All classification.
- `not connected`: Request/Connect CTA.

OBSERVED discovery fields:

- Sort: Newest Linesheets; AвЂ“Z; Most Purchased; New to JOOR.
- Brand name search.
- Wholesale price range: Currency, Minimum, Maximum.
- JOORPay availability checkbox.
- Category multi-select; Clear All and Apply.
- Result cards preserve Request versus Requested state and support a long/infinite result list.

Connection modelling must retain direction, initiator, status, timestamps, decline/dismiss reason, permissions and an audit trail. A single `relationship.status` string is insufficient for inbox/pending/submission tabs.

### 4.3 Linesheet search and list

OBSERVED filters:

- Brand multi-select/search.
- Delivery Date: All Available, Immediates, Select Date Range, From, To.
- Categories: Womens, Mens, Unisex, Home, Baby Boys, Baby Girls, Baby Neutral, Girls, Boys, Outdoor.
- Clear Filters and Search.
- Sort by Brand Name or Delivery Date.

OBSERVED linesheet detail:

- Persistent brand rail with brand name, search, category navigation, all linesheets and Send Message.
- Actions: Print and Start Excel Order.
- Delivery badge/window.
- Group-by dictionary: Linesheet, Fabrication, Category, Division, Silhouette, Linesheet Group, Delivery, Continuative Garment, Collection, Marketing.
- Product cards contain image, style name/number, color swatches, wholesale price and suggested retail.

Required list state contract: initial loading, no connected brands, no linesheets, filter produces zero, pagination/infinite load, partial media failure, inaccessible/expired linesheet, currency mismatch.

### 4.4 Style, color, size and SKU

OBSERVED style hierarchy:

```text
Brand
в””в”Ђв”Ђ Linesheet
    в””в”Ђв”Ђ Style
        в”њв”Ђв”Ђ media[]
        в”њв”Ђв”Ђ attributes and grouping dimensions
        в”њв”Ђв”Ђ price type / currency / wholesale / suggested retail
        в”њв”Ђв”Ђ delivery window(s)
        в”њв”Ђв”Ђ colorways[]
        в”‚   в”њв”Ђв”Ђ color name
        в”‚   в”њв”Ђв”Ђ color code
        в”‚   в”њв”Ђв”Ђ swatch/media
        в”‚   в””в”Ђв”Ђ SKUs by size
        в””в”Ђв”Ђ size scale[]
```

OBSERVED fields and actions:

- Primary image plus thumbnail gallery.
- Previous, Back to all styles and Next navigation.
- Linesheet, style name, style number, delivery, price type and currency.
- Wholesale and suggested retail price.
- Sizes displayed as an ordered scale; example values are omitted because scales are brand/category-specific.
- Color name and code with visual swatch.
- Fit/size note may be present.

Parity requires separate identifiers for Style, Colorway and SKU. `sku + name + one wholesalePrice + MOQ + availableQuantity` cannot represent multiple colors, a size scale, different SKU/UPC codes per color-size, imagery, retailer price, delivery split or price-type variations.

### 4.5 Start Order and product chooser

OBSERVED Start Order modal:

- Brand autocomplete is required.
- More options reveals linesheet autocomplete, price type/currency and door selection.
- Cancel and Start actions; Start remains disabled until required context resolves.

OBSERVED product chooser:

- Order-for context, selected price type, style selected count and orders created count.
- View Order/cart entry.
- Group By, Sort By, Filter By and search.
- No-order context can trigger Start Order setup.

Required draft invariant: the buyer must be able to choose brand, commercial publication/linesheet, price type, currency and door before adding quantities. A cart must keep its source publication/version/hash so later catalog changes do not silently reprice existing lines.

### 4.6 Order registry

OBSERVED status groups:

- Draft.
- Notes, divided into With Quantities and Without Quantities.
- Pending.
- Approved.
- Shipped.
- Cancelled.

OBSERVED table columns:

- Selection checkbox.
- Brand.
- PO number.
- Status.
- Units.
- Total.
- Linesheet.
- Complete Ship.
- Buyer.
- Modified.

OBSERVED actions:

- Start Order.
- Import Orders.
- Download Order Confirmation.
- Export Data.
- Bulk Change Status.
- Bulk Duplicate Orders.
- Bulk Remove Style Colors With No Quantities.
- Bulk Send to Assortment.

OBSERVED filters:

- Free search.
- Buyer list search/multi-select.
- Date type: Created, Modified, Start Ship, Complete Ship.
- Date interval fields.
- Pagination and page size.

Important data-quality finding: buyer labels can contain case variants and duplicates. `synth-v2` should store stable buyer/user IDs and display labels separately; filters must not group by raw label text.

### 4.7 Order detail and quantity matrix

OBSERVED order header:

- Overview and Pay tabs.
- Last updated actor/time.
- Share Order, Visual Assortment, Shopify Sync, Comments and Download.
- Order number, brand, linesheet, delivery window, price type and status.
- Pay Now when applicable.

OBSERVED commercial/fulfilment fields:

- Shipping and billing addresses.
- Door/location.
- Shipping method.
- VAT/tax identifier.
- Billing code.
- Payment method.
- Terms and Conditions.

OBSERVED product matrix:

- Summary totals: units, products/styles and colors.
- Per style: image, name, style number, wholesale, suggested retail and attributes.
- Per colorway: name/code, ordered sizes, editable or read-only quantity cells depending on status.
- Per color and per style totals for quantity and value.
- Add Products is state- and linesheet-dependent.

OBSERVED comment drawer:

- Empty state.
- Text field and Send action disabled until non-empty.
- Order-scoped conversation rather than a generic inbox message.

OBSERVED download drawer:

- PDF summary.
- Excel summary.
- Export Linesheet to Size.
- Advanced: merge orders into one PDF; exclude terms; exclude images; linesheet format.

Required order-line key:

```text
(orderId, commercialPublicationId, styleId, colorwayId, skuId/sizeId, doorId, deliveryWindowId)
```

Required derived totals must be server authoritative and currency-safe. UI totals are projections, never the source of truth.

### 4.8 Retailer company profile and locations

OBSERVED company profile:

- Logo upload/browse.
- Get Verified / tax ID trust CTA.
- Business name; changing it is routed to account settings.
- Description, Website, Instagram, X and Facebook.
- Store photography: up to 30 files, 10 MB each.
- People/admin section.
- Primary and additional locations with map links.

OBSERVED location/door fields:

- Location name.
- Location type.
- Year established.
- Wholesale price minimum and maximum.
- Country, address line 1, address line 2, city, territory/state, postal code, phone.
- Categories.
- Brands carried.
- Demographics: Gender, Age, Described As, Shops For.
- Location add/delete and Save and View.

OBSERVED `Described As` dictionary, maximum 3:

- Sophisticated; Edgy; Casual; Feminine; Downtown; Active; Classic; Vintage; Bohemian.

OBSERVED `Shops For` dictionary, maximum 3:

- Professional Looks; Day to Night; Cocktail and Events; Casual Sportswear; Resort/Beach/Swimwear; Gifts.

Profile parity requires distinct `OrganisationProfile`, `Door/Location`, `PersonMembership`, `Address`, `MediaAsset`, `RetailerDemographic` and `Verification` records. Do not flatten doors into order address strings.

### 4.9 Account settings

OBSERVED user/account controls:

- Email and reset password.
- User profile: full name, job title, phone, profile photo, show on company profile.
- Website language and email language independently.
- Inbox messages forwarded to email: yes/no.
- Connection request alerts: yes/no.
- Weekly connection updates: yes/no.
- Industry updates: yes/no.
- Assigned orders on site: yes/no.
- Assigned orders on iPad: yes/no.
- Default connection message enablement and message body.
- Date format: `mm/dd/yyyy`, `dd/mm/yyyy`, `yyyy/mm/dd`.
- Landing page: Home, My Connections, Orders, Profile.
- Retail price rounding: none, 1.00, 5.00.
- Retailer profile name/email, POS system and version, buyer name.
- Connection permission: any brand/retailer may connect yes/no.
- Search privacy: show/hide from search.

OBSERVED language dictionary:

- English, EspaГ±ol, FranГ§ais, Deutsch, Italiano, ж—Ґжњ¬иЄћ, дё­ж–‡(з®ЂдЅ“), Р СѓСЃСЃРєРёР№, н•њкµ­м–ґ.

Current RU/EN UI localization in `synth-v2` is useful infrastructure but does not cover this preference model or the observed locale set.

### 4.10 Messages

OBSERVED registry:

- Tabs: Inbox, Invitation, Sent, Trash.
- Search and Compose.
- Bulk Delete, Mark Read, Mark Unread.
- Columns: select, From, Message, Date; sortable date; pagination.

OBSERVED compose form:

- Send to all connections or Select Connections.
- Recipient autocomplete.
- Subject.
- Message body.
- Optional `.jpg`/`.png` attachment, maximum 4 MB.
- Send.

Required model: thread/message, mailbox membership, sender/recipients, read state per user, trash state per user, invitation classification, attachment metadata and malware/content validation. Order comments may share infrastructure but require an order aggregate reference and separate permissions.

### 4.11 Storefronts

OBSERVED connected storefront:

- Brand profile and Shop entry.
- Year established, categories, wholesale range, website/Instagram and description.
- An unconfigured storefront may expose editable placeholders such as Section Title, Linesheet and Document.

OBSERVED disconnected rich storefront:

- Connect CTA and access-gating copy.
- Hero media.
- Rich three-column, four-column and two-column visual sections.
- Collection/linesheet cards and long editorial page.

Required block model: `hero`, `richText`, `imageGrid`, `editorialCardGrid`, `linesheetReference`, `document`, `video/embed` if later observed, and CTA. Each block needs order, visibility rules, responsive crop/focal point, alt text and connection/entitlement gating.

### 4.12 Looks, Styleboards and Visual Assortment

OBSERVED Looks list:

- Filters, Current/Archived, Collection, Brand, Creator, Created and Modified.
- Empty-state behavior.

OBSERVED Styleboards:

- Current/Archived registry with name, brand, creator, created and modified.
- Builder toolbar includes product/selection utilities, text and grouping affordances.
- Board name, product count, share/comments, price type selection and Add to Order.
- General Comments and Send.
- Brand assignment gate for a new board.

OBSERVED Visual Assortment:

- Premium paywall with View Plans and Learn more.

The exact canvas data model, coordinates, grouping, annotations, collaboration concurrency and export behavior remain GATED. Implement only after controlled UAT; do not infer a freeform-canvas schema from toolbar labels alone.

### 4.13 Shopify sync and async jobs

OBSERVED Shopify configuration:

- Install on Shopify gate.
- Automation: synchronize approved orders from connected accounts.
- Mapping examples:
  - Style Name в†’ Title.
  - Brand Name + Style Name в†’ Title.
  - Description в†’ Description.
  - Photos в†’ Media.
  - Category в†’ Category.
  - Linesheet в†’ Collections.
  - Silhouette в†’ Type.
  - Brand Name в†’ Vendor.
  - Suggested Retail Price в†’ Price.
  - SKU Prices в†’ Variant Price.
  - SKU Code в†’ Variant SKU.
  - UPC Code в†’ Variant Barcode.
- Last/initial sync status; controls disabled while disconnected.

OBSERVED Data Activity Center columns:

- Job reference number, Created By, Type, Status, Actions, Start Date, End Date, Additional Info and Refresh.

Required integration model: installation/credentials reference, connection status, mapping version, automation rules, cursor/checkpoint, job, per-record result, retry, dead letter, idempotency key and operator-visible error detail. Secrets must never be stored in job payloads or browser state.

### 4.14 Plans and entitlements

OBSERVED subscription surface:

- Visual Assortment Standard and Premium tiers.
- Limits are expressed in users, doors, products and history retention.
- Monthly and yearly billing options.
- Purchase actions and paywalled feature CTAs.

Prices and exact commercial limits are time-dependent configuration, not source-code constants. The analogue needs entitlement capabilities and quotas, not hard-coded UI plan logic.

## 5. Observed dictionaries

### 5.1 Retail/discovery categories

Accessories; Activewear/Yoga; Beauty; Bridal; Candles; Denim; Eco-friendly; Evening; Eyewear; Gifts; Handbags; Hats; Home; Hosiery; Jewelry; Kids; Lingerie; Luggage; Mens Bags; Mens RTW; Mens Shoe; Mens Underwear; Outdoor; Outerwear; Plus Size; Resort Wear; Special Occasion; Swimwear; Watches; Womens RTW; Womens Shoe.

Category dictionaries are tenant/configuration data with stable IDs, localized labels, aliases, active intervals and ordering. They must not be enums embedded in UI code.

### 5.2 Order/commercial dictionaries

- Price type: brand-specific code, currency and label.
- Delivery: Immediate or named/ranged delivery window.
- Door/location: organisation-specific.
- Buyer: membership/user-specific, stable ID despite duplicate labels.
- Shipping method, payment method, billing code and tax identity: organisation/order-context-specific.
- Group-by dimensions: system and brand-defined merchandising attributes.
- Size scale: ordered, brand/category-specific; never assume universal numeric sorting.

### 5.3 Cross-cutting dictionary requirements

Every reference value needs: stable ID, code, localized label, display order, scope, valid-from/to, active flag and optional parent. Historical orders must render the snapshot label even after a dictionary entry is renamed or retired.

## 6. Layout and responsive evidence

Measured at desktop viewport `1429 Г— 810`, device pixel ratio 1:

- Home document height was approximately 2116 px.
- Linesheet detail used a left brand rail around x=228вЂ“480 and product content beginning around x=526.
- Representative style card media was about `219 Г— 299`; small color swatches about `18 Г— 18`.
- Style detail used a primary image around `330 Г— 450`, thumbnails about `58 Г— 77`, color swatches about `37 Г— 37`; media began around x=556 and detail column around x=916.
- Start Order modal was approximately 440 px wide; inputs about `308 Г— 38`; action buttons about `198 Г— 38`.
- Rich storefront hero occupied approximately `1414 Г— 608`; page content margin began near x=145. Representative grids used `359 Г— 478` three-column images, `263 Г— 351` four-column images and `550 Г— 733` two-column cards.

Responsive checks at `390 Г— 844`, `768 Г— 1024` and desktop widths found two coexisting systems:

1. Modern storefront/home surfaces reflow without horizontal overflow; header text collapses on mobile and CTA width changes.
2. Legacy linesheet surfaces retain an approximately 1026 px working canvas and create horizontal scrolling on narrow viewports; the sidebar remains about 252 px and content begins around x=332.

Parity decision: preserve the *functional information density* and safe usability, not accidental legacy breakage. If exact visual compatibility is required for a legacy route, document that per route and add horizontal-scroll regression tests. New `synth-v2` pages should use responsive tokens with explicit density modes.

Minimum responsive matrix:

- 390 Г— 844 mobile portrait.
- 768 Г— 1024 tablet portrait.
- 1024 Г— 768 small desktop/tablet landscape.
- 1440 Г— 900 desktop.
- 1920 Г— 1080 wide desktop.
- 200% zoom and keyboard-only navigation.

## 7. What is already executable in synth-v2

CODE-CONFIRMED from `main` on 2026-08-11:

| Area | Implemented behavior | Evidence path | Parity assessment |
|---|---|---|---|
| Runtime | PostgreSQL composition, auth, readiness, maintenance, notifications, outbox | `src/runtime/postgres-base-runtime.mjs`, `src/server.mjs` | Strong platform foundation |
| Wholesale workflow | Organisations, relationships, campaigns, collections, showrooms, invitations, cycles, selections and orders | application services + workspace UI | Core present |
| Catalog | Flat SKU create/edit with collection, name, wholesale price, currency, MOQ and sellable quantity | `public/modules/catalog-form.js` | Partial; lacks style/color/size/media |
| Publications | Immutable commercial publication per collection, content hash, published lines, print and CSV | `public/modules/linesheets.js` | Strong snapshot idea; buyer UX partial |
| Selection | Create from accepted showroom context; add/update SKU quantity with MOQ validation | `public/modules/forms-3.js` | Partial; flat SKU quantity only |
| Order | Create from submitted selection; Incoterm, payment days, prepayment, delivery range; bilateral lifecycle/cancel | `public/modules/forms-3.js`, `public/modules/order-lifecycle-actions.js` | Core present, JOOR status/UI incomplete |
| Inventory/economics | Reservation, availability, server-side economics/cost allocation | application/runtime modules | Useful core, needs matrix projection |
| Partner access | Relationship accept/reject/revoke and showroom invitation lifecycle | partners/views modules | Partial versus discovery/inbox states |
| Notifications/calendar | Dedicated views and services | runtime/UI modules | Present; not a message inbox |
| PLM/production | Materials, BOMs, measurements, samples, sourcing, tech packs, production and quality | runtime/UI modules | Additional product value, not JOOR retailer parity |
| Localization | RU/EN runtime | `public/modules/i18n-runtime.js` | Infrastructure only; preference/locales incomplete |

Current primary UI navigation is Overview, Catalog, Showrooms, Partners, Selections, Orders, Calendar and Notifications. No executable first-class navigation was confirmed for Discovery, Storefronts, Retailer Profile, Account Settings, Messages, Favorites/Passport, Payments, Shopify/Jobs, Subscriptions, Looks, Styleboards or Visual Assortment.

## 8. Gap register

Priority meanings:

- **P0** вЂ” blocks a correct buyer order and data model; implement before claiming commerce parity.
- **P1** вЂ” blocks complete retailer-cabinet parity and daily buyer operations.
- **P2** вЂ” advanced/premium/integration surface; implement after core contracts or after controlled UAT.

| ID | Priority | Gap | Required deliverable | Acceptance evidence |
|---|---:|---|---|---|
| CAT-01 | P0 | Flat SKU model | Style, Colorway, SKU, SizeScale, SizeValue, media, attributes | One style with 2 colors Г— 4 sizes retains distinct SKU/UPC/qty |
| CAT-02 | P0 | No rich media | Ordered assets, variant association, crop/focal/alt, failure states | Gallery, thumbnails and swatches pass responsive/a11y tests |
| CAT-03 | P0 | Price type too shallow | PriceBook/PriceType, currency, wholesale, suggested retail, effective dates | Buyer switches valid price type without mutating snapshot |
| CAT-04 | P0 | Delivery not line-aware | DeliveryWindow and availability per color/SKU | Mixed Immediate/future lines calculate and filter correctly |
| CAT-05 | P0 | Attribute/grouping taxonomy absent | Configurable attributes and group-by registry | Observed 10 grouping options map by stable IDs |
| ORD-01 | P0 | Flat quantity line | Color Г— size matrix and server totals | Matrix round-trip is lossless; zero cells removable |
| ORD-02 | P0 | Cart/draft context incomplete | DraftOrder/Cart bound to brand, door, publication and price type | Empty redirect, resume and immutable source version tested |
| ORD-03 | P0 | Status mismatch | Explicit state machine for Draft/Notes/Pending/Approved/Shipped/Cancelled plus bilateral events | Forbidden transitions rejected; history auditable |
| ORD-04 | P0 | Missing address/door terms | Shipping/billing snapshots, door, shipping/payment/tax/billing code | Approved order remains historically stable after profile edits |
| ORD-05 | P0 | Totals/projections incomplete | Units/styles/colors/value summaries at color/style/order level | Totals reconcile with matrix in multiple currencies/rounding |
| PUB-01 | P0 | Buyer linesheet is table-only | Card/grid buyer view, filters, groups, style drill-down, start order | Discovery-to-draft journey works from publication snapshot |
| IAM-01 | P0 | Organisation preferences incomplete | Membership, permissions, retailer/brand roles, plan capabilities | Route/action checks enforced server-side and in UI |
| CON-01 | P1 | Relationship state is too narrow | Incoming, outgoing pending, connected, dismissed, interested/viewed | All connection tabs derive from one auditable model |
| DIS-01 | P1 | Brand discovery absent | Search/filter/sort, request state, pagination/infinite loading | Filter URL/state, zero/error/loading and request idempotency tested |
| STO-01 | P1 | Storefront absent | Versioned storefront with block content and access gates | Connected and disconnected variants render safely |
| PRO-01 | P1 | Retailer profile absent | Company, media, verification, people, demographics | Field limits/dictionaries/media validation tested |
| PRO-02 | P1 | Doors/locations absent | Door/location CRUD, address, price range, categories, brands carried | Primary/additional door invariants and order references tested |
| SET-01 | P1 | Account settings absent | Language, email, date, landing, rounding, POS, privacy, connection prefs | Preferences persist per user/org and affect rendering/actions |
| MSG-01 | P1 | Inbox absent | Mailboxes, threads/messages, read/trash states, bulk actions, pagination | Per-recipient state and invitation classification tested |
| MSG-02 | P1 | Compose/attachment absent | Recipient autocomplete/modes, subject/body, validated image attachment | MIME/size/security/permission cases covered |
| ORD-06 | P1 | Order registry shallow | JOOR-like counters, columns, buyer/date filters, pagination | Filter/count consistency and stable buyer IDs tested |
| ORD-07 | P1 | Bulk operations absent | Status change, duplicate, remove zero qty colors, send to assortment | Preview/idempotency/partial-failure audit tested |
| ORD-08 | P1 | Comments/downloads absent | Order conversation and async PDF/XLSX/size export | Permission, redaction, export version and job state tested |
| ORD-09 | P1 | Import/confirmation exports absent | Validated import pipeline and confirmation artifacts | Row-level errors, dry run, repeat upload idempotency tested |
| PAY-01 | P2 | Pay tab/payment absent | Payment intent/status, provider abstraction, reconciliation | No card secrets stored; webhook/idempotency/retry tested |
| INT-01 | P2 | Shopify configuration absent | Installation, mappings, approved-order automation and checkpoints | Sandbox sync with retry and per-record outcome |
| JOB-01 | P2 | Activity center absent | Async job registry and operator-visible actions/details | Queued/running/succeeded/failed/cancelled/retry states tested |
| FAV-01 | P2 | Favorites/Passport absent | Favorites and event/discovery entities | Seeded-account UAT defines exact behavior first |
| ASM-01 | P2 | Looks absent | Registry, archive state, creator/brand/collection metadata | Empty/list/filter/archive contracts tested |
| ASM-02 | P2 | Styleboard partial/absent | Board document, items, layout/group/text/comments/share/order handoff | Controlled UAT defines canvas schema and concurrency |
| ENT-01 | P2 | Entitlements/plans absent | Capability/quotas, billing-cycle configuration, paywall component | Tier changes affect server authorization, not just UI |
| RES-01 | P1 | Responsive density incomplete | Route-specific responsive specs and tokenized components | Full viewport/zoom/keyboard matrix in CI |
| A11Y-01 | P1 | Legacy accessibility risks | Names/roles/focus/error announcements/table semantics | WCAG-oriented automated and manual audit |
| OBS-01 | P1 | Parity telemetry absent | Journey events, job/order transition metrics and audit correlation | Funnel/drop-off and transition errors observable without PII |

## 9. Recommended target aggregates

This is a boundary proposal, not a demand to collapse existing `synth-v2` services:

```text
Identity & Organisation
  User в”Ђ Membership в”Ђ Organisation
  OrganisationProfile в”Ђ Door/Location в”Ђ Address
  UserPreference / OrganisationPreference / Verification

Network & Discovery
  ConnectionRequest в”Ђ Relationship в”Ђ Submission/Interest
  Favorite в”Ђ Passport/Event presence

Commercial Catalog
  Campaign в”Ђ Collection в”Ђ Linesheet/CommercialPublication
  Style в”Ђ Colorway в”Ђ SKU в”Ђ SizeValue/SizeScale
  MediaAsset в”Ђ AttributeDefinition/Value
  PriceBook/PriceType в”Ђ Price
  DeliveryWindow в”Ђ Availability

Buyer Workspace
  DraftOrder/Cart в”Ђ OrderLineMatrix в”Ђ Door allocation
  Order в”Ђ Address snapshots в”Ђ Terms в”Ђ StatusEvent
  OrderComment в”Ђ Document/ExportJob в”Ђ Payment

Content & Assortment
  StorefrontVersion в”Ђ ContentBlock
  Look в”Ђ StyleboardDocument в”Ђ BoardItem/Group/Annotation

Messaging & Integration
  Conversation в”Ђ Message в”Ђ Attachment в”Ђ MailboxState
  IntegrationInstallation в”Ђ MappingVersion в”Ђ SyncJob в”Ђ JobItemResult
  Subscription в”Ђ Entitlement в”Ђ QuotaUsage
```

Critical invariant: catalog and profile data may evolve, but an approved order must preserve immutable commercial, address, tax, term, label and media references required to reproduce its confirmation.

## 10. Delivery sequence

### Milestone A вЂ” correct product/order foundation (P0)

1. Add Style/Colorway/SizeScale/SKU/media/attributes and migrate flat SKU semantics compatibly.
2. Extend immutable commercial publication to snapshot variant, price, delivery, media and dictionary labels.
3. Build buyer linesheet cards/style detail and Start Order context.
4. Implement cart and color-size quantity matrix with server totals.
5. Add door/address/tax/shipping/payment-method snapshots and explicit JOOR-like order state mapping.

Exit gate: a buyer can traverse connected publication в†’ style в†’ quantities by color/size в†’ draft в†’ pending/approved representation without data loss, and a historical order is reproducible after source catalog edits.

### Milestone B вЂ” complete daily retailer cabinet (P1)

1. Discovery and full connection state machine.
2. Retailer profile, locations/doors, people, verification and settings.
3. Storefront renderer and access gates.
4. Order registry filters/counters/bulk actions/comments/downloads/import/export.
5. Inbox/compose and order-linked conversations.
6. Responsive, accessibility and journey telemetry hardening.

Exit gate: every non-premium route in the audited information architecture has loading, empty, error, permission and populated states plus contract/e2e evidence.

### Milestone C вЂ” gated/premium/integrations (P2)

1. Shopify installation/mapping/sync and Data Activity Center.
2. Payment/provider abstraction and Pay view.
3. Looks, Styleboards and Visual Assortment entitlements.
4. Favorites/Passport after seeded-account controlled UAT.
5. Subscription/entitlement administration.

Exit gate: sandbox/provider tests, quota/permission enforcement, retry/audit behavior and controlled UAT evidence exist; no feature is marked parity-complete from paywall text alone.

## 11. Still unobserved or unsafe to claim

The following need explicit test tenants, seeded fixtures or permission to perform controlled state changes:

- Successful connection acceptance/decline and disconnect consequences.
- Saving quantities, creating/resuming a real draft, submitting and revising an order.
- Brand-side approve/reject/revision actions and cross-party notification timing.
- Shipment creation, partial shipment, tracking and receipt/claim behavior in JOOR.
- Successful JOORPay flow, refunds/disputes and payment reconciliation.
- Successful Shopify installation/sync, mapping conflict behavior and retry details.
- Populated/successful/failed Data Activity Center jobs and downloadable job artifacts.
- Passport and Favorites with seeded content.
- Visual Assortment paid workspace, collaboration and exports.
- Styleboard save/version/concurrency/share/export/order hand-off.
- Mobile-native/iPad-specific behavior, push notifications and assigned-order behavior.
- Authentication edge cases: SSO, MFA, password reset, session expiry, multiple organisations.
- Public/partner API behavior, rate limits, webhook signatures and bulk limits.
- Exact validation boundaries for every text field and upload type.

These are not reasons to block the core build. They are reasons to label the corresponding parity items GATED and design adapters/state machines so evidence can be added without destructive rewrites.

## 12. QA and evidence policy

For every parity item:

1. Store a redacted observation: route, role, plan, viewport, precondition, visible fields/actions and state.
2. Define the domain/API contract independently of JOOR implementation details.
3. Add unit tests for invariants and forbidden transitions.
4. Add API/contract tests for validation, permission, idempotency and pagination.
5. Add UI tests for populated, loading, empty, error, locked and read-only states.
6. Add responsive snapshots at the required viewport matrix.
7. Add keyboard/focus/name-role-value checks for dialogs, filters, tables and matrix editing.
8. Add audit/telemetry assertions without storing PII.
9. Mark parity complete only when executable behavior and evidence exist; a prose row is not completion.

## 13. Security, privacy and product independence

- Never commit real retailer names, people, emails, addresses, tax IDs, order IDs, PO numbers, quantities, prices, message bodies or integration credentials from the reference account.
- Treat all external media and documents as untrusted; scan uploads, validate MIME independently of extension, and serve with safe content headers.
- Enforce tenant, organisation, relationship, role and entitlement checks server-side on every read and mutation.
- Use idempotency keys for connection, import, submit, bulk, payment and sync commands.
- Preserve audit events for permission changes, commercial publication, order transitions, downloads, payments and integration actions.
- Build an independent functional analogue. Do not copy JOOR trademarks, copyrighted text, customer data or protected visual assets; use the observed behavior to define original `synth-v2` UX and contracts.

## 14. Repository boundary

All implementation and documentation work arising from this register belongs only in `PetrFedin/synth-v2`. References to the legacy `PetrFedin/syntha` repository are prohibited as implementation targets, migration sources or destinations unless a future user request explicitly changes that boundary.
