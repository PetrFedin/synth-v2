# JOOR Retailer Cabinet — нормализованная карта продукта, процессов, экранов и данных

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
### 1.4 Статусы достоверности

- OBSERVED — непосредственно видимый экран, поле, кнопка или маршрут.
- OBSERVED DISABLED — элемент присутствует, но недоступен в текущем тарифе, статусе или роли.
- GATED — интерфейс показал paywall либо entitlement restriction.
- INFERRED — необходимая серверная сущность или процесс, выведенные из поведения интерфейса.
- NOT EXECUTED — действие найдено, но не запускалось из-за изменения бизнес-данных.
- BROKEN/AMBIGUOUS — маршрут, loading state или переход ведёт себя непоследовательно.

Персональные значения текущего аккаунта и коммерческие значения конкретных заказов в карте не фиксируются; документ описывает структуру данных и поведения.

## 2. Общая архитектура кабинета

### 2.1 Граница исследования и уровни достоверности

Карта разделяет три типа сведений:

| Маркер | Значение |
|---|---|
| OBSERVED | Элемент или состояние непосредственно открыто в текущем Retailer LITE cabinet |
| GATED | Элемент виден, но закрыт тарифом, ролью, connection, eligibility или настройкой бренда |
| INFERRED / TARGET | Требование к улучшенной копии, выведенное из наблюдаемого результата, но не подтверждённое исходным brand-admin UI |

В текущей сессии доступны только retailer accounts: один active/primary и тринадцать связанных аккаунтов. Brand-role среди переключаемых организаций нет. Поэтому buyer-side storefront, публичная карточка бренда, linesheets, товары и заказы подтверждены непосредственно, а экран создания этих материалов со стороны бренда описан как INFERRED / TARGET. Закрытые части нельзя выдавать за точную копию текущего интерфейса JOOR.

### 2.2 Product shell

Постоянная верхняя панель содержит:

| Элемент | Что показывает | Действие |
|---|---|---|
| LITE | Текущий plan/entitlement | Информирует об уровне доступа |
| JOOR logo | Product identity | Переход на Dashboard |
| Shop | Buying entry | Dropdown: Linesheets, Looks, Styleboards |
| Orders & Visual Assortment | Order operations | Dropdown: Orders, Visual Assortment |
| Explore Brands | Network/discovery | Connections, submissions, requests, favorites, discovery, Passport |
| Notification badge | Количество сетевых событий | Открывает Explore Brands |
| Get Shopify App | Интеграционный upsell | EXTERNAL: Shopify App Store |
| Active account | Организация и account ID | Account menu, settings и переключение account context |
| Messages badge | Непрочитанные/входящие | Inbox |
| Cart | Активные brand-specific drafts | Cart Orders |
| Help | Help Center/SSO | EXTERNAL |
| Logout | Завершение сессии | MUTATION: session termination |
| Support chat | Floating launcher | Support messenger |

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

### 3.1 Вложенные и служебные маршруты

| Область | Route | Назначение | Статус |
|---|---|---|---|
| Linesheet detail | /Collections/view/{linesheetId} | Товары linesheet | OBSERVED |
| Linesheet page AJAX | /collections/view_ajax/{linesheetId}/page:{n}/... | Следующая страница styles | OBSERVED |
| Linesheet print | /collections/print_select/{linesheetId} | Конструктор печати | OBSERVED |
| Style detail | /Styles/view/{styleId}/{linesheetId} | Карточка style | OBSERVED |
| Style navigation | /Styles/view/{styleId}/{linesheetId}/{priceTypeId}?fp=... | Карточка с контекстом price type | OBSERVED |
| All styles | /Collections/view?brandId={brandId}#s={styleId} | Все styles бренда | OBSERVED |
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
### 6.6 Карточки, фильтры и технические маршруты

Connected/Pending используют:

- Search by Name or ID;
- Submit;
- Advanced Search;
- Wholesale Price Range;
- Categories;
- Clear Filters;
- Search;
- Showing X–Y of Z results.

Wholesale Price Range:

- Minimum: пусто, $10, $50, $100, $250, $500;
- Maximum: пусто, $150, $250, $500, $750, $1000+.

Connected card:

- ссылка /designers/view/{brandId};
- состояние Connected;
- удаление связи /Matches/delete_by_account/{brandId}/1/CONNECTED-BRAND;
- pre-addressed message /Messages/send/{brandId}.

Incoming card:

- brand profile /Accounts/view/{brandId};
- View Profile;
- request date;
- Connect через /Matches/accept/{matchId};
- Not Now через /Matches/decline/{matchId}.

Pending card:

- состояние Pending;
- отмена через /Matches/delete_by_account/{brandId}/1/PENDING.

Все перечисленные legacy mutation URLs являются требованиями на замену безопасными POST/PATCH/DELETE-командами.

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

### 11.10 Print constructor

Route: /collections/print_select/{linesheetId}.

Layouts:

- 8 Styles;
- 12 Styles;
- 4 Styles (A);
- 4 Styles (B);
- 2 Styles;
- Landscape (8);
- Landscape (4);
- By Fabrication.

Print Options:

- Currency & Prices;
- Retail Price;
- Wholesale Price;
- Image Resolution: Normal или High;
- три Custom Fields;
- Fabrication, Silhouette, Materials, Heel Height, Measurements;
- Group By: Linesheet groups, Fabrication, Category, Division, Silhouette;
- Page Break by Group;
- Overflow Colors;
- Include Tag Name when grouped by tags;
- Print;
- Close.

Document job должен фиксировать linesheet/version, layout, price type, currency, custom fields, grouping, image resolution, page-break options, actor и generated artifact checksum.

### 11.11 Start Excel Order

Это export-fill-import workflow, а не обычная загрузка пользовательского файла:

1. открыть Start Excel Order;
2. увидеть текущий linesheet;
3. добавить другие linesheets того же brand;
4. искать по списку;
5. выбрать Price Type;
6. выбрать Include Images;
7. Export;
8. получить Excel quantity matrix;
9. заполнить units;
10. импортировать результат в Cart;
11. сопоставить строки с style/color/size;
12. показать validation/row errors.

Modal содержит пояснение Add units and import directly to the Cart, Export и Close. Template должен иметь immutable IDs помимо человекочитаемых codes, чтобы переименования не ломали импорт.

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

## 15. Cart / Draft / Notes Orders

Route: /orders/cart.

### 15.1 Архитектура корзины

Cart — контейнер нескольких независимых brand-specific orders, а не общий checkout:

~~~text
Retailer Cart
├── Draft/Notes for Brand A + Price Type A
├── Draft/Notes for Brand B + Price Type B
└── Draft/Notes for Brand A + другой Price Type/контекст
~~~

Brand tile переключает current order. Суммы, minimums, currency, terms и submit выполняются отдельно для каждого заказа.

### 15.2 Состав current order

- brand/order tile;
- Back to Catalog;
- brand, price type, currency и linesheet context;
- style/color/size rows;
- quantity editing;
- line/style totals;
- order totals;
- notes/comments;
- buyer/PO/delivery metadata, если включены;
- Shipping/Billing summary;
- Minimums not Met и другие validation groups;
- Save;
- delete style/color;
- delete order;
- Submit for Approval;
- empty cart state.

### 15.3 Редактирование

1. открыть brand tile;
2. изменить quantities;
3. пересчитать local preview;
4. серверно проверить SKU/access/price/delivery;
5. сохранить versioned mutation;
6. отобразить Saved или field-level error;
7. обновить totals/minimums;
8. сохранить dirty-state при переходе между tiles;
9. предупредить перед уходом только при реально несохранённых изменениях.

Наблюдаемый интерфейс предупреждает, что изменения требуют ручного Save и могут быть потеряны. Для улучшенной версии предпочтителен autosave с явными Saving/Saved/Error и журналом восстановления.

### 15.4 Minimums и исключения

Минимумы могут быть:

- order value;
- total units;
- style/color/SKU quantity;
- size run;
- increment/case pack;
- delivery window;
- door/territory;
- currency/price type.

Наблюдаемая логика допускает submit при unmet minimum с предупреждением, что бренд может отклонить заказ. Улучшенная версия должна различать blocking rule, overridable warning и informational notice; override сохраняет reason, actor и timestamp.

### 15.5 Удаление

- удаление style/color/order — mutation с confirmation;
- draft deletion должна быть recoverable/soft-delete;
- нулевые quantities можно очищать отдельной массовой операцией;
- approved/submitted order нельзя удалять как draft;
- удаление каталожного товара брендом не удаляет order snapshot.

### 15.6 Submit boundary

До Submit:

- все mutations сохранены;
- обязательные buyer/address/price/delivery поля валидны;
- terms version определена;
- totals рассчитаны сервером;
- warnings представлены пользователю;
- idempotency key создан.

Submit создаёт immutable submission snapshot и status transition. Order mutation, payment и fulfillment после этого должны иметь отдельные permissions и audit streams.

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

### 16.2 Registry actions and filters

Top actions:

- Actions;
- Start an Order.

Mass actions:

- Change Status;
- Duplicate Orders;
- Remove Style Colors With No Quantities;
- Send to Assortment.

Search and filter:

- Search;
- Your Selection;
- brand/connection context при входе из Dashboard View Orders;
- Clear All;
- Buyer;
- Date;
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
- page size 10/15/20/30.

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

Каждый transition должен иметь: from, to, actor role, timestamp, reason/comment, validation snapshot, idempotency key и source. Dropdown рядом с primary status action допускает альтернативы, но их фактический список не был надёжно загружен и остаётся UAT item.

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

Edit открывает modal с tabs Shipping Info / Billing Info.

Общие controls:

- Select Address * — saved address selector;
- Create New — переход в retailer profile;
- Clear All Fields;
- Cancel;
- Update Address, disabled пока нет валидного изменения;
- copy shipping → billing или billing → shipping.

Shipping fields:

| Поле | Режим |
|---|---|
| Store Name | read-only display |
| Address 1 | required |
| Address 2 | optional |
| City | required |
| Territory | optional |
| Postal Code | optional/locale-dependent |
| Country | required |
| Email | required в наблюдаемой форме |
| Phone | optional |
| Door | selector/derived |
| Shipping Method | selector |
| Use as Billing Address | checkbox |

Billing fields:

| Поле | Режим |
|---|---|
| Store Name | read-only display |
| Address 1 | required |
| Address 2 | optional |
| City | required |
| Territory | optional |
| Postal Code | optional/locale-dependent |
| Country | selectable |
| Phone | optional |
| VAT ID | editable |
| Billing Code | read-only; изменяется брендом |
| Payment Method | brand-provided/read-only в наблюдаемом заказе |
| Use as Shipping Address | checkbox |

Create New не создаёт адрес внутри modal: пользователь перенаправляется в profile. После возврата order editor должен восстановить unsaved context и обновить address options.

Order хранит OrderAddressSnapshot и sourceLocationId. Изменение profile address не переписывает submitted/approved history.

### 16.8 Products Summary

Aggregates:

- Total Units;
- Products = unique styles;
- Colors = ordered colorways.

Actions:

- Add Products;
- Edit;
- Load More Products или Load All Products;
- disabled tooltip/reason.

Product hierarchy:

- style image/name;
- wholesale and currency;
- style code/link;
- suggested retail;
- linesheet reference;
- color display name/internal code;
- sizes;
- quantity per size;
- Total Qty/Cost per color;
- Total Style Qty/Cost.

Long orders показывают диапазон X–Y of Z и загружают строки постепенно; totals должны вычисляться без загрузки всех media/cards.

#### Access revoked exception

Подтверждённый сценарий:

1. заказ содержит исторические products;
2. связанный linesheet больше не shared/visible retailer-у;
3. строки, quantities и totals остаются видимыми;
4. UI показывает предупреждение;
5. Add Products disabled, если нет других shared linesheets;
6. пользователь направляется связаться с брендом.

Правило данных: CatalogAccessGrant управляет новыми действиями, а OrderLineSnapshot защищает историю. Revoke не должен каскадно удалять строки, цены, media references или totals.

#### Edit permissions

- Draft/Notes: может быть доступен Edit;
- Approved: product mutation блокируется;
- access revoked: допустимость изменения существующей quantity должна определяться отдельной policy;
- SKU deleted/unavailable: показать reason и безопасный resolution;
- каждая save operation проверяет orderVersion и effective access.

В одном проверенном Notes-заказе Edit не открыл рабочую форму при отозванном linesheet; это фиксируется как AMBIGUOUS/BROKEN и требует UAT на тестовом заказе с действующим shared linesheet.

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
### 18.6 Просмотр Look

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
### 19.6 Карточка Styleboard

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
### 21.7 Invitation

Есть объяснение, что папка содержит сообщения, связанные с connection invitations.

Действия:

- Delete;
- Mark as Read;
- Mark as Unread.

### 21.8 Sent

Действия:

- Compose Mail;
- Mark as Read;
- Mark as Unread.

### 21.9 Trash

Действия:

- Compose Mail;
- Move to Inbox;
- Mark as Read;
- Mark as Unread.

### 21.10 Thread

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

### 21.11 Точная форма Compose a Message

- Close;
- Send to all my connections;
- Select Connections;
- Recipient(s) с autocomplete;
- Subject;
- Message;
- Attach an image, optional;
- только .jpg или .png;
- максимум 4 MB;
- Send.

Pre-addressed маршрут /Messages/send/{brandId} использует тот же composer с заранее заданным получателем.

## 22. User Settings

Route: /accounts/settings. Страница разделена на Manage My Account и Retailer Account Information. Каждый блок раскрывается inline, имеет X и Save Changes и сохраняется независимо.

### 22.1 Credentials

- login Email отображается read-only;
- Password masked;
- Reset password запускает отдельный credential flow.

### 22.2 User Profile

Поля и действия:

- Full Name;
- Job Title;
- Phone;
- Upload Photo через /accounts/update_photo;
- Display my information on my company profile;
- ссылка на /ra/profile/{accountId};
- X;
- Save Changes.

Публичность пользователя отделена от видимости retailer account: сотрудник может не показываться в People, даже если company profile доступен в поиске.

### 22.3 Languages

Два независимых поля:

- Set default language as — язык интерфейса;
- Send Emails In — язык e-mail.

Справочник:

- English;
- Español;
- Français;
- Deutsch;
- Italiano;
- 日本語;
- 中文(简体);
- Русский;
- 한국어.

### 22.4 Email Settings

Для каждого параметра отдельные radio Yes/No:

- пересылать сообщения JOOR inbox на e-mail;
- присылать connection request e-mails;
- еженедельно присылать новости от connections;
- присылать industry updates and news;
- присылать заказы, назначенные пользователю на web;
- присылать заказы, назначенные пользователю на iPad.

Web и iPad order assignment notifications хранятся отдельно.

### 22.5 Default Connection Request Message

- отдельный шаблон текста;
- используется при исходящем connection request;
- X;
- Save Changes.

Нужны account default, optional user override и snapshot фактически отправленного сообщения.

### 22.6 Date Format

- mm/dd/yyyy;
- dd/mm/yyyy;
- yyyy/mm/dd.

Настройка распространяется на web и iPad, но сервер должен хранить даты в нормализованном формате.

### 22.7 Landing Page

- пустое/default;
- Home;
- My Connections;
- Orders;
- Profile.

### 22.8 Round Retail Pricing

- choose one;
- none;
- 1.00;
- 5.00.

Это display/calculation preference для retail price; исходная цена и применённое правило округления должны храниться раздельно.

### 22.9 Retailer Account Information

Profile Name:

- business/account name;
- не равно имени пользователя.

Account Email:

- общий контакт аккаунта;
- не равно login e-mail.

POS System:

- POS System;
- Version, if known.

Buyer Name:

- значение покупателя по умолчанию;
- заказ должен хранить snapshot.

Connection Permission:

- Any brand or retailer can connect with me;
- Yes;
- No.

Privacy:

- Show in Search;
- Hide from Search.

### 22.10 Модель сохранения

- independent settings endpoints;
- field-level validation;
- explicit save для identity/privacy;
- optimistic UI только для безопасных preferences;
- server version/ETag;
- audit для privacy, connection permission и identity;
- success/error status;
- источник изменения web/iPad/API;
- changed_by и changed_at.

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
### 23.10 Location

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
- Other Accounts;
- Language;
- Help Center;
- Log Out.

В проверенной membership доступен текущий retailer account и ещё 13 retailer accounts. Некоторые записи показывают Created by {brand}, created date, connection preview, archived state или read-only relationship. Brand-role в списке отсутствует.

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
### 25.6 Точная карта JOOR → Shopify

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

Disconnected state:

- Shopify provider selector;
- You are not connected;
- Install on Shopify;
- Automatic Sync checked, но disabled;
- Expand All disabled;
- все field preferences checked, но disabled;
- Sync Information: Not synced yet.

Automation обещает синхронизировать approved orders от всех connected accounts и затем разрешить account-level overrides.

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
### 26.1 Наблюдаемые лимиты тарифов

Visual Assortment Standard:

- 2 users;
- 1 door;
- 1,000 products;
- 2 years data storage;
- monthly и yearly purchase actions.

Visual Assortment Premium:

- 5 users;
- 5 doors;
- 3,000 products;
- 3 years data storage;
- monthly и yearly purchase actions.

Карточка тарифа содержит Available For Purchase, описание, USD price, billing period, Purchase и внешнюю ссылку на описание функции. Цены являются временно изменяемыми данными и в реализации должны приходить из billing catalog.

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
2. выбрать products and quantities;
3. заполнить/проверить Shipping/Billing;
4. назначить Buyer/Sales Rep;
5. заполнить order metadata;
6. пересчитать totals;
7. проверить minimums, access, delivery и SKU orderability;
8. зафиксировать terms version;
9. сохранить все mutations;
10. сформировать immutable submission snapshot;
11. Submit for Approval;
12. Pending notification;
13. brand approve, reject или request revision;
14. approved locks governed blocks;
15. перейти к documents/payment/fulfillment.

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
2. retailer opens hotspots;
3. selection идёт в Styleboard или Order;
4. Styleboard сохраняет visual composition и price context;
5. Add to Order создаёт/дополняет compatible draft;
6. quantities распределяются по SKU;
7. стандартный validation/submit lifecycle продолжается без отдельной копии заказа.

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
- discovery, connection surfaces, submissions, favorites и Passport;
- connected Storefront и public/disconnected brand profile;
- video, description, social, products, swatches, collections, gallery/press и PDF documents;
- опубликованный multi-section showroom: iframe video, rich text, повторяющиеся collection chapters, galleries, card covers и Preview Linesheet;
- placeholder/restricted connected showroom и linesheet overlays;
- audience-restricted product state;
- Linesheets registry с Brand/Delivery/Category filters, sort, cards и pagination;
- Linesheet detail с Minimum Amount, price types, Print, Start Excel Order, View counts и 14 Group By values;
- Style detail с navigation, multiple price types, materials, origin, sizes/fit, colorway и custom classification attributes;
- Looks, Styleboards и gated Visual Assortment;
- Manage Orders registry, filters, mass actions, import/export/download entry points;
- Approved Order Overview/Pay;
- Share Order modal и advanced options;
- Comments drawer/input;
- Download drawer с PDF/Excel/Linesheet-to-Size и advanced options;
- Note Order status combo с Cancel Order;
- Notes Order с quantities;
- editable Shipping/Billing modal и точные поля;
- inline Contacts edit;
- Order Details read fields и loading edit state;
- Products Summary до color × size quantities;
- historical products after linesheet access revocation;
- financial summary and rounding warning;
- Legal / Terms & Conditions;
- retailer profile, locations, categories, demographics, people и settings;
- account switcher с 14 retailer accounts;
- Accounts Visibility Settings и задержка применения до 30 минут;
- messages, integration/subscription/activity entry points.

### 36.2 Наблюдаемые ambiguity/broken states

- Storefront Shop может не сохранить предвыбранный brand в Start an Order;
- global Start an Order autocomplete возвращал No results found для проверенных connected brands без объяснения eligibility;
- Product Edit в Notes order с отозванным linesheet не открыл usable form;
- Order Details Edit остался в loading state;
- некоторые storefront presentation blocks содержат placeholders/неполные документы;
- gated features показываются рядом с доступными действиями без полного capability explanation.

Это не следует автоматически интерпретировать как универсальное поведение: нужны повторяемые UAT cases.

### 36.3 Не подтверждено без brand-role или side effects

- реальный brand admin UI;
- showroom builder controls;
- publishing linesheet/style/price/document;
- product quantity edit на действующем shared linesheet;
- создание нового draft через Start an Order;
- Submit for Approval;
- brand-side approve/reject/revision;
- shipment/fulfillment;
- реальная JOOR Pay form;
- successful import/export job artifacts;
- paid Visual Assortment;
- active Shopify sync;
- Passport registration;
- mobile/iPad apps;
- APIs/webhooks, SSO и platform moderation.

### 36.4 Требуемый controlled UAT

Нужны обезличенные test accounts: brand admin, connected retailer, disconnected retailer, multi-location retailer и restricted retailer.

Минимальный набор:

1. publish/unpublish/version showroom;
2. grant/revoke product/linesheet/document access;
3. create/resume/delete draft;
4. enter/edit/clear color × size quantities;
5. test min/increment/ATS/delivery failures;
6. edit every order widget;
7. submit, revision, approve, cancel and ship;
8. change catalog after submission and verify snapshots;
9. change terms/address/contact and verify history;
10. generate/download/export documents;
11. payment success/failure/refund;
12. switch accounts and probe isolation;
13. accessibility/mobile/performance on large presentations and orders.

Документ является reference map, target architecture и backlog source. Он не утверждает закрытую proprietary implementation и явно отделяет observation от design inference.

