# JOOR Retailer Cabinet — нормализованная карта продукта, процессов, экранов и данных

Статус: reference-only, не является интеграцией или изменением реализации Syntha V2.  
Источник: read-only аудит production-интерфейса JOOR под авторизованной ролью Retailer / LITE, выполненный 4 августа 2026 года.  
Назначение: единая навигационная карта для проектирования улучшенного аналога кабинета.

> В документ сознательно не включены реальные адреса, сообщения, контакты и коммерческие значения конкретного аккаунта. Зафиксированы структура данных, поля, действия, состояния и связи. Закрытый brand-side back office, платный Visual Assortment, установленный Shopify, JOORPay и полный submit/approve/ship цикл требуют отдельного тестового доступа.
---

## 1. Как читать карту

### 1.1 Назначение и граница

Карта описывает наблюдаемую Retailer LITE часть JOOR, связанные target requirements и оставшиеся UAT gaps. Это функциональная спецификация для проектирования улучшенного аналога, а не утверждение о закрытой внутренней реализации JOOR.

Для каждого product area фиксируются:

1. entry route;
2. назначение и role;
3. page/container composition;
4. buttons/actions;
5. fields и order заполнения;
6. option dictionaries;
7. states, permissions и validation;
8. data read/write/upload/download/send;
9. entities и ownership;
10. переход к следующему шагу;
11. loading/empty/error/gated states;
12. end-to-end участие;
13. требования улучшенного аналога.

### 1.2 Evidence markers

| Marker | Значение |
|---|---|
| OBSERVED | Экран, поле, action или route непосредственно открыт |
| OBSERVED DISABLED | Элемент виден, но disabled |
| GATED | Доступ закрыт plan/role/connection/eligibility |
| NOT SUBMITTED / NOT EXECUTED | Точка действия открыта, final mutation не выполнена |
| INFERRED | Серверная сущность/правило выведены из поведения |
| TARGET | Нормативное требование улучшенной версии |
| BROKEN/AMBIGUOUS | UI не дал однозначного результата |
| UAT | Требуется controlled test data/access |

Сочетания допустимы: OBSERVED, CANCELLED означает modal открыт и закрыт Cancel без сохранения.

### 1.3 Уровни описания

- Product map — что доступно пользователю.
- Process map — что за чем следует.
- Data map — какие сущности и snapshots требуются.
- Permission map — кто и при каком state может действовать.
- E2E map — связи discovery → showroom → selection → order → fulfillment.
- Gap map — что gated, ambiguous или требует brand/test access.

### 1.4 Privacy and audit discipline

В карте не фиксируются реальные e-mail, телефоны, адреса, имена сотрудников, конкретные PO и коммерческие значения account. Сохраняются labels, типы полей, option values и обезличенная структура.

В ходе read-only аудита не подтверждались:

- Connect/Disconnect/Accept/Decline;
- new order submit/approval/shipment;
- message/comment/share send;
- import/export/download generation;
- Tax ID submission;
- Shopify install;
- Styleboard archive/delete;
- subscription payment.

Исключение: проверка `Duplicate Orders` немедленно создала cart copy без confirmation. Copy была открыта без редактирования, затем переведена через `Cancel Order` в Cancelled history; активная корзина снова пуста, исходный order и quantities не изменялись. Этот побочный audit-trail record явно разобран в разделах 15–16.
---

## 2. Общая архитектура кабинета


### 2.1 Граница текущего доступа

В active membership доступны только retailer accounts: один primary/active и тринадцать associated accounts. Brand-role среди переключаемых организаций нет.

Поэтому непосредственно подтверждены:

- buyer-side shell и account context;
- discovery/connections/submissions/Passport;
- public/connected storefront;
- published showroom и shared/restricted content;
- linesheets/styles/catalog;
- retailer orders/documents;
- Looks/Styleboards;
- profile/settings/integration/subscription entry points.

Brand Profile authoring, showroom builder, catalog publishing, seller order inbox и fulfillment описываются как INFERRED/TARGET либо UAT. Маркеры достоверности определены один раз в разделе 1.2.

### 2.2 Product shell

Постоянная верхняя панель содержит:

| Элемент | Что показывает | Действие |
|---|---|---|
| LITE | Текущий plan/entitlement | Информирует об уровне доступа |
| JOOR logo | Product identity | Переход на Dashboard |
| Shop | Buying entry | Dropdown: Start an Order, Linesheets, Looks, Styleboards |
| Orders & Visual Assortment | Order operations | Dropdown: Manage Orders, Visual Assortment |
| Explore Brands | Network/discovery | Connected Brands, Interested in You, Connection Requests — Received/Sent, Favorites, Find New Brands, Passport |
| Notification badge | Количество сетевых событий | Открывает Explore Brands |
| Get Shopify App | Интеграционный upsell | EXTERNAL: Shopify App Store |
| Active account | Организация и account ID | Account menu, settings и переключение account context |
| Messages badge | Непрочитанные/входящие | Inbox |
| Cart | Активные brand-specific drafts | Popover с Cart, empty/progress summary и View Cart |
| Help | Help Center/SSO | EXTERNAL |
| Logout | Завершение сессии | MUTATION: session termination |
| Support chat | Floating launcher | Support messenger |

Точные shell routes:

| Пункт | Route |
|---|---|
| Linesheets | `/collections/shop#dd=all` |
| Looks | `/ra/showroom/collections` |
| Styleboards | `/ra/showroom/styleboards` |
| Manage Orders | `/orders` |
| Visual Assortment | `/ra/visual-assortment` |
| Connected Brands | `/matches/current` |
| Interested in You | `/ra/submissions` |
| Requests Received | `/matches/requests` |
| Requests Sent | `/matches/pending` |
| Favorites | `/r/passport/favorites` |
| Find New Brands | `/ra/find_new_brands` |
| Passport | `/r/passport` |
| Messages | `/messages` |
| Cart | `/orders/cart` |

При пустой корзине popover показывает `You currently do not have any orders in progress` и всё равно предоставляет `View Cart`; прямой route затем перенаправляет на Dashboard. Поведение заполненной корзины описано только в разделе 15.

### 2.3 Единая IA улучшенной версии

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
│   ├── Brand Showrooms
│   ├── Linesheets
│   ├── Product Catalog
│   ├── Cart / Draft Orders
│   ├── Orders
│   ├── Looks / Collections
│   ├── Styleboards
│   └── Visual Assortment
├── Inbox
├── Integrations
└── Account
    ├── User Settings
    ├── Company Profile
    ├── Locations & People
    ├── Visibility
    ├── Subscription
    └── Account Switcher
~~~

В brand-role тот же shell должен переключаться на Seller workspace: Brand Profile, Showroom Builder, Catalog/Linesheets, Connections, Order Inbox, Commercial Settings, Documents, Analytics и Team/Permissions. Role navigation и activeAccountId обязаны рассчитываться сервером.

### 2.4 Роли и ответственность

#### Retailer / Buyer — OBSERVED

- ведёт company profile, people и locations;
- управляет обнаружимостью каждого связанного retailer account;
- ищет, фильтрует, сохраняет и подключает бренды;
- получает submissions, requests, Looks и документы;
- просматривает profile/storefront/showroom и linesheets;
- выбирает style → colorway → size/SKU → quantity;
- создаёт Notes/Draft, редактирует разрешённые блоки, отправляет на approval;
- работает с orders, messages, import/export, integration и premium tools;
- переключается между несколькими account contexts.

#### Brand / Seller — INFERRED / TARGET

- ведёт brand identity, profile, team и commercial contacts;
- собирает и публикует versioned showroom;
- публикует linesheets, styles, colorways, SKUs, цены и delivery windows;
- назначает audience, connection, territory, retailer group и product-level access;
- предоставляет billing codes, payment/shipping methods и Terms & Conditions;
- принимает connection requests и обрабатывает orders;
- создаёт Looks, documents и submissions;
- анализирует showroom → product → draft → order conversion.

#### Account administrator — OBSERVED / INFERRED

- управляет memberships и display consent;
- определяет primary account;
- управляет profile, privacy и discoverability;
- контролирует integrations, subscriptions и permissions;
- обязан предотвращать перенос данных между account contexts.

#### Premium user — GATED

- получает Visual Assortment и дополнительные лимиты;
- entitlement может ограничивать users, doors, products, features и retention.

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
| Cart | /orders/cart | Cart Orders | OBSERVED populated workspace; empty route redirects to Dashboard |
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

### 3.1 Вложенные и служебные маршруты

| Область | Route | Назначение | Статус |
|---|---|---|---|
| Linesheet detail | /Collections/view/{linesheetId} | Товары linesheet | OBSERVED |
| Linesheet page AJAX | /collections/view_ajax/{linesheetId}/page:{n}/... | Следующая страница styles | OBSERVED |
| Linesheet print | /collections/print_select/{linesheetId} | Конструктор печати | OBSERVED |
| Style detail | /Styles/view/{styleId}/{linesheetId} | Карточка style | OBSERVED |
| Style navigation | /Styles/view/{styleId}/{linesheetId}/{priceTypeId}?fp=... | Карточка с контекстом price type | OBSERVED |
| All styles | /Collections/view?brandId={brandId}#s={styleId} | Все styles бренда | OBSERVED |
| Look detail | /ra/showroom/collections/{encodedCollectionId} | Просмотр Look | OBSERVED |
| Styleboard create | /ra/showroom/styleboards/add | Brand association/create entry | OBSERVED, CANCELLED |
| Styleboard detail | /ra/showroom/styleboards/{encodedStyleboardId} | Canvas | OBSERVED |
| Retailer profile edit | /ra/profile/{accountId}?edit | Deep link в edit mode | OBSERVED |
| Subscription cancel return | /ra/subscriptions?cancel=true&featureId={id} | Возврат из Stripe без оплаты | OBSERVED |
| Alternate storefront | /r/storefront/{brandId} | Alias из рекламных баннеров | OBSERVED |
| Accept connection | /Matches/accept/{matchId} | Принятие входящего запроса | OBSERVED, NOT EXECUTED |
| Decline connection | /Matches/decline/{matchId} | Отложить/отклонить запрос | OBSERVED, NOT EXECUTED |
| Remove connection | /Matches/delete_by_account/{brandId}/1/{state} | Удалить Connected/Pending | OBSERVED, NOT EXECUTED |
| Message thread | /messages/view/{messageId} | Цепочка сообщений | OBSERVED |
| User photo | /accounts/update_photo | Загрузка фото пользователя | OBSERVED route |
| Document CDN | /accounts/{brandId}/{file}.pdf | Lookbook/price PDF | OBSERVED external asset |

Legacy routes чувствительны к регистру: /Accounts, /Collections, /Styles, /Messages, /Matches. В улучшенной версии API и UI routes должны быть унифицированы.

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
### 4.4 Уточнённая структура карточек и переходов

Connected Brands:

- Search connected brands;
- бренд, категории и ссылка на storefront;
- View Orders открывает /orders?brandName={brandName};
- Shop является JavaScript-действием без href;
- на проверенном storefront SHOP открыл /ra/products и модальное окно Start an Order;
- бренд в модальном окне автоматически не подставился — состояние следует считать BROKEN/AMBIGUOUS;
- See All ведёт в /matches/current.

Connection Requests:

- карточка содержит бренд и категории;
- See All на Dashboard ведёт в /matches/pending, хотя отдельный пункт входящих запросов использует /matches/requests;
- это расхождение маршрутов необходимо исправить в аналоге.

New to JOOR:

- локальный фильтр All и строка поиска;
- бренд и категории;
- See All также ведёт в /matches/pending, что семантически не соответствует discovery;
- рекламные banner links встречаются в двух формах: /ra/storefront/{id} и /r/storefront/{id};
- UTM-параметры: utm_source, utm_content, utm_campaign.

Системные счётчики в shell:

- число Explore/connection items;
- unread Messages;
- Cart preview/count;
- entitlement label LITE;
- активный retailer account.


## 5. Discovery: Find New Brands

Route: /ra/find_new_brands.

### 5.1 Назначение и порядок работы — OBSERVED

1. Открыть Explore Brands → Find New Brands.
2. Получить All Brands grid.
3. При необходимости изменить Sort by.
4. Открыть Show Search and Filters.
5. Заполнить один или несколько фильтров.
6. Проверить счётчик N filters applied.
7. Нажать Apply.
8. Просмотреть brand cards.
9. Открыть storefront.
10. Добавить favorite или request connection.
11. После исходящего запроса увидеть Requested.

### 5.2 Page composition — OBSERVED

- page title Find New Brands;
- section title All Brands;
- Show Search and Filters — раскрывает и скрывает панель;
- Sort by;
- applied-filter count;
- filter drawer;
- lazy-loaded brand grid;
- Loading state;
- support messenger.

Начальное наблюдаемое состояние:

- 0 filters applied;
- Clear All disabled;
- Apply disabled;
- default sort = Newest Linesheets.

### 5.3 Sort by — OBSERVED

Полный список:

1. Newest Linesheets;
2. A - Z;
3. Most Purchased;
4. New to JOOR.

Сортировка должна передаваться в URL/query state, быть стабильной при pagination/lazy loading и иметь серверное определение tie-break.

### 5.4 Search and Filters — OBSERVED

| Блок | Control | Семантика |
|---|---|---|
| Brand | Search brand by name | Полнотекстовый поиск имени |
| Wholesale Price Range | Currency autocomplete | Контекст валюты |
| Wholesale Price Range | Minimum text input | Нижняя граница |
| Wholesale Price Range | Maximum text input | Верхняя граница |
| JOORPay | hasJoorpay checkbox, label Yes | Только бренды с оплатой на платформе |
| Categories | Search categories | Локальный поиск справочника |
| Categories | multi-checkbox | Фильтр по одной или нескольким категориям |

Currency не показывает preload-options до ввода запроса; это remote autocomplete, а не статический select. Minimum и Maximum — свободные поля, а не preset menus.

Панель также содержит ссылку Select your categories на /ra/profile/{accountId}?edit и поясняет, что профильные категории используются для персонализации discovery.

Buttons:

- Clear All — disabled без применённых/введённых фильтров;
- Apply — disabled без изменения;
- Show Search and Filters — toggle.


### 5.5 Category dictionary — OBSERVED

Discovery использует canonical Global Category Dictionary из раздела 29.1. На экране есть Search categories и checkbox для каждого значения; профильная персонализация использует тот же справочник.

### 5.6 Brand card and relationship state — OBSERVED

Карточка реализована как button и содержит:

- image/logo;
- brand name;
- category list, которая может быть пустой;
- relationship label, например Requested.

Действия и переходы:

- открыть storefront;
- favorite;
- request connection;
- Requested после исходящего запроса;
- после connection — shop/message/orders согласно grants.

### 5.7 State model

- default results;
- Loading;
- filters applied N;
- no results;
- Requested;
- Connected;
- hidden/private brand;
- access/network error.

DiscoveryQuery хранит search, currency, min/max, JOORPay flag, categories, sort, account context, cursor и source. Recommendation/exposure events должны отделяться от явного search click.
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

Page blocks and exact controls:

- Search by Name or ID + Submit;
- Advanced Search;
- collapsible Wholesale Price Range: Minimum and Maximum selectors + Submit;
- collapsible Categories: checkbox dictionary из раздела 29.1;
- Clear Filters;
- Search;
- Manage Connections;
- Showing X–Y of Z results;
- view size — значения из раздела 29.6;
- brand list.

В наблюдаемом состоянии на одной странице показаны все 40 connected brands. Card/actions:

- brand name/profile → `/designers/view/{brandId}`;
- Connected label;
- icon-only message → `/Messages/send/{brandId}`;
- icon-only `×` disconnect → `/Matches/delete_by_account/{brandId}/1/CONNECTED-BRAND`.

Операция disconnect выглядит как обычная ссылка и не объясняет последствия. В улучшенной версии нужны именованный control, confirmation, reason, audit и сохранение historical orders/messages.

Data:

- retailerAccountId;
- brandAccountId;
- connection status;
- created/accepted timestamps;
- permissions/access;
- last interaction.

### 6.3 Incoming Requests

Route: /matches/requests

Route не повторяет Advanced Search: это отдельный request inbox. Наблюдаемый badge `24` совпал с количеством cards. Card:

- brand image/link → `/Accounts/view/{brandId}`;
- brand name;
- View Profile → `/Accounts/view/{brandId}`;
- request date;
- Connect → `/Matches/accept/{matchId}`;
- Not Now → `/Matches/decline/{matchId}`.

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

Controls совпадают с Connected Brands: Name/ID, price range, categories, Clear Filters и Search. В наблюдаемом состоянии: Showing 1–1 of 1 results.

Card:

- brand profile;
- Pending status;
- cancel/remove `×` → `/Matches/delete_by_account/{brandId}/1/PENDING`.

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

Wholesale thresholds перечислены один раз в разделе 29.4, categories — в разделе 29.1. Все перечисленные legacy mutation URLs являются требованиями на замену безопасными POST/PATCH/DELETE-командами.


## 7. Brand Submissions

Route: /ra/submissions?tab=new.

### 7.1 Назначение — OBSERVED

Экран называется Brands Interested In You и объясняет: бренды могут обнаружить retailer profile и отправить персонализированный visual outreach. Это отдельный канал discovery, а не connection request и не обычное inbox message.

### 7.2 Tabs and exact empty states — OBSERVED

Tabs реализованы кнопками:

- New;
- Viewed;
- All.

New при отсутствии данных:

- You're all caught up;
- No new brands have reached out to you yet;
- Explore new brands to connect with;
- Find New Brands.

Viewed при отсутствии данных:

- You haven't viewed anything yet;
- When you view outreach from brands, it will appear here.

All в проверенном пустом аккаунте повторяет состояние New, включая формулировку No new brands; это семантически слабее отдельного All-empty state.

### 7.3 Populated submission card — UAT

В текущем account нет New, Viewed или All records, поэтому точный card/detail payload не подтверждён. Для улучшенной версии требуется:

- submissionId;
- brandAccountId;
- retailerAccountId;
- title/message;
- cover media;
- attached styles, linesheets или Look;
- createdAt;
- viewedAt;
- status NEW/VIEWED/ARCHIVED;
- CTA target;
- relationship/connection state;
- presentation version;
- access result.

### 7.4 End-to-end flow

1. brand создаёт outreach и выбирает retailer/audience;
2. server проверяет право на discovery/contact;
3. submission snapshot и attachments сохраняются;
4. notification count увеличивается;
5. retailer видит запись в New;
6. первое открытие атомарно ставит viewedAt и переносит в Viewed;
7. retailer открывает storefront/linesheet/look;
8. retailer connects, favorites, messages, starts order или ignores;
9. All сохраняет доступную историю;
10. archive/expiration не удаляет engagement trail.

Empty CTA ведёт в Find New Brands; populated CTA должен передавать source=submission для attribution.
---


## 8. Favorites

Route: /r/passport/favorites.

### 8.1 Проверенное пустое состояние — OBSERVED

После завершения delayed loading страница содержит только:

- label FAVORITES;
- общий footer;
- Help Center;
- Careers;
- Case Studies;
- social links;
- Privacy Policy.

Нет:

- объяснения назначения;
- карточек;
- фильтров;
- кнопки возврата в discovery;
- empty illustration;
- CTA Explore Brands.

Это диагностический UX-gap, а не подтверждение отсутствия функции favorite в storefront.

### 8.2 Требуемое populated state — TARGET

- favorite brand cards;
- source: discovery/passport/storefront;
- date added;
- private notes;
- custom tags/lists;
- category/price/event filters;
- remove;
- compare;
- connect;
- message;
- shop;
- empty CTA Explore Brands.

### 8.3 Persistence

Favorite должен быть account-level, потому что ассортимент и связи принадлежат retailer organization; private user notes могут быть user-scoped. Хранить favoriteId, accountId, brandId, source, eventId, addedBy/At, note visibility, tags и removedAt. Повторный favorite — idempotent.
---


## 9. Passport Events

### 9.1 Passport landing — OBSERVED

Route: /r/passport.

После delayed loading экран содержит:

- rotating editorial stories;
- Passport logo и value proposition;
- Learn More;
- Featured Events;
- Shop Passport Marketplaces;
- Browse Retail Shows;
- Brand Registration;
- Retailer Registration;
- Our Partners;
- общий footer.

Наблюдаемые текущие story/event labels являются динамическим контентом. В проходе 4 августа 2026 года присутствовали, среди прочих:

- Making Waves: Swim & Resort 2027;
- En Vogue: Top French Fashion Retailers;
- On Trend: Women's Fall 2026;
- JOOR Showcase;
- Destination Italy;
- The Accessory Collective;
- New To JOOR;
- Step Into Style;
- JOOR 100;
- Explore Italy;
- In The Bag.

Registration actions:

- Register to Exhibit;
- Register to Attend.

Они являются внешними side effects и в аудите не отправлялись.

### 9.2 Event detail — OBSERVED

Проверенный маршрут: /r/passport/making-waves-swim-and-resort-2027.

Composition:

1. event hero image;
2. title;
3. editorial description;
4. Style Stories;
5. category story shortcuts: Swimwear, Apparel, Footwear, Accessories;
6. FILTER;
7. Category dropdown;
8. Min Price dropdown;
9. Max Price dropdown;
10. Search textbox;
11. results count;
12. participating brand grid;
13. links в /ra/storefront/{brandId};
14. footer.

В проверенном состоянии показано 111 Results. Число и набор участников являются динамическими.


### 9.3 Event Category dictionary — OBSERVED

Проверенный event использует Passport Event Category Dictionary из раздела 29.2. Он отличается от глобального: Beauty и Watches в нём отсутствовали.


### 9.4 Price filters — OBSERVED

Min/Max thresholds перечислены в разделе 29.4. Система должна валидировать min ≤ max и сохранять currency context; event UI показывает долларовые thresholds без отдельного currency selector.

### 9.5 End-to-end Passport flow

1. открыть Passport;
2. выбрать editorial story/event/marketplace;
3. открыть event detail;
4. выбрать Style Story или filters;
5. при необходимости задать category и price interval;
6. искать brand;
7. открыть storefront;
8. favorite/connect/message/shop;
9. сохранить event/source attribution;
10. отдельно зарегистрироваться как exhibitor/attendee, если требуется.

### 9.6 Event data

- eventId/slug;
- title and editorial description;
- cover/hero;
- start/end/published/active state;
- stories and ordering;
- category dictionary override;
- price thresholds/currency;
- participating brands;
- registration configuration;
- sponsor/partner assets;
- result ordering;
- impression/click/open/connect/order attribution.
---

## 10. Кабинет бренда, Storefront, Showroom и презентация

### 10.1 Назначение и граница

Этот раздел описывает единый домен представления бренда:

1. Brand Profile — структурированная карточка компании.
2. Storefront — постоянная брендовая витрина и вход в покупки.
3. Showroom / Presentation — редакционная история бренда из секций, товаров, коллекций, media и документов.
4. Seller workspace — INFERRED / TARGET, необходимый для создания наблюдаемого buyer-side результата.

Поля заказа, товарная матрица и approval здесь не дублируются: они описаны в разделах 13–16.

### 10.2 Buyer-side состояния доступа

| Состояние | Что видит retailer | Что недоступно |
|---|---|---|
| Public / disconnected | logo, teaser, описание, категории, social, часть media/products/documents, Connect/Accept | полные linesheets, ordering, sales rep и закрытые товары |
| Incoming request | профиль бренда и Accept/Connect CTA | покупка до принятия, если connection required |
| Pending outbound | профиль и состояние запроса | закрытые торговые данные |
| Connected | storefront, team, разрешённые linesheets, price types, Shop, Message, View Orders | материалы вне audience |
| Connected but audience-restricted | общая витрина и разрешённые блоки | конкретный product/collection/document |
| Access revoked/expired | исторические заказы и snapshots | новые выборки из отозванного linesheet |
| Archived/unpublished | fallback/ограничение или отсутствие presentation | новые просмотры и вход в покупку согласно политике |

Connection — необходимое, но не всегда достаточное условие. Effective access может дополнительно зависеть от retailer account, location/door, territory, retailer group, price type, season, collection, product, document, даты публикации и entitlement.

### 10.3 Структура публичной карточки бренда

Маршрут вида /Accounts/view/{brandId} совмещает профиль и preview витрины.

Верхний контейнер:

- Brand Profile Logo;
- brand name;
- переход в storefront;
- Connect или Accept;
- favorite при доступности;
- пояснение ограничения до connection;
- status/CTA, зависящие от направления запроса.

Информационные контейнеры:

- embedded video;
- Year Established;
- Categories;
- Website;
- Facebook;
- Instagram и другие social links;
- long description / brand story;
- wholesale и retail price range, если опубликованы;
- market/category positioning.

Коммерческие teaser-контейнеры:

- product cards;
- product image, name/code и color swatches;
- collection/linesheet cards;
- gallery, campaign или press tiles;
- документы lookbook, price list и presentation PDF;
- restricted-state message для выбранных retailers.

### 10.4 Структура connected Storefront

Постоянная витрина может содержать:

1. logo/hero;
2. page title и overlay title;
3. brand name;
4. Shop;
5. favorite;
6. Message;
7. View Orders;
8. description;
9. year established;
10. categories;
11. wholesale/retail price range и currency;
12. website/social links;
13. Meet the Team;
14. team card: photo, name, role, e-mail и contact action;
15. custom editorial sections;
16. documents с View Document;
17. product/collection modules;
18. access/error/empty states.

Shop должен сохранять brand context. Наблюдался пограничный дефект: переход в общий Start an Order способен потерять предвыбранный brand. В улучшенной версии brandId, accountId, connectionId и допустимые priceTypeIds передаются как подписанный server-resolved context, а не как ненадёжная локальная память UI.

### 10.5 Showroom / Presentation: контейнерная модель

Для улучшенной копии презентация должна быть page composition, а не одним rich-text полем.

| Тип секции | Наполнение | Действия retailer | События аналитики |
|---|---|---|---|
| Hero | desktop/mobile media, title, subtitle, overlay, CTA | открыть CTA | impression, CTA click |
| Video | poster, provider/file, caption, duration | play/pause/complete | play, progress, complete |
| Rich text | heading, body, quote, links | открыть link | view, link click |
| Image/gallery | media, alt, caption, order | zoom/carousel | view, zoom, slide |
| Product grid | selected styles/colorways, badges, prices | open style, select, add | product view/select |
| Collection/linesheet | cover, season, delivery, description | open linesheet | linesheet open |
| Look/hotspot | composite media и product anchors | open hotspot/style | hotspot click |
| Document | title, type, season, version, file | view/download | document view/download |
| Team/contact | person, role, market, email | message/contact | contact intent |
| CTA | label, target, access rule | Shop/Connect/Message | conversion click |
| Spacer/divider | layout metadata | — | — |

Общие поля каждой секции: sectionId, pageId, type, title, internal label, order, visibility, audience, publish dates, locale, device behavior, background/theme, analytics key, created/updated/published metadata.

### 10.6 Наблюдаемые композиции Showroom

#### Опубликованная редакционная презентация

Подтверждён полноценный disconnected/public showroom следующей структуры:

1. Brand Profile Logo и page title;
2. Connect CTA с объяснением ограничений;
3. Year established, price ranges, website и social links;
4. длинный brand description;
5. initial Gallery Element;
6. embedded video player;
7. тематическая глава:
   - collection title;
   - collection type/subtitle;
   - editorial story;
   - несколько абзацев rich text;
   - повторный collection label;
   - gallery из четырёх изображений;
   - linesheet label;
   - Card Cover;
   - Preview Linesheet CTA;
8. следующие главы повторяют video → story → gallery → linesheet card.

В одном опубликованном showroom подтверждены 21 image element, семь iframe, три Preview Linesheet button, три linesheet overlays и три большие collection-story главы. Видео реализованы как embedded iframe players с Play/Pause, progress, time, mute/volume, settings и speed; один provider также показывает Like/Share. Эти provider controls принадлежат embed, а не собственному workflow платформы.

Disconnected retailer может просматривать storytelling, но Preview Linesheet/ordering подчиняются connection и audience. Нажатие Connect является отдельной mutation и не должно автоматически запускать order.

#### Placeholder / incomplete connected presentation

Подтверждён connected storefront, где buyer-side показывает:

- Untitled Page;
- Overlay Text;
- несколько Section Title;
- Click to edit placeholders;
- Linesheet Title;
- Document Title;
- View Document;
- пустые/нулевые price ranges;
- overlays о том, что linesheet доступен только selected retailers.

Это важный факт: connected relationship не отменяет linesheet-level audience, а publish pipeline способен пропустить authoring placeholders. Улучшенная версия должна иметь content completeness score, preview-as-buyer и hard validation перед publish.

#### Presentation state matrix

| Page state | Section state | Buyer result |
|---|---|---|
| Draft | любой | виден только brand editors |
| Published | complete + allowed | полноценный widget и CTA |
| Published | placeholder | должно быть blocked validation, не buyer output |
| Published | resource restricted | cover/teaser + restriction overlay |
| Published | deleted/unavailable binding | controlled unavailable state |
| Scheduled | before publish_from | hidden/preview only |
| Expired/unpublished | after publish_to | removed with stable fallback/deep-link response |

### 10.7 Навигация презентации

Presentation может состоять из нескольких страниц/глав. Нужны:

- page registry и navigation order;
- cover/thumbnail;
- page title и optional overlay;
- next/previous;
- anchor navigation;
- responsive desktop/tablet/mobile;
- deep link на страницу/секцию;
- fallback для удалённого товара или документа;
- сохранение scroll/page state при возврате из Style;
- access check при каждом deep link, а не только на landing page.

### 10.8 Документы бренда

Document record должен включать:

- title и internal name;
- document type;
- season/year;
- locale;
- currency/price type;
- retailer audience;
- connection/territory/group restrictions;
- version и replaced_by;
- original filename, MIME, size, checksum;
- storage/CDN key;
- uploaded_by/at;
- publish_from/to;
- revoked/expired state;
- preview availability;
- view/download audit;
- retention and signed-link policy.

Исторический заказ может ссылаться на versioned document/terms snapshot, даже если текущий storefront-файл заменён.

### 10.9 Seller workspace — INFERRED / TARGET

Чтобы породить наблюдаемый buyer-side опыт, brand cabinet должен иметь следующие рабочие зоны.

#### Brand Profile editor

- legal/display name;
- logo и brand imagery;
- description/story;
- year established;
- categories;
- market/price positioning;
- website/social;
- team members и contact routing;
- preview as public/disconnected/connected retailer.

#### Showroom Builder

- page tree;
- add/duplicate/delete/reorder page;
- add/reorder/duplicate/delete section;
- media picker/upload;
- product/linesheet/look/document binding;
- desktop/mobile preview;
- draft, scheduled, published, unpublished и archived states;
- audience assignment;
- validation report;
- version history;
- publish confirmation;
- rollback/restore.

#### Catalog and Linesheet Manager

- seasons, collections, delivery windows;
- style, colorway, SKU/size;
- images and media;
- wholesale/RRP by price type/currency;
- tags, badges, categories, fabrication, division, silhouette;
- inventory/ATS and ordering constraints;
- shared/unshared state;
- audience and expiry;
- import/export jobs.

#### Connections and Access

- retailer/accounts/groups/territories;
- incoming/outgoing request lifecycle;
- assign sales rep;
- grant/revoke linesheet/product/document;
- price type and payment method assignment;
- effective access preview;
- audit of who granted/revoked what and when.

#### Order Inbox

- Notes, Pending, Approved, Shipped, Cancelled;
- open order aggregate and comments;
- validate or adjust permitted fields;
- approve/reject/request revision;
- confirmation/invoice/shipment documents;
- export/integration marks;
- fulfillment and payment states;
- immutable submission snapshot and audit.

#### Commercial Settings

- price types and currencies;
- product/order discounts;
- shipping methods and fees;
- billing codes;
- payment methods and terms;
- order minimums, SKU increments and delivery rules;
- Terms & Conditions versions.

#### Analytics

- profile/showroom visitors;
- page/section impressions;
- video engagement;
- document views/downloads;
- linesheet/style opens;
- product selection and quantity entry;
- draft creation;
- submit/approve conversion;
- conversion by retailer, account, location, territory, campaign, showroom version and price type.

### 10.10 Publishing validation

Publish должен блокироваться или требовать явного override при:

- Untitled Page или placeholder overlay;
- missing required hero/title;
- invalid responsive media;
- отсутствующем alt;
- broken internal/external link;
- invalid price range или currency;
- malformed website/social/contact;
- missing/deleted product, linesheet, look или document binding;
- contradictory audience rules;
- publish_end раньше publish_start;
- presentation без доступного CTA/next step;
- document checksum/storage failure;
- draft с несохранёнными изменениями.

### 10.11 Storefront → Catalog handoff

1. retailer нажимает Shop внутри конкретного brand context;
2. система проверяет active retailer account и connection;
3. рассчитывает effective audience/access;
4. получает допустимые price types, linesheets и delivery windows;
5. один price type preselect; несколько требуют выбора;
6. система предлагает resume compatible draft или create new;
7. draft создаётся только после явного Start an Order;
8. Catalog открывается scoped к brand/price type;
9. sticky header показывает active order context;
10. back navigation возвращает в исходную showroom page/section.

## 11. Linesheets: registry, detail, Print и Excel Order

Linesheets — самостоятельный legacy buying surface, отличный от нового Product Catalog. Он использует routes с разным регистром, hash-state, отдельные POST filters и AJAX pagination.

### 11.1 Registry

Route: /collections/shop#dd=all.

Основная структура:

1. рекламный/passport banner;
2. heading Linesheets;
3. filter sidebar;
4. Clear Filters и Search;
5. sort links Brand Name / Delivery Date;
6. result cards;
7. loading, empty и pagination states;
8. footer/legal/support.

### 11.2 Brand filter

- native select;
- список connected/accessible brands;
- archived marker внутри option;
- отдельный Submit;
- selected brand отражается в hash вида b={brandId};
- смена brand перезапрашивает cards.

В наблюдаемой membership selector содержал более пятидесяти brand options, включая archived. Это не означает одинаковый ordering access: registry visibility, connection и конкретный linesheet audience могут различаться.

### 11.3 Delivery Date filter

Radio options:

- All Available;
- Immediates;
- Select Date Range.

Date range:

- From textbox;
- Start Date picker link;
- To textbox;
- End Date picker link;
- Submit.

Нужны locale/timezone rules, inclusive boundaries, validation From ≤ To и различение linesheet availability от shipping delivery window.

### 11.4 Category filter

Наблюдаемые top-level values:

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

В разных состояниях дерево может раскрывать Apparel, Denim, Shoes, Handbags, Accessories, Hosiery, Intimates, Swimwear, Outerwear, Activewear, Gifts, Jewelry, Sunglasses, Goodies, Bridal, Golf, Tennis и Raw Materials.

Category filter имеет собственный Submit; выбранные категории должны быть видны как applied filters.

### 11.5 Search and sorting

- Search textbox/trigger;
- Clear Filters;
- sort by Brand Name;
- sort by Delivery Date;
- loading;
- No linesheets found.

Empty state должен различать:

- no connection;
- no shared linesheets;
- selected brand has no current linesheets;
- outside availability/delivery range;
- category/date filters exclude results;
- brand/account archived;
- missing price type;
- audience/territory restriction;
- API/loading error.

### 11.6 Linesheet registry card

Непосредственно наблюдались:

- brand name;
- linesheet name;
- delivery start/end;
- card link /collections/view/{linesheetId};
- ordered list of many seasons/drops.

Целевая карточка дополнительно должна показывать cover, season/year, category/division, style count, price types/currency, availability, new/updated badge, archived/restricted marker и reason tooltip.

### 11.7 Linesheet detail

Route: /collections/view/{linesheetId}?brandId={brandId}#pt={priceTypeId}.

#### Left sidebar

- Brand;
- brand profile link;
- Send Message;
- Minimum Amount;
- Search + Submit;
- Category + Submit;
- Clear Filters;
- All Linesheets in This Brand;
- current linesheet disabled/selected;
- navigation to sibling linesheets.

Minimum Amount является commercial validation для будущего заказа и должен сохраняться с currency, scope и effective dates.

#### Header

- full linesheet name и audience/division marker;
- Print;
- Start Excel Order;
- Delivery Window;
- Price Type selector;
- Submit/apply price type.

Наблюдался выбор между несколькими price types одной валюты и сезона. URL/hash сохраняет выбранный priceTypeId.

#### View and pagination

- View 15;
- View 30;
- View All (total);
- current page;
- numbered pages;
- Next;
- AJAX route следующей страницы;
- stable style order.

Totals и filtering должны рассчитываться сервером; View All не должен блокировать страницу большим количеством изображений.

### 11.8 GROUP BY dictionary

Подтверждены:

- LINESHEET;
- FABRICATION;
- CATEGORY;
- DIVISION;
- SILHOUETTE;
- LINESHEET GROUP;
- MODEL CODE;
- COLLECTION;
- SEASON;
- PATTERN;
- CONTENT;
- FABRIC WEIGHT;
- NECK SHAPE;
- SLEEVE LENGTH.

В selector присутствует disabled divider между базовыми и custom product attributes. Для улучшенной версии это один metadata-driven dictionary с type, order, applicability и localization.

### 11.9 Style card inside Linesheet

Непосредственно отображаются:

- primary image/style link;
- number of available images;
- Style Number;
- Style Name;
- color display name и color code;
- Wholesale price;
- Retail/Suggested Retail price;
- currency;
- link в Style detail.

Card может представлять один colorway как отдельную строку/карточку. Поэтому unique style count и displayed card count не всегда совпадают.

### 11.10 Print constructor — OBSERVED

Route: /collections/print_select/{linesheetId}.

Layouts:

- 8 Styles, selected by default;
- 12 Styles;
- 4 Styles (A);
- 4 Styles (B);
- 2 Styles;
- Landscape (8);
- Landscape (4);
- By Fabrication.

Currency and prices:

- Price Type/Currency select;
- Retail Price, checked by default;
- Wholesale Price, checked by default.

Image Resolution:

- Normal (recommended), selected;
- High.

Custom Fields:

- ровно три independent selectors;
- select up to 3;
- empty option;
- Fabrication;
- Silhouette;
- Materials;
- Heel Height;
- Measurements;
- SLEEVE LENGTH;
- NECK SHAPE;
- FABRIC WEIGHT;
- CONTENT;
- PATTERN;
- SEASON;
- COLLECTION;
- MODEL CODE.

Group By:

- empty;
- Linesheet groups;
- Fabrication;
- Category;
- Division;
- Silhouette;
- SLEEVE LENGTH;
- NECK SHAPE;
- FABRIC WEIGHT;
- CONTENT;
- PATTERN;
- SEASON;
- COLLECTION;
- MODEL CODE.

Additional options:

- Page Break by Group;
- Overflow Colors;
- Include Tag Name when grouped by tags;
- Print;
- Close.

Print является document-generation command. Job фиксирует linesheet/version, order of styles, layout, price type, price visibility, image resolution, three custom fields, grouping, page breaks, overflow/tag options, actor, timestamp, artifact checksum/size и expiry.

### 11.11 Start Excel Order — OBSERVED

Modal открывается поверх Linesheet и содержит:

- Close;
- heading Start Excel Order;
- Add units and import directly to the Cart;
- Linesheets;
- текущий linesheet как selected item;
- remove link/icon у selected item;
- search textbox;
- список sibling linesheets того же brand;
- Price Type selector;
- Include Images checkbox, unchecked в наблюдаемом состоянии;
- Export.

Последовательность:

1. текущий linesheet preselected;
2. при необходимости выбрать дополнительные sibling linesheets;
3. удалить ошибочно выбранный linesheet;
4. выбрать price type;
5. решить, включать ли images;
6. Export сформирует Excel matrix;
7. пользователь заполняет units offline;
8. импортирует файл в Cart;
9. система сопоставляет immutable IDs/style codes/color/size;
10. показывает row-level validation;
11. создаёт или обновляет соответствующий Note/Draft.

Export не был выполнен. Template должен содержать templateVersion, linesheet/version IDs, priceTypeId, currency, style/color/SKU IDs, human-readable codes, size scale/order, protected columns и checksum. Импорт изменённого/устаревшего template обязан выявлять catalog/access drift.

## 12. Style, Colorway, Variant и SKU

### 12.1 Роль Style detail

Route: /Styles/view/{styleId}/{linesheetId}/{priceTypeId} с optional query brandId/fp.

Наблюдаемый legacy Style screen — справочная коммерческая карточка. Явных quantity/Add to Order controls на нём нет; ввод количества идёт через Product Catalog, Excel Order или Cart. Поэтому read model Style отделяется от order selection command.

### 12.2 Навигация

- Brand profile;
- Send Message;
- Relevant Linesheets;
- Back to Linesheet с hash-позицией style/page;
- Go to All Styles;
- Previous Style, если доступен;
- Next Style;
- direct image/CDN link.

Relevant Linesheets показывает, что один Style может входить в несколько drops/collections.

### 12.3 Commercial context

- current Linesheet;
- Delivery Window;
- Select Currency / Price Type;
- несколько price-type blocks;
- Wholesale;
- Suggested Retail;
- currency.

В одном detail наблюдались две price-type версии с различными wholesale/RRP для одного style. Значит, цена не является единственным полем Style и должна моделироваться как PriceRecord(style/color/SKU, priceType, currency, amount, valid dates).

### 12.4 Core fields — OBSERVED

- Style Name;
- Style Number;
- Description;
- Sizes;
- fit note, например true to fit;
- Materials;
- Country of Origin;
- Colors;
- main image;
- colorway image.

### 12.5 Classification/custom attributes — OBSERVED

Подтверждены пары label/value:

- COLLECTION;
- CONTENT;
- FABRIC WEIGHT;
- MODEL CODE;
- PATTERN;
- SEASON;
- SLEEVE LENGTH.

Linesheet grouping дополнительно подтверждает FABRICATION, CATEGORY, DIVISION, SILHOUETTE, LINESHEET GROUP и NECK SHAPE. Значение может отображать display value и исходное/повторное значение; target data model должен хранить normalized value, raw source value и locale.

### 12.6 Media

- primary image;
- direct CDN URL;
- image count на linesheet card;
- optional thumbnail/gallery;
- colorway-specific image;
- alt derived from style/color;
- missing/broken image fallback.

MediaAsset: id, owner account, original/derivatives, MIME, dimensions, checksum, alt, sort order, colorway binding, rights/access и deleted/replaced state.

### 12.7 Colorway

- color display name;
- internal/short color code;
- image;
- optional alternate/raw name;
- link/binding to Style;
- availability per linesheet/price type.

Colorway может быть отдельной card presentation внутри linesheet, но агрегируется обратно в Style и order totals.

### 12.8 Variant/SKU target fields

Не все поля выведены на read screen, но для order matrix нужны:

- variant/SKU id;
- styleId/colorwayId;
- size;
- size scale и sort order;
- SKU code;
- UPC/barcode;
- wholesale/RRP override;
- available-to-sell/orderable;
- minimum;
- increment/case pack;
- delivery;
- inventory timestamp;
- image override;
- active/discontinued.

### 12.9 Selection boundary

Read Style → choose order context → Product Catalog/Excel/Cart → color × size quantity → server validation → OrderLineSnapshot.

Нельзя записывать quantity непосредственно в master Style/SKU. Selection принадлежит конкретному Draft Order, retailer account, price type, delivery context и version.

## 13. Start an Order

Route: /ra/products без активного order context; входы также возможны из Storefront Shop, Linesheet, Style, Orders и Cart.

### 13.1 Наблюдаемое начальное состояние

Модальное окно содержит:

- heading Start an Order;
- required Search for a brand;
- autocomplete подключённых/доступных брендов;
- More options, disabled до выбора бренда;
- Start an Order, disabled до валидного context;
- close/dismiss, возвращающий к исходной странице без создания заказа.

До выбора brand система не должна создавать draft или писать пустую бизнес-сущность.

### 13.2 Наблюдаемый autocomplete failure

При открытии Start an Order из global Shop dialog был проверен brand search для нескольких connected brands. Autocomplete возвращал No results found; More options и Start an Order оставались disabled. Никакой draft не создавался.

Это состояние нужно отличать от корректного empty eligibility:

- loading;
- no text entered;
- no matching brand;
- matching brand but not order-eligible;
- connected but no shared linesheets;
- API error;
- stale account context.

Исходный dialog не объясняет причину. Улучшенная версия должна показывать result/reason per brand и recovery: refresh access, open connection, contact brand или return to linesheets. Storefront Shop также обязан передавать brand context, чтобы пользователь не повторял поиск.

### 13.3 Контекст, который должен быть разрешён до создания

| Поле | Источник | Обязательность |
|---|---|---|
| Retailer Account | active account session | всегда |
| Brand | user choice или storefront/linesheet context | всегда |
| Connection | server-side lookup | для закрытого ordering |
| Price Type | brand assignment/user choice | всегда, если цен несколько или не задана default |
| Currency | price type | derived, не свободный текст |
| Linesheet | optional source context | optional |
| Buyer | account contacts/default | policy-dependent |
| Door/Location | retailer locations and brand access | policy-dependent |
| Season/Year | selected linesheet/order metadata | optional/policy-dependent |
| Delivery Window | linesheet/order choices | optional/policy-dependent |
| Shipping/Billing | profile/order snapshot | может заполняться после creation |
| Existing compatible draft | server lookup | требует Resume/Create New decision |

More options следует документировать как policy-driven область. Поля, не открытые в текущем аккаунте, нельзя считать подтверждённым JOOR UI; для улучшенной версии туда логично поместить Buyer, Door, Season, Delivery Window и PO metadata.

### 13.4 Последовательность

1. принять source context;
2. выбрать или подтвердить Brand;
3. проверить connection и ordering permission;
4. загрузить price types/linesheets/delivery rules;
5. выбрать Price Type;
6. при необходимости раскрыть More options;
7. проверить существующий совместимый draft;
8. показать Resume, Create New или конфликт;
9. валидировать обязательные поля;
10. по явному Start an Order создать Order в Draft/Notes;
11. зафиксировать origin и context snapshot;
12. открыть scoped Product Catalog;
13. не терять возврат в исходный showroom/linesheet/style.

### 13.5 Валидации и ошибки

- brand required;
- connection/access required;
- price type required и должен принадлежать brand/account relationship;
- currency только из price type;
- buyer/door обязательны только по политике;
- выбранный linesheet должен быть published и shared;
- delivery window должна пересекаться с допустимым периодом;
- duplicate active draft требует явного решения;
- no catalog/no shared linesheets — отдельное объяснимое состояние;
- revoked access между modal и submit — server rejection;
- двойной click — idempotency key;
- ошибка создания не должна оставлять невидимый partial draft.

### 13.6 Создаваемые данные

Create command фиксирует: retailerAccountId, brandAccountId, connectionId, priceTypeId, currency, optional linesheetId/sourceEntity, buyerId, door/locationId, season/year, delivery window, origin, createdBy, clientRequestId. Адреса, контакты, цены и terms далее сохраняются как snapshots согласно разделам 16 и 30.

## 14. Product Catalog и выбор товара

Route: /ra/products внутри активного brand-specific order context.

### 14.1 Header и active order context

- Catalog;
- Order for: выбранный бренд;
- current Price Type;
- Styles Selected count;
- Orders Created count;
- View Order;
- active draft/cart indication;
- возврат к source showroom/linesheet, если сохранён origin.

Счётчики должны рассчитываться из server-authoritative draft, а не из локально видимых карточек.

### 14.2 Browse controls

Group By:

- None;
- Linesheet Group;
- Silhouette;
- Badge.

Sort By:

- None;
- Price Low to High;
- Price High to Low.

Filter By:

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

Дополнительно:

- filter-value selector;
- Filters Applied count;
- Search;
- clear/reset;
- loading skeleton;
- empty/no-access/error states;
- product grid/list;
- pagination/lazy load;
- View Order.

### 14.3 Товарная иерархия

~~~text
Linesheet
└── Style
    ├── Style metadata and media
    └── Colorway
        ├── color name/code/images
        └── SKU / Size
            ├── size value/order
            ├── price and inventory rules
            └── selected quantity
~~~

Карточка/деталь должна показывать по доступности: image, style name, style number, wholesale, suggested retail, currency, badges, delivery/linesheet context, colors и доступные sizes.

### 14.4 Ввод quantity

Целевая матрица — colorway × size:

- строка или группа соответствует colorway;
- колонка соответствует size/SKU;
- ячейка — целое quantity;
- ноль/пусто означает отсутствие заказа;
- недоступный SKU disabled;
- ввод проверяется по min, max, increment, ATS и delivery;
- Total Qty/Cost пересчитываются по color и style;
- selected style существует в draft, если хотя бы одна SKU quantity больше нуля;
- удаление всех quantities должно удалить/обнулить line по явной политике.

Нужны keyboard navigation, paste range, fill across sizes, undo, error summary и доступная таблица для screen reader. Эти улучшения являются TARGET, если не наблюдались напрямую.

### 14.5 Цена и доступ

При выборе SKU сервер повторно проверяет:

- active account;
- connection;
- linesheet/product audience;
- price type;
- currency;
- delivery window;
- SKU orderability;
- inventory policy;
- minimum/increment;
- draft version.

Order line хранит price/style/color/SKU snapshots. Текущая карточка каталога не должна переписывать историческую цену уже submitted order.

### 14.6 Сохранение и конкурентность

- filters — URL/query и optional saved view;
- quantity change — optimistic UI с rollback;
- сервер — источник истины;
- mutation включает orderVersion/clientMutationId;
- Saving/Saved/Error показывается возле изменённой области;
- конфликт версий даёт merge/reload decision;
- переход к Style и обратно сохраняет filters, scroll и draft;
- access revocation запрещает новые lines, но не удаляет исторические snapshots.

## 15. Cart, Draft, Notes и формирование состава заказа

### 15.1 Разделение понятий

| Понятие | Смысл |
|---|---|
| Cart | навигационный контейнер активных незавершённых orders |
| Draft | lifecycle state до отправки |
| Note Order | рабочий незавершённый order mode/status в наблюдаемом UI |
| Product selection | style/colorway уже включён в order |
| Ordered quantity | сумма quantity по SKU/size |
| Empty quantity order | order содержит products/colors, но Total Units = 0 |

Наблюдаемый order способен показывать Products > 0 и Colors > 0 при Total Units = 0. Следовательно, наличие OrderLine/ColorLine нельзя вычислять только из quantity > 0: пользователь может предварительно сформировать ассортимент, а размеры заполнить позже.

### 15.2 Cart route и empty state — OBSERVED

Route: /orders/cart.

В проверенном аккаунте Draft count = 0. Header popover показывает:

- Cart;
- `You currently do not have any orders in progress`;
- View Cart → `/orders/cart`.

Прямой переход `/orders/cart` перенаправляет на Dashboard вместо отдельного empty-cart screen.

Улучшенная версия должна показывать:

- Cart Orders heading;
- объяснение отсутствия drafts;
- Start an Order;
- Browse Linesheets;
- return to prior context;
- archived/recoverable drafts, если применимо.

Redirect без объяснения скрывает причинно-следственную связь.

### 15.3 Populated Cart Orders — OBSERVED

Заполненный `/orders/cart` — не простой список, а полноценный legacy quantity workspace. Верхняя часть:

- Back to Catalog → `/products`;
- manual-save warning;
- Cart Orders;
- пояснение, что cart разделён по брендам и brand tiles переключают orders;
- tile: brand, delivery count, linesheet, delivery window;
- Continue to Shipping & Billing;
- Cancel Order.

Order/brand summary:

- BRAND;
- STYLES;
- SKUS;
- QTY;
- TOTAL;
- brand link;
- linesheet link;
- Start Ship date;
- Complete Ship date;
- Door selector с placeholder `Select a door...`;
- Add More Styles.

Каждая style-color card содержит:

- Delete;
- product image/detail link;
- `Quantities Required` при незаполненной matrix;
- style number и name;
- wholesale `W` и retail `R` price;
- color;
- QTY;
- size labels и quantity inputs;
- Apply Bulk Quantities;
- Color Comment;
- Style Comment;
- Original Total;
- Total;
- Add More Colors.

Footer order:

- Order Comments;
- Total Qty;
- Sub Total;
- Total;
- Cancel Order;
- Continue to Shipping & Billing.

Наблюдаемый `Duplicate Orders` немедленно, без промежуточного confirmation, создал cart copy выбранного Note Order: brand/delivery/linesheet/styles/colors были перенесены, а quantities остались нулевыми. `Cancel Order` очистил active Cart и вернул Dashboard, но copy не была физически удалена: она сохранилась в Cancelled history, и registry counter Cancelled вырос на 1. Исходный order и его quantities не изменились. Это подтверждает, что duplicate является mutation на границе registry → cart, а cancel — lifecycle transition, не delete. Улучшенная версия обязана сначала показывать review: source orders, создаваемые drafts, copied/cleared fields, delivery/price compatibility и явное Confirm; discard до первого save должен уметь не создавать historical order, если policy это допускает.

### 15.4 Способы добавить ассортимент

1. Product Catalog внутри active order context.
2. Add Products из Order Review.
3. Start Excel Order → заполненный Excel → import to Cart.
4. Look/Styleboard/Assortment transfer, если entitlement/flow доступен.
5. Import Orders для внешнего order file — отдельный bulk workflow.

Все пути должны разрешать один и тот же canonical SKU, price type, delivery и access context.

### 15.5 Add Products modal — OBSERVED

Открывается из Products Summary существующего Note Order с действующим shared linesheet.

Header:

- Add Products;
- selected counter: N Style(s) / N Style color(s) selected;
- close button.

Context and filters:

- Linesheet combobox с текущим linesheet;
- пояснение, что доступны только shared linesheets;
- рекомендация обратиться к бренду, если linesheet отсутствует;
- Search textbox;
- loading;
- no-results state;
- pagination Previous / page numbers / Next.

Style card:

- style image/breadcrumb;
- Style Name;
- Style Number;
- несколько color swatches;
- checkbox на каждый style color;
- отдельные disabled checkboxes;
- Wholesale;
- Suggested Retail;
- Fabrication, включая пустое значение;
- currency наследуется от order price type.

Footer:

- Cancel;
- Add to Order;
- Add to Order disabled при нулевом выборе.

Color checkbox является уровнем выбора: счётчики отдельно считают unique styles и style colors. Disabled swatch должен иметь reason: already in order, unavailable, restricted, discontinued или incompatible; исходный UI reason рядом не показывает.

### 15.6 Add Products sequence

1. открыть modal;
2. загрузить только доступные shared linesheets;
3. выбрать linesheet;
4. искать/filter/paginate styles;
5. выбрать colorway checkboxes;
6. обновить selected styles/colors counters;
7. проверить duplicates и orderability;
8. Add to Order;
9. создать OrderLine/ColorLine с quantity 0;
10. закрыть modal;
11. показать новые cards в Products Summary;
12. quantity заполняется отдельным edit/ordering step;
13. Save recalculates units/totals.

Cancel должен удалять только modal selection state и ничего не менять в order.

### 15.7 Quantity matrix

Target unit of entry: colorway × size/SKU.

- sizes идут в устойчивом sort order;
- каждая ячейка содержит non-negative integer quantity;
- disabled SKU объясняет причину;
- Total Qty/Cost per color;
- Total Style Qty/Cost;
- Total Units/Order Value;
- zero quantity сохраняет assortment line согласно policy;
- Remove Style/Color удаляет selection отдельно от обнуления quantity.

Нужны keyboard navigation, paste range, fill series, clear row, validation summary, undo и autosave. Прямой usable quantity editor всё ещё не подтверждён: кнопка Edit в исследованных Note Orders не показала input controls.

### 15.8 Multi-order Cart — target architecture

Cart может содержать несколько brand-specific orders. Даже один brand может иметь разные drafts по price type/currency/delivery.

~~~text
Retailer Cart
├── Order A: Brand A / Price Type 1
├── Order B: Brand B / Price Type 2
└── Order C: Brand A / другой delivery/price context
~~~

Переключение tile не смешивает totals, terms, addresses, minimums или dirty state.

### 15.9 Saving and conflict handling

- local edit получает orderVersion;
- UI показывает Saving/Saved/Error;
- server повторно проверяет access, price, SKU и delivery;
- conflict предлагает reload/merge;
- переход между orders сохраняет dirty state;
- autosave предпочтительнее наблюдаемого manual Save warning;
- submission блокируется до завершения pending saves.

### 15.10 Minimums and warnings

Rules:

- minimum order value;
- minimum units;
- style/color/SKU minimum;
- increment/case pack;
- size run;
- delivery/door/territory;
- currency/price type.

Правила классифицируются как blocking, overridable и informational. Override сохраняет reason/actor/timestamp. Наблюдаемая система допускает submit с предупреждением, что бренд может отклонить order.

### 15.11 Submit boundary

Перед Submit for Approval:

1. все selection/quantity mutations сохранены;
2. required address/contact/order metadata валидны;
3. totals пересчитаны сервером;
4. minimum/access/delivery issues показаны;
5. terms version определена;
6. immutable submission snapshot создан;
7. idempotency key защищает от duplicate submit.

## 16. Manage Orders и рабочее место заказа

Routes: /orders и /ra/orders/review/{orderId}.

### 16.1 Registry: status and quantity dimensions

Фильтры статуса:

- Draft;
- Notes;
- Pending;
- Approved;
- Shipped;
- Cancelled.

Quantity dimension:

- With quantities;
- Without quantities.

Наблюдаемый Notes filter содержит как нулевые заказы, так и полноценные заказы с большим количеством строк и units. Поэтому Notes нельзя моделировать как синоним empty draft. Рекомендуемая нормализация:

- lifecycleStatus: DRAFT, PENDING, APPROVED, SHIPPED, CANCELLED;
- workflowMode/flag: NOTE_ORDER;
- hasQuantities — derived dimension;
- validation/issues — отдельный набор.

Если legacy JOOR фактически хранит Notes как status, улучшенная модель всё равно должна отделять жизненный цикл от признака наличия заметок/количеств.

Account-scoped snapshot на дату исследования (не глобальные product totals):

| Filter | Count |
|---|---:|
| Draft | 0 |
| Notes | 28 |
| With quantities | 11 |
| Without quantities | 17 |
| Pending | 8 |
| Approved | 672 |
| Shipped | 552 |
| Cancelled | 747 после проверки Duplicate/Cancel; baseline был 746 |

Default view включал Notes + With + Without, показывал 28 total, 20 rows на первой из двух страниц.

### 16.2 Registry actions and filters

Top actions:

- Actions;
- Start an Order.

Mass actions:

- Change Status — открывает modal;
- Duplicate Orders — немедленно создаёт cart copy, отдельного confirmation нет;
- Remove Style Colors With No Quantities — destructive cleanup;
- Send to Assortment — может быть disabled для Note Order без quantities.

При выборе одной строки footer меняется на `1 selected out of 28 total`, Export Data становится enabled, а Actions раскрывает четыре пункта в указанном порядке. Selection — prerequisite для этих операций.

Search and filter:

- Search;
- Your Selection;
- brand/connection context при входе из Dashboard View Orders;
- Clear All;
- Buyer с внутренним search `Search...`;
- Date group;
- Created → `Add a date`;
- Modified → `Add a date`;
- Start Ship → `Add a date`;
- Complete Ship → `Add a date`;
- status checkboxes;
- quantity With/Without;
- Apply Filters.

Table columns:

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

В одной строке несколько ячеек ведут в одну order review page. Улучшенная версия должна иметь один доступный row link и не создавать конфликтующих интерактивных зон.

Bottom controls:

- Import Orders;
- Download Order Confirmation;
- Export Data;
- total count;
- pagination;
- page size — значения из раздела 29.6.

### 16.3 Lifecycle and transition rules

~~~text
DRAFT / NOTE ORDER
├── edit independent blocks
├── save / comments / share / download
└── Submit for Approval
    └── PENDING
        ├── APPROVED
        │   ├── payment flow
        │   ├── fulfillment / partial shipment
        │   └── SHIPPED
        ├── revision request / notes loop
        └── CANCELLED
~~~

Каждый transition должен иметь: from, to, actor role, timestamp, reason/comment, validation snapshot, idempotency key и source.

Наблюдаемый bulk Change Status для выбранного Notes order:

1. modal `Change Status`;
2. пояснение `Select an option to change your order status`;
3. status selector: Notes selected, Pending available;
4. Send email to Brand — checkbox;
5. Send email to Retailer — checkbox;
6. Cancel;
7. Update, disabled пока новый status не выбран.

Следовательно, доступные transitions контекстны: UI не должен показывать универсальный список без учёта текущих statuses и permissions. Для mixed selection нужно либо intersection разрешённых transitions, либо per-order preview с исключениями.

### 16.4 Order Review: page containers

Overview page состоит из последовательных блоков:

1. tabs Overview и Pay;
2. Last updated;
3. Share Order;
4. Visual Assortment, включая gated/disabled state;
5. Comments с count и View Comment;
6. Download;
7. identification summary;
8. current status и primary transition;
9. Shipping and Billing;
10. Products Summary;
11. Contacts;
12. Financial Summary;
13. Order Details;
14. Legal / Terms & Conditions.

Каждый блок имеет собственные permissions и edit mode. Нельзя выводить единый флаг orderEditable для всей страницы.

### 16.5 Identification summary

Отображаются:

- Order #;
- Brand;
- Linesheet link или несколько references;
- Shipping Delivery Window;
- Price Type: currency и название;
- Order Status;
- last updated date/actor.

Order принадлежит одному retailer account и одному brand, но может включать несколько linesheets этого бренда. Price Type определяет базовую валюту/прайс; цены в строках остаются snapshots.

### 16.6 Header actions — точные формы

#### Share Order

Share открывает modal Share Order #…:

- существующий Buyer/recipient;
- Add additional emails;
- Add a personalized message;
- optional message toggle/field;
- Advanced Settings;
- Merge orders;
- Zip PDFs;
- Exclude terms;
- Exclude images;
- Buyer will be notified;
- Cancel;
- Send.

Send является внешним side effect. ShareJob должен фиксировать order versions, recipients, message, options, artifact IDs, sent_by/at и delivery status. Additional emails требуют validation, deduplication и permission/PII policy.

#### Visual Assortment

Кнопка может быть disabled/gated. Order → Assortment является отдельным transfer с entitlement check; disabled control должен объяснять plan/permission и не выглядеть сломанным.

#### Comments

Comments drawer показывает:

- heading Comments;
- существующие entries;
- author;
- comment body;
- input с placeholder Send a comment;
- submit button disabled до непустого валидного текста.

Нужны timestamp, visibility scope, attachments, read state, edit/delete policy и notification. Comment thread не равен internal note или status reason.

#### Download

Download drawer содержит radio formats:

- Order Summary PDF (.pdf);
- Order Summary Excel (.xls);
- Export Linesheet to Size (.xls).

Advanced Options:

- Merge orders into one PDF file;
- Exclude Terms & Conditions from PDFs;
- Exclude images from PDFs;
- Linesheet format;
- Cancel;
- Download.

OrderDocumentJob сохраняет selected order/version, format, advanced options, locale, price visibility, image/terms inclusion, generated checksum, size, status, actor и download audit. Linesheet format и Export Linesheet to Size связывают order document с legacy Excel workflow.

#### Status combo

В Note Order primary action — Submit for Approval. Arrow menu содержит альтернативу Cancel Order. Cancel является destructive lifecycle mutation и должен требовать confirmation/reason, optimistic version, audit и notification. Submit не был выполнен в исследовании.

### 16.7 Shipping and Billing editor

Два подтверждённых permission states:

1. editable — Edit открывает modal;
2. restricted — кнопки Edit нет, виден текст с просьбой обратиться к бренду.

Editable modal содержит tabs Shipping Info / Billing Info.

Общие controls:

- Select Address *;
- Create New → retailer profile;
- Clear All Fields;
- Cancel;
- Update Address, disabled до валидного изменения;
- copy shipping → billing или billing → shipping.

Shipping:

| Поле | Режим |
|---|---|
| Store Name | read-only |
| Address 1 | required |
| Address 2 | optional |
| City | required |
| Territory | optional |
| Postal Code | locale-dependent |
| Country | required |
| Email | required в наблюдаемой форме |
| Phone | optional |
| Door | selector/derived |
| Shipping Method | selector |
| Use as Billing Address | checkbox |

Billing:

| Поле | Режим |
|---|---|
| Store Name | read-only |
| Address 1 | required |
| Address 2 | optional |
| City | required |
| Territory | optional |
| Postal Code | locale-dependent |
| Country | selector |
| Phone | optional |
| VAT ID | editable |
| Billing Code | brand-controlled |
| Payment Method | brand-provided |
| Use as Shipping Address | checkbox |

Restricted state доказывает, что address permission может задаваться brand/account/order policy независимо от Note status. Permission reason должен быть machine-readable, а не только текстом.

Order хранит AddressSnapshot и sourceLocationId; профильные изменения не переписывают submitted history.

### 16.8 Products Summary

Aggregates:

- Total Units;
- Products = unique styles;
- Colors = selected colorways.

Подтверждены два разных Note Order состояния:

| Products | Colors | Units | Смысл |
|---:|---:|---:|---|
| > 0 | > 0 | > 0 | ассортимент и size quantities заполнены |
| > 0 | > 0 | 0 | styles/colorways выбраны, все size quantities нулевые |

Это требует отдельных derived metrics hasSelections и hasQuantities.

Actions:

- Add Products;
- Edit;
- Load More/Load All;
- disabled reason.

Product card:

- image;
- style name;
- wholesale/currency;
- style number link;
- linesheet link;
- suggested retail;
- один или несколько colors;
- sizes and quantities;
- color totals;
- style totals.

Add Products modal и selection lifecycle определены только в разделе 15, чтобы не дублировать order-building flow.

#### Access revoked

- historical lines remain;
- warning shown;
- Add Products disabled при отсутствии других shared linesheets;
- quantities/totals remain readable;
- revoke does not delete snapshots.

#### Permissions and observed ambiguity

- Note Order может иметь enabled Add Products;
- другой Note Order имеет disabled Add Products из-за revoked linesheet;
- Approved blocks product mutation;
- Edit отображался active, но ни в active, ни в revoked проверенном order не появились quantity inputs;
- usable quantity editor остаётся controlled UAT item.

Каждая product mutation должна проверять orderVersion, access, price type, SKU orderability и delivery.

### 16.9 Contacts editor

Read mode показывает Sales Rep и Buyer с именем/e-mail.

Edit переводит widget в inline mode:

- Sales Rep — выбранный существующий контакт;
- Buyer — search/select field;
- Create new;
- Save.

Contacts — role bindings с snapshots:

- orderContactId;
- role;
- sourceContactId/userId;
- snapshotName;
- snapshotEmail;
- active period;
- editedBy/At.

Удаление или изменение contact profile после submit не должно переписывать историю.

### 16.10 Financial Summary

Отображаются:

- Total Order Value;
- Total Retail Value;
- Subtotal Wholesale;
- Included Product Discounts;
- Order Discount: percent и amount;
- Shipping Fees;
- Grand Total;
- rounding warning.

Источником истины является server decimal calculation. Хранить отдельно:

- base SKU price;
- line/product discount;
- order discount;
- shipping/fees;
- tax, если применимо;
- currency and precision;
- rounding rule;
- calculated totals;
- accepted/final totals;
- calculation version.

Отображаемые округлённые компоненты могут не складываться в Grand Total, поэтому frontend не должен пересчитывать финальную бухгалтерскую сумму самостоятельно.

### 16.11 Order Details editor

Read mode подтверждает:

- Order Created Date;
- Season;
- Year;
- Order Delivery Window.

Edit запускает независимый inline/loading state и Save. В наблюдаемой сессии фактические controls не загрузились, поэтому дополнительные поля остаются UAT, а не подтверждённым фактом.

Target metadata:

- internal order ID и external PO;
- creator/buyer/sales rep;
- source channel;
- created/modified/submitted/approved/shipped/cancelled timestamps;
- season/year/delivery;
- locale/date format;
- integration/payment/fulfillment state;
- version and audit.

### 16.12 Legal / Terms & Conditions

Brand-provided Terms & Conditions отображаются внутри order page. Заказ должен хранить:

- termsVersionId;
- rendered HTML/PDF/document reference;
- content checksum;
- locale;
- presentedAt;
- acceptedAt/by и acceptance method;
- submission snapshot.

Новая версия условий бренда не может молча заменить условия уже отправленного заказа.

### 16.13 Pay tab

Если JOOR Pay не активирован:

- explanation;
- external information link;
- interest CTA;
- no payment form.

Payment states:

- unavailable;
- brand_not_enabled;
- retailer_not_eligible;
- interest_not_sent/sent;
- payment_due;
- partially_paid;
- paid;
- failed;
- refunded;
- disputed.

PaymentIntent, PaymentTransaction и Order — разные aggregates. Interest CTA или payment submission являются side effects.

### 16.14 Order entity summary

- orderId, retailerAccountId, brandAccountId, connectionId;
- buyer, sales rep, PO;
- price type and currency;
- lifecycle status and note flags;
- quantities/units;
- linesheet references;
- delivery/complete ship;
- line/color/SKU snapshots;
- shipping/billing snapshots;
- contacts snapshots;
- financial calculation/final totals;
- terms snapshot;
- comments and attachments;
- status history;
- origin and integration/export marks;
- assortment/payment/fulfillment links;
- optimistic version, created/updated timestamps and audit.

## 17. Import, export, download and jobs

### 17.1 Upload/import

#### Profile media

- logo Upload;
- Browse Images from library;
- Store Photos multi-upload;
- форматы и limits — раздел 29.7.

#### Message attachment

- optional image attachment;
- форматы и limit — раздел 29.7.

### 17.2 Downloads

- Download Order Confirmation;
- View/Download Document;
- potentially style media if permission;
- import error report;
- export result.

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

Job statuses используют canonical values из раздела 29.5.

Actions:

- Refresh;
- View details;
- Download result;
- Download errors;
- Retry;
- Cancel queued/running if supported.
---
### 17.5 Подробные формы импорта и выгрузки

#### 17.5.1 Import Orders

Модальное окно Import Orders представляет трёхшаговый процесс, что визуально отмечено шагами 1, 2, 3.

Шаг 1:

- обязательный Select an Import Template;
- варианты:
  - JOOR Standard Excel Order;
  - JOOR Vertical Order Template (UPC);
- Upload File;
- Drag and Drop;
- Browse files;
- formats и limit — раздел 29.7;
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

#### 17.5.2 Download Order Confirmation

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

#### 17.5.3 Export Data

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

## 18. Looks / Collections

Route: /ra/showroom/collections

### 18.1 Registry

Page blocks:

- Looks;
- Filters sidebar с collapse control;
- Your selection;
- Clear all;
- Current tab с count;
- Archived tab с count;
- Apply Filters;
- table.

Filters:

- Collection Name;
- Brand Name;
- Creator Name;
- Created On;
- Last Modified.

Table columns:

- Collection Name;
- Creator Name;
- Brand;
- Date Shared;
- Created On;
- Last Modified.

В наблюдаемом состоянии Current = 2, Archived = 3. Это account/content snapshot, а не фиксированная product limit.

### 18.2 Viewer and product selection

Route: `/ra/showroom/collections/{encodedCollectionId}`.

Viewer состоит из многостраничного полотна и product rail. Наблюдаемые controls/data:

- product image;
- product name;
- style number;
- color;
- select/deselect icon на товаре;
- Hide controls;
- PREV;
- PAGE current/total;
- NEXT;
- PRODUCTS;
- `N selected`;
- ADD PRODUCTS TO;
- Styleboard;
- Order;
- Select price type.

На проверенном Look было три страницы. Пока `0 selected`, Styleboard и Order disabled. Click по product card меняет select icon, counter на `1 selected` и включает обе кнопки. Selection локальна viewer session и не должна менять order/styleboard до подтверждения в modal.

### 18.3 Look → Styleboard modal — OBSERVED

`Add to styleboard`:

1. Select a styleboard to add your products to;
2. Add to existing styleboard — radio, default;
3. searchable styleboard combobox `Select a styleboard`;
4. Add to new styleboard — radio;
5. при выборе new появляется `Name your styleboard`;
6. Cancel;
7. Add to board;
8. Add and go to board.

Обе Add-кнопки disabled, пока existing board не выбран или new name не заполнен. `Add to board` остаётся в Look, `Add and go to board` должен завершить mutation и открыть board. Проверка остановлена до mutation.

### 18.4 Look → Order modal — OBSERVED

`Add to order`:

1. Add to existing order — radio, default;
2. searchable order combobox `Start typing to search...`;
3. Add to a new order — radio;
4. для new: Select order price type;
5. для new: Select order warehouse;
6. Cancel;
7. Add to order;
8. Add and go to order.

В наблюдаемом brand context был один price type и один warehouse; оба выбирались автоматически, после чего Add-кнопки становились enabled. Это context-dependent dictionaries, а не глобальные значения. Existing order должен фильтроваться по brand, currency/price type, warehouse, status, access и compatibility выбранных products. `Add to order` возвращает в Look, `Add and go to order` ведёт в cart/order workspace. Проверка остановлена до mutation.

### 18.5 Lifecycle and entity model

Brand creates → adds pages/layout/widgets → links styles/colorways → shares → retailer receives under Current → opens → selects products → transfers to Styleboard/Order → optionally archives.

Canonical entities:

- Look/collection: id, name, brand, creator, cover, status CURRENT/ARCHIVED, dateShared, createdAt, modifiedAt;
- LookPage: order, canvas dimensions, background/media;
- LookWidget: text/media/product-hotspot, geometry, z-index, content;
- ProductHotspot: linked style/colorway, placement, availability/access state;
- LookShare: recipient account, sharedAt, revokedAt;
- SelectionSession: selected product/colorway IDs, price context, source page;
- Transfer: target type/id, create-new flag, result IDs, createdBy/At;
- engagement: viewedAt, page impressions, product selections, transfer outcome.


## 19. Styleboards

Routes:

- /ra/showroom/styleboards — registry;
- /ra/showroom/styleboards/add — create entry;
- /ra/showroom/styleboards/{encodedStyleboardId} — canvas.

### 19.1 Registry — OBSERVED

Composition:

- Manage Styleboards;
- Create New;
- Search & Filter;
- Current/Archived tabs with counts;
- table;
- Actions listbox.

В проверенном account:

- CURRENT (1);
- ARCHIVED (0).

Counts являются динамическими и приведены только как evidence.

Table columns:

- checkbox;
- Styleboard name;
- Brand Name;
- Creator Name;
- Created On;
- Last Modified.

Search & Filter panels:

- Styleboard Name;
- Brand Name;
- Creator Name;
- Created On;
- Last Modified;
- Clear all;
- Apply Filters.

Текстовые panels используют Search..., date panels — date input.

### 19.2 Selection and bulk actions — OBSERVED

Без выбранных строк Actions disabled. После выбора текущего Styleboard доступны только:

- Archive styleboard(s);
- Delete styleboard(s).

Ранее предполагаемые Duplicate/Restore не подтверждены. Restore может появляться только в Archived, но archived count = 0, поэтому остаётся UAT.

Delete — destructive mutation с confirmation, optimistic version, permission и audit. В исследовании Archive/Delete не запускались.

### 19.3 Create New and brand association — OBSERVED, CANCELLED

Переход /add показывает background canvas:

- UNTITLED STYLEBOARD;
- Saving …;
- 0 Products;
- toolbar icons;
- Add to Order disabled;
- comments input;
- Send disabled.

Поверх canvas открывается modal Associate a brand to the styleboard:

- Select a brand to associate this styleboard to;
- brand combobox;
- Start typing to search...;
- Cancel;
- Assign disabled до выбора.

Cancel вернул в registry; count остался CURRENT (1), то есть новая запись после отмены не появилась. Тем не менее показ Saving … до выбора бренда создаёт ambiguity: улучшенная версия не должна создавать persistent entity до явного Assign/Create либо обязана помечать temporary draft и гарантированно удалять его при Cancel.

### 19.4 Canvas structure — OBSERVED

Проверенная существующая доска содержит:

- title;
- Products count;
- product widgets;
- один или несколько color availability labels;
- discard icon у каждого объекта;
- text widgets;
- toolbar icons:
  - Smart Buy;
  - text;
  - два Group controls;
- Share;
- Comment section;
- Select price type;
- Add to Order;
- General Comments;
- Enter comment here;
- Send.

У наблюдаемой доски в price type list был только EUR. Это account/brand-specific option, а не глобальный справочник.

Add to Order может быть enabled при наличии продуктов; Send disabled при пустом comment.

### 19.5 Add to order modal — OBSERVED, CANCELLED

Кнопка Add to Order открывает modal:

- Add to existing order — selected by default;
- autocomplete Start typing to search...;
- Add to a new order;
- Cancel;
- Add to order — disabled без target;
- Add and go to order — disabled без target.

Семантика двух submit actions:

- Add to order — переносит selection и остаётся на Styleboard;
- Add and go to order — переносит selection и открывает order workspace.

Ни одна мутация не выполнялась; modal закрыт Cancel.

### 19.6 Comment and collaboration contract

General Comments:

- existing comments/history area;
- Enter comment here;
- Send disabled при пустом тексте.

Хранить author, account, body, created/edited/deleted timestamps, visibility, mentions, attachments, read state и notifications. Comment не заменяет order comment после переноса.

### 19.7 Styleboard entity and widget model

- styleboardId;
- retailer account;
- associated brand;
- name;
- creator;
- current/archived;
- selected price type;
- created/modified;
- share permissions;
- comments;
- derived order links;
- optimistic version;
- autosave state.

Для каждого widget:

- widgetId/type;
- x/y;
- width/height;
- rotation;
- z-index;
- background;
- linked style/colorway;
- product snapshot;
- text content and typography;
- author;
- created/modified;
- deleted/discarded state.

Нужны undo/redo, explicit autosave status, conflict resolution, export image/PDF, duplicate/template mode и keyboard accessibility.
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


### 20.3 Plans

Visual Assortment plan names, prices, users/doors/products и retention limits являются billing catalog и зафиксированы один раз в разделе 26.1.

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

### 21.1 Navigation and folder contract

Постоянные folders:

- Inbox → `/messages`;
- Invitation → `/messages/invitation`;
- Sent → `/messages/sent`;
- Trash → `/messages/trash`.

Inbox:

- Search + Submit;
- Compose Mail;
- Delete;
- Mark as Read;
- Mark as Unread;
- header select-all checkbox и checkbox per row;
- sortable From, Message, Date;
- sender, subject/body preview, date;
- open message/thread;
- pagination with next/last page.

В наблюдаемом snapshot Inbox показывал 50 rows на page 1 и восемь страниц. Counts динамичны и account-scoped.

Invitation:

- explanation: messages are related to connection invitations;
- Delete;
- Mark as Read / Mark as Unread;
- From / Message / Date;
- в snapshot одна строка.

Sent:

- Compose Mail;
- Mark as Read / Mark as Unread;
- To / Message / Date;
- в snapshot 34 rows.

Trash:

- Compose Mail;
- Move to Inbox;
- Mark as Read / Mark as Unread;
- From / Message / Date;
- наблюдаемый empty table.

Delete, read/unread и restore применяются к selection. При нулевом выборе destructive command должен быть disabled; при массовом удалении нужен confirmation.

### 21.2 Compose a Message — exact field order

Route: `/messages/send`; pre-addressed form: `/Messages/send/{brandId}`.

1. Close;
2. Send to all my connections — radio;
3. Select Connections — radio;
4. Recipient(s) — autocomplete с hint `Use the autocomplete to add recipients`;
5. Subject — text, observed `maxlength=255`;
6. Message — required textarea;
7. Attach an image (optional) — UI contract `.jpg or .png, 4MB max`;
8. Send.

Broadcast и selected-recipient modes обязаны быть взаимоисключающими. Для broadcast UI должен показать resolved count и отдельное confirmation; autocomplete должен возвращать только разрешённые connected accounts. File restrictions перечислены один раз в разделе 29.7.

### 21.3 Thread

Просмотр сообщения построен как хронологическая таблица:

- From / Date;
- Subject Line;
- ссылка на профиль участника;
- несколько сообщений в одной цепочке;
- subject;
- body с переносами строк;
- распознаваемые mailto-ссылки.

Connection request может порождать thread, а не отдельный несвязанный notification. Structured order comments/status history при этом остаются отдельными aggregates.

### 21.4 Message entity

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

Дополнительно нужны folder membership и read/deleted/restored timestamps per participant, replyToMessageId, connectionRequestId, delivery channel/email mirror, attachment scan state и spam/abuse state.

### 21.5 Sending

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

Наблюдаемые folder actions оформлены как URL `/messages/actions/{delete|read|unread|inbox}`. В новой версии мутации нельзя выполнять GET-запросами: нужны POST/PATCH, CSRF, authorization, idempotency и audit. Search/sort/page/folder state должны быть shareable URL params и не смешиваться между active accounts.


## 22. User Settings

Route: /accounts/settings.

Страница разделена на Manage My Account и Retailer Account Information. В collapsed state показаны summary и Edit. Каждый editor раскрывается inline, имеет X и Save Changes и сохраняется независимо.

### 22.1 Credentials — OBSERVED

- login Email — read-only;
- Password — masked;
- Reset password — link.

При нажатии Reset password появился blocking JavaScript alert без отдельной формы и без доступного текста в DOM. Было ли отправлено recovery письмо, интерфейс не подтвердил. Это BROKEN/AMBIGUOUS: reset flow должен показывать destination в masked form, confirmation, cooldown, expiry и результат отправки.

### 22.2 User Profile — OBSERVED

Поля:

- FULL NAME;
- JOB TITLE;
- Phone;
- Upload Photo;
- Display my information on my company profile;
- company profile link;
- X;
- Save Changes.

Public user consent отделён от account Privacy. Profile photo route: /accounts/update_photo.


### 22.3 Languages — OBSERVED

Два независимых select:

- SET DEFAULT LANGUAGE AS;
- SEND EMAILS IN.

Оба используют Language Dictionary из раздела 29.3. UI language и email language сохраняются отдельно.

### 22.4 Email Settings — OBSERVED

Для каждого правила отдельные Yes/No radio:

1. Send me messages from my JOOR inbox to my email.
2. Send me connection request emails.
3. Send me weekly update emails with news from my connections.
4. Send me information about industry updates and news.
5. Email orders that are assigned to me on the site.
6. Email orders that are assigned to me on the iPad.

Web и iPad assignment notifications являются разными preferences.

### 22.5 Default Connection Request Message — OBSERVED

- Use default connect request message — checkbox;
- MESSAGE — textarea;
- X;
- Save Changes.

Нужны account default, optional user override и snapshot фактически отправленного текста. Checkbox должен явно показывать, используется ли system/account template или textarea.


### 22.6 Date Format — OBSERVED

Date Format select использует значения из раздела 29.3. Формат действует на web и iPad display; server хранит даты нормализованно.


### 22.7 Landing Page — OBSERVED

Landing Page select использует значения из раздела 29.3. Helper: Select a new default home page from the dropdown below. Неподдерживаемый/удалённый route должен падать обратно на Home.


### 22.8 Round Retail Pricing — OBSERVED

Round Retail Pricing select использует значения из раздела 29.3. Helper: Automatically round retail prices to the nearest 1.00 or 5.00 values. Исходная цена и display rounding rule хранятся раздельно.

### 22.9 Retailer Account Information — OBSERVED

#### Profile Name

- PROFILE NAME;
- helper Reset your profile name;
- это business/account identity, не user name.

#### Account Email

- EMAIL, input type=email;
- helper: адрес является primary contact for all connection requests and messages;
- это account contact, не login email.

#### POS System

- POS SYSTEM;
- VERSION(IF KNOWN).

#### Buyer Name

- BUYER NAME;
- helper: contact appears on all purchase orders;
- order хранит snapshot.

#### Connection Permission

Exact question: Any brand or retailer can connect with me.

- Yes;
- No.

Это inbound-connect policy, не текущий connection state.

#### Privacy

Helper: определяет, отображается ли profile в member search.

- Show in Search;
- Hide from Search.

Это profile search privacy, отдельная от per-associated-account discoverability modal.

### 22.10 Form scope and visible storage keys — OBSERVED

Форма показывает разделение User/Account/Boutique:

| UI | Scope/key family |
|---|---|
| display language | User.display_language |
| email language | User.email_language |
| inbox forwarding | Account.send_messages |
| connection e-mails | Account.send_match |
| weekly/industry updates | User.send_updates / send_discounts |
| assigned web/iPad orders | User.send_site_emails / send_ipad_emails |
| default request text | User.use_invitation_msg / invitation_msg |
| date format | User.date_format |
| landing page | User.landing_page |
| round pricing | User.round_retail_prices |
| profile name/email/POS | Account fields |
| buyer name | Boutique.buyer_name |
| connect policy/privacy | Account.match_permissions / privacy |

Эти visible form names не доказывают внутреннюю database schema, но подтверждают разные ownership scopes.

### 22.11 Save and security model

- independent settings endpoints;
- field-level validation;
- explicit Save Changes;
- X discards editor changes;
- server version/ETag;
- audit privacy, connection permission and identity;
- success/error state;
- source web/iPad/API;
- changedBy/At;
- reset token expiry and rate limits;
- no raw PII in analytics.
---


## 23. Retailer Company Profile

Route: /ra/profile/{accountId}.

### 23.1 View mode — OBSERVED

- company name;
- Get Verified;
- Why verify your Tax ID;
- credibility explanation;
- Edit Page;
- People;
- administrator badge;
- Primary Location;
- Other Locations;
- location name/type/address;
- Google Maps search link;
- Expand All Locations.

### 23.2 Verification modal — OBSERVED, NOT SUBMITTED

Get Verified открывает Verification:

- Country — searchable select;
- Tax ID;
- placeholder e.g. 12-3456789;
- Add to profile.

Modal закрыт без отправки. Нужны statuses NOT_STARTED/PENDING/VERIFIED/FAILED/EXPIRED, provider response, normalized country/tax identifier, masked display, evidence/audit и retry policy.

### 23.3 Edit mode — OBSERVED

Edit Page переключает в Editing Your Profile. Primary action: Save and View.

Порядок:

1. Logo Image;
2. Verification - Tax ID;
3. Basic Info;
4. Store Photos;
5. People;
6. Primary Location;
7. Other Locations;
8. Add another Location.

### 23.4 Logo and Store Photos — OBSERVED

Logo:

- Upload;
- Browse Images.

Store Photos:

- Upload;
- Browse Images;
- назначение: interior/exterior.

Форматы и limits для обоих blocks — раздел 29.7.

Нужны MIME/magic-byte validation, malware scan, EXIF stripping, crop/order/delete, thumbnails и signed asset URLs.

### 23.5 Basic Info — OBSERVED

- Business Name — read-only здесь;
- ссылка/инструкция менять в Account Settings;
- Description, placeholder Describe the aesthetic, values, and story behind your business;
- Website, placeholder yourstore.com;
- Instagram, @username;
- X, @username;
- Facebook, www.facebook.com/yourpage.

### 23.6 People — OBSERVED

- displayed account users;
- Add or update your information;
- Go to user settings;
- пояснение, что каждый user сам добавляет name/title/image и opt-in/opt-out.

Company People является projection user memberships + per-user display consent.

### 23.7 Location fields — OBSERVED

Для Primary и каждой Other Location повторяется:

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
10. Zip;
11. Phone;
12. Categories;
13. Brands Carried;
14. Demographics:
   - Gender;
   - Age;
15. Described as, максимум 3;
16. Shops for, максимум 3;
17. Delete — только для non-primary records.

Global actions:

- Add another Location;
- Save and View.


### 23.8 Location Type, price and age dictionaries — OBSERVED

Type, Minimum Price, Maximum Price и Age используют canonical Location Profile Dictionaries из раздела 29.4. Brands Carried — remote autocomplete без initial options; Country — searchable international directory.


### 23.9 Category dictionary — OBSERVED

Каждая location использует canonical Global Category Dictionary из раздела 29.1.


### 23.10 Demographics dictionaries — OBSERVED

Gender, Age, Described as и Shops for используют значения из раздела 29.4. UI ограничивает Described as и Shops for максимум тремя выборами.

### 23.11 Location-centric architecture

Categories, Brands Carried, demographics и wholesale range принадлежат Location, а не только account. Разные doors одной сети могут иметь разные audience/profile.

Location entity:

- locationId/accountId;
- primary flag;
- name/type/year;
- price min/max and currency assumption;
- structured address;
- phone;
- category ids;
- carried brand ids;
- gender/age segments;
- descriptive tags;
- shopping missions;
- created/updated/deleted;
- geocoding/map reference;
- version/audit.

Delete Location должен проверять связи с orders/doors/integrations и использовать archive при наличии истории.
---

## 24. Account switching и discoverability

### 24.1 Account menu — OBSERVED

Account menu содержит:

- current account card: name, account ID, connected brands preview и created date;
- This is my Primary Account;
- Account Settings;
- Integration Settings;
- Premium Features;
- Manage Profile;
- Data Activity Center;
- Other Accounts с count;
- Language;
- Help Center;
- Log Out.

В проверенной membership доступен текущий retailer account и ещё 13 retailer accounts. `Other Accounts (13)` раскрывает:

- Manage Account Visibility;
- Search by connected brands;
- account cards как buttons;
- account name и ID;
- preview connected brands с `+ N More`;
- Created by brand либо Created date;
- date;
- archived/read-only marker, если применимо.

Click по account card является фактическим переключением context, отдельной preview/confirmation стадии нет. Brand-role в списке отсутствует.

### 24.2 Switch sequence

1. открыть account menu;
2. увидеть current и primary;
3. открыть Other Accounts;
4. выбрать доступную организацию;
5. сервер проверяет membership и состояние account;
6. сменить activeAccountId;
7. инвалидировать account-scoped cache/query/cart;
8. загрузить permissions, entitlements, connections, messages, orders и profile нового account;
9. сохранить только user-global preferences;
10. записать switch audit event.

Нельзя переносить между accounts: cart/draft selection, last order, brand access, unread counts, export jobs, integration state и cached API responses.

### 24.3 Accounts Visibility Settings — OBSERVED

Manage Account Visibility открывает modal:

- explanation primary и associated accounts;
- Hide accounts from being discovered;
- All Accounts;
- checkbox на каждый account;
- account name/ID;
- connection preview;
- Created by/date;
- archived markers;
- Save;
- предупреждение, что применение может занять до 30 минут.

В modal перечислены current и associated accounts; индивидуальные checkboxes могут быть mixed checked/unchecked. `All Accounts` — отдельный bulk checkbox. Close icon закрывает modal без Save; Save является единственной подтверждающей mutation-кнопкой.

Семантика: checked account скрыт от discovery новыми брендами; unchecked видим. Это отдельная политика, не primary flag и не connection state.

### 24.4 Data model and consistency

AccountDiscoveryVisibility:

- accountId;
- discoverable/hidden;
- changedBy/At;
- effectiveAt;
- source;
- optional reason;
- version.

UI может применить optimistic display после Save, но directory/discovery search должен использовать effective server state. Archived/read-only accounts должны иметь явные ограничения изменения visibility.

Все domain requests несут activeAccountId, проверенный сервером; client-side header не является security boundary.

### 24.5 Language surface — OBSERVED

Account menu показывает текущий language flag/code и раскрывает localization menu. Наблюдаемые пункты этого menu:

- current flag/code;
- ten observed localization options;
- отдельная ссылка на provider attribution в localization widget.

Точные values и различия с User Settings сведены один раз в canonical dictionary раздела 29.3. Переключение языка является user-global preference, не business-account data, но должно синхронно обновлять locale, date formatting и server preference без утечки active account context.


## 25. Shopify Integration

Route: /ra/shopify/retailer-product-sync/config.

### 25.1 Disconnected state — OBSERVED

Composition:

- Integration Settings;
- Shopify provider/tab;
- You are not connected to your Shopify shop;
- Install on Shopify;
- Sync Settings;
- Automation;
- Field Preferences;
- Sync Information;
- Not synced yet.

Install on Shopify ведёт во внешний Shopify installation/OAuth flow и не запускался.

### 25.2 Automation — OBSERVED DISABLED

- Automatic Sync — checked, disabled;
- helper: approved orders from all connected accounts can sync automatically;
- account-level customization обещана после Expand;
- Expand All — disabled до connection.

Checked + disabled означает proposed/default configuration, а не active sync. UI должен различать desired settings и effective integration state.

### 25.3 Exact JOOR → Shopify mapping — OBSERVED DISABLED

Все checkboxes наблюдались checked and disabled:

| JOOR field | Shopify destination |
|---|---|
| Style Name | Title |
| Brand Name \| Style Name | Title |
| Description | Description |
| Photos | Media |
| Category | Category |
| Linesheet | Collections |
| Silhouette | Type |
| Brand Name | Vendor |
| Suggested Retail Price | Price |
| Sku Prices | Variant Price |
| Sku Code | Variant SKU |
| UPC Code | Variant Barcode |

В UI используется label Brand Name | Style Name, а не математическое сложение. Это title template.

### 25.4 Integration lifecycle

~~~text
DISCONNECTED
→ Install on Shopify
→ Shopify authorization
→ callback/webhook verification
→ CONNECTED
→ configure automatic sync and fields
→ optional per-account overrides
→ approved order event
→ QUEUED/RUNNING job
→ COMPLETED / PARTIAL / FAILED
→ Activity Center details, errors and retry
~~~

### 25.5 Required mapping and conflict policies

- create vs update product;
- identity by SKU/UPC and collision policy;
- title template precedence;
- currency and price selection;
- image add/replace/remove;
- collection/linesheet lifecycle;
- variant deletion and unavailable SKU;
- inventory ownership;
- order cancellation/change after approval;
- global vs account override;
- partial failure and row-level errors;
- retries/idempotency;
- Shopify rate limits;
- webhook signature/replay protection;
- permission scopes and token rotation;
- disconnect/data retention.

### 25.6 Sync records

IntegrationConnection:

- accountId/provider/shop reference;
- status;
- granted scopes;
- installedAt/disconnectedAt;
- secret/token reference;
- webhook health;
- config version.

SyncJob:

- source order/version;
- account/brand;
- mapping snapshot;
- status;
- created/updated product ids;
- warnings/errors;
- retry count;
- idempotency key;
- started/finished;
- Activity Center reference.

No active connection or successful sync artifact был доступен; connected settings and job details остаются UAT.
---

## 26. Subscription and entitlements

Route: /ra/subscriptions.

### 26.1 Plan catalog — OBSERVED

Screen:

- Premium Features;
- Available For Purchase;
- plan card;
- external feature detail;
- description;
- monthly/yearly price;
- Purchase.

Наблюдаемые на 4 августа 2026 года offers:

| Plan | Limits | Monthly | Yearly |
|---|---|---:|---:|
| Visual Assortment Premium | 5 users, 5 doors, 3,000 products, 3 years storage | $299 USD | $3,199 USD |
| Visual Assortment Standard | 2 users, 1 door, 1,000 products, 2 years storage | $159 USD | $1,599 USD |

Цены и лимиты являются billing catalog data, не constants продукта.

### 26.2 Checkout entry — OBSERVED, NOT SUBMITTED

Purchase Standard monthly открыл Stripe Checkout без промежуточного JOOR modal.

Order summary:

- Visual Assortment - Standard;
- product description;
- billed monthly;
- subtotal;
- total due today;
- promo code;
- Apply disabled до кода;
- merchant-back link with cancel=true and featureId.

Payment choices:

- Apple Pay;
- Link;
- card.

Fields:

- contact email;
- card number;
- expiry;
- CVV/CVC;
- cardholder name;
- billing country/region.

Additional controls:

- Subscribe;
- recurring-charge authorization text;
- I am an AI agent acting on behalf of someone else — checkbox;
- Stripe Terms/Privacy.

Checkout локализуется browser locale. Никакие contact/payment fields не заполнялись, Subscribe не нажимался; возврат выполнен merchant-back link.

### 26.3 Billing and entitlement model

- PlanCatalog;
- PlanPrice by currency/interval;
- AccountSubscription;
- Entitlement;
- usage counters;
- users/doors/products/retention limits;
- trial;
- active/past_due/cancelled/incomplete;
- provider customer/session/subscription ids;
- promo/discount;
- tax;
- proration;
- renewal/cancel timestamps;
- webhook event ledger.

Purchase должен передавать exact account, plan, interval, currency, amount and versioned terms. Stripe webhook, а не client redirect, является источником истины активации.

### 26.4 End-to-end purchase

1. choose plan/interval;
2. create idempotent checkout session;
3. show immutable order summary;
4. collect contact/payment data у provider;
5. submit payment;
6. provider authenticates where required;
7. webhook verifies signature and event id;
8. subscription becomes active;
9. entitlements recalculate;
10. shell/gated screens invalidate cache;
11. receipt/notification;
12. failures, retries, cancel and renewal lifecycle.

Full successful checkout, cancellation after activation, invoice history и payment failure остаются UAT.
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
### 27.1 Таблица Data Activity Center

Элементы:

- Refresh;
- sortable/filterable grid;
- No Rows To Show.

Колонки:

- Job Ref #;
- Created By;
- Type;
- Status;
- Actions;
- Start Date;
- End Date;
- Additional Info.

Job Ref должен быть стабильным публичным идентификатором, а Additional Info — структурированной ссылкой на результат, ошибки и параметры операции, а не только свободным текстом.

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

## 29. Справочники — canonical source

Этот раздел является единственным перечнем option values. Feature-разделы описывают место, порядок и условия выбора и ссылаются сюда.

### 29.1 Global Category Dictionary — OBSERVED

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

Используется в Discovery и retailer Location profile. Конкретный Passport event может иметь subset.

### 29.2 Passport Event Category Dictionary — OBSERVED

Для проверенного Making Waves event:

- Accessories
- Activewear/Yoga
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
- Womens RTW
- Womens Shoe

Beauty и Watches отсутствовали. Event category set должен быть versioned configuration, а не копией global dictionary в client code.

### 29.3 User Settings Dictionaries — OBSERVED

User Settings Languages:

- English;
- Español;
- Français;
- Deutsch;
- Italiano;
- 日本語;
- 中文(简体);
- Русский;
- 한국어.

Account/localization menu Languages:

- English;
- العربية;
- Deutsch;
- Español;
- Français;
- Italiano;
- 日本語;
- Português (Brasil);
- Русский;
- 中文(简体).

Два observed selectors не идентичны: Korean присутствовал в User Settings, а Arabic и Portuguese (Brazil) — в account localization menu. Улучшенная версия должна получать один enabled-locale registry с признаками surface/availability, а не поддерживать расходящиеся hard-coded списки.

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

- (choose one);
- none;
- 1.00;
- 5.00.

### 29.4 Price, location and demographics dictionaries — OBSERVED

Passport Min Price:

- None;
- $10;
- $50;
- $100;
- $250;
- $500.

Passport Max Price:

- None;
- $150;
- $250;
- $500;
- $750;
- $1000.

Connection Search Wholesale Minimum:

- empty;
- $10;
- $50;
- $100;
- $250;
- $500.

Connection Search Wholesale Maximum:

- empty;
- $150;
- $250;
- $500;
- $750;
- $1000+.

Location Type:

- Store;
- Office.

Location Minimum Price:

- $10;
- $50;
- $100;
- $250;
- $500;
- $1000;
- $2500;
- $5000;
- $10000;
- $15000.

Location Maximum Price:

- $150;
- $250;
- $500;
- $750;
- $1000;
- $2500;
- $5000;
- $10000;
- $15000;
- >$30000.

Age:

- 16-22;
- 22-25;
- 25-40;
- 40-65;
- All Ages.

Gender:

- Male;
- Female.

Described as, максимум 3:

- Sophisticated;
- Edgy;
- Casual;
- Feminine;
- Downtown;
- Active;
- Classic;
- Vintage;
- Bohemian.

Shops for, максимум 3:

- Professional Looks;
- Day to Night;
- Cocktail and Events;
- Casual Sportswear;
- Resort/Beach/Swimwear;
- Gifts.

### 29.5 Operational statuses and dimensions

Connection:

- NONE;
- INCOMING_PENDING;
- OUTGOING_PENDING;
- CONNECTED;
- DECLINED;
- CANCELLED;
- DISCONNECTED;
- ARCHIVED.

Order lifecycle:

- DRAFT;
- PENDING;
- APPROVED;
- SHIPPED;
- CANCELLED.

Order flags/dimensions:

- NOTES;
- WITH_QUANTITIES;
- WITHOUT_QUANTITIES;
- COMPLETE_SHIP;
- MINIMUMS_NOT_MET;
- IMPORTED;
- SYNCED/FAILED.

Content:

- Current;
- Archived;
- New;
- Viewed;
- All;
- Active;
- Unavailable;
- Published;
- Draft.

Job:

- QUEUED;
- RUNNING;
- COMPLETED;
- COMPLETED_WITH_WARNINGS;
- FAILED;
- CANCELLED;
- EXPIRED.

### 29.6 Pagination sizes — OBSERVED

Orders:

- 10;
- 15;
- 20;
- 30.

Connections:

- 60;
- 120;
- 240.

### 29.7 Media and file limits — OBSERVED

- profile/logo/store image: 10MB;
- store photos: до 30 за один выбор;
- message image: JPG/PNG, 4MB;
- order import: Excel/CSV, 4MB;
- storefront documents: limit не наблюдался.

Limits должны храниться в server configuration и дублироваться в client hints только для UX.
---

## 30. Entity relationship map

~~~text
User
└──< AccountMembership >── Account
    ├── AccountDiscoveryVisibility
    ├── RetailerProfile
    │   ├──< Location
    │   ├──< Person / Contact
    │   └──< MediaAsset
    ├──< Subscription / Entitlement
    ├──< Integration
    ├──< ActivityJob
    └──< MessageParticipant

RetailerAccount
└──< Connection >── BrandAccount
    ├── BrandProfile
    ├──< TeamMember
    ├──< StorefrontPage
    │   └──< PresentationSection
    │       └── Media/Product/Linesheet/Look/Document binding
    ├──< DocumentVersion
    ├──< Linesheet
    │   └──< Style
    │       └──< Colorway
    │           └──< Variant / SKU / Size
    ├──< PriceType
    ├──< TermsVersion
    ├──< Submission
    └──< PassportEventBrand >── PassportEvent

RetailerAccount
├──< Order >── BrandAccount
│   ├──< OrderLineSnapshot
│   │   └──< ColorLineSnapshot
│   │       └──< SizeQuantitySnapshot
│   ├── ShippingAddressSnapshot
│   ├── BillingAddressSnapshot
│   ├──< OrderContactSnapshot
│   ├── FinancialCalculation
│   ├── TermsAcceptanceSnapshot
│   ├──< OrderStatusHistory
│   ├──< Comment / Attachment
│   ├──< ExportMark
│   └── Payment / Fulfillment links
├──< Styleboard
├──< Favorite >── BrandAccount
├──< Assortment
└──< ReceivedLook >── Look
~~~

### 30.1 Профиль, discovery и membership

RetailerAccount содержит Locations, people, public profile, settings и visibility. Категории, demographics, price range и brands carried могут различаться по Location.

AccountMembership связывает User и Account с role/permissions. Primary account — пользовательское/организационное отношение; discoverability — отдельная account policy.

### 30.2 Brand presentation

BrandProfile хранит структурированные сведения. StorefrontPage и PresentationSection образуют versioned composition. Секция связывается с media, product, linesheet, look или document через typed binding, а не копированное произвольное поле.

PublishedPresentationVersion фиксирует page/section order, audience, publish window и content checksum. AnalyticsEvent ссылается на version/page/section/entity и не должен раскрывать данные другого tenant.

### 30.3 Catalog and access

Linesheet → Style → Colorway → Variant/SKU. PriceType и currency назначаются через connection/audience policy.

CatalogAccessGrant:

- retailer/account/group/territory/door;
- brand;
- resource type/id;
- price type;
- valid from/to;
- granted/revoked by/at;
- reason/version.

Connection и CatalogAccessGrant различаются: accepted connection не гарантирует доступ к каждому продукту.

### 30.4 Order aggregate

Order принадлежит одному retailer account и одному brand, использует один price type/currency context и может ссылаться на несколько linesheets.

OrderLineSnapshot фиксирует style metadata и цену; ColorLineSnapshot — colorway; SizeQuantitySnapshot — SKU/size/quantity. Они не удаляются при revoke/delete каталожной сущности.

OrderAddressSnapshot хранит sourceLocationId и исторические поля. OrderContactSnapshot сохраняет role/name/email. FinancialCalculation хранит precision/rounding/components/final. TermsAcceptanceSnapshot фиксирует представленную версию условий.

### 30.5 Lifecycle, collaboration and downstream

OrderStatusHistory — append-only transitions. Comments имеют visibility scope. ExportMark ставится после успешной генерации. Payment и Fulfillment связаны с Order, но имеют собственные statuses, audit и idempotency.

ImportJob/ExportJob содержат source/filter snapshot, artifact, checksum, row-level errors, actor, status и retention. Background failure не должен частично менять final order/export state.

## 31. End-to-end карта процессов

Этот раздел содержит только междоменные последовательности. Поля экранов не повторяются: они определены в соответствующих функциональных главах.

### 31.1 Главный поток Brand → Showroom → Retailer → Order → Fulfillment

| Этап | Brand/Seller | Platform | Retailer/Buyer | Состояние/артефакт |
|---|---|---|---|---|
| 1. Setup | создаёт profile, team, commercial settings | валидирует dictionaries/permissions | ведёт account/profile/locations | publish-ready parties |
| 2. Catalog | публикует linesheets, styles, SKUs, prices, delivery | версионирует catalog | — | sellable assortment |
| 3. Presentation | собирает showroom pages/sections/documents/CTA | preview, validation, audience, publish | — | PublishedPresentationVersion |
| 4. Discovery | получает inbound interest | индексирует с учётом discoverability | ищет/фильтрует/открывает | discovery visit |
| 5. Connection | принимает/инициирует request | создаёт request/thread, пересчитывает access | Accept/Connect/Not Now | accepted connection |
| 6. Access | назначает linesheets, prices, territory, rep | рассчитывает effective grants | видит разрешённую витрину | CatalogAccessGrant |
| 7. Engagement | обновляет контент | пишет section/product/document events | смотрит showroom, team, PDF, Looks | engagement trail |
| 8. Start Order | предоставляет commercial context | проверяет account/brand/price/access | выбирает brand/price/options | Draft/Notes Order |
| 9. Selection | — | валидирует SKU, price, delivery, quantity | выбирает style → color → size → qty | order line snapshots |
| 10. Review | видит collaboration/order | считает totals/minimums/terms | редактирует address/contact/products/details | validated draft |
| 11. Submit | получает submitted snapshot | idempotent transition и notifications | Submit for Approval | Pending |
| 12. Decision | approve/reject/request revision | audit/status history | отвечает на notes/revision | Approved/loop/cancel |
| 13. Documents | подтверждение/invoice/packing | generates artifacts/jobs | downloads/exports | versioned documents |
| 14. Payment | configures method/terms | payment intent/transactions | pays where enabled | payment state |
| 15. Fulfillment | ships partially/fully | tracks shipment state | monitors receipt | Shipped/exception |
| 16. Analytics | анализирует conversion | aggregates tenant-safe events | анализирует buys/orders | funnel and BI |

### 31.2 Retailer onboarding

1. authenticate;
2. choose accessible account;
3. set primary;
4. configure user preferences;
5. complete company profile;
6. add locations, categories and demographics;
7. set per-account discoverability;
8. submit Tax ID verification;
9. discover/connect first brand;
10. create first order;
11. optionally configure integration/subscription.

### 31.3 Discovery and connection exceptions

- retailer hidden from brand discovery, но сам может искать бренд согласно permission;
- incoming и outgoing request;
- accepted, declined, cancelled, expired;
- connected without product audience;
- restricted document/product;
- connection revoked while historical orders remain;
- account archived/read-only;
- brand storefront unpublished after prior engagement.

После любого connection/access change system инвалидирует permissions/cache, уведомляет стороны и пишет audit.

### 31.4 Showroom to order handoff

1. retailer открывает конкретную presentation version;
2. система пишет page/section impression;
3. product/linesheet/document action проверяет access;
4. Shop передаёт brand/source context;
5. Start an Order разрешает price type и compatible draft;
6. create/resume происходит только после явного действия;
7. Catalog сохраняет backlink в showroom;
8. selection пишет order lines;
9. возврат восстанавливает page/section, scroll и filters;
10. funnel связывает presentation version → selection → order без передачи PII в client analytics.

### 31.5 Draft/Notes to approval

1. создать или resume order;
2. добавить styles/colorways через Catalog, Add Products, Excel или visual transfer;
3. сохранить assortment lines даже при нулевых quantities;
4. заполнить color × size quantities;
5. различать hasSelections и hasQuantities;
6. заполнить/проверить Shipping/Billing;
7. назначить Buyer/Sales Rep;
8. заполнить order metadata;
9. пересчитать totals;
10. проверить minimums, access, delivery и SKU orderability;
11. зафиксировать terms version;
12. сохранить pending mutations;
13. сформировать immutable submission snapshot;
14. Submit for Approval;
15. отправить Pending notification;
16. brand approve, reject или request revision;
17. approved locks governed blocks;
18. перейти к documents/payment/fulfillment.

Duplicate branch: select one or more registry rows → Actions → Duplicate Orders → system immediately materializes brand-specific copy/copies in Cart → user reviews copied lines and cleared quantities/metadata → fills delivery/door/quantities/comments → Continue to Shipping & Billing либо Cancel Order. В observed legacy flow Cancel очищает active Cart, но сохраняет copy как Cancelled history. В улучшенной версии между command и materialization обязателен review/confirm step, потому что legacy action уже является mutation.

### 31.6 Access revocation after selection

1. order уже содержит line snapshots;
2. brand отзывает linesheet/product grant;
3. catalog больше не предлагает ресурс;
4. order сохраняет исторические строки и totals;
5. UI показывает revoked warning;
6. Add Products использует только оставшиеся grants;
7. изменение существующих quantities решает explicit policy;
8. submit может блокироваться или требовать brand resolution;
9. revoke и resolution сохраняются в audit.

### 31.7 Look → Styleboard → Order

1. brand publishes/shares Look;
2. retailer opens Look page and navigates PREV/NEXT;
3. selects product cards/hotspots; counter moves from 0 to N;
4. chooses Styleboard or Order;
5. Styleboard branch: existing board search либо new board name → Add or Add and go;
6. Order branch: existing compatible order search либо new order;
7. new order resolves price type and warehouse;
8. Add returns to Look, Add and go opens target;
9. target receives canonical style/colorway references plus Look/source attribution;
10. quantities распределяются по SKU в standard cart/order workspace;
11. стандартный validation/submit lifecycle продолжается без отдельной модели «look order».

### 31.8 Message collaboration

Inbox → filter/search → thread → read/unread/delete или Compose → recipients → subject/body/media → send → Sent → notifications. Message thread может быть связан с connection/order, но не заменяет structured comments/status history.

### 31.9 Import

Template → upload → secure storage → parse → normalize → reference resolution → validation → preview → confirm → background job → row-level report → atomic create/update → audit/notification → retention/deletion.

### 31.10 Export and document generation

Selection/filter snapshot → format/options → background generation → artifact checksum/size/version → temporary signed URL → download audit → export marks only after success → retry without duplicate side effects.

### 31.11 Account switch security sequence

Save/discard current edits → authorize target membership → set activeAccountId → invalidate account-scoped state → reload permissions/data/counts → verify no prior account entities in view → log switch. User-global language/date preferences may persist; business data and drafts may not.

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
21. Connected storefront способен показывать authoring placeholders Click to edit.
22. Connected status не объясняет отдельное linesheet-level restriction до открытия card.
23. Start an Order autocomplete может вернуть No results found для connected brands без reason code.
24. Style detail предлагает Select Currency с none selected, хотя рядом уже показаны несколько price-type blocks.
25. Download/Share/Comments используют разные drawer/modal patterns без единого action framework.
26. Legacy Linesheets имеет отдельные Submit на Brand, Delivery и Category, что создаёт неясный applied-filter state.
27. Initial loading может оставлять DOM почти пустым, а затем поздно добавлять крупные списки/products.
28. Empty Cart route перенаправляет на Dashboard без empty-state explanation.
29. Product/Color selection checkboxes в Add Products не имеют доступных имён.
30. Disabled color swatches не объясняют reason.
31. Note Order Edit может стать active, не показав quantity inputs.
32. Address editing restriction зависит от brand policy, но UI не показывает policy/source.
33. Products/Colors могут быть ненулевыми при Units = 0, что без пояснения выглядит как рассинхронизация.
34. Reset password вызывает blocking JavaScript alert без доступного объяснения и без подтверждённого результата отправки.
35. Create Styleboard показывает Saving … до обязательного выбора бренда; persistence до Assign не объяснена.
36. Styleboard toolbar использует icon-only controls без accessible names.
37. Subscription Purchase сразу переводит во внешний Stripe Checkout; JOOR-level review/confirmation отсутствует.
38. Submissions All при пустом наборе повторяет формулировку No new brands, предназначенную для New.
39. React-select поля профиля Location визуально подписаны, но их внутренние textboxes не имеют accessible names.
40. Passport, Submissions, Favorites и Styleboards могут несколько секунд показывать почти пустой DOM до появления содержимого.
41. Duplicate Orders мгновенно создаёт cart copy без review/confirmation и неожиданно уводит со списка; Cancel Order очищает cart, но оставляет новый Cancelled history record.
42. Account menu длиннее viewport; Language находится ниже scrollable списка accounts и плохо достижим без явного scroll affordance.
43. User Settings и account localization menu показывают разные language dictionaries.
44. Send to Assortment остаётся disabled без объяснения причины для выбранного Note Order.
45. Bulk Change Status показывает только допустимый следующий status, но не объясняет transition rules и mixed-selection exclusions.
46. Cart дублирует Cancel Order сверху и снизу, а manual-save warning не сообщает dirty/saved state конкретных блоков.
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
### 34.1 Детализированные направления улучшения

#### 34.1.1 Единообразие

- объединить legacy-таблицы и новый React-интерфейс общей дизайн-системой;
- одинаковые фильтры, пагинация и массовые действия;
- не использовать неочевидные icon-only buttons без aria-label;
- показывать явный autosave/save status;
- единый date/time/locale слой.

#### 34.1.2 Безопасность

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

#### 34.1.3 Производительность

- виртуализация длинных заказов;
- серверные агрегации totals;
- thumbnails и responsive images;
- lazy loading Look/Styleboard assets;
- background import/export;
- progress и retry;
- cursor pagination для activity/messages;
- кеширование справочников.

#### 34.1.4 Надёжность UX

- не показывать бесконечный Loading без ошибки и retry;
- объяснять, почему autocomplete бренда не возвращает результаты;
- disabled controls должны иметь причину;
- перед выгрузкой показывать точную область и объём;
- сохранять фильтры в URL;
- поддерживать drafts форм;
- предупреждать о несохранённых изменениях;
- различать «нет данных», «нет прав», «ошибка загрузки» и «нет результатов».

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

## 36. Coverage, evidence and remaining unknowns

### 36.1 Подтверждено в Retailer LITE

- product shell, Dashboard и active account;
- discovery grid, четыре sort modes, full filters, category dictionary и Requested state;
- connected, incoming и pending connection surfaces;
- Submissions New/Viewed/All и точные empty states;
- Favorites bare empty state;
- Passport landing, текущий event detail, Style Stories, точные category/min/max filters и storefront handoff;
- connected Storefront и public/disconnected brand profile;
- video, description, social, products, swatches, collections, gallery/press и PDF documents;
- multi-section showroom и restricted/placeholder states;
- Linesheets registry/detail, Print constructor и Start Excel Order;
- Style detail, price types, sizes, colorway и custom attributes;
- Looks Current/Archived registry, filters и viewer;
- Styleboards registry, Create/Cancel brand-association step, current bulk actions, canvas, price type и Add to order modal;
- gated Visual Assortment value proposition;
- Manage Orders, order review, Notes states, Add Products, document/share/comment/address/contact/financial blocks;
- Import Orders, Download Confirmation, Export Data и empty Activity Center;
- User Settings: все inline editors, language/date/landing/rounding dictionaries, notification rules, connect/privacy policies;
- Reset password alert behavior;
- retailer profile, verification modal, media/basic/people/location forms;
- Location Type, min/max price и Age dictionaries;
- account switcher и discoverability;
- Other Accounts search/card schema, full visibility modal semantics и localization menu;
- Shopify disconnected mapping;
- subscription plan limits/prices и Stripe Checkout fields;
- messages folders, account-scoped row/pagination states, composer field constraints and thread;
- populated Cart Orders quantity workspace, created through Duplicate Orders; active cart was cancelled, with a new Cancelled history record preserved;
- bulk Change Status modal and context-dependent Notes → Pending option;
- exact Look product selection and both Look → Styleboard/Order transfer modals.

### 36.2 Наблюдаемые ambiguity/broken states

- Storefront Shop может потерять выбранный brand;
- Start an Order autocomplete не объясняет No results;
- Product Edit в Notes не открыл usable quantity form;
- Order Details Edit оставался loading;
- Empty Cart redirect не имеет explanation;
- Reset password alert не сообщает в доступном DOM, что именно произошло;
- Styleboard /add показывает Saving до Assign;
- icon-only Styleboard controls недоступны по имени;
- Currency и Brands Carried remote autocomplete не показывают preload options;
- delayed loading сначала оставляет почти пустой content area.
- Duplicate Orders performs immediate cart mutation without preview;
- Send to Assortment was disabled without a visible reason;
- account menu and User Settings expose different language sets.

Это не следует считать универсальным поведением без повторяемого UAT.

### 36.3 Не подтверждено без brand-role, populated data или side effects

- реальный brand admin UI и showroom builder;
- populated Brand Submission card/detail;
- populated Favorites;
- archived Styleboard actions/restore;
- actual Share toolbar modal Styleboard;
- successful create/assign Styleboard;
- фактический quantity edit/save;
- создание нового order;
- successful completion of Look → Styleboard/Order transfer;
- actual Remove Style Colors With No Quantities and Send to Assortment;
- Submit for Approval и brand decision;
- shipment/fulfillment;
- JOORPay transaction;
- successful import/export/job artifacts;
- active Shopify sync;
- Passport registration submission;
- successful Stripe subscription, invoices, renew/cancel/failure;
- было ли отправлено recovery письмо после Reset password alert;
- paid Visual Assortment workspace;
- mobile/iPad apps;
- APIs/webhooks, SSO и platform moderation.

### 36.4 Требуемый controlled UAT

Нужны обезличенные test accounts: brand admin, connected retailer, disconnected retailer, multi-location retailer, restricted retailer и billing sandbox.

Минимальный набор:

1. publish/unpublish/version showroom;
2. create populated submission and favorite;
3. grant/revoke product/linesheet/document access;
4. create/resume/delete draft и проверить empty Cart;
5. enter/edit/clear color × size quantities;
6. test min/increment/ATS/delivery failures;
7. edit every order widget;
8. submit, revision, approve, cancel and ship;
9. change catalog/terms/address/contact and verify snapshots;
10. generate/import/export/download and inspect Activity jobs;
11. create/share/archive/restore/delete Styleboard;
12. payment success/failure/refund and subscription sandbox lifecycle;
13. Shopify install/OAuth/sync/retry;
14. reset password with test mailbox;
15. switch accounts and probe isolation;
16. accessibility/mobile/performance on delayed and large screens.

Документ остаётся reference map, target architecture и backlog source. Он не утверждает закрытую proprietary implementation и явно отделяет observation от design inference.

