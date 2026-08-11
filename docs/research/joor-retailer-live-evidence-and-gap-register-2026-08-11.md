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

- **OBSERVED** — rendered in the authenticated cabinet and inspected read-only.
- **CODE-CONFIRMED** — present in executable `synth-v2` code, not merely described in a document.
- **INFERRED** — required by an observed UI/workflow but not proven through a state-changing action.
- **GATED** — hidden by plan, missing data, external integration, role, payment, or an unsafe state-changing action.

No Connect, Save, Submit, Send, Export, Download, Pay, Delete, Import, Shopify install, plan purchase, order approval/cancellation, or logout action was executed. Account-specific names, emails, addresses, order numbers, totals and quantities are intentionally omitted.

## 2. Executive result

`synth-v2` already has a strong transactional wholesale core: authentication/RBAC, organisations and relationships, campaigns, collections, showrooms and invitations, immutable commercial publications, SKU price/MOQ/availability, selections, order creation and bilateral lifecycle, inventory reservation, order economics, notifications, calendar, outbox/idempotency/PostgreSQL, plus PLM and production modules.

It does **not** yet reproduce the full retailer cabinet. The largest parity gap is not the happy-path order transition; it is the product-information and buyer-workspace layer around that transition:

- Brand discovery, connection requests, pending/connected states, submissions, favorites and Passport.
- Rich storefront pages and content blocks.
- Style → colorway → SKU/size hierarchy, size scales, images, swatches, attributes and delivery groups.
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

- Sort: Newest Linesheets; A–Z; Most Purchased; New to JOOR.
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
└── Linesheet
    └── Style
        ├── media[]
        ├── attributes and grouping dimensions
        ├── price type / currency / wholesale / suggested retail
        ├── delivery window(s)
        ├── colorways[]
        │   ├── color name
        │   ├── color code
        │   ├── swatch/media
        │   └── SKUs by size
        └── size scale[]
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

- English, Español, Français, Deutsch, Italiano, 日本語, 中文(简体), Русский, 한국어.

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
- Audit safety note: opening the new-board route rendered `Saving …` and an `UNTITLED STYLEBOARD` shell before any explicit Save/Assign action. Treat this route as side-effectful and verify whether an empty draft was created. No Assign, Save or Delete action was executed during the audit.

OBSERVED Visual Assortment:

- Premium paywall with View Plans and Learn more.

The exact canvas data model, coordinates, grouping, annotations, collaboration concurrency and export behavior remain GATED. Implement only after controlled UAT; do not infer a freeform-canvas schema from toolbar labels alone.

### 4.13 Shopify sync and async jobs

OBSERVED Shopify configuration:

- Install on Shopify gate.
- Automation: synchronize approved orders from connected accounts.
- Mapping examples:
  - Style Name → Title.
  - Brand Name + Style Name → Title.
  - Description → Description.
  - Photos → Media.
  - Category → Category.
  - Linesheet → Collections.
  - Silhouette → Type.
  - Brand Name → Vendor.
  - Suggested Retail Price → Price.
  - SKU Prices → Variant Price.
  - SKU Code → Variant SKU.
  - UPC Code → Variant Barcode.
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

Accessories; Activewear/Yoga; Beauty; Bridal; Candles; Denim; Eco-friendly; Evening; Eyewear; Gifts; Handbags; Hats; Home; Hosiery; Jewelry; Kids; Lingerie; Luggage; Mens Bags; Mens RTW; Mens Shoe; Mens Underwear; Outdoor; Outerwear; Plus Size; Resort Wear; Special Occasion; Swimwe…4242 tokens truncated…sted; scan uploads, validate MIME independently of extension, and serve with safe content headers.
- Enforce tenant, organisation, relationship, role and entitlement checks server-side on every read and mutation.
- Use idempotency keys for connection, import, submit, bulk, payment and sync commands.
- Preserve audit events for permission changes, commercial publication, order transitions, downloads, payments and integration actions.
- Build an independent functional analogue. Do not copy JOOR trademarks, copyrighted text, customer data or protected visual assets; use the observed behavior to define original `synth-v2` UX and contracts.

## 14. Repository boundary

All implementation and documentation work arising from this register belongs only in `PetrFedin/synth-v2`. References to the legacy `PetrFedin/syntha` repository are prohibited as implementation targets, migration sources or destinations unless a future user request explicitly changes that boundary.

## 15. Second-pass deep audit: previously unobserved safe surfaces

Audit date: 2026-08-11, continuation pass.

This pass intentionally targeted only previously unobserved or weakly evidenced behavior. It used existing read-only records and opened non-committing panels. No order, quantity, connection, message, profile, payment or integration state was intentionally changed. Real account values remain excluded.

### 15.1 Status-specific order behavior

The order status and the presence of products/quantities are separate dimensions.

| Status/state | Newly observed actions | Editability and messages | Required synth-v2 rule |
|---|---|---|---|
| Note with quantities | Submit for Approval; section-level Edit; Add Products when the source is available | Existing quantities and financial totals are rendered; unavailable/archived linesheets can independently block additions | Preserve editable note state without rebasing its commercial snapshot |
| Note without quantities | Submit for Approval is visibly enabled; Add Products; section-level Edit | An order can contain styles and colorways while every size quantity is zero | Do not infer product/color counts from non-zero quantity lines |
| Pending | Edit Order | Products cannot be added or edited until the order is returned to an editable state | Model the explicit return-to-edit command and its audit event |
| Approved | Pay/Pay now can be present; read-only products | Product editing is disabled; payment capability is brand/order-dependent | Approval and payment eligibility are orthogonal |
| Shipped | Duplicate Order may exist; Load All Products | Product editing is disabled; tracking field is displayed; archived source can disable duplication | Shipping is a terminal commercial state but not a reason to discard product or snapshot data |
| Cancelled | Duplicate Order can be shown but conditionally disabled | Cancelled orders may retain non-zero quantities/value or may be empty | Cancellation never implies deletion or zeroing of historical lines |
| Draft | No record was available in this tenant | GATED | Keep draft behavior unclaimed until controlled fixtures exist |

Observed UI labels imply `Note → Pending` through **Submit for Approval** and `Pending → editable Note` through **Edit Order**. The actual command result, notifications and brand-side transition remain GATED and require controlled UAT.

Required lifecycle properties:

- Store status history separately from the current status.
- Store actor, organisation side, timestamp, command, reason and correlation/idempotency key for every transition.
- Evaluate action availability from status, role, relationship, source visibility, entitlement and payment/integration capability.
- Never derive cancellation from empty quantities or shipped state from a tracking value alone.
- Preserve the distinction between list label **Notes** and detail label **Note Order** in the localization/alias layer without creating two domain states.

### 15.2 Product membership versus ordered quantity

OBSERVED on a Note order with zero total units:

- The order retained multiple products/styles and more colorways than products.
- Every size cell was zero, but style/color membership remained visible.
- Per-color and per-style totals were zero.
- Add Products and Submit for Approval were visibly enabled.
- The registry classified the record as Notes → Without Quantities.

This establishes two distinct concepts:

~~~text
OrderProductSelection
  styleId
  selectedColorwayIds[]
  commercialSnapshotReference

OrderQuantity
  selectedColorwayId
  sizeValueId / skuId
  quantity
~~~

A product/color selection must not disappear merely because all its quantity cells are zero. The observed bulk action **Remove Style Colors With No Quantities** is therefore an explicit cleanup command, not an automatic persistence rule.

Acceptance requirements:

- Product count, color count and total-unit count are computed independently.
- Setting the last non-zero cell to zero retains selection until explicit removal.
- Explicit zero-color cleanup is previewable, auditable and idempotent.
- Submit validation states whether zero-total submission is allowed; the enabled reference button is not sufficient evidence that the server accepts it.
- Snapshot and UI tests include a style with multiple selected colors, zero and non-zero matrices, and removal/re-add behavior.

### 15.3 Add Products selector contract

OBSERVED from an editable Note order:

- Add Products opens an overlay/drawer while preserving the order-detail URL.
- Header count is expressed as selected Styles and selected Style Colors.
- Only shared linesheets are selectable.
- The selector has linesheet context, search, product cards and pagination.
- Product cards expose name, style number, wholesale, suggested retail and Fabrication.
- Selection checkboxes operate at style-color granularity.
- Existing/unavailable style-colors may be disabled while other style-colors remain selectable.
- Cancel closes without mutation; Add to Order remains disabled until a valid selection exists.

The selector is not the same surface as the standalone `/ra/products` browser. `synth-v2` should reuse query/domain contracts but may use separate presentation components for order-scoped add and catalog browsing.

Required selector API:

- Cursor/page pagination with stable ordering.
- Search and filter state bound to the commercial publication snapshot.
- `selectable` plus machine-readable `disabledReason` per style-color.
- Existing membership flag independent of quantity.
- Server-side revalidation when Add to Order is submitted.
- Selection counts returned or deterministically derived from stable IDs.

### 15.4 Import and batch export

OBSERVED Import Orders wizard:

- Step 1 requires an import template and an uploaded file.
- Available templates: **JOOR Standard Excel Order** and **JOOR Vertical Order Template (UPC)**.
- Accepted copy states Excel or CSV with a 4 MB maximum.
- Drag-and-drop and Browse files entry points are present.
- A three-step progress indicator is shown.
- Next is disabled until the required inputs are satisfied.
- Steps 2–3 remain GATED because uploading a file would transmit data.

OBSERVED order-confirmation/batch download with no selected rows:

- **PDF** and **Excel** apply to selected orders and are disabled when no order is selected.
- **Raw Order Data** applies to all matching orders, is selected by default in the observed no-selection state, and enables Download.
- This all-results export is materially different from exporting only the visible page.

Required import contract:

- Template version is explicit and stored with the job.
- Upload is scanned and parsed outside the request transaction.
- Dry-run validation returns row/cell errors without creating orders.
- Preview shows create/update/reject counts and currency/brand/door conflicts.
- Commit requires an idempotency key and an immutable source-file hash.
- Job results are visible in Activity Center and exclude file contents/secrets from logs.

Required export contract:

- Scope must be explicit: selected IDs, current filtered result set, or all permitted orders.
- Show the resolved count before execution and require a deliberate confirmation for all-results export.
- Export permissions, filter snapshot, actor, format and artifact expiry are audited.
- Large exports run as jobs with retry-safe artifact creation and expiring signed download URLs.

### 15.5 Order detail fields and projections

Newly confirmed fields/sections:

- Contacts with Sales Rep and Buyer roles; each can have an email and may be missing.
- Financial Summary: total order value, total retail value, wholesale subtotal including product discounts, order discount percent/value, shipping fees and grand total.
- A rounding disclaimer confirms displayed components may not arithmetically reconstruct the authoritative total.
- Shipping exposes Door, Shipping Method and Tracking Number.
- Billing exposes tax identifier, Billing Code and Payment Method.
- Product attributes can include Country of Origin.
- Style detail can include Materials, Country of Origin and Description in addition to prices, delivery, sizes and colors.
- Product lists paginate inside the order; actions include Load More Products or Load All Products.
- Legal Terms & Conditions are attached at order level and can be long, localized and brand-specific.

The Order Details editor additionally exposed:

- Order Created Date — immutable.
- Linesheets — derived from products and immutable in the observed state.
- Warehouse — immutable in the observed state.
- Season and Year — displayed but immutable in the observed state.
- Division — derived from products.
- Order Delivery Window — derived from products in the observed state.
- Event — immutable; the observed value demonstrated that source channel/device is retained.
- Order Type — displayed but immutable in the observed state.

Model implications:

- Separate source channel/event from the user-facing order type.
- Store Warehouse as a reference/snapshot, not free text.
- Store Sales Rep and Buyer as role assignments with optional membership/external-contact references.
- Version legal terms and retain the exact accepted/rendered order snapshot; never copy reference-site legal text into product source.
- Server calculations return both atomic components and authoritative totals with rounding metadata.
- Product pagination must not change order-level totals or counts.

### 15.6 Payment capability states

Two distinct Pay-tab states were safely observed:

1. A brand/order without a usable online payment flow shows an **Interested in paying online?** explanation and **I'm interested** lead action.
2. An approved order can additionally expose **Pay now** while the interest CTA remains present.

Do not model the Pay tab as a boolean. Required capability state:

~~~text
paymentCapability:
  providerAvailable
  brandEnabled
  retailerEligible
  orderEligible
  payableAmount
  currency
  payNowAllowed
  interestLeadAllowed
  blockedReasons[]
~~~

`I'm interested` is a lead/notification command, not a payment command. It needs separate consent, idempotency, rate limiting and audit behavior. The Pay now dialog, payment instruments, fees and successful settlement remain GATED.

### 15.7 Connection and storefront gating

Newly confirmed:

- Incoming requests link to a full brand storefront and expose **Accept**.
- Before acceptance, the storefront can still show brand profile, editorial/product previews, collection cards and color swatches.
- Linesheets, ordering and representative information remain gated.
- Individual storefront content can display its own selective-retailer restriction.
- A rich incoming storefront exceeded 9,900 px document height and contained hundreds of media/swatch assets; representative product tiles were four-column at about 220 × 450 px, swatches about 20 × 20 px and two-column collection covers about 550 × 367 px.
- Connected-brand legacy profile routes redirect to the modern storefront.
- During initial storefront hydration, a connected brand briefly rendered a Connect CTA before relationship data resolved, then corrected itself.

Required storefront/access design:

- Content-block visibility supports public preview, relationship-required, invitation-required and selected-retailer audience rules.
- Catalog/ordering authorization remains server-side even if preview content is public.
- Initial relationship/entitlement state is pessimistic: show a skeleton/disabled action until resolved; never flash an actionable Connect/Accept/Order control with unknown authorization.
- Media is lazy-loaded, virtualized where appropriate, has responsive variants and limits concurrent requests.
- Content limits and performance budgets cover very long storefronts and hundreds of assets.

Security observation from legacy routes:

- Accept, decline/not-now, disconnect and pending-cancel controls were represented as navigable GET-like URLs.

`synth-v2` must preserve its stronger command semantics: POST/PUT/PATCH/DELETE as appropriate, CSRF protection for cookie sessions, idempotency, confirmation for destructive disconnect, and no state mutation from link prefetch/crawling.

### 15.8 Messaging folder policies

Newly confirmed folder differences:

- Inbox columns: From, Message, Date; Delete and read/unread bulk actions.
- Invitation uses the same columns and bulk actions but can omit Compose.
- Sent changes the first column to To and did not expose the same Delete action in the observed state.
- Trash can be empty and does not imply the same action set as Inbox.
- A connection-scoped compose route pre-fills the recipient and removes the all-connections/recipient selector, leaving Subject, Message and optional image attachment.

Required policy model:

- Folder is a per-user projection, not a mutable global message folder.
- Available bulk actions are derived from folder, ownership, read state and retention policy.
- Sent recipient display uses recipient snapshots but stable membership/account IDs.
- Connection-scoped compose validates that the relationship still permits messaging at send time.
- Do not mark messages read merely by listing or prefetching them; message-open state change is an explicit, idempotent command.

### 15.9 Verification reference data

OBSERVED verification panel:

- Country selector.
- Tax ID input with example formatting placeholder.
- Add to profile command.
- The selector returned 133 country/territory labels.
- Several labels are business aliases or legacy/non-ISO names rather than canonical ISO display names.

Required reference model:

- Canonical ISO 3166 country code where applicable.
- Localized canonical label.
- External/provider aliases and legacy labels.
- Tax identifier type, format/help text and validation policy by jurisdiction.
- Verification status, provider/reference, requested/verified/expired timestamps and reason.
- Tax ID encryption/redaction and permission-scoped access.

Do not copy the observed country labels into a hard-coded enum. Map external aliases to canonical internal codes and preserve the submitted snapshot for audit.

### 15.10 Cross-cutting feedback and support

OBSERVED but non-core:

- A satisfaction survey can overlay the order registry with a 1–5 scale and Send Feedback.
- A support/messaging widget is embedded across routes.

These should not block wholesale parity. If implemented, treat them as configurable integrations with consent, CSP/privacy review, lazy loading, failure isolation and no ability to obscure critical order actions. A third-party widget failure must not fail the cabinet.

### 15.11 Strengthened gap items

The following requirements refine existing gap IDs:

| Existing ID | Strengthening from this pass |
|---|---|
| ORD-03 | Add Note-with/without-quantities facets, explicit Pending → Edit command, Shipped/Cancelled read-only rules and status history |
| ORD-05 | Add total retail, discounts, fees, authoritative rounding metadata and totals independent of product pagination |
| ORD-06 | Preserve multi-status facets and nested Notes quantity facet; selected filters must survive navigation intentionally |
| ORD-08 | Add selected-versus-filtered-versus-all export scope, count preview, async artifacts and audit |
| ORD-09 | Add template version, 4 MB Excel/CSV gate, dry run, row errors, source hash and three-step job lifecycle |
| PAY-01 | Split payment capability, Pay now, interest lead and blocked reasons |
| CON-01 | Add incoming storefront preview, audience gates and safe non-GET connection commands |
| STO-01 | Add selected-retailer block visibility, long-page media budgets and pessimistic hydration |
| MSG-01 | Add folder-specific column/action policies and explicit read command |
| MSG-02 | Add relationship-prefilled compose variant |
| PRO-01 | Add canonical country/alias/tax-type verification model |

CODE-CONFIRMED comparison with the current `synth-v2` implementation:

- Existing strengths to keep: order creation already uses `commandId` idempotency, a database transaction, an outbox event, a pinned commercial snapshot and an explicit cancellation reason. These are stronger foundations than the observed legacy GET-like mutation routes and must not be weakened for visual parity.
- The executable order lifecycle currently exposes only `draft`, `ready`, `attached` and `cancelled`; it does not yet model the observed Note without quantities, Note with quantities, Pending, Approved and Shipped behavior or their distinct commands and editability rules.
- The showroom selection and order-line forms currently persist a flat positive-quantity SKU line. They cannot represent a selected style/colorway whose entire size run is zero, so the observed Products/Colors counts and explicit zero-quantity cleanup cannot be implemented faithfully without separating assortment membership from quantities.
- Current order terms cover incoterm, payment days, prepayment and delivery dates. The observed order projections additionally need season/year, warehouse, division, event/source, order type, representative/buyer snapshots, retail totals, discounts, shipping fees, rounding metadata and capability-derived actions.

New gap items:

| ID | Priority | Gap | Required deliverable | Acceptance evidence |
|---|---:|---|---|---|
| ORD-10 | P0 | Product/color membership is conflated with quantity | Persist selected styles/colorways separately from size quantities | Zeroing the last quantity retains the color until explicit removal; counts remain correct |
| UX-01 | P1 | Unknown relationship/entitlement state can flash an unsafe CTA | Pessimistic loading/authorization primitives for gated actions | Slow-network tests never expose actionable Connect/Accept/Order/Pay controls before authorization |
| REF-01 | P1 | Country/tax reference normalization is absent | Canonical country codes, provider aliases and jurisdictional tax metadata | Legacy labels round-trip to canonical codes without losing submitted snapshots |
| SUP-01 | P2 | Optional support/feedback integrations are undefined | Isolated configurable widget/CSAT adapter | Provider failure, CSP block or opt-out cannot break or obscure core flows |

### 15.12 Remaining safe boundary after the second pass

Still intentionally not executed:

- Submit for Approval, Edit Order transition, status change and duplicate order.
- Changing or saving a quantity, contact, address or order-detail field.
- Add to Order and zero-color cleanup.
- Import file upload, import preview/commit and any download/export.
- Accept, decline, disconnect or cancel a connection.
- Send message, mark read/unread, delete/trash or open an unread message.
- Add tax ID to profile.
- Pay now, I'm interested or any payment instrument flow.

Those actions require a dedicated disposable tenant or explicit approval for controlled state-changing UAT. Their absence must remain visible in parity reporting.

