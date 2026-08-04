# JOOR Retailer Cabinet — исчерпывающая карта процессов, экранов и данных

Статус: reference-only, не является интеграцией или изменением реализации Syntha V2.  
Источник: read-only аудит production-интерфейса JOOR под авторизованной ролью Retailer / LITE, выполненный 4 августа 2026 года.  
Назначение: единая навигационная карта для проектирования улучшенного аналога кабинета.

> В документ сознательно не включены реальные адреса, сообщения, контакты и коммерческие значения конкретного аккаунта. Зафиксированы структура данных, поля, действия, состояния и связи. Закрытый brand-side back office, платный Visual Assortment, установленный Shopify, JOORPay и полный submit/approve/ship цикл требуют отдельного тестового доступа.

---

## 1. Как читать карту

Для каждого раздела фиксируются:

1. точка входа и маршрут;
2. назначение;
3. информационные блоки;
4. кнопки и действия;
5. поля ввода;
6. варианты выбора;
7. проверки и ограничения;
8. что читается, сохраняется, загружается, выгружается или отправляется;
9. связанные сущности;
10. следующий шаг пользователя;
11. состояния загрузки, пустых данных и ошибок;
12. что следует реализовать в улучшенной версии.

Обозначения:

- OBSERVED — непосредственно видно и проверено;
- INFERRED — следует из доступного интерфейса, но действие не выполнялось;
- GATED — закрыто тарифом или другой ролью;
- MUTATION — изменяет данные и в ходе аудита не запускалось;
- EXTERNAL — переход во внешний сервис.

---

## 2. Общая архитектура кабинета

### 2.1 Product shell

Постоянная верхняя панель содержит:

| Элемент | Что показывает | Действие |
|---|---|---|
| LITE | Текущий plan/entitlement | Информирует об уровне доступа |
| JOOR logo | Product identity | Переход на Dashboard |
| Shop | Buying entry | Dropdown: Linesheets, Looks, Styleboards |
| Orders & Visual Assortment | Order operations | Dropdown: Orders, Visual Assortment |
| Explore Brands | Network/discovery | Dropdown: connections, submissions, requests, favorites, discovery, Passport |
| Notification badge | Количество событий в Explore Brands | Открывает соответствующий dropdown |
| Get Shopify App | Интеграционный upsell | EXTERNAL: Shopify App Store |
| Active account | Текущая организация и account ID | Account menu и переключение организации |
| Messages badge | Число непрочитанных/входящих | Inbox |
| Cart icon | Текущий cart/draft order | Cart |
| Help | SSO в Help Center | EXTERNAL/SSO |
| Logout | Завершение сессии | MUTATION: session termination |
| Support chat | Floating launcher | Открывает support messenger |

### 2.2 Предлагаемая единая IA для Syntha V2

~~~text
Dashboard
├── Discover
│   ├── All Brands
│   ├── Passport Events
│   ├── Brand Submissions
│   └── Favorites
├── Connections
│   ├── Incoming Requests
│   ├── Sent / Pending
│   └── Connected Brands
├── Buying
│   ├── Linesheets
│   ├── Product Catalog
│   ├── Cart / Draft Orders
│   ├── Orders
│   ├── Looks / Collections
│   ├── Styleboards
│   └── Visual Assortment
├── Inbox
│   ├── Inbox
│   ├── Invitations
│   ├── Sent
│   └── Trash
├── Integrations
│   ├── Shopify
│   └── Activity Center
└── Account
    ├── User Settings
    ├── Company Profile
    ├── Locations & People
    ├── Subscription
    └── Account Switcher
~~~

### 2.3 Роли

#### Retailer / Buyer — OBSERVED

- управляет retailer company profile;
- ищет бренды;
- принимает и отправляет connection requests;
- получает submissions;
- просматривает storefront и linesheets;
- создаёт и ведёт orders;
- получает Looks и создаёт Styleboards;
- работает с messages;
- подключает integrations;
- может состоять в нескольких accounts.

#### Brand / Seller — INFERRED

- ведёт storefront;
- публикует linesheets/styles/documents;
- управляет team contacts;
- отправляет requests/submissions/messages;
- получает и обрабатывает orders;
- создаёт Looks;
- участвует в Passport events.

#### Organization administrator — OBSERVED/INFERRED

- управляет membership пользователя;
- определяет Primary Account;
- переключает пользователя между несколькими accounts;
- управляет profile/privacy/connection permissions;
- контролирует integrations и subscription.

#### Premium user — GATED

- получает Visual Assortment;
- entitlement ограничивает users, doors, products и retention.

---

## 3. Полная карта маршрутов

| Область | Route | Экран | Статус |
|---|---|---|---|
| Home | /ra/home | Dashboard | OBSERVED |
| Linesheets | /collections/shop#dd=all | Linesheet search | OBSERVED |
| Looks | /ra/showroom/collections | Looks / Collections | OBSERVED |
| Styleboards | /ra/showroom/styleboards | Manage Styleboards | OBSERVED |
| Orders | /orders | Manage Orders | OBSERVED |
| Catalog | /ra/products | Product Catalog | OBSERVED |
| Catalog alias | /products | Redirect в /ra/products | OBSERVED |
| Cart | /orders/cart | Cart Orders | OBSERVED empty state |
| Visual Assortment | /ra/visual-assortment | Assortment workspace | GATED |
| Connected | /matches/current | Manage Connections | OBSERVED |
| Incoming | /matches/requests | Connection Requests | OBSERVED |
| Pending | /matches/pending | Pending Connections | OBSERVED |
| Submissions | /ra/submissions?tab=new | Brands Interested In You | OBSERVED |
| Favorites | /r/passport/favorites | Favorites | OBSERVED empty state |
| Discovery | /ra/find_new_brands | Find New Brands | OBSERVED |
| Passport | /r/passport | Events/marketplaces | OBSERVED |
| Passport Event | /r/passport/:eventSlug | Event brands | OBSERVED |
| Storefront | /ra/storefront/:brandId | Brand storefront | OBSERVED |
| Designer profile | /ra/designers/view/:brandId | Storefront redirect target | OBSERVED |
| Legacy designer | /designers/view/:brandId | Legacy entry | OBSERVED redirect |
| Brand request profile | /Accounts/view/:brandId | Profile from incoming request | OBSERVED route |
| Messages | /messages | Inbox | OBSERVED |
| Invitations | /messages/invitation | Invitation folder | OBSERVED route |
| Sent | /messages/sent | Sent folder | OBSERVED route |
| Trash | /messages/trash | Trash folder | OBSERVED route |
| Compose | /messages/send | Compose message | OBSERVED |
| Compose brand | /Messages/send/:brandId | Compose pre-addressed | OBSERVED route |
| Settings | /accounts/settings | User/account settings | OBSERVED |
| Company profile | /ra/profile/:accountId | Retailer profile | OBSERVED view/edit |
| Shopify | /ra/shopify/retailer-product-sync/config | Shopify sync | OBSERVED disconnected |
| Plans | /ra/subscriptions | Subscription plans | OBSERVED |
| Jobs | /ra/data-activity-center | Activity jobs | OBSERVED empty state |
| Help | /ra/zendesk/sso?... | SSO Help Center | OBSERVED route |
| Logout | /users/logout | Logout | Не запускался |
| Legacy shop by brand | /Matches/shop | Redirect Connected | OBSERVED |
| Legacy shop by linesheet | /Collections/shop | Linesheets | OBSERVED route |
| Legacy Best Sellers | /Styles/best_sellers | Best sellers | OBSERVED stuck loading |
| Legacy account home | /Accounts/home | Home alias | OBSERVED route |

---

## 4. Dashboard — полный состав

### 4.1 Назначение

Стартовая retailer-панель одновременно решает четыре задачи:

1. быстрый доступ к операционным разделам;
2. продолжение покупок у connected brands;
3. обработка отношений с брендами;
4. discovery и upsell.

### 4.2 Блоки по порядку

#### Header

Описан в разделе Product shell.

#### Visual Assortment promo

- заголовок/описание ценности;
- CTA Explore subscriptions;
- переход на plans;
- GATED feature awareness.

#### Promotional banner carousel

- image banner;
- marketing campaign UTM;
- переход на brand storefront или Passport Event;
- повторяющиеся слайды;
- next/previous carousel navigation.

#### Connected Brands

На карточке:

- brand logo/image;
- brand name;
- category list;
- View Orders;
- Shop.

Действия:

- Search connected brands;
- See All;
- открыть storefront;
- открыть Orders с brandName filter;
- запустить shopping flow.

#### Brands Interested in You

- объясняет роль retailer profile;
- CTA/profile link;
- направляет к заполнению profile для улучшения matching;
- связан с Submissions.

#### Connection Requests

На карточке:

- brand image/name;
- categories;
- переход в storefront/profile.

Действия:

- See All;
- открыть incoming requests;
- затем Accept/Not Now.

#### New to JOOR

- category selector, начальное значение All;
- карусель новых brands;
- brand image/name/categories;
- See All.

Обнаруженный дефект: See All ведёт на Pending Connections вместо All Brands.

### 4.3 Dashboard data

Читается:

- active account;
- plan;
- message/notification counts;
- connected brands;
- incoming requests;
- submissions/profile prompt;
- new brands;
- promo campaigns.

Не сохраняется напрямую:

- Dashboard не является самостоятельной data entity;
- он агрегирует данные других bounded contexts.

---

## 5. Discovery: Find New Brands

### 5.1 Порядок работы

1. Открыть Explore Brands → Find New Brands.
2. Получить All Brands grid.
3. При необходимости изменить Sort by.
4. Открыть Show Search and Filters.
5. Заполнить один или несколько filters.
6. Нажать Apply.
7. Просмотреть brand cards.
8. Открыть storefront.
9. Добавить favorite или request connection.
10. После request увидеть Requested.

### 5.2 Блоки

- page title Find New Brands;
- section title All Brands;
- Show Search and Filters;
- Sort by;
- applied filter count;
- filter drawer;
- brand grid;
- lazy loading;
- support chat.

### 5.3 Поля filters

| Поле | Тип | Значение |
|---|---|---|
| Search brand by name | Text | Brand name |
| Currency | Select/autocomplete | Currency context |
| Minimum | Numeric/text | Min wholesale price |
| Maximum | Numeric/text | Max wholesale price |
| Pay with JOORPay | Checkbox Yes | Только бренды с platform payment |
| Categories | Multi-checkbox | Product category dictionary |

Buttons:

- Clear All — disabled при отсутствии filters;
- Apply — disabled до изменения;
- Show Search and Filters — toggle drawer.

### 5.4 Category dictionary

- Accessories
- Activewear/Yoga
- Beauty
- Bridal
- Candles
- Denim
- Eco-friendly
- Evening
- Eyewear
- Gifts
- Handbags
- Hats
- Home
- Hosiery
- Jewelry
- Kids
- Lingerie
- Luggage
- Mens Bags
- Mens RTW
- Mens Shoe
- Mens Underwear
- Outdoor
- Outerwear
- Plus Size
- Resort Wear
- Special Occasion
- Swimwear
- Watches
- Womens RTW
- Womens Shoe

### 5.5 Brand card

Показывает:

- image/logo;
- name;
- categories;
- relationship label, например Requested.

Действия:

- open brand;
- favorite;
- request connection;
- после connection — shop/message/orders.

### 5.6 Состояния

- default results;
- loading;
- filters applied N;
- no results;
- Requested;
- Connected;
- hidden/private brand;
- access or network error.

---

## 6. Connections — полный lifecycle

### 6.1 Единая state machine

~~~text
NONE
├── Retailer requests → OUTGOING_PENDING
│   ├── Brand accepts → CONNECTED
│   ├── Brand declines → DECLINED/NONE
│   └── Retailer cancels → NONE
└── Brand requests → INCOMING_PENDING
    ├── Retailer accepts → CONNECTED
    └── Retailer chooses Not Now → DECLINED/ARCHIVED

CONNECTED
├── Shop
├── View Orders
├── Message
├── Receive Submissions
└── Disconnect → NONE
~~~

### 6.2 Connected Brands

Route: /matches/current

Blocks:

- Search by Name or ID;
- Submit;
- Advanced Search;
- Wholesale Price Range;
- Categories;
- Clear Filters;
- Search;
- Manage Connections;
- result count;
- view size 60/120/240;
- brand list.

Card/actions:

- brand name/profile;
- Connected label;
- message icon;
- remove/disconnect link;
- hidden/conditional Connect action may exist in shared template.

Data:

- retailerAccountId;
- brandAccountId;
- connection status;
- created/accepted timestamps;
- permissions/access;
- last interaction.

### 6.3 Incoming Requests

Route: /matches/requests

Card:

- brand image;
- brand name;
- View Profile;
- request date;
- Connect;
- Not Now.

Accept sequence:

1. open brand profile;
2. review profile/categories/price/team;
3. click Connect;
4. confirmation recommended;
5. set status CONNECTED;
6. expose shop/linesheets/messages;
7. write audit event;
8. notify brand.

Not Now sequence:

1. click Not Now;
2. set DECLINED or ARCHIVED;
3. remove from active inbox;
4. preserve audit/history;
5. optionally allow later restore.

### 6.4 Pending Connections

Route: /matches/pending

Controls совпадают с Manage Connections.

Card:

- brand profile;
- Pending status;
- cancel/remove icon.

Cancel sequence:

1. select cancel;
2. confirmation;
3. mutation;
4. status CANCELLED_BY_RETAILER;
5. notify/avoid notify according to policy;
6. restore request CTA.

### 6.5 Security requirement

В исходном интерфейсе mutations представлены URL вида:

- /Matches/accept/:requestId
- /Matches/decline/:requestId
- /Matches/delete_by_account/:brandId/...
- /Matches/match/:brandId

В новой системе:

- POST /connections/requests;
- POST /connections/:id/accept;
- POST /connections/:id/decline;
- DELETE /connections/:id;
- CSRF/session protection;
- organization permission;
- idempotency key;
- confirmation;
- audit log;
- optional undo grace period.

---

## 7. Brand Submissions

### 7.1 Назначение

Brand discovery outreach, отличающийся от connection request. Бренд находит retailer profile и отправляет персонализированное visual предложение.

### 7.2 Tabs

- New;
- Viewed;
- All.

### 7.3 Предлагаемая entity

- submissionId;
- brandAccountId;
- retailerAccountId;
- title;
- message;
- cover media;
- attached styles/linesheets/look;
- createdAt;
- viewedAt;
- status NEW/VIEWED/ARCHIVED;
- CTA target;
- relationship status.

### 7.4 Flow

1. brand создаёт submission;
2. retailer notification count увеличивается;
3. submission находится в New;
4. открытие ставит Viewed;
5. retailer открывает storefront/linesheet;
6. retailer connects, favorites, messages или ignores;
7. All сохраняет историю.

---

## 8. Favorites

Route: /r/passport/favorites

Observed empty state:

- title Favorites;
- footer;
- отсутствуют guidance и CTA.

Требуемая версия:

- favorite brand cards;
- source: discovery/passport/storefront;
- date added;
- notes;
- custom tags/lists;
- category/price/event filters;
- remove;
- compare;
- connect;
- message;
- shop;
- empty CTA Explore Brands.

Persistence:

- user-level или account-level favorite;
- рекомендуется account-level с optional private user notes.

---

## 9. Passport Events

### 9.1 Passport landing

Route: /r/passport

Blocks:

- hero/promotional stories;
- Featured Events;
- Shop Passport Marketplaces;
- Browse Retail Shows;
- partners;
- Brand Registration;
- Retailer Registration;
- footer/social links.

Buttons:

- event/marketplace tiles;
- Register to Exhibit;
- Register to Attend;
- Learn More.

### 9.2 Event detail

Route: /r/passport/:eventSlug

Blocks:

- title;
- description;
- Style Stories;
- category story tabs, например Swimwear/Apparel/Footwear/Accessories;
- Filter;
- category;
- min price;
- max price;
- search;
- results count;
- participating brand grid.

Flow:

1. open Passport;
2. select event;
3. read story;
4. choose style story/category;
5. set min/max;
6. search;
7. open brand;
8. view storefront;
9. favorite/connect/shop.

Event data:

- slug;
- title;
- description;
- cover/hero;
- start/end/active state;
- stories;
- categories;
- participating brands;
- registration configuration;
- sponsor/partner assets;
- result ordering.

---

## 10. Brand Storefront

### 10.1 Read mode

Possible content:

- brand logo;
- hero;
- page title;
- overlay title;
- brand name;
- Shop;
- favorite heart;
- message icon;
- description;
- year established;
- categories;
- wholesale price range;
- retail price range;
- website;
- Instagram/social;
- Meet the Team;
- team card name/role/email;
- documents;
- View Document;
- custom brand pages/sections.

### 10.2 Actions

| Action | Result |
|---|---|
| Shop | Open/start brand order context |
| Favorite | Save brand |
| Message | Compose to brand |
| Website/social | External page |
| Team contact | Contact context |
| View Document | Open/download brand document |
| Connect | Create connection request if disconnected |
| View Orders | Orders filtered by brand |

### 10.3 Publishing validation

Не разрешать publish storefront, если:

- title Untitled Page;
- overlay placeholder;
- missing hero without intentional fallback;
- invalid price range;
- minimum greater than maximum;
- currency missing;
- broken social/website URL;
- missing accessibility alt;
- document unavailable;
- contact email malformed.

### 10.4 Storefront → Catalog context

Требуемый порядок:

1. user clicks Shop;
2. system resolves brand;
3. checks CONNECTED/access;
4. retrieves available price types;
5. if one price type — preselect;
6. if several — ask user;
7. creates/resumes draft order;
8. loads catalog scoped to brand;
9. preserves context in URL/session;
10. displays current order in sticky header.

---

## 11. Linesheets

Route: /collections/shop#dd=all

### 11.1 Filters

#### Brand

- native select;
- connected brand list;
- archived markers possible;
- Submit.

#### Search Styles

Search by:

- Style Name;
- Style Number;
- Color;
- Tag.

#### Delivery Date

Options:

- All Available;
- Immediates;
- Select Date Range.

When date range:

- From;
- To;
- date picker links.

#### Category tree

Top-level observed:

- Womens;
- Mens;
- Unisex;
- Home;
- Baby Boys;
- Baby Girls;
- Baby Neutral/Accessories;
- Girls;
- Boys;
- Outdoor.

Nested examples:

- Apparel;
- Denim;
- Shoes;
- Handbags;
- Accessories;
- Hosiery;
- Intimates;
- Swimwear;
- Outerwear;
- Activewear;
- Gifts;
- Jewelry;
- Sunglasses;
- Goodies;
- Bridal;
- Golf;
- Tennis;
- Raw Materials.

#### Global actions

- Submit per filter block;
- Clear Filters;
- Search;
- sort Brand Name;
- sort Delivery Date.

### 11.2 Linesheet card — required

- cover;
- brand;
- linesheet name;
- season;
- categories/divisions;
- available from/to;
- delivery window;
- currency/price types;
- style count;
- new/updated badge;
- archived/unavailable indicator;
- Open/Shop.

### 11.3 Empty state diagnostics

Вместо No linesheets found показывать причину:

- no active connection;
- no assigned price type;
- no published linesheets;
- outside availability dates;
- filter excludes results;
- brand archived;
- user/door restriction;
- loading/API error.

---

## 12. Style and variant information — implementation target

Style detail не был доступен без order context, но catalog filters и Shopify mapping определяют минимальную модель.

### 12.1 Style fields

- styleId;
- brandId;
- linesheetId;
- style name;
- style number;
- description;
- category;
- division;
- silhouette/type;
- fabrication;
- season;
- badges;
- style tags;
- media/photos;
- delivery window;
- inventory availability;
- wholesale price range;
- suggested retail;
- currency;
- active/archived;
- modifiedAt.

### 12.2 Variant/SKU fields

- color;
- color code;
- size;
- size scale;
- SKU code;
- UPC/barcode;
- wholesale price;
- suggested retail price;
- variant price;
- available-to-sell;
- minimum/order increment;
- delivery;
- image override.

### 12.3 Actions

- choose color;
- choose size;
- enter quantity;
- add style/variant to order;
- remove;
- view image/gallery;
- open linesheet;
- compare;
- add to Look/Styleboard/Assortment;
- copy SKU;
- download media if permitted.

---

## 13. Start an Order

Route: /ra/products when no active order context.

### 13.1 Initial modal

- heading Start an Order;
- required Search for a brand;
- autocomplete;
- More options disabled until brand;
- Start an Order disabled until valid context.

### 13.2 Expected order

1. select brand;
2. validate connection;
3. retrieve price types;
4. select Price Type;
5. optionally open More options;
6. select season/buyer/currency/door/delivery if configured;
7. click Start an Order;
8. create draft;
9. load Catalog.

### 13.3 Validation

- brand required;
- connection/access required;
- price type required;
- buyer may be required;
- currency compatible;
- order cannot create duplicate context without resume choice;
- clear feedback on no available catalog.

---

## 14. Product Catalog

Route: /ra/products

### 14.1 Header

- Catalog;
- Order for;
- Select Price Type;
- Styles Selected count;
- Orders Created count;
- View Order.

### 14.2 Group By options

- None;
- Linesheet Group;
- Silhouette;
- Badge.

### 14.3 Sort By options

- None;
- Price Low to High;
- Price High to Low.

### 14.4 Filter By options

- Badges;
- Categories;
- Division;
- Fabrication;
- Inventory Availability;
- Linesheet;
- Linesheet Delivery Window;
- Price Types;
- Season;
- Silhouette;
- Style Tags;
- Wholesale Price Range.

### 14.5 Other controls

- filter value selector;
- Filters Applied count;
- Search;
- product grid;
- loading;
- no results;
- View Order.

### 14.6 Persistence

Catalog filters:

- transient URL/query state;
- optional saved view per user;
- must not alter product data.

Style selection:

- server-authoritative draft/order lines;
- optimistic UI only with rollback;
- quantity and price validated server-side;
- selected count derived from current draft.

---

## 15. Cart / Draft Orders

Route: /orders/cart

### 15.1 Architecture

- cart contains one or several brand-specific draft orders;
- brand tiles switch current order;
- each order has line items;
- cart is not a single cross-brand checkout transaction.

### 15.2 Blocks/states

- Cart Orders;
- explanation that cart is separated by brand;
- brand tiles;
- Back to Catalog;
- style rows;
- quantity editing;
- notes;
- Save;
- delete style;
- delete order;
- Minimums not Met;
- submit;
- empty cart.

### 15.3 Observed warnings

- changes must be saved manually;
- unsaved changes may be lost;
- unmet minimums may still be submitted;
- brand may decline such order.

### 15.4 Required improved sequence

1. add style;
2. create/update draft server-side;
3. autosave quantity changes;
4. show Saving/Saved/Error;
5. validate MOQ/minimum/increment/ATS;
6. group exceptions;
7. review totals and delivery;
8. add PO/buyer/notes;
9. submit;
10. idempotent request;
11. status Pending;
12. confirmation and activity event.

### 15.5 Data storage

- DraftOrder;
- DraftOrderLine;
- line quantity;
- unit price snapshot;
- currency;
- totals;
- minimum validation result;
- notes;
- dirty/saved version;
- createdBy/updatedBy;
- timestamps.

---

## 16. Manage Orders

Route: /orders

### 16.1 Summary/status controls

- Draft;
- Notes;
- Quantities:
  - With;
  - Without;
- Pending;
- Approved;
- Shipped;
- Cancelled.

### 16.2 Top actions

- Actions dropdown;
- Start an Order.

### 16.3 Mass actions

- Change Status;
- Duplicate Orders;
- Remove Style Colors With No Quantities;
- Send to Assortment.

### 16.4 Search & Filter

- Search;
- Your Selection;
- Clear All;
- Buyer;
- Date;
- Apply Filters.

### 16.5 Table columns

- selection checkbox;
- Brand;
- PO#;
- Status;
- Units;
- Total;
- Linesheet;
- Complete Ship;
- Buyer;
- Modified.

### 16.6 Bottom actions

- Import Orders;
- Download Order Confirmation;
- Export Data;
- total count;
- pagination;
- page size:
  - 10;
  - 15;
  - 20;
  - 30.

### 16.7 Order lifecycle

~~~text
DRAFT
├── internal edits
├── notes/revision
└── SUBMIT → PENDING
    ├── APPROVED
    │   ├── partial/full shipment
    │   └── SHIPPED
    ├── revision/notes loop
    └── CANCELLED
~~~

Notes и Quantities должны быть flags/validation dimensions, а не основные lifecycle states.

### 16.8 Order entity

- orderId;
- retailer account;
- brand account;
- buyer;
- PO number;
- price type;
- currency;
- status;
- notes flag/thread;
- quantities present flag;
- units;
- subtotal/total;
- linesheet references;
- complete ship;
- requested delivery;
- created/modified/submitted/approved/shipped/cancelled dates;
- origin JOOR/import/external;
- Shopify sync status;
- assortment status;
- version/audit.

---

## 17. Import, export, download and jobs

### 17.1 Upload/import

#### Import Orders

Expected:

1. choose file;
2. validate type/size;
3. upload;
4. create Activity Job;
5. parse;
6. map columns;
7. validate brands/styles/SKUs/prices/quantities;
8. preview;
9. apply;
10. result summary;
11. downloadable error rows.

#### Profile media

- logo Upload;
- Browse Images from library;
- store photos:
  - JPG/PNG/GIF;
  - up to 30 at a time;
  - 10MB each.

#### Message attachment

- JPG/PNG;
- optional;
- 4MB max.

### 17.2 Downloads

- Download Order Confirmation;
- View/Download Document;
- potentially style media if permission;
- import error report;
- export result.

### 17.3 Export Data

- requires selected orders;
- disabled without selection;
- creates or downloads order dataset;
- should expose format, columns, timezone, currency and locale.

### 17.4 Activity Job

Fields:

- Job Ref #;
- Created By;
- Type;
- Status;
- Actions;
- Start Date;
- End Date;
- Additional Info.

Recommended statuses:

- QUEUED;
- RUNNING;
- COMPLETED;
- COMPLETED_WITH_WARNINGS;
- FAILED;
- CANCELLED;
- EXPIRED.

Actions:

- Refresh;
- View details;
- Download result;
- Download errors;
- Retry;
- Cancel queued/running if supported.

---

## 18. Looks / Collections

Route: /ra/showroom/collections

### 18.1 Page blocks

- title Looks;
- filter panel;
- Current tab;
- Archived tab;
- table.

### 18.2 Filters

- Collection Name;
- Brand Name;
- Creator Name;
- Created On;
- Last Modified;
- Clear all;
- Apply Filters;
- collapse/back arrow.

### 18.3 Table columns

- Collection Name;
- Creator Name;
- Brand;
- Date Shared;
- Created On;
- Last Modified.

### 18.4 Entity

- collectionId;
- name;
- brand;
- creator;
- styles/look items;
- layout;
- cover;
- sharedTo accounts;
- dateShared;
- createdAt;
- modifiedAt;
- status CURRENT/ARCHIVED.

### 18.5 Flow

Brand creates → adds styles/layout → shares → retailer receives under Current → opens → shops styles → archives.

---

## 19. Styleboards

Route: /ra/showroom/styleboards

### 19.1 Blocks

- Manage Styleboards;
- Create New;
- Current;
- Archived;
- Search & Filter;
- table;
- Actions footer.

### 19.2 Filters

- Styleboard Name;
- Brand Name;
- Creator Name;
- Created On;
- Last Modified;
- Clear all;
- Apply Filters.

### 19.3 Table columns

- checkbox;
- Styleboard name;
- Brand Name;
- Creator Name;
- Created On;
- Last Modified.

### 19.4 Actions

- Create New;
- select row;
- open/edit;
- archive/restore;
- duplicate;
- delete;
- actions enabled after selection.

### 19.5 Entity

- styleboardId;
- name;
- retailer account;
- brand scope;
- creator;
- items;
- layout/notes;
- current/archived;
- created/modified.

---

## 20. Visual Assortment

Route: /ra/visual-assortment

### 20.1 LITE state

- value proposition;
- lock icon;
- View Plans to Unlock Today;
- Learn more;
- illustrative preview.

### 20.2 Promised capability

- unified view of buys;
- cross-brand/category aggregation;
- products ordered outside JOOR;
- collaboration;
- multiple doors;
- historical storage.

### 20.3 Plans observed

#### Standard

- 2 users;
- 1 door;
- 1,000 products;
- 2 years storage;
- monthly/yearly billing.

#### Premium

- 5 users;
- 5 doors;
- 3,000 products;
- 3 years storage;
- monthly/yearly billing.

### 20.4 Suggested assortment model

- assortment;
- season;
- budget;
- doors;
- brands/categories;
- products;
- planned vs ordered;
- units/value;
- size/color curves;
- delivery timeline;
- external imports;
- collaborators;
- snapshots/version history.

---

## 21. Messages

### 21.1 Folders

- Inbox;
- Invitation;
- Sent;
- Trash.

### 21.2 Inbox controls

- Search;
- Submit;
- Compose Mail;
- Delete;
- Mark as Read;
- Mark as Unread;
- selection checkbox;
- sort From;
- sort Message;
- sort Date;
- open message;
- pagination.

### 21.3 Inbox columns

- From;
- Message/subject preview;
- Date.

### 21.4 Compose

Fields in order:

1. Send to all my connections — radio;
2. Select Connections — radio;
3. Recipient(s) — autocomplete;
4. Subject — text;
5. Message — textarea;
6. Attach image — file;
7. Send;
8. Close.

### 21.5 Message entity

- messageId;
- threadId;
- sender user/account;
- recipient accounts;
- subject;
- body;
- attachment metadata;
- createdAt;
- readAt per recipient;
- folder state;
- deletedAt;
- optional brand/order/linesheet/style context.

### 21.6 Sending

1. choose recipient mode;
2. resolve recipients;
3. validate connection permission;
4. validate subject/body;
5. scan attachment;
6. upload attachment;
7. create message/thread;
8. fan out recipient records;
9. notify;
10. show send result;
11. audit.

---

## 22. User Settings

Route: /accounts/settings

### 22.1 Manage My Account

#### Credentials

- Email — read;
- Password masked;
- Reset password.

#### User Profile

- photo;
- Full Name;
- Job Title;
- Phone;
- Display my information on company profile;
- Upload Photo;
- Save Changes;
- Cancel/X.

#### Languages

- display language;
- email language.

Observed choices:

- English;
- Español;
- Français;
- Deutsch;
- Italiano;
- 日本語;
- 中文(简体);
- Русский;
- 한국어.

#### Email settings

Separate Yes/No choices for:

- messages;
- match/connection events;
- product/site updates;
- discounts/promotions;
- site emails;
- iPad emails.

#### Default connection request message

- Use default connect request message — checkbox;
- Message — textarea.

#### Date Format

- mm/dd/yyyy;
- dd/mm/yyyy;
- yyyy/mm/dd.

#### Landing Page

- Home;
- My Connections;
- Orders;
- Profile.

#### Round Retail Pricing

- choose one;
- none;
- 1.00;
- 5.00.

### 22.2 Retailer Account Information

- Profile Name;
- Email;
- POS System;
- Version/comments if known;
- Buyer Name;
- Connection Permission Yes/No;
- Privacy:
  - Show in Search;
  - Hide from Search.

### 22.3 Save architecture

Исходный UI раскрывает отдельный editor для каждого settings block и Save Changes.

Улучшенная версия:

- independent settings sections;
- optimistic UI only for safe preference toggles;
- explicit save for identity/privacy;
- field-level validation;
- server version check;
- success/error toast;
- audit for security/privacy changes.

---

## 23. Retailer Company Profile

Route: /ra/profile/:accountId

### 23.1 View mode

- company name;
- Get Verified;
- Why verify Tax ID tooltip;
- Edit Page;
- People;
- administrator badge;
- Primary Location;
- Other Locations;
- location name/type/address;
- map link;
- Expand All Locations.

### 23.2 Edit mode sequence

1. click Edit Page;
2. enter Editing Your Profile;
3. edit sections;
4. Save and View.

### 23.3 Logo Image

- current logo;
- Upload;
- Browse Images;
- 10MB max.

### 23.4 Verification — Tax ID

- Country select;
- Tax ID text;
- example placeholder;
- verification status;
- active business credibility explanation.

### 23.5 Basic Info

- Business Name read-only here;
- link/instruction to Account Settings;
- Description;
- Website;
- Instagram username;
- X username;
- Facebook URL.

### 23.6 Store Photos

- Upload;
- Browse Images;
- up to 30 images;
- JPG/PNG/GIF;
- 10MB per image;
- interior/exterior intent;
- ordering/delete/crop recommended.

### 23.7 People

- list account users opted into display;
- Add or update your information;
- Go to user settings;
- user controls name/title/photo/display consent.

### 23.8 Location fields in order

1. Location Name;
2. Type;
3. Year Established;
4. Wholesale Price Range:
   - Minimum Price;
   - Maximum Price;
5. Country required;
6. Address 1 required;
7. Address 2;
8. City required;
9. Territory;
10. ZIP/Postal Code;
11. Phone;
12. Categories;
13. Brands Carried;
14. Demographics:
    - Male;
    - Female;
    - Age;
15. Described as — choose up to 3;
16. Shops for — choose up to 3;
17. Delete Location.

Global location actions:

- Primary Location;
- Other Locations;
- Add another Location;
- Save and View.

### 23.9 Profile storage

- company profile;
- media assets;
- verification record;
- social links;
- location records;
- demographic tags;
- brand/category references;
- user display membership;
- privacy/search visibility.

---

## 24. Account switching

Observed:

- active account displayed in header;
- Primary Account checkbox;
- user has access to multiple accounts;
- menu can log into/switch account.

Required behavior:

1. open account menu;
2. list accessible organizations;
3. mark current and primary;
4. switch context;
5. invalidate account-scoped caches;
6. reload permissions, data and entitlements;
7. preserve user preferences;
8. never leak data from previous account;
9. log switch event.

All domain requests must carry activeAccountId validated server-side, never only from client state.

---

## 25. Shopify Integration

Route: /ra/shopify/retailer-product-sync/config

### 25.1 Disconnected state

- Integration Settings;
- Shopify tab;
- You are not connected;
- Install on Shopify;
- disabled Sync Settings;
- Not synced yet.

### 25.2 Automation

- Automatic Sync;
- sync approved orders;
- all connected accounts;
- customize by account after Expand.

### 25.3 Field Preferences

- Expand All;
- global enable;
- per-account override.

Mapping:

| JOOR | Shopify |
|---|---|
| Style Name | Title |
| Brand Name + Style Name | Title |
| Description | Description |
| Photos | Media |
| Category | Category |
| Linesheet | Collections |
| Silhouette | Type |
| Brand Name | Vendor |
| Suggested Retail Price | Price |
| SKU Prices | Variant Price |
| SKU Code | Variant SKU |
| UPC Code | Variant Barcode |

### 25.4 Integration lifecycle

~~~text
DISCONNECTED
→ Install on Shopify
→ OAuth/installation
→ CONNECTED
→ configure field mapping
→ enable automatic sync
→ approved order triggers job
→ QUEUED/RUNNING
→ COMPLETED or FAILED
→ Activity Center details/retry
~~~

### 25.5 Required conflict policies

- create vs update product;
- matching by SKU/UPC;
- title template precedence;
- currency conversion;
- image overwrite;
- variant deletion;
- inventory ownership;
- order cancellation;
- brand/account overrides;
- partial failure;
- retries/idempotency;
- rate limits;
- webhook verification.

---

## 26. Subscription and entitlements

Route: /ra/subscriptions

Blocks:

- Premium Features;
- Available For Purchase;
- plan cards;
- feature description;
- monthly price;
- yearly price;
- Purchase;
- Learn More.

Purchase was not executed.

Required model:

- plan catalog;
- feature entitlement;
- billing interval;
- price/currency;
- account subscription;
- trial;
- active/past_due/cancelled;
- usage counters;
- limits;
- proration;
- payment provider reference.

Purchase button must confirm exact plan, billing period, currency, account and amount.

---

## 27. Data Activity Center

Route: /ra/data-activity-center

Blocks:

- Data Activity Center;
- Refresh;
- jobs table;
- No Rows To Show.

Columns:

- Job Ref #;
- Created By;
- Type;
- Status;
- Actions;
- Start Date;
- End Date;
- Additional Info.

Required job types:

- order import;
- order export;
- confirmation generation;
- Shopify sync;
- external assortment import;
- media processing;
- bulk status update.

Required actions:

- view;
- download;
- errors;
- retry;
- cancel;
- refresh.

---

## 28. Data operation matrix

| Operation | Source | Destination | Persistence | Feedback |
|---|---|---|---|---|
| Search/filter | UI | API/query state | transient/saved view | results count |
| Save profile | Form | Profile service | database + media | success/error |
| Upload logo/photo | Local file | Media storage | asset + reference | progress/preview |
| Upload message image | Local file | Media/message service | attachment | validation/send |
| Import orders | Local file | Job/import service | job + orders | progress/report |
| Export orders | Orders selection | Job/export service | artifact with expiry | download link |
| Download confirmation | Order(s) | Document service | generated artifact | download |
| Send message | Compose | Messaging service | thread/message | sent/error |
| Send request | Storefront/discovery | Network service | connection request | Requested |
| Accept request | Incoming | Network service | connection Connected | confirmation |
| Save draft | Catalog/cart | Ordering service | draft/order lines | Saving/Saved |
| Submit order | Cart | Ordering/brand | status Pending | confirmation |
| Approve order | Brand side | Ordering | Approved | notifications |
| Shopify sync | Approved order | Shopify | sync job/result | Activity Center |
| Send to Assortment | Orders | Assortment service | assortment items | success/job |
| Archive Look/Board | List | Merchandising service | status Archived | updated tab |

---

## 29. Справочники

### 29.1 Connection statuses

- NONE;
- INCOMING_PENDING;
- OUTGOING_PENDING;
- CONNECTED;
- DECLINED;
- CANCELLED;
- DISCONNECTED;
- ARCHIVED.

### 29.2 Order statuses/flags

Lifecycle:

- DRAFT;
- PENDING;
- APPROVED;
- SHIPPED;
- CANCELLED.

Flags/dimensions:

- NOTES;
- WITH_QUANTITIES;
- WITHOUT_QUANTITIES;
- COMPLETE_SHIP;
- MINIMUMS_NOT_MET;
- IMPORTED;
- SYNCED/FAILED.

### 29.3 Content statuses

- Current;
- Archived;
- New;
- Viewed;
- All;
- Active;
- Unavailable;
- Published;
- Draft.

### 29.4 Job statuses

- QUEUED;
- RUNNING;
- COMPLETED;
- COMPLETED_WITH_WARNINGS;
- FAILED;
- CANCELLED;
- EXPIRED.

### 29.5 Date formats

- MM/DD/YYYY;
- DD/MM/YYYY;
- YYYY/MM/DD.

### 29.6 Page sizes

Orders:

- 10;
- 15;
- 20;
- 30.

Connections:

- 60;
- 120;
- 240.

### 29.7 Account landing pages

- Home;
- My Connections;
- Orders;
- Profile.

### 29.8 Retail rounding

- none;
- nearest 1.00;
- nearest 5.00.

### 29.9 Media limits

- profile/store image: 10MB;
- store photos: up to 30 at once;
- message image: JPG/PNG, 4MB;
- storefront documents: limit not observed.

---

## 30. Entity relationship map

~~~text
User
  └──< AccountMembership >── Account
                                 ├── RetailerProfile
                                 ├──< Location
                                 ├──< Subscription
                                 ├──< Integration
                                 ├──< ActivityJob
                                 └──< MessageParticipant

RetailerAccount
  └──< Connection >── BrandAccount
                         ├── BrandProfile
                         ├── TeamMembers
                         ├── Documents
                         ├──< Linesheet
                         │      └──< Style
                         │             └──< Variant/SKU
                         ├──< Submission
                         └──< PassportEventBrand >── PassportEvent

RetailerAccount
  ├──< Order >── BrandAccount
  │      └──< OrderLine >── Variant
  ├──< Styleboard
  ├──< Favorite >── BrandAccount
  ├──< Assortment
  └──< ReceivedLook >── Look
~~~

---

## 31. Полные пользовательские сценарии

### 31.1 Retailer onboarding

1. authenticate;
2. choose/create account;
3. set primary account;
4. complete user profile;
5. configure language/date/landing page;
6. complete company profile;
7. add primary and other locations;
8. add categories/brands/demographics;
9. configure privacy;
10. submit Tax ID verification;
11. discover brands;
12. create first connection;
13. create first order;
14. optionally install Shopify;
15. optionally upgrade Visual Assortment.

### 31.2 Discovery to order

1. Dashboard or Find New Brands;
2. search/filter/sort;
3. open storefront;
4. inspect category/price/team/documents;
5. favorite or connect;
6. wait for accept;
7. open linesheet/storefront Shop;
8. choose brand/price type;
9. start draft order;
10. filter products;
11. select styles/colors/sizes;
12. enter quantities;
13. view cart;
14. resolve minimum warnings;
15. save;
16. submit;
17. monitor Pending;
18. receive notes/approval;
19. download confirmation;
20. export/sync/send to assortment.

### 31.3 Incoming brand request

1. notification;
2. open Connection Requests;
3. open View Profile;
4. inspect brand;
5. Connect or Not Now;
6. if connected, open Shop/Message;
7. relationship becomes available across Dashboard/Connections/Catalog.

### 31.4 Passport event

1. open Passport;
2. choose event;
3. choose Style Story;
4. filter category/min/max;
5. search brand;
6. open brand;
7. favorite/connect/shop;
8. registration separately as attendee/exhibitor.

### 31.5 Message collaboration

1. Inbox;
2. filter/search/sort;
3. open or select messages;
4. mark read/unread/delete;
5. Compose;
6. choose all connections or selected;
7. autocomplete recipients;
8. subject/body;
9. optional image;
10. send;
11. store Sent;
12. notify recipients.

### 31.6 Profile improvement

1. Dashboard prompt Review your profile;
2. open Company Profile;
3. Edit Page;
4. upload logo;
5. add description/social;
6. upload store photos;
7. configure people;
8. update locations and demographics;
9. verify Tax ID;
10. Save and View;
11. profile participates in brand discovery/submissions.

### 31.7 Import/export

1. select Import Orders;
2. upload source;
3. create job;
4. validate/map;
5. preview;
6. apply;
7. inspect Activity Center;
8. download errors if needed;
9. retry corrected file.

Export:

1. select orders;
2. Export Data;
3. choose format/columns if supported;
4. create job;
5. download artifact;
6. artifact expires according to retention.

---

## 32. UI and interaction architecture

### 32.1 Page composition

Каждый list screen должен иметь:

1. page header;
2. primary CTA;
3. summary/status tabs;
4. filters;
5. applied filter chips;
6. results count;
7. table/grid;
8. selection and bulk actions;
9. pagination;
10. loading/empty/error states.

### 32.2 Form composition

1. section title and purpose;
2. required markers;
3. current value;
4. input;
5. hint/limit;
6. inline validation;
7. Save/Cancel;
8. dirty-state;
9. success/error;
10. audit metadata for sensitive fields.

### 32.3 Loading

Исходный продукт часто несколько секунд показывает только header/Loading.

Улучшенная версия:

- skeleton matching final layout;
- progressive sections;
- timeout with retry;
- explicit permission/empty distinction;
- preserve previous data while refetching;
- no infinite Loading.

### 32.4 Accessibility

Обязательно:

- accessible name для icon buttons;
- labels for inputs;
- semantic buttons, not clickable divs;
- keyboard and focus order;
- ARIA live saving/loading;
- accessible dialogs;
- table headers;
- carousel controls;
- alt text;
- WCAG AA contrast;
- responsive zoom;
- no mutation represented only by ×.

---

## 33. Наблюдаемые проблемы исходного кабинета

1. Смешаны SPA и legacy applications.
2. Routes используют разный регистр.
3. Часть aliases делает неожиданные redirects.
4. New to JOOR See All ведёт в Pending.
5. Storefront Shop теряет brand context.
6. Storefront может быть опубликован с placeholders.
7. Price ranges могут отображаться пустыми/нулевыми.
8. Best Sellers остаётся на Loading.
9. Linesheets не объясняет пустой результат.
10. Favorites empty state не ведёт в discovery.
11. Activity Center empty state ничего не объясняет.
12. Cart требует ручного Save и предупреждает о потере данных.
13. Destructive connection actions представлены GET-like links и ×.
14. Несколько buttons/inputs не имеют accessible names.
15. Старые request/message lists перегружены.
16. Visual Assortment paywall не показывает interactive preview.
17. Нет единого operational dashboard.
18. React Router выдаёт warnings о будущем v7 behavior.
19. Data-dependent content загружается поздно.
20. Privacy публичных contacts/locations не объяснена рядом с данными.

---

## 34. Требования к улучшенному аналогу

### P0

- secure mutation APIs;
- organization-scoped authorization;
- idempotent order/request/sync operations;
- autosave drafts;
- correct route/context propagation;
- storefront publish validation;
- privacy model;
- audit log;
- error recovery;
- no cross-account cache leakage.

### P1

- unified IA/design system;
- unified Connections hub;
- unified Buying hub;
- global search;
- saved filters/views;
- diagnostic empty states;
- order wizard;
- minimum/ATS/MOQ visibility;
- collaboration activity;
- accessibility AA;
- mobile responsive.

### P2

- brand comparison;
- recommendation reasons;
- profile completeness;
- favorites notes/lists;
- Passport registration state;
- Shopify dry-run/mapping preview;
- jobs retry/error files;
- external order ingestion;
- assortment planning.

---

## 35. Bounded contexts для Syntha V2

1. Identity & Organizations.
2. Profiles & Verification.
3. Network & Connections.
4. Discovery & Passport.
5. Catalog & Linesheets.
6. Ordering & Cart.
7. Merchandising & Assortment.
8. Messaging.
9. Integrations.
10. Billing & Entitlements.
11. Jobs & Audit.
12. Media & Documents.
13. Notifications.

---

## 36. Coverage and remaining unknowns

Покрыт практически весь доступный Retailer LITE surface.

Отдельный controlled audit нужен для:

- brand admin;
- linesheet/style publishing;
- style detail quantity grid;
- full order submit/approve/ship;
- paid Visual Assortment;
- connected Shopify;
- purchase checkout;
- JOORPay;
- Passport registration;
- iPad/mobile apps;
- public/internal APIs and webhooks;
- SSO/admin moderation;
- failed import/export jobs.

Документ должен использоваться как reference map и backlog source. Он не утверждает, что закрытые процессы полностью воспроизведены, и не копирует proprietary implementation.

---

## 37. Дополнение: второй глубокий проход по вложенным состояниям (2026-08-04)

Ниже добавлены детали, которые невозможно увидеть только из верхнеуровневого меню: состояния карточки заказа, модальные окна импорта и экспорта, внутреннее устройство Looks и Styleboards, все папки сообщений, публичная карточка неподключённого бренда, редактор профиля ритейлера и отдельные мини-редакторы системных настроек.

Ограничения аудита:

- реальные номера заказов, суммы, адреса, телефоны, e-mail пользователей и другие значения конкретного аккаунта намеренно не переносятся в этот документ;
- фиксируются структура, тип данных, порядок, доступные команды, статусы, ограничения и связи между объектами;
- кнопки, которые создают заказ, принимают подключение, отправляют сообщение, сохраняют профиль, запускают экспорт или скачивание, не подтверждались до необратимого действия;
- состояния форм изучались до шага отправки данных.

## 38. Карточка заказа: полный состав экрана и зависимости

Маршрут экземпляра имеет форму /ra/orders/review/{orderId}. В таблице Manage Orders переход в одну карточку дублируется почти во всех ячейках строки: бренд, PO, статус, единицы, сумма, linesheet, complete ship, buyer и modified.

### 38.1 Верхний уровень карточки

Карточка состоит из двух вкладок:

1. Overview — полная операционная и финансовая информация.
2. Pay — состояние онлайн-оплаты или форма выражения интереса к JOOR Pay.

Верхняя панель также содержит:

- Last updated с датой и инициатором изменения;
- Share Order;
- переход в Visual Assortment;
- состояние Product Sync и ссылку Integration Settings, если синхронизация не активирована;
- Comments;
- Download;
- текущий Order Status;
- Pay now, если сценарий оплаты доступен для просмотра;
- ограничения действий в зависимости от статуса заказа и полномочий пользователя.

### 38.2 Идентификационный блок заказа

Отображаются:

- Order #;
- Brand;
- один или несколько Linesheet со ссылками на соответствующие коллекции;
- Shipping Delivery Window;
- Price Type с валютой и названием прайс-листа;
- Order Status;
- дата последнего изменения.

Связи:

- заказ относится к одному бренду;
- заказ может включать товары из нескольких linesheet одного бренда;
- каждая товарная строка ссылается на Style и Linesheet;
- Price Type определяет валюту и базовую оптовую цену;
- Delivery Window существует и на уровне заказа, и как отдельное поле Complete Ship в списке.

### 38.3 Shipping and Billing

Блок разделён на Shipping Info и Billing Info.

Shipping Info:

- название юридического лица или торговой точки;
- полный адрес;
- контактный e-mail или связанный контакт;
- Door;
- Shipping Method.

Billing Info:

- название плательщика;
- полный адрес;
- VAT ID;
- Billing Code;
- Payment Method.

Состояния доступа:

- адреса могут быть read-only;
- при ограничении отображается объяснение, что изменения должен выполнить бренд;
- кнопка Edit становится disabled или отсутствует в зависимости от статуса и роли.

Для улучшенной копии необходимо хранить отдельно:

- снимок адреса, использованный в конкретном заказе;
- ссылку на актуальную карточку локации;
- признак источника адреса;
- право редактирования;
- историю изменений адреса после создания заказа;
- юридические и логистические реквизиты независимо друг от друга.

### 38.4 Products Summary

Сводные показатели:

- Total Units;
- Products — число уникальных styles;
- Colors — число заказанных colorways.

Кнопка Add Products зависит от статуса. В Approved заказе добавление и изменение товаров запрещено, интерфейс явно объясняет причину и предлагает обратиться к бренду.

Каждая товарная карточка содержит:

- изображение;
- название Style;
- Wholesale Price;
- Suggested Retail Price;
- Style Number со ссылкой в карточку товара;
- Linesheet со ссылкой;
- один или несколько цветов;
- цветовое имя и альтернативное/внутреннее имя;
- размерный ряд;
- количество по каждому размеру;
- Total Qty по цвету;
- Total Cost по цвету;
- Total Style Qty;
- Total Style Cost.

При длинном заказе действует постепенная загрузка:

- первоначально отображается ограниченное число styles;
- показывается диапазон Showing products X–Y of Z;
- Load All Products загружает остаток.

Это означает, что улучшенная версия должна поддерживать:

- постраничную или ленивую загрузку товарных строк;
- независимую агрегацию SKU → цвет → размер;
- перерасчёт totals без загрузки всех изображений;
- стабильные ссылки Style и Linesheet;
- сохранение порядка товаров;
- фиксацию цены на момент заказа, а не только ссылку на текущий прайс.

### 38.5 Contacts

Контакты представлены ролями:

- Sales Rep;
- Buyer.

Для каждого показываются имя/название и e-mail. Кнопка Edit может быть доступна даже при Approved заказе, то есть права на контакты отделены от прав на товары и адреса.

Рекомендуемая модель:

- order_contact;
- contact_role;
- source_user_id;
- snapshot_name;
- snapshot_email;
- active_from / active_to;
- edited_by;
- edited_at.

### 38.6 Financial Summary

Показываются:

- Total Order Value;
- Total Retail Value;
- Subtotal Wholesale;
- пометка Incl. Product Discounts;
- Order Discount в процентах и денежном выражении;
- Shipping Fees;
- Grand Total;
- предупреждение об округлении.

Критически важно разделять:

- исходную цену SKU;
- скидку на продукт;
- скидку на заказ;
- доставку;
- валюту;
- правило округления;
- рассчитанный итог;
- сохранённый финальный итог.

Текст интерфейса подтверждает, что арифметическая сумма отображаемых округлённых компонентов может не совпадать с финальным total. Значит, источником истины должен быть серверный decimal-расчёт с сохранением точности и правила округления.

### 38.7 Order Details

Наблюдаемые поля:

- Order Created Date;
- Season;
- Year;
- Order Delivery Window.

Этот блок должен расширяться системными атрибутами:

- internal order id;
- external PO;
- creator;
- buyer;
- sales rep;
- source channel;
- created / modified / approved / shipped / cancelled timestamps;
- version;
- integration export state;
- payment state;
- currency;
- locale/date format;
- комментарии и вложения.

### 38.8 Вкладка Pay

Если бренд не активировал JOOR Pay:

- показывается объяснение возможности онлайн-оплаты;
- есть внешняя ссылка на описание JOOR Pay;
- отображается призыв сообщить бренду об интересе;
- кнопка I’m interested инициирует отдельный коммуникационный сигнал;
- фактическая платёжная форма не показывается.

Для копии нужны отдельные состояния:

- unavailable;
- brand_not_enabled;
- retailer_not_eligible;
- interest_not_sent;
- interest_sent;
- payment_due;
- partially_paid;
- paid;
- failed;
- refunded;
- disputed.

Pay now не должен смешиваться с изменением заказа: платёжное намерение и order mutation — разные домены и журналы аудита.

## 39. Manage Orders: фильтрация, массовые действия, импорт и документы

### 39.1 Дополнительные детали списка

Фильтры статусов показывают не только названия, но и количество заказов в каждом статусе. Для Notes дополнительно есть разбиение Quantities:

- With;
- Without.

Search & Filter содержит:

- Search;
- Buyer;
- Date;
- Your Selection;
- Clear All;
- Apply Filters.

Таблица поддерживает:

- checkbox выбора всей страницы;
- checkbox каждой строки;
- сортируемые или кликабельные колонки;
- пагинацию;
- выбор размера страницы;
- общий total найденных заказов.

### 39.2 Import Orders

Модальное окно Import Orders представляет трёхшаговый процесс, что визуально отмечено шагами 1, 2, 3.

Шаг 1:

- обязательный Select an Import Template;
- варианты:
  - JOOR Standard Excel Order;
  - JOOR Vertical Order Template (UPC);
- Upload File;
- Drag and Drop;
- Browse files;
- ограничение 4 MB;
- допустимы Excel или CSV;
- Next disabled до выбора шаблона и валидного файла.

Предполагаемая дальнейшая архитектура для копии:

1. выбор схемы импорта;
2. загрузка и антивирусная/форматная проверка;
3. чтение заголовков;
4. сопоставление колонок;
5. валидация бренда, linesheet, style, color, size, currency, quantities;
6. preview валидных и ошибочных строк;
7. подтверждение;
8. асинхронное задание;
9. отчёт с row-level errors;
10. ссылка на созданные или обновлённые заказы.

Обязательные данные import job:

- uploader;
- account;
- filename;
- MIME;
- size;
- checksum;
- template;
- created_at;
- status;
- total_rows;
- accepted_rows;
- rejected_rows;
- warnings;
- downloadable error report;
- affected order ids;
- idempotency key.

### 39.3 Download Order Confirmation

Модальное окно различает выбранные заказы и все заказы.

Download selected as:

- PDF;
- Excel.

Оба пункта disabled, пока не выбрана хотя бы одна строка.

Download all as:

- Raw Order Data;
- пояснение, что будут экспортированы данные всех заказов.

Кнопки:

- Cancel;
- Download.

В улучшенной версии необходимо явно показывать:

- область выгрузки: selected / filtered / all;
- число заказов;
- число строк;
- применённые фильтры;
- формат;
- язык;
- валюту;
- часовой пояс;
- дату генерации;
- включение изображений;
- включение адресов и контактов;
- masked/unmasked PII;
- готовность файла;
- срок жизни ссылки.

### 39.4 Export Data

Модальное окно содержит:

- Select order status, по умолчанию наблюдались Notes, Pending, Approved;
- Select a type of date:
  - Complete Ship Date;
  - Created Date;
  - Modified Date;
- Add date range, disabled до выбора типа даты;
- Select a JOOR integration type;
- Basic Export;
- JOOR integration option;
- Mark exported orders — может быть disabled для Basic Export;
- Exclude previously exported orders;
- Cancel;
- Export.

Семантика требует хранить экспортный след на уровне заказа:

- export_job_id;
- integration_type;
- exported_at;
- exported_by;
- exported_order_version;
- exported_file_checksum;
- exported_filter_snapshot;
- exported_successfully;
- exclusion_reason.

Exclude previously exported orders должен сравнивать версию заказа, а не только факт когда-либо выполненного экспорта. Изменённый после экспорта заказ должен попадать в новую выгрузку либо явно отмечаться как changed_since_export.

## 40. Looks: реестр, просмотр и перенос товаров

### 40.1 Реестр Looks

Маршрут /ra/showroom/collections.

Фильтры:

- Collection Name;
- Brand Name;
- Creator Name;
- Created On;
- Last Modified;
- Clear all;
- Apply Filters.

Вкладки состояний:

- CURRENT с количеством;
- ARCHIVED с количеством.

Колонки:

- Collection Name;
- Creator Name;
- Brand;
- Date Shared;
- Created On;
- Last Modified.

Каждая ячейка строки ведёт в один объект Look. Это подтверждает отдельную сущность shared showroom collection с собственным идентификатором и жизненным циклом.

### 40.2 Просмотр Look

Вложенный маршрут имеет форму /ra/showroom/collections/{encodedCollectionId}.

Наблюдаемые элементы просмотрщика:

- большая композиция/полотно;
- богатый текст, заголовки, примечания и описания материалов;
- Hide controls;
- PREV;
- PAGE current/total;
- NEXT;
- счётчик PRODUCTS;
- счётчик selected;
- ADD PRODUCTS TO;
- Styleboard;
- Order.

Кнопки Styleboard и Order disabled при нулевом выборе. Значит, пользователь должен сначала выбрать товарные hotspots или связанные продукты на полотне.

Процесс:

1. бренд создаёт визуальный Look;
2. добавляет страницы и текстовые/медийные элементы;
3. связывает элементы изображения с products/colorways;
4. делится Look с ритейлером;
5. ритейлер открывает Look;
6. выбирает продукты;
7. переносит выбор в Styleboard или Order.

Необходимые сущности:

- look;
- look_page;
- look_widget;
- text_widget;
- media_widget;
- product_hotspot;
- hotspot_geometry;
- linked_style;
- linked_colorway;
- share;
- recipient_account;
- viewed_at;
- archived_at;
- selection_session.

## 41. Styleboards: реестр и рабочее полотно

### 41.1 Реестр Styleboards

Маршрут /ra/showroom/styleboards.

Действия и фильтры:

- Create New;
- Styleboard Name;
- Brand Name;
- Creator Name;
- Created On;
- Last Modified;
- Clear all;
- Apply Filters;
- CURRENT;
- ARCHIVED;
- row checkbox;
- Actions, disabled без выбранных строк.

Колонки:

- Styleboard name;
- Brand Name;
- Creator Name;
- Created On;
- Last Modified.

### 41.2 Карточка Styleboard

Маршрут имеет форму /ra/showroom/styleboards/{encodedStyleboardId}.

Наблюдаемые элементы:

- название;
- Products count;
- панель добавления продукта;
- Smart Buy;
- добавление text widget;
- графические инструменты;
- canvas с product image widgets;
- несколько contenteditable текстовых блоков;
- discard/remove control у объектов;
- Share;
- Comment section;
- Select price type;
- Add to Order;
- General Comments;
- Enter comment here;
- Send.

Add to Order зависит от наличия валидного выбора и price type. Send disabled при пустом комментарии.

Для улучшенной версии нужны:

- координаты, размер, rotation и z-index каждого объекта;
- background;
- product/colorway binding;
- text content и typography;
- автор объекта;
- optimistic locking/version;
- autosave status;
- undo/redo;
- комментарии с author/time;
- share permissions;
- brand/account scope;
- price type;
- archived state;
- derived order link;
- export to image/PDF;
- копирование и template mode.

## 42. Сообщения: все папки и действия

Маршруты:

- /messages — Inbox;
- /messages/invitation — Invitation;
- /messages/sent — Sent;
- /messages/trash — Trash;
- /messages/send — Compose;
- /messages/view/{messageId} — цепочка;
- /messages/actions/delete;
- /messages/actions/read;
- /messages/actions/unread;
- /messages/actions/inbox.

### 42.1 Общая структура

Во всех папках:

- навигация Inbox / Invitation / Sent / Trash;
- Search;
- Submit;
- checkbox всех;
- checkbox строки;
- таблица;
- сортировка по Message и Date;
- переход в thread по отправителю или subject.

Inbox/Invitation/Trash используют From; Sent использует To.

### 42.2 Invitation

Есть объяснение, что папка содержит сообщения, связанные с connection invitations.

Действия:

- Delete;
- Mark as Read;
- Mark as Unread.

### 42.3 Sent

Действия:

- Compose Mail;
- Mark as Read;
- Mark as Unread.

### 42.4 Trash

Действия:

- Compose Mail;
- Move to Inbox;
- Mark as Read;
- Mark as Unread.

### 42.5 Thread

Просмотр сообщения построен как хронологическая таблица:

- From / Date;
- Subject Line;
- ссылка на профиль участника;
- несколько сообщений в одной цепочке;
- subject;
- body с переносами строк;
- распознаваемые mailto-ссылки.

Connection request может порождать thread, а не отдельный несвязанный notification. Улучшенная архитектура должна хранить:

- thread;
- participants;
- message;
- folder membership для каждого пользователя;
- read_at;
- deleted_at;
- restored_at;
- connection_request_id;
- attachments;
- subject normalization;
- reply_to_message_id;
- delivery channel;
- email mirror status;
- spam/abuse state.

Важно: наблюдаемые actions оформлены как URL. В новой версии мутации нельзя выполнять GET-запросами; нужны POST/PATCH, CSRF-защита, подтверждение массового удаления и idempotency.

## 43. Публичная карточка неподключённого бренда

Маршрут /Accounts/view/{brandId} объединяет brand profile и storefront preview.

### 43.1 Верхний блок

- Brand Profile Logo;
- переход на брендовый storefront;
- Connect или Accept в зависимости от направления приглашения;
- объяснение ограничения доступа до соединения.

До принятия связи недоступны:

- полные linesheets;
- создание заказа;
- информация sales rep.

### 43.2 Контент профиля

Могут отображаться:

- embedded video;
- название;
- Year established;
- Categories;
- website;
- Facebook;
- Instagram;
- описание;
- product cards;
- color swatches;
- collection cards;
- gallery/press elements;
- документы lookbook/price list.

Документы могут быть прямыми PDF на CDN, организованными по account/brand и коллекции. Нужны:

- document title;
- type;
- season/year;
- audience;
- locale;
- currency/price type;
- uploaded_by;
- uploaded_at;
- version;
- file size;
- checksum;
- CDN/storage key;
- access policy;
- view/download audit;
- expiry/revocation.

Карточка способна показывать teaser продукта, но блокировать полный доступ сообщением «только для выбранных ритейлеров». Следовательно, доступ может зависеть не только от connection, но и от product-level или collection-level audience.

## 44. Публичный профиль ритейлера и его редактор

Маршрут просмотра/редактирования: /ra/profile/{retailerAccountId}.

### 44.1 Просмотр

Показываются:

- business name;
- verification state;
- Get Verified;
- объяснение ценности Tax ID;
- People;
- Administrator;
- Primary Location;
- Location Name;
- Type;
- Address со ссылкой Google Maps;
- Other Locations;
- Expand All Locations.

### 44.2 Режим Editing Your Profile

Главная команда:

- Save and View.

Logo Image:

- Upload;
- Browse Images;
- библиотека ранее загруженных изображений;
- максимум 10 MB.

Verification — Tax ID:

- Country;
- Tax ID;
- пример формата;
- отдельное состояние проверки.

Basic Info:

- Business Name отображается read-only;
- изменение business name отправляет пользователя в account settings;
- Description;
- Website;
- Instagram;
- X;
- Facebook.

Store Photos:

- до 30 файлов за один выбор;
- .jpg, .png, .gif;
- до 10 MB на изображение;
- назначение: интерьер и экстерьер магазинов;
- Upload;
- Browse Images.

People:

- управление идёт через /accounts/settings;
- у пользователя могут быть name, title, image;
- каждый пользователь сам включает или выключает показ на company profile;
- Go to user settings.

### 44.3 Location

Для Primary Location и каждой Other Location повторяется один и тот же состав:

- Location Name;
- Type;
- Year Established;
- Wholesale Price Range:
  - Minimum Price;
  - Maximum Price;
- Country, required;
- Address 1, required;
- Address 2;
- City, required;
- Territory;
- Zip;
- Phone;
- Categories;
- Brands Carried;
- Demographics;
- Delete для дополнительных локаций;
- Add another Location.

Categories:

- Accessories;
- Activewear/Yoga;
- Beauty;
- Bridal;
- Candles;
- Denim;
- Eco-friendly;
- Evening;
- Eyewear;
- Gifts;
- Handbags;
- Hats;
- Home;
- Hosiery;
- Jewelry;
- Kids;
- Lingerie;
- Luggage;
- Mens Bags;
- Mens RTW;
- Mens Shoe;
- Mens Underwear;
- Outdoor;
- Outerwear;
- Plus Size;
- Resort Wear;
- Special Occasion;
- Swimwear;
- Watches;
- Womens RTW;
- Womens Shoe.

Demographics:

- Gender:
  - Male;
  - Female;
- Age — multi/select dictionary;
- Described as, максимум 3:
  - Sophisticated;
  - Edgy;
  - Casual;
  - Feminine;
  - Downtown;
  - Active;
  - Classic;
  - Vintage;
  - Bohemian;
- Shops for, максимум 3:
  - Professional Looks;
  - Day to Night;
  - Cocktail and Events;
  - Casual Sportswear;
  - Resort/Beach/Swimwear;
  - Gifts.

Архитектурный вывод: категории, бренды, demographics и price range привязаны к Location, а не только к retailer account. Это позволяет разным магазинам одной сети иметь разные ассортиментные профили.

## 45. My Settings: все мини-редакторы и справочники

Маршрут /accounts/settings.

### 45.1 Manage My Account

Email:

- отображается текущий login email.

Password:

- masked;
- Reset password.

User Profile:

- Full Name;
- Job Title;
- Phone;
- Upload Photo;
- Display my information on my company profile;
- ссылка на company profile;
- X;
- Save Changes.

Languages:

- Set default language as;
- Send Emails In;
- варианты:
  - English;
  - Español;
  - Français;
  - Deutsch;
  - Italiano;
  - 日本語;
  - 中文(简体);
  - Русский;
  - 한국어;
- X;
- Save Changes.

Email Settings — отдельные Yes/No для:

- пересылки сообщений JOOR inbox на e-mail;
- e-mail о connection requests;
- еженедельных обновлений от connections;
- industry updates and news;
- заказов, назначенных пользователю на web;
- заказов, назначенных пользователю на iPad.

Default Connection Request Message:

- отдельный шаблон текста, используемый при запросе связи;
- должен храниться per user или per account с явным наследованием.

Date Format:

- mm/dd/yyyy;
- dd/mm/yyyy;
- yyyy/mm/dd.

Landing Page:

- Home;
- My Connections;
- Orders;
- Profile.

Round Retail Pricing:

- none;
- 1.00;
- 5.00.

Каждый редактор открывается inline и имеет X и Save Changes.

### 45.2 Retailer Account Information

Profile Name:

- редактируемое название аккаунта.

Account Email:

- отдельный business/account e-mail, не равен login email пользователя.

POS System:

- POS System;
- Version, if known.

Buyer Name:

- отдельное имя покупателя по умолчанию.

Connection Permission:

- Any brand or retailer can connect with me;
- Yes / No.

Privacy:

- Show in Search;
- Hide from Search.

Ключевое разделение данных:

- user.email — вход и персональные уведомления;
- account.email — общий контакт бизнеса;
- order buyer — снимок покупателя в заказе;
- profile people — публичность конкретного пользователя;
- account privacy — видимость аккаунта в поиске;
- connection permission — автоматическое или управляемое принятие связей.

## 46. Уточнённая карта связей сущностей

RetailerAccount
→ содержит Users
→ содержит Locations
→ имеет PublicProfile
→ имеет Settings
→ имеет Connections с BrandAccount
→ получает SharedLooks
→ создаёт Styleboards
→ создаёт Orders
→ имеет MessageThreads
→ запускает ImportJobs и ExportJobs
→ может иметь IntegrationConfig и Subscription.

BrandAccount
→ имеет PublicProfile/Storefront
→ публикует Linesheets
→ содержит Styles
→ Styles содержат Colorways
→ Colorways содержат SKUs/Sizes
→ публикует Looks
→ загружает Documents
→ назначает SalesReps
→ принимает/отклоняет Connections.

Order
→ принадлежит RetailerAccount и BrandAccount
→ содержит один PriceType
→ содержит один Currency
→ может ссылаться на несколько Linesheets
→ содержит OrderLines
→ OrderLine фиксирует Style snapshot
→ ColorLine фиксирует Colorway snapshot
→ SizeQuantity фиксирует SKU/size и quantity
→ имеет Shipping/Billing snapshots
→ имеет Contacts
→ имеет FinancialSummary
→ имеет StatusHistory
→ имеет Comments
→ имеет PaymentState
→ имеет IntegrationExportMarks.

Connection
→ связывает RetailerAccount и BrandAccount
→ имеет direction
→ имеет request message/thread
→ имеет pending/accepted/declined/cancelled state
→ управляет доступом к storefront, linesheets, rep info и ordering
→ может дополняться audience restrictions на уровне коллекции или продукта.

## 47. Полный жизненный цикл данных

### 47.1 Discovery → Connection

1. Ритейлер открывает discovery/passport/profile.
2. Система учитывает privacy и eligibility.
3. Пользователь просматривает teaser.
4. Отправляет Connect с default или изменённым сообщением.
5. Создаются ConnectionRequest и MessageThread.
6. Бренд принимает или отклоняет.
7. После accepted пересчитываются permissions.
8. Открываются linesheets, rep info и ordering.
9. Действие пишется в audit log и notification feed.

### 47.2 Look → Styleboard → Order

1. Бренд публикует Look.
2. Share связывает Look с retailer account.
3. Ритейлер выбирает hotspots/products.
4. Выбор переносится в Styleboard или прямо в Order.
5. Styleboard хранит визуальную композицию и price type.
6. Add to Order создаёт/дополняет draft.
7. Пользователь распределяет quantities по size.
8. Система валидирует minimums, delivery windows и inventory.
9. Draft сохраняется.
10. Заказ переходит Notes/Pending/Approved.
11. Approved блокирует изменение products и адресов в зависимости от политики.
12. Экспорт, оплата и shipment продолжают отдельные под-процессы.

### 47.3 Import

1. Template.
2. File upload.
3. Secure storage.
4. Parse.
5. Normalize.
6. Validate.
7. Resolve reference data.
8. Preview.
9. Confirm.
10. Background job.
11. Row-level report.
12. Create/update orders.
13. Audit and notification.
14. Retention or secure deletion source file.

### 47.4 Export/Document

1. Пользователь задаёт statuses.
2. Выбирает date type.
3. Указывает date range.
4. Выбирает integration type.
5. Определяет previously exported policy.
6. Сервер фиксирует immutable filter snapshot.
7. Background worker строит файл.
8. File record получает checksum, size и status.
9. Пользователь получает временную signed URL.
10. Download логируется.
11. Order export marks обновляются только после успешной генерации.
12. Ошибка не должна помечать заказ экспортированным.

## 48. Что улучшить в копии относительно наблюдаемого JOOR

### 48.1 Единообразие

- объединить legacy-таблицы и новый React-интерфейс общей дизайн-системой;
- одинаковые фильтры, пагинация и массовые действия;
- не использовать неочевидные icon-only buttons без aria-label;
- показывать явный autosave/save status;
- единый date/time/locale слой.

### 48.2 Безопасность

- любые мутации только POST/PATCH/DELETE;
- CSRF и idempotency;
- подтверждение Connect/Accept/Delete/Archive;
- RBAC на поле и секцию;
- immutable audit log;
- PII masking в экспортах;
- signed URLs для документов;
- malware scan загрузок;
- ограничение MIME и magic bytes;
- rate limiting сообщений и connection requests.

### 48.3 Производительность

- виртуализация длинных заказов;
- серверные агрегации totals;
- thumbnails и responsive images;
- lazy loading Look/Styleboard assets;
- background import/export;
- progress и retry;
- cursor pagination для activity/messages;
- кеширование справочников.

### 48.4 Надёжность UX

- не показывать бесконечный Loading без ошибки и retry;
- объяснять, почему autocomplete бренда не возвращает результаты;
- disabled controls должны иметь причину;
- перед выгрузкой показывать точную область и объём;
- сохранять фильтры в URL;
- поддерживать drafts форм;
- предупреждать о несохранённых изменениях;
- различать «нет данных», «нет прав», «ошибка загрузки» и «нет результатов».

## 49. Контроль покрытия второго прохода

Дополнительно подтверждены:

- вложенная карточка Approved заказа;
- Overview и Pay;
- Shipping/Billing;
- Products Summary до уровня size quantity;
- Contacts;
- Financial Summary;
- Order Details;
- Import Orders и оба шаблона;
- Download Order Confirmation;
- Export Data и типы дат;
- Looks CURRENT/ARCHIVED и viewer;
- Styleboards CURRENT/ARCHIVED и editor canvas;
- Invitation/Sent/Trash;
- thread;
- публичная карточка бренда до connection;
- audience-restricted products;
- PDF-документы на CDN;
- профиль ритейлера;
- полный редактор локации;
- категории и demographics;
- user settings;
- языки;
- notification toggles;
- date format;
- landing page;
- retail rounding;
- POS;
- connection permission;
- privacy.

Остаются недоступными без выполнения реальных бизнес-операций или дополнительных ролей:

- фактическое принятие/отклонение connection;
- создание и отправка нового заказа;
- редактирование quantities в Draft/Notes;
- шаги 2–3 импорта с реальным файлом;
- результат экспортного job;
- реальная платёжная форма JOOR Pay;
- администраторские настройки бренда;
- создание и сохранение нового Styleboard;
- загрузка и сохранение медиа;
- Shopify sync с активной интеграцией;
- shipment/fulfillment workflow со стороны бренда.

Эти области должны быть отдельными сценариями UAT на тестовом аккаунте с обезличенными данными.
