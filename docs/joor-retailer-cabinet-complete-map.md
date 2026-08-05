# JOOR Retailer Cabinet → Syntha B2B Fashion Platform

Статус: рабочая продуктовая спецификация и master map.  
Версия: 3.4, 5 августа 2026 года.  
Назначение: определить, как Syntha должна превзойти JOOR как B2B buying platform и одновременно закрыть PLM, sourcing, costing, production, quality, logistics, wholesale и analytics.

> Документ объединяет результаты read-only аудита JOOR Retailer / LITE и целевую архитектуру Syntha. Наблюдаемое в JOOR не следует считать подтверждением его закрытой внутренней реализации. Все функции, которых не было в доступном аккаунте, помечаются как TARGET или UAT.

---

## 1. Принцип продукта

JOOR хорошо решает отдельные задачи wholesale discovery, showroom, linesheets, ordering и retailer-brand connections. Syntha должна быть не копией JOOR, а сквозной операционной системой fashion-бизнеса:

```text
Trend & Range Planning
→ Product Development / PLM
→ Materials / BOM / Costing
→ Supplier Sourcing / RFQ
→ Samples / Fit / Testing
→ Buy Planning / OTB
→ Wholesale Showroom / Linesheet
→ Retailer Selection / Order
→ Production / QC / Logistics
→ Delivery / Sell-through / Reorder
→ Supplier, Product and Commercial Analytics
```

Ключевое отличие: одна сущность модели должна проходить весь жизненный цикл без ручного переноса данных между Excel, PLM, почтой, мессенджерами, ERP и B2B-порталом.

---

## 2. Evidence markers

| Marker | Значение |
|---|---|
| OBSERVED | Экран, поле, действие или маршрут непосредственно открыт в JOOR |
| OBSERVED DISABLED | Элемент виден, но недоступен |
| GATED | Доступ ограничен тарифом, ролью, connection или eligibility |
| NOT EXECUTED | Финальная операция не выполнялась |
| INFERRED | Серверная сущность или правило выведены из поведения интерфейса |
| TARGET | Требование к Syntha |
| UAT | Требуется тестовый доступ и controlled data |
| DECISION | Принятое продуктовое решение Syntha |

---

## 3. Целевые роли

### 3.1 Retailer / Buyer

- поиск, сравнение и подключение брендов;
- просмотр showrooms, linesheets, looks и styleboards;
- работа с ассортиментом, OTB и лимитами;
- ввод quantities по цветам и размерам;
- draft, review, approval и отправка заказа;
- контроль подтверждений, изменений, отгрузок и документов;
- анализ закупки, маржи, sell-through и reorder;
- управление несколькими юридическими лицами, магазинами и дверями.

### 3.2 Brand / Seller

- ведение профиля, команды, условий и географии продаж;
- публикация коллекций, linesheets, цен, delivery windows и availability;
- управление buyer access, territories и retailer groups;
- получение и обработка заказов;
- подтверждение quantities, цен и сроков;
- создание order amendments, proforma, invoices и shipment notices;
- аналитика showroom → style → cart → order → shipment.

### 3.3 Product / PLM team

- линейный и ассортиментный план;
- карточки моделей и цветомоделей;
- BOM, BOL, measurement chart, tech pack;
- материалы, фурнитура, упаковка, тесты;
- образцы, комментарии, версии и approvals;
- расчет плановой, котировочной и фактической себестоимости.

### 3.4 Sourcing / Production

- RFQ и сравнение фабрик;
- allocation моделей;
- производственный календарь;
- материалы бренда и материалы фабрики;
- WIP, milestones, capacity и delays;
- QC, inspections, defect tracking и corrective actions.

### 3.5 Finance / Commercial control

- валюты, налоги, пошлины, комиссии и логистика;
- price waterfall EXW/FOB/CIF/Landed/Wholesale/RRP;
- margin guardrails;
- 3-way match PO–GRN–Invoice;
- payment schedule, deposits, balances и aging;
- план-факт себестоимости и supplier claims.

### 3.6 Administrator

- организации, memberships, roles и permissions;
- account switching;
- data isolation;
- dictionaries, templates и approval policies;
- audit log, integrations, retention и entitlements.

---

## 4. Информационная архитектура Syntha

```text
Dashboard
├── Discover
│   ├── Brands
│   ├── Collections
│   ├── Events / Markets
│   ├── Submissions
│   └── Favorites
├── Connections
│   ├── Incoming
│   ├── Sent / Pending
│   ├── Connected
│   └── Commercial Access
├── Planning
│   ├── Season Plan
│   ├── Line Plan
│   ├── Assortment Matrix
│   ├── OTB
│   └── Calendar
├── Product / PLM
│   ├── Styles
│   ├── Colorways
│   ├── Materials
│   ├── BOM / BOL
│   ├── Measurement Charts
│   ├── Samples
│   ├── Tests
│   └── Tech Packs
├── Sourcing
│   ├── Suppliers
│   ├── RFQ
│   ├── Quotations
│   ├── Allocation
│   └── Supplier Scorecards
├── Buying
│   ├── Showrooms
│   ├── Linesheets
│   ├── Catalog
│   ├── Looks
│   ├── Styleboards
│   ├── Selection Workspace
│   ├── Cart / Draft Orders
│   └── Orders
├── Production
│   ├── Production Orders
│   ├── Material Commitments
│   ├── WIP Calendar
│   ├── Capacity
│   └── Delays / Exceptions
├── Quality
│   ├── Inspections
│   ├── Defects
│   ├── Claims
│   └── Corrective Actions
├── Logistics
│   ├── Shipments
│   ├── Packing Lists
│   ├── Documents
│   ├── Customs
│   └── Delivery Tracking
├── Finance
│   ├── Costing
│   ├── Price Waterfall
│   ├── Invoices
│   ├── Payments
│   └── Reconciliation
├── Analytics
├── Inbox
├── Integrations
└── Account & Administration
```

---

## 5. Наблюдаемая JOOR-логика, которую сохраняем

OBSERVED в Retailer / LITE:

- discovery и Find New Brands;
- connection lifecycle;
- incoming и pending requests;
- Brand Submissions;
- Passport / event discovery;
- storefront и profile;
- linesheets и product catalog;
- style detail, colorways, sizes и quantities;
- Looks и Styleboards;
- cart и retailer orders;
- messages;
- company profile, locations, people и account switching;
- Shopify entry, subscription и gated Visual Assortment.

Сохраняем сильную сторону JOOR: простой путь buyer от бренда к товару и заказу. Устраняем слабость: разрыв между wholesale интерфейсом и реальным производственным, финансовым и аналитическим контуром.

---

## 6. Dashboard

### 6.1 Retailer dashboard

Обязательные блоки:

- Open to Buy: budget, committed, ordered, shipped, received, available;
- draft orders requiring action;
- orders awaiting brand confirmation;
- changes in prices, delivery windows или availability;
- upcoming market appointments;
- brands with new collections;
- supplier/brand messages;
- delayed shipments;
- margin and intake margin alerts;
- sell-through and reorder opportunities;
- recent team activity.

### 6.2 Brand dashboard

- showroom views;
- active buyers and engaged retailers;
- styles with highest interest;
- carts not submitted;
- orders awaiting response;
- order value by status;
- available-to-sell by style/color/size;
- delivery risks;
- production and quality exceptions;
- overdue receivables.

### 6.3 Dashboard rules

- widgets role-based;
- drill-down from every KPI;
- filters by season, market, currency, account, door, category and date;
- no vanity metrics without operational action;
- every alert has owner, due date and resolution state.

---

## 7. Discovery and brand network

### 7.1 Search and filters

- brand name and ID;
- categories and subcategories;
- gender / audience;
- wholesale price range;
- target retail price range;
- country of origin;
- shipping countries;
- minimum order value;
- minimum order quantity;
- delivery window;
- available-now / preorder;
- sustainability and certification attributes;
- marketplace/event participation;
- payment methods;
- connected / pending / not connected;
- sales performance for already connected brands.

### 7.2 Brand card

- logo and cover;
- short positioning;
- categories;
- price band;
- origin;
- ship-from;
- delivery windows;
- MOQ/MOV;
- connection status;
- saved/favorite status;
- latest collection;
- response SLA;
- retailer-specific commercial access;
- actions: View, Connect, Message, Add to comparison.

### 7.3 Brand comparison

TARGET: side-by-side comparison of up to 5 brands across:

- pricing;
- markup potential;
- MOQ/MOV;
- lead time;
- delivery reliability;
- return/cancellation rules;
- payment terms;
- historical sell-through;
- margin;
- stock risk;
- assortment overlap.

---

## 8. Connection lifecycle

```text
NONE
├── Retailer requests → OUTGOING_PENDING
│   ├── Brand accepts → CONNECTED
│   ├── Brand declines → DECLINED
│   └── Retailer cancels → CANCELLED
└── Brand requests → INCOMING_PENDING
    ├── Retailer accepts → CONNECTED
    └── Retailer declines / archives → DECLINED / ARCHIVED

CONNECTED
├── commercial access granted
├── showroom and linesheets visible
├── order/message permissions active
├── terms version assigned
└── disconnect → DISCONNECTED, history preserved
```

Требования:

- только POST/PATCH/DELETE mutations;
- confirmation для destructive actions;
- idempotency key;
- audit log;
- reason code;
- optional undo grace period;
- сохранение orders, messages и documents после disconnect;
- отдельное управление доступом к категориям, странам, price lists и collections.

---

## 9. Brand profile and commercial passport

### 9.1 Identity

- brand name, legal entity, logos, cover media;
- description and positioning;
- website and social channels;
- country of origin;
- headquarters and ship-from locations;
- categories, audience and style tags;
- contacts by role.

### 9.2 Commercial terms

- currencies;
- price lists;
- incoterms;
- payment terms;
- deposits;
- credit limit;
- MOQ by style/color/order;
- MOV by currency;
- cancellation windows;
- returns and claims policy;
- shipping methods;
- tax handling;
- territory restrictions;
- exclusivity rules;
- delivery windows;
- terms effective date and version.

### 9.3 Trust and performance

- response time;
- order acceptance rate;
- on-time delivery rate;
- fill rate;
- defect rate;
- claims rate;
- document completeness;
- verified certificates;
- buyer ratings with moderation.

---

## 10. Showroom, linesheet and catalog

### 10.1 Hierarchy

```text
Season
→ Collection
→ Delivery / Drop
→ Linesheet
→ Style
→ Colorway
→ SKU / Size
```

### 10.2 Showroom

- cover, story and campaign media;
- chapters / rooms;
- shoppable looks;
- hotspot navigation;
- attached linesheets;
- buyer-specific visibility;
- publish/unpublish and versioning;
- preview as retailer;
- analytics by slide, look and style.

### 10.3 Linesheet

Fields:

- style code and name;
- images;
- category;
- composition;
- colors;
- size range;
- wholesale and suggested retail;
- delivery window;
- country of origin;
- MOQ/MOV;
- availability;
- carry-over / newness;
- notes;
- documents;
- order quantity matrix.

Actions:

- filter, sort, search;
- grid/list/compact matrix;
- add all or selected to order;
- duplicate selection;
- export PDF/XLSX/CSV;
- print with configurable fields;
- share versioned link;
- compare styles;
- hide unavailable SKUs.

### 10.4 Product detail

- media gallery, video and 3D;
- style and colorway data;
- full size matrix;
- wholesale, retail and markup;
- cost and margin for authorized internal users;
- materials and care;
- dimensions and fit;
- delivery and availability;
- pack ratio / prepack;
- suggested assortment role;
- related looks;
- previous season performance;
- order history;
- notes, attachments and comments.

---

## 11. PLM and product development

### 11.1 Line plan

- year, season, collection, drop;
- category / subcategory;
- gender / audience;
- planned style count;
- planned color count;
- planned SKU count;
- target intake margin;
- target wholesale and retail price;
- target cost;
- planned units;
- launch date;
- development calendar;
- responsible team;
- status and readiness.

### 11.2 Style master

- immutable internal style ID;
- brand style code;
- model name;
- carry-over lineage;
- season and drop;
- category tree;
- gender / age / audience;
- silhouette, fit and construction;
- sketches, references, pattern files and attachments;
- lifecycle status;
- owner and approvers;
- linked colorways, BOM, BOL, measurements, samples, tests and tech packs.

### 11.3 Color management

- color family;
- commercial name;
- internal code;
- supplier code;
- HEX/RGB/LAB;
- Pantone reference where licensed;
- physical swatch status;
- approval state;
- linkage to material, style and SKU;
- visual consistency across BOM and documents.

### 11.4 Measurement chart

- measurement points dictionary;
- base size;
- tolerance minus/plus;
- grade rules;
- automatic calculation;
- manual override with reason;
- versions;
- sample actuals;
- deviation highlighting;
- import/export;
- approval history.

### 11.5 Tech pack

- factory-specific template;
- version and effective date;
- sketches and callouts;
- BOM;
- BOL / operations;
- measurement chart;
- colorways;
- packaging;
- labels and care;
- test requirements;
- sample comments;
- approvals;
- export PDF/ZIP;
- immutable snapshot attached to order.

---

## 12. Materials, BOM and consumption

### 12.1 Material library

- material ID and supplier code;
- type/subtype;
- image and swatch;
- composition;
- weight, width, gauge, density;
- color;
- finish;
- supplier/manufacturer;
- country of origin;
- UOM;
- MOQ;
- lead time;
- unit price and currency;
- price validity;
- certificates;
- care instructions;
- test history;
- stock ownership: brand/factory/third party;
- available, reserved, in transit and consumed quantity.

### 12.2 BOM row

- component type;
- material;
- placement;
- main/lining/trim/packaging;
- applicable colorways;
- applicable sizes;
- consumption;
- UOM;
- wastage;
- efficiency/yield;
- unit cost;
- currency and FX date;
- landed material cost;
- supplier;
- source ownership;
- substitute materials;
- approval state.

### 12.3 Consumption formula

```text
Net Consumption
= Base Consumption × Size Factor × Color/Construction Factor

Gross Consumption
= Net Consumption / Cutting Efficiency × (1 + Waste %)

Material Cost per Garment
= Gross Consumption × Material Unit Cost
  + Material Freight per Unit
  + Material Duty/Tax per Unit
```

Все ручные корректировки должны иметь автора, дату, причину и предыдущую величину.

---

## 13. BOL, SMV and labor cost

- operation code;
- operation name;
- sequence;
- department;
- machine/equipment;
- skill grade;
- stitches or cycle parameters;
- base time;
- allowance;
- SMV;
- factory-specific rate;
- labor cost;
- overhead allocation;
- applicable style/color/size;
- standard version;
- effective date.

```text
Labor Cost per Garment
= Σ(Operation SMV × Cost per Minute by Factory)

Factory Conversion Cost
= Labor Cost
  + Factory Overhead
  + Finishing
  + Packing Labor
  + Factory Margin
```

---

## 14. Costing and price waterfall

### 14.1 Cost versions

- Target Cost;
- Initial Estimate;
- Supplier Quotation;
- Negotiated Cost;
- PO Cost;
- Actual Production Cost;
- Actual Landed Cost;
- Final Reconciled Cost.

### 14.2 Cost structure

- fabrics;
- lining;
- trims;
- labels;
- packaging;
- direct labor;
- subcontracting;
- tests;
- sample amortization;
- tooling/setup;
- factory overhead;
- factory margin;
- inspection;
- origin logistics;
- freight;
- insurance;
- customs;
- duty;
- taxes;
- broker fees;
- payment fees;
- financing cost;
- warehouse intake;
- commissions;
- reserve for claims;
- FX variance.

### 14.3 Price waterfall

```text
EXW
+ Origin Charges
= FOB
+ Freight + Insurance
= CIF
+ Duty + Customs + Broker
= Landed Cost
+ Brand Operating Allocation
= Full Product Cost

Wholesale Price
= Full Product Cost / (1 - Target Brand Gross Margin %)

Retail Price ex VAT
= Wholesale Price / (1 - Target Retail Intake Margin %)

Retail Price inc VAT
= Retail Price ex VAT × (1 + VAT %)
```

### 14.4 Guardrails

- alert when quoted cost > target;
- alert when wholesale markup below threshold;
- alert when retail intake margin below target;
- scenario comparison by factory, currency, incoterm and volume;
- sensitivity to FX, duty, freight and markdown;
- approval required for override.

---

## 15. Supplier sourcing, RFQ and allocation

### 15.1 Supplier master

- legal entities and factories;
- countries and addresses;
- capabilities;
- categories;
- machines and technologies;
- certifications;
- capacity by month;
- MOQ;
- lead time;
- currencies;
- incoterms;
- payment terms;
- contact roles;
- compliance status;
- quality and delivery KPIs;
- documents and expiry dates.

### 15.2 RFQ

- selected styles and versions;
- expected quantity scenarios;
- requested incoterm;
- requested delivery;
- BOM ownership;
- materials supplied by brand/factory;
- required tests;
- requested cost breakdown;
- response deadline;
- clarification thread;
- versioned supplier response.

### 15.3 Quotation comparison

Compare by:

- unit cost;
- cost breakdown completeness;
- MOQ;
- material assumptions;
- SMV;
- capacity;
- sample fee;
- lead time;
- payment terms;
- freight implication;
- duty implication;
- quality history;
- on-time delivery;
- total landed cost;
- risk score.

### 15.4 Allocation

Allocation may be by style, colorway, SKU, quantity, country or delivery. System must prevent over-allocation above supplier capacity and preserve backup factory scenarios.

---

## 16. Samples, fit and approvals

Sample types:

- proto;
- development;
- fit sample;
- size set;
- salesman sample;
- photo sample;
- pre-production sample / PPS;
- TOP sample;
- shipment sample.

For each sample:

- request date;
- due date;
- sent date;
- received date;
- factory;
- sample version;
- linked tech pack version;
- measurements requested/actual;
- fit evaluation;
- construction evaluation;
- material evaluation;
- lab tests;
- comments with annotations;
- decision: approve / approve with comments / revise / reject / cancel;
- owner and approvers;
- next action and deadline.

Annotations must support pin-to-image, drawing, numbered comments, attachments and side-by-side version comparison.

---

## 17. Buying workspace and Visual Assortment

JOOR Visual Assortment was GATED in audited access. Syntha TARGET:

- freeform canvas and structured assortment grid;
- drag-and-drop styles, looks and placeholders;
- grouping by category, delivery, color story, brand and store;
- planned vs selected units;
- planned vs selected value;
- OTB consumption;
- SKU count and option count;
- color balance;
- price ladder;
- size curve;
- margin and GMROI forecast;
- duplicate/overlap detection;
- range gaps;
- scenario save and compare;
- approval workflow;
- conversion into one or multiple draft orders.

---

## 18. Cart and order creation

### 18.1 Order scope

An order is always tied to:

- buyer organization;
- retailer account;
- door/location or allocation group;
- brand/seller;
- season/collection;
- currency and price list;
- commercial terms version;
- billing and shipping address;
- responsible buyer;
- delivery window.

### 18.2 Quantity entry

- style/color/size matrix;
- keyboard navigation;
- paste from Excel;
- pack ratio;
- bulk fill;
- copy across colors;
- size curve suggestion;
- minimum validation;
- availability validation;
- total units/value recalculation in real time.

### 18.3 Order statuses

```text
DRAFT
→ INTERNAL_REVIEW
→ APPROVED_INTERNAL
→ SUBMITTED_TO_BRAND
→ BRAND_REVIEW
→ CONFIRMED
→ PARTIALLY_CONFIRMED
→ CHANGE_REQUESTED
→ IN_PRODUCTION
→ PARTIALLY_SHIPPED
→ SHIPPED
→ PARTIALLY_RECEIVED
→ RECEIVED
→ CLOSED

Side states:
CANCELLED / REJECTED / ON_HOLD / DISPUTED
```

### 18.4 Order validation

- connection active;
- price list valid;
- style/SKU visible;
- order and line MOQ;
- MOV;
- delivery window;
- currency consistency;
- tax data;
- addresses;
- payment terms;
- duplicate order warning;
- budget/OTB availability;
- margin guardrail;
- required approvals.

---

## 19. Order collaboration and amendments

Every change after submission must create an amendment, not silently overwrite the order.

Amendment captures:

- previous and new quantity;
- previous and new price;
- previous and new delivery;
- reason;
- initiator;
- timestamp;
- affected lines;
- financial impact;
- approval state;
- counterparty acceptance.

The interface must show original order, current agreed order and pending amendment separately.

---

## 20. Production management

### 20.1 Production order

- linked sales/wholesale order lines;
- factory;
- style/color/SKU quantities;
- planned start/end;
- material readiness;
- capacity reservation;
- tech pack snapshot;
- approved sample;
- production milestones;
- WIP status;
- inspection plan;
- shipment plan.

### 20.2 Milestones

- PO issued;
- deposit paid;
- materials ordered;
- materials received;
- cutting;
- sewing;
- finishing;
- packing;
- inline inspection;
- final inspection;
- cargo ready;
- departed;
- delivered.

### 20.3 Exception control

- late milestone;
- material shortage;
- capacity conflict;
- quantity variance;
- cost variance;
- quality hold;
- document missing;
- payment hold;
- logistics delay.

Each exception has severity, owner, root cause, mitigation, due date and financial impact.

---

## 21. Quality management

### 21.1 Inspection

- inspection type;
- order/production batch;
- SKU and lot;
- inspection date/location;
- inspector;
- sampling plan;
- AQL level;
- inspected quantity;
- critical/major/minor defects;
- defect rate;
- pass/conditional pass/fail;
- attachments and report;
- corrective action.

### 21.2 Defect master

- defect code;
- category;
- severity;
- location on garment;
- description;
- image;
- probable cause;
- responsible party;
- cost of defect;
- recurrence indicator.

### 21.3 Claims

- claim against factory, material supplier, carrier or other party;
- affected units;
- financial amount;
- evidence;
- negotiation status;
- credit note/replacement/rework outcome;
- closure and recovery amount.

---

## 22. Logistics and shipment

Shipment data:

- shipment ID;
- related orders;
- origin/destination;
- mode;
- carrier/forwarder;
- incoterm;
- cartons/pallets/units;
- gross/net weight;
- volume;
- ETD/ATD/ETA/ATA;
- tracking;
- packing list;
- commercial invoice;
- certificate of origin;
- customs documents;
- duty/tax estimate;
- landed cost allocation;
- exceptions.

Support partial shipments and many-to-many relation between orders, order lines and shipments.

---

## 23. Finance and reconciliation

### 23.1 Invoice lifecycle

- proforma;
- deposit invoice;
- commercial invoice;
- debit/credit note;
- payment schedule;
- paid/partial/overdue;
- currency and FX;
- tax;
- linked order and shipment.

### 23.2 Three-way match

```text
Purchase Order
↔ Goods Receipt / Shipment Receipt
↔ Supplier Invoice
```

Variance types:

- price;
- quantity;
- currency;
- tax;
- freight;
- duty;
- duplicate invoice;
- missing receipt;
- unauthorized amendment.

### 23.3 Aging

- not due;
- 0–30;
- 31–60;
- 61–90;
- 90+;
- disputed;
- blocked.

---

## 24. Analytics

### 24.1 Buying analytics

- OTB utilization;
- budget vs committed vs received;
- units and value by brand/category/delivery;
- intake margin;
- option count;
- size curve;
- price ladder;
- assortment overlap;
- carry-over share;
- newness share;
- concentration risk.

### 24.2 Wholesale funnel

```text
Brand impression
→ Profile view
→ Showroom view
→ Linesheet view
→ Product view
→ Quantity entry
→ Draft order
→ Submitted order
→ Confirmed order
→ Shipped order
```

Metrics:

- conversion by stage;
- time to next stage;
- drop-off reasons;
- buyer/brand cohort;
- collection performance;
- style engagement;
- cart abandonment;
- order acceptance rate.

### 24.3 Supplier analytics

- quote competitiveness;
- cost variance;
- lead-time accuracy;
- on-time delivery;
- fill rate;
- defect rate;
- claims recovery;
- response SLA;
- capacity utilization;
- compliance expiry;
- supplier risk score.

### 24.4 Product lifecycle analytics

- concept-to-launch lead time;
- sample rounds;
- approval cycle time;
- target-to-quoted cost variance;
- quoted-to-actual cost variance;
- late development tasks;
- cancellation rate;
- product profitability;
- post-season feedback into next line plan.

---

## 25. Inbox, comments and notifications

Unified inbox types:

- direct message;
- connection request;
- submission;
- order action;
- amendment;
- sample comment;
- approval request;
- production exception;
- QC failure;
- shipment delay;
- invoice issue;
- system notification.

Requirements:

- thread linked to entity;
- mentions;
- attachments;
- internal/private vs shared messages;
- read/unread;
- assignment;
- SLA;
- due date;
- resolve/reopen;
- notification preferences;
- email and in-app delivery;
- audit-safe retention.

---

## 26. Data model

Core entities:

```text
Organization
Account
Membership
User
Role
Permission
Location
Contact
BrandProfile
RetailerProfile
Connection
CommercialAccess
Season
Collection
DeliveryWindow
Linesheet
Style
Colorway
SKU
Material
MaterialColor
BOM
BOMLine
Operation
BOL
MeasurementChart
MeasurementPoint
TechPack
Sample
SampleEvaluation
TestRequest
TestResult
Supplier
Factory
RFQ
Quotation
QuotationLine
Allocation
AssortmentPlan
SelectionScenario
Order
OrderLine
OrderAmendment
ProductionOrder
ProductionMilestone
Inspection
Defect
Claim
Shipment
ShipmentLine
Invoice
Payment
CostVersion
CostLine
PriceList
Price
Document
MessageThread
Comment
Approval
Task
AuditEvent
IntegrationJob
```

### 26.1 Critical design rules

- Style ≠ Colorway ≠ SKU;
- commercial prices are versioned and scoped;
- BOM, tech pack and measurements are versioned;
- orders store immutable snapshots;
- current product data must not rewrite historical order data;
- tenant/account isolation enforced server-side;
- soft delete for commercial records;
- audit event for every critical mutation;
- all money fields store amount, currency and FX context;
- all quantities store UOM;
- dates store timezone and planned/actual distinction.

---

## 27. Permissions

Permission dimensions:

- organization;
- account;
- role;
- object type;
- object state;
- action;
- field sensitivity;
- territory;
- category;
- brand/retailer relationship;
- price list;
- season/collection;
- entitlement.

Sensitive fields:

- supplier cost;
- target cost;
- margins;
- payment terms;
- credit limits;
- internal comments;
- claims;
- personal data.

No access decision may rely only on hidden UI controls; authorization must be verified server-side.

---

## 28. Approval engine

Approval may be triggered by:

- order value;
- margin below threshold;
- OTB overrun;
- new supplier;
- price override;
- MOQ exception;
- late delivery acceptance;
- cost variance;
- sample approval;
- tech pack release;
- QC conditional pass;
- invoice variance.

Approval definition:

- policy ID and version;
- trigger condition;
- sequential/parallel steps;
- role/user approver;
- SLA;
- escalation;
- delegation;
- approve/reject/request changes;
- comment requirement;
- audit trail.

---

## 29. Integrations

Priority integrations:

- ERP;
- accounting;
- WMS;
- TMS/logistics;
- e-commerce;
- POS;
- PIM;
- QMS;
- CAD/pattern systems;
- BI/DWH;
- payment providers;
- email/calendar;
- EDI;
- Shopify and other commerce platforms.

Integration requirements:

- API-first;
- webhooks;
- idempotency;
- retries and dead-letter queue;
- mapping/version control;
- activity center;
- row-level error report;
- re-run failed items;
- source-of-truth definition;
- correlation IDs;
- import templates and validation preview.

---

## 30. Non-functional requirements

### Security

- SSO/SAML/OIDC;
- MFA;
- RBAC/ABAC;
- encryption in transit and at rest;
- audit log;
- session controls;
- IP/device policies for enterprise;
- malware scanning for uploads;
- secrets management;
- GDPR and data retention controls.

### Performance

- catalog and order matrix virtualization;
- optimistic updates only where reversible;
- background exports;
- resumable uploads;
- pagination/cursors;
- server-side filtering;
- cached read models;
- clear loading, empty, partial and error states.

### Reliability

- immutable financial and order snapshots;
- idempotent writes;
- conflict detection;
- version locking;
- recoverable drafts;
- monitoring and alerting;
- backup and tested restore.

---

## 31. UX improvements over JOOR

1. One consistent navigation instead of legacy route duplication.
2. Named actions instead of icon-only destructive controls.
3. Confirmation and undo for high-risk actions.
4. Unified filters and saved views.
5. Keyboard-first quantity matrix.
6. Persistent drafts across sessions.
7. Exact explanation of gated functionality.
8. Version comparison for orders, tech packs and samples.
9. Operational alerts with owner and deadline.
10. No silent redirects from empty states.
11. Clear separation of internal and shared comments.
12. Complete audit and activity timeline on every business entity.
13. Mass actions with preview and validation.
14. Export jobs with progress and error logs.
15. Mobile approval and exception handling, while complex buying remains desktop-first.

---

## 32. End-to-end pilot scenario

Pilot must be tested on two styles:

- one standard garment;
- one complex garment, for example outerwear or fur product.

### Scenario

1. Create season and line plan.
2. Create style, colorways and size range.
3. Attach sketches, construction details and measurement chart.
4. Build BOM with brand-owned and factory-owned materials.
5. Build BOL/SMV.
6. Calculate target cost.
7. Send RFQ to at least two factories.
8. Compare quotations and allocate factory.
9. Request proto and PPS samples.
10. Record measurements, fit comments, lab tests and approvals.
11. Generate versioned tech pack.
12. Publish collection to showroom and linesheet.
13. Retailer creates assortment and order.
14. Run internal approval.
15. Submit order and receive brand confirmation.
16. Create production order and milestones.
17. Record material readiness and WIP.
18. Run inline and final QC.
19. Create shipment and documents.
20. Receive goods and reconcile invoice.
21. Compare target, quoted, ordered and actual landed cost.
22. Produce management report and audit trail.

Pilot is successful only when the same style IDs, versions, quantities and monetary values remain traceable across the whole chain.

---

## 33. Product roadmap

### Phase 1 — Foundation

- organizations, accounts, users, roles;
- product catalog and style/color/SKU model;
- brand/retailer profiles;
- connections;
- showroom, linesheet and catalog;
- draft order and order lifecycle;
- messages;
- documents;
- audit log.

### Phase 2 — Buying intelligence

- OTB;
- assortment planning;
- Visual Assortment;
- approval workflows;
- margin controls;
- analytics funnel;
- saved views and exports.

### Phase 3 — PLM and costing

- line plan;
- materials;
- BOM/BOL;
- measurement charts;
- samples;
- tech packs;
- target and quoted costing.

### Phase 4 — Sourcing and production

- suppliers and factories;
- RFQ/quotations;
- allocation;
- production orders;
- WIP calendar;
- QC and claims;
- shipments.

### Phase 5 — Finance and ecosystem

- invoices/payments;
- 3-way match;
- actual landed cost;
- ERP/WMS/TMS/QMS integrations;
- supplier scorecards;
- predictive delays, demand and reorder.

---

## 34. Acceptance criteria

The platform is not considered complete merely because screens exist. Each module must pass:

- role/permission tests;
- loading/empty/error/partial states;
- validation tests;
- concurrency tests;
- audit verification;
- export/import tests;
- accessibility checks;
- mobile approval checks;
- performance on large collections and SKU matrices;
- account isolation tests;
- end-to-end pilot on two styles;
- financial reconciliation to source documents.

---

## 35. Source register and limitations

1. Read-only audit of JOOR production interface under Retailer / LITE role, 4 August 2026.
2. Omnidata PLM presentation, 18 pages: planning, style cards, BOM, material library, laboratory tests, BOL, color management, measurement charts, tech packs, sourcing, samples, orders, quality control and implementation sequence.
3. Syntha requirements collected across product, wholesale, PLM, sourcing, costing, production, logistics, quality and analytics discussions.

Not directly confirmed in JOOR and therefore requiring UAT:

- full brand-side authoring;
- seller order inbox and fulfillment;
- paid Visual Assortment;
- JOORPay;
- Shopify installation and sync;
- complete submit/approve/ship chain;
- gated enterprise analytics;
- exact internal permissions and API behavior.

---

## 36. Final product decision

Syntha должна объединить четыре класса систем в одном согласованном контуре:

1. **B2B wholesale network** — discovery, connections, showrooms, linesheets and orders.
2. **PLM** — product development, BOM, measurements, samples and tech packs.
3. **Source-to-produce** — RFQ, factories, production, quality and logistics.
4. **Commercial control tower** — OTB, margins, costing, payments, reconciliation and analytics.

Это и есть стратегическое преимущество: не еще один красивый каталог, а единая операционная система, где коммерческое решение покупателя связано с конкретной моделью, фабрикой, материалом, себестоимостью, сроком, качеством и финансовым результатом.

---

## 37. Целевая карта маршрутов Syntha

Маршруты являются contract между UX, frontend, backend, permissions и analytics. Alias- и legacy-routes не должны плодиться: один бизнес-объект — один канонический URL.

| Область | Route | Назначение |
|---|---|---|
| Home | `/dashboard` | Role-based control tower |
| Brands | `/discover/brands` | Discovery и сравнение брендов |
| Brand profile | `/brands/:brandId` | Профиль и коммерческий паспорт |
| Collections | `/discover/collections` | Поиск коллекций и drops |
| Markets | `/discover/markets` | Events, appointments, digital markets |
| Connections | `/connections` | Все отношения brand-retailer |
| Incoming | `/connections/incoming` | Входящие запросы |
| Pending | `/connections/pending` | Исходящие запросы |
| Planning | `/planning/seasons` | Seasons и collection plans |
| Line plan | `/planning/seasons/:seasonId/line-plan` | Структура коллекции |
| OTB | `/planning/otb` | Бюджет закупки |
| Styles | `/plm/styles` | Style master list |
| Style | `/plm/styles/:styleId` | Полная карточка модели |
| Materials | `/plm/materials` | Библиотека материалов |
| Samples | `/plm/samples` | Sample lifecycle |
| Tech packs | `/plm/tech-packs` | Версии и releases |
| Suppliers | `/sourcing/suppliers` | Supplier master |
| RFQ | `/sourcing/rfqs` | Запросы котировок |
| Quote compare | `/sourcing/rfqs/:rfqId/compare` | Сравнение фабрик |
| Showrooms | `/buying/showrooms` | Digital selling/buying |
| Linesheets | `/buying/linesheets` | Каталоги заказов |
| Selection | `/buying/selections/:selectionId` | Assortment workspace |
| Cart | `/buying/cart` | Draft orders |
| Orders | `/orders` | Все заказы |
| Order | `/orders/:orderId` | Snapshot, lines, approvals, amendments |
| Production | `/production/orders` | Production order list |
| WIP | `/production/calendar` | Производственный календарь |
| QC | `/quality/inspections` | Проверки и дефекты |
| Shipments | `/logistics/shipments` | Отгрузки и tracking |
| Costing | `/finance/costing` | Cost versions и variance |
| Invoices | `/finance/invoices` | Invoices и 3-way match |
| Analytics | `/analytics` | Role-specific analytics |
| Inbox | `/inbox` | Unified operational inbox |
| Integrations | `/admin/integrations` | Connectors и jobs |
| Dictionaries | `/admin/dictionaries` | Управляемые справочники |
| Audit | `/admin/audit` | Audit events |

### 37.1 Route-state contract

Каждый route обязан поддерживать:

- loading skeleton;
- no permission;
- not found;
- empty state с объяснением и корректным CTA;
- partial data state;
- stale/version conflict state;
- network error с retry;
- archived/read-only state;
- unsaved changes protection;
- deep link preservation after login.

---

## 38. Screen contract

Каждый экран проектируется по одному шаблону.

### 38.1 Header

- breadcrumb;
- object name and immutable ID;
- state badge;
- owner;
- last updated;
- current version;
- primary action;
- secondary actions;
- overflow menu;
- permissions explanation when action unavailable.

### 38.2 Main content

- summary;
- business data;
- linked objects;
- calculations;
- exceptions;
- comments;
- documents;
- approvals;
- activity timeline.

### 38.3 Footer/status bar

- save state;
- validation errors count;
- synchronization status;
- active account;
- currency/UOM context;
- last successful sync.

### 38.4 Forbidden UX patterns

- destructive icon without text or tooltip;
- mutation through GET-link;
- silent data overwrite;
- disabled control without explanation;
- modal containing another modal;
- recalculation without showing changed result;
- export without job status;
- mixed internal and external comments;
- unexplained redirect;
- action that changes account context without visible confirmation.

---

## 39. Managed dictionaries

Справочники должны быть tenant-configurable, versioned и иметь status Active/Deprecated. Удаление используемого значения запрещено.

### 39.1 Product dictionaries

- seasons;
- collections;
- drops;
- departments;
- categories and subcategories;
- product types;
- gender/audience;
- age groups;
- fit;
- silhouette;
- length;
- sleeve;
- neckline/collar;
- closure;
- construction details;
- size systems;
- measurement points;
- color families;
- product lifecycle states;
- novelty/carry-over status.

### 39.2 Material dictionaries

- material types/subtypes;
- fibers;
- compositions;
- weave/knit;
- finishes;
- weights;
- widths;
- gauges;
- color standards;
- UOM;
- test types;
- certificates;
- care instructions;
- defect types;
- ownership models.

### 39.3 Commercial dictionaries

- currencies;
- price types;
- price lists;
- tax types;
- incoterms;
- payment terms;
- shipping methods;
- cancellation reasons;
- order change reasons;
- discount types;
- commission types;
- margin thresholds;
- credit statuses.

### 39.4 Production dictionaries

- factories;
- capabilities;
- operations;
- machines;
- skill grades;
- sample types;
- production milestones;
- delay reasons;
- inspection types;
- AQL levels;
- defect severity;
- corrective action types;
- claim outcomes.

### 39.5 Governance

Для каждого dictionary value:

- code;
- display name;
- locale translations;
- parent;
- valid from/to;
- active/deprecated;
- replacement value;
- owner;
- usage count;
- audit history.

---

## 40. Event taxonomy and product analytics instrumentation

Без единой event taxonomy невозможно доказать, что продукт лучше JOOR.

### 40.1 Event envelope

```text
event_id
occurred_at
actor_user_id
actor_role
organization_id
account_id
session_id
source_route
object_type
object_id
object_version
operation
result
reason_code
correlation_id
metadata
```

### 40.2 Core events

- brand_impression;
- brand_profile_viewed;
- connection_requested;
- connection_accepted;
- showroom_opened;
- linesheet_opened;
- style_viewed;
- colorway_selected;
- quantity_entered;
- selection_saved;
- order_draft_created;
- order_submitted;
- order_confirmed;
- order_amendment_created;
- sample_requested;
- sample_approved;
- tech_pack_released;
- rfq_sent;
- quotation_received;
- supplier_allocated;
- production_milestone_completed;
- inspection_failed;
- shipment_departed;
- goods_received;
- invoice_matched;
- alert_resolved.

### 40.3 Analytics discipline

- explicit user action отделяется от system-generated recommendation;
- impression считается только после фактического отображения;
- duplicate events дедуплицируются по event_id;
- financial metrics строятся из immutable snapshots;
- funnel stages имеют единое определение для всех tenants;
- deleted/archived records сохраняются в historical aggregates согласно retention policy.

---

## 41. KPI formulas

### 41.1 OTB

```text
Available OTB
= Approved Budget
- Open Order Commitments
- Confirmed Orders Not Received
- Received at Cost
+ Approved Cancellations
```

### 41.2 Intake margin

```text
Intake Margin %
= (Retail Price ex VAT - Landed Cost) / Retail Price ex VAT
```

### 41.3 GMROI

```text
GMROI
= Gross Margin Value / Average Inventory at Cost
```

### 41.4 Sell-through

```text
Sell-through %
= Net Units Sold / (Net Units Sold + Ending On-hand Units)
```

### 41.5 Supplier OTD

```text
On-time Delivery %
= Shipments Delivered On or Before Agreed Date / Total Delivered Shipments
```

### 41.6 Fill rate

```text
Fill Rate %
= Accepted Delivered Units / Confirmed Ordered Units
```

### 41.7 Cost variance

```text
Cost Variance %
= (Actual Landed Cost - Target Cost) / Target Cost
```

### 41.8 Sample approval efficiency

```text
First-pass Approval %
= Styles Approved on First Relevant Sample / Styles Reaching Sample Review
```

Для каждого KPI фиксируются grain, source entities, currency conversion policy, timezone, returns treatment и refresh frequency.

---

## 42. AI functions that create real differentiation

AI не должен подменять master data или принимать необратимые решения без человека.

### 42.1 Buyer copilot

- natural-language search по каталогу;
- assortment gap detection;
- suggested size curve;
- suggested quantity by store cluster;
- duplicate and cannibalization warning;
- markup/margin anomaly detection;
- order summary before submission;
- explanation of why a style is recommended.

### 42.2 Product development copilot

- extraction of BOM candidates from tech documents;
- comparison of tech pack versions;
- missing field detection;
- sample comment summarization;
- measurement deviation summary;
- suggested reusable components from historical styles;
- risk estimate for late launch.

### 42.3 Sourcing copilot

- quotation normalization;
- hidden-cost detection;
- supplier comparison summary;
- capacity and lead-time risk;
- suggested negotiation points;
- abnormal material consumption alert;
- likely cost drivers.

### 42.4 Production and quality copilot

- milestone delay prediction;
- defect clustering;
- probable root-cause suggestion;
- recurring factory issue detection;
- claim evidence pack drafting;
- shipment risk summary.

### 42.5 AI control requirements

- source citations inside product;
- confidence score;
- human approval;
- no training on tenant data without explicit policy;
- prompt and output audit for sensitive workflows;
- deterministic calculations remain outside LLM;
- explainability for recommendations;
- feedback loop: accepted/rejected/edited.

---

## 43. Recommendation engine

Recommendation must optimize business outcome, not clicks.

### 43.1 Candidate features

- category fit;
- price-band fit;
- retailer customer profile;
- historical sell-through;
- returns;
- markdown dependency;
- margin;
- inventory position;
- seasonality;
- size availability;
- delivery window;
- brand overlap;
- novelty;
- supplier reliability.

### 43.2 Ranking guardrails

- do not recommend unavailable SKU;
- do not exceed territory/access restrictions;
- penalize late/high-risk delivery;
- expose sponsored placement separately;
- avoid concentration in one brand/category;
- support diversity and exploration;
- allow buyer to inspect recommendation factors.

---

## 44. Retail planning extensions

Для сильного retailer cabinet недостаточно просто собрать заказ.

### 44.1 Store clustering

- cluster by sales, traffic, climate, price sensitivity, customer profile and capacity;
- assign doors to cluster;
- maintain effective dates;
- allow scenario override;
- compare planned and actual cluster performance.

### 44.2 Initial allocation

```text
Recommended SKU Qty
= Cluster Demand Weight
× Store Capacity Factor
× Size Curve Share
× Availability Factor
× Risk Adjustment
```

### 44.3 Replenishment and reorder

- available-to-sell from brand;
- retailer on-hand and sell-through;
- minimum reorder;
- lead time;
- expected margin;
- markdown risk;
- suggested reorder quantity;
- approval and order conversion.

### 44.4 Markdown feedback

Post-season results must feed back into:

- next season line plan;
- brand score;
- category budget;
- size curve;
- price ladder;
- carry-over decision;
- reorder logic.

---

## 45. Market appointments and collaborative buying

TARGET module absent from the current master map but critical for wholesale workflow.

- appointment calendar;
- brand, showroom, location and timezone;
- attendee roles;
- pre-meeting shortlist;
- shared buying session;
- live notes;
- selected styles;
- decisions and follow-up tasks;
- meeting recap;
- conversion into selection/order;
- offline-capable tablet mode for market appointments.

All participants see only data allowed by role; retailer internal margin and OTB remain private.

---

## 46. Document control

Document types:

- tech pack;
- quotation;
- contract;
- PO;
- order confirmation;
- proforma;
- invoice;
- packing list;
- certificate;
- test report;
- inspection report;
- claim;
- credit note;
- customs document.

Required metadata:

- document type;
- object links;
- issuer;
- recipient;
- version;
- issue/effective/expiry dates;
- language;
- signature state;
- checksum;
- confidentiality;
- retention class.

A newer file must not silently replace a legally or commercially used version.

---

## 47. Data quality control

### 47.1 Data-quality dimensions

- completeness;
- validity;
- uniqueness;
- consistency;
- timeliness;
- lineage;
- referential integrity.

### 47.2 Examples of blocking rules

- SKU cannot exist without style, colorway and size;
- order cannot submit without price snapshot and terms version;
- tech pack cannot release without mandatory sections;
- production cannot start without approved sample or explicit waiver;
- shipment cannot close above confirmed quantity without amendment;
- invoice cannot auto-match when currency differs without approved FX rule;
- material cost cannot be calculated without UOM conversion.

### 47.3 Data-quality dashboard

- invalid records;
- missing mandatory data;
- duplicate styles/SKUs;
- expired prices;
- expired certificates;
- orphaned documents;
- unsynchronized integrations;
- unresolved mapping errors.

---

## 48. Import/export templates

### 48.1 Imports

- brands;
- retailer doors;
- styles/colorways/SKUs;
- prices;
- materials;
- BOM;
- measurement charts;
- orders;
- production milestones;
- inspections;
- shipments;
- invoices.

### 48.2 Import flow

```text
Upload
→ Detect template/version
→ Map columns
→ Validate
→ Preview changes
→ User confirms
→ Background job
→ Row-level result
→ Correct and re-run failed rows
```

### 48.3 Export principles

- export respects permissions;
- selected filters and columns persist;
- financial exports contain currency and FX context;
- large exports run asynchronously;
- downloaded file has generated-at timestamp and source version;
- all exports are audited.

---

## 49. Enterprise tenancy and organization model

Syntha must support:

- holding company;
- multiple legal entities;
- multiple brands;
- multiple retailer banners;
- business units;
- countries;
- stores/doors;
- warehouses;
- factories;
- external agencies and inspectors.

### 49.1 Data ownership

Every business object has:

- owning organization;
- owning account/business unit;
- visibility scope;
- shared-with parties;
- source system;
- data steward.

### 49.2 Cross-company collaboration

Shared object access is explicit and revocable. Internal fields stay private even when an object is shared externally.

---

## 50. Operational SLA framework

SLA objects:

- connection response;
- RFQ response;
- sample delivery;
- sample review;
- order confirmation;
- amendment response;
- production milestone;
- QC corrective action;
- shipment document submission;
- claim response;
- invoice resolution.

Each SLA contains:

- start event;
- pause conditions;
- due duration;
- calendar/business days;
- timezone;
- warning threshold;
- escalation route;
- breach reason;
- resolution timestamp.

---

## 51. Prioritized delivery backlog

### P0 — required to prove product viability

- tenant/account/role foundation;
- style-colorway-SKU model;
- brand and retailer profiles;
- connections;
- collection, linesheet and product detail;
- quantity matrix;
- draft and submitted order;
- order snapshots;
- order approvals;
- documents and messages;
- audit log;
- basic dashboard;
- CSV/XLSX import/export;
- end-to-end UAT.

### P1 — decisive advantage over basic wholesale platforms

- OTB;
- Visual Assortment;
- line plan;
- BOM and costing;
- samples and tech packs;
- RFQ and quote comparison;
- amendments;
- production calendar;
- inspections;
- shipment tracking;
- supplier scorecard;
- analytics funnel.

### P2 — enterprise scale

- advanced approvals;
- invoices and 3-way match;
- actual landed cost;
- store clustering/allocation;
- replenishment;
- market appointments;
- external inspector portal;
- EDI/API ecosystem;
- SSO/MFA enterprise policies;
- advanced data quality.

### P3 — intelligent automation

- AI buyer copilot;
- quotation normalization;
- delay prediction;
- defect clustering;
- recommendation engine;
- scenario optimization;
- automated claim pack;
- natural-language analytics.

---

## 52. Definition of Ready

A feature enters development only when available:

- business objective;
- actor and permissions;
- entry route;
- source-of-truth entities;
- field list;
- state machine;
- validations;
- empty/loading/error states;
- audit events;
- analytics events;
- acceptance criteria;
- designs or interaction contract;
- integration dependencies;
- migration impact;
- security review requirement.

---

## 53. Definition of Done

Feature is complete only when:

- happy path works;
- negative paths work;
- permissions tested;
- tenant isolation tested;
- audit events verified;
- analytics events verified;
- accessibility passed;
- large-data performance passed;
- import/export passed where applicable;
- documentation updated;
- support playbook created;
- monitoring and alerts configured;
- UAT signed off by business owner.

---

## 54. Migration from Excel and fragmented systems

### 54.1 Discovery

- inventory current files and systems;
- identify owners;
- define source of truth;
- classify sensitive data;
- detect duplicates and obsolete fields.

### 54.2 Mapping

- source field;
- target field;
- transformation;
- dictionary mapping;
- default value;
- validation;
- unresolved owner.

### 54.3 Migration sequence

1. dictionaries;
2. organizations/users/locations;
3. suppliers and brands;
4. seasons and styles;
5. materials and BOM;
6. prices;
7. open orders;
8. production and shipments;
9. documents;
10. historical analytics.

### 54.4 Reconciliation

- record counts;
- control totals;
- order value totals;
- inventory quantities;
- invoice balances;
- sample/document counts;
- exception report signed by owner.

---

## 55. Product success metrics

### Adoption

- weekly active buyer users;
- active brands;
- active connected pairs;
- percentage of orders created fully in Syntha;
- percentage of styles with complete product data.

### Efficiency

- time from collection publish to first order;
- time to create order;
- order confirmation time;
- sample approval cycle;
- RFQ comparison time;
- manual spreadsheet hours removed.

### Quality

- order error rate;
- price discrepancy rate;
- late production rate;
- defect rate;
- invoice match rate;
- data completeness.

### Commercial outcome

- confirmed wholesale GMV;
- intake margin improvement;
- cost variance reduction;
- OTB utilization;
- sell-through improvement;
- markdown reduction;
- claims recovery.

North Star metric candidate:

```text
Verified Confirmed GMV processed through fully traceable orders
```

It must be paired with margin, fulfillment and quality guardrails so growth cannot be achieved by low-quality or unprofitable orders.

---

## 56. Immediate next implementation package

Для перехода от master map к разработке необходимо выпустить следующие artifacts:

1. canonical ERD;
2. role-permission matrix;
3. state machines for Connection, Style, Sample, Order, Production Order, Shipment and Invoice;
4. route-by-route screen specification;
5. API contract;
6. event catalog;
7. dictionaries workbook;
8. two-style pilot dataset;
9. UAT scripts;
10. prioritized epics and user stories.

Первый development slice должен быть вертикальным, а не модульным:

```text
Brand publishes collection
→ Retailer sees linesheet
→ Retailer selects SKU quantities
→ Order passes approval
→ Brand confirms
→ Immutable order snapshot and audit are created
```

Только после этого имеет смысл расширять систему вширь. Иначе получится роскошный музей экранов: смотреть приятно, работать нельзя.

---

## 57. API architecture and command model

API должна отражать бизнес-команды, а не быть прямым CRUD-доступом к таблицам.

### 57.1 Principles

- versioned API namespace;
- organization and account context on every request;
- server-side authorization;
- idempotency for all important writes;
- optimistic concurrency through entity version or ETag;
- cursor pagination;
- standardized validation errors;
- trace/correlation ID;
- immutable command audit;
- separate read models for heavy analytics and workspaces.

### 57.2 Example commands

```text
POST   /api/v1/connections/requests
POST   /api/v1/connections/:id/accept
POST   /api/v1/styles/:id/release
POST   /api/v1/rfqs/:id/send
POST   /api/v1/orders/:id/submit
POST   /api/v1/orders/:id/confirm
POST   /api/v1/orders/:id/amendments
POST   /api/v1/samples/:id/approve
POST   /api/v1/production-orders/:id/milestones/:milestoneId/complete
POST   /api/v1/inspections/:id/finalize
POST   /api/v1/shipments/:id/dispatch
POST   /api/v1/invoices/:id/match
```

### 57.3 Error contract

```json
{
  "code": "ORDER_PRICE_VERSION_EXPIRED",
  "message": "Order contains prices that are no longer valid",
  "field": null,
  "objectId": "...",
  "retryable": false,
  "requiredAction": "REFRESH_PRICE_SNAPSHOT",
  "correlationId": "..."
}
```

User-facing messages are localized; stable machine codes remain language-independent.

---

## 58. Webhooks and external developer platform

### 58.1 Webhook events

- connection.created;
- connection.accepted;
- collection.published;
- style.updated;
- price.updated;
- order.submitted;
- order.confirmed;
- order.amended;
- production.delayed;
- inspection.failed;
- shipment.dispatched;
- goods.received;
- invoice.created;
- invoice.matched.

### 58.2 Delivery requirements

- signed payload;
- timestamp and replay protection;
- idempotent event ID;
- retry with exponential backoff;
- dead-letter visibility;
- endpoint health status;
- delivery log;
- manual replay;
- secret rotation;
- event subscription filtering.

### 58.3 Developer portal

- API keys/service accounts;
- OAuth applications;
- sandbox tenant;
- OpenAPI documentation;
- webhook tester;
- example payloads;
- rate-limit dashboard;
- integration certification checklist.

---

## 59. Subscription, entitlement and monetization architecture

Монетизация не должна ломать основной transaction flow. Платный барьер допустим для расширения эффективности, но не для доступа к уже созданному заказу или юридически значимому документу.

### 59.1 Entitlement dimensions

- organization plan;
- active users;
- brands;
- retailer accounts;
- stores/doors;
- factories;
- styles/SKUs;
- storage;
- API volume;
- export volume;
- analytics retention;
- AI usage;
- premium modules.

### 59.2 Product packages

- Network: discovery, profiles, connections and messaging;
- Wholesale: showrooms, linesheets, ordering and amendments;
- Buying Pro: OTB, Visual Assortment, allocation and analytics;
- PLM: styles, BOM, measurements, samples and tech packs;
- Source & Produce: RFQ, suppliers, production, QC and logistics;
- Finance Control: costing, invoices, reconciliation and landed cost;
- Enterprise: SSO, advanced permissions, API, data residency and SLA.

### 59.3 Commercial safeguards

- clear explanation of limitation;
- no surprise blocking inside a workflow;
- grace period after downgrade;
- read-only access to historical records;
- export before account closure;
- proration and billing audit;
- entitlement changes recorded as events.

### 59.4 Platform revenue options

- SaaS subscription;
- implementation and migration;
- premium analytics;
- AI usage packages;
- payment processing fee where legally supported;
- marketplace/service commission;
- supplier verification;
- integration packages;
- managed data onboarding.

Sponsored discovery must always be visibly labeled and must not influence independent performance analytics.

---

## 60. Digital Product Passport and traceability readiness

Syntha должна быть готова собирать product provenance even when regulatory requirements differ by territory.

### 60.1 Traceability graph

```text
Style
→ Colorway
→ SKU
→ BOM Component
→ Material Batch
→ Supplier
→ Factory
→ Production Batch
→ Inspection
→ Shipment
→ Retail Receipt / Return
```

### 60.2 Passport data

- unique product identifier;
- manufacturer and responsible entity;
- country of manufacture;
- material composition;
- component provenance;
- certificates and test evidence;
- care and repair instructions;
- recyclability/disposal information;
- production batch;
- carbon or impact fields where reliably available;
- document source and verification status.

### 60.3 Data trust states

- supplier-declared;
- document-verified;
- third-party verified;
- system-calculated;
- estimated;
- missing;
- disputed.

Syntha must never present estimated sustainability values as verified facts.

---

## 61. Localization, currencies and international trade

### 61.1 Localization

- interface locale;
- content locale;
- translation status;
- locale-specific formatting;
- right-to-left readiness;
- translated commercial terms;
- language-specific PDFs;
- fallback language rules.

### 61.2 Currency model

Each monetary value stores:

- transaction currency;
- amount;
- functional/reporting currency;
- FX rate;
- FX source;
- FX date/time;
- rate type: spot, budget, contractual, accounting;
- converted amount;
- rounding rule.

Historical reports must not silently recalculate old values using a current rate.

### 61.3 International trade

- HS code;
- country of origin;
- preferential origin evidence;
- incoterm version;
- export/import restrictions;
- sanctions/compliance screening result;
- estimated duty;
- actual duty;
- customs broker;
- customs declaration and status.

Compliance screening must support manual review and false-positive resolution rather than automatic irreversible blocking.

---

## 62. Mobile, tablet and offline strategy

### 62.1 Desktop-first areas

- Visual Assortment;
- large SKU quantity matrices;
- BOM and measurement charts;
- quotation comparison;
- financial reconciliation;
- complex administration.

### 62.2 Mobile-first actions

- approvals;
- exception review;
- comments and mentions;
- order status;
- sample evaluation;
- factory milestone update;
- QC photo capture;
- shipment status;
- notification triage.

### 62.3 Offline tablet mode

For showrooms, market appointments and factories:

- explicitly downloaded workspace;
- encrypted local storage;
- visible offline indicator;
- queued commands;
- media compression;
- conflict detection on reconnect;
- user-controlled resolution;
- automatic local data expiry;
- remote session revocation.

Offline mode must never imply that an order was submitted until server acknowledgement is received.

---

## 63. Accessibility and inclusive UX

Target: WCAG 2.2 AA for core workflows.

Requirements:

- complete keyboard navigation;
- visible focus;
- semantic headings and landmarks;
- screen-reader labels;
- no color-only status communication;
- sufficient contrast;
- scalable text;
- accessible data tables;
- error summary and inline error linkage;
- reduced-motion support;
- accessible charts with textual summaries;
- touch targets suitable for tablet and mobile;
- timeout warning and extension for long buying sessions.

Quantity matrices require a dedicated accessibility mode rather than pretending that a huge spreadsheet is automatically accessible.

---

## 64. Disaster recovery and business continuity

### 64.1 Service tiers

Critical workflows:

- order access;
- order confirmation;
- shipment documents;
- production exceptions;
- invoice records.

Non-critical workflows:

- recommendations;
- secondary analytics;
- visual enhancements;
- long-running exports.

### 64.2 Recovery requirements

- defined RPO and RTO by service tier;
- encrypted backups;
- point-in-time database recovery;
- object storage versioning;
- tested restoration drills;
- cross-region strategy where required;
- runbooks;
- incident roles;
- customer communication process;
- post-incident review.

### 64.3 Degraded mode

During partial outage the platform should, where safe:

- keep historical orders readable;
- show cached product data with stale warning;
- queue non-destructive commands;
- disable irreversible actions that cannot be confirmed;
- expose system status and incident reference.

---

## 65. Testing strategy and UAT matrix

### 65.1 Test layers

- unit tests for calculations and state transitions;
- contract tests for API and integrations;
- permission tests;
- tenant-isolation tests;
- integration tests;
- end-to-end workflows;
- migration tests;
- performance tests;
- accessibility tests;
- security tests;
- disaster-recovery drills;
- business UAT.

### 65.2 Required test personas

- retailer buyer;
- retailer approver;
- brand salesperson;
- brand order manager;
- product developer;
- sourcing manager;
- factory user;
- quality inspector;
- finance user;
- organization admin;
- external integration service account;
- unauthorized user.

### 65.3 High-risk scenarios

- two buyers edit the same draft;
- price changes while order is open;
- connection revoked after order submission;
- brand confirms partial quantities;
- order amendment crosses approval threshold;
- factory changes delivery after confirmation;
- shipment exceeds confirmed quantity;
- duplicate invoice received;
- user switches organization mid-workflow;
- integration retries the same event;
- offline tablet reconnects with conflicting edits;
- entitlement expires during an open workflow.

### 65.4 UAT evidence

Each scenario records:

- test data;
- actor and account;
- steps;
- expected result;
- actual result;
- screenshots/documents;
- audit events;
- analytics events;
- defects;
- business sign-off.

---

## 66. Product governance and decision log

Master map must remain controlled, otherwise it превратится в склад хороших идей без ответственности.

Each product decision stores:

- decision ID;
- date;
- problem;
- considered options;
- chosen option;
- rationale;
- owner;
- affected modules;
- data migration impact;
- security/compliance impact;
- KPI expected to change;
- review date;
- status: proposed, accepted, superseded, rejected.

Changes to canonical entities, state machines, money calculations or permissions require architecture and business-owner approval.

---

## 67. Updated implementation conclusion

Следующий этап нельзя начинать с еще одного набора экранов. Требуется превратить master map в исполнимую спецификацию.

Порядок:

1. canonical ERD and ownership model;
2. permission matrix;
3. state machines;
4. API and webhook contracts;
5. screen contracts;
6. event taxonomy;
7. P0 vertical slice;
8. two-style pilot;
9. reconciliation and UAT;
10. only then broad module expansion.

Целевой критерий качества:

```text
Любое число, статус или решение на экране
можно проследить до исходного объекта,
версии, автора, правила расчета и audit event.
```

Если этого нет, система лишь аккуратно рисует неопределенность. Syntha должна неопределенность устранять.

---

## 68. Verified competitive benchmark — August 2026

Этот раздел основан на открытых официальных материалах поставщиков и отделен от результатов закрытого UI-аудита.

### 68.1 JOOR — подтвержденные публичные возможности

Официальные материалы JOOR подтверждают:

- global curated network;
- discovery брендов и retailers;
- virtual showrooms;
- digital linesheets and catalogs;
- centralized order management;
- draft, pending and approved order visibility;
- live inventory and retailer reorder management;
- pricing, discounts and customer records;
- order, sales and financial reporting;
- ERP/API integrations;
- Shopify product/order sync for retailers;
- Visual Assortment as paid add-on;
- iPad-assisted hybrid selling;
- JOOR Pay invoicing and embedded payments;
- support for multiple currencies.

Источники:

- https://www.joor.com/
- https://www.joor.com/order-management
- https://www.joor.com/wholesale-management
- https://www.joor.com/order-pay-brands
- https://www.joor.com/joor-pay
- https://www.joor.com/pricing

### 68.2 NuORDER / Lightspeed — подтвержденные публичные возможности

Официальные материалы Lightspeed подтверждают:

- wholesale network integrated with POS;
- marketplace discovery;
- multi-brand shopping and comparison;
- virtual showrooms, shoppable hotspots and digital linesheets;
- live pre-book and ATS inventory;
- personalized pricing, discounts and product selections;
- pre-filled carts sent to buyers;
- PO and product-data sync into POS;
- product data import including images, descriptions, UPC and MSRP;
- reordering alerts;
- demand forecasting and suggested order quantities;
- order trend analytics by products, sizes, colors and categories.

Источники:

- https://www.lightspeedhq.com/partners/b2b/
- https://www.lightspeedhq.com/pos/retail/b2b-wholesale-platform/
- https://retail-support.lightspeedhq.com/hc/en-us/categories/35130105405211-Lightspeed-Wholesale

### 68.3 Shopify B2B — подтвержденные публичные возможности

Официальные материалы Shopify подтверждают:

- company profiles;
- multiple company locations and contacts;
- catalog assignment by company/location;
- customer-specific products and prices;
- multiple currencies;
- quantity rules;
- volume pricing;
- discounts;
- payment terms;
- tax IDs and tax exemptions;
- self-service B2B checkout.

Источники:

- https://help.shopify.com/en/manual/b2b/catalogs/index
- https://www.shopify.com/enterprise/blog/unified-commerce-b2b-software

### 68.4 Centric — подтвержденный PLM/planning benchmark

Официальные материалы Centric подтверждают фокус на:

- planning and allocation;
- visual boards;
- product development;
- sourcing and manufacturing;
- pricing and inventory;
- testing, quality and compliance;
- sustainability and traceability;
- product commercialization and content distribution;
- AI-supported market, product and consumer insights.

Источник:

- https://www.centricsoftware.com/fashion-apparel

### 68.5 Вывод benchmark

Syntha не сможет быть сильнее рынка, если просто повторит discovery, digital catalog и order form. Минимальный конкурентный baseline уже включает live inventory, personalized catalogs, multi-company B2B terms, POS/ERP sync, embedded payments, visual assortment and product performance analytics.

Стратегическое преимущество Syntha возникает только при объединении:

```text
Wholesale Network
+ Retail Planning
+ PLM
+ Sourcing
+ Production
+ Quality
+ Logistics
+ Finance
+ Sell-through Feedback
```

---

## 69. Inventory, ATP and order-book control

Wholesale order placement без надежной availability model создает ложные обещания и последующие сокращения заказа.

### 69.1 Inventory buckets

- physical on hand;
- available to sell / ATS;
- available to promise / ATP;
- reserved;
- allocated;
- in production;
- expected inbound;
- quality hold;
- damaged;
- sample stock;
- virtual/unlimited preorder;
- discontinued.

### 69.2 Supply modes

- pre-book;
- made-to-order;
- at-once;
- immediate stock;
- replenishment;
- consignment;
- drop ship;
- vendor-managed inventory.

### 69.3 ATP formula

```text
ATP by SKU and delivery window
= On Hand
+ Confirmed Inbound before Promise Date
+ Approved Production Capacity
- Existing Reservations
- Safety Stock
- Quality Hold
```

Каждый компонент должен быть раскрываемым. Пользователь не должен видеть магическое число без объяснения.

### 69.4 Reservation lifecycle

```text
AVAILABLE
→ SOFT_RESERVED in active cart
→ HARD_RESERVED after agreed business event
→ ALLOCATED to confirmed order
→ PICKED / SHIPPED

Release events:
cart expiry / order rejection / cancellation / amendment / payment failure
```

### 69.5 Required controls

- reservation expiry;
- oversell policy;
- backorder policy;
- partial confirmation;
- substitution rules;
- priority by retailer tier;
- allocation fairness;
- safety stock;
- stale inventory warning;
- source-system timestamp;
- reconciliation with ERP/WMS.

---

## 70. Retailer and wholesale customer 360

Connection is not sufficient as a CRM model. Brand needs an operational and commercial record of each wholesale customer.

### 70.1 Account hierarchy

```text
Retail Group
→ Legal Entity
→ Banner
→ Company Location / Door
→ Buyer Team
→ Contacts
```

### 70.2 Customer 360 fields

- relationship owner;
- territory;
- retailer segment;
- brands/categories carried;
- stores and channels;
- currencies and price lists;
- payment terms;
- credit limit and exposure;
- tax data;
- delivery addresses;
- order history;
- average order value;
- returns/claims;
- payment performance;
- sell-through where shared;
- messages, meetings and tasks;
- opportunities and lost-order reasons;
- relationship health score.

### 70.3 Account health

```text
Account Health Score
= weighted combination of
Order Growth
+ Payment Timeliness
+ Engagement
+ Sell-through
+ Forecast Accuracy
- Claims
- Cancellations
- Overdue Exposure
```

Score components remain visible and configurable. A score without decomposition is decoration, not analytics.

---

## 71. Sales rep, showroom and agent operations

### 71.1 Roles

- internal sales representative;
- regional sales manager;
- external agent;
- distributor;
- showroom operator;
- market coordinator;
- customer service/order desk.

### 71.2 Territory and portfolio

- assigned countries/regions;
- assigned retailers;
- assigned brands/collections;
- exclusivity;
- effective dates;
- revenue targets;
- order targets;
- commission scheme;
- conflict detection.

### 71.3 Sales workspace

- target vs actual;
- appointments;
- buyer engagement;
- open opportunities;
- carts/drafts requiring follow-up;
- orders awaiting retailer action;
- overdue confirmations;
- payment risks;
- recommended next action;
- activity timeline.

### 71.4 Assisted order capture

Sales rep may build a proposed order for a retailer, but:

- retailer identity must be explicit;
- proposal and retailer-approved order remain different states;
- retailer must see all prices, terms, quantities and delivery splits;
- acceptance is recorded;
- internal notes are never exposed;
- rep cannot bypass buyer approval policy.

---

## 72. Pricing, discounts, rebates and commission engine

### 72.1 Price hierarchy

```text
Base Price List
→ Market/Currency Price
→ Customer Catalog Price
→ Contract Price
→ Volume Tier
→ Promotional Discount
→ Manual Override
```

System must show which rule won and why.

### 72.2 Price scope

- organization;
- company location;
- territory;
- currency;
- season;
- collection;
- style/color/SKU;
- delivery;
- effective dates;
- quantity tier;
- channel;
- customer segment.

### 72.3 Discount types

- percentage;
- fixed unit discount;
- order-level discount;
- early-order discount;
- volume discount;
- preseason commitment;
- markdown support;
- freight allowance;
- payment discount;
- sample allowance;
- promotional rebate.

### 72.4 Rebate and accrual

Rebate contracts require:

- basis;
- threshold;
- period;
- eligible products/orders;
- accrual method;
- settlement method;
- claim evidence;
- approval;
- accounting export.

### 72.5 Commission

- rep/agent;
- territory/customer/product scope;
- percentage or tier;
- basis: booked, confirmed, shipped, invoiced or paid;
- cancellation and return clawback;
- split commission;
- statement and dispute workflow.

---

## 73. Embedded payments, credit and order-to-cash

### 73.1 Payment methods

- card;
- bank transfer;
- ACH/direct debit where supported;
- wallet/payment link;
- net terms;
- deposit plus balance;
- letter of credit;
- third-party financing.

### 73.2 Credit model

- requested credit;
- approved limit;
- available credit;
- current exposure;
- overdue exposure;
- risk status;
- guarantee/insurance;
- manual hold;
- review date;
- decision evidence.

```text
Available Credit
= Approved Credit Limit
- Open Confirmed Orders
- Unpaid Invoices
- Disputed Exposure included by policy
+ Approved Payments not yet allocated
```

### 73.3 Order-to-cash flow

```text
Confirmed Order
→ Proforma / Deposit Request
→ Payment Authorization or Terms Check
→ Fulfillment Release
→ Commercial Invoice
→ Collection
→ Allocation
→ Reconciliation
→ Credit Note / Refund if required
```

### 73.4 Payment safeguards

- PCI-sensitive data handled by payment provider;
- 3DS/SCA where applicable;
- webhook verification;
- duplicate payment protection;
- settlement reconciliation;
- refund authorization;
- chargeback evidence;
- currency and fee transparency;
- payment state independent from order state.

---

## 74. Returns, RMA, deductions and chargebacks

Wholesale after-sales must be a first-class module rather than a comment attached to an order.

### 74.1 Return reasons

- quality defect;
- wrong item;
- quantity discrepancy;
- late delivery;
- unauthorized substitution;
- transport damage;
- commercial agreement;
- recall;
- customer cancellation where permitted.

### 74.2 RMA flow

```text
Return Requested
→ Evidence Review
→ Authorized / Rejected
→ Goods in Transit
→ Received and Inspected
→ Disposition
→ Credit / Replacement / Repair / Rejection
→ Closed
```

### 74.3 Disposition

- return to stock;
- second quality;
- repair/rework;
- return to supplier;
- destroy;
- donate;
- sample/archive.

### 74.4 Retailer deductions and vendor chargebacks

- short shipment;
- ASN/document failure;
- carton/label non-compliance;
- late delivery;
- price discrepancy;
- EDI failure;
- quality failure;
- routing guide violation.

Each deduction must link to rule version, evidence, amount, responsible party, dispute and recovery outcome.

---

## 75. DAM, PXM and channel-ready product content

Wholesale product data must be reusable for retailer onboarding and omnichannel commercialization.

### 75.1 Asset library

- campaign images;
- product images;
- flat lay;
- ghost mannequin;
- model shot;
- detail shot;
- video;
- 360/3D;
- swatch;
- technical drawing;
- logos and brand guidelines.

### 75.2 Asset metadata

- asset type;
- product links;
- color accuracy status;
- rights owner;
- usage territories;
- usage channels;
- valid dates;
- model/talent rights;
- photographer;
- resolution/aspect ratio;
- language;
- approval state;
- checksum/version.

### 75.3 Content readiness

For every target channel:

- required attributes;
- translated title/description;
- composition and care;
- dimensions;
- SEO fields;
- image rules;
- taxonomy mapping;
- completeness score;
- validation errors;
- publish status.

### 75.4 Syndication

- Shopify;
- retailer PIM/e-commerce;
- marketplaces;
- POS catalog;
- data pools;
- custom feed/API.

Published content stores destination, payload version, timestamp and result.

---

## 76. Search, discovery and query intelligence

### 76.1 Search scopes

- brands;
- collections;
- styles;
- SKUs;
- materials;
- suppliers;
- orders;
- documents;
- messages;
- analytics metrics.

### 76.2 Search features

- exact code/SKU search;
- typo tolerance;
- synonyms;
- multilingual search;
- faceted filtering;
- saved searches;
- recent searches;
- query suggestions;
- image/similarity search;
- natural-language query with structured filters;
- permission-aware indexing.

### 76.3 Quality metrics

- zero-result rate;
- reformulation rate;
- click-through;
- time to useful result;
- result-to-order conversion;
- search abandonment;
- synonym gap;
- stale-index rate.

Search ranking must not expose inaccessible product data through snippets, counts or recommendations.

---

## 77. Forecasting and scenario planning

### 77.1 Forecast hierarchy

```text
Company
→ Channel
→ Store Cluster
→ Category
→ Brand
→ Style
→ Color
→ Size
→ Week/Month/Season
```

### 77.2 Forecast inputs

- historical demand;
- lost sales/stockouts;
- returns;
- promotions;
- price;
- seasonality;
- launch timing;
- weather/climate where licensed and relevant;
- store openings/closures;
- product similarity;
- buyer override;
- supply constraints.

### 77.3 Scenario dimensions

- budget;
- FX;
- demand;
- lead time;
- freight;
- duty;
- markdown;
- supplier capacity;
- cancellation;
- delivery delay.

### 77.4 Scenario output

- sales;
- gross margin;
- intake margin;
- inventory;
- stockout risk;
- markdown risk;
- cash requirement;
- OTB;
- purchase quantities;
- supplier load;
- expected sell-through.

Forecasts must retain model version, training window, assumptions, confidence interval and human override.

---

## 78. Marketplace trust, verification and governance

### 78.1 Organization verification

- legal entity;
- registration number;
- tax ID;
- beneficial owner where required;
- business address;
- bank account verification;
- domain/email verification;
- authorized representative;
- sanctions screening result;
- review status.

### 78.2 Trust states

- unverified;
- verification in progress;
- verified;
- enhanced review;
- restricted;
- suspended;
- closed.

### 78.3 Marketplace controls

- report organization/product;
- counterfeit/IP complaint;
- fraud suspicion;
- unsafe content;
- commercial dispute;
- moderation queue;
- appeal;
- evidence preservation;
- enforcement history.

Verification badge scope and date must be explicit. A verified company is not the same as a guaranteed product or guaranteed payment.

---

## 79. Bounded contexts and service architecture

Recommended bounded contexts:

1. Identity & Tenancy;
2. Network & CRM;
3. Product & PLM;
4. Catalog & Content;
5. Pricing & Commercial Terms;
6. Planning & Assortment;
7. Ordering;
8. Inventory & Availability;
9. Sourcing & Suppliers;
10. Production;
11. Quality;
12. Logistics;
13. Finance & Payments;
14. Workflow & Approvals;
15. Messaging & Notifications;
16. Documents;
17. Analytics & Recommendations;
18. Integrations;
19. Billing & Entitlements;
20. Trust & Compliance.

### 79.1 Architecture rule

Do not begin with independent microservices for every noun. Begin with clear domain boundaries and a modular architecture; extract services only where scale, security, ownership or reliability justify the operational cost.

### 79.2 Data ownership examples

- Order service owns order state and snapshots;
- Pricing service owns valid price resolutions;
- Inventory service owns ATS/ATP and reservations;
- PLM owns current product-development versions;
- Catalog owns published commercial projection;
- Finance owns invoices, payments and reconciliation;
- Analytics consumes events and snapshots but does not rewrite operational truth.

### 79.3 Cross-context commands

Use orchestration/saga for:

- order submission;
- order confirmation with reservation;
- payment and fulfillment release;
- shipment and invoicing;
- return and credit;
- connection termination with historical preservation.

---

## 80. Semantic layer and management reporting

### 80.1 Facts

- product engagement;
- connection events;
- selections;
- order lines;
- amendments;
- inventory snapshots;
- production milestones;
- inspections/defects;
- shipment lines;
- invoices/payments;
- sell-through;
- returns/claims.

### 80.2 Dimensions

- date;
- organization/account;
- brand;
- retailer;
- store/cluster;
- season/collection/drop;
- product/category/style/color/SKU;
- supplier/factory;
- territory;
- currency;
- channel;
- order/status;
- source system.

### 80.3 Metric governance

Each metric has:

- owner;
- business definition;
- formula;
- grain;
- dimensions;
- exclusions;
- currency treatment;
- return/cancellation treatment;
- refresh SLA;
- certification state;
- change history.

Operational UI and BI must use the same certified definitions for order value, confirmed GMV, landed cost, margin and fill rate.

---

## 81. Service operations and customer success

### 81.1 Support case model

- tenant/user;
- affected object;
- severity;
- category;
- steps/evidence;
- correlation ID;
- environment;
- owner;
- SLA;
- workaround;
- root cause;
- resolution;
- product feedback link.

### 81.2 Implementation health

- onboarding progress;
- migration completeness;
- active users;
- workflow adoption;
- data quality;
- integration health;
- unresolved blockers;
- training completion;
- executive outcome metrics.

### 81.3 Customer success playbooks

- retailer activation;
- brand catalog readiness;
- first order;
- first integration;
- low adoption;
- poor data quality;
- payment risk;
- renewal risk;
- expansion opportunity.

---

## 82. Competitive differentiation matrix

| Capability | Basic wholesale platform | Strong market baseline | Syntha target |
|---|---|---|---|
| Discovery/network | Directory | Vetted network + recommendations | Network + performance fit + trust graph |
| Catalog | Digital linesheet | Rich media + live availability | PLM-derived, versioned, channel-ready catalog |
| Ordering | Cart and PO | Personalized pricing, edits, approvals | OTB, margin, ATP, amendments, production traceability |
| Inventory | Static stock | Live ATS/pre-book | ATP, reservations, capacity and replenishment |
| Retail planning | Limited | Visual assortment | OTB, clusters, scenarios, allocation, sell-through loop |
| Payments | External/manual | Embedded invoicing/payment | Credit, exposure, settlement and reconciliation |
| Product development | External PLM | Integration | Native style/BOM/sample/tech-pack lifecycle |
| Sourcing | External | Supplier records | RFQ, quote normalization, allocation and cost intelligence |
| Production | External ERP | Status sync | WIP, exceptions, capacity, quality and claims |
| Analytics | Order reports | Funnel and trend reports | Certified semantic layer from concept to sell-through |
| AI | Search/recommendations | Personalized recommendations | Auditable copilot across buying, costing and operations |
| Traceability | Minimal | Content/certificates | Batch-level product/material/order/shipment graph |

---

## 83. Updated priority decisions

### Decision 1 — do not build catalog before commercial projection

PLM Style is not directly exposed to buyer. Published Catalog Product is a controlled projection with approved fields, prices, availability, media and access policy.

### Decision 2 — availability is a financial promise

ATS/ATP and reservation logic belong in P0/P1 boundary. A platform cannot claim reliable ordering while quantities remain decorative.

### Decision 3 — company/location commercial model is mandatory

Price, catalog, tax, payment and shipping conditions attach to legal company and location, not merely to user login.

### Decision 4 — order amendment is canonical

After submission, no silent editing. Every commercial change is versioned, evaluated and accepted.

### Decision 5 — payments remain separate state machine

Paid does not mean shipped; confirmed does not mean credit-approved. Order, payment, production and shipment states are related but independent.

### Decision 6 — post-order process is part of product advantage

Returns, deductions, quality claims and reconciliation are not back-office leftovers. They determine real wholesale profitability.

### Decision 7 — benchmark parity is not differentiation

Live inventory, personalized catalogs, POS sync, visual buying and embedded payments are now baseline expectations. Syntha must win through end-to-end traceability, planning, costing and operational control.

---

## 84. Next vertical slices after the first order flow

### Slice A — Live availability and confirmation

```text
ERP/WMS sends inventory
→ Catalog shows timestamped ATS
→ Buyer enters quantities
→ Soft reservation
→ Submit
→ Brand confirms/partially confirms
→ Hard reservation
→ Order snapshot updated through amendment
```

### Slice B — Company-specific commerce

```text
Retailer company/location
→ Assigned catalog and currency
→ Price/quantity/payment rules
→ Buyer checkout
→ Tax and terms validation
→ Approval
→ Confirmed commercial snapshot
```

### Slice C — Product development to wholesale

```text
Style development
→ BOM/sample approval
→ Tech pack release
→ Commercial product projection
→ Linesheet publication
→ Retailer order
→ Product version traceability
```

### Slice D — Production to delivery

```text
Confirmed order
→ Production order
→ Materials/capacity
→ WIP milestones
→ QC
→ Shipment
→ Receipt
→ Landed-cost reconciliation
```

### Slice E — Sell-through feedback

```text
Retailer POS data
→ Sales/inventory normalization
→ Sell-through and size curve
→ Reorder suggestion
→ Next-season planning feedback
→ Supplier/product score update
```

Each slice must deliver operational value, immutable evidence and measurable KPI movement. No slice is accepted as complete solely because its pages render correctly.

---

## 85. Методика сравнения с NuORDER и аналогами

В этом документе запрещено превращать неполный аудит конкурента в категоричное утверждение «функции нет».

Используются следующие статусы:

| Статус | Значение |
|---|---|
| COMPETITOR CONFIRMED | Возможность подтверждена официальной документацией конкурента |
| JOOR OBSERVED | Возможность открыта и проверена в доступном JOOR Retailer / LITE |
| JOOR PUBLICLY CONFIRMED | Возможность описана в официальных публичных материалах JOOR |
| JOOR NOT CONFIRMED | Возможность не была найдена в доступном кабинете и не подтверждена использованными публичными материалами |
| JOOR GATED / UAT | Возможность может существовать, но требует другого тарифа, роли или controlled test |
| SYNTHA TARGET | Требование к нашей платформе |

Фраза «лучше, чем JOOR» означает не наличие большего числа экранов, а лучшее решение процесса по критериям:

- меньше ручного переноса данных;
- меньше ошибок и расхождений;
- быстрее принятие решения;
- прозрачнее источник цифры;
- лучше контроль доступа;
- полнее финансовая и операционная трассировка;
- выше измеримый коммерческий результат.

---

## 86. NuORDER — детальная карта сильных функций для заимствования и улучшения

### 86.1 Marketplace discovery and multi-brand shopping — COMPETITOR CONFIRMED

NuORDER / Lightspeed публично описывает:

- discovery тысяч брендов;
- browsing connected and new brands;
- multi-brand product shopping;
- сравнение товаров разных поставщиков;
- единый обзор нескольких brand orders;
- curated sections: bestsellers, trusted brands, suggested for you, recently viewed and new brands;
- AI recommendations по истории заказов;
- similar products на PDP;
- connection request из marketplace.

**JOOR status:** discovery и connection lifecycle подтверждены; полноценный multi-brand product comparison и единый multi-brand shopping flow в проверенном JOOR не подтверждены.

**SYNTHA TARGET:**

- глобальная Product Discovery страница поверх доступных брендов;
- сравнение до 10 товаров разных брендов;
- master basket, который при checkout детерминированно разбивается на отдельные brand orders;
- общий budget/OTB контроль до разбиения;
- отдельные MOQ/MOV, delivery, currency and terms checks по каждому бренду;
- explainable recommendations;
- сохранение причины выбора и отклонения рекомендаций;
- фильтр overlap/cannibalization между брендами.

### 86.2 Order Trends — COMPETITOR CONFIRMED

NuORDER официально описывает Order Trends:

- Top Product badges;
- ranking products by units ordered;
- разделение Immediate and Prebook;
- category trend shares and change;
- top colors;
- size trends for products with the same style number;
- AI similar-product recommendations;
- Suggested for You на основании order history;
- visibility rules set by the brand;
- periodic refresh and eligibility thresholds.

В текущей официальной документации NuORDER функция ограничена eligible brands/users и достаточным объемом данных; часть аналитики привязана к USD orders. Эти ограничения нельзя скрывать при сравнении.

**JOOR status:** отдельный comparable Order Trends layer по продуктам, категориям, цветам и размерам в проверенном кабинете не подтвержден.

**SYNTHA TARGET:**

- trend layer во всех поддерживаемых валютах через certified FX normalization;
- отдельно retailer-own trend, brand-network trend and market benchmark;
- trend confidence and sample size;
- minimum cohort thresholds;
- top product, rising product, declining product and anomaly badges;
- immediate/prebook/reorder segmentation;
- trend data directly inside PDP, assortment and order matrix;
- historic snapshots so Monday refresh не переписывает прошлое;
- ability to explain the numerator, denominator and covered population.

### 86.3 Assortments as live collaborative planning documents — COMPETITOR CONFIRMED

NuORDER официально описывает assortments как live collaborative documents для proposed buys and store-door planning.

Подтвержденные элементы:

- assortment by doors and deliveries;
- product selections and buying intent;
- notes at product, cluster and allocator level;
- quantities;
- placeholders / SMU;
- linking placeholder to real product;
- syncing product updates into assortment;
- single-brand and multi-brand assortments;
- XLS export;
- brand access to order-level intent data;
- rollups across assortments;
- target tables;
- target upload or spreadsheet paste;
- multiple targets per assortment;
- bulk linking of SMUs;
- order intents shared to brands.

**JOOR status:** Visual Assortment был gated; перечисленный выше full planning workflow в текущем доступе не подтвержден.

**SYNTHA TARGET:** взять механику NuORDER как baseline и расширить ее:

- financial, option, unit and margin targets;
- targets by store, cluster, category, brand, delivery, price band and color family;
- OTB reservation;
- SKU-level size curve;
- open-to-buy and cash-flow view;
- placeholder specification linked to line plan;
- conversion placeholder → actual style with variance report;
- plan, selection, order and received comparison;
- scenario branching;
- approval policy;
- consolidated rollup across buyers and legal entities;
- live collaborative cursor only for draft planning, not for immutable submitted orders.

### 86.4 Custom Lists and buyer-specific recommendations — COMPETITOR CONFIRMED

NuORDER Custom Lists support:

- product lists created by buyer or sales rep;
- delivery window;
- description, link, label and thumbnail;
- clone and share;
- notes per product;
- post-appointment recap;
- direct send or downloadable PDF/XLSX;
- campaign/open tracking;
- EZ Order mode;
- conversion into Working Order.

**JOOR status:** Looks/Styleboards подтверждены, но buyer-specific recommendation list with tracked send and direct order conversion не подтвержден полностью.

**SYNTHA TARGET:**

- Shortlist, Appointment List, Proposed Buy, Reorder List and Recovery List as explicit types;
- brand-created and retailer-created ownership;
- internal/private and shared fields;
- buyer acknowledgement;
- expiry and catalog version lock;
- conversion metrics;
- list-to-order and list-to-revenue attribution;
- safe external share link;
- buyer consent for open tracking.

### 86.5 Customer and User Groups — COMPETITOR CONFIRMED

NuORDER groups can manage:

- product visibility;
- promotions;
- order min/max rules;
- linesheet visibility;
- page widgets;
- buyer companies and brand users.

**JOOR status:** access by connection and account context подтвержден; flexible group-driven merchandising and rules engine в доступном кабинете не подтвержден.

**SYNTHA TARGET:**

- dynamic and static customer groups;
- criteria by geography, segment, channel, tier, performance, credit, contract and invitation;
- preview as group/company/location;
- rule conflict explanation;
- effective dates;
- change simulation before publish;
- audit of impacted products, customers and orders.

### 86.6 Price sheets and View As — COMPETITOR CONFIRMED

NuORDER supports product-level price sheets, customer assignment, multiple price visibility and View As company/pricing display.

**SYNTHA TARGET:**

- price-resolution trace showing every applied rule;
- preview as buyer company/location, currency and date;
- MSRP/wholesale/cost/margin field-level permission;
- price-per-size and customization surcharge;
- future-dated price simulation;
- alert when a draft order uses expired price context.

### 86.7 Customizable products and proof workflow — COMPETITOR CONFIRMED

NuORDER supports customizable products with:

- customization filter and badge;
- configurable options;
- required attributes;
- image/text/measurement selections;
- surcharges;
- edit from Working Order;
- proof file;
- proof download from order and email;
- export/import of customization data;
- reordering if template remains valid.

**JOOR status:** structured customization and proof lifecycle не подтвержден.

**SYNTHA TARGET:** full SMU/customization flow linked to PLM and production; detailed specification in section 98.

### 86.8 POS and Smart Reorder loop — COMPETITOR CONFIRMED

NuORDER + Lightspeed supports:

- two-way PO Sync;
- importing order and product data into POS;
- automatic supplier and product creation;
- images, descriptions, prices, SKUs, sizes and colors;
- receiving inventory in POS;
- ordering directly from replenishment reports;
- forecasted demand;
- suggested order quantities;
- grouping recommended products by supplier into a Working Order;
- reorder from inventory reports;
- preloaded product catalog.

**JOOR status:** Shopify integration entry подтвержден; equally deep POS-native reorder loop не подтвержден.

**SYNTHA TARGET:** POS-neutral replenishment loop across Lightspeed, Shopify POS, ERP and custom retail systems; detailed specification in section 96.

### 86.9 NuORDER limitations that Syntha should explicitly solve

According to official NuORDER documentation available during this review:

- Order Trends may not be available to all brands/users;
- some trend logic is limited to sufficient USD order data;
- trend refresh is periodic rather than always real-time;
- simultaneous editing of some linesheet objects is discouraged;
- assortment features may depend on configuration;
- advanced modules are entitlement-dependent.

Syntha should not repeat these ambiguities. Each feature must expose:

- entitlement;
- eligibility;
- refresh timestamp;
- population coverage;
- feature status: GA/Beta/Pilot;
- fallback behavior;
- precise reason when unavailable.

Official sources:

- https://x-series-support.lightspeedhq.com/hc/en-us/articles/46522641418523-Intro-to-Lightspeed-Wholesale-for-Retail-POS-X-Series
- https://x-series-support.lightspeedhq.com/hc/en-us/articles/49211379755547-NuORDER-Marketplace-overview-for-Retail-POS-X-Series-merchants
- https://helpdesk.nuorder.com/hc/en-us/articles/27071765927195-Order-Trends-overview
- https://helpdesk.nuorder.com/hc/en-us/articles/30678542786203-Brand-assortments-overview
- https://helpdesk.nuorder.com/hc/en-us/articles/18923106692379-Targets-in-assortments
- https://helpdesk.nuorder.com/hc/en-us/articles/200719648-Custom-Lists-for-buyers
- https://helpdesk.nuorder.com/hc/en-us/articles/13898584214939-Ordering-products-with-Customizations
- https://helpdesk.nuorder.com/hc/en-us/articles/115005653283-Customer-and-User-Groups
- https://helpdesk.nuorder.com/hc/en-us/articles/115005758446-Price-sheet-overview

---

## 87. Lightspeed Retail — то, что нужно перенести в retailer operating loop

Lightspeed показывает важное направление: wholesale order должен продолжаться внутри retail operations, а не заканчиваться кнопкой Submit.

### 87.1 Confirmed capabilities

- PO created in NuORDER syncs to POS;
- product and supplier records may be created automatically;
- product attributes sync with PO;
- receiving continues in POS;
- replenishment report proposes quantity;
- Smart Reorder groups items by supplier;
- buyer reviews and adjusts recommendation;
- completed PO returns into stock-control workflow;
- landed procurement costs can be distributed into product cost;
- multi-location inventory and sales analytics inform reorder.

### 87.2 SYNTHA TARGET — neutral retail integration layer

Syntha must not become dependent on one POS vendor.

Required architecture:

```text
Retail Source Adapter
→ Canonical Sale / Return / Stock / PO / Receipt Events
→ Data Quality and Mapping
→ Demand and Replenishment Engine
→ Buyer Review
→ Brand-specific Draft Orders
→ Confirmation
→ PO/Receipt Sync Back
```

Required entities:

- RetailLocation;
- ProductMapping;
- InventorySnapshot;
- SaleEvent;
- ReturnEvent;
- StockoutEvent;
- DemandForecast;
- ReplenishmentRecommendation;
- PurchaseOrderSync;
- Receipt;
- LandedCostAdjustment.

Required controls:

- source-system ownership;
- mapping confidence;
- duplicate detection;
- backfill window;
- sync lag;
- unresolved SKU queue;
- retry and replay;
- reconciliation totals;
- no recommendation from stale stock data without warning.

Official sources:

- https://x-series-support.lightspeedhq.com/hc/en-us/articles/46522641418523-Intro-to-Lightspeed-Wholesale-for-Retail-POS-X-Series
- https://x-series-support.lightspeedhq.com/hc/en-us/articles/47140576715035-Reordering-products-from-the-NuORDER-Marketplace-in-Retail-POS-X-Series
- https://x-series-support.lightspeedhq.com/hc/en-us/articles/47468923592603-Lightspeed-Wholesale-Glossary

---

## 88. Faire — marketplace risk services, которых недостаточно у обычного order portal

Faire differentiates not only through catalog and ordering, but through risk transfer and marketplace operations.

### 88.1 Confirmed capabilities

Official Faire materials confirm:

- retailer business verification before ordering;
- marketplace payment handling;
- guaranteed payment to brands for fulfilled orders, subject to platform terms;
- eligible retailer Net 60 terms;
- brand payout independent from retailer payment timing;
- opening-order returns financed and operated by Faire;
- prepaid return labels;
- return warehouse inspection and redistribution in supported markets;
- platform-managed refunds and invoice adjustments;
- shipping workflow, packing slips and commercial invoices;
- shipment tracking;
- payout speed options;
- marketplace commission model;
- cancellation and return windows;
- return metrics shown to retailer.

### 88.2 JOOR status

JOOR Pay подтвержден публично, но full marketplace-operated credit underwriting, first-order return risk transfer and return-warehouse model не подтверждены использованными источниками.

### 88.3 SYNTHA TARGET — optional managed marketplace services

These functions should be modular, because they create financial and legal exposure.

Modules:

1. **Retailer Verification**
   - legal business verification;
   - tax/resale documentation;
   - identity and authorized representative;
   - fraud signals;
   - decision and review queue.

2. **Trade Credit**
   - external credit provider or regulated partner;
   - limit and exposure;
   - due dates;
   - late-payment handling;
   - brand payout timing;
   - fee calculation;
   - country eligibility.

3. **Payment Guarantee**
   - guarantee eligibility;
   - covered amount;
   - exclusions;
   - fulfillment evidence;
   - payout state;
   - dispute state.

4. **Opening Order Protection**
   - first order definition;
   - return eligibility;
   - non-returnable categories;
   - return window;
   - platform/brand-funded policy;
   - warehouse disposition;
   - economics by cohort.

5. **Managed Shipping**
   - platform-negotiated label;
   - carrier selection;
   - shipment cost estimate;
   - commercial invoice;
   - tracking;
   - claim.

Critical rule: Syntha must never display “guaranteed payment” unless the guarantee provider, scope, exclusions and evidence are explicit.

Official sources:

- https://www.faire.com/support/articles/46375737307035
- https://www.faire.com/support/articles/360015892572
- https://www.faire.com/support/articles/360015892592
- https://www.faire.com/support/articles/360018414552
- https://www.faire.com/support/articles/360023300451

---

## 89. Brandboom — frictionless wholesale, engagement and rep control

### 89.1 Confirmed capabilities

Official Brandboom materials confirm:

- rich digital line sheets with video and lifestyle media;
- instantly updated buyer links and PDF export;
- buyer can view line sheets without a full account in some flows;
- direct ordering from shared link;
- real-time buyer activity and click tracking;
- visibility of open/draft orders;
- sales rep can intervene in stalled carts;
- buyer and seller collaboration on the same order;
- order, invoice, payment and shipment in one workspace;
- Stripe and PayPal payments;
- Shippo shipping integration;
- order export through API, Zapier and custom mapping;
- rep/territory performance;
- automatic commission calculation;
- Shopify and ApparelMagic integrations;
- ERP file-drop and API integration;
- real-time inventory where integration supports it;
- prepacks;
- multiple price lists and currencies;
- automatic volume discounts;
- multiple languages;
- Marketplace with merchant-of-record payment flow;
- buyer 60-day payment terms in marketplace flows;
- guaranteed seller payout subject to platform rules.

### 89.2 JOOR status

JOOR supports linesheets, ordering and payments, but the following Brandboom-style flows were not confirmed in the audited retailer cabinet:

- guest buyer line-sheet ordering without normal account onboarding;
- visible open carts with seller intervention;
- rep takeover of buyer draft;
- automatic rep commission statements;
- prepacks as a first-class product-ordering construct;
- no-code ERP file-drop mapping;
- cart recovery workflow tied directly to buyer engagement.

### 89.3 SYNTHA TARGET — improve, do not copy blindly

- Guest view may be accountless; placing a legally binding order requires verified identity or a controlled verification step.
- Seller may assist a draft only after buyer consent or when draft ownership is seller-created.
- After submission, all edits become amendments.
- Open/click tracking requires transparent privacy settings.
- Rep commission is calculated from certified order/invoice/payment states.
- Prepack ordering expands into pack templates, break-pack policy, inner/outer carton and size ratio analytics.
- Buyer inactivity workflow should create a task, not spam automatically.

Official sources:

- https://www.brandboom.com/
- https://www.brandboom.com/order-management
- https://www.brandboom.com/product-management
- https://support.brandboom.com/en/articles/14120706-manage-marketplace-orders-and-get-paid
- https://support.brandboom.com/en/articles/14120213-marketplace-faq-for-sellers

---

## 90. Pepperi — field sales, trade promotions and retail execution

Pepperi is not fashion-specific, but several operating capabilities are valuable for wholesale brands with field teams and store networks.

### 90.1 Confirmed capabilities

Official Pepperi materials confirm:

- self-service B2B ecommerce;
- buyer-specific catalog, pricing, discounts and order history;
- mobile order-taking for reps;
- online/offline native apps;
- complete account information in the field;
- sales-rep activity planning and dashboards;
- mobile CRM;
- configurable forms and surveys;
- asset reviews;
- returns;
- inventory access;
- trade promotions;
- cross-sell and upsell rules;
- item, bundle, package, category and volume incentives;
- retail execution;
- route planning;
- direct store delivery / route accounting;
- van inventory, invoicing and payment collection;
- operational analytics;
- no-code workflows, forms, rules and dashboards;
- multi-site, multi-catalog, multi-price-list, multi-language and multi-currency;
- iPaaS and many ERP connectors.

### 90.2 JOOR status

Field-sales execution, route accounting, store audit and configurable no-code business rules were not confirmed in the audited JOOR cabinet.

### 90.3 SYNTHA TARGET — fashion adaptation

1. **Showroom and Market Rep App**
   - offline product and account data;
   - appointment plan;
   - buyer shortlist;
   - proposed order;
   - note and photo capture;
   - follow-up task.

2. **Wholesale Door Visit**
   - store visit plan;
   - assortment compliance;
   - visual merchandising check;
   - stock count;
   - display/photo evidence;
   - local demand note;
   - replenishment proposal;
   - issue escalation.

3. **Trade Promotion Execution**
   - promotion eligibility;
   - order-level application;
   - display commitment;
   - retailer evidence;
   - accrual and claim;
   - ROI.

4. **Offline Control**
   - encrypted dataset;
   - conflict resolution;
   - explicit unsubmitted state;
   - no duplicate order after reconnect.

Official sources:

- https://www.pepperi.com/
- https://www.pepperi.com/platform-overview/
- https://www.pepperi.com/resources/features/
- https://www.pepperi.com/why-pepperi/

---

## 91. Shopify B2B — company-location commerce model as mandatory baseline

Shopify B2B reinforces that B2B customer is not one flat account.

Confirmed capabilities include:

- company;
- multiple company locations;
- multiple contacts;
- catalog assignment by company or location;
- customer-specific products and prices;
- currencies;
- quantity rules;
- volume pricing;
- discounts;
- payment terms;
- tax IDs and exemptions;
- B2B checkout.

### SYNTHA TARGET

Every commercial calculation must resolve against:

```text
Buyer User
→ Membership
→ Buyer Company
→ Company Location / Door
→ Territory
→ Catalog
→ Price List
→ Currency
→ Tax Profile
→ Payment Terms
→ Shipping Rules
```

Required screens:

- company hierarchy;
- location commercial settings;
- assigned contacts and roles;
- assigned catalogs;
- preview checkout as location;
- effective date history;
- conflicts and missing setup;
- bulk assignment;
- import/export.

Official source:

- https://help.shopify.com/en/manual/b2b/catalogs/index

---

## 92. PLM analogs — best capabilities absent from ordinary wholesale platforms

### 92.1 Delogue — supplier collaboration and live product record

Official Delogue materials confirm:

- one structured product record;
- BOM integrated into style;
- reusable central item/component library;
- bulk update or replacement of components across styles;
- supplier users collaborating directly in the same workflow;
- item clone by supplier;
- sample requests across one or multiple styles;
- sample status, comments, quantities, files and approvals;
- communication attached to style/material/sample;
- decision/change history;
- live reports and collection overviews;
- saved and shareable reports;
- some updates from report views;
- size charts, grading, care, SKU/barcodes, prepacks and lab dips;
- Adobe/Illustrator-oriented integration.

**SYNTHA TARGET:**

- supplier portal at no additional per-supplier barrier for core collaboration;
- field-level share policy;
- bulk material substitution impact analysis;
- sample cart and batch requests;
- editable operational reports with audit;
- native design-plugin API;
- decision history linked to margin and calendar impact.

### 92.2 Centric — connected planning, pricing, inventory and PXM

Official Centric materials confirm integrated focus on:

- PLM;
- merchandise and assortment planning;
- pricing and inventory optimization;
- allocation and replenishment;
- market intelligence;
- visual boards;
- PXM/content commercialization;
- testing, quality, compliance and sustainability;
- AI-assisted market and product insight;
- what-if and lifecycle decision support.

**SYNTHA TARGET:**

- do not isolate PLM from commercial planning;
- plan target price, target cost, unit count and margin inside line plan;
- send approved product projection into wholesale catalog;
- return actual sell-through, markdown, returns and margin into next line plan;
- single visual board object connected to plan, style, assortment and campaign;
- PXM readiness per channel.

### 92.3 WFX — versioning and multi-cost-sheet discipline

Official WFX materials confirm:

- style information, specs, grading, labels, construction and packaging;
- fabric/trim library;
- product variants and versioning;
- change log by user/date/time;
- BOM;
- multiple cost sheets;
- indirect cost inclusion;
- margin analysis;
- online supplier product specs;
- approvals and testing management.

**SYNTHA TARGET:**

- immutable cost versions;
- side-by-side target/quoted/negotiated/PO/actual cost;
- change impact on margin, price and order;
- supplier acknowledgement of released specification;
- automated detection of stale tech-pack usage.

Official sources:

- https://www.delogue.com/platform/core-features
- https://www.delogue.com/en/solution
- https://www.centricsoftware.com/fashion-apparel
- https://www.centricsoftware.com/centric-planning-pricing
- https://apptest.wfxondemand.com/web-pdm-fashion-apparel.html

---

## 93. Gap matrix — лучшие возможности аналогов, не подтвержденные в JOOR audit

`JOOR NOT CONFIRMED` ниже не означает доказанное отсутствие; это список обязательного UAT и product-gap design.

| Capability | Benchmark | JOOR evidence status | Syntha requirement | Priority |
|---|---|---|---|---|
| Multi-brand product shopping | NuORDER | NOT CONFIRMED | Global product discovery + split master basket | P1 |
| AI brand/product recommendations | NuORDER | NOT CONFIRMED | Explainable ranking with business guardrails | P2 |
| Product/category/color/size trends | NuORDER | NOT CONFIRMED | Certified network trend layer | P1 |
| Top-product badges | NuORDER | NOT CONFIRMED | Confidence-aware trend badges | P1 |
| Multi-door collaborative assortment | NuORDER | GATED/UAT | Native planning workspace | P1 |
| Assortment targets upload/paste | NuORDER | NOT CONFIRMED | Target engine with OTB/margin | P1 |
| Assortment rollups | NuORDER | NOT CONFIRMED | Rollup across buyers/doors/entities | P1 |
| SMU placeholders and bulk linking | NuORDER | NOT CONFIRMED | Line-plan placeholder → real style | P1 |
| Order intents before PO | NuORDER | NOT CONFIRMED | Buying intent state and forecast | P1 |
| Campaign open tracking | NuORDER/Brandboom | NOT CONFIRMED | Consent-aware engagement analytics | P2 |
| Customizable product proofs | NuORDER | NOT CONFIRMED | Customization + proof + production link | P1 |
| Smart reorder from POS | Lightspeed | NOT CONFIRMED | Supplier-grouped reorder recommendation | P1 |
| Automatic PO/product sync into POS | Lightspeed | NOT CONFIRMED | POS-neutral bi-directional integration | P1 |
| Retailer verification | Faire | NOT CONFIRMED | Marketplace trust service | P2 |
| Platform-funded first-order returns | Faire | NOT CONFIRMED | Optional risk product | P3 |
| Net terms with independent brand payout | Faire | NOT CONFIRMED | Credit partner integration | P3 |
| Managed return labels/warehouse | Faire | NOT CONFIRMED | Optional managed returns | P3 |
| Guest buyer line-sheet access | Brandboom | NOT CONFIRMED | Secure expiring guest view | P1 |
| Seller visibility into open carts | Brandboom | NOT CONFIRMED | Draft engagement with privacy controls | P2 |
| Seller-assisted cart recovery | Brandboom | NOT CONFIRMED | Consent-based draft assistance | P2 |
| Automatic rep commissions | Brandboom | NOT CONFIRMED | Certified commission engine | P2 |
| Prepacks as first-class ordering | Brandboom/Delogue | NOT CONFIRMED | Pack templates and break-pack policy | P1 |
| No-code ERP file mapping | Brandboom/Pepperi | NOT CONFIRMED | Mapping studio and activity center | P2 |
| Trade promotions rule engine | Pepperi | NOT CONFIRMED | Promotion eligibility and accrual | P2 |
| Native offline rep app | Pepperi | PARTIAL/UAT | Encrypted offline market workflow | P2 |
| Retail execution/store audits | Pepperi | NOT CONFIRMED | Door visit and VM compliance | P3 |
| Configurable forms/surveys | Pepperi | NOT CONFIRMED | No-code operational forms | P2 |
| Company-location catalogs | Shopify B2B | PARTIAL/UAT | Canonical B2B commercial hierarchy | P0 |
| Quantity rules/volume pricing | Shopify B2B | NOT CONFIRMED | Pricing and quantity rule engine | P1 |
| Supplier shared BOM workspace | Delogue | NOT CONFIRMED | Supplier portal with field sharing | P1 |
| Bulk component replacement | Delogue | NOT CONFIRMED | Impact-controlled material substitution | P1 |
| Live editable collection reports | Delogue | NOT CONFIRMED | Operational report write-back | P2 |
| Integrated PLM + planning + pricing | Centric | NOT CONFIRMED | Closed-loop fashion OS | P1 |
| PXM/content syndication | Centric | NOT CONFIRMED | Channel-ready content projection | P2 |
| Multiple cost sheets with indirect cost | WFX | NOT CONFIRMED | Versioned cost comparison | P1 |

---

## 94. Assortment, target and rollup engine — detailed Syntha specification

### 94.1 Entities

```text
Assortment
AssortmentVersion
AssortmentLine
AssortmentDoor
AssortmentDelivery
AssortmentTarget
AssortmentTargetCell
AssortmentRollup
PlaceholderStyle
PlaceholderLink
BuyingIntent
AssortmentApproval
AssortmentComment
AssortmentScenario
```

### 94.2 Assortment header

- name;
- season;
- collection scope;
- retailer organization;
- legal entity;
- buyer team;
- currency;
- reporting currency;
- status;
- owner;
- version;
- doors/clusters;
- deliveries;
- budget source;
- approval policy;
- source catalog versions;
- last sync timestamp.

### 94.3 Line fields

- product or placeholder;
- brand;
- style/color/SKU;
- category;
- delivery;
- wholesale;
- landed cost;
- retail price;
- margin;
- units by door and size;
- value;
- OTB consumption;
- role in assortment;
- allocator note;
- buyer note;
- brand-shared note;
- availability;
- risk flags;
- recommendation reason;
- manual override reason.

### 94.4 Target types

- value;
- units;
- style count;
- option count;
- SKU count;
- intake margin;
- gross margin forecast;
- retail value;
- price-band mix;
- category mix;
- brand mix;
- color-family mix;
- delivery mix;
- carry-over/newness;
- sustainable attribute share;
- store capacity;
- OTB;
- cash-flow month.

### 94.5 State machine

```text
DRAFT
→ IN_REVIEW
→ CHANGES_REQUESTED
→ APPROVED
→ LOCKED_FOR_ORDER_INTENT
→ PARTIALLY_CONVERTED
→ CONVERTED_TO_ORDERS
→ ARCHIVED
```

Changes after approval create a new version or controlled revision.

### 94.6 Rollup

Rollup can aggregate by:

- legal entity;
- buyer;
- store;
- cluster;
- brand;
- category;
- delivery;
- currency;
- status;
- scenario.

It must show:

- target;
- selected;
- variance;
- approved;
- ordered;
- confirmed;
- received;
- sold;
- ending stock.

### 94.7 Placeholder / SMU

Placeholder contains:

- desired category;
- product brief;
- target price;
- target cost;
- target margin;
- delivery;
- planned units;
- colors;
- size range;
- image/sketch;
- assigned brand or open sourcing;
- match criteria;
- linked actual product;
- variance report.

### 94.8 Required events

- assortment_created;
- target_uploaded;
- line_added;
- placeholder_created;
- placeholder_linked;
- quantity_changed;
- target_breached;
- scenario_created;
- assortment_submitted;
- assortment_approved;
- buying_intent_shared;
- assortment_converted_to_order.

### 94.9 Acceptance criteria

- paste 10,000 target cells without browser freeze;
- support 100+ doors and 50,000 SKU-door cells through virtualization;
- formula totals remain identical after export/import;
- concurrent edits produce visible conflict, not silent overwrite;
- every order line traces to assortment line/version;
- permission prevents brand from seeing retailer private target/margin;
- rollup reconciles exactly to component assortments.

---

## 95. Wholesale trend intelligence and privacy controls

### 95.1 Trend grains

- product;
- style;
- color;
- size;
- category;
- price band;
- brand;
- market;
- retailer segment;
- immediate/prebook/reorder;
- week/month/season.

### 95.2 Metrics

- ordered units;
- ordered value;
- unique buyers;
- conversion;
- reorder rate;
- median order size;
- velocity;
- growth;
- rank;
- percentile;
- share of category;
- size share;
- color share;
- return/cancellation rate where permitted.

### 95.3 Privacy

Network benchmark requires:

- minimum number of independent retailer organizations;
- minimum order volume;
- aggregation;
- no single-retailer inference;
- no competitor-specific sensitive detail;
- opt-in/contract basis;
- geographic and legal restrictions;
- suppression of sparse cells;
- access logging;
- data retention policy.

### 95.4 Badge logic

```text
Top Product
= rank within eligible population
AND minimum units
AND minimum buyers
AND acceptable cancellation/return quality
```

A high unit count from one buyer must not automatically create a marketplace bestseller badge.

### 95.5 Recommendation explanation

Every recommended product displays:

- recommendation type;
- strongest factors;
- availability timestamp;
- price context;
- confidence;
- business constraints applied;
- sponsored/non-sponsored status;
- hide/not relevant feedback.

---

## 96. Smart reorder and retail feedback loop — detailed specification

### 96.1 Inputs

- on hand;
- on order;
- in transit;
- reserved;
- sales history;
- returns;
- stockout days;
- lead time;
- delivery calendar;
- MOQ/MOV;
- pack size;
- safety stock;
- season end;
- expected markdown;
- supplier ATS/ATP;
- buyer budget;
- margin.

### 96.2 Base calculation

```text
Forecast Demand during Lead Time
= Forecast Daily Demand × Effective Lead-Time Days

Net Requirement
= Forecast Demand during Lead Time
+ Safety Stock
- On Hand
- Confirmed Inbound

Suggested Order Qty
= round_to_pack(max(0, Net Requirement))
```

The production algorithm may be more advanced, but these components must remain inspectable.

### 96.3 Flow

```text
Retail data received
→ Mapping and quality check
→ Forecast calculated
→ Constraint check
→ Suggested quantities grouped by supplier
→ Buyer reviews
→ Budget/margin check
→ Draft orders created
→ Supplier availability check
→ Submit/confirm
→ PO sync back
→ Receipt and actual performance
```

### 96.4 Buyer controls

- accept all;
- accept selected;
- override quantity;
- exclude SKU;
- snooze recommendation;
- substitute product;
- change supplier;
- change delivery;
- set max investment;
- save rule;
- reason required for material override.

### 96.5 Learning loop

Record:

- recommendation;
- accepted quantity;
- override;
- reason;
- confirmed quantity;
- received quantity;
- sold quantity;
- markdown;
- stockout;
- outcome window.

---

## 97. Buyer engagement, outreach and cart recovery

### 97.1 Engagement events

- presentation_sent;
- email_delivered;
- email_opened where lawful and consented;
- link_opened;
- linesheet_viewed;
- product_viewed;
- product_saved;
- quantity_entered;
- cart_created;
- cart_abandoned;
- rep_followup_created;
- buyer_replied;
- order_submitted.

### 97.2 Engagement workspace

For seller/rep:

- buyer/company;
- last activity;
- viewed products;
- saved list;
- open cart value;
- inactive duration;
- delivery/price changes since activity;
- recommended next action;
- contact preference;
- owner;
- SLA;
- outcome.

### 97.3 Draft assistance rules

- buyer-owned private draft is not editable by seller by default;
- buyer can request help and grant timed access;
- seller-created proposal is explicitly labeled;
- seller edits are visible before buyer acceptance;
- after order submission, amendment rules apply;
- no hidden quantity or price changes;
- all assistance actions audited.

### 97.4 Cart recovery guardrails

- frequency cap;
- quiet hours;
- unsubscribe/contact preference;
- no message after buyer explicitly rejects;
- suppress when product is unavailable or price expired;
- measure incremental conversion, not only contacted revenue.

---

## 98. Customization, SMU and made-to-order workflow

### 98.1 Customization template

- template ID/version;
- eligible products;
- eligible customers;
- option groups;
- required/optional;
- dependencies;
- validation;
- price surcharge;
- production lead-time impact;
- image/artwork requirements;
- proof requirement;
- expiration.

### 98.2 Option types

- text;
- number;
- measurement;
- color;
- material;
- placement;
- embroidery;
- print;
- monogram;
- logo upload;
- trim;
- packaging;
- quantity-dependent configuration.

### 98.3 State machine

```text
CONFIGURED
→ VALIDATED
→ SUBMITTED
→ PROOF_REQUIRED
→ PROOF_CREATED
→ BUYER_REVIEW
→ APPROVED / CHANGES_REQUESTED
→ PRODUCTION_RELEASED
→ COMPLETED
```

### 98.4 Order line snapshot

Customized order line stores:

- base product version;
- customization template version;
- selected values;
- uploaded files and checksum;
- surcharge breakdown;
- lead-time effect;
- proof version;
- approval;
- production instructions;
- reorder compatibility status.

### 98.5 PLM/production connection

Customization can:

- create an SMU colorway/SKU;
- create a one-off production specification;
- reuse approved template;
- trigger material availability check;
- trigger artwork approval;
- generate BOM/BOL delta;
- generate factory instruction attachment.

---

## 99. Trade promotions and wholesale incentives engine

### 99.1 Promotion types

- item discount;
- category discount;
- quantity tier;
- order value tier;
- buy X get Y;
- bundle/package;
- early order;
- preseason commitment;
- free freight;
- payment-term incentive;
- display allowance;
- markdown support;
- sample/tester allowance;
- retailer-specific rebate.

### 99.2 Rule scope

- customer group;
- company/location;
- country;
- currency;
- brand;
- category;
- product;
- delivery;
- date/time;
- channel;
- sales rep;
- order type;
- quantity/value threshold.

### 99.3 Conflict and stacking

Each promotion defines:

- combinable/non-combinable;
- priority;
- best-price or first-match;
- max benefit;
- exclusion list;
- manual approval threshold;
- budget owner;
- funding split.

### 99.4 Accrual and ROI

```text
Promotion ROI
= Incremental Gross Margin - Promotion Cost - Execution Cost
  divided by Promotion Cost + Execution Cost
```

Need holdout or baseline method; gross sales alone do not prove effectiveness.

### 99.5 Evidence

For display/retail-execution incentives:

- task;
- store;
- photo;
- timestamp;
- geolocation where lawful;
- approval;
- claim;
- settlement.

---

## 100. Retail execution and offline field operations

### 100.1 Visit plan

- retailer location;
- purpose;
- rep;
- planned date/window;
- route;
- priority;
- required forms;
- open issues;
- last visit;
- expected outcome.

### 100.2 Visit execution

- check-in;
- contact met;
- stock observation;
- merchandising compliance;
- display/share-of-space;
- competitor observation;
- product feedback;
- photo/video evidence;
- replenishment need;
- return/defect issue;
- follow-up tasks;
- signature/acknowledgement where required.

### 100.3 Offline package

- selected accounts;
- product catalog subset;
- valid price lists;
- inventory timestamp;
- forms;
- open orders/tasks;
- encrypted assets;
- expiry;
- sync conflict policy.

### 100.4 Analytics

- visits completed;
- visit compliance;
- orders per visit;
- replenishment conversion;
- issue closure;
- visual compliance;
- promotion execution;
- rep productivity;
- travel efficiency.

---

## 101. Managed marketplace risk and services architecture

### 101.1 Service boundaries

Syntha Core must work without becoming lender, insurer, carrier or merchant of record.

Optional services may be delivered through licensed partners:

- identity/business verification;
- payment processing;
- trade credit;
- payment guarantee;
- shipping labels;
- return logistics;
- insurance;
- tax calculation;
- customs brokerage.

### 101.2 Marketplace order contract

- seller of record;
- merchant of record;
- payment processor;
- credit provider;
- return-risk owner;
- shipping-cost owner;
- tax responsibility;
- dispute process;
- governing terms version.

### 101.3 Economics ledger

For every marketplace order:

- product subtotal;
- seller discount;
- platform-funded incentive;
- retailer fee;
- commission;
- payment fee;
- financing fee;
- shipping;
- return reserve;
- payout;
- refund;
- recovery;
- contribution margin.

### 101.4 Risk dashboard

- approved exposure;
- utilization;
- delinquency;
- fraud alerts;
- return rate;
- disputed amount;
- guarantee claims;
- net loss;
- concentration by buyer/brand/country.

---

## 102. Guest access and frictionless buying

### 102.1 Guest presentation link

- random high-entropy token;
- expiry;
- optional email verification;
- allowed products/fields;
- allowed prices;
- allowed actions;
- territory/IP policy where justified;
- revoke;
- view audit;
- rate limits.

### 102.2 Guest states

```text
LINK_CREATED
→ OPENED
→ VERIFIED_OPTIONAL
→ VIEWING
→ CART_STARTED
→ IDENTITY_REQUIRED
→ VERIFIED_BUYER
→ ORDER_SUBMITTED
→ EXPIRED / REVOKED
```

### 102.3 Friction rules

- browsing may be accountless;
- internal cost/margin never exposed;
- customer-specific price requires verified context;
- order submission requires business identity and terms acceptance;
- previously shared link must not reveal later restricted products;
- link uses catalog snapshot or clearly displays live-update behavior.

---

## 103. Competitor patterns we should not copy literally

### 103.1 Silent collaborative editing after submission

Some competitors market buyer/seller editing of the same order. Syntha uses:

- live collaboration in draft/proposal;
- explicit amendment after submission;
- counterparty acceptance;
- immutable prior versions.

### 103.2 Opaque bestseller and recommendation badges

Do not display a badge without:

- covered population;
- period;
- minimum sample;
- metric;
- sponsorship label;
- eligibility explanation.

### 103.3 Platform-guaranteed payment without contractual clarity

Do not promise guarantee unless a regulated/contracted provider covers defined risk.

### 103.4 Unlimited buyer tracking

Open/click tracking must respect privacy law, consent and customer settings.

### 103.5 Marketplace return subsidy as default SaaS feature

Risk-funded returns are an optional financial product, not a free UI checkbox.

### 103.6 Direct PLM record exposure to buyer

Wholesale Catalog Product is a controlled commercial projection from approved PLM data.

### 103.7 One vendor POS lock-in

NuORDER/Lightspeed integration is strong, but Syntha must remain POS-neutral through canonical data contracts.

---

## 104. Revised priority based on competitor research

### Baseline required before market positioning

- company/location commercial model;
- customer-specific catalog and pricing;
- live ATS with timestamp;
- working order;
- order approval and confirmation;
- custom lists/proposals;
- guest presentation link;
- prepacks and delivery windows;
- ERP/POS product and PO sync;
- buyer activity and draft recovery;
- marketplace discovery;
- basic order/product trend analytics.

### Differentiators required to be stronger than JOOR/NuORDER

- PLM-to-catalog projection;
- target costing and BOM;
- assortment targets and rollups;
- OTB and cash control;
- ATP from inventory + production capacity;
- RFQ and supplier cost comparison;
- order-to-production traceability;
- QC, claims and actual landed cost;
- sell-through feedback into planning;
- certified semantic layer;
- auditable AI;
- optional managed credit/returns marketplace services.

### Immediate P0/P1 backlog additions

1. AssortmentTarget and AssortmentRollup.
2. PlaceholderStyle / SMU.
3. CustomList and ProposedOrder.
4. ProductCustomizationTemplate and Proof.
5. CompanyLocationCatalogAssignment.
6. PackTemplate.
7. InventorySnapshot and ATS.
8. POSProductMapping and POSyncJob.
9. EngagementEvent and DraftAssistanceGrant.
10. TrendMetricSnapshot.
11. ReplenishmentRecommendation.
12. PromotionRule.
13. SupplierSharedWorkspace.
14. CommercialProductProjection.
15. MetricDefinition registry.

---

## 105. Additional official source register

### NuORDER / Lightspeed

- https://www.lightspeedhq.com/partners/b2b/
- https://x-series-support.lightspeedhq.com/hc/en-us/articles/46522641418523-Intro-to-Lightspeed-Wholesale-for-Retail-POS-X-Series
- https://x-series-support.lightspeedhq.com/hc/en-us/articles/49211379755547-NuORDER-Marketplace-overview-for-Retail-POS-X-Series-merchants
- https://x-series-support.lightspeedhq.com/hc/en-us/articles/47140576715035-Reordering-products-from-the-NuORDER-Marketplace-in-Retail-POS-X-Series
- https://helpdesk.nuorder.com/hc/en-us/articles/27071765927195-Order-Trends-overview
- https://helpdesk.nuorder.com/hc/en-us/articles/30678542786203-Brand-assortments-overview
- https://helpdesk.nuorder.com/hc/en-us/articles/18923106692379-Targets-in-assortments
- https://helpdesk.nuorder.com/hc/en-us/articles/43031595511451-Assortments-update-October-2025
- https://helpdesk.nuorder.com/hc/en-us/articles/200719648-Custom-Lists-for-buyers
- https://helpdesk.nuorder.com/hc/en-us/articles/360040938392-Creating-a-Custom-List
- https://helpdesk.nuorder.com/hc/en-us/articles/13898584214939-Ordering-products-with-Customizations
- https://helpdesk.nuorder.com/hc/en-us/articles/115005653283-Customer-and-User-Groups
- https://helpdesk.nuorder.com/hc/en-us/articles/115005758446-Price-sheet-overview
- https://helpdesk.nuorder.com/hc/en-us/articles/360046176951-Virtual-showrooms

### Faire

- https://www.faire.com/support/articles/46375737307035
- https://www.faire.com/support/articles/360015892572
- https://www.faire.com/support/articles/360015892592
- https://www.faire.com/support/articles/360018414552
- https://www.faire.com/support/articles/360023300451

### Brandboom

- https://www.brandboom.com/
- https://www.brandboom.com/order-management
- https://www.brandboom.com/product-management
- https://support.brandboom.com/en/articles/14120706-manage-marketplace-orders-and-get-paid
- https://support.brandboom.com/en/articles/14120213-marketplace-faq-for-sellers

### Pepperi

- https://www.pepperi.com/
- https://www.pepperi.com/platform-overview/
- https://www.pepperi.com/resources/features/
- https://www.pepperi.com/why-pepperi/

### PLM / planning

- https://www.delogue.com/platform/core-features
- https://www.delogue.com/en/solution
- https://www.centricsoftware.com/fashion-apparel
- https://www.centricsoftware.com/centric-planning-pricing
- https://apptest.wfxondemand.com/web-pdm-fashion-apparel.html

### Final decision

NuORDER is currently the strongest direct benchmark for retailer assortment planning, trend intelligence, POS-linked replenishment and collaborative buying intent. Faire is the strongest benchmark for marketplace risk transfer. Brandboom is a strong benchmark for frictionless line-sheet sales, engagement and rep workflow. Pepperi is a strong benchmark for field sales, trade promotions and offline retail execution. Centric, Delogue and WFX define the PLM/planning baseline.

Syntha should combine these strengths while preserving stricter order versioning, better financial traceability and a single product lifecycle from idea to sell-through.

---

## 106. Benchmark correction: what is market parity and what is a real gap

Новые официальные материалы уточняют, что immersive virtual showroom сам по себе уже не может считаться преимуществом над JOOR.

### 106.1 JOOR PUBLICLY CONFIRMED parity

JOOR публично подтверждает:

- drag-and-drop virtual showroom templates;
- 360-degree media and video;
- public and private views;
- shoppable lookbooks;
- collection and product highlights;
- shareable links and QR codes;
- integrated shopping;
- multi-page layouts;
- saved assortments and personalized links;
- retailer-specific curation;
- product, region and customer analytics.

### 106.2 NuORDER PUBLICLY CONFIRMED parity

NuORDER публично подтверждает:

- interactive virtual showrooms;
- 360-degree and 3D product imagery;
- dynamic video;
- shoppable hotspots;
- multiple merchandising layouts;
- virtual market appointment support;
- product notes and order planning.

### 106.3 Product conclusion

Следующие функции являются market parity, а не уникальным преимуществом Syntha:

- 360/3D media;
- video and shoppable hotspots;
- digital catalog;
- shareable showroom;
- mobile-assisted appointments;
- basic showroom analytics.

Реальный gap создают:

- assortment targets and rollups;
- store-photo visual merchandising;
- revenue-attributed campaigns;
- multi-shipment orchestration;
- event microsites and group ordering;
- licensing and royalty control;
- sales-agency commission accounting;
- supplier self-service and product approval;
- persistent cart across complex buying contexts;
- PLM, production and financial traceability.

Official sources:

- https://www.joor.com/virtual-showroom
- https://www.joor.com/wholesale-management
- https://www.nuorder.com/wholesale/virtual-showrooms/
- https://www.nuorder.com/wholesale/online-wholesale-platform/

---

## 107. Elastic Suite — strongest benchmark for digital merchandising and visual sell-in

### 107.1 COMPETITOR CONFIRMED capabilities

Elastic Suite publicly confirms:

- role-personalized branded dashboard;
- rich digital catalogs;
- images, video, 360-degree views and 3D renderings;
- customer-specific custom collections;
- customer-specific pricing inside collections;
- print-ready and shareable catalogs;
- Whiteboard for product placement on store-specific photos and POP displays;
- marketing assets, fixtures and text on Whiteboard;
- shoppable merchandising boards;
- Assortment Builder for retailer, season, region, promotion and sales context;
- shareable assortment links and exports;
- order, backorder, invoice and shipment tracking;
- real-time multi-shipment order creation;
- quick order using real-time and future inventory;
- sales campaigns connected to product catalogs;
- campaign metrics linking email, products, sales and revenue;
- customer-specific pricing and retailer-specific catalogs;
- ERP, accounting, payment and back-office integration.

### 107.2 JOOR evidence status

JOOR publicly confirms virtual showrooms, curation and analytics. The following Elastic-style capabilities are not confirmed in the audited JOOR retailer cabinet:

- store-photo/POP visual merchandising Whiteboard;
- order-integrated Whiteboard;
- detailed campaign-to-product-to-revenue attribution;
- multi-shipment construction inside one active order;
- customer-specific Custom Collection with printable sales proposal as a canonical object;
- visual merchandising assets and fixtures connected to the order.

### 107.3 SYNTHA TARGET

Syntha must combine Elastic-style sell-in tools with planning and financial controls:

- VisualBoard linked to Assortment and Order;
- store/fixture photo as canvas background;
- products, marketing assets, furniture and annotations as layers;
- selected quantity and value on every product object;
- visibility of target, selected, ordered and confirmed values;
- link board placement to store/door and cluster;
- convert board into assortment lines or order lines;
- campaign attribution to product views, shortlist, draft, confirmed order, shipment and gross margin;
- create multiple shipment groups without duplicating the order;
- preserve immutable shipment agreement after confirmation.

### 107.4 Competitor pattern not to copy

Elastic support documentation indicates that submitted orders become locked and changes are handled through representatives. Syntha should preserve strict locking but add a formal Order Amendment workflow rather than forcing off-platform correction.

Official sources:

- https://www.elasticsuite.com/platform/
- https://www.elasticsuite.com/
- https://www.elasticsuite.com/demo/
- https://support.elasticsuite.com/create-standard-order-flow
- https://support.elasticsuite.com/create-a-whiteboard-flow

---

## 108. RepSpark — event commerce, persistent buying and licensing benchmark

### 108.1 COMPETITOR CONFIRMED capabilities

RepSpark publicly confirms:

- Always-On Cart with persistent progress across pages and sessions;
- dynamic multi-date and multi-location ordering;
- live and allotted inventory views;
- pre-book ordering;
- custom assortments;
- digital catalogs and virtual showrooms;
- microsites for events, launches and temporary shops;
- product customization;
- Insignia workflows for logos and artwork;
- Licensing workflows for approved logos and products;
- automatic licensor filtering;
- automatic royalty calculation and price adjustment;
- in-platform approvals;
- multi-brand management;
- multi-warehouse management;
- multi-currency and multilingual support;
- ERP integrations and open API;
- retailer discovery community;
- trending and recommended brands;
- AI-powered Order Insights;
- accounts receivable and invoice payment;
- contacts, accounts, tasks, lists and campaigns in the supporting product environment.

### 108.2 Event microsites

RepSpark event workflows publicly describe:

- curated event assortment;
- approved products and logos;
- open/close dates;
- event-specific instructions;
- multiple payment structures;
- attendee self-service ordering;
- size and customization selection;
- inventory validation and hold;
- direct-to-attendee shipping or event pickup;
- consolidated order summary;
- no-code setup;
- event orders separated from ordinary orders;
- points-based event value in some configured flows.

### 108.3 AI Order Insights

RepSpark describes contextual order insights that can identify:

- retailers at risk of not reordering;
- unusual order patterns;
- upsell opportunities;
- accounts that deserve sales-rep attention.

These are marketing descriptions rather than a complete public model specification. Syntha must therefore treat them as benchmark direction, not as a verified algorithm.

### 108.4 JOOR evidence status

The following were not confirmed in the audited JOOR retailer cabinet:

- persistent cart across catalogs and operational pages;
- event-specific microsite and participant order consolidation;
- licensing and automatic royalty engine;
- allotted inventory per customer/event;
- dynamic multi-date and multi-location order workspace;
- order-centric AI next-best-action feed;
- multi-brand brand-owner administration as one operational tenant.

### 108.5 SYNTHA TARGET

- persistent CartWorkspace with explicit commercial context;
- EventCommerce module;
- LicensingAgreement and RoyaltyRule;
- InventoryAllotment by account, event, channel and date;
- MultiDeliveryOrderBuilder;
- OrderInsight with source data, confidence and action outcome;
- multi-brand group administration with brand-specific data walls;
- event P&L from demand capture through fulfillment.

Official sources:

- https://www.repspark.com/
- https://www.repspark.com/customers/features-and-updates
- https://www.repspark.com/product-customization
- https://www.repspark.com/event-microsites
- https://support.repspark.com/core-products

---

## 109. MarketTime — sales-agency and multi-line order benchmark

### 109.1 COMPETITOR CONFIRMED capabilities

MarketTime publicly confirms:

- order writing on desktop, iPhone, iPad and Android;
- online and offline order writing;
- multi-line orders for independent reps and agency groups;
- itemized PO generation;
- splitting a multi-line order into manufacturer orders at completion;
- barcode scanning for order capture;
- PDF hotspotting;
- simple reorder;
- customer management;
- manufacturer management;
- divisions and territory management;
- customer GeoMap;
- promotions and digital assets;
- shoppable catalogs;
- order-status synchronization between brand, agency and customer;
- invoice tracking;
- commission tracking;
- automatic split salesperson commission;
- order-writer attribution;
- import/export and ERP integration;
- secure buyer-driven invoice payment through InvoicePay / mtCharge+.

### 109.2 JOOR evidence status

The following agency-centric capabilities were not confirmed in the audited JOOR retailer cabinet:

- one cross-manufacturer order-writing session that splits at completion;
- agency/manufacturer/rep as separate commercial principals;
- automatic split commissions;
- effective-dated commission rules;
- barcode-first showroom order capture;
- geographic account routing and territory map;
- offline order writing designed around independent agencies.

### 109.3 SYNTHA TARGET

Syntha must support both direct brand sales and multi-brand agency sales.

Required model:

```text
SalesAgency
→ Division
→ Territory
→ Manufacturer / Brand Principal
→ Representative
→ OrderWriter
→ Retailer Account
```

Required process:

```text
Buyer session
→ Scan/search products across authorized brands
→ Build Master Agency Basket
→ Validate each brand context
→ Split into Brand Orders
→ Preserve common appointment/session ID
→ Calculate commissions
→ Track confirmation, shipment, invoice and payment separately
```

Required controls:

- no cross-brand data leakage;
- explicit legal seller per resulting order;
- commission conflict detection;
- order-writer vs account-owner distinction;
- territory overlap warnings;
- barcode scan resolves exact SKU and price context;
- offline submission remains pending until server acknowledgement.

Official sources:

- https://www.markettime.com/sellers/
- https://www.markettime.com/sales-agencies/
- https://overview.markettime.com/markettime-order-writing
- https://support.markettime.com/hc/en-us/articles/33293064684187-MarketTime-Web-Portal-and-Mobile-App-Release-Notes-2024
- https://news.markettime.com/latest-news/markettime-launches-secure-invoice-function-to-modernize-payment-workflow

---

## 110. B2B Wave — supplier onboarding and account-personalization benchmark

### 110.1 COMPETITOR CONFIRMED capabilities

B2B Wave publicly confirms:

- customer-specific price lists;
- customer-specific homepage;
- customer-specific tax rates;
- customer-specific discounts;
- show/hide products by customer or privacy group;
- multiple users per customer with roles;
- multiple shipping addresses;
- sales reps ordering on behalf of customers;
- automatic order-related communications;
- supplier accounts;
- dedicated supplier portal;
- supplier upload and management of product images and prices;
- custom supplier permissions;
- product approval before storefront publication;
- real-time supplier activity tracking;
- customer performance analytics;
- customer-product sales analytics;
- customer browsing and search activity;
- inventory control;
- coupon-performance analytics;
- full API for products, orders, customers, pricing and tax rules.

### 110.2 JOOR evidence status

The following were not confirmed in the audited JOOR retailer cabinet:

- supplier self-service product submission into a controlled approval queue;
- customer-specific homepage as a governed merchandising object;
- customer-specific tax logic managed directly in wholesale portal;
- supplier activity dashboard;
- product approval from external supplier to commercial catalog;
- coupon-performance analytics.

### 110.3 SYNTHA TARGET

- external SupplierPortal distinct from factory production workspace;
- ProductSubmission and ProductSubmissionVersion;
- validation against category templates;
- content, commercial, compliance and legal approval stages;
- field-level supplier permissions;
- supplier change request rather than direct overwrite;
- customer-specific HomeExperience;
- CustomerTaxProfile resolved at legal entity/location level;
- activity and SLA dashboard;
- conversion of approved supplier data into CommercialProductProjection;
- supplier quality score for submitted data.

Official sources:

- https://www.b2bwave.com/features
- https://www.b2bwave.com/
- https://www.b2bwave.com/customers-and-sales-reps
- https://www.b2bwave.com/b2b-ecommerce-platform

---

## 111. Expanded competitor gap matrix

`NOT CONFIRMED` means the capability was not verified in the audited JOOR access and reviewed public materials, not that its absence has been conclusively proven.

| Capability | Best benchmark | JOOR status | Syntha target | Priority |
|---|---|---|---|---|
| Store-photo visual merchandising board | Elastic | NOT CONFIRMED | VisualBoard linked to store, assortment and order | P1 |
| Fixtures and POP assets on shoppable board | Elastic | NOT CONFIRMED | Layered board with assets and product hotspots | P1 |
| Campaign revenue attribution | Elastic | NOT CONFIRMED | Campaign → engagement → order → margin attribution | P2 |
| Multi-shipment order construction | Elastic/RepSpark | NOT CONFIRMED | One order workspace with multiple delivery groups | P1 |
| Future inventory quick order | Elastic | PARTIAL/UAT | Time-phased ATS/ATP by delivery | P1 |
| Persistent always-on cart | RepSpark | NOT CONFIRMED | Recoverable CartWorkspace across sessions | P0 |
| Multi-date and multi-location buying | RepSpark | NOT CONFIRMED | Delivery/location matrix in one workspace | P1 |
| Allotted inventory | RepSpark | NOT CONFIRMED | Account/event/channel allotment and release rules | P1 |
| Event microsites | RepSpark | NOT CONFIRMED | EventCommerce with participants and consolidation | P2 |
| Licensing and royalty calculation | RepSpark | NOT CONFIRMED | LicensingAgreement and RoyaltyLedger | P2 |
| AI reorder-risk insights | RepSpark | NOT CONFIRMED | Explainable account next-best-action | P2 |
| Multi-line agency order | MarketTime | NOT CONFIRMED | Master agency basket split by seller | P2 |
| Barcode showroom order capture | MarketTime | NOT CONFIRMED | Scan-to-SKU with commercial validation | P2 |
| Automatic split commissions | MarketTime | NOT CONFIRMED | Versioned CommissionRule and settlement | P2 |
| Territory GeoMap | MarketTime | NOT CONFIRMED | Account map, routing and overlap control | P3 |
| Supplier product submission portal | B2B Wave | NOT CONFIRMED | Supplier self-service + approval workflow | P1 |
| Customer-specific homepage | B2B Wave | NOT CONFIRMED | Governed HomeExperience by account/location | P2 |
| Customer-specific tax profile | B2B Wave/Shopify | PARTIAL/UAT | Legal-entity/location tax resolution | P0 |
| Supplier activity tracking | B2B Wave | NOT CONFIRMED | Submission SLA and activity dashboard | P1 |
| Coupon performance | B2B Wave | NOT CONFIRMED | Promotion attribution and profitability | P2 |

---

## 112. Visual merchandising Whiteboard — detailed Syntha specification

### 112.1 Purpose

Whiteboard is not a decorative moodboard. It must connect spatial merchandising, assortment, quantities, economics and order execution.

### 112.2 Board types

- store wall;
- rail;
- shelf;
- table;
- window;
- pop-up;
- shop-in-shop;
- event booth;
- showroom presentation;
- assortment moodboard;
- campaign board.

### 112.3 Entities

```text
VisualBoard
VisualBoardVersion
VisualCanvas
CanvasBackground
CanvasLayer
FixtureAsset
MarketingAsset
ProductPlacement
PlacementHotspot
BoardAnnotation
BoardTarget
BoardShare
BoardApproval
```

### 112.4 Canvas data

- store/location;
- photo or plan;
- width and height;
- optional physical scale;
- orientation;
- safe zones;
- restricted zones;
- fixture coordinates;
- background version;
- capture date;
- photographer/source;
- access rights.

### 112.5 Product placement

- product/style/color/SKU;
- image asset version;
- x/y coordinate;
- width/height;
- rotation;
- z-layer;
- crop/mask;
- delivery;
- planned quantity;
- ordered quantity;
- retail value;
- wholesale value;
- margin;
- status;
- linked assortment line;
- linked order line.

### 112.6 Workspace behavior

- drag and drop;
- snap to grid;
- align and distribute;
- lock layer;
- duplicate;
- replace product;
- compare versions;
- filter by delivery/category/color/brand;
- show/hide economics;
- export PDF/image;
- share controlled link;
- convert selected placements to assortment/order;
- highlight unavailable or changed product;
- preserve board snapshot when order is submitted.

### 112.7 Analytics

- space by category/brand/color;
- product count;
- option count;
- retail value per fixture;
- wholesale investment per fixture;
- margin per fixture;
- sales per square meter after POS feedback;
- compliance against approved board;
- placement-to-order conversion.

### 112.8 Acceptance criteria

- board with 500 placements remains interactive;
- product replacement preserves coordinates and records version history;
- unavailable product is visibly flagged;
- private retailer economics are not exposed in a brand-shared view;
- board totals reconcile to linked assortment/order;
- export reproduces layout without element loss;
- mobile viewer supports comments, while complex editing remains tablet/desktop-first.

---

## 113. Multi-shipment, multi-date and multi-location order orchestration

### 113.1 Order hierarchy

```text
Order
→ ShipmentGroup
→ DeliveryWindow
→ ShipToLocation
→ FulfillmentSource
→ OrderLineAllocation
```

### 113.2 ShipmentGroup fields

- group ID;
- requested delivery window;
- confirmed delivery window;
- ship-to location;
- bill-to entity;
- warehouse/factory source;
- incoterm;
- carrier method;
- freight payer;
- currency;
- minimums;
- status;
- line allocations;
- totals;
- documents;
- change history.

### 113.3 Builder behavior

- add one product to several shipment groups;
- copy size curve between groups;
- split quantity by percentage or units;
- bulk assign store/cluster quantities;
- move lines between deliveries;
- compare requested and confirmed groups;
- show MOQ/MOV per group and order;
- show freight and duty impact;
- prevent location with invalid tax/shipping setup;
- validate future inventory against promised date.

### 113.4 State model

```text
DRAFT_GROUP
→ REQUESTED
→ CONFIRMED
→ CAPACITY_RESERVED
→ PICKING / IN_PRODUCTION
→ PARTIALLY_SHIPPED
→ SHIPPED
→ RECEIVED
→ CLOSED

Side states:
ON_HOLD / CHANGED / CANCELLED / FAILED
```

### 113.5 Amendment rules

Changing delivery, location, quantity, incoterm or fulfillment source after submission creates an amendment with:

- old/new values;
- financial impact;
- inventory impact;
- production impact;
- approval requirement;
- counterparty acceptance.

### 113.6 Acceptance criteria

- one order supports at least 50 shipment groups;
- totals reconcile at group, location, order and account levels;
- partial brand confirmation does not lose retailer-requested quantities;
- shipment groups can be split without duplicating commercial terms;
- invoices and packing lists link to exact groups and lines;
- cancellation releases reservations and OTB correctly.

---

## 114. Event microsites and group ordering

### 114.1 Event types

- trade show;
- pop-up;
- trunk show;
- corporate gifting;
- tournament;
- club/member order;
- staff uniform;
- influencer capsule;
- employee purchase;
- limited launch;
- preorder campaign.

### 114.2 Entities

```text
CommerceEvent
EventMicrosite
EventAssortment
EventParticipant
EventAccessCode
EventCredit
EventCustomizationRule
EventOrder
EventOrderLine
EventFulfillmentGroup
EventSettlement
EventSummary
```

### 114.3 Event setup

- organizer;
- sponsoring retailer/brand;
- start/end dates;
- timezone;
- approved assortment;
- catalog snapshot;
- price policy;
- inventory source;
- inventory hold;
- logos/customization;
- participant eligibility;
- payment model;
- fulfillment model;
- pickup locations;
- minimum production threshold;
- cancellation policy;
- privacy notice.

### 114.4 Payment models

- participant pays fully;
- retailer pays fully;
- employer/club pays fully;
- participant credit/points plus personal balance;
- split payment;
- deposit then balance;
- no-charge internal allocation.

### 114.5 Fulfillment models

- direct ship to participant;
- bulk ship to retailer/event;
- store pickup;
- event pickup;
- made-to-order production;
- consolidated production followed by individual parcel fulfillment.

### 114.6 Workflow

```text
Event configured
→ Assortment approved
→ Access opened
→ Participants order/customize
→ Inventory or capacity held
→ Event closes
→ Minimum threshold evaluated
→ Orders consolidated
→ Production/fulfillment released
→ Shipping/pickup
→ Settlement and event P&L
```

### 114.7 Event economics

- gross demand;
- collected amount;
- sponsor subsidy;
- discounts;
- customization surcharge;
- royalty;
- product cost;
- fulfillment cost;
- payment fee;
- returns/refunds;
- contribution margin.

### 114.8 Acceptance criteria

- participant cannot view other participants’ data;
- event close prevents late silent changes;
- inventory holds expire according to policy;
- failed threshold triggers defined cancel/refund behavior;
- event summary reconciles to participant orders;
- direct-ship labels link to exact participant order;
- logo and customization approvals are traceable.

---

## 115. Licensing, logo and royalty management

### 115.1 Entities

```text
Licensor
LicenseAgreement
LicensedProperty
ApprovedLogo
LicenseTerritory
LicenseChannel
LicenseProductScope
RoyaltyRule
RoyaltyAccrual
RoyaltyStatement
ArtworkApproval
UsageEvidence
```

### 115.2 Agreement fields

- licensor/licensee;
- property/logo;
- territory;
- channel;
- product categories;
- customer/event scope;
- start/end dates;
- sell-off period;
- royalty basis;
- rate/tier;
- minimum guarantee;
- currency;
- reporting cadence;
- approval requirements;
- restricted uses;
- document version.

### 115.3 Catalog filtering

The system must resolve:

```text
Buyer/Account
+ Event
+ Product
+ Territory
+ Channel
+ Date
→ Eligible licensed logos and products
```

### 115.4 Royalty calculation

```text
Royalty Base
= Eligible Net Sales or Eligible Wholesale Value
  - Contractually Allowed Deductions

Royalty Amount
= Royalty Base × Applicable Rate
```

Every deduction type and rate version must be explicit.

### 115.5 Workflow

```text
Artwork selected/uploaded
→ Eligibility validation
→ Proof generated
→ Internal review
→ Licensor approval if required
→ Buyer approval
→ Order release
→ Fulfillment
→ Royalty accrual
→ Statement
→ Settlement
```

### 115.6 Controls

- expired logo cannot be ordered;
- territory/channel restriction blocks submission;
- product substitution rechecks license eligibility;
- manual royalty override requires finance approval;
- return/cancellation creates accrual reversal;
- statement reconciles to immutable order/invoice lines.

---

## 116. Sales agency, territory and commission engine

### 116.1 Entities

```text
SalesAgency
AgencyDivision
Territory
TerritoryAssignment
BrandPrincipal
Representative
OrderWriter
AccountOwner
CommissionPlan
CommissionRule
CommissionSplit
CommissionAccrual
CommissionStatement
CommissionDispute
```

### 116.2 Commission basis

- booked;
- approved;
- confirmed;
- shipped;
- invoiced;
- paid;
- net of returns;
- net of discounts;
- net of tax/freight;
- gross margin based.

### 116.3 Rule dimensions

- agency;
- brand principal;
- rep;
- order writer;
- territory;
- retailer;
- product/category;
- season;
- order type;
- effective dates;
- threshold/tier;
- currency;
- event/market.

### 116.4 Split logic

Examples:

- house + account owner + order writer;
- regional manager + rep;
- two reps sharing account;
- agency and direct sales team;
- temporary market-event split.

### 116.5 Accrual lifecycle

```text
PROVISIONAL at order event
→ EARNED at configured basis
→ ADJUSTED for amendment/return
→ APPROVED
→ PAYABLE
→ PAID
→ DISPUTED / REVERSED
```

### 116.6 Acceptance criteria

- effective-dated rule changes do not rewrite historical accruals;
- order writer and account owner can differ;
- one order may produce several transparent splits;
- currency conversion uses documented rate/date;
- cancellations and returns generate traceable clawbacks;
- statement totals reconcile to source orders/invoices/payments.

---

## 117. Supplier onboarding and commercial product approval

### 117.1 Portal roles

- supplier admin;
- supplier product editor;
- supplier commercial editor;
- supplier compliance editor;
- brand content reviewer;
- brand commercial reviewer;
- legal/compliance approver;
- catalog publisher.

### 117.2 Submission entities

```text
SupplierSubmission
SubmissionVersion
SubmittedProduct
SubmittedVariant
SubmittedPrice
SubmittedAsset
SubmittedDocument
ValidationIssue
ApprovalStep
PublicationDecision
```

### 117.3 Workflow

```text
DRAFT_BY_SUPPLIER
→ SUBMITTED
→ AUTOMATED_VALIDATION
→ CONTENT_REVIEW
→ COMMERCIAL_REVIEW
→ COMPLIANCE_REVIEW
→ CHANGES_REQUESTED / REJECTED / APPROVED
→ COMMERCIAL_PROJECTION_CREATED
→ PUBLISHED
```

### 117.4 Required validations

- duplicate style/SKU/GTIN;
- missing mandatory attributes;
- taxonomy mismatch;
- invalid UOM;
- invalid price/currency/effective date;
- missing country of origin;
- missing composition/care;
- asset resolution/rights;
- certificate expiry;
- territory restriction;
- prohibited claim;
- cost/wholesale/retail inconsistency.

### 117.5 Change control

A supplier cannot directly overwrite a published product. Change creates a new submission version showing:

- changed fields;
- reason;
- impacted catalogs;
- impacted drafts/orders;
- price/margin impact;
- required approvals;
- effective date.

### 117.6 Acceptance criteria

- external supplier sees only own submissions;
- field permissions are server-enforced;
- rejection includes structured reason and required action;
- approved data maps deterministically to canonical entities;
- published product remains traceable to supplier submission version;
- activity dashboard exposes SLA and bottleneck.

---

## 118. Shoppable campaigns and revenue attribution

### 118.1 Campaign entities

```text
SalesCampaign
CampaignVersion
AudienceSegment
CampaignMessage
CampaignProductBlock
CampaignLink
CampaignSend
EngagementEvent
AttributedOrderLine
CampaignCost
CampaignExperiment
```

### 118.2 Campaign setup

- objective;
- sender/domain;
- audience;
- exclusions;
- products/collections;
- catalog snapshot;
- customer-specific price context;
- delivery windows;
- schedule/timezone;
- frequency cap;
- tracking consent rules;
- holdout/test group;
- campaign cost.

### 118.3 Funnel

```text
Delivered
→ Opened where lawful
→ Link opened
→ Product viewed
→ Saved/shortlisted
→ Draft created
→ Submitted
→ Confirmed
→ Shipped
→ Paid
```

### 118.4 Attribution views

- last touch;
- first touch;
- linear;
- time decay;
- campaign-assisted;
- experiment-based incremental lift.

### 118.5 Required metrics

- delivered rate;
- open/click rate where lawful;
- product engagement;
- draft creation;
- order conversion;
- confirmed revenue;
- gross margin;
- cancellation rate;
- return rate;
- revenue per recipient;
- incremental revenue;
- incremental gross margin;
- campaign ROI.

### 118.6 Guardrails

- no order attribution to inaccessible price/product context;
- canceled lines excluded or separately shown;
- tracking disabled where consent or legal basis is absent;
- revenue attribution is separated from causal incrementality;
- campaign cannot send unavailable or expired-price products without warning.

---

## 119. Persistent cart, booking and allotted inventory

### 119.1 CartWorkspace

Persistent cart is not one global unstructured basket. It is scoped by:

- buyer company/location;
- seller/brand;
- catalog and price list;
- currency;
- season;
- order type;
- commercial terms version.

A multi-brand master workspace contains several valid brand carts, not one mixed legal order.

### 119.2 Cart states

```text
ACTIVE
→ SAVED
→ SHARED_FOR_REVIEW
→ APPROVAL_REQUIRED
→ READY_TO_SUBMIT
→ SUBMITTED
→ EXPIRED / ABANDONED / CONVERTED
```

### 119.3 Persistence

- autosave after quantity changes;
- server acknowledgement visible;
- restore across session/device;
- conflict handling;
- price and availability refresh;
- stale item warning;
- catalog version reference;
- recover deleted line within grace period;
- no irreversible silent merge.

### 119.4 Booking modes

- prebook;
- immediate/ATS;
- future inventory;
- made-to-order;
- replenishment;
- event hold;
- customer allotment.

### 119.5 Allotment

Inventory allotment contains:

- SKU;
- warehouse/source;
- account/customer group/event/channel;
- quantity;
- valid from/to;
- hard/soft policy;
- unused release date;
- priority;
- oversell policy;
- owner;
- reason.

```text
Available to Customer
= min(Global ATS after safety rules, Remaining Customer Allotment)
```

### 119.6 Multi-date/location behavior

- one workspace displays delivery groups as tabs/columns;
- quantities can be moved or copied;
- each group validates inventory and minimums;
- store allocations roll up to commercial order lines;
- buyer sees requested, confirmed and changed quantities separately.

---

## 120. AI Order Insights and next-best-action control

### 120.1 Use cases

- account at risk of not reordering;
- unusual fall in order value;
- abnormal size/color mix;
- opportunity to add complementary product;
- missed delivery window;
- high open-cart value without activity;
- low sell-through but new reorder intent;
- credit or payment risk;
- potential substitution;
- late confirmation requiring escalation.

### 120.2 Insight record

```text
OrderInsight
- insight type
- object/account scope
- generated at
- data window
- source facts
- model/rule version
- confidence
- severity
- estimated value/risk
- recommended action
- expiry
- owner
- accepted/rejected/snoozed
- outcome
```

### 120.3 Explainability

The interface must show:

- why the insight appeared;
- which facts support it;
- data freshness;
- known limitations;
- confidence;
- recommendation constraints;
- whether it is rule-based, statistical or LLM-generated.

### 120.4 Human control

- AI does not submit or amend an order;
- AI does not change credit limit;
- AI does not contact buyer without configured approval;
- user can dismiss and provide reason;
- outcomes are measured;
- protected or sensitive attributes are excluded unless legally justified;
- tenant data is isolated.

### 120.5 Success metrics

- insight acceptance rate;
- action completion;
- incremental reorder conversion;
- incremental gross margin;
- prevented cancellation;
- false-positive rate;
- user override rate;
- time saved;
- complaint/unsubscribe impact.

---

## 121. New canonical entities introduced by competitor research

```text
VisualBoard
VisualBoardVersion
ProductPlacement
FixtureAsset
ShipmentGroup
OrderLineAllocation
CommerceEvent
EventParticipant
EventCredit
EventSettlement
Licensor
LicenseAgreement
ApprovedLogo
RoyaltyRule
RoyaltyAccrual
SalesAgency
AgencyDivision
Territory
BrandPrincipal
OrderWriter
CommissionPlan
CommissionRule
CommissionAccrual
SupplierSubmission
SubmissionVersion
ValidationIssue
PublicationDecision
SalesCampaign
AudienceSegment
AttributedOrderLine
CartWorkspace
InventoryAllotment
OrderInsight
HomeExperience
CustomerTaxProfile
```

Rules:

- no entity duplicates existing canonical responsibility;
- each entity has owner organization and account scope;
- commercial/financial entities are versioned or immutable as appropriate;
- every critical state transition emits audit and analytics events;
- external-party objects have explicit sharing policy.

---

## 122. UAT scenarios added from analog benchmarks

1. Buyer builds one agency basket across three brands and receives three legally separate orders.
2. Sales rep scans 100 barcodes offline, reconnects and creates no duplicate lines.
3. Buyer creates one order for five locations and four delivery windows.
4. Brand partially confirms one shipment group without overwriting requested quantities.
5. Merchandiser places products on a store photo and converts placements into assortment lines.
6. Product becomes unavailable after board approval; board and order show controlled exception.
7. Event participant uses sponsor credit and pays remaining balance.
8. Event fails minimum production threshold and refunds follow policy.
9. Licensed logo expires while draft is open; submission is blocked with explanation.
10. Return reverses royalty and commission accruals.
11. Supplier submits product, receives structured change request and resubmits a new version.
12. Supplier price change identifies affected catalogs and drafts.
13. Campaign attribution excludes canceled lines and separately reports assisted revenue.
14. Customer-specific tax and catalog resolve correctly for two locations under one company.
15. Persistent cart restores on another device with exact quantities and context.
16. Allotted inventory releases after expiry and becomes globally available.
17. AI insight is dismissed; dismissal reason is captured and recommendation is not repeated until policy allows.
18. Buyer-owned draft cannot be edited by seller without timed assistance grant.

---

## 123. Revised implementation priority after expanded competitor benchmark

### P0 — commercial truth and usable ordering

- company/location context;
- customer catalog and price resolution;
- customer tax profile;
- persistent CartWorkspace;
- style/color/SKU quantity matrix;
- ATS timestamp;
- delivery groups;
- draft/submit/confirm;
- immutable order snapshot;
- amendment;
- audit and permissions.

### P1 — direct parity with strongest buying platforms

- assortment targets and rollups;
- VisualBoard;
- multi-date/multi-location order;
- future inventory;
- inventory allotment;
- Custom Lists/Proposed Buy;
- prepacks;
- supplier product portal;
- POS/ERP sync;
- trend intelligence;
- smart reorder;
- customization/proof.

### P2 — material differentiation for brands and agencies

- event microsites;
- licensing and royalty;
- agency multi-line order;
- commission engine;
- campaigns and attribution;
- AI Order Insights;
- customer-specific HomeExperience;
- trade promotions;
- offline barcode order writing.

### P3 — ecosystem and managed services

- trade credit;
- payment guarantee;
- managed returns;
- retail execution;
- route planning;
- advanced network benchmark;
- spatial store analytics;
- marketplace risk ledger.

### Mandatory sequencing

```text
Commercial context
→ Persistent cart
→ Multi-delivery order
→ Confirmation/amendment
→ Assortment and visual planning
→ POS/replenishment loop
→ Supplier/PLM/production traceability
→ Campaigns, agency and marketplace services
```

---

## 124. Official sources added in version 2.5

### JOOR and NuORDER parity validation

- https://www.joor.com/virtual-showroom
- https://www.joor.com/wholesale-management
- https://www.nuorder.com/wholesale/virtual-showrooms/
- https://www.nuorder.com/wholesale/online-wholesale-platform/

### Elastic Suite

- https://www.elasticsuite.com/platform/
- https://www.elasticsuite.com/
- https://www.elasticsuite.com/demo/
- https://support.elasticsuite.com/create-standard-order-flow
- https://support.elasticsuite.com/create-a-whiteboard-flow
- https://support.elasticsuite.com/how-do-i-create-a-whiteboard

### RepSpark

- https://www.repspark.com/
- https://www.repspark.com/customers/features-and-updates
- https://www.repspark.com/product-customization
- https://www.repspark.com/event-microsites
- https://support.repspark.com/core-products

### MarketTime

- https://www.markettime.com/sellers/
- https://www.markettime.com/sales-agencies/
- https://overview.markettime.com/markettime-order-writing
- https://support.markettime.com/hc/en-us/articles/33293064684187-MarketTime-Web-Portal-and-Mobile-App-Release-Notes-2024
- https://news.markettime.com/latest-news/markettime-launches-secure-invoice-function-to-modernize-payment-workflow

### B2B Wave

- https://www.b2bwave.com/features
- https://www.b2bwave.com/
- https://www.b2bwave.com/customers-and-sales-reps
- https://www.b2bwave.com/b2b-ecommerce-platform

### Version 2.5 decision

NuORDER remains the strongest direct benchmark for retailer assortments, targets, trend intelligence and POS-linked reorder. Elastic adds the most useful visual-merchandising and campaign-attribution patterns. RepSpark adds persistent ordering, event commerce, customization and licensing. MarketTime adds the most mature agency, territory and commission logic. B2B Wave adds a practical supplier product-approval portal and deep account-level personalization.

Syntha should not copy these systems module by module. It should connect their best mechanics to one traceable lifecycle in which a visual selection, quantity, price, delivery, factory, material, quality result, shipment and financial outcome remain linked.
---

## 125. Evidence preservation: восстановленный JOOR baseline

Версия 2.6 возвращает в текущий master-документ исходный подробный read-only аудит JOOR. Он нужен как неизменяемая доказательная база для всех сравнений, gap decisions и UAT.

- источник: production-интерфейс JOOR под ролью Retailer / LITE;
- дата наблюдения: 4 августа 2026 года;
- исходный Git blob: `659d863246903621c0fd894b0efe5673915178d4`;
- реальные адреса, контакты, сообщения, PO и коммерческие значения обезличены;
- наблюдение отделено от `INFERRED`, `TARGET`, `GATED` и `UAT`;
- отдельная проверка `Duplicate Orders → Cancel Order` сохранена как зафиксированный side effect;
- brand-side authoring, paid Visual Assortment, JOORPay, installed Shopify и полный submit/approve/ship lifecycle остаются controlled UAT.

### 125.1 Evidence-first rule

Ни одна функция конкурента не считается доказанным gap только потому, что она не встретилась в одном retailer account. Для вывода используются три независимых слоя:

1. `JOOR OBSERVED` — что действительно открыто и проверено;
2. `JOOR PUBLICLY CONFIRMED` — что подтверждено официальными материалами;
3. `JOOR NOT CONFIRMED / GATED / UAT` — что требует другого тарифа, роли, данных или финального действия.

### 125.2 Полный исходный аудит

Ниже сохранена полная первоначальная карта: shell, routes, dashboard, discovery, connections, submissions, Passport, storefront/showroom, linesheets, styles, catalog, cart, orders, Looks, Styleboards, settings, profile, account switching, Shopify, subscriptions, jobs, dictionaries, entity map, E2E, defects и UAT.

<details>
<summary><strong>Открыть восстановленный исходный аудит JOOR целиком</strong></summary>

### A.0 JOOR Retailer Cabinet — нормализованная карта продукта, процессов, экранов и данных

Статус: reference-only, не является интеграцией или изменением реализации Syntha V2.  
Источник: read-only аудит production-интерфейса JOOR под авторизованной ролью Retailer / LITE, выполненный 4 августа 2026 года.  
Назначение: единая навигационная карта для проектирования улучшенного аналога кабинета.

> В документ сознательно не включены реальные адреса, сообщения, контакты и коммерческие значения конкретного аккаунта. Зафиксированы структура данных, поля, действия, состояния и связи. Закрытый brand-side back office, платный Visual Assortment, установленный Shopify, JOORPay и полный submit/approve/ship цикл требуют отдельного тестового доступа.
---

#### A.1. Как читать карту

##### A.1.1 Назначение и граница

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

##### A.1.2 Evidence markers

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

##### A.1.3 Уровни описания

- Product map — что доступно пользователю.
- Process map — что за чем следует.
- Data map — какие сущности и snapshots требуются.
- Permission map — кто и при каком state может действовать.
- E2E map — связи discovery → showroom → selection → order → fulfillment.
- Gap map — что gated, ambiguous или требует brand/test access.

##### A.1.4 Privacy and audit discipline

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

#### A.2. Общая архитектура кабинета


##### A.2.1 Граница текущего доступа

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

##### A.2.2 Product shell

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

##### A.2.3 Единая IA улучшенной версии

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

##### A.2.4 Роли и ответственность

###### A.Retailer / Buyer — OBSERVED

- ведёт company profile, people и locations;
- управляет обнаружимостью каждого связанного retailer account;
- ищет, фильтрует, сохраняет и подключает бренды;
- получает submissions, requests, Looks и документы;
- просматривает profile/storefront/showroom и linesheets;
- выбирает style → colorway → size/SKU → quantity;
- создаёт Notes/Draft, редактирует разрешённые блоки, отправляет на approval;
- работает с orders, messages, import/export, integration и premium tools;
- переключается между несколькими account contexts.

###### A.Brand / Seller — INFERRED / TARGET

- ведёт brand identity, profile, team и commercial contacts;
- собирает и публикует versioned showroom;
- публикует linesheets, styles, colorways, SKUs, цены и delivery windows;
- назначает audience, connection, territory, retailer group и product-level access;
- предоставляет billing codes, payment/shipping methods и Terms & Conditions;
- принимает connection requests и обрабатывает orders;
- создаёт Looks, documents и submissions;
- анализирует showroom → product → draft → order conversion.

###### A.Account administrator — OBSERVED / INFERRED

- управляет memberships и display consent;
- определяет primary account;
- управляет profile, privacy и discoverability;
- контролирует integrations, subscriptions и permissions;
- обязан предотвращать перенос данных между account contexts.

###### A.Premium user — GATED

- получает Visual Assortment и дополнительные лимиты;
- entitlement может ограничивать users, doors, products, features и retention.

#### A.3. Полная карта маршрутов

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

##### A.3.1 Вложенные и служебные маршруты

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

#### A.4. Dashboard — полный состав

##### A.4.1 Назначение

Стартовая retailer-панель одновременно решает четыре задачи:

1. быстрый доступ к операционным разделам;
2. продолжение покупок у connected brands;
3. обработка отношений с брендами;
4. discovery и upsell.

##### A.4.2 Блоки по порядку

###### A.Header

Описан в разделе Product shell.

###### A.Visual Assortment promo

- заголовок/описание ценности;
- CTA Explore subscriptions;
- переход на plans;
- GATED feature awareness.

###### A.Promotional banner carousel

- image banner;
- marketing campaign UTM;
- переход на brand storefront или Passport Event;
- повторяющиеся слайды;
- next/previous carousel navigation.

###### A.Connected Brands

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

###### A.Brands Interested in You

- объясняет роль retailer profile;
- CTA/profile link;
- направляет к заполнению profile для улучшения matching;
- связан с Submissions.

###### A.Connection Requests

На карточке:

- brand image/name;
- categories;
- переход в storefront/profile.

Действия:

- See All;
- открыть incoming requests;
- затем Accept/Not Now.

###### A.New to JOOR

- category selector, начальное значение All;
- карусель новых brands;
- brand image/name/categories;
- See All.

Обнаруженный дефект: See All ведёт на Pending Connections вместо All Brands.

##### A.4.3 Dashboard data

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
##### A.4.4 Уточнённая структура карточек и переходов

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


#### A.5. Discovery: Find New Brands

Route: /ra/find_new_brands.

##### A.5.1 Назначение и порядок работы — OBSERVED

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

##### A.5.2 Page composition — OBSERVED

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

##### A.5.3 Sort by — OBSERVED

Полный список:

1. Newest Linesheets;
2. A - Z;
3. Most Purchased;
4. New to JOOR.

Сортировка должна передаваться в URL/query state, быть стабильной при pagination/lazy loading и иметь серверное определение tie-break.

##### A.5.4 Search and Filters — OBSERVED

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


##### A.5.5 Category dictionary — OBSERVED

Discovery использует canonical Global Category Dictionary из раздела 29.1. На экране есть Search categories и checkbox для каждого значения; профильная персонализация использует тот же справочник.

##### A.5.6 Brand card and relationship state — OBSERVED

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

##### A.5.7 State model

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

#### A.6. Connections — полный lifecycle

##### A.6.1 Единая state machine

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

##### A.6.2 Connected Brands

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

##### A.6.3 Incoming Requests

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

##### A.6.4 Pending Connections

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

##### A.6.5 Security requirement

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


#### A.7. Brand Submissions

Route: /ra/submissions?tab=new.

##### A.7.1 Назначение — OBSERVED

Экран называется Brands Interested In You и объясняет: бренды могут обнаружить retailer profile и отправить персонализированный visual outreach. Это отдельный канал discovery, а не connection request и не обычное inbox message.

##### A.7.2 Tabs and exact empty states — OBSERVED

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

##### A.7.3 Populated submission card — UAT

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

##### A.7.4 End-to-end flow

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


#### A.8. Favorites

Route: /r/passport/favorites.

##### A.8.1 Проверенное пустое состояние — OBSERVED

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

##### A.8.2 Требуемое populated state — TARGET

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

##### A.8.3 Persistence

Favorite должен быть account-level, потому что ассортимент и связи принадлежат retailer organization; private user notes могут быть user-scoped. Хранить favoriteId, accountId, brandId, source, eventId, addedBy/At, note visibility, tags и removedAt. Повторный favorite — idempotent.
---


#### A.9. Passport Events

##### A.9.1 Passport landing — OBSERVED

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

##### A.9.2 Event detail — OBSERVED

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


##### A.9.3 Event Category dictionary — OBSERVED

Проверенный event использует Passport Event Category Dictionary из раздела 29.2. Он отличается от глобального: Beauty и Watches в нём отсутствовали.


##### A.9.4 Price filters — OBSERVED

Min/Max thresholds перечислены в разделе 29.4. Система должна валидировать min ≤ max и сохранять currency context; event UI показывает долларовые thresholds без отдельного currency selector.

##### A.9.5 End-to-end Passport flow

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

##### A.9.6 Event data

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

#### A.10. Кабинет бренда, Storefront, Showroom и презентация

##### A.10.1 Назначение и граница

Этот раздел описывает единый домен представления бренда:

1. Brand Profile — структурированная карточка компании.
2. Storefront — постоянная брендовая витрина и вход в покупки.
3. Showroom / Presentation — редакционная история бренда из секций, товаров, коллекций, media и документов.
4. Seller workspace — INFERRED / TARGET, необходимый для создания наблюдаемого buyer-side результата.

Поля заказа, товарная матрица и approval здесь не дублируются: они описаны в разделах 13–16.

##### A.10.2 Buyer-side состояния доступа

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

##### A.10.3 Структура публичной карточки бренда

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

##### A.10.4 Структура connected Storefront

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

##### A.10.5 Showroom / Presentation: контейнерная модель

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

##### A.10.6 Наблюдаемые композиции Showroom

###### A.Опубликованная редакционная презентация

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

###### A.Placeholder / incomplete connected presentation

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

###### A.Presentation state matrix

| Page state | Section state | Buyer result |
|---|---|---|
| Draft | любой | виден только brand editors |
| Published | complete + allowed | полноценный widget и CTA |
| Published | placeholder | должно быть blocked validation, не buyer output |
| Published | resource restricted | cover/teaser + restriction overlay |
| Published | deleted/unavailable binding | controlled unavailable state |
| Scheduled | before publish_from | hidden/preview only |
| Expired/unpublished | after publish_to | removed with stable fallback/deep-link response |

##### A.10.7 Навигация презентации

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

##### A.10.8 Документы бренда

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

##### A.10.9 Seller workspace — INFERRED / TARGET

Чтобы породить наблюдаемый buyer-side опыт, brand cabinet должен иметь следующие рабочие зоны.

###### A.Brand Profile editor

- legal/display name;
- logo и brand imagery;
- description/story;
- year established;
- categories;
- market/price positioning;
- website/social;
- team members и contact routing;
- preview as public/disconnected/connected retailer.

###### A.Showroom Builder

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

###### A.Catalog and Linesheet Manager

- seasons, collections, delivery windows;
- style, colorway, SKU/size;
- images and media;
- wholesale/RRP by price type/currency;
- tags, badges, categories, fabrication, division, silhouette;
- inventory/ATS and ordering constraints;
- shared/unshared state;
- audience and expiry;
- import/export jobs.

###### A.Connections and Access

- retailer/accounts/groups/territories;
- incoming/outgoing request lifecycle;
- assign sales rep;
- grant/revoke linesheet/product/document;
- price type and payment method assignment;
- effective access preview;
- audit of who granted/revoked what and when.

###### A.Order Inbox

- Notes, Pending, Approved, Shipped, Cancelled;
- open order aggregate and comments;
- validate or adjust permitted fields;
- approve/reject/request revision;
- confirmation/invoice/shipment documents;
- export/integration marks;
- fulfillment and payment states;
- immutable submission snapshot and audit.

###### A.Commercial Settings

- price types and currencies;
- product/order discounts;
- shipping methods and fees;
- billing codes;
- payment methods and terms;
- order minimums, SKU increments and delivery rules;
- Terms & Conditions versions.

###### A.Analytics

- profile/showroom visitors;
- page/section impressions;
- video engagement;
- document views/downloads;
- linesheet/style opens;
- product selection and quantity entry;
- draft creation;
- submit/approve conversion;
- conversion by retailer, account, location, territory, campaign, showroom version and price type.

##### A.10.10 Publishing validation

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

##### A.10.11 Storefront → Catalog handoff

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

#### A.11. Linesheets: registry, detail, Print и Excel Order

Linesheets — самостоятельный legacy buying surface, отличный от нового Product Catalog. Он использует routes с разным регистром, hash-state, отдельные POST filters и AJAX pagination.

##### A.11.1 Registry

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

##### A.11.2 Brand filter

- native select;
- список connected/accessible brands;
- archived marker внутри option;
- отдельный Submit;
- selected brand отражается в hash вида b={brandId};
- смена brand перезапрашивает cards.

В наблюдаемой membership selector содержал более пятидесяти brand options, включая archived. Это не означает одинаковый ordering access: registry visibility, connection и конкретный linesheet audience могут различаться.

##### A.11.3 Delivery Date filter

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

##### A.11.4 Category filter

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

##### A.11.5 Search and sorting

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

##### A.11.6 Linesheet registry card

Непосредственно наблюдались:

- brand name;
- linesheet name;
- delivery start/end;
- card link /collections/view/{linesheetId};
- ordered list of many seasons/drops.

Целевая карточка дополнительно должна показывать cover, season/year, category/division, style count, price types/currency, availability, new/updated badge, archived/restricted marker и reason tooltip.

##### A.11.7 Linesheet detail

Route: /collections/view/{linesheetId}?brandId={brandId}#pt={priceTypeId}.

###### A.Left sidebar

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

###### A.Header

- full linesheet name и audience/division marker;
- Print;
- Start Excel Order;
- Delivery Window;
- Price Type selector;
- Submit/apply price type.

Наблюдался выбор между несколькими price types одной валюты и сезона. URL/hash сохраняет выбранный priceTypeId.

###### A.View and pagination

- View 15;
- View 30;
- View All (total);
- current page;
- numbered pages;
- Next;
- AJAX route следующей страницы;
- stable style order.

Totals и filtering должны рассчитываться сервером; View All не должен блокировать страницу большим количеством изображений.

##### A.11.8 GROUP BY dictionary

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

##### A.11.9 Style card inside Linesheet

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

##### A.11.10 Print constructor — OBSERVED

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

##### A.11.11 Start Excel Order — OBSERVED

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

#### A.12. Style, Colorway, Variant и SKU

##### A.12.1 Роль Style detail

Route: /Styles/view/{styleId}/{linesheetId}/{priceTypeId} с optional query brandId/fp.

Наблюдаемый legacy Style screen — справочная коммерческая карточка. Явных quantity/Add to Order controls на нём нет; ввод количества идёт через Product Catalog, Excel Order или Cart. Поэтому read model Style отделяется от order selection command.

##### A.12.2 Навигация

- Brand profile;
- Send Message;
- Relevant Linesheets;
- Back to Linesheet с hash-позицией style/page;
- Go to All Styles;
- Previous Style, если доступен;
- Next Style;
- direct image/CDN link.

Relevant Linesheets показывает, что один Style может входить в несколько drops/collections.

##### A.12.3 Commercial context

- current Linesheet;
- Delivery Window;
- Select Currency / Price Type;
- несколько price-type blocks;
- Wholesale;
- Suggested Retail;
- currency.

В одном detail наблюдались две price-type версии с различными wholesale/RRP для одного style. Значит, цена не является единственным полем Style и должна моделироваться как PriceRecord(style/color/SKU, priceType, currency, amount, valid dates).

##### A.12.4 Core fields — OBSERVED

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

##### A.12.5 Classification/custom attributes — OBSERVED

Подтверждены пары label/value:

- COLLECTION;
- CONTENT;
- FABRIC WEIGHT;
- MODEL CODE;
- PATTERN;
- SEASON;
- SLEEVE LENGTH.

Linesheet grouping дополнительно подтверждает FABRICATION, CATEGORY, DIVISION, SILHOUETTE, LINESHEET GROUP и NECK SHAPE. Значение может отображать display value и исходное/повторное значение; target data model должен хранить normalized value, raw source value и locale.

##### A.12.6 Media

- primary image;
- direct CDN URL;
- image count на linesheet card;
- optional thumbnail/gallery;
- colorway-specific image;
- alt derived from style/color;
- missing/broken image fallback.

MediaAsset: id, owner account, original/derivatives, MIME, dimensions, checksum, alt, sort order, colorway binding, rights/access и deleted/replaced state.

##### A.12.7 Colorway

- color display name;
- internal/short color code;
- image;
- optional alternate/raw name;
- link/binding to Style;
- availability per linesheet/price type.

Colorway может быть отдельной card presentation внутри linesheet, но агрегируется обратно в Style и order totals.

##### A.12.8 Variant/SKU target fields

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

##### A.12.9 Selection boundary

Read Style → choose order context → Product Catalog/Excel/Cart → color × size quantity → server validation → OrderLineSnapshot.

Нельзя записывать quantity непосредственно в master Style/SKU. Selection принадлежит конкретному Draft Order, retailer account, price type, delivery context и version.

#### A.13. Start an Order

Route: /ra/products без активного order context; входы также возможны из Storefront Shop, Linesheet, Style, Orders и Cart.

##### A.13.1 Наблюдаемое начальное состояние

Модальное окно содержит:

- heading Start an Order;
- required Search for a brand;
- autocomplete подключённых/доступных брендов;
- More options, disabled до выбора бренда;
- Start an Order, disabled до валидного context;
- close/dismiss, возвращающий к исходной странице без создания заказа.

До выбора brand система не должна создавать draft или писать пустую бизнес-сущность.

##### A.13.2 Наблюдаемый autocomplete failure

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

##### A.13.3 Контекст, который должен быть разрешён до создания

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

##### A.13.4 Последовательность

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

##### A.13.5 Валидации и ошибки

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

##### A.13.6 Создаваемые данные

Create command фиксирует: retailerAccountId, brandAccountId, connectionId, priceTypeId, currency, optional linesheetId/sourceEntity, buyerId, door/locationId, season/year, delivery window, origin, createdBy, clientRequestId. Адреса, контакты, цены и terms далее сохраняются как snapshots согласно разделам 16 и 30.

#### A.14. Product Catalog и выбор товара

Route: /ra/products внутри активного brand-specific order context.

##### A.14.1 Header и active order context

- Catalog;
- Order for: выбранный бренд;
- current Price Type;
- Styles Selected count;
- Orders Created count;
- View Order;
- active draft/cart indication;
- возврат к source showroom/linesheet, если сохранён origin.

Счётчики должны рассчитываться из server-authoritative draft, а не из локально видимых карточек.

##### A.14.2 Browse controls

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

##### A.14.3 Товарная иерархия

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

##### A.14.4 Ввод quantity

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

##### A.14.5 Цена и доступ

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

##### A.14.6 Сохранение и конкурентность

- filters — URL/query и optional saved view;
- quantity change — optimistic UI с rollback;
- сервер — источник истины;
- mutation включает orderVersion/clientMutationId;
- Saving/Saved/Error показывается возле изменённой области;
- конфликт версий даёт merge/reload decision;
- переход к Style и обратно сохраняет filters, scroll и draft;
- access revocation запрещает новые lines, но не удаляет исторические snapshots.

#### A.15. Cart, Draft, Notes и формирование состава заказа

##### A.15.1 Разделение понятий

| Понятие | Смысл |
|---|---|
| Cart | навигационный контейнер активных незавершённых orders |
| Draft | lifecycle state до отправки |
| Note Order | рабочий незавершённый order mode/status в наблюдаемом UI |
| Product selection | style/colorway уже включён в order |
| Ordered quantity | сумма quantity по SKU/size |
| Empty quantity order | order содержит products/colors, но Total Units = 0 |

Наблюдаемый order способен показывать Products > 0 и Colors > 0 при Total Units = 0. Следовательно, наличие OrderLine/ColorLine нельзя вычислять только из quantity > 0: пользователь может предварительно сформировать ассортимент, а размеры заполнить позже.

##### A.15.2 Cart route и empty state — OBSERVED

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

##### A.15.3 Populated Cart Orders — OBSERVED

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

##### A.15.4 Способы добавить ассортимент

1. Product Catalog внутри active order context.
2. Add Products из Order Review.
3. Start Excel Order → заполненный Excel → import to Cart.
4. Look/Styleboard/Assortment transfer, если entitlement/flow доступен.
5. Import Orders для внешнего order file — отдельный bulk workflow.

Все пути должны разрешать один и тот же canonical SKU, price type, delivery и access context.

##### A.15.5 Add Products modal — OBSERVED

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

##### A.15.6 Add Products sequence

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

##### A.15.7 Quantity matrix

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

##### A.15.8 Multi-order Cart — target architecture

Cart может содержать несколько brand-specific orders. Даже один brand может иметь разные drafts по price type/currency/delivery.

~~~text
Retailer Cart
├── Order A: Brand A / Price Type 1
├── Order B: Brand B / Price Type 2
└── Order C: Brand A / другой delivery/price context
~~~

Переключение tile не смешивает totals, terms, addresses, minimums или dirty state.

##### A.15.9 Saving and conflict handling

- local edit получает orderVersion;
- UI показывает Saving/Saved/Error;
- server повторно проверяет access, price, SKU и delivery;
- conflict предлагает reload/merge;
- переход между orders сохраняет dirty state;
- autosave предпочтительнее наблюдаемого manual Save warning;
- submission блокируется до завершения pending saves.

##### A.15.10 Minimums and warnings

Rules:

- minimum order value;
- minimum units;
- style/color/SKU minimum;
- increment/case pack;
- size run;
- delivery/door/territory;
- currency/price type.

Правила классифицируются как blocking, overridable и informational. Override сохраняет reason/actor/timestamp. Наблюдаемая система допускает submit с предупреждением, что бренд может отклонить order.

##### A.15.11 Submit boundary

Перед Submit for Approval:

1. все selection/quantity mutations сохранены;
2. required address/contact/order metadata валидны;
3. totals пересчитаны сервером;
4. minimum/access/delivery issues показаны;
5. terms version определена;
6. immutable submission snapshot создан;
7. idempotency key защищает от duplicate submit.

#### A.16. Manage Orders и рабочее место заказа

Routes: /orders и /ra/orders/review/{orderId}.

##### A.16.1 Registry: status and quantity dimensions

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

##### A.16.2 Registry actions and filters

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

##### A.16.3 Lifecycle and transition rules

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

##### A.16.4 Order Review: page containers

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

##### A.16.5 Identification summary

Отображаются:

- Order #;
- Brand;
- Linesheet link или несколько references;
- Shipping Delivery Window;
- Price Type: currency и название;
- Order Status;
- last updated date/actor.

Order принадлежит одному retailer account и одному brand, но может включать несколько linesheets этого бренда. Price Type определяет базовую валюту/прайс; цены в строках остаются snapshots.

##### A.16.6 Header actions — точные формы

###### A.Share Order

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

###### A.Visual Assortment

Кнопка может быть disabled/gated. Order → Assortment является отдельным transfer с entitlement check; disabled control должен объяснять plan/permission и не выглядеть сломанным.

###### A.Comments

Comments drawer показывает:

- heading Comments;
- существующие entries;
- author;
- comment body;
- input с placeholder Send a comment;
- submit button disabled до непустого валидного текста.

Нужны timestamp, visibility scope, attachments, read state, edit/delete policy и notification. Comment thread не равен internal note или status reason.

###### A.Download

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

###### A.Status combo

В Note Order primary action — Submit for Approval. Arrow menu содержит альтернативу Cancel Order. Cancel является destructive lifecycle mutation и должен требовать confirmation/reason, optimistic version, audit и notification. Submit не был выполнен в исследовании.

##### A.16.7 Shipping and Billing editor

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

##### A.16.8 Products Summary

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

###### A.Access revoked

- historical lines remain;
- warning shown;
- Add Products disabled при отсутствии других shared linesheets;
- quantities/totals remain readable;
- revoke does not delete snapshots.

###### A.Permissions and observed ambiguity

- Note Order может иметь enabled Add Products;
- другой Note Order имеет disabled Add Products из-за revoked linesheet;
- Approved blocks product mutation;
- Edit отображался active, но ни в active, ни в revoked проверенном order не появились quantity inputs;
- usable quantity editor остаётся controlled UAT item.

Каждая product mutation должна проверять orderVersion, access, price type, SKU orderability и delivery.

##### A.16.9 Contacts editor

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

##### A.16.10 Financial Summary

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

##### A.16.11 Order Details editor

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

##### A.16.12 Legal / Terms & Conditions

Brand-provided Terms & Conditions отображаются внутри order page. Заказ должен хранить:

- termsVersionId;
- rendered HTML/PDF/document reference;
- content checksum;
- locale;
- presentedAt;
- acceptedAt/by и acceptance method;
- submission snapshot.

Новая версия условий бренда не может молча заменить условия уже отправленного заказа.

##### A.16.13 Pay tab

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

##### A.16.14 Order entity summary

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

#### A.17. Import, export, download and jobs

##### A.17.1 Upload/import

###### A.Profile media

- logo Upload;
- Browse Images from library;
- Store Photos multi-upload;
- форматы и limits — раздел 29.7.

###### A.Message attachment

- optional image attachment;
- форматы и limit — раздел 29.7.

##### A.17.2 Downloads

- Download Order Confirmation;
- View/Download Document;
- potentially style media if permission;
- import error report;
- export result.

##### A.17.4 Activity Job

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
##### A.17.5 Подробные формы импорта и выгрузки

###### A.17.5.1 Import Orders

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

###### A.17.5.2 Download Order Confirmation

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

###### A.17.5.3 Export Data

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

#### A.18. Looks / Collections

Route: /ra/showroom/collections

##### A.18.1 Registry

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

##### A.18.2 Viewer and product selection

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

##### A.18.3 Look → Styleboard modal — OBSERVED

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

##### A.18.4 Look → Order modal — OBSERVED

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

##### A.18.5 Lifecycle and entity model

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


#### A.19. Styleboards

Routes:

- /ra/showroom/styleboards — registry;
- /ra/showroom/styleboards/add — create entry;
- /ra/showroom/styleboards/{encodedStyleboardId} — canvas.

##### A.19.1 Registry — OBSERVED

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

##### A.19.2 Selection and bulk actions — OBSERVED

Без выбранных строк Actions disabled. После выбора текущего Styleboard доступны только:

- Archive styleboard(s);
- Delete styleboard(s).

Ранее предполагаемые Duplicate/Restore не подтверждены. Restore может появляться только в Archived, но archived count = 0, поэтому остаётся UAT.

Delete — destructive mutation с confirmation, optimistic version, permission и audit. В исследовании Archive/Delete не запускались.

##### A.19.3 Create New and brand association — OBSERVED, CANCELLED

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

##### A.19.4 Canvas structure — OBSERVED

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

##### A.19.5 Add to order modal — OBSERVED, CANCELLED

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

##### A.19.6 Comment and collaboration contract

General Comments:

- existing comments/history area;
- Enter comment here;
- Send disabled при пустом тексте.

Хранить author, account, body, created/edited/deleted timestamps, visibility, mentions, attachments, read state и notifications. Comment не заменяет order comment после переноса.

##### A.19.7 Styleboard entity and widget model

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

#### A.20. Visual Assortment

Route: /ra/visual-assortment

##### A.20.1 LITE state

- value proposition;
- lock icon;
- View Plans to Unlock Today;
- Learn more;
- illustrative preview.

##### A.20.2 Promised capability

- unified view of buys;
- cross-brand/category aggregation;
- products ordered outside JOOR;
- collaboration;
- multiple doors;
- historical storage.


##### A.20.3 Plans

Visual Assortment plan names, prices, users/doors/products и retention limits являются billing catalog и зафиксированы один раз в разделе 26.1.

##### A.20.4 Suggested assortment model

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
#### A.21. Messages

##### A.21.1 Navigation and folder contract

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

##### A.21.2 Compose a Message — exact field order

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

##### A.21.3 Thread

Просмотр сообщения построен как хронологическая таблица:

- From / Date;
- Subject Line;
- ссылка на профиль участника;
- несколько сообщений в одной цепочке;
- subject;
- body с переносами строк;
- распознаваемые mailto-ссылки.

Connection request может порождать thread, а не отдельный несвязанный notification. Structured order comments/status history при этом остаются отдельными aggregates.

##### A.21.4 Message entity

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

##### A.21.5 Sending

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


#### A.22. User Settings

Route: /accounts/settings.

Страница разделена на Manage My Account и Retailer Account Information. В collapsed state показаны summary и Edit. Каждый editor раскрывается inline, имеет X и Save Changes и сохраняется независимо.

##### A.22.1 Credentials — OBSERVED

- login Email — read-only;
- Password — masked;
- Reset password — link.

При нажатии Reset password появился blocking JavaScript alert без отдельной формы и без доступного текста в DOM. Было ли отправлено recovery письмо, интерфейс не подтвердил. Это BROKEN/AMBIGUOUS: reset flow должен показывать destination в masked form, confirmation, cooldown, expiry и результат отправки.

##### A.22.2 User Profile — OBSERVED

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


##### A.22.3 Languages — OBSERVED

Два независимых select:

- SET DEFAULT LANGUAGE AS;
- SEND EMAILS IN.

Оба используют Language Dictionary из раздела 29.3. UI language и email language сохраняются отдельно.

##### A.22.4 Email Settings — OBSERVED

Для каждого правила отдельные Yes/No radio:

1. Send me messages from my JOOR inbox to my email.
2. Send me connection request emails.
3. Send me weekly update emails with news from my connections.
4. Send me information about industry updates and news.
5. Email orders that are assigned to me on the site.
6. Email orders that are assigned to me on the iPad.

Web и iPad assignment notifications являются разными preferences.

##### A.22.5 Default Connection Request Message — OBSERVED

- Use default connect request message — checkbox;
- MESSAGE — textarea;
- X;
- Save Changes.

Нужны account default, optional user override и snapshot фактически отправленного текста. Checkbox должен явно показывать, используется ли system/account template или textarea.


##### A.22.6 Date Format — OBSERVED

Date Format select использует значения из раздела 29.3. Формат действует на web и iPad display; server хранит даты нормализованно.


##### A.22.7 Landing Page — OBSERVED

Landing Page select использует значения из раздела 29.3. Helper: Select a new default home page from the dropdown below. Неподдерживаемый/удалённый route должен падать обратно на Home.


##### A.22.8 Round Retail Pricing — OBSERVED

Round Retail Pricing select использует значения из раздела 29.3. Helper: Automatically round retail prices to the nearest 1.00 or 5.00 values. Исходная цена и display rounding rule хранятся раздельно.

##### A.22.9 Retailer Account Information — OBSERVED

###### A.Profile Name

- PROFILE NAME;
- helper Reset your profile name;
- это business/account identity, не user name.

###### A.Account Email

- EMAIL, input type=email;
- helper: адрес является primary contact for all connection requests and messages;
- это account contact, не login email.

###### A.POS System

- POS SYSTEM;
- VERSION(IF KNOWN).

###### A.Buyer Name

- BUYER NAME;
- helper: contact appears on all purchase orders;
- order хранит snapshot.

###### A.Connection Permission

Exact question: Any brand or retailer can connect with me.

- Yes;
- No.

Это inbound-connect policy, не текущий connection state.

###### A.Privacy

Helper: определяет, отображается ли profile в member search.

- Show in Search;
- Hide from Search.

Это profile search privacy, отдельная от per-associated-account discoverability modal.

##### A.22.10 Form scope and visible storage keys — OBSERVED

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

##### A.22.11 Save and security model

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


#### A.23. Retailer Company Profile

Route: /ra/profile/{accountId}.

##### A.23.1 View mode — OBSERVED

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

##### A.23.2 Verification modal — OBSERVED, NOT SUBMITTED

Get Verified открывает Verification:

- Country — searchable select;
- Tax ID;
- placeholder e.g. 12-3456789;
- Add to profile.

Modal закрыт без отправки. Нужны statuses NOT_STARTED/PENDING/VERIFIED/FAILED/EXPIRED, provider response, normalized country/tax identifier, masked display, evidence/audit и retry policy.

##### A.23.3 Edit mode — OBSERVED

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

##### A.23.4 Logo and Store Photos — OBSERVED

Logo:

- Upload;
- Browse Images.

Store Photos:

- Upload;
- Browse Images;
- назначение: interior/exterior.

Форматы и limits для обоих blocks — раздел 29.7.

Нужны MIME/magic-byte validation, malware scan, EXIF stripping, crop/order/delete, thumbnails и signed asset URLs.

##### A.23.5 Basic Info — OBSERVED

- Business Name — read-only здесь;
- ссылка/инструкция менять в Account Settings;
- Description, placeholder Describe the aesthetic, values, and story behind your business;
- Website, placeholder yourstore.com;
- Instagram, @username;
- X, @username;
- Facebook, www.facebook.com/yourpage.

##### A.23.6 People — OBSERVED

- displayed account users;
- Add or update your information;
- Go to user settings;
- пояснение, что каждый user сам добавляет name/title/image и opt-in/opt-out.

Company People является projection user memberships + per-user display consent.

##### A.23.7 Location fields — OBSERVED

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


##### A.23.8 Location Type, price and age dictionaries — OBSERVED

Type, Minimum Price, Maximum Price и Age используют canonical Location Profile Dictionaries из раздела 29.4. Brands Carried — remote autocomplete без initial options; Country — searchable international directory.


##### A.23.9 Category dictionary — OBSERVED

Каждая location использует canonical Global Category Dictionary из раздела 29.1.


##### A.23.10 Demographics dictionaries — OBSERVED

Gender, Age, Described as и Shops for используют значения из раздела 29.4. UI ограничивает Described as и Shops for максимум тремя выборами.

##### A.23.11 Location-centric architecture

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

#### A.24. Account switching и discoverability

##### A.24.1 Account menu — OBSERVED

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

##### A.24.2 Switch sequence

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

##### A.24.3 Accounts Visibility Settings — OBSERVED

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

##### A.24.4 Data model and consistency

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

##### A.24.5 Language surface — OBSERVED

Account menu показывает текущий language flag/code и раскрывает localization menu. Наблюдаемые пункты этого menu:

- current flag/code;
- ten observed localization options;
- отдельная ссылка на provider attribution в localization widget.

Точные values и различия с User Settings сведены один раз в canonical dictionary раздела 29.3. Переключение языка является user-global preference, не business-account data, но должно синхронно обновлять locale, date formatting и server preference без утечки active account context.


#### A.25. Shopify Integration

Route: /ra/shopify/retailer-product-sync/config.

##### A.25.1 Disconnected state — OBSERVED

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

##### A.25.2 Automation — OBSERVED DISABLED

- Automatic Sync — checked, disabled;
- helper: approved orders from all connected accounts can sync automatically;
- account-level customization обещана после Expand;
- Expand All — disabled до connection.

Checked + disabled означает proposed/default configuration, а не active sync. UI должен различать desired settings и effective integration state.

##### A.25.3 Exact JOOR → Shopify mapping — OBSERVED DISABLED

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

##### A.25.4 Integration lifecycle

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

##### A.25.5 Required mapping and conflict policies

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

##### A.25.6 Sync records

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

#### A.26. Subscription and entitlements

Route: /ra/subscriptions.

##### A.26.1 Plan catalog — OBSERVED

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

##### A.26.2 Checkout entry — OBSERVED, NOT SUBMITTED

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

##### A.26.3 Billing and entitlement model

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

##### A.26.4 End-to-end purchase

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

#### A.27. Data Activity Center

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
##### A.27.1 Таблица Data Activity Center

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

#### A.28. Data operation matrix

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

#### A.29. Справочники — canonical source

Этот раздел является единственным перечнем option values. Feature-разделы описывают место, порядок и условия выбора и ссылаются сюда.

##### A.29.1 Global Category Dictionary — OBSERVED

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

##### A.29.2 Passport Event Category Dictionary — OBSERVED

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

##### A.29.3 User Settings Dictionaries — OBSERVED

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

##### A.29.4 Price, location and demographics dictionaries — OBSERVED

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

##### A.29.5 Operational statuses and dimensions

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

##### A.29.6 Pagination sizes — OBSERVED

Orders:

- 10;
- 15;
- 20;
- 30.

Connections:

- 60;
- 120;
- 240.

##### A.29.7 Media and file limits — OBSERVED

- profile/logo/store image: 10MB;
- store photos: до 30 за один выбор;
- message image: JPG/PNG, 4MB;
- order import: Excel/CSV, 4MB;
- storefront documents: limit не наблюдался.

Limits должны храниться в server configuration и дублироваться в client hints только для UX.
---

#### A.30. Entity relationship map

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

##### A.30.1 Профиль, discovery и membership

RetailerAccount содержит Locations, people, public profile, settings и visibility. Категории, demographics, price range и brands carried могут различаться по Location.

AccountMembership связывает User и Account с role/permissions. Primary account — пользовательское/организационное отношение; discoverability — отдельная account policy.

##### A.30.2 Brand presentation

BrandProfile хранит структурированные сведения. StorefrontPage и PresentationSection образуют versioned composition. Секция связывается с media, product, linesheet, look или document через typed binding, а не копированное произвольное поле.

PublishedPresentationVersion фиксирует page/section order, audience, publish window и content checksum. AnalyticsEvent ссылается на version/page/section/entity и не должен раскрывать данные другого tenant.

##### A.30.3 Catalog and access

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

##### A.30.4 Order aggregate

Order принадлежит одному retailer account и одному brand, использует один price type/currency context и может ссылаться на несколько linesheets.

OrderLineSnapshot фиксирует style metadata и цену; ColorLineSnapshot — colorway; SizeQuantitySnapshot — SKU/size/quantity. Они не удаляются при revoke/delete каталожной сущности.

OrderAddressSnapshot хранит sourceLocationId и исторические поля. OrderContactSnapshot сохраняет role/name/email. FinancialCalculation хранит precision/rounding/components/final. TermsAcceptanceSnapshot фиксирует представленную версию условий.

##### A.30.5 Lifecycle, collaboration and downstream

OrderStatusHistory — append-only transitions. Comments имеют visibility scope. ExportMark ставится после успешной генерации. Payment и Fulfillment связаны с Order, но имеют собственные statuses, audit и idempotency.

ImportJob/ExportJob содержат source/filter snapshot, artifact, checksum, row-level errors, actor, status и retention. Background failure не должен частично менять final order/export state.

#### A.31. End-to-end карта процессов

Этот раздел содержит только междоменные последовательности. Поля экранов не повторяются: они определены в соответствующих функциональных главах.

##### A.31.1 Главный поток Brand → Showroom → Retailer → Order → Fulfillment

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

##### A.31.2 Retailer onboarding

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

##### A.31.3 Discovery and connection exceptions

- retailer hidden from brand discovery, но сам может искать бренд согласно permission;
- incoming и outgoing request;
- accepted, declined, cancelled, expired;
- connected without product audience;
- restricted document/product;
- connection revoked while historical orders remain;
- account archived/read-only;
- brand storefront unpublished after prior engagement.

После любого connection/access change system инвалидирует permissions/cache, уведомляет стороны и пишет audit.

##### A.31.4 Showroom to order handoff

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

##### A.31.5 Draft/Notes to approval

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

##### A.31.6 Access revocation after selection

1. order уже содержит line snapshots;
2. brand отзывает linesheet/product grant;
3. catalog больше не предлагает ресурс;
4. order сохраняет исторические строки и totals;
5. UI показывает revoked warning;
6. Add Products использует только оставшиеся grants;
7. изменение существующих quantities решает explicit policy;
8. submit может блокироваться или требовать brand resolution;
9. revoke и resolution сохраняются в audit.

##### A.31.7 Look → Styleboard → Order

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

##### A.31.8 Message collaboration

Inbox → filter/search → thread → read/unread/delete или Compose → recipients → subject/body/media → send → Sent → notifications. Message thread может быть связан с connection/order, но не заменяет structured comments/status history.

##### A.31.9 Import

Template → upload → secure storage → parse → normalize → reference resolution → validation → preview → confirm → background job → row-level report → atomic create/update → audit/notification → retention/deletion.

##### A.31.10 Export and document generation

Selection/filter snapshot → format/options → background generation → artifact checksum/size/version → temporary signed URL → download audit → export marks only after success → retry without duplicate side effects.

##### A.31.11 Account switch security sequence

Save/discard current edits → authorize target membership → set activeAccountId → invalidate account-scoped state → reload permissions/data/counts → verify no prior account entities in view → log switch. User-global language/date preferences may persist; business data and drafts may not.

#### A.32. UI and interaction architecture

##### A.32.1 Page composition

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

##### A.32.2 Form composition

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

##### A.32.3 Loading

Исходный продукт часто несколько секунд показывает только header/Loading.

Улучшенная версия:

- skeleton matching final layout;
- progressive sections;
- timeout with retry;
- explicit permission/empty distinction;
- preserve previous data while refetching;
- no infinite Loading.

##### A.32.4 Accessibility

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
#### A.33. Наблюдаемые проблемы исходного кабинета

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

#### A.34. Требования к улучшенному аналогу

##### A.P0

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

##### A.P1

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

##### A.P2

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
##### A.34.1 Детализированные направления улучшения

###### A.34.1.1 Единообразие

- объединить legacy-таблицы и новый React-интерфейс общей дизайн-системой;
- одинаковые фильтры, пагинация и массовые действия;
- не использовать неочевидные icon-only buttons без aria-label;
- показывать явный autosave/save status;
- единый date/time/locale слой.

###### A.34.1.2 Безопасность

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

###### A.34.1.3 Производительность

- виртуализация длинных заказов;
- серверные агрегации totals;
- thumbnails и responsive images;
- lazy loading Look/Styleboard assets;
- background import/export;
- progress и retry;
- cursor pagination для activity/messages;
- кеширование справочников.

###### A.34.1.4 Надёжность UX

- не показывать бесконечный Loading без ошибки и retry;
- объяснять, почему autocomplete бренда не возвращает результаты;
- disabled controls должны иметь причину;
- перед выгрузкой показывать точную область и объём;
- сохранять фильтры в URL;
- поддерживать drafts форм;
- предупреждать о несохранённых изменениях;
- различать «нет данных», «нет прав», «ошибка загрузки» и «нет результатов».

#### A.35. Bounded contexts для Syntha V2

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

#### A.36. Coverage, evidence and remaining unknowns

##### A.36.1 Подтверждено в Retailer LITE

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

##### A.36.2 Наблюдаемые ambiguity/broken states

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

##### A.36.3 Не подтверждено без brand-role, populated data или side effects

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

##### A.36.4 Требуемый controlled UAT

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


</details>

---

## 126. Fashion Cloud — content exchange, sell-through and replenishment benchmark

### 126.1 COMPETITOR CONFIRMED direction

Официальные материалы Fashion Cloud описывают экосистему обмена данными между fashion-брендами и retailers, включая:

- централизованную передачу product content;
- images, product data, EAN/GTIN, prices, descriptions и sustainability attributes;
- импорт данных в retailer systems;
- EDI/data exchange;
- передачу retailer sales and inventory data обратно брендам;
- replenishment use cases;
- использование sell-through and inventory information для collection planning.

Это важный benchmark: B2B-платформа не должна завершать процесс после подтверждения заказа. Она должна получать фактическую retail performance и использовать её для reorder, assortment planning, supplier allocation и следующего сезона.

### 126.2 JOOR evidence status

В audited JOOR Retailer / LITE подтверждены catalog, linesheets, orders, Shopify entry и reporting surfaces. Не подтверждены как единый сквозной network capability:

- governed two-way product-content exchange;
- постоянная retailer subscription на изменения product content;
- нормализованный ежедневный sell-through feed от нескольких retailer systems;
- data-sharing agreement с управлением granular permissions;
- replenishment suggestions, рассчитанные на retailer POS/WMS facts;
- closed-loop feedback из sales/stock/returns в brand line plan.

Статус: `JOOR NOT CONFIRMED / UAT`, а не доказанное отсутствие.

### 126.3 SYNTHA TARGET

Syntha должна создать отдельный `Retail Data Network`, а не прятать обмен данными внутри одной интеграции.

Ключевые объекты:

```text
ProductContentPackage
ContentSubscription
RetailDataShareAgreement
RetailProductMapping
RetailLocationMapping
SalesFeed
InventoryFeed
ReturnFeed
SellThroughSnapshot
ReplenishmentRecommendation
DataQualityIssue
SyndicationJob
```

### 126.4 Data-sharing agreement

Для каждого brand-retailer relationship фиксируются:

- data provider;
- data recipient;
- legal purpose;
- permitted fields;
- permitted locations/channels;
- aggregation level;
- history depth;
- refresh frequency;
- retention period;
- use for recommendations/benchmarking/AI;
- onward sharing policy;
- effective date;
- revocation date;
- agreement document/version;
- approval and audit.

Revocation прекращает будущую передачу, но не должна уничтожать исторические финансовые и заказные snapshots, которые требуется хранить по договору или закону.

### 126.5 Data trust states

```text
DECLARED
→ RECEIVED
→ STRUCTURALLY_VALID
→ MAPPED
→ RECONCILED
→ CERTIFIED

Side states:
PARTIAL / STALE / DISPUTED / REJECTED
```

Каждая аналитическая цифра должна показывать:

- source system;
- coverage;
- refresh timestamp;
- mapping confidence;
- missing locations/SKUs;
- returns treatment;
- timezone;
- currency treatment;
- certification state.

Official source:

- https://www.fashion.cloud/brands

---

## 127. Sell-through and Smart Replenishment engine — detailed Syntha specification

### 127.1 Objective

Replenishment должен отвечать не на вопрос «что продавалось», а на вопрос:

```text
Какое количество конкретного SKU нужно заказать
в конкретную location и дату,
чтобы сохранить продажи и маржу,
не создавая избыточный остаток к концу сезона?
```

### 127.2 Input grain

Минимальный факт:

```text
Retailer × Location × Date × SKU
```

Required inputs:

- beginning on hand;
- receipts;
- transfers in/out;
- gross sales;
- returns;
- cancellations;
- markdown quantity/value;
- ending on hand;
- on order;
- reserved;
- in transit;
- stockout flag/duration;
- retail price;
- net selling price;
- cost;
- promotion;
- store closure/opening calendar;
- supplier ATS/ATP;
- confirmed lead time;
- pack/minimum rules;
- season end;
- buyer budget.

### 127.3 Reconciliation equation

```text
Expected Ending On Hand
= Beginning On Hand
+ Receipts
+ Transfers In
- Gross Sales
+ Returns
- Transfers Out
- Write-offs

Inventory Reconciliation Variance
= Reported Ending On Hand - Expected Ending On Hand
```

Recommendations are blocked or confidence-reduced when reconciliation variance exceeds policy.

### 127.4 Demand correction

Observed demand must be corrected for lost sales:

```text
Adjusted Demand
= Observed Net Sales
+ Estimated Lost Sales during Stockout
- Exceptional One-off Demand
```

The interface must distinguish:

- observed sales;
- adjusted demand;
- forecast;
- buyer override.

### 127.5 Base recommendation

```text
Lead-time Demand
= Forecast Daily Demand × Effective Lead-time Days

Target Stock
= Lead-time Demand
+ Safety Stock
+ Presentation Minimum

Net Requirement
= Target Stock
- On Hand
- Confirmed Inbound
- Transferable Stock

Recommended Quantity
= round_to_allowed_pack(max(0, Net Requirement))
```

### 127.6 Fashion-specific constraints

- season remaining days;
- markdown calendar;
- launch/drop window;
- size completeness;
- color-story integrity;
- minimum visual presentation;
- substitute color/style;
- carry-over eligibility;
- return rate;
- store capacity;
- allocation fairness;
- open-to-buy;
- cash requirement;
- intake and expected gross margin;
- supplier minimum order value;
- carbon/logistics consolidation where configured.

### 127.7 Recommendation states

```text
GENERATED
→ REVIEW_REQUIRED
→ ACCEPTED / PARTIALLY_ACCEPTED / REJECTED / SNOOZED
→ DRAFT_ORDER_CREATED
→ SUBMITTED
→ CONFIRMED
→ RECEIVED
→ OUTCOME_MEASURED
```

Default policy: engine creates a recommendation or draft, not an irreversible submitted order. Auto-submit requires an explicit tenant policy, quantity/value limits, exception-free validation and audit.

### 127.8 Exception workbench

Prioritized exceptions:

- stockout imminent;
- high sales velocity with low ATS;
- supplier ATS unavailable;
- low size completeness;
- recommendation exceeds OTB;
- MOQ/MOV not met;
- season-end overstock risk;
- stale POS feed;
- mapping conflict;
- high returns;
- margin below threshold;
- excessive lead-time uncertainty;
- already-open duplicate order.

Each exception has impact value, owner, due date, recommended action and resolution reason.

### 127.9 Outcome measurement

For each recommendation store:

- recommended quantity;
- accepted quantity;
- override reason;
- confirmed/received quantity;
- subsequent sales;
- stockout days;
- ending stock;
- markdown;
- gross margin;
- forecast error;
- incremental result against baseline/control where possible.

---

## 128. Product content exchange and retailer onboarding

### 128.1 ProductContentPackage

A package is a versioned commercial payload derived from PLM/PIM, not an uncontrolled spreadsheet export.

Required contents:

- style, colorway and SKU identifiers;
- GTIN/EAN/UPC;
- category/taxonomy;
- title and descriptions by locale;
- composition;
- care;
- dimensions and fit;
- country of origin;
- customs/HS data where permitted;
- sustainability attributes and evidence status;
- wholesale/RRP and currency context;
- delivery windows;
- media and rights;
- variants and size order;
- packaging;
- channel-specific attributes;
- effective dates;
- source versions.

### 128.2 Retailer channel template

Each retailer/channel defines:

- mandatory fields;
- accepted taxonomy;
- enumerations;
- image count/resolution/aspect ratio;
- locale requirements;
- prohibited claims;
- price fields;
- identifier policy;
- document requirements;
- validation severity;
- delivery method;
- SLA.

### 128.3 Flow

```text
PLM/PIM release
→ Commercial projection
→ Retailer template mapping
→ Validation preview
→ Approval
→ Initial full package
→ Retailer acknowledgement
→ Delta subscriptions
→ Mapping/rejection queue
→ Publication confirmation
```

### 128.4 Delta updates

Delta event contains:

- product and version;
- changed fields;
- before/after values;
- effective date;
- affected channels;
- materiality;
- required retailer action;
- whether open orders are affected;
- rollback reference.

No product, price, image or compliance field may be silently overwritten in an already submitted order snapshot.

### 128.5 Content completeness score

```text
Completeness Score
= Weighted Valid Required Fields
  / Weighted Required Fields
```

Separate dimensions:

- commercial completeness;
- content completeness;
- media readiness;
- compliance readiness;
- localization readiness;
- retailer-channel readiness.

A single average must not hide a blocking missing field.

### 128.6 Acceptance criteria

- same package can be mapped to several retailer templates;
- field-level lineage remains visible;
- rejected rows retain structured reason;
- rights-expired image is automatically removed from future feeds;
- open historical orders retain prior image/product snapshots;
- delta replay is idempotent;
- full and delta packages reconcile by product/version count.

---

## 129. EDI and retailer compliance hub

This section is `SYNTHA TARGET`, based on established wholesale integration patterns rather than a claim about one competitor.

### 129.1 Supported transaction families

- purchase order;
- PO acknowledgement;
- PO change;
- advance ship notice;
- invoice;
- inventory advice;
- sales/sell-through report;
- functional/technical acknowledgement;
- remittance advice;
- return authorization;
- credit/debit memo;
- product/catalog feed.

Common mappings may include EDI 850/855/860/856/810/846/852/997/999 and equivalent EDIFACT/API forms. Exact standard/version is partner-specific and stored in configuration.

### 129.2 Entities

```text
TradingPartner
TradingPartnerAgreement
DocumentProfile
EDIEnvelope
EDITransaction
EDITransactionLine
Acknowledgement
MappingVersion
ComplianceRule
ComplianceViolation
ReplayJob
```

### 129.3 Transaction state

```text
RECEIVED / CREATED
→ AUTHENTICATED
→ PARSED
→ VALIDATED
→ MAPPED
→ BUSINESS_ACCEPTED
→ APPLIED
→ ACKNOWLEDGED

Side states:
REJECTED / PARTIAL / DUPLICATE / QUARANTINED / RETRYING
```

### 129.4 Routing-guide compliance

Rules may validate:

- ship window;
- carrier/service;
- carton contents;
- GS1/SSCC label;
- ASN timing;
- packing hierarchy;
- PO/style/SKU identifiers;
- quantity tolerance;
- price tolerance;
- required documents;
- location code;
- invoice structure.

### 129.5 Compliance score

```text
Compliance Rate
= Transactions without chargeable violation
  / Eligible Transactions
```

Must show violation count, financial deductions, responsible party, dispute and recovery.

### 129.6 Operator workspace

- queue by severity;
- original document and parsed representation;
- mapping version;
- row-level error;
- linked order/shipment/invoice;
- suggested correction;
- replay;
- acknowledgement status;
- partner SLA;
- audit.

---

## 130. SparkLayer — wholesale application, quoting, agent and accountancy benchmark

### 130.1 COMPETITOR CONFIRMED capabilities

Official SparkLayer materials describe:

- customer groups with assigned price lists, payment methods and order limits;
- company/customer and role management;
- sales agents ordering on behalf of customers;
- access to customer accounts, previous orders and reorder flows;
- sales-agent support for completing abandoned carts;
- wholesale application Forms with review and approval;
- customer-specific catalogs;
- quote-to-order workflow;
- customer account activity timeline;
- accountancy integrations;
- invoices, balances and payment history in the customer account;
- payment-state synchronization including paid, unpaid and partially paid states;
- integration with commerce/accounting systems such as Shopify, Xero and QuickBooks in described configurations.

### 130.2 JOOR evidence status

Audited JOOR confirms connections, company profile, orders, messages and payment entry points. Not confirmed as integrated workflows:

- public wholesale application → reviewed company creation;
- structured quote negotiation before order;
- customer group rule package combining catalog, price, payment and order limits;
- customer self-service AR ledger with invoices, balances and payment history;
- seller activity timeline combining cart, quote, order, invoice and payment;
- governed agent completion of an abandoned buyer cart.

Status: `JOOR NOT CONFIRMED / UAT`.

### 130.3 SYNTHA TARGET

- `WholesaleApplication` module;
- `CommercialPolicyBundle` for company/location;
- bidirectional `Quote` workflow;
- buyer-facing AR self-service;
- unified activity timeline;
- consent-based sales-agent assistance;
- configurable application forms without weakening canonical company verification.

Official sources:

- https://docs.sparklayer.io/customer-groups
- https://www.sparklayer.io/unify
- https://www.sparklayer.io/features/sales-agents
- https://www.sparklayer.io/features/wholesale-application-forms
- https://www.sparklayer.io/features/accountancy

---

## 131. Wholesale application and account approval

### 131.1 Application types

- public apply;
- invitation-only;
- referral;
- migrated/administratively created;
- marketplace verification;
- additional company location;
- credit application.

### 131.2 Entities

```text
WholesaleApplication
ApplicationVersion
ApplicantCompany
ApplicantLocation
ApplicantContact
ApplicationDocument
ApplicationAnswer
VerificationCheck
ApplicationDecision
ApplicationTask
```

### 131.3 Configurable form fields

- legal name;
- trading name;
- registration/tax ID;
- legal form;
- country;
- registered and trading addresses;
- website/social;
- business type/channel;
- categories;
- current brands;
- store count;
- sales channels;
- price positioning;
- expected order value;
- references;
- bank/credit information where legally appropriate;
- resale/tax certificates;
- buyer and finance contacts;
- consent and terms.

### 131.4 State machine

```text
DRAFT
→ SUBMITTED
→ DUPLICATE_CHECK
→ IDENTITY_VERIFICATION
→ COMMERCIAL_REVIEW
→ CREDIT_REVIEW optional
→ APPROVED / CONDITIONALLY_APPROVED / CHANGES_REQUESTED / REJECTED
→ ACCOUNT_PROVISIONED
→ ONBOARDING
```

### 131.5 Decision output

Approval must create or bind:

- Organization;
- Legal Entity;
- Company Location;
- Contacts and memberships;
- customer group;
- catalog access;
- price list;
- currency;
- tax profile;
- payment terms;
- credit policy;
- order limits;
- sales owner;
- effective dates.

### 131.6 Controls

- duplicate company detection;
- sanctions/fraud screening through approved provider where required;
- manual review and false-positive handling;
- reason codes;
- document expiry;
- applicant communication;
- SLA and escalation;
- no automatic rejection solely from opaque AI score;
- immutable decision snapshot.

---

## 132. Quote-to-order and negotiated selling

### 132.1 Quote origins

- buyer requests quote;
- seller creates proposal;
- sales rep creates assisted quote;
- cart converted to quote;
- RFQ response converted to customer quote;
- event/customization quote.

### 132.2 Quote entities

```text
Quote
QuoteVersion
QuoteLine
QuoteLineAlternative
QuoteCondition
QuoteApproval
QuoteMessage
QuoteAcceptance
```

### 132.3 Quote fields

- seller and buyer company/location;
- currency;
- validity window;
- products/variants;
- quantities;
- base price;
- negotiated price;
- discount and reason;
- delivery windows;
- freight/incoterm;
- payment terms;
- customization;
- MOQ/MOV exceptions;
- tax estimate;
- attachments;
- internal margin;
- approval policy.

### 132.4 State machine

```text
DRAFT
→ SENT
→ VIEWED
→ BUYER_CHANGES_REQUESTED
→ SELLER_REVISION
→ INTERNAL_APPROVAL
→ ACCEPTED / REJECTED / EXPIRED / WITHDRAWN
→ CONVERTED_TO_ORDER
```

### 132.5 Version rule

Every commercial change creates `QuoteVersion`. The interface presents:

- original request;
- current seller offer;
- buyer counterproposal;
- accepted version;
- differences and financial impact.

### 132.6 Conversion

Accepted quote converts to a new draft/order snapshot with:

- exact accepted price;
- quantity;
- delivery;
- terms;
- quote/version reference;
- approval evidence;
- expiration check;
- inventory revalidation.

The quote never overwrites catalog master price and never mutates an already submitted order silently.

---

## 133. Accounts receivable self-service and payment allocation

### 133.1 Buyer workspace

- account balance;
- current and overdue exposure;
- credit limit and available credit;
- invoices;
- credit/debit notes;
- payments;
- unapplied cash;
- statements;
- disputes;
- scheduled due dates;
- downloadable documents;
- payment action where enabled.

### 133.2 Invoice state

```text
DRAFT
→ ISSUED
→ PARTIALLY_PAID
→ PAID
→ OVERDUE
→ DISPUTED
→ CREDITED / WRITTEN_OFF / CANCELLED
```

### 133.3 Payment allocation

```text
Unapplied Amount
= Payment Received
- Allocated Amount
- Refunds
- Reversals
```

Allocation can be automatic by invoice/reference or manual with finance approval.

### 133.4 Statement reconciliation

Statement totals must reconcile:

```text
Opening Balance
+ Invoices
+ Debit Notes
- Payments Applied
- Credit Notes
- Write-offs
= Closing Balance
```

### 133.5 Integration rules

- accounting/ERP remains declared source of truth by tenant policy;
- sync direction is explicit;
- external IDs are immutable;
- duplicate invoice/payment protection;
- partial payment supported;
- payment webhook is verified;
- synchronization lag is shown;
- disputed amount is not hidden inside overdue amount;
- historical status is retained.

---

## 134. Unified commercial activity timeline

### 134.1 Purpose

A single timeline should explain the entire account/order history without merging objects that have different legal meanings.

Timeline events may include:

- application submitted/approved;
- connection created;
- catalog assigned;
- presentation sent/opened;
- cart created/assisted;
- quote sent/revised/accepted;
- order submitted/confirmed/amended;
- production delay;
- shipment dispatched;
- invoice issued;
- payment received/allocated;
- return/claim/dispute;
- call, meeting, task or message.

### 134.2 Visibility scopes

- internal seller only;
- buyer and seller shared;
- finance only;
- production/supplier shared;
- system/audit only.

An aggregated timeline never changes the source object. Clicking an event opens the authoritative record/version.

### 134.3 Timeline event contract

```text
activity_id
occurred_at
effective_at
actor
source_object_type
source_object_id
source_object_version
event_type
summary
visibility
financial_impact
correlation_id
```

### 134.4 Acceptance criteria

- no private note leaks to counterparty;
- order amendment links to before/after version;
- payment links to transaction and allocation;
- imported event shows source system;
- repeated webhook does not duplicate event;
- account switch immediately changes timeline scope.

---

## 135. CLO-SET — 3D collaboration and visual tech-pack benchmark

### 135.1 COMPETITOR CONFIRMED capabilities

Official CLO-SET documentation describes:

- browser-based collaborative 3D workspace;
- Digital Garment sharing by link and controlled access;
- comments and annotations tied to garment/version;
- Web Tech Pack generated from 3D assets;
- Excel Tech Pack export by version;
- BOM, POM/measurements and cost views;
- colorway and grading context;
- material, trim and construction information;
- construction markers and annotations;
- synchronized style overview and custom fields;
- 3D and 2D/DXF-related viewing workflows;
- role-based collaboration across product-development stages.

### 135.2 JOOR evidence status

Audited JOOR supports rich commercial media and documents, but the following were not confirmed:

- canonical 3D garment version as a product-development object;
- annotation pinned to 3D construction location;
- 3D-derived visual tech pack;
- synchronized BOM/POM/cost projection from digital garment;
- pattern/DXF review;
- digital-sample approval linked to physical sample and production release.

### 135.3 SYNTHA TARGET

- digital sample as a first-class PLM object;
- 3D file/version lineage;
- web review without specialist desktop software;
- annotation-to-BOM/POM/construction linkage;
- controlled external share;
- 3D-to-tech-pack projection;
- reconciliation against canonical BOM, measurement chart and cost;
- use in showroom/catalog only after commercial approval.

Official sources:

- https://support.clo-set.com/hc/en-us/articles/900001268163-3D-Tech-Pack
- https://support.clo-set.com/hc/en-us/articles/19384265745945-Web-Tech-Pack
- https://support.clo-set.com/hc/en-us/articles/900002994946-Share-Contents
- https://support.clo-set.com/hc/en-us/articles/19384178536473-Construction
- https://www.clo-set.com/

---

## 136. Digital sample and 3D review workflow

### 136.1 Entities

```text
DigitalSample
DigitalGarmentVersion
ThreeDAsset
PatternAsset
RenderAsset
AvatarProfile
DigitalFitReview
DesignAnnotation
ConstructionAnnotation
DigitalSampleApproval
ExternalReviewLink
```

### 136.2 File and metadata

- native source format;
- neutral/export format;
- checksum;
- file size;
- software/version;
- units;
- avatar/body profile;
- simulation settings;
- fabric physics version;
- colorway;
- pattern version;
- linked style/BOM/measurement versions;
- renderer;
- created by/at;
- rights/confidentiality.

### 136.3 State machine

```text
DRAFT
→ READY_FOR_INTERNAL_REVIEW
→ INTERNAL_CHANGES_REQUESTED
→ READY_FOR_EXTERNAL_REVIEW
→ EXTERNAL_CHANGES_REQUESTED
→ DIGITALLY_APPROVED
→ PHYSICAL_SAMPLE_REQUIRED / PHYSICAL_SAMPLE_WAIVED
→ PRODUCTION_REFERENCE_RELEASED
→ SUPERSEDED / ARCHIVED
```

### 136.4 Annotation types

- silhouette/fit;
- proportion;
- construction;
- seam/stitch;
- material/trim;
- color;
- print/artwork;
- measurement;
- pattern;
- packaging/presentation;
- defect/risk.

Each annotation has 3D coordinate/surface anchor, camera view, screenshot, author, visibility, status, owner and linked corrective action.

### 136.5 Digital vs physical evidence

Digital approval does not automatically equal production approval. Policy must specify:

- which categories permit digital-only approval;
- required physical sample type;
- risk thresholds;
- material realism limits;
- measurement/fit evidence;
- approvers;
- waiver reason;
- final production reference.

### 136.6 Acceptance criteria

- comments remain attached to exact version;
- new upload does not move old annotations silently;
- external reviewer cannot access unrelated styles;
- expired link is revoked immediately;
- 3D viewer has image fallback;
- approved version links to tech-pack release and sample decision;
- physical-sample findings can be compared against digital assumptions.

---

## 137. 3D → PLM → commercial catalog projection

### 137.1 Source ownership

- 3D workspace owns geometry/simulation files and visual annotations;
- PLM owns canonical style, BOM, measurement chart, construction and lifecycle;
- catalog owns approved commercial projection;
- order owns immutable commercial snapshots.

### 137.2 Projection flow

```text
Digital Garment Version
→ Extract candidate materials/colors/measurements
→ Compare with canonical PLM version
→ Resolve differences
→ Release Tech Pack
→ Approve digital/physical sample
→ Generate commercial media
→ Commercial projection
→ Linesheet/showroom/order
```

### 137.3 Conflict classes

- material exists in 3D but not BOM;
- BOM material not placed in 3D;
- colorway mismatch;
- measurement mismatch;
- pattern version mismatch;
- construction annotation unresolved;
- cost missing;
- media rights missing;
- sample approval stale relative to latest version.

### 137.4 Controlled synchronization

No blind two-way synchronization. Each change displays:

- source;
- target;
- old/new value;
- owner;
- impact;
- accept/reject;
- resulting version.

### 137.5 Commercial readiness

3D asset enters catalog only after:

- style commercial approval;
- colorway approval;
- rights approval;
- image/render quality check;
- no confidential construction data included;
- approved price/availability context;
- correct catalog version.

---

## 138. Product-content SLA and readiness control

### 138.1 SLA milestones

- style data due;
- first imagery due;
- final imagery due;
- translated copy due;
- price due;
- GTIN/SKU due;
- compliance evidence due;
- retailer mapping due;
- publication due;
- correction due.

### 138.2 Readiness dimensions

```text
Product Readiness
├── PLM Ready
├── Cost Ready
├── Sample Ready
├── Commercial Ready
├── Content Ready
├── Compliance Ready
├── Channel Ready
└── Order Ready
```

### 138.3 Blocking examples

- no approved price;
- no orderable SKU;
- missing delivery window;
- missing required media;
- expired usage rights;
- missing country of origin;
- unapproved sustainability claim;
- unresolved taxonomy mapping;
- product version newer than approved sample;
- catalog projection older than PLM release.

### 138.4 Dashboard

- styles by readiness state;
- blocking issue count;
- owner;
- due date;
- days overdue;
- affected retailers/channels;
- potential lost order value;
- bulk correction;
- SLA trend.

### 138.5 Formula

```text
On-time Content Readiness %
= Products reaching required channel-ready state by due date
  / Products due in period
```

A product with all optional fields but one blocking mandatory field remains not ready.

---

## 139. Expanded gap matrix — version 2.6

| Capability | Benchmark | JOOR evidence status | Syntha target | Priority |
|---|---|---|---|---|
| Two-way product and retail data network | Fashion Cloud | NOT CONFIRMED | Governed ProductContent + RetailData exchange | P1 |
| Retail sales/inventory feedback | Fashion Cloud | NOT CONFIRMED | Daily location-SKU sell-through feed | P1 |
| Data-sharing agreement | Fashion Cloud | NOT CONFIRMED | Field/location/use-purpose permissions | P1 |
| Content subscriptions and deltas | Fashion Cloud | NOT CONFIRMED | Versioned retailer content subscription | P1 |
| EDI compliance workbench | Industry benchmark | NOT CONFIRMED | PO/ASN/invoice/acknowledgement hub | P2 |
| Wholesale application forms | SparkLayer | NOT CONFIRMED | Application → verification → account provisioning | P1 |
| Customer-group commercial policy | SparkLayer | PARTIAL/UAT | Catalog + price + payment + limits bundle | P0 |
| Quote-to-order | SparkLayer | NOT CONFIRMED | Versioned counteroffer and conversion | P1 |
| Buyer AR self-service | SparkLayer | NOT CONFIRMED | Invoices, balances, payment history and disputes | P2 |
| Agent completion of abandoned cart | SparkLayer | NOT CONFIRMED | Timed consent-based assistance | P2 |
| Unified account activity timeline | SparkLayer | NOT CONFIRMED | Permission-aware operational timeline | P1 |
| Browser-based 3D review | CLO-SET | NOT CONFIRMED | Digital sample workspace | P2 |
| 3D annotations tied to version | CLO-SET | NOT CONFIRMED | Surface-pinned review and actions | P2 |
| 3D-derived web tech pack | CLO-SET | NOT CONFIRMED | Controlled projection to canonical PLM | P2 |
| BOM/POM/cost visual review | CLO-SET | NOT CONFIRMED | Reconciled digital tech-pack views | P2 |
| DXF/pattern review | CLO-SET | NOT CONFIRMED | Controlled pattern asset viewer | P3 |
| Product-content readiness SLA | Composite benchmark | NOT CONFIRMED | Channel-specific readiness control tower | P1 |

---

## 140. New canonical routes, entities and events

### 140.1 Routes

```text
/data-network/agreements
/data-network/feeds
/data-network/data-quality
/replenishment/recommendations
/replenishment/exceptions
/content/packages
/content/subscriptions
/content/channel-readiness
/integrations/edi
/integrations/edi/transactions/:id
/applications/wholesale
/applications/wholesale/:id
/quotes
/quotes/:id
/finance/accounts-receivable
/accounts/:accountId/activity
/plm/digital-samples
/plm/digital-samples/:id
/plm/3d-review/:versionId
```

### 140.2 Entities

```text
ProductContentPackage
ContentSubscription
RetailDataShareAgreement
RetailProductMapping
SalesFeed
InventoryFeed
ReturnFeed
SellThroughSnapshot
DataQualityIssue
TradingPartner
EDITransaction
ComplianceViolation
WholesaleApplication
VerificationCheck
ApplicationDecision
CommercialPolicyBundle
Quote
QuoteVersion
QuoteLineAlternative
AccountStatement
PaymentAllocation
CommercialActivity
DigitalSample
DigitalGarmentVersion
ThreeDAsset
PatternAsset
DesignAnnotation
DigitalSampleApproval
ProductReadinessSnapshot
```

### 140.3 Events

```text
retail_data_agreement_activated
retail_feed_received
retail_feed_reconciled
sell_through_snapshot_certified
replenishment_recommendation_generated
replenishment_recommendation_overridden
content_package_published
content_delta_acknowledged
edi_transaction_rejected
edi_violation_resolved
wholesale_application_submitted
wholesale_application_approved
quote_sent
quote_countered
quote_accepted
quote_converted_to_order
invoice_payment_allocated
digital_sample_version_uploaded
digital_annotation_resolved
digital_sample_approved
product_channel_readiness_changed
```

---

## 141. Additional UAT scenarios

1. Retailer shares sales for only selected locations; brand cannot query excluded locations.
2. Data agreement is revoked; future feeds stop while permitted historical aggregates remain.
3. POS feed omits one store for three days; recommendation shows reduced coverage and confidence.
4. Inventory equation fails; system blocks auto-draft and opens reconciliation issue.
5. Replenishment recommendation exceeds OTB; buyer receives constrained alternative.
6. Recommendation is overridden; outcome model records reason and later performance.
7. Brand changes composition; subscribed retailer receives delta and acknowledgement is tracked.
8. Rights-expired image is removed from future feed but historical order snapshot remains intact.
9. EDI PO is replayed; idempotency prevents duplicate order.
10. ASN quantity exceeds confirmed order; transaction is quarantined with structured reason.
11. Wholesale applicant matches existing legal entity; system links or escalates rather than duplicates.
12. Conditional application approval creates limited catalog and prepaid terms.
13. Buyer counters quote price and delivery; seller revision becomes a new immutable version.
14. Accepted quote expires before conversion; inventory and price are revalidated.
15. Partial payment is allocated across two invoices; statement reconciles exactly.
16. Imported accounting payment arrives twice; duplicate protection prevents double allocation.
17. Digital garment version is replaced; old annotations stay on old version.
18. External 3D link expires and cannot access any other product.
19. 3D BOM differs from canonical BOM; release is blocked until reconciliation.
20. Approved physical sample is older than latest 3D/tech-pack version; production warning is blocking.
21. Product is ready for one retailer channel but missing mandatory fields for another.
22. Account switch removes prior company AR, quote and activity data from all open views.

---

## 142. Revised implementation sequence — version 2.6

### Stage 1 — preserve evidence and canonical truth

- retain original JOOR route/screen audit;
- canonical entities and ownership;
- company/location commercial context;
- style/colorway/SKU;
- price/catalog/terms versioning;
- permissions and audit.

### Stage 2 — execute wholesale transaction safely

- persistent cart;
- quantity matrix;
- multi-delivery groups;
- submit/confirm/amendment;
- ATS/reservation;
- documents;
- buyer/seller activity.

### Stage 3 — planning and product-content network

- assortment targets and rollups;
- ProductContentPackage;
- retailer channel templates;
- subscriptions/deltas;
- retail-data agreements;
- POS/ERP mappings;
- data-quality workbench.

### Stage 4 — sell-through and replenishment

- certified sales/inventory facts;
- demand correction;
- constrained recommendations;
- exception workbench;
- draft-order conversion;
- outcome measurement.

### Stage 5 — negotiated and financial workflows

- wholesale applications;
- commercial policy bundles;
- quotes;
- AR self-service;
- payment allocation;
- EDI compliance.

### Stage 6 — digital product development

- digital sample;
- 3D review and annotations;
- controlled tech-pack projection;
- reconciliation with BOM/POM/cost;
- digital/physical approval policy;
- approved commercial media projection.

### Stage 7 — ecosystem differentiation

- event commerce;
- agency and commissions;
- licensing/royalties;
- campaigns and incrementality;
- trade credit/guarantee;
- advanced AI and network benchmarks.

### Version 2.6 product rule

```text
Syntha is not stronger because it contains more modules.
It is stronger only when product data, order intent,
physical supply, retail performance and financial outcome
remain connected by traceable versions and governed events.
```

---

## 143. Official sources added in version 2.6

### Fashion Cloud

- https://www.fashion.cloud/brands

### SparkLayer

- https://docs.sparklayer.io/customer-groups
- https://www.sparklayer.io/unify
- https://www.sparklayer.io/features/sales-agents
- https://www.sparklayer.io/features/wholesale-application-forms
- https://www.sparklayer.io/features/accountancy

### CLO-SET

- https://www.clo-set.com/
- https://support.clo-set.com/hc/en-us/articles/900001268163-3D-Tech-Pack
- https://support.clo-set.com/hc/en-us/articles/19384265745945-Web-Tech-Pack
- https://support.clo-set.com/hc/en-us/articles/900002994946-Share-Contents
- https://support.clo-set.com/hc/en-us/articles/19384178536473-Construction

### Version 2.6 decision

Fashion Cloud establishes the benchmark for two-way product and retail-data exchange. SparkLayer adds practical wholesale applications, customer-group commerce, quote-to-order, agent assistance and AR self-service. CLO-SET provides the strongest reviewed benchmark for browser-based 3D collaboration and visual tech packs.

The resulting Syntha target is a closed loop:

```text
PLM / 3D Development
→ Approved Commercial Content
→ Assortment and Wholesale Order
→ Supply and Delivery
→ Retail Sales / Inventory / Returns
→ Replenishment and Next-season Planning
→ Financial Reconciliation
```

---

## 144. Toolio — merchandise financial planning and execution benchmark

### 144.1 COMPETITOR CONFIRMED direction

Официальные материалы Toolio описывают единую merchandising-платформу, объединяющую:

- Merchandise Financial Planning;
- Open-to-Buy;
- Assortment Item Planning;
- Demand Forecasting;
- Initial Allocation;
- Replenishment;
- Store Transfers;
- scenario planning;
- top-down, bottom-up и middle-out planning;
- SKU × location forecasting;
- связь pre-season planning с in-season execution;
- создание Purchase Orders, Transfers и Replenishments;
- интеграции с ERP, POS, e-commerce, data warehouse и BI.

Это важный benchmark: JOOR хорошо помогает выбрать товар и оформить wholesale order, но не подтвержден как полноценный merchandise planning system, где финансовый план, ассортимент, OTB, allocation и фактическое исполнение живут в одном числовом контуре.

### 144.2 JOOR evidence status

В проверенном JOOR подтверждены:

- linesheets;
- Visual Assortment как gated module;
- order creation;
- order reports;
- retailer locations;
- product/order history;
- интеграционные entry points.

Не подтверждены как единый native workflow:

- Merchandise Financial Plan;
- top-down → bottom-up reconciliation;
- departmental OTB;
- WSSI / weekly stock-sales-intake;
- store-level assortment targets;
- SKU-location forecast;
- initial allocation;
- replenishment;
- transfer optimization;
- execution feedback into financial plan.

Статус: `JOOR NOT CONFIRMED / GATED / UAT`, а не доказанное отсутствие.

### 144.3 SYNTHA TARGET — planning spine

Syntha должна иметь один planning spine:

```text
Corporate Financial Target
→ Merchandise Financial Plan
→ Category / Brand Budget
→ Assortment Plan
→ Item Plan
→ Buy Plan / OTB
→ Wholesale Order
→ Confirmation
→ Receipt
→ Allocation
→ Sales / Returns / Markdown
→ Reforecast
```

Основной принцип:

> Финансовый план, ассортимент и товарное исполнение не являются тремя независимыми таблицами. Любое изменение item-level quantity должно показывать влияние на sales, margin, stock, cash и OTB.

---

## 145. Merchandise Financial Planning — детальная спецификация Syntha

### 145.1 Planning hierarchy

```text
Holding
→ Legal Entity
→ Channel
→ Region
→ Store Cluster
→ Department
→ Category
→ Subcategory
→ Brand
→ Season
→ Month / Week
```

Hierarchy должна быть effective-dated. Изменение организационной структуры не переписывает прошлые планы.

### 145.2 Plan versions

- Original Budget;
- Approved Budget;
- Working Plan;
- Latest Estimate;
- Reforecast;
- Stretch Scenario;
- Downside Scenario;
- Actual;
- Last Year;
- Last Forecast.

Для каждой версии фиксируются:

- owner;
- status;
- currency;
- FX policy;
- calendar;
- assumptions;
- approval state;
- created/approved timestamps;
- source snapshot;
- comparison baseline.

### 145.3 Core measures

- Net Sales;
- Gross Sales;
- Returns;
- Markdown;
- Gross Margin;
- Gross Margin %;
- Opening Stock at Cost/Retail;
- Closing Stock at Cost/Retail;
- Average Stock;
- Receipts;
- On Order;
- Intake Margin;
- Sell-through;
- Stock Turn;
- Weeks of Supply;
- OTB;
- Cash Requirement;
- Purchase Margin;
- GMROI;
- Option Count;
- SKU Count;
- Unit Count;
- Average Unit Retail;
- Average Unit Cost;
- Full-price Share;
- Promotional Share;
- Carry-over Share;
- Newness Share.

### 145.4 Core formulas

```text
Net Sales
= Gross Sales - Returns - Cancellations

Gross Margin Value
= Net Sales ex VAT - COGS

Gross Margin %
= Gross Margin Value / Net Sales ex VAT

Closing Stock
= Opening Stock + Receipts + Transfers In
- Net Sales at Cost - Transfers Out - Shrinkage

Average Stock
= average(period opening and closing stock snapshots)

Stock Turn
= Annualized COGS / Average Stock at Cost

Weeks of Supply
= Ending Stock / Forecast Weekly Demand

GMROI
= Gross Margin Value / Average Inventory at Cost
```

### 145.5 OTB control

```text
Available OTB
= Approved Planned Receipts
- Confirmed On Order
- Unconfirmed Commitments reserved by policy
- Received not yet reconciled
+ Approved Cancellations
+ Released Reservations
```

OTB обязателен по:

- month/week;
- legal entity;
- channel;
- category;
- brand;
- currency;
- cost/retail basis;
- scenario.

### 145.6 Reconciliation rules

- item plan must roll up exactly to assortment/category plan;
- category plan must reconcile to merchandise financial plan;
- currency conversion must use explicit budget/spot/contract rate;
- submitted order consumes OTB according to tenant policy;
- confirmed order replaces provisional commitment;
- amendment adjusts OTB by delta, not by full order amount;
- cancellation releases OTB only after approved state transition;
- receipt variance separates quantity, price, duty, freight and FX effects.

### 145.7 Planning workflow

```text
DRAFT
→ COLLABORATIVE_REVIEW
→ FINANCE_REVIEW
→ CHANGES_REQUESTED
→ APPROVED
→ LOCKED_BASELINE
→ REFORECASTED
→ SUPERSEDED
```

No silent overwrite of approved baseline.

### 145.8 Planning grid requirements

- Excel-like keyboard behavior;
- formula-aware cells;
- copy/paste ranges;
- spread by seasonality;
- proportional, weighted and manual spreading;
- lock cells;
- comments and assumptions;
- scenario compare;
- variance heatmap;
- drill-down to item/store;
- permissions by measure and hierarchy;
- audit at changed-cell level;
- large-grid virtualization;
- background recalculation;
- export with formula/result metadata.

---

## 146. Assortment Item Planning — усиление Visual Assortment

Visual Assortment не должен ограничиваться визуальным подбором картинок.

### 146.1 Item-plan grain

```text
Season
× Delivery
× Brand
× Style
× Color
× Size
× Store Cluster / Door
× Week
```

### 146.2 Item-plan measures

- planned option;
- planned SKU count;
- planned buy units;
- wholesale value;
- landed cost;
- retail value;
- initial margin;
- markdown assumption;
- expected net sales;
- expected ending stock;
- expected sell-through;
- size curve;
- color curve;
- launch date;
- exit date;
- store count;
- breadth/depth;
- minimum presentation stock;
- first allocation;
- replenishment reserve;
- e-commerce reserve;
- wholesale reserve;
- risk score.

### 146.3 Top-down versus bottom-up reconciliation

```text
Category Target
↔ Brand Target
↔ Delivery Target
↔ Item Selection
↔ SKU / Store Quantities
```

UI must show:

- target;
- selected;
- variance;
- committed;
- confirmed;
- received;
- sold;
- forecast outcome.

### 146.4 Option architecture

Every planned option has role:

- Core;
- Key Volume;
- Fashion;
- Image / Halo;
- Entry Price;
- Premium Price;
- Carry-over;
- Test;
- Exclusive;
- Localized;
- Replenishable;
- Limited Drop;
- Exit / Clearance.

Role determines:

- target depth;
- number of doors;
- safety stock;
- reorder eligibility;
- markdown policy;
- presentation minimum;
- review cadence.

### 146.5 Breadth-depth controls

```text
Breadth
= Count of active options/styles

Depth per Option
= Planned Units / Active Options

SKU Productivity
= Forecast Net Sales / Active SKU Count
```

System warns about:

- too many low-depth options;
- duplicate color/product roles;
- price-band gaps;
- size fragmentation;
- assortment cannibalization;
- OTB overrun;
- supplier concentration;
- delivery congestion;
- insufficient full-price weeks.

---

## 147. Nextail — allocation, replenishment and store-transfer benchmark

### 147.1 COMPETITOR CONFIRMED capabilities

Official Nextail materials describe:

- demand forecast at SKU × store × day;
- first allocation for new products;
- replenishment optimization;
- global network optimization rather than isolated store calculation;
- stock meritocracy and sales probability;
- warehouse and store constraints;
- residual value;
- sales thresholds;
- planning horizons and picking schedules;
- pre-allocation of inbound stock;
- store transfers / inventory rebalancing;
- configurable service levels;
- visual-merchandising rules;
- mobile barcode product lookup;
- store requests;
- HQ/store role separation;
- scenario review before execution.

### 147.2 JOOR evidence status

JOOR publicly confirms live inventory and reorder functionality in wholesale context. It does not, in reviewed evidence, establish a full retail network optimizer for:

- SKU-store-day demand;
- first allocation;
- store transfers;
- global optimization across all doors;
- residual-value objective;
- store capacity and presentation constraints;
- pre-allocation of inbound shipments.

### 147.3 SYNTHA TARGET

Syntha must distinguish six decisions:

1. **Buy quantity** — how much to purchase from supplier.
2. **Reservation** — what quantity is protected for a customer/channel/event.
3. **First allocation** — initial distribution before launch.
4. **Replenishment** — warehouse-to-store movement after demand signal.
5. **Transfer** — store-to-store or node-to-node rebalancing.
6. **Markdown/exit** — when movement is less profitable than price action.

---

## 148. Allocation and Replenishment Optimization Engine

### 148.1 Network model

```text
Supplier / Factory
→ Origin Consolidation
→ Central DC
→ Regional DC
→ Store
→ E-commerce Fulfillment Node
→ Wholesale / Event Reserve
```

Each node has:

- capacity;
- service area;
- handling calendar;
- lead time;
- minimum shipment;
- transfer cost;
- labor capacity;
- receiving limit;
- safety rules;
- availability timestamp.

### 148.2 Demand model

Inputs:

- sales history;
- returns;
- stockouts;
- lost-sales estimate;
- launch date;
- price and promotion;
- seasonality;
- weather/region where licensed;
- store cluster;
- product attributes;
- product similarity;
- local events;
- display/planogram requirement;
- e-commerce demand;
- buyer override;
- current and inbound stock.

### 148.3 First allocation

```text
Expected Launch Demand
= New Product Forecast by SKU × Store × Launch Horizon

Eligible Store Need
= Expected Launch Demand
+ Presentation Minimum
- Existing Comparable Substitute Stock

First Allocation
= constrained optimization of available units
across eligible stores and channels
```

Constraints:

- minimum size completeness;
- minimum presentation quantity;
- maximum store capacity;
- store eligibility;
- climate;
- price band;
- brand assortment agreement;
- launch date;
- inbound arrival;
- warehouse handling capacity;
- priority doors;
- fairness policy;
- online reserve.

### 148.4 Replenishment

```text
Lead-Time Demand
= Forecast Daily Demand × Effective Lead-Time Days

Target Stock
= Lead-Time Demand + Safety Stock + Presentation Minimum

Net Need
= Target Stock - On Hand - In Transit - Reserved Inbound

Recommended Replenishment
= constrained_round(max(0, Net Need), pack, node capacity, budget)
```

### 148.5 Store transfer optimization

Transfer candidate requires:

- source excess;
- destination need;
- positive expected margin after transfer cost;
- sufficient remaining selling window;
- acceptable handling time;
- no higher-value use at source;
- no policy restriction.

```text
Transfer Value
= Expected Incremental Gross Margin
- Transfer Cost
- Handling Cost
- Markdown Risk at Destination
+ Avoided Markdown at Source
```

### 148.6 Explainability

Every recommendation must show:

- source facts;
- forecast horizon;
- current stock;
- demand estimate;
- constraints applied;
- objective contribution;
- confidence;
- alternatives considered;
- why quantity is zero or capped;
- data freshness.

### 148.7 Execution workflow

```text
Scenario Created
→ Calculated
→ Exceptions Reviewed
→ Buyer/Allocator Adjusted
→ Approved
→ Transfer/Replenishment Orders Created
→ ERP/WMS Acknowledged
→ Picked
→ Shipped
→ Received
→ Outcome Measured
```

---

## 149. RELEX — unified forecasting, promotions, space and supply benchmark

### 149.1 COMPETITOR CONFIRMED direction

Official RELEX materials describe unified planning across:

- demand forecasting;
- automated replenishment;
- allocation;
- pricing and promotion optimization;
- space and assortment optimization;
- store-specific planograms;
- supply-chain optimization;
- real-time inventory visibility;
- store execution;
- diagnostics and root-cause analysis;
- scenario testing;
- supplier funding and promotional commitments.

### 149.2 Strategic lesson for Syntha

Planning decisions cannot be optimized independently:

```text
Promotion
↔ Price
↔ Demand
↔ Space
↔ Inventory
↔ Supplier Capacity
↔ Replenishment
↔ Store Execution
```

A promotion without supply creates stockout. Extra inventory without space creates store-operating failure. More space without demand destroys productivity. Syntha must expose these conflicts before approval.

---

## 150. Promotion and Space-Aware Merchandising

### 150.1 Promotion plan

Fields:

- objective;
- products;
- customer/retailer scope;
- channels;
- stores;
- start/end;
- mechanics;
- discount/funding split;
- expected uplift;
- baseline;
- supplier commitment;
- inventory requirement;
- display requirement;
- media/campaign;
- approval;
- ROI method.

### 150.2 Promotion demand

```text
Promotional Demand
= Baseline Demand
× Uplift Factor
× Availability Factor
× Distribution Factor
× Execution Compliance Factor
```

### 150.3 Space model for fashion

Traditional grocery planogram is not enough. Fashion requires:

- wall/rail/table/window capacity;
- facing or hanging units;
- folded stack capacity;
- mannequin/look placement;
- size presentation minimum;
- color-block rules;
- fixture dimensions;
- brand zoning;
- category adjacency;
- backroom capacity;
- visual-board version.

### 150.4 Space productivity

```text
Space Productivity
= Net Sales / Allocated Selling Space

Margin Productivity
= Gross Margin / Allocated Selling Space

Inventory Productivity
= Net Sales / Average Inventory Units in Assigned Space
```

### 150.5 Execution feedback

Store teams capture:

- display completed;
- actual fixture;
- missing product;
- photo evidence;
- stock exception;
- date/time;
- comments;
- replacement;
- manager approval.

Planogram/VisualBoard compliance must feed demand interpretation. Low sales under failed execution must not be treated as pure product rejection.

---

## 151. Inspectorio — quality risk and supplier improvement benchmark

### 151.1 COMPETITOR CONFIRMED capabilities

Official Inspectorio materials describe:

- digital inspections;
- inspection booking and scheduling;
- mobile inspection execution;
- standardized reporting;
- technical audits;
- lab-test workflows;
- supplier quality analytics;
- vendor self-inspections for low-risk suppliers;
- dynamic risk scoring;
- defect pattern analysis;
- root-cause support;
- CAPA recommendations;
- corrective-action workflows;
- responsible sourcing and compliance;
- traceability and production data connection;
- AI-supported risk signals and reporting.

### 151.2 JOOR evidence status

JOOR is a wholesale network and order platform. A comparable native quality operating system covering inspections, CAPA, lab tests and supplier risk was not confirmed in the audited interface or public materials reviewed for this document.

### 151.3 SYNTHA TARGET

Quality must be connected to:

```text
Style / BOM / Tech Pack
→ Supplier / Factory
→ Production Batch
→ Inspection
→ Defect
→ CAPA
→ Shipment Release
→ Claim / Chargeback
→ Supplier Score
→ Future Allocation Decision
```

---

## 152. Quality Operating System — detailed specification

### 152.1 Quality plan

- product/category template;
- applicable standards;
- critical-to-quality characteristics;
- sample type;
- inspection points;
- lab tests;
- AQL;
- tolerances;
- responsible party;
- required evidence;
- release conditions;
- escalation rules.

### 152.2 Inspection types

- material incoming;
- pre-production meeting;
- pilot run;
- inline;
- during production;
- final random inspection;
- 100% inspection;
- container loading;
- warehouse receipt;
- store/customer complaint inspection;
- vendor self-inspection;
- third-party inspection.

### 152.3 Inspection workflow

```text
PLANNED
→ BOOKING_REQUESTED
→ SCHEDULED
→ ASSIGNED
→ IN_PROGRESS
→ SUBMITTED
→ REVIEW_REQUIRED
→ PASSED / CONDITIONAL_PASS / FAILED
→ CAPA_REQUIRED
→ VERIFIED
→ CLOSED
```

### 152.4 Defect model

- defect code;
- category;
- severity;
- construction/material/location;
- image/video;
- affected units;
- occurrence rate;
- recurrence;
- probable cause;
- root cause;
- responsible tier;
- rework possibility;
- cost impact;
- consumer safety implication;
- shipment impact.

### 152.5 CAPA

```text
Issue Identified
→ Containment
→ Root Cause Analysis
→ Corrective Action
→ Preventive Action
→ Owner and Due Date
→ Evidence Submitted
→ Effectiveness Verification
→ Closed / Reopened
```

CAPA fields:

- 5 Why / fishbone / method;
- immediate containment;
- corrective action;
- preventive action;
- responsible supplier/site;
- target date;
- evidence;
- verification sample;
- verifier;
- effectiveness metric;
- recurrence period;
- financial recovery.

### 152.6 Dynamic quality risk score

```text
Quality Risk
= weighted function of
Recent Failures
+ Defect Severity
+ Recurrence
+ Product Complexity
+ New Supplier/Product Risk
+ Late CAPA
+ Lab-Test Failures
+ Consumer Complaints
- Verified Improvement
- Stable Performance History
```

Score must expose components and cannot replace approval policy.

### 152.7 Self-inspection eligibility

Vendor self-inspection can be enabled only with:

- approved site;
- trained named inspectors;
- recent pass history;
- no unresolved critical defect;
- calibrated equipment;
- random audit policy;
- evidence requirements;
- automatic suspension triggers.

### 152.8 Quality cost ledger

- inspection cost;
- lab test;
- rework;
- scrap;
- expedited freight;
- return;
- markdown;
- customer claim;
- chargeback;
- lost sales;
- recovery from supplier.

```text
Cost of Poor Quality
= Failure Cost + Rework + Returns + Claims + Lost Margin
- Supplier Recovery
```

---

## 153. Infor Nexus — multi-enterprise supply-chain network benchmark

### 153.1 COMPETITOR CONFIRMED direction

Official Infor Nexus materials describe a multi-enterprise business network connecting:

- buyers;
- sellers;
- suppliers;
- manufacturers;
- brokers;
- 3PLs;
- carriers;
- financial institutions.

Confirmed solution areas include:

- order, shipment and inventory visibility;
- supplier collaboration;
- control tower;
- predictive arrival information;
- global transportation management;
- procure-to-pay automation;
- trade document automation;
- supply-chain finance;
- dynamic discounting;
- PO/pre-shipment financing;
- multi-tier traceability;
- ESG and compliance.

### 153.2 JOOR evidence status

JOOR order management and integrations are strong for wholesale commerce. The reviewed evidence does not confirm an equivalent multi-enterprise execution network connecting production, freight, customs, banking and payment against one shared transaction graph.

### 153.3 SYNTHA TARGET

Syntha must support four connected but separate graphs:

1. **Commercial graph** — buyer, seller, order, price, terms.
2. **Physical graph** — material, production batch, carton, shipment, receipt.
3. **Financial graph** — invoice, payment, financing, credit note, settlement.
4. **Evidence graph** — document, test, certificate, inspection, approval.

---

## 154. Multi-Enterprise Order Control Tower

### 154.1 Party model

```text
Buyer
Seller / Brand
Factory
Material Supplier
Inspection Company
Forwarder
Carrier
Customs Broker
Warehouse
Bank / Finance Provider
Payment Provider
```

Each party receives only scoped fields and actions.

### 154.2 Order orchestration

```text
Wholesale Order Confirmed
→ Supplier/Factory PO
→ PO Acknowledgement
→ Material Commitments
→ Production Milestones
→ Inspection Release
→ Booking Request
→ Shipment Plan
→ ASN
→ Customs Documents
→ Departure
→ Arrival
→ Receipt
→ Invoice Match
→ Payment / Financing
```

### 154.3 Control-tower exception types

- supplier has not acknowledged PO;
- material not ordered;
- capacity conflict;
- milestone late;
- inspection failed;
- booking unavailable;
- document missing;
- shipment split;
- quantity variance;
- ETA risk;
- customs hold;
- invoice mismatch;
- payment hold;
- credit-limit breach;
- sanctions/compliance review;
- sustainability evidence missing.

### 154.4 Exception record

- issue type;
- affected objects;
- severity;
- predicted business impact;
- financial impact;
- customer impact;
- source event;
- owner;
- collaborators;
- recommended action;
- decision deadline;
- chosen action;
- resolution;
- recovered value;
- root cause.

### 154.5 Predicted ETA

ETA is versioned:

- contractual ETA;
- carrier ETA;
- system predicted ETA;
- customs-adjusted ETA;
- latest agreed delivery.

System must never overwrite contractual promise with prediction.

### 154.6 Supply-chain finance readiness

Finance options may include:

- dynamic discounting;
- approved-payables finance;
- reverse factoring;
- PO financing;
- pre-shipment finance;
- inventory finance;
- sustainable financing incentive.

Syntha Core records eligibility and transaction linkage but regulated financing is supplied through licensed partners.

---

## 155. Sourcemap — n-tier mapping and chain-of-custody benchmark

### 155.1 COMPETITOR CONFIRMED direction

Official Sourcemap materials describe:

- n-tier supplier discovery;
- supplier invitations cascading down the chain;
- BOM-level mapping;
- site, part and product-level traceability;
- data collected from suppliers at each tier;
- validation against BOM;
- transaction/document evidence;
- due diligence;
- customs and forced-labor compliance support;
- continuous refresh as sourcing changes.

### 155.2 Syntha requirement

A supplier list is not supply-chain traceability. Syntha must distinguish:

- declared relationship;
- verified site;
- product-specific relationship;
- batch-specific chain of custody;
- transaction evidence;
- audit evidence;
- current versus historical source.

---

## 156. TrusTrace — Digital Product Passport and item identity benchmark

### 156.1 COMPETITOR CONFIRMED direction

Official TrusTrace materials emphasize that a Digital Product Passport is a structured, machine-readable product record, not merely a QR code. Public solution materials describe:

- product and lifecycle data;
- supply-chain disclosures;
- chemical/sustainability data;
- unique product identity;
- item/SKU identifiers;
- persistent data carrier;
- role-based access;
- live data updates;
- consumer interface;
- integration to product-data platforms;
- GS1-oriented connectivity and emerging DPP protocols.

### 156.2 JOOR evidence status

JOOR can distribute commercial product content. A native item-level DPP, n-tier provenance and custody event infrastructure was not confirmed in the audited retailer interface.

---

## 157. Traceability and DPP Operating Model

### 157.1 Traceability hierarchy

```text
Brand
→ Product / Style
→ Colorway
→ SKU
→ Item or Batch
→ Production Order
→ Factory Site
→ BOM Component
→ Material Batch
→ Tier-N Supplier Site
→ Transformation Event
→ Shipment / Custody Event
→ Retail / Repair / Return / Recycle Event
```

### 157.2 Identity types

- internal style ID;
- SKU ID;
- GTIN;
- serial/item ID;
- batch/lot ID;
- material batch ID;
- supplier site ID;
- facility registration ID;
- shipment/container ID;
- QR/NFC/RFID data carrier ID.

Identity resolution must prevent one physical item from being attached to two incompatible provenance chains.

### 157.3 Evidence states

- self-declared;
- document-supported;
- transaction-supported;
- site-verified;
- third-party-certified;
- laboratory-verified;
- system-calculated;
- estimated;
- expired;
- disputed;
- revoked.

### 157.4 Claim model

Examples:

- material composition;
- recycled content;
- country of origin;
- manufacturing site;
- certification;
- restricted-substance compliance;
- repairability;
- recyclability;
- carbon/impact value;
- animal welfare;
- responsible sourcing.

Every claim stores:

- subject;
- scope;
- statement;
- methodology;
- evidence;
- issuer;
- validity;
- verification state;
- confidence;
- applicable market;
- public/internal access;
- dispute history.

### 157.5 Chain-of-custody events

```text
Material Created
→ Transformed
→ Combined
→ Split
→ Packed
→ Shipped
→ Received
→ Consumed in Production
→ Finished Item Created
→ Returned
→ Repaired
→ Resold
→ Recycled / Disposed
```

### 157.6 DPP publication

```text
Product Data Ready
→ Provenance Complete
→ Evidence Validated
→ Regulatory Template Resolved
→ Access Policy Applied
→ Identifier/Data Carrier Generated
→ DPP Published
→ Updated by Controlled Delta
→ Archived / Superseded
```

### 157.7 Access levels

- consumer;
- retailer;
- service/repair partner;
- customs/regulator;
- auditor;
- recycler;
- supplier;
- internal brand team.

Sensitive supplier pricing or confidential formulas must not become public simply because the product has a DPP.

---

## 158. EDITED and Stylumia — external market and fashion-demand intelligence

### 158.1 COMPETITOR CONFIRMED direction

Official EDITED materials describe:

- competitor assortment analysis;
- pricing architecture;
- promotion and discount monitoring;
- assortment structuring;
- product-selection support;
- trend and whitespace identification;
- site-merchandising benchmarking;
- customer profitability analysis;
- real-time market intelligence;
- AI-assisted natural-language access to retail data.

Official Stylumia materials describe:

- demand-sensing fashion trend forecasting;
- winning-product selection;
- demand forecasting for new products;
- localized assortments;
- prediction down to style, color and size;
- market/runway/retail demand signals.

### 158.2 JOOR evidence status

JOOR provides network and order analytics. A full external market-intelligence layer comparing competitor assortment breadth, price architecture, markdown cadence, newness and whitespace was not confirmed.

### 158.3 SYNTHA TARGET

Syntha should separate three intelligence layers:

1. **Internal truth** — own orders, inventory, sales, margin and returns.
2. **Network benchmark** — privacy-safe aggregated platform behavior.
3. **External market intelligence** — licensed competitor and market observations.

Never blend them without source labeling.

---

## 159. Market Intelligence and Competitive Benchmark Engine

### 159.1 Market observation entity

- source/provider;
- retailer/brand;
- market/country;
- channel;
- observed URL or source reference;
- product identity/match confidence;
- category;
- attributes;
- listed price;
- previous price;
- discount;
- first seen;
- last seen;
- stock/size visibility;
- launch/removal dates;
- promotion/message;
- evidence timestamp.

### 159.2 Product matching

Match hierarchy:

- exact GTIN;
- exact style code;
- exact brand + product code;
- image similarity;
- title/attribute similarity;
- manual verified match.

Every inferred match exposes confidence and may not be used for high-stakes pricing decisions without threshold/verification.

### 159.3 Assortment metrics

- breadth by category;
- depth proxy;
- newness rate;
- carry-over rate;
- entry/mid/premium price bands;
- color distribution;
- size availability;
- product lifecycle length;
- promotion penetration;
- markdown depth;
- markdown timing;
- out-of-stock signal;
- replenishment signal;
- assortment overlap;
- whitespace.

### 159.4 Pricing architecture

```text
Price Index
= Own Comparable Product Price / Market Comparable Median Price

Promotion Penetration
= Discounted Active Products / Active Products

Markdown Depth
= (Original Price - Current Price) / Original Price
```

### 159.5 Trend confidence

Trend score should consider:

- number of independent retailers;
- growth in newness;
- full-price persistence;
- stockout/availability signal;
- geographic spread;
- social/runway signal where licensed;
- price-band spread;
- sample size;
- data freshness.

### 159.6 Decision workflow

```text
Signal Detected
→ Analyst Validation
→ Opportunity / Threat
→ Assortment or Pricing Scenario
→ Financial Impact
→ Approval
→ Action
→ Outcome Measurement
```

AI may summarize signals but source observations remain inspectable.

---

## 160. Expanded gap matrix — planning, execution, quality and traceability

`NOT CONFIRMED` means not verified in audited JOOR access and reviewed public evidence.

| Capability | Benchmark | JOOR status | Syntha requirement | Priority |
|---|---|---|---|---|
| Merchandise Financial Planning | Toolio | NOT CONFIRMED | Versioned sales/margin/stock/OTB plan | P0/P1 |
| Top-down/bottom-up reconciliation | Toolio | NOT CONFIRMED | Financial plan ↔ item plan reconciliation | P1 |
| WSSI / weekly stock-sales-intake | Toolio/RELEX | NOT CONFIRMED | Weekly execution control | P1 |
| SKU-location demand forecast | Toolio/Nextail/RELEX | NOT CONFIRMED | Certified demand forecast service | P1 |
| First allocation | Nextail/Toolio | NOT CONFIRMED | New-product allocation optimizer | P1 |
| Store replenishment | Nextail/RELEX | NOT CONFIRMED | Constraint-aware replenishment | P1 |
| Store transfers | Nextail | NOT CONFIRMED | Network rebalance optimizer | P2 |
| Store-specific size curves | Toolio | NOT CONFIRMED | Location-level size demand | P1 |
| Space-aware allocation | RELEX | NOT CONFIRMED | Fixture/space constraints | P2 |
| Promotion-supply-space integration | RELEX | NOT CONFIRMED | Unified promotion execution plan | P2 |
| Vendor self-inspections | Inspectorio | NOT CONFIRMED | Risk-gated self-inspection | P2 |
| Dynamic quality risk | Inspectorio | NOT CONFIRMED | Explainable supplier/product risk | P1 |
| CAPA workflow | Inspectorio | NOT CONFIRMED | Root cause and effectiveness verification | P1 |
| Quality cost ledger | Inspectorio | NOT CONFIRMED | Cost of poor quality and recovery | P2 |
| Multi-enterprise control tower | Infor Nexus | NOT CONFIRMED | Order-shipment-finance exception graph | P1 |
| Predictive ETA | Infor Nexus | NOT CONFIRMED | Contractual vs predicted ETA | P2 |
| Supply-chain finance | Infor Nexus | NOT CONFIRMED | Partner-based financing eligibility | P3 |
| N-tier supplier mapping | Sourcemap | NOT CONFIRMED | BOM-linked supplier graph | P1/P2 |
| Chain of custody | Sourcemap/TrusTrace | NOT CONFIRMED | Batch/item transformation events | P2 |
| Digital Product Passport | TrusTrace | NOT CONFIRMED | Structured role-based DPP | P2 |
| Item-level product identity | TrusTrace | NOT CONFIRMED | Serial/batch identity and data carrier | P2 |
| Competitor assortment intelligence | EDITED | NOT CONFIRMED | External market observation layer | P2 |
| Competitive price architecture | EDITED | NOT CONFIRMED | Price index and markdown monitoring | P2 |
| New-product demand sensing | Stylumia | NOT CONFIRMED | Attribute/similarity-based forecast | P2 |
| Market whitespace detection | EDITED/Stylumia | NOT CONFIRMED | Evidence-based opportunity workflow | P2 |

---

## 161. New canonical entities introduced in version 2.7

```text
MerchandisePlan
MerchandisePlanVersion
PlanHierarchyNode
PlanMeasure
PlanCell
PlanAssumption
OpenToBuyLedger
ItemPlan
ItemPlanLine
OptionRole
DemandForecast
ForecastVersion
ForecastOverride
AllocationScenario
AllocationRecommendation
ReplenishmentScenario
ReplenishmentRecommendation
TransferScenario
TransferRecommendation
InventoryNode
NodeCapacity
PresentationRule
SpacePlan
Fixture
PlanogramVersion
PromotionPlan
PromotionFunding
QualityPlan
InspectionBooking
InspectionExecution
DefectOccurrence
CorrectivePreventiveAction
CAPAEffectivenessCheck
QualityRiskSnapshot
QualityCostEntry
SupplyChainParty
TradeTransaction
ControlTowerException
PredictedETA
FinanceEligibility
SupplierTierRelationship
SupplierSite
SupplyChainMapVersion
TraceabilityEvent
MaterialBatch
ProductItemIdentity
ProductClaim
ClaimEvidence
DigitalProductPassport
DataCarrier
MarketObservation
CompetitiveProductMatch
MarketSignal
WhitespaceOpportunity
PriceArchitectureSnapshot
```

### 161.1 Ownership rules

- MerchandisePlan owned by retailer planning organization;
- DemandForecast owned by forecast service but approved overrides owned by business actor;
- Allocation/Replenishment recommendation is not executable truth until approved;
- QualityPlan owned by brand/retailer quality policy;
- InspectionExecution owned by performing organization but shared according to contract;
- TraceabilityEvent owned by event issuer and verified separately;
- ProductClaim owned by responsible economic/commercial entity;
- MarketObservation owned by source/provider license context;
- external benchmark data never rewrites operational master data.

---

## 162. Additional state machines

### 162.1 Merchandise plan

```text
DRAFT
→ REVIEW
→ CHANGES_REQUESTED
→ APPROVED
→ LOCKED_BASELINE
→ ACTIVE
→ REFORECASTED
→ SUPERSEDED
→ ARCHIVED
```

### 162.2 Forecast

```text
CALCULATING
→ READY
→ REVIEWED
→ OVERRIDDEN_PARTIALLY
→ APPROVED_FOR_EXECUTION
→ EXPIRED
→ SUPERSEDED
```

### 162.3 Allocation scenario

```text
DRAFT
→ CALCULATING
→ READY_FOR_REVIEW
→ EXCEPTIONS_PENDING
→ APPROVED
→ ORDERS_CREATED
→ ERP_ACKNOWLEDGED
→ EXECUTED
→ RECONCILED
```

### 162.4 CAPA

```text
OPEN
→ CONTAINMENT_IN_PROGRESS
→ ROOT_CAUSE_PENDING
→ ACTION_PLAN_PENDING
→ ACTION_IN_PROGRESS
→ EVIDENCE_REVIEW
→ EFFECTIVENESS_MONITORING
→ CLOSED
→ REOPENED
```

### 162.5 DPP

```text
DATA_INCOMPLETE
→ READY_FOR_VALIDATION
→ VALIDATION_FAILED
→ APPROVED_FOR_PUBLICATION
→ PUBLISHED
→ UPDATED
→ SUSPENDED
→ SUPERSEDED
→ ARCHIVED
```

### 162.6 Market opportunity

```text
SIGNAL_DETECTED
→ ANALYST_REVIEW
→ VALIDATED
→ SCENARIO_CREATED
→ APPROVED_ACTION
→ EXECUTED
→ OUTCOME_MEASURED
→ CLOSED
```

---

## 163. API and event additions

### 163.1 Planning commands

```text
POST /api/v1/plans
POST /api/v1/plans/:id/versions
POST /api/v1/plans/:id/spread
POST /api/v1/plans/:id/submit
POST /api/v1/plans/:id/approve
POST /api/v1/otb/reservations
POST /api/v1/item-plans/:id/reconcile
```

### 163.2 Forecast and allocation commands

```text
POST /api/v1/forecasts/run
POST /api/v1/forecasts/:id/overrides
POST /api/v1/allocation-scenarios
POST /api/v1/allocation-scenarios/:id/calculate
POST /api/v1/allocation-scenarios/:id/approve
POST /api/v1/replenishment-scenarios/:id/calculate
POST /api/v1/transfer-scenarios/:id/calculate
POST /api/v1/execution-orders/export
```

### 163.3 Quality commands

```text
POST /api/v1/inspection-bookings
POST /api/v1/inspections/:id/start
POST /api/v1/inspections/:id/submit
POST /api/v1/inspections/:id/decision
POST /api/v1/capas
POST /api/v1/capas/:id/evidence
POST /api/v1/capas/:id/verify-effectiveness
```

### 163.4 Traceability commands

```text
POST /api/v1/supply-chain-maps/:id/discovery-requests
POST /api/v1/traceability/events
POST /api/v1/product-claims
POST /api/v1/product-claims/:id/verify
POST /api/v1/dpp/:productId/validate
POST /api/v1/dpp/:productId/publish
POST /api/v1/dpp/:productId/deltas
```

### 163.5 New events

- merchandise_plan_created;
- merchandise_plan_approved;
- otb_reserved;
- otb_released;
- item_plan_reconciled;
- forecast_completed;
- forecast_overridden;
- allocation_scenario_calculated;
- allocation_recommendation_overridden;
- replenishment_order_created;
- store_transfer_created;
- promotion_supply_risk_detected;
- inspection_booked;
- inspection_failed;
- capa_created;
- capa_effectiveness_verified;
- quality_risk_changed;
- control_tower_exception_created;
- predicted_eta_changed;
- supplier_tier_discovered;
- traceability_event_recorded;
- product_claim_verified;
- dpp_published;
- market_signal_detected;
- whitespace_opportunity_validated;
- competitive_price_gap_detected.

---

## 164. KPI and decision formulas added in version 2.7

### 164.1 Forecast bias

```text
Forecast Bias
= Σ(Forecast - Actual Demand) / Σ(Actual Demand)
```

### 164.2 Weighted forecast error

```text
WAPE
= Σ|Actual - Forecast| / ΣActual
```

### 164.3 Lost-sales-adjusted demand

```text
Adjusted Demand
= Observed Sales + Estimated Lost Sales during Stockout
```

### 164.4 Allocation service level

```text
Allocation Service Level
= Fulfilled Eligible Store Need / Total Eligible Store Need
```

### 164.5 Replenishment acceptance

```text
Recommendation Acceptance Rate
= Approved Recommended Units / Total Recommended Units
```

### 164.6 Transfer ROI

```text
Transfer ROI
= Incremental Gross Margin + Avoided Markdown - Transfer Cost
  divided by Transfer Cost
```

### 164.7 Promotion incremental margin

```text
Incremental Promotion Margin
= Incremental Net Sales
- Incremental COGS
- Discount Cost
- Media/Execution Cost
- Incremental Logistics Cost
+ Supplier Funding
```

### 164.8 First-pass quality

```text
First-pass Quality Rate
= Batches Passing First Final Inspection / Batches Inspected
```

### 164.9 CAPA effectiveness

```text
CAPA Effectiveness
= 1 - Recurrence Rate after Verified Action / Baseline Recurrence Rate
```

### 164.10 Traceability completeness

```text
Traceability Completeness
= Verified Required Nodes and Events / Total Required Nodes and Events
```

### 164.11 Evidence freshness

```text
Evidence Freshness %
= Non-expired Required Evidence / Total Required Evidence
```

### 164.12 Market whitespace value

```text
Whitespace Expected Value
= Addressable Demand
× Expected Conversion
× Expected Gross Margin per Unit
- Development and Inventory Risk
```

---

## 165. UAT scenarios added in version 2.7

1. Approved merchandise plan cannot be overwritten; reforecast creates a new version.
2. Item-level buy rolls up exactly to category OTB in two currencies.
3. Order amendment releases or consumes only the financial delta.
4. Stockout-adjusted forecast differs from raw sales forecast and exposes the correction.
5. First allocation preserves size presentation minimum for eligible stores.
6. Allocation optimizer respects warehouse handling capacity.
7. Replenishment produces zero quantity and explains each blocking constraint.
8. Transfer recommendation is rejected when remaining selling window is too short.
9. Store manager requests stock through mobile flow without bypassing central approval.
10. Promotion plan identifies inventory shortfall before campaign approval.
11. VisualBoard display requirement flows into space and allocation rules.
12. Vendor self-inspection is automatically suspended after a critical failure.
13. CAPA cannot close without effectiveness evidence.
14. Quality failure blocks shipment release but preserves commercial order history.
15. Supplier recovery reduces Cost of Poor Quality without rewriting original loss.
16. Predicted ETA changes while contractual delivery remains immutable.
17. One shipment split maps correctly to several order lines and invoices.
18. Duplicate external trade transaction is idempotently ignored.
19. Tier-1 supplier names tier-2 supplier and creates a controlled discovery request.
20. BOM component without verified source blocks required traceability completeness.
21. Product claim expires and public DPP stops presenting it as verified.
22. DPP consumer view hides confidential supplier pricing.
23. Item identity rejects duplicate serial association.
24. External market observation with low match confidence cannot trigger automatic price change.
25. Competitor price index uses comparable products only and shows sample size.
26. Trend signal based on one retailer is suppressed by minimum-cohort rule.
27. Planning grid supports 1 million cells without silent calculation drift.
28. Allocation result exported to ERP reconciles to the approved scenario.
29. Cross-tenant user cannot infer forecast, supplier risk or market data from another tenant.
30. Every planning, quality and traceability decision resolves to source version and audit event.

---

## 166. Revised implementation priorities after version 2.7 benchmark

### P0 — financial and commercial truth

- MerchandisePlan core;
- plan versions and approval;
- OTB ledger;
- item-plan rollup;
- order/OTB delta integration;
- certified inventory snapshots;
- immutable commercial and financial states.

### P1 — planning and execution advantage

- assortment item plan;
- SKU-location forecast;
- first allocation;
- replenishment;
- supplier/production quality plan;
- inspection and CAPA;
- control-tower exception model;
- supplier multi-tier relationship graph.

### P2 — enterprise differentiation

- store transfers;
- promotion-space-supply orchestration;
- predictive ETA;
- quality risk model;
- DPP publication;
- chain of custody;
- external market intelligence;
- whitespace and competitive pricing.

### P3 — ecosystem services

- supply-chain finance partner integration;
- advanced optimization digital twin;
- automated store-specific planograms;
- item serialization at scale;
- customs/regulatory evidence exchange;
- network-level supplier and market benchmarks.

### Mandatory build sequence

```text
Certified Master Data
→ Financial Plan and OTB
→ Assortment and Item Plan
→ Order and Inventory Truth
→ Forecast
→ Allocation / Replenishment
→ Quality / Supply Exceptions
→ Traceability / DPP
→ External Market Intelligence
```

---

## 167. Product decision: Syntha operating model after version 2.7

JOOR, NuORDER and related wholesale systems remain essential benchmarks for digital selling and buying. Toolio, Nextail and RELEX establish the planning and inventory-execution benchmark. Inspectorio establishes quality operations. Infor Nexus establishes multi-enterprise supply execution and finance. Sourcemap and TrusTrace establish multi-tier provenance and DPP readiness. EDITED and Stylumia establish external market and fashion-demand intelligence.

Syntha should connect these capabilities through one governed lifecycle:

```text
Market Signal
→ Financial Plan
→ Assortment / Line Plan
→ Product Development
→ Supplier / Cost / Capacity
→ Wholesale and Retail Buy
→ Production / Quality
→ Shipment / Receipt
→ Allocation / Replenishment
→ Sale / Return / Markdown
→ Margin / Cash / Supplier Outcome
→ Next Plan
```

The platform is stronger than JOOR only when the user can answer, from one traceable system:

- Why was this product developed?
- Why was this quantity bought?
- Which budget and scenario approved it?
- Which factory and materials produced it?
- What quality evidence released it?
- Where was each unit allocated?
- What sold, returned or was marked down?
- What was the actual landed cost and margin?
- Which decision should change next season?

---

## 168. Official sources added in version 2.7

### Toolio

- https://www.toolio.com/
- https://www.toolio.com/platform-overview
- https://www.toolio.com/allocation

### Nextail

- https://nextail.co/solution/allocation-and-replenishment
- https://help.nextail.co/en/introduction-to-replenishment
- https://help.nextail.co/en/solution-specifications

### RELEX

- https://www.relexsolutions.com/
- https://www.relexsolutions.com/resources/relex-unified-planning-end-to-end-ai-powered-retail-planning/
- https://www.relexsolutions.com/resources/planogram-optimization/

### Inspectorio

- https://www.inspectorio.com/platform
- https://www.inspectorio.com/platform/quality
- https://www.inspectorio.com/industry/brands-retailers/

### Infor Nexus

- https://www.infor.com/solutions/scm/infor-nexus
- https://www.infor.com/solutions/scm/infor-nexus/supply-chain-finance
- https://docs.infor.com/lncs/latest/en-us/lncslib/lncspov/fnv1635783332924.html

### Sourcemap

- https://www.sourcemap.com/
- https://www.sourcemap.com/solutions/map-and-trace-to-origin

### TrusTrace

- https://trustrace.com/solutions/digital-product-passport-dpp-compliance
- https://trustrace.com/downloads/digital-product-passport-data-protocol
- https://trustrace.com/knowledge-hub/whats-in-a-digital-product-passport-the-system-below-the-surface-explained

### EDITED

- https://edited.com/products/retail-intelligence-platform/
- https://edited.com/

### Stylumia

- https://www.stylumia.ai/

### Version 2.7 conclusion

Version 2.7 adds the missing bridge between wholesale ordering and real retail economics. Syntha is no longer specified merely as PLM + B2B commerce + production. It now includes the decision system that determines budget, option count, quantity, location, replenishment, quality release, provenance and market response.

---

## 169. True Fit — fit intelligence and size-decision benchmark

### 169.1 COMPETITOR CONFIRMED direction

Официальные материалы True Fit описывают отдельный intelligence layer для определения подходящего размера и характера посадки на основе:

- нормализованных product catalog data;
- size charts и product descriptions;
- сопоставления размеров разных брендов и моделей;
- shopper fit preferences;
- истории покупок и возвратов;
- индивидуальных особенностей тела и предпочтения более свободной или плотной посадки;
- universal guidance: модель маломерит, соответствует размеру или большемерит;
- personalized size recommendation для конкретного shopper и конкретного товара;
- Fit Needs;
- выявления size sampling / bracketing, когда покупатель заказывает несколько размеров с намерением вернуть часть.

True Fit публично позиционирует fit intelligence как решение задачи выбора размера, а не как статическую таблицу размеров. В доступном JOOR Retailer / LITE подобный consumer-fit intelligence, cross-brand size normalization и обратная связь возвратов в wholesale buy не наблюдались. Поэтому это не утверждение о полном отсутствии функции во всех продуктах JOOR, а `JOOR NOT CONFIRMED / SYNTHA TARGET`.

### 169.2 Почему это важно Syntha

Для fashion-платформы размер не должен быть только label `XS/S/M/L` или колонкой SKU. Он влияет одновременно на:

- выбор размера конечным покупателем;
- возвраты;
- size curve закупки;
- распределение по магазинам;
- product development;
- grading;
- fit sample approvals;
- рекомендации buyer;
- replenishment;
- риск неликвидных крайних размеров;
- качество конкретной партии;
- supplier scorecard.

Syntha должна связать четыре разных уровня:

```text
Human / Shopper Fit Profile
→ Product Technical Fit
→ Commercial Size Guidance
→ Buy, Allocation and Replenishment Size Curve
```

### 169.3 Canonical fit hierarchy

```text
Category Fit Standard
└── Brand Size Scale
    └── Product / Block Fit Profile
        └── Colorway / Material Fit Effect
            └── Batch / Supplier Variation
                └── Shopper Recommendation and Outcome
```

Нельзя хранить fit только на SKU. Один style может иметь:

- несколько size scales;
- разные рынки и локальные labels;
- разные blocks;
- material stretch differences;
- color-dependent shrinkage;
- supplier/batch deviations;
- revised measurement chart;
- различные customer expectations по fit.

### 169.4 Size and Fit Ontology

#### SizeScale

- `sizeScaleId`;
- brand;
- category;
- market/region;
- gender/audience;
- label sequence;
- numeric equivalents;
- alpha/numeric/waist/inseam/cup/shoe dimensions;
- locale labels;
- effective dates;
- version;
- predecessor/successor;
- measurement standard;
- units;
- active/archived state.

#### SizeValue

- canonical size key;
- display label;
- sort order;
- body measurement range;
- garment measurement range;
- equivalent sizes;
- market conversions;
- tolerance;
- recommended body profile;
- availability status.

#### ProductFitProfile

- style/colorway/version;
- category;
- base block;
- intended silhouette;
- intended ease;
- fitted/regular/relaxed/oversized;
- rise, length, sleeve, shoulder and bust behavior;
- material stretch and recovery;
- shrinkage expectation;
- lined/unlined effect;
- fit-critical measurement points;
- model measurements and worn size;
- technical fit approval;
- commercial fit guidance;
- confidence;
- source data version.

#### ShopperFitProfile

- customer/account-scoped identifier;
- consent state;
- height;
- weight optional;
- body measurements optional;
- known best-fitting brands/styles/sizes;
- fit preferences;
- category-specific preferences;
- mobility/accessibility needs where explicitly provided;
- purchase and return outcomes;
- confidence and freshness;
- deletion/retention policy.

PII и body data нельзя автоматически раскрывать брендам, sales representatives или другим retailer accounts. Analytics использует aggregated/anonymized fit signals.

### 169.5 Recommendation contract

FitRecommendation должна содержать не только `recommendedSize`, но и:

- shopper/profile context;
- product version;
- size scale version;
- recommended canonical size;
- displayed local size;
- confidence interval;
- fit direction: small / true / large;
- body-area cautions;
- preferred-fit adjustment;
- alternative size;
- unavailable-size fallback;
- recommendation reasons;
- model version;
- generatedAt;
- outcome feedback.

Пример объяснения:

```text
Рекомендуем IT 48 / EU M.
Причины:
- эта модель имеет более узкое плечо, чем выбранные вами ранее модели;
- материал имеет низкую растяжимость;
- предпочитаемая вами посадка — regular;
- размер IT 50 даст более свободную посадку, но увеличит длину рукава.
```

Нельзя показывать ложную точность, если данных мало. Допустимые состояния:

- `HIGH_CONFIDENCE`;
- `MEDIUM_CONFIDENCE`;
- `LOW_CONFIDENCE`;
- `INSUFFICIENT_DATA`;
- `SIZE_UNAVAILABLE`;
- `PRODUCT_DATA_CONFLICT`;
- `PROFILE_STALE`.

### 169.6 Fit analytics for buyers and product teams

Buyer view:

- fit-related return rate;
- size bracketing rate;
- conversion by size availability;
- lost demand due to missing sizes;
- size sell-through;
- size stock cover;
- recommended buy curve;
- current buy curve;
- return-adjusted demand curve;
- store cluster differences;
- cross-brand normalized size comparison.

Product/PLM view:

- measurement points associated with fit complaints;
- fit issue by block;
- fit issue by supplier;
- fit issue by material;
- fit issue by sample version;
- fit issue by batch;
- approved measurement versus returned-item actual measurement;
- repeat issue across carry-over styles;
- grading inconsistency;
- consumer language clustered into canonical defect/fit causes.

### 169.7 Core formulas

```text
Fit Return Rate
= Fit-related Returned Units / Delivered Units
```

```text
Size Bracketing Rate
= Orders containing multiple sizes of the same Style-Color
  / Orders containing that Style-Color
```

```text
Return-adjusted Demand(size)
= Sold Units(size)
- Fit Returns(size)
+ Estimated Lost Demand(size)
```

```text
Size Availability Loss
= Estimated Demand while Size OOS × Expected Contribution Margin
```

```text
Fit Confidence
= f(product data completeness,
    measurement consistency,
    shopper history,
    comparable-product outcomes,
    sample quality,
    batch stability,
    model freshness)
```

Формула confidence является model-governed; UI показывает факторы, но не обязан раскрывать proprietary weights.

### 169.8 What Syntha should not copy blindly

- не сводить fit к одному black-box размеру без explanation;
- не использовать body data без consent;
- не переносить DTC recommendation непосредственно в wholesale order curve без агрегирования;
- не считать возврат доказательством неправильного размера без return reason и quality context;
- не смешивать технические measurement deviations с субъективным preference;
- не использовать старую product version после изменения BOM/material/measurement chart.

---

## 170. Size Curve Intelligence — закупка, распределение и производство

### 170.1 Цель

Связать реальные consumer-fit outcomes с решением, сколько единиц каждого размера:

- разработать;
- заказать у фабрики;
- закупить retailer;
- распределить по doors;
- держать в резерве;
- пополнять;
- переводить между магазинами;
- выводить из ассортимента.

### 170.2 Curve layers

Syntha хранит не одну size curve, а набор версий:

1. `HistoricalSalesCurve`;
2. `ReturnAdjustedCurve`;
3. `LostDemandAdjustedCurve`;
4. `PlannedBuyCurve`;
5. `ApprovedBuyCurve`;
6. `FactoryOrderCurve`;
7. `ReceivedCurve`;
8. `AllocatedCurve`;
9. `SoldCurve`;
10. `EndingStockCurve`.

### 170.3 Curve dimensions

- season/drop;
- brand;
- category/subcategory;
- style/color;
- size scale;
- country/region;
- store/door/cluster;
- channel;
- customer segment;
- price band;
- fit profile;
- replenishable versus seasonal;
- launch/markdown phase.

### 170.4 Recommendation logic

```text
Base Size Demand
= Historical Demand
× Trend Factor
× Store Cluster Factor
× Product Fit Factor
× Price Factor
× Availability Correction
```

```text
Recommended Size Units
= Total Planned Units × Normalized Return-adjusted Size Share
```

Constraints:

- factory MOQ by size/color;
- pack ratio;
- size run requirement;
- presentation minimum;
- store capacity;
- e-commerce reserve;
- wholesale commitments;
- safety stock;
- sample/display units;
- regional size restrictions;
- budget and OTB;
- expected returns;
- supplier capacity.

### 170.5 Curve approval

```text
DRAFT
→ GENERATED
→ BUYER_REVIEW
→ MERCHANT_APPROVAL
→ SUPPLIER_FEASIBILITY_CHECK
→ APPROVED
→ ORDERED
→ REVISED_WITH_REASON
→ LOCKED_FOR_PRODUCTION
```

Каждый manual override хранит:

- prior curve;
- new curve;
- actor;
- reason code;
- comment;
- expected impact;
- approval;
- timestamp;
- resulting outcome.

### 170.6 Curve exception types

- oversize concentration;
- undersize concentration;
- missing key size;
- extreme-size overstock;
- size bracketing spike;
- fit return spike;
- supplier/batch deviation;
- e-commerce/store imbalance;
- pack ratio distortion;
- curve drift after markdown;
- cross-market label mismatch.

---

## 171. Consumer Fit → PLM closed loop

### 171.1 End-to-end process

```text
Purchase
→ Delivery
→ Wear / Fit Outcome
→ Return / Review / Support Signal
→ Canonical Fit Issue
→ Product / Block / Material Root Cause
→ Measurement or Pattern Change
→ New Sample Version
→ Fit Approval
→ Commercial Fit Guidance Update
→ Future Buy Curve Update
```

### 171.2 Canonical fit reasons

- too small overall;
- too large overall;
- narrow shoulders;
- broad shoulders;
- tight bust/chest;
- loose bust/chest;
- tight waist;
- loose waist;
- tight hip;
- loose hip;
- rise too low/high;
- inseam too short/long;
- sleeve too short/long;
- garment length too short/long;
- armhole restrictive;
- neckline issue;
- shoe length;
- shoe width;
- heel slippage;
- material too rigid;
- excessive stretch;
- shrinkage;
- inconsistent with size chart;
- inconsistent within same style;
- preference mismatch, not technical defect.

### 171.3 Root-cause separation

Syntha должна разделять:

- technical specification defect;
- production tolerance breach;
- material behavior;
- grading rule defect;
- inaccurate size chart;
- incorrect product content;
- customer preference;
- recommendation model error;
- fulfillment error: sent wrong size;
- counterfeit/mislabeled item;
- unknown.

Каждая категория ведёт к разному owner и corrective action.

### 171.4 Release impact

Изменение fit profile должно запускать impact assessment:

- affected open wholesale orders;
- open factory POs;
- unshipped production;
- published linesheets;
- PDP size guidance;
- digital sample;
- measurement chart;
- care/shrinkage claims;
- return policy;
- future size curve.

---

## 172. Competera — unified initial price, promotion and markdown benchmark

### 172.1 COMPETITOR CONFIRMED direction

Официальные материалы Competera описывают AI-driven retail pricing platform, которая объединяет:

- competitive data;
- product matching;
- price intelligence;
- demand elasticity;
- price optimization;
- initial, promotional и markdown pricing;
- what-if simulations;
- smart segmentation;
- dynamic assignment of products to markdown campaigns;
- KVI management;
- store-level optimization;
- scenario-based recommendations;
- omnichannel price management.

В наблюдаемом JOOR подтверждены wholesale price types, discounts и order-level commercial fields, но не был подтверждён отдельный retail price optimization engine, связывающий elasticity, competitor position, store-level demand, lifecycle и markdown execution. Статус: `JOOR NOT CONFIRMED / SYNTHA TARGET`.

### 172.2 Unified pricing spine

```text
Product Cost
→ Initial Retail Price
→ Channel / Market Price
→ Promotion
→ Markdown
→ Clearance / Outlet
→ Return / Resale Value
→ Realized Margin
```

Syntha должна хранить каждую цену как versioned decision, а не переписывать одно поле `price`.

### 172.3 Price architecture entities

#### PriceStrategy

- objective: margin/revenue/volume/stock/positioning;
- market;
- channel;
- store cluster;
- category;
- customer segment;
- competitor set;
- target price index;
- margin floor;
- MAP/RRP/MSRP constraints;
- psychological endings;
- price ladder;
- effective dates;
- approval policy.

#### PriceDecision

- product/SKU;
- current price;
- recommended price;
- approved price;
- currency;
- tax inclusion;
- effective interval;
- recommendation reason;
- demand elasticity;
- competitive position;
- forecast revenue/units/margin/ending stock;
- confidence;
- scenario;
- actor/model;
- override reason;
- downstream publication status.

#### PriceExecution

- channel/store;
- scheduledAt;
- sentAt;
- acknowledgedAt;
- appliedAt;
- failedAt;
- external system;
- price label task;
- POS/e-commerce verification;
- exception.

### 172.4 Initial price optimization

Inputs:

- planned landed cost;
- actual landed cost;
- target intake margin;
- market willingness-to-pay;
- competitive product matches;
- brand positioning;
- product role;
- historical analogs;
- launch timing;
- season length;
- expected markdown;
- return rate;
- duties/taxes;
- channel commission;
- price ladder rules.

```text
Expected Full-life Margin
= Full-price Margin
+ Promotion Margin
+ Markdown Margin
- Returns Cost
- Fulfillment Cost
- Unsold Stock Cost
```

Initial price must optimize full lifecycle, not only first-day markup.

### 172.5 Elasticity and cross-effects

Хранить:

- own-price elasticity;
- cross-price elasticity;
- halo/cannibalization;
- competitor elasticity;
- channel migration;
- size/color availability interaction;
- promotion fatigue;
- customer-segment sensitivity;
- confidence and data window.

```text
Elasticity
= % Change in Quantity / % Change in Price
```

Недостаток данных не должен автоматически создавать aggressive price changes. Нужны fallback hierarchy и human review.

### 172.6 Store-level and cluster-level optimization

Цена может различаться по:

- country;
- tax jurisdiction;
- store cluster;
- channel;
- customer group;
- currency;
- franchise/owned door;
- marketplace;
- local competition;
- inventory position;
- legal rules.

Но система обязана проверять:

- unfair/discriminatory pricing risks;
- contractual brand rules;
- advertised-price restrictions;
- price consistency policy;
- customer communication;
- label/POS readiness;
- return/refund treatment при изменении цены.

---

## 173. Promotion Optimization and Funding Ledger

### 173.1 Promotion is not markdown

| Тип | Назначение | Базовая цена | Ограничение |
|---|---|---|---|
| Promotion | временно стимулировать спрос | сохраняется | период/условия/audience |
| Markdown | изменить lifecycle price | заменяется | stock/margin target |
| Coupon | персональный/канальный incentive | сохраняется | eligibility/code |
| Trade promotion | B2B incentive | commercial terms | retailer/account/product |
| Rebate | постфактум | invoice/claim | performance condition |
| Loyalty benefit | customer value | сохраняется | membership/rules |

### 173.2 PromotionPlan

- objective;
- products;
- locations/channels;
- audience;
- start/end;
- mechanic;
- discount depth;
- bundle rules;
- vendor funding;
- marketing budget;
- expected cannibalization;
- expected uplift;
- inventory requirement;
- operational tasks;
- approval;
- post-event measurement.

### 173.3 Promotion funding

PromotionFundingLedger хранит:

- brand/supplier contribution;
- retailer contribution;
- co-op marketing;
- fixed allowance;
- per-unit allowance;
- rebate threshold;
- proof of performance;
- claim;
- approved amount;
- invoiced/credited amount;
- dispute;
- recovery status.

Это связывает marketing campaign, price execution, sales outcome и supplier receivable.

### 173.4 Incrementality

```text
Incremental Units
= Actual Units - Counterfactual Baseline Units
```

```text
Incremental Contribution
= Incremental Revenue
- Incremental COGS
- Incremental Fulfillment
- Promotion Funding Net Cost
- Cannibalization Loss
```

Post-event report должен показывать не только sales uplift, но и:

- stock pulled forward;
- cannibalization;
- customer acquisition;
- repeat effect;
- returns;
- margin;
- supplier funding recovered;
- residual inventory;
- forecast error.

---

## 174. Markdown Optimization — lifecycle and scenario engine

### 174.1 Lifecycle

```text
ELIGIBLE
→ SCENARIO_GENERATED
→ MERCHANT_REVIEW
→ APPROVED
→ SCHEDULED
→ EXECUTED
→ MONITORED
→ NEXT_MARKDOWN / HOLD / EXIT
→ CLOSED
```

### 174.2 Inputs

- current stock by SKU/location;
- inbound stock;
- sell-through;
- weeks of supply;
- remaining season days;
- demand forecast;
- elasticity;
- margin floor;
- competitor position;
- product role;
- size/color fragmentation;
- return rate;
- transfer opportunity;
- outlet/resale/recommerce value;
- storage and liquidation costs;
- brand/legal price restrictions.

### 174.3 Scenario comparison

Для каждой альтернативы:

- no markdown;
- earlier shallow markdown;
- later deep markdown;
- segmented markdown;
- store transfer before markdown;
- e-commerce only;
- outlet transfer;
- bundle/promotion;
- wholesale clearance;
- return to vendor;
- donation/recycling.

Показывать:

- probability of stock target;
- expected units;
- revenue;
- gross margin;
- remaining stock;
- cash recovery;
- brand-price perception risk;
- operational cost;
- confidence.

### 174.4 Guardrails

- minimum price;
- minimum margin;
- MAP/RRP restrictions;
- price step limit;
- maximum frequency;
- customer notification;
- active promotion conflict;
- return/refund policy;
- franchise agreement;
- country-specific regulation;
- excluded strategic products;
- manual approval threshold.

### 174.5 Markdown attribution

Каждое sold unit должно ссылаться на effective price decision, чтобы анализировать:

- full-price versus marked-down units;
- markdown depth;
- timing;
- gross margin realized;
- whether transfer/replenishment would have been better;
- size fragmentation at markdown;
- recommendation outcome.

---

## 175. Worldly — facility environmental and social performance benchmark

### 175.1 COMPETITOR CONFIRMED direction

Официальные материалы Worldly описывают supply-chain sustainability data platform, включающую:

- standardized facility environmental assessment;
- standardized social and labor assessment;
- Higg FEM;
- Higg FSLM;
- product impact tools;
- supplier/manufacturer data sharing;
- environmental и social benchmarking;
- certificates and verified assessment artifacts;
- performance insights and improvement actions;
- collection of Scope 1–3 related supply-chain data;
- coverage of working hours, wages, health and safety, worker rights, carbon, water and other impact dimensions.

В наблюдаемом JOOR не был подтверждён facility-level ESG operating layer с standardized assessments, verification, corrective actions и product-level impact evidence. Статус: `JOOR NOT CONFIRMED / SYNTHA TARGET`.

### 175.2 Sustainability data architecture

```text
Supplier Organization
→ Facility / Site
→ Assessment Cycle
→ Self Assessment
→ Verification
→ Findings
→ Corrective Actions
→ Improvement Evidence
→ Product / Order / Batch Attribution
→ Disclosure / DPP Claim
```

### 175.3 Facility master

- legal supplier;
- facility/site identity;
- address/geolocation;
- site type;
- tier;
- processes;
- workforce;
- operating licenses;
- certifications;
- audit/assessment programs;
- production capacity;
- energy sources;
- water sources;
- wastewater systems;
- chemical processes;
- subcontractors;
- brand relationships;
- data-sharing permissions;
- active/inactive/blocked state.

### 175.4 Assessment model

AssessmentCycle:

- framework;
- module;
- reporting period;
- self-assessment status;
- verification status;
- verification body;
- completion date;
- expiry date;
- score/result;
- section results;
- source artifact;
- certificate;
- evidence files;
- data quality flags;
- sharing permissions.

State machine:

```text
NOT_REQUESTED
→ REQUESTED
→ IN_PROGRESS
→ SUBMITTED
→ VERIFICATION_REQUIRED
→ VERIFIED / NOT_VERIFIED
→ FINDINGS_OPEN
→ IMPROVEMENT_PLAN
→ CLOSED
→ EXPIRED
```

### 175.5 Environmental dimensions

- energy;
- greenhouse-gas emissions;
- water use;
- wastewater;
- air emissions;
- waste;
- chemicals;
- materials/process impacts;
- renewable-energy share;
- production output denominator;
- intensity versus absolute impact;
- data source and assurance level.

### 175.6 Social and labor dimensions

- working hours;
- wages and benefits;
- health and safety;
- worker rights;
- forced-labor indicators;
- child-labor controls;
- freedom of association;
- grievance mechanisms;
- worker voice;
- dormitories where relevant;
- subcontracting controls;
- recruitment fees;
- corrective action.

Syntha не должна превращать social compliance в одно итоговое число, скрывающее critical violations.

### 175.7 Critical finding policy

Critical findings должны:

- блокировать new allocation при определённых severity;
- создать escalation;
- назначить owner;
- задать remediation deadline;
- требовать evidence;
- влиять на supplier risk;
- быть видимыми в sourcing decision;
- иметь exception approval;
- сохраняться после истечения assessment;
- не исчезать при новом self-assessment без closure evidence.

---

## 176. Sustainability Evidence and Claim Governance

### 176.1 Problem

Маркетинговое утверждение `sustainable`, `recycled`, `low impact` или `responsibly sourced` не должно существовать без доказательной цепочки.

### 176.2 Claim model

SustainabilityClaim:

- claim type;
- exact wording;
- product/style/SKU/batch scope;
- market/channel/locale;
- percentage/value;
- methodology;
- calculation period;
- evidence links;
- facility/material/source links;
- verifier;
- validity dates;
- legal approval;
- status;
- publication targets;
- replacement/revocation history.

### 176.3 Evidence levels

1. supplier-declared;
2. document-supported;
3. platform-validated;
4. third-party verified;
5. transaction-traced;
6. item/batch-specific verified.

UI обязан показывать level, а не одинаковый green badge.

### 176.4 Claim lifecycle

```text
DRAFT
→ EVIDENCE_PENDING
→ DATA_VALIDATION
→ LEGAL_REVIEW
→ APPROVED
→ PUBLISHED
→ EXPIRED / REVOKED / CHALLENGED
```

### 176.5 Publication gate

Claim не публикуется, если:

- evidence expired;
- scope не соответствует продукту/партии;
- percentage не подтверждён BOM/mass balance;
- facility не относится к production path;
- assessment unverified при обязательной verification;
- locale wording юридически не согласовано;
- source document revoked;
- supplier relationship inferred, но не verified.

### 176.6 Impact allocation

Нужно хранить метод распределения facility impact на product/order/batch:

- mass;
- production units;
- machine hours;
- energy meter;
- process-specific allocation;
- supplier-provided factor;
- modeled estimate.

Modeled estimate нельзя выдавать как measured fact.

---

## 177. Supplier Improvement Portfolio

### 177.1 Improvement action

- source assessment/finding;
- impact dimension;
- baseline;
- target;
- action;
- facility owner;
- brand owner;
- due date;
- expected cost;
- funding party;
- evidence;
- verification;
- outcome;
- closure/reopen.

### 177.2 Portfolio view

- high-risk facilities;
- overdue actions;
- investment required;
- expected carbon/water/waste/social benefit;
- affected spend/orders/products;
- production dependency;
- alternative sourcing availability;
- supplier engagement rate;
- verified improvements;
- repeated findings.

### 177.3 Sourcing decision integration

RFQ and allocation screen должен показывать:

- commercial quote;
- capacity;
- quality score;
- delivery score;
- environmental status;
- social status;
- critical findings;
- remediation progress;
- traceability completeness;
- claim eligibility;
- risk-adjusted total cost.

Не допускается автоматическое исключение только по слабому self-assessment без review; одновременно critical verified violations не могут скрываться за низкой ценой.

---

## 178. EON — serialized Digital ID and connected-product benchmark

### 178.1 COMPETITOR CONFIRMED direction

Официальные материалы EON описывают:

- уникальную serialized digital identity для физического изделия;
- Digital ID, связанный через QR, NFC или RFID;
- lifecycle tracking от производства до продажи, использования, resale и recycling;
- customer engagement через connected product;
- product transparency;
- care, repair, resale и recycling services;
- Digital Product Passport support;
- partner network для circular services;
- product/material-level common data protocol.

Версия 2.7 уже описывает DPP и traceability. Версия 2.8 добавляет недостающий item-level operational layer после продажи. В наблюдаемом JOOR item serialization и post-sale circular-services orchestration не подтверждены.

### 178.2 Product identity levels

```text
Style
→ Colorway
→ SKU
→ Production Batch
→ Serialized Item
→ Ownership / Custody Events
→ Service / Resale / Recycling Events
```

SKU identity недостаточна для:

- authenticity;
- warranty;
- конкретного материала/батча;
- repair history;
- resale listing;
- recall;
- item-level carbon/traceability;
- ownership transfer;
- loss/theft status.

### 178.3 SerializedItem

- `itemId`;
- brand;
- GTIN/SKU;
- serial;
- batch;
- factory;
- production order;
- material lots;
- quality release;
- tag identifiers;
- QR/NFC/RFID references;
- cryptographic/signature metadata optional;
- current lifecycle state;
- current custody, not necessarily legal ownership;
- DPP record;
- warranty;
- care/repair eligibility;
- resale/recycle eligibility;
- recall state;
- created/activated/deactivated timestamps.

### 178.4 Activation and binding

```text
SERIAL_RESERVED
→ TAG_ENCODED
→ ATTACHED
→ VERIFIED_AT_FACTORY
→ PACKED
→ SHIPPED
→ RECEIVED
→ SOLD
→ CUSTOMER_ACTIVATED
→ IN_USE
→ REPAIRED / RESOLD / RECYCLED / LOST / DESTROYED
```

Checks:

- duplicate serial;
- wrong SKU/tag;
- unbound tag;
- cloned identifier;
- item sold before receipt;
- unauthorized ownership transfer;
- recalled item;
- invalid service provider;
- privacy consent.

### 178.5 Connected product experience

Customer-facing page может включать:

- authenticity result;
- product story;
- origin/materials;
- care;
- warranty registration;
- repair booking;
- spare parts;
- styling/content;
- resale eligibility;
- resale listing creation;
- recycling/drop-off;
- recall notice;
- ownership transfer;
- item history with privacy-safe visibility.

### 178.6 Business intelligence

Item-level events дают:

- activation rate;
- scan geography;
- care engagement;
- repair incidence;
- failure modes;
- resale time-to-list;
- resale price;
- number of owners;
- useful life;
- recall response;
- circular-service conversion.

Но scans не равны ownership или usage без подтверждённого event semantics.

---

## 179. Circular Commerce and Item Service Orchestration

### 179.1 CircularServiceOrder

Общий aggregate для:

- repair;
- alteration;
- cleaning;
- refurbishment;
- authentication;
- take-back;
- resale;
- donation;
- recycling.

Fields:

- item;
- customer/account;
- service type;
- provider;
- eligibility;
- quote;
- customer approval;
- inbound shipment/drop-off;
- inspection;
- disposition;
- work performed;
- replacement parts/materials;
- cost;
- subsidy/warranty coverage;
- outbound shipment;
- completion evidence;
- lifecycle event.

### 179.2 Repair lifecycle

```text
REQUESTED
→ ELIGIBILITY_CHECK
→ QUOTED
→ CUSTOMER_APPROVED
→ ITEM_RECEIVED
→ INSPECTED
→ WORK_AUTHORIZED
→ IN_REPAIR
→ QUALITY_CHECK
→ RETURNED
→ CLOSED / WARRANTY_CLAIM
```

### 179.3 Resale readiness

- authenticity;
- ownership/custody right;
- condition grade;
- original product data;
- images;
- repair history;
- prohibited/recalled status;
- suggested resale price;
- channel eligibility;
- commission;
- seller payout;
- tax treatment;
- DPP transfer.

### 179.4 Circular value ledger

```text
Lifetime Product Value
= Initial Sale Margin
+ Service Revenue
+ Resale Commission
+ Parts Revenue
- Warranty Cost
- Repair Subsidy
- Take-back Cost
- Recycling Cost
```

Financial view не должен стимулировать скрывать defects или необоснованно отказывать в warranty.

---

## 180. Loop Returns — retention-oriented returns and exchange benchmark

### 180.1 COMPETITOR CONFIRMED direction

Официальные материалы Loop описывают:

- self-service returns portal;
- advanced policy rules по регионам, warehouses и products;
- exchanges и store credit вместо refund;
- Shop Now / catalog exchange;
- incentives и upsell;
- instant exchanges с authorization hold;
- AI product/variant recommendations в exchange flow;
- out-of-stock exchange automation;
- tracking, claims, fraud prevention и integrations;
- retained-revenue analytics.

JOOR-аудит подтвердил wholesale orders, cancellations и документы, но не consumer returns/exchange operating system с retention optimization. Статус: `JOOR NOT CONFIRMED / SYNTHA TARGET`.

### 180.2 Return authorization model

ReturnRequest:

- original order/shipment;
- item/SKU/serial;
- customer/account;
- request date;
- delivery date;
- return reason;
- condition declaration;
- photos/evidence;
- policy version;
- eligibility result;
- allowed outcomes;
- fees;
- refund method;
- return method;
- risk score;
- approval state;
- receiving destination;
- final disposition.

### 180.3 Policy engine

Rules by:

- country;
- channel;
- store;
- customer tier;
- product/category;
- sale/markdown state;
- final-sale flag;
- reason;
- days from delivery;
- item condition;
- serial/identity;
- gift order;
- marketplace;
- payment method;
- warranty;
- hazardous/sanitary restrictions;
- return history/risk;
- promotion.

Policy result должен быть versioned и explainable.

### 180.4 Outcome hierarchy

1. same-SKU variant exchange;
2. alternative product exchange;
3. repair/alteration;
4. store credit;
5. refund;
6. partial refund;
7. warranty replacement;
8. reject with reason;
9. keep-item refund where economics justify;
10. return-to-vendor/claim.

Customer нельзя манипулятивно лишать законного refund; optimization действует только внутри разрешённых outcomes.

### 180.5 Instant exchange

```text
Exchange Requested
→ Replacement Reserved
→ Payment Hold Authorized
→ Replacement Released
→ Original Item In Transit
→ Hold Released
```

Exception branches:

- original not returned;
- item condition mismatch;
- wrong item;
- replacement out of stock;
- authorization failure;
- partial return;
- lost return shipment;
- cross-border tax/duty issue.

### 180.6 Exchange recommendation

Inputs:

- original reason;
- size/fit intelligence;
- available inventory;
- price difference;
- customer history;
- product similarity;
- margin;
- return likelihood;
- delivery promise;
- store credit incentive.

Recommendation must not suggest another size when return reason is quality, style preference or fulfillment error.

### 180.7 Return economics

```text
Net Return Cost
= Refund
+ Reverse Logistics
+ Inspection
+ Processing
+ Refurbishment
+ Lost Value
+ Customer Service
- Recovery Value
- Supplier Recovery
- Retained Revenue
```

```text
Revenue Retention Rate
= Exchange + Store Credit + Repair Value
  / Eligible Return Value
```

---

## 181. Happy Returns — physical reverse-logistics network benchmark

### 181.1 COMPETITOR CONFIRMED direction

Официальные материалы Happy Returns описывают:

- box-free and label-free drop-off;
- Return Bar network;
- QR-based handoff;
- item verification;
- instant refund initiation;
- risk-based delayed refund;
- AI-assisted Return Vision audit;
- consolidation of returns;
- regional return hubs;
- bulk shipments with advanced notice;
- digital manifests;
- return-to-store / BORIS;
- eligibility APIs and webhooks.

Syntha не должна строить физическую сеть с первого дня, но data model и partner integration должны поддерживать такую модель.

### 181.2 Return method abstraction

- mail label;
- carrier pickup;
- parcel locker;
- return to original store;
- return to any brand store;
- third-party drop-off network;
- box-free consolidated return;
- keep item;
- supplier direct return;
- cross-border hub.

### 181.3 Drop-off event

- QR/token;
- location;
- operator;
- item scan;
- serial/SKU verification;
- condition quick check;
- package-free eligibility;
- risk result;
- refund release decision;
- bag/container ID;
- timestamp;
- customer receipt.

### 181.4 Consolidation hierarchy

```text
Return Item
→ Return Bag
→ Consolidation Container
→ Hub Inbound Shipment
→ Hub Sort
→ Retailer Pallet / Bulk Shipment
→ Retailer ASN
→ Warehouse Receipt
```

### 181.5 Return fraud and loss controls

- wrong item;
- empty package;
- tag switched;
- serial mismatch;
- counterfeit;
- used/damaged beyond policy;
- duplicate return;
- refund already issued;
- lost after drop-off;
- employee collusion;
- high-risk customer/account;
- catalog image mismatch.

Risk score не заменяет evidence review при high-value items.

### 181.6 Reverse-logistics SLA

- request to drop-off;
- drop-off to hub;
- hub processing;
- hub to retailer;
- receipt to disposition;
- disposition to restock;
- refund initiation;
- refund completion.

Показывать ownership каждого delay segment.

---

## 182. Return Disposition, Recovery and Inventory Re-entry

### 182.1 Inspection outcome

- new/sealed;
- new without packaging;
- sellable as new;
- sellable after steam/repack;
- minor repair;
- refurbishable;
- outlet/B-grade;
- resale;
- return to vendor;
- donate;
- recycle;
- destroy;
- quarantine;
- fraud evidence.

### 182.2 ConditionGrade

- standardized grade;
- category rules;
- observed defects;
- photos;
- inspector;
- automated signal;
- final reviewer;
- recovery channel;
- expected value;
- actual recovery.

### 182.3 Re-entry controls

Перед возвратом в available inventory:

- item identity verified;
- quality status passed;
- hygiene/safety passed;
- packaging complete;
- correct SKU/location;
- price/status determined;
- DPP/item history updated;
- warranty/recall checked;
- inventory ledger event posted.

### 182.4 Supplier recovery

Return/quality defect может создавать:

- supplier claim;
- debit note;
- replacement request;
- chargeback;
- warranty recovery;
- freight recovery;
- CAPA;
- supplier score impact.

Customer return reason alone не должен автоматически списывать сумму с supplier без validation.

---

## 183. Hokodo and TreviPay — embedded trade credit and B2B payments benchmark

### 183.1 COMPETITOR CONFIRMED direction

Официальные материалы Hokodo описывают B2B BNPL/trade-account infrastructure с:

- digital registration;
- rapid credit and fraud checks;
- tailored credit limits;
- deferred payment plans;
- seller paid upfront;
- risk protection;
- statement of account;
- payment processing;
- consolidated buyer invoices.

Официальные материалы TreviPay описывают end-to-end B2B payments and invoicing network с:

- automated buyer onboarding;
- prequalification and underwriting;
- KYC/KYB/AML/sanctions screening;
- omnichannel purchasing;
- contract-price verification;
- compliant multi-currency invoicing;
- parent/child hierarchies;
- guaranteed seller settlement;
- self-service buyer/seller portals;
- collections;
- cash application;
- disputes;
- flexible funding.

Версия 2.6 уже добавила AR self-service и wholesale application. Версия 2.8 расширяет их до полноценного credit-decision, funding и settlement layer. В JOOR Pay и payment tabs такой полный контур в доступном аккаунте не подтверждён.

### 183.2 Credit account hierarchy

```text
Legal Customer Group
├── Parent Company
│   ├── Legal Entity
│   │   ├── Buying Account
│   │   └── Locations / Doors
│   └── Central Billing Account
└── Guarantor / Insurer / Finance Provider
```

Credit может задаваться:

- group level;
- legal entity;
- account;
- currency;
- seller/brand;
- market;
- seasonal program;
- insured/uninsured portion.

### 183.3 Credit application

- applicant legal identity;
- registration/tax IDs;
- addresses;
- directors/beneficial owners where required;
- requested limit;
- requested terms;
- expected spend;
- currencies;
- financial statements;
- bank/trade references;
- consent;
- KYC/KYB/AML results;
- fraud signals;
- bureau/provider data;
- manual review;
- decision and reasons.

### 183.4 Credit decision states

```text
DRAFT
→ SUBMITTED
→ IDENTITY_CHECK
→ FRAUD_CHECK
→ CREDIT_SCORING
→ AUTO_APPROVED
  / MANUAL_REVIEW
  / MORE_INFO_REQUIRED
  / DECLINED
→ LIMIT_ASSIGNED
→ ACTIVE
→ SUSPENDED / REDUCED / INCREASED / EXPIRED
```

Decision хранит:

- model/provider;
- data timestamp;
- score;
- approved limit;
- terms;
- insured/funded amount;
- decision reasons;
- adverse-action explanation where legally required;
- reviewer;
- expiry/review date.

### 183.5 Available credit

```text
Available Credit
= Approved Limit
- Posted Receivables
- Authorized Uninvoiced Orders
- Pending Orders Reserved
- Disputed Exposure Included by Policy
+ Eligible Unapplied Credits
```

Все components должны быть drill-down. Нельзя показывать buyer только итог без reserved/pending details.

### 183.6 Order credit authorization

```text
Order Submitted
→ Commercial Validation
→ Credit Availability Check
→ Credit Reservation
→ Seller Approval
→ Shipment Authorization
→ Invoice Posting
→ Reservation Converted to Receivable
```

Exceptions:

- partial approval;
- split payment;
- deposit plus net terms;
- lower limit;
- overdue account;
- FX movement;
- multiple orders racing for limit;
- order amendment;
- cancellation release;
- shipment below order;
- disputed invoice.

Credit reservation requires optimistic locking/idempotency.

---

## 184. B2B Funding, Settlement and Risk Transfer

### 184.1 Funding models

- seller self-funded;
- platform-funded;
- bank-funded;
- credit-insured;
- factoring;
- non-recourse funding;
- recourse funding;
- hybrid limit;
- per-invoice auction/provider selection.

### 184.2 FundingDecision

- receivable/invoice;
- eligible amount;
- advance rate;
- fee;
- reserve;
- settlement date;
- recourse;
- risk owner;
- provider;
- currency;
- FX terms;
- acceptance;
- payout;
- repayment;
- exception.

### 184.3 Seller settlement

```text
Invoice Issued
→ Funding Eligibility
→ Settlement Scheduled
→ Seller Paid
→ Buyer Pays
→ Cash Applied
→ Provider Reconciled
```

Seller settlement status нельзя смешивать с buyer payment status. Seller может быть уже оплачен provider, пока buyer receivable остаётся open.

### 184.4 Economics

```text
Net Seller Proceeds
= Invoice Amount
- Funding Fee
- Service Fee
- Reserve
- Dispute Hold
- FX Cost
```

```text
Credit Program Contribution
= Incremental Gross Margin
- Credit Loss
- Funding Cost
- Insurance Cost
- Collections Cost
- Fraud Loss
- Operations Cost
```

### 184.5 Risk ownership

UI должен явно показывать, кто несёт риск:

- seller;
- platform;
- finance provider;
- insurer;
- buyer guarantor;
- shared first-loss arrangement.

---

## 185. Invoice, Statement, Collections and Cash Application

### 185.1 Invoice requirements

- seller/legal entity;
- buyer/legal entity;
- order/shipment references;
- line items;
- tax;
- currency;
- due date;
- payment terms;
- legal e-invoice format;
- buyer-required fields;
- PO/department/cost center;
- parent/child billing;
- delivery and acceptance evidence;
- version/correction;
- dispute state.

### 185.2 Consolidated invoicing

Support:

- invoice per shipment;
- invoice per order;
- weekly/monthly consolidated invoice;
- parent-level statement;
- location-level detail;
- multi-brand program invoice where legally valid;
- credit/debit notes;
- split tax entities.

### 185.3 Collections workflow

```text
NOT_DUE
→ DUE_SOON
→ DUE
→ OVERDUE
→ PROMISE_TO_PAY
→ PARTIALLY_PAID
→ DISPUTED
→ ESCALATED
→ COLLECTION_AGENCY / LEGAL
→ PAID / WRITTEN_OFF
```

Actions:

- reminder;
- statement;
- contact task;
- payment link;
- payment plan;
- promise to pay;
- dispute;
- credit hold;
- limit reduction;
- escalation;
- write-off approval.

### 185.4 Cash application

Payment matching hierarchy:

1. explicit remittance/invoice reference;
2. virtual account/payment link;
3. amount/date/customer match;
4. statement-level allocation;
5. manual exception.

Need support:

- partial payment;
- one payment to many invoices;
- many payments to one invoice;
- deductions;
- bank fees;
- FX differences;
- unapplied cash;
- overpayment;
- refund;
- chargeback/reversal.

### 185.5 Dispute lifecycle

```text
OPENED
→ CLASSIFIED
→ EVIDENCE_REQUESTED
→ OWNER_ASSIGNED
→ UNDER_REVIEW
→ ACCEPTED / REJECTED / PARTIAL
→ CREDIT_NOTE / PAYMENT_DUE
→ CLOSED
```

Dispute reason links to order, shipment, quality, return, pricing or tax evidence.

---

## 186. Cross-domain architecture added in version 2.8

### 186.1 New bounded contexts

1. Fit Intelligence.
2. Size Curve Planning.
3. Pricing and Markdown Optimization.
4. Promotion Funding.
5. Sustainability Assessments.
6. Claim Governance.
7. Serialized Item Identity.
8. Circular Services.
9. Returns and Reverse Logistics.
10. Trade Credit and Funding.
11. Collections and Cash Application.

### 186.2 Separation rules

- Fit recommendation is not product measurement master.
- Size curve is not SKU inventory.
- Recommended price is not effective price.
- Promotion is not markdown.
- Sustainability score is not evidence.
- Product passport is not serialized ownership record.
- Return authorization is not warehouse receipt.
- Refund is not item disposition.
- Credit reservation is not receivable.
- Seller settlement is not buyer payment.
- Dispute is not automatic credit note.

### 186.3 Cross-domain correlation IDs

Every flow should carry:

- `correlationId`;
- `causationId`;
- source object/version;
- tenant/account;
- actor/model;
- business effective time;
- system recorded time;
- visibility scope.

---

## 187. Expanded competitor gap matrix — version 2.8

| Capability | Best reference | JOOR evidence status | Syntha decision |
|---|---|---|---|
| Cross-brand size normalization | True Fit | NOT CONFIRMED | Build fit ontology and recommendation layer |
| Personalized fit guidance | True Fit | NOT CONFIRMED | Consumer/retailer integration with consent |
| Return-adjusted buy curve | True Fit + Syntha | NOT CONFIRMED | Connect DTC outcomes to wholesale planning |
| Initial price optimization | Competera | NOT CONFIRMED | Versioned scenario and approval engine |
| Store-level pricing | Competera | NOT CONFIRMED | Support governed cluster/store pricing |
| Promotion optimization | Competera / RELEX | NOT CONFIRMED | Add incrementality and funding ledger |
| Markdown optimization | Competera | NOT CONFIRMED | SKU-location lifecycle scenarios |
| Facility environmental assessments | Worldly | NOT CONFIRMED | Facility assessment and evidence model |
| Social/labor assessments | Worldly | NOT CONFIRMED | Findings/CAPA integrated with sourcing |
| Sustainability claim governance | Worldly + DPP tools | NOT CONFIRMED | Evidence-level and legal publication gate |
| Serialized Digital ID | EON | NOT CONFIRMED | Item-level identity and lifecycle events |
| Repair/resale/recycling services | EON | NOT CONFIRMED | Circular service order orchestration |
| Retention-oriented exchanges | Loop | NOT CONFIRMED | Exchange/store-credit/repair outcomes |
| Consolidated box-free returns | Happy Returns | NOT CONFIRMED | Partner-ready reverse-logistics abstraction |
| Item-level return verification | Happy Returns / EON | NOT CONFIRMED | Serial/tag/condition/fraud checks |
| Instant trade-credit decision | Hokodo / TreviPay | NOT CONFIRMED | Credit application and decision engine |
| Guaranteed seller settlement | TreviPay / Hokodo | NOT CONFIRMED | Separate funding and payment states |
| Global invoicing and AR automation | TreviPay | PARTIALLY TARGETED | Extend invoice, statement, collections and cash app |

### 187.1 Competitive position

Syntha should combine capabilities competitors usually separate:

```text
Fit Outcome
→ Product Change
→ Buy Curve
→ Price and Markdown
→ Sale
→ Return / Exchange
→ Item Repair / Resale
→ Sustainability and Financial Outcome
```

The defensible advantage is the continuity of evidence and decisions, not the number of isolated modules.

---

## 188. New canonical entities — version 2.8

### Fit and sizes

- SizeScale;
- SizeValue;
- SizeEquivalence;
- ProductFitProfile;
- ShopperFitProfile;
- FitRecommendation;
- FitOutcome;
- FitIssue;
- SizeCurveVersion;
- SizeCurveOverride;
- SizeDemandSignal.

### Pricing

- PriceStrategy;
- PriceDecision;
- PriceScenario;
- PriceExecution;
- ElasticityEstimate;
- CompetitivePriceObservation;
- ProductMatch;
- PromotionPlan;
- PromotionFundingLedger;
- MarkdownCampaign;
- MarkdownRecommendation.

### Sustainability

- FacilityAssessmentCycle;
- AssessmentResult;
- VerificationRecord;
- SustainabilityFinding;
- SupplierImprovementAction;
- SustainabilityClaim;
- ClaimEvidence;
- ImpactAllocation;
- DisclosurePackage.

### Connected items and circularity

- SerializedItem;
- DigitalIdentifier;
- ItemCustodyEvent;
- ItemOwnershipClaim;
- ItemActivation;
- CircularServiceOrder;
- RepairJob;
- ConditionGrade;
- ResaleListing;
- TakeBackRecord;
- RecyclingOutcome.

### Returns

- ReturnPolicyVersion;
- ReturnRequest;
- ReturnAuthorization;
- ReturnMethod;
- DropOffEvent;
- ReturnContainer;
- ReturnShipment;
- ReturnInspection;
- ReturnDisposition;
- RefundInstruction;
- ExchangeOrder;
- SupplierRecoveryClaim.

### Credit and finance

- CreditApplication;
- CreditDecision;
- CreditLimit;
- CreditReservation;
- TradeAccount;
- FundingDecision;
- SellerSettlement;
- Receivable;
- Statement;
- CollectionCase;
- PromiseToPay;
- CashReceipt;
- CashApplication;
- FinancialDispute.

---

## 189. New routes and workspaces — version 2.8

```text
/fit/products/:styleId
/fit/size-scales
/fit/recommendations
/fit/analytics
/planning/size-curves
/planning/size-curves/:id
/pricing/strategies
/pricing/decisions
/pricing/scenarios
/pricing/promotions
/pricing/markdowns
/suppliers/facilities/:facilityId/assessments
/sustainability/findings
/sustainability/improvements
/sustainability/claims
/items/serialized
/items/:itemId/passport
/items/:itemId/lifecycle
/circular-services
/returns/requests
/returns/operations
/returns/consolidation
/returns/disposition
/finance/credit-applications
/finance/credit-accounts
/finance/credit-reservations
/finance/funding
/finance/settlements
/finance/collections
/finance/cash-application
/finance/disputes
```

### 189.1 Workspace requirements

Every workspace must include:

- role and account scope;
- saved views;
- filters in URL;
- mass actions with preview;
- explanation of disabled actions;
- version and effective date;
- source data freshness;
- approval state;
- exception queue;
- audit timeline;
- export with filter snapshot;
- data quality warnings.

---

## 190. New event taxonomy — version 2.8

### Fit

- `size_scale_version_published`;
- `product_fit_profile_approved`;
- `fit_recommendation_generated`;
- `fit_recommendation_outcome_recorded`;
- `fit_issue_escalated_to_plm`;
- `size_curve_generated`;
- `size_curve_overridden`;
- `size_curve_locked_for_order`.

### Pricing

- `price_scenario_generated`;
- `price_decision_approved`;
- `price_execution_acknowledged`;
- `promotion_plan_approved`;
- `promotion_funding_claimed`;
- `markdown_recommendation_generated`;
- `markdown_executed`;
- `markdown_outcome_measured`.

### Sustainability

- `facility_assessment_requested`;
- `facility_assessment_verified`;
- `sustainability_finding_opened`;
- `supplier_improvement_action_verified`;
- `sustainability_claim_approved`;
- `sustainability_claim_revoked`.

### Items and returns

- `serialized_item_activated`;
- `item_custody_transferred`;
- `circular_service_requested`;
- `return_authorized`;
- `return_dropped_off`;
- `return_risk_flagged`;
- `return_received`;
- `return_disposition_assigned`;
- `exchange_replacement_released`;
- `item_reentered_inventory`.

### Credit and payments

- `credit_application_submitted`;
- `credit_decision_issued`;
- `credit_limit_changed`;
- `credit_reserved`;
- `credit_reservation_released`;
- `seller_settlement_paid`;
- `collection_case_opened`;
- `promise_to_pay_recorded`;
- `cash_applied`;
- `financial_dispute_resolved`.

---

## 191. Controlled UAT scenarios — version 2.8

### Fit and curve UAT

1. Map US, EU, IT and alpha sizes into one canonical size scale.
2. Change measurement chart after fit recommendation and verify invalidation.
3. Distinguish preference mismatch from production tolerance defect.
4. Generate size curve with missing historical sizes and lost-demand correction.
5. Apply factory pack ratio and observe curve distortion warning.
6. Override size curve with approval and compare actual outcome.
7. Recalculate curve after fit-related return spike.
8. Verify cross-account privacy of shopper body/fit data.

### Pricing UAT

9. Generate initial price scenarios using planned and actual landed cost.
10. Simulate price change with elasticity and competitor position.
11. Approve store-cluster price and verify POS/e-commerce acknowledgement.
12. Prevent price below margin/MAP guardrail.
13. Run promotion with supplier funding and reconcile claim.
14. Compare markdown versus transfer versus outlet scenario.
15. Verify return/refund handling after price reduction.
16. Measure recommendation-versus-actual outcome without hindsight overwrite.

### Sustainability UAT

17. Request facility assessment and track expiry.
18. Separate self-assessed and verified evidence.
19. Block sourcing allocation for critical verified finding.
20. Allow governed exception with approver and expiry.
21. Publish product claim only when evidence scope matches batch.
22. Revoke expired evidence and remove affected public claim.
23. Allocate facility impact using declared methodology and label estimate.
24. Verify supplier improvement action effectiveness.

### Serialized item and circular UAT

25. Encode, attach and verify serialized tag at factory.
26. Detect duplicate/cloned identifier.
27. Activate item after sale and bind warranty.
28. Transfer custody without exposing personal owner data.
29. Create repair order and append item history.
30. Create resale listing from verified item data.
31. Block recalled item from resale.
32. Record recycling outcome and close lifecycle.

### Returns UAT

33. Evaluate return eligibility across country/product/customer policy.
34. Offer size exchange using fit reason and available stock.
35. Reserve instant exchange with payment hold.
36. Resolve replacement out-of-stock automatically.
37. Scan box-free drop-off and issue risk-based refund.
38. Consolidate multiple merchants/brands without tenant leakage.
39. Receive bulk return shipment through ASN and manifest.
40. Verify item condition and route to restock/repair/outlet/recycle.
41. Create supplier recovery only after defect validation.
42. Re-enter sellable item into inventory with item identity updated.

### Credit and O2C UAT

43. Approve trade account with tailored limit and terms.
44. Reserve credit atomically across two simultaneous orders.
45. Release reservation after cancellation.
46. Convert reservation to receivable after partial shipment.
47. Split order between deposit and net terms.
48. Pay seller via funding provider while buyer remains unpaid.
49. Generate consolidated parent invoice with location details.
50. Apply one payment across multiple invoices.
51. Keep unmatched amount as unapplied cash.
52. Resolve deduction dispute with credit note and supplier recovery.
53. Suspend credit after overdue threshold and restore after review.
54. Verify currency and FX treatment across settlement and buyer payment.

---

## 192. Revised implementation priority after version 2.8

### P0 — data integrity and governed decisions

- canonical size scales;
- fit profile linked to product version;
- versioned effective prices;
- promotion versus markdown separation;
- facility/site identity;
- evidence-backed claims;
- serialized item identity model;
- return policy/version and disposition;
- credit limit/reservation consistency;
- invoice/payment/cash-application separation;
- immutable audit and correlation IDs.

### P1 — strongest near-term commercial value

- return-adjusted size curves;
- fit issue feedback to PLM;
- initial price and markdown scenarios;
- promotion funding ledger;
- supplier assessment/finding workspace;
- exchange and store-credit flow;
- returns receiving/disposition;
- trade credit application and reservation;
- buyer AR portal and cash application.

### P2 — network and optimization

- personalized fit recommendations;
- store-level pricing;
- automated markdown cohorts;
- item serialization and activation;
- repair/resale partner orchestration;
- box-free/consolidated returns integrations;
- third-party funding and guaranteed settlement;
- sustainability benchmarking.

### P3 — advanced intelligence

- cross-brand fit graph;
- dynamic size-curve learning;
- causal price/promotion optimization;
- product-level impact optimization;
- circular lifetime value;
- automated item fraud detection;
- portfolio credit optimization;
- autonomous exception routing with human approval boundaries.

### 192.1 Recommended delivery sequence

```text
1. Size and Price Master Data
2. Return Reasons and Item Disposition
3. Credit and Receivable Integrity
4. Fit / Price / ESG Evidence Capture
5. Recommendation Workspaces
6. Serialized Item and Circular Services
7. External Provider Integrations
8. Closed-loop Outcome Learning
```

Не следует начинать с AI recommendation UI до появления reliable identities, versions, outcomes and exception handling.

---

## 193. Product conclusion — version 2.8

Версия 2.8 закрывает ещё пять крупных разрывов между wholesale-ordering platform и реальной fashion operating system:

```text
1. Size label → Fit intelligence → Correct size curve
2. Price field → Full lifecycle pricing and markdown decision
3. Sustainability badge → Facility evidence and governed claim
4. SKU → Serialized item with post-sale lifecycle
5. Payment terms → Credit, funding, settlement and collections
```

Syntha должна обеспечивать сквозную прослеживаемость решения:

```text
Почему выбран этот продукт
→ почему заказаны эти размеры
→ почему установлена эта цена
→ где и при каких условиях продукт произведён
→ как конкретный item продан, возвращён, отремонтирован или перепродан
→ кто профинансировал сделку
→ какой окончательный коммерческий, качественный и sustainability outcome получен
```

Такой контур значительно сильнее JOOR-like ordering layer и отдельных point solutions, потому что сохраняет единую причинно-следственную цепочку между product development, buying, pricing, customer outcome, reverse logistics, supplier evidence and finance.

---

## 194. Official sources added in version 2.8

### True Fit

- https://www.truefit.com/about
- https://www.truefit.com/resources/calling-all-merchants
- https://www.truefit.com/shopify

### Competera

- https://competera.ai/
- https://competera.ai/dynamic-pricing-platform
- https://competera.ai/products/new-release
- https://competera.ai/resources/articles/markdown-pricing-competera

### Worldly

- https://worldly.io/tools/social-and-labor-data/
- https://worldly.io/solutions/sourcing-agents/
- https://worldly.io/resources/how-manufacturers-use-worldly-data-esg/

### EON

- https://www.eon.xyz/
- https://eon.xyz/initiatives/circular-product-data-protocol
- https://eon.xyz/clients/zalando

### Loop Returns

- https://www.loopreturns.com/
- https://www.loopreturns.com/returns/exchanges/
- https://help.loopreturns.com/en/articles/1913025
- https://help.loopreturns.com/en/articles/1911809

### Happy Returns

- https://happyreturns.com/
- https://happyreturns.com/box-free-return-bar-network
- https://developer-dev.happyreturns.com/guides/headless-returns/
- https://happyreturns.com/boris

### Hokodo

- https://www.hokodo.co/b2b-buy-now-pay-later
- https://www.hokodo.co/trade-account
- https://www.hokodo.co/pay-now

### TreviPay

- https://www.trevipay.com/solutions/
- https://www.trevipay.com/solutions/what-we-do/ar-automation-software/
- https://www.trevipay.com/solutions/use-cases/o2c-automation/
- https://www.trevipay.com/solutions/use-cases/international-expansion/

## 195. NuORDER 2026 delta benchmark — what Syntha must absorb and improve

### 195.1 Evidence boundary

Current official NuORDER materials confirm several capabilities that go beyond the basic JOOR flow observed in the audited Retailer / LITE account:

- live collaborative assortments by doors and deliveries;
- door attributes for store, warehouse, e-commerce and other allocation destinations;
- financial and operational targets inside assortments and rollups;
- rollup-specific and user-specific saved views;
- retailer-to-brand Order Intents with version history;
- product update synchronization into active assortments;
- retailer organization profiles that retain team and order history;
- customer-group product availability controls for Immediate, Future and Prebook products;
- Marketplace discovery with open or closed brand environments.

**JOOR status:** these exact end-to-end mechanics were not confirmed in the audited account. Visual Assortment was gated. Therefore every requirement below is marked **TARGET** until verified through controlled JOOR UAT.

### 195.2 Product decision

Syntha must not merely reproduce NuORDER Assortments. It must connect collaborative buying intent to:

```text
Financial Plan
→ Line / Assortment Plan
→ Buying Intent
→ Brand Capacity Signal
→ Negotiated Commitment
→ Purchase Order
→ Production Allocation
→ Receipt / Allocation
→ Sell-through Outcome
```

A change at any stage must preserve the previous commercial truth rather than overwrite it.

---

## 196. Assortment Rollup Control Plane

### 196.1 Purpose

A rollup is a governed decision layer across multiple assortments, buyers, brands, legal entities, channels, regions, clusters and delivery periods.

### 196.2 Rollup hierarchy

```text
Enterprise Merchandise Plan
→ Division / Channel Rollup
→ Department / Category Rollup
→ Brand Rollup
→ Buyer Assortment
→ Door / Cluster Allocation
→ Style / Color / Size
```

### 196.3 Required capabilities

- combine assortments without copying rows;
- calculate live totals from source assortments;
- drill from enterprise total to exact style-size-door cell;
- define financial targets at any rollup level;
- reconcile top-down targets and bottom-up selections;
- save shared, team and private views;
- preserve filters, pivots, visible columns and sort order;
- freeze approved views for meeting packs;
- compare Approved Baseline, Current Working and Latest Forecast;
- identify double-counted styles shared across assortments;
- expose currency conversion date and rate source;
- prevent private retailer fields from leaking to brands;
- support row, column and metric-level permissions;
- record every target, override and approval change.

### 196.4 Target dimensions

- net sales;
- retail value;
- wholesale value;
- landed cost;
- units;
- options;
- color options;
- intake margin;
- planned markdown;
- open-to-buy;
- receipts;
- ending inventory;
- weeks of supply;
- sustainability mix;
- local / exclusive / carry-over mix;
- price-band architecture;
- newness and replenishable share.

### 196.5 Target reconciliation

```text
Variance = Current Assortment Value - Approved Target
Target Attainment % = Current Assortment Value / Approved Target
Unallocated Target = Approved Target - Committed Intent - Approved PO
```

The system must distinguish negative variance caused by missing selections from variance caused by delayed supplier confirmation.

---

## 197. Buying Intent Protocol — stronger than an emailed assortment

### 197.1 Intent types

1. **Exploratory Interest** — non-binding signal.
2. **Shortlist Intent** — product selected for internal review.
3. **Capacity Signal** — brand may use it for provisional capacity planning.
4. **Commercial Intent** — quantities and target dates shared for negotiation.
5. **Approved Intent** — retailer internal approval completed.
6. **Convertible Intent** — ready to convert into purchase order.

### 197.2 Intent payload

- immutable intent ID;
- assortment and rollup source;
- sender organization and legal entity;
- buyer and approval chain;
- recipient brand/company;
- included products and excluded private rows;
- quantities by size, door, cluster and delivery;
- wholesale and retail totals;
- target cost and margin where explicitly shareable;
- requested ship start/end;
- substitution policy;
- cancellation assumptions;
- confidentiality classification;
- validity period;
- version and superseded version;
- attachments and negotiation notes;
- digital signature or explicit acknowledgement.

### 197.3 Privacy-safe sharing

Before sending, Syntha displays a field-level preview:

- **Shared with brand**;
- **Aggregated only**;
- **Retailer private**;
- **Masked**;
- **Derived but not exported**.

Private fields may include internal retail price decisions, planned markdown, competitor notes, store profitability, ranking and internal comments.

### 197.4 Versioning

An updated intent never silently mutates a previous version.

```text
DRAFT
→ INTERNAL_REVIEW
→ APPROVED_TO_SHARE
→ SHARED
→ ACKNOWLEDGED
→ COUNTERED
→ REVISED
→ READY_FOR_PO
→ CONVERTED
→ SUPERSEDED / EXPIRED / WITHDRAWN
```

Withdrawal must be possible while preserving evidence that a version had been shared. Recipient access after withdrawal follows contractual policy rather than technical deletion.

### 197.5 Brand response

The brand may answer per line:

- accepted as requested;
- quantity capped;
- quantity increased subject to MOQ;
- alternate color;
- alternate size curve;
- delivery moved;
- price changed;
- capacity pending;
- material pending;
- discontinued;
- substitution proposed.

Every response creates a structured delta and cannot be reduced to a free-text message.

---

## 198. Retailer Organization Profile and Identity Resolution

### 198.1 Problem

Buyer-level accounts often fragment one retailer into duplicate profiles, duplicate connection requests and incomplete order history.

### 198.2 Canonical hierarchy

```text
Retail Group
→ Legal Entity
→ Commercial Account
→ Banner / Concept
→ Channel
→ Door / Warehouse / E-commerce Site
→ Buyer Team
→ User
```

### 198.3 Capabilities

- organization-owned order and connection history;
- role changes without losing institutional history;
- user invitation, removal and replacement;
- duplicate profile detection;
- legal entity and tax identity verification;
- company-domain verification;
- branch and franchise relationships;
- parent/child credit and payment terms;
- connection approval once per governed scope;
- separate permissions for browse, intent, order, finance and administration;
- profile completeness and confidence score;
- merge workflow with preview, approval and reversible audit record.

### 198.4 Identity conflict rules

A user email, tax ID, company registration, store domain or shipping address may indicate a possible duplicate but must not trigger automatic irreversible merging. Syntha creates an `OrganizationMatchCandidate` with evidence and confidence.

---

## 199. Product Availability Segmentation and Release Strategy

### 199.1 Availability classes

- Immediate / ATS;
- Future confirmed;
- Prebook;
- Made-to-order;
- Replenishable NOS;
- Limited allocation;
- Exclusive window;
- Sample only;
- Preview only;
- Embargoed;
- Discontinued;
- Replacement-only;
- Outlet / clearance.

### 199.2 Access rules

Availability and visibility may differ by:

- retailer group;
- legal entity;
- country and territory;
- channel;
- sales representative;
- price list;
- collection;
- event;
- certification;
- credit status;
- minimum annual volume;
- invitation code;
- embargo date.

### 199.3 Release calendar

```text
Internal Preview
→ Selected Retailer Preview
→ Appointment Preview
→ Prebook Open
→ General Wholesale Open
→ Immediate Stock Open
→ Replenishment Only
→ Closeout
```

A product can be visible without being orderable. The UI must show the reason and next eligible date.

### 199.4 Allocation guardrails

Limited products require:

- available pool;
- reserved pool;
- protected strategic-account pool;
- order cap;
- minimum allocation;
- fair-share rule;
- manual exception approval;
- unclaimed allocation expiry;
- redistribution after expiry.

---

## 200. Assortment Change-Control and Supplier Update Feed

### 200.1 Change categories

- descriptive only;
- image/media;
- wholesale price;
- suggested retail price;
- cost basis;
- color name/code;
- size range;
- composition;
- origin;
- availability;
- delivery window;
- MOQ/MOV;
- pack ratio;
- compliance claim;
- product cancellation;
- replacement SKU.

### 200.2 Change impact classification

| Class | Example | Required action |
|---|---|---|
| Informational | copy correction | update feed only |
| Review | image or non-material attribute | buyer acknowledgement optional |
| Commercial | price/MOQ/terms | buyer reapproval |
| Quantity | size or availability reduction | reallocation required |
| Delivery | ship-window change | calendar and OTB impact review |
| Compliance | claim/origin/composition change | content revalidation |
| Destructive | product cancelled | replacement or removal workflow |

### 200.3 Cell lineage

Every assortment cell stores:

- original supplier value;
- current supplier value;
- retailer override;
- effective commercial value;
- last synced timestamp;
- source system;
- accepted/rejected status;
- downstream objects affected.

### 200.4 Update workflow

```text
Supplier Publishes Change
→ Impact Detection
→ Affected Assortments / Intents / Orders
→ Buyer Review
→ Accept / Keep Override / Negotiate / Replace
→ Recalculate Targets and Margin
→ Reapprove if Material
```

---

## 201. Market Appointment and Line Review Operating System

### 201.1 Appointment object

- event/market;
- physical or virtual location;
- retailer and brand teams;
- agenda;
- assortment version;
- available linesheets;
- samples reserved;
- decision rights;
- OTB snapshot;
- meeting objectives;
- follow-up deadline.

### 201.2 Live decision board

During the appointment users can mark:

- must buy;
- consider;
- reject;
- needs alternate color;
- needs better price;
- needs delivery change;
- needs exclusive;
- needs sample/fit review;
- placeholder/SMU;
- follow-up required.

Each decision captures owner, rationale and visibility scope.

### 201.3 Meeting close

The system generates:

- decision summary;
- unresolved questions;
- shared and private notes;
- sample return plan;
- preliminary intent;
- required brand responses;
- internal approval tasks;
- next meeting/date;
- conversion funnel from appointment to intent and PO.

### 201.4 Appointment analytics

- viewed versus selected styles;
- sample-to-selection rate;
- decision latency;
- follow-up completion;
- proposed versus ordered value;
- appointment-to-PO conversion;
- brand response SLA;
- incremental value influenced by salesperson.

---

## 202. MakerSights benchmark — Consumer Validation before commitment

### 202.1 COMPETITOR CONFIRMED direction

Official MakerSights materials describe consumer-informed product decisions from early sketches through final line adoption, including rapid product-specific feedback and broader testing coverage.

**JOOR status:** structured consumer validation linked to assortment and PLM was not confirmed in the audited account.

### 202.2 SYNTHA TARGET

Consumer research must become a first-class evidence source, not an attached presentation.

```text
Concept / Sketch / Sample
→ Test Design
→ Audience Recruitment
→ Response Collection
→ Bias / Quality Checks
→ Product Score
→ Decision Recommendation
→ Assortment / PLM Action
→ Actual Outcome Learning
```

### 202.3 Test types

- concept appeal;
- purchase intent;
- forced-choice ranking;
- MaxDiff;
- price sensitivity;
- color preference;
- silhouette preference;
- fit perception from imagery/video/3D;
- use-case relevance;
- attribute importance;
- naming/copy test;
- campaign image test;
- sustainability claim comprehension;
- assortment balance test;
- competitive comparison.

### 202.4 Audience definition

- country/region;
- gender/age only where legally appropriate;
- category buyer;
- brand buyer/non-buyer;
- price band;
- style archetype;
- loyalty segment;
- fit profile;
- climate;
- channel preference;
- recent purchase behavior;
- explicit exclusions.

Protected or sensitive attributes must not be used for unfair product access, pricing or discriminatory decisions.

### 202.5 Evidence quality

Each result stores:

- sample size;
- recruitment source;
- field dates;
- questionnaire version;
- stimulus version;
- response quality filters;
- confidence interval or uncertainty band;
- weighting method;
- segment stability;
- synthetic versus human respondent flag;
- research owner;
- approval status.

---

## 203. Product Experiment and Decision Registry

### 203.1 Experiment object

`ProductExperiment` links:

- hypothesis;
- product versions;
- treatment/control;
- audience;
- metrics;
- minimum evidence threshold;
- planned decision;
- actual decision;
- launch outcome.

### 203.2 Decision rules

Examples:

- advance concept if appeal and purchase-intent thresholds are met;
- advance only for selected segments;
- reduce color count if preference is concentrated;
- revise price if willingness-to-pay conflicts with margin floor;
- retain strategic image product despite low unit forecast, with explicit rationale;
- reject when evidence quality is insufficient rather than forcing a false ranking.

### 203.3 Learning loop

```text
Pre-market Score
→ Buyer Intent
→ PO
→ Full-price Sales
→ Returns
→ Markdown
→ Final Margin
```

The platform measures which research methods predict actual outcomes and recalibrates recommendations. Historical correlation must not be presented as causal proof.

---

## 204. First Insight benchmark — forward-looking demand and price testing

### 204.1 COMPETITOR CONFIRMED direction

Official First Insight materials describe digital product testing and forward-looking consumer price/demand inputs used for initial price, promotions and markdown planning.

### 204.2 SYNTHA TARGET

For each candidate product, maintain a versioned `ConsumerDemandCurve`:

- tested price points;
- purchase likelihood;
- expected units range;
- segment response;
- confidence;
- competitor context;
- test date;
- product stimulus version.

### 204.3 Integration with pricing

Consumer evidence is one input among:

- landed cost;
- margin floor;
- brand price architecture;
- competitor price;
- elasticity from actual sales;
- channel fees;
- tax and duties;
- strategic role;
- inventory risk.

The platform must never treat stated purchase intent as guaranteed demand.

---

## 205. Launchmetrics benchmark — Physical Sample Operating System

### 205.1 COMPETITOR CONFIRMED capabilities

Official Launchmetrics materials confirm sample inventory visibility, status/location tracking, barcode or RFID identification, reservations and requests for shoots/events/tradeshows, inventory audits and linking sample send-outs to media impact.

**JOOR status:** a controlled cross-department physical sample library and PR sample trafficking workflow was not confirmed.

### 205.2 Sample identity

A physical sample is not the same object as a PLM sample approval record.

`PhysicalSampleUnit` includes:

- unique sample unit ID;
- style/color/size/version;
- sample type;
- physical condition;
- barcode/RFID;
- owner department;
- home showroom/location;
- current custodian;
- current request/reservation;
- insured value;
- replacement cost;
- restrictions;
- return due date;
- images;
- cleaning/repair status;
- final disposition.

### 205.3 Sample types

- proto;
- fit;
- salesman;
- photo;
- press;
- runway;
- showroom;
- e-commerce content;
- wear test;
- production/reference;
- archive;
- gifted/non-returnable.

### 205.4 Chain of custody

```text
Created
→ Received
→ Quality Checked
→ Available
→ Reserved
→ Checked Out
→ In Transit
→ With Custodian
→ Return Due
→ Returned
→ Condition Checked
→ Available / Repair / Lost / Archived / Disposed
```

Every custody handoff records actor, timestamp, location, evidence and expected return.

---

## 206. Sample Request, Reservation and Conflict Engine

### 206.1 Request fields

- requester/contact/company;
- purpose;
- publication/campaign/event;
- requested samples;
- alternatives allowed;
- destination;
- dispatch deadline;
- required return date;
- expected publication date;
- priority;
- insurance/courier;
- approval policy;
- related opportunity/order/appointment.

### 206.2 Conflict rules

The engine detects:

- overlapping reservations;
- travel time between bookings;
- cleaning/repair buffer;
- embargo conflicts;
- geography/customs risk;
- sample not matching final approved product;
- high-value sample approval requirement;
- missing return from prior custodian;
- campaign priority conflict.

### 206.3 Fulfillment choices

- exact unit;
- substitute size;
- substitute color;
- duplicate unit;
- digital asset instead;
- new sample production request;
- decline with reason.

### 206.4 Sample ROI

Measure separately:

- PR/editorial coverage;
- content assets created;
- showroom appointments supported;
- wholesale selection influence;
- consumer test usage;
- revenue attribution with confidence;
- loss/damage cost;
- idle time;
- sample production reduction.

Attribution must show direct, assisted and unproven relationships rather than one inflated ROI number.

---

## 207. Shared Digital Showroom and Asset Request Graph

### 207.1 Product decision

One approved product asset should serve wholesale, PR, e-commerce, marketplace and retailer content workflows while preserving channel rights.

### 207.2 Asset rights

- owner;
- usage territory;
- channel;
- start/end dates;
- talent/model restrictions;
- photographer rights;
- paid media allowed;
- retailer redistribution allowed;
- derivative editing allowed;
- embargo;
- watermark policy;
- revocation.

### 207.3 Request workflow

Retailer, editor, agency or sales user can request:

- high-resolution image;
- product cutout;
- campaign image;
- video;
- 3D asset;
- copy pack;
- sample;
- interview/press material.

Approval and delivery are logged against the requesting organization and intended use.

---

## 208. Nedap iD Cloud benchmark — Item-Level RFID Inventory Truth

### 208.1 COMPETITOR CONFIRMED capabilities

Official Nedap materials describe item-level RFID visibility across stores, distribution centers and goods in transit, supporting a unified stock view and omnichannel use cases such as ship-from-store, BOPIS/Click & Collect and BORIS.

**JOOR status:** item-level retail inventory accuracy and RFID store operations were not confirmed.

### 208.2 SYNTHA TARGET architecture

```text
Serialized Item / EPC
→ Read Event
→ Location Zone
→ Inventory State
→ Availability Projection
→ Order Promise
→ Fulfillment / Transfer / Return
```

### 208.3 RFID event model

`RFIDReadEvent`:

- EPC/tag ID;
- item/SKU match;
- reader/device;
- location and zone;
- timestamp;
- direction if known;
- signal confidence;
- operation context;
- duplicate-read suppression key;
- source batch;
- exception flag.

### 208.4 Location zones

- receiving dock;
- backroom;
- sales floor;
- fitting room;
- checkout;
- pickup staging;
- returns quarantine;
- outbound dock;
- in transit;
- unknown.

---

## 209. Inventory Confidence Model

### 209.1 Why quantity alone is insufficient

Syntha must store both inventory quantity and confidence in that quantity.

`InventoryPosition` includes:

- on hand;
- reserved;
- available to sell;
- in transfer;
- in fulfillment;
- expected receipt;
- damaged/quarantine;
- last counted;
- last RFID read;
- last POS movement;
- confidence score;
- source conflict status.

### 209.2 Confidence factors

- elapsed time since count;
- RFID coverage;
- unresolved shrink event;
- negative inventory;
- repeated pick failure;
- return not inspected;
- source-system disagreement;
- location process compliance;
- item-level versus aggregate evidence.

### 209.3 Availability rule

```text
Promiseable Quantity
= Physical On Hand
- Hard Reservations
- Safety Buffer
- Untrusted Quantity Hold
+ Eligible Expected Supply
```

Expected supply may be used only when the promised date and confidence satisfy channel policy.

---

## 210. Cycle Count, Ghost Stock and Reconciliation

### 210.1 Count triggers

- scheduled cycle count;
- RFID variance;
- repeated online cancellation;
- negative stock;
- high-value item;
- shrink anomaly;
- return discrepancy;
- transfer discrepancy;
- store opening/closure;
- pre-event readiness.

### 210.2 Reconciliation workflow

```text
Variance Detected
→ Recount
→ Evidence Review
→ Root Cause
→ Inventory Adjustment Proposal
→ Approval
→ Posted Adjustment
→ Preventive Task
```

### 210.3 Root causes

- receiving error;
- unposted sale;
- wrong SKU/tag association;
- theft/loss;
- transfer not confirmed;
- return misclassification;
- damage;
- duplicate tag;
- item at wrong location;
- source integration delay.

### 210.4 Ghost stock metric

```text
Ghost Stock Rate
= Units Shown Available but Repeatedly Not Found / Units Attempted for Fulfillment
```

The metric must be available by store, SKU, category, process and time period.

---

## 211. Fluent Commerce benchmark — Distributed Order Management

### 211.1 COMPETITOR CONFIRMED capabilities

Official Fluent Commerce materials describe near-real-time inventory, order promising, configurable sourcing logic, split-shipment control, virtual inventory pools, preorders/backorders, store fulfillment and omnichannel returns.

**JOOR status:** distributed consumer-order orchestration was not confirmed.

### 211.2 Order orchestration graph

```text
Customer Order
→ Fraud / Payment Hold
→ Promise
→ Source Selection
→ Reservation
→ Fulfillment Task
→ Pick / Pack / Ship / Pickup
→ Delivery
→ Return / Exchange
```

### 211.3 Order line independence

One customer order may create:

- retailer-owned warehouse fulfillment;
- store fulfillment;
- supplier dropship;
- marketplace seller fulfillment;
- preorder fulfillment;
- digital product fulfillment.

Each line has its own promise, source, cost and status while the customer sees one coherent order.

---

## 212. Available-to-Promise and Order Promising Engine

### 212.1 Promise inputs

- trusted inventory;
- future receipts;
- supplier capacity;
- production completion;
- transfer lead time;
- carrier cutoffs;
- store operating hours;
- pick/pack capacity;
- location holidays;
- customer destination;
- service level;
- safety stock;
- channel priority;
- carbon/cost policy.

### 212.2 Promise outputs

- available now;
- ship date;
- delivery date range;
- pickup-ready time;
- partial availability;
- backorder date;
- preorder date;
- unavailable reason;
- confidence;
- alternative product/location.

### 212.3 Promise integrity

Customer-facing promises are versioned. If supply changes, the system records:

- original promise;
- revised prediction;
- customer notification;
- recovery option;
- compensation decision;
- root cause.

---

## 213. Sourcing and Fulfillment Optimization

### 213.1 Objective function

The best source is not always the nearest stock.

The optimizer can balance:

- delivery promise;
- transportation cost;
- split-shipment cost;
- markdown avoidance;
- location workload;
- inventory aging;
- strategic stock protection;
- packaging capability;
- return probability;
- carbon policy;
- supplier SLA;
- customs/tax implications.

### 213.2 Explainability

For every decision, store:

- candidate sources;
- rejected sources and reasons;
- policy version;
- estimated cost;
- promise impact;
- margin impact;
- manual override and outcome.

### 213.3 Re-sourcing triggers

- pick failure;
- no response;
- inventory confidence collapse;
- carrier disruption;
- store capacity limit;
- payment/fraud state change;
- customer address change;
- supplier rejection.

---

## 214. Store Fulfillment Application

### 214.1 Task types

- pick;
- pack;
- ship;
- stage for pickup;
- hand over pickup;
- receive return;
- inspect return;
- transfer out/in;
- cycle count;
- exception review.

### 214.2 Store UX

- mobile-first task queue;
- route through store zones;
- barcode/RFID verification;
- product image and location hint;
- substitution policy;
- not-found reason;
- pick timer and SLA;
- customer verification for pickup;
- label/document printing;
- offline-safe queue where permitted;
- manager escalation.

### 214.3 Capacity controls

- orders per hour;
- units per hour;
- staffing;
- cutoff times;
- blackout windows;
- category handling capability;
- packaging stock;
- pickup staging capacity;
- automatic throttling.

---

## 215. Virtual Inventory Pools and Channel Reservations

### 215.1 Pool examples

- e-commerce;
- retail floor;
- wholesale ATS;
- strategic accounts;
- marketplaces;
- dropship partners;
- preorder;
- replacement/warranty;
- VIP launch;
- outlet;
- safety stock.

### 215.2 Rules

- pools are logical projections, not duplicate physical stock;
- one physical unit cannot be hard-reserved twice;
- soft allocations expire;
- pool priority can change by season/event;
- retailer-specific inventory visibility may differ from actual total;
- channel oversell tolerance must be explicit;
- releases from protected pools require authorization.

### 215.3 Wholesale interaction

Wholesale orders, consumer orders and replenishment recommendations compete for the same supply through a common reservation service rather than independent spreadsheets.

---

## 216. Shopify Collective benchmark — Network Dropship and Endless Assortment

### 216.1 COMPETITOR CONFIRMED capabilities

Official Shopify Collective materials describe retailer-supplier connections, product and inventory synchronization, retailer-specific price lists, supplier-direct fulfillment, multi-brand checkout, tracking synchronization, automated supplier payment after fulfillment and policy-based returns.

**JOOR status:** consumer-facing multi-brand dropship orchestration was not confirmed.

### 216.2 SYNTHA TARGET

Syntha must support four distinct commercial models:

1. wholesale buy and retailer-owned inventory;
2. consignment;
3. supplier dropship;
4. marketplace/commission agency.

The model is assigned per agreement, product, territory and channel.

### 216.3 Dropship agreement

- retailer and supplier legal entities;
- product scope;
- cost/margin/revenue share;
- inventory feed SLA;
- order acceptance SLA;
- ship SLA;
- packaging/branding requirements;
- carrier responsibility;
- customer communication owner;
- cancellation policy;
- return routing;
- refund responsibility;
- tax model;
- data protection;
- settlement cadence;
- chargeback and dispute rules.

---

## 217. Multi-Seller Order, Settlement and Returns

### 217.1 Order split

A single consumer checkout creates:

- parent customer order;
- seller fulfillment orders;
- payment allocations;
- shipping promises;
- commissions;
- tax records;
- return responsibilities.

### 217.2 Financial separation

```text
Customer Payment
→ Platform / Retailer Receivable
→ Seller Payable
→ Commission / Margin
→ Shipping and Tax Allocation
→ Settlement Hold
→ Seller Payout
```

Customer refund, seller refund and seller payout reversal are separate events.

### 217.3 Return routing

Depending on policy, an item may return to:

- supplier;
- retailer warehouse;
- retailer store;
- third-party returns hub.

The system must synchronize label, tracking, inspection, refund and settlement across parties.

### 217.4 Customer experience

The customer sees:

- one checkout;
- transparent shipment split;
- consistent branded communication;
- seller-specific delivery status only where useful;
- unified support entry point;
- coherent return process.

---

## 218. Mirakl benchmark — Vendor and Catalog Onboarding at Scale

### 218.1 COMPETITOR CONFIRMED direction

Official Mirakl materials describe multi-format vendor/catalog onboarding through API, CSV, XML and EDI, self-service vendor portals and AI-supported mapping, categorization, enrichment, translation and validation.

### 218.2 SYNTHA TARGET onboarding stages

```text
Invite
→ Legal / Commercial Qualification
→ Technical Connection
→ Taxonomy Mapping
→ Product Validation
→ Inventory / Order Test
→ Fulfillment Certification
→ Pilot
→ Live
→ Continuous Scorecard
```

### 218.3 Vendor readiness dimensions

- legal/KYB;
- commercial agreement;
- tax;
- product data;
- images/assets;
- price;
- inventory;
- order acknowledgement;
- shipping labels;
- tracking;
- returns;
- settlement;
- customer service;
- compliance;
- security.

A vendor cannot be marked Live based only on catalog import success.

---

## 219. Catalog Ingestion and Mapping Studio

### 219.1 Supported inputs

- API;
- webhook;
- EDI;
- CSV/XLSX;
- XML/JSON;
- SFTP;
- manual portal;
- GS1/GDSN where applicable;
- supplier PIM connector.

### 219.2 Mapping object

`CatalogMappingProfile` stores:

- source schema/version;
- target taxonomy/version;
- field mappings;
- transformations;
- value dictionaries;
- locale rules;
- units;
- validation rules;
- fallback values;
- ownership;
- test cases;
- effective date.

### 219.3 AI assistance guardrails

AI may propose:

- category mapping;
- attribute extraction from text/image;
- translation;
- normalization;
- duplicate matching;
- missing-value suggestions.

AI-generated values require provenance, confidence and approval rules. Regulatory, composition, origin and sustainability claims cannot be invented from imagery or marketing copy.

### 219.4 Mapping regression tests

Before activating a mapping change, run:

- unchanged known products;
- new category;
- missing required field;
- unknown value;
- unit conversion;
- locale decimal/date;
- multi-value attribute;
- image ordering;
- variant relationship;
- duplicate GTIN.

---

## 220. Akeneo and Salsify benchmark — Product Experience Management

### 220.1 COMPETITOR CONFIRMED direction

Official Akeneo and Salsify materials describe centralized product information, data quality, channel-specific requirements, syndication, retailer onboarding/validation, workflows and product content delivery to multiple commerce endpoints.

**JOOR status:** a full PIM/PXM network with channel-specific content governance was not confirmed.

### 220.2 PLM versus PIM/PXM boundary

- **PLM** owns development intent, technical specification and approved product construction.
- **ERP** owns transactional and financial execution.
- **PIM/PXM** owns commercial product content, channel projections and publication readiness.
- **DAM** owns asset binaries, rights and renditions.
- **Syndication** delivers validated channel-specific packages.

Syntha may implement these in one platform, but ownership boundaries must remain explicit.

---

## 221. Product Golden Record and Commercial Projections

### 221.1 Golden record

The canonical record contains stable identity and authoritative attributes without forcing every channel to use identical copy.

### 221.2 Projection hierarchy

```text
Canonical Product
→ Market Projection
→ Channel Projection
→ Retailer Projection
→ Locale Projection
→ Campaign / Event Projection
```

### 221.3 Projection overrides

A projection may override:

- title;
- description;
- bullet points;
- taxonomy;
- image order;
- attribute labels;
- measurement units;
- compliance warnings;
- SEO fields;
- marketplace keywords;
- retailer-specific claims;
- launch/embargo dates.

It may not override immutable identity or technical truth without a governed source correction.

### 221.4 Lineage

Every published value displays:

- source entity;
- source system;
- owner;
- transformation;
- locale;
- approved version;
- publication endpoint;
- last acknowledged version.

---

## 222. Channel Requirement Registry and Readiness Engine

### 222.1 Requirement object

`ChannelRequirement`:

- endpoint;
- category scope;
- field/asset;
- required/conditional/optional;
- data type;
- allowed values;
- length/format;
- validation expression;
- effective date;
- deprecation date;
- severity;
- help text;
- source evidence.

### 222.2 Readiness states

```text
NOT_STARTED
→ INCOMPLETE
→ INVALID
→ READY_FOR_REVIEW
→ APPROVED
→ PUBLISHED
→ ACKNOWLEDGED
→ REJECTED
→ OUTDATED
```

### 222.3 Readiness dimensions

- identity;
- commercial;
- media;
- logistics;
- compliance;
- sustainability;
- localization;
- pricing;
- inventory;
- channel policy.

### 222.4 Readiness score rules

A single percentage is insufficient. Show blocking errors separately from optional enrichment opportunities.

```text
Publishable = No Blocking Errors AND Required Fields Complete AND Valid Approval
```

---

## 223. Two-Way Retailer Content Feedback

### 223.1 Feedback types

- missing attribute;
- invalid value;
- rejected image;
- taxonomy mismatch;
- claim unsupported;
- duplicate item;
- wrong variant relationship;
- prohibited wording;
- price discrepancy;
- stale inventory;
- consumer complaint.

### 223.2 Lifecycle

```text
Endpoint Feedback Received
→ Matched to Product / Package
→ Classified
→ Owner Assigned
→ Corrected at Proper Source
→ Revalidated
→ Republished
→ Endpoint Acknowledged
```

The correction must occur at the right ownership layer. A retailer-specific issue should not corrupt canonical PLM data.

### 223.3 Network learning

Repeated endpoint rejections become reusable validation rules, but automatic rule creation requires review to avoid encoding one retailer's temporary error as a global standard.

---

## 224. Digital Shelf and Content Performance Loop

### 224.1 Metrics

- content completeness;
- validation rejection rate;
- time to publish;
- time to correct;
- image coverage;
- rich-content coverage;
- search visibility;
- PDP conversion;
- add-to-cart;
- return reason linked to content;
- content version at time of sale;
- retailer content parity.

### 224.2 Causality guardrail

Content changes and sales changes may correlate. Syntha must distinguish:

- controlled experiment;
- before/after observation;
- matched comparison;
- unproven association.

### 224.3 Content issue to PLM

Examples:

- repeated fit confusion → measurement/fit guidance review;
- composition mismatch → BOM/label governance issue;
- color representation complaints → color/asset calibration;
- care-related returns → care instruction and material review.

---

## 225. Unified Demand Evidence Graph

### 225.1 Evidence sources

- consumer concept test;
- buyer shortlist;
- assortment selection;
- Order Intent;
- sample request;
- showroom view;
- product save/favorite;
- sales rep recommendation;
- wholesale order;
- consumer preorder;
- full-price sale;
- return;
- markdown;
- lost sale;
- external market signal.

### 225.2 Canonical graph

```text
Product Version
← Evidence Event
← Actor / Segment / Channel / Date
← Decision Context
→ Decision
→ Commercial Outcome
```

### 225.3 Evidence weighting

No universal weight is hard-coded. Weight depends on:

- commitment level;
- sample quality;
- recency;
- segment match;
- product similarity;
- channel;
- evidence independence;
- known bias;
- outcome validation.

A paid PO generally represents stronger commitment than a page view, but may still be distorted by contractual minimums.

---

## 226. Decision Journal and Human Override Governance

### 226.1 Decision record

For material decisions, store:

- question;
- available options;
- evidence used;
- evidence intentionally ignored;
- recommendation;
- decision maker;
- approvers;
- final choice;
- rationale;
- expected outcome;
- review date;
- actual outcome.

### 226.2 Override reasons

- strategic image value;
- contractual commitment;
- local market knowledge;
- model data gap;
- new category;
- executive direction;
- supplier relationship;
- sustainability objective;
- legal/compliance;
- test-and-learn allocation.

### 226.3 Outcome learning

The system compares recommendation, override and actual outcome. It must not penalize a human merely because the outcome was poor when the recommendation had low confidence.

---

## 227. Additional Canonical Entities for v2.9

### 227.1 Assortment and intent

- `AssortmentRollup`
- `RollupMembership`
- `RollupSavedView`
- `AssortmentTargetVersion`
- `BuyingIntent`
- `BuyingIntentVersion`
- `BuyingIntentLine`
- `IntentDisclosurePolicy`
- `IntentCounterproposal`
- `ProductUpdateNotice`
- `AssortmentCellLineage`
- `MarketAppointment`
- `AppointmentDecision`

### 227.2 Consumer evidence

- `ConsumerResearchPanel`
- `ProductExperiment`
- `ExperimentStimulus`
- `ExperimentResponseSet`
- `ConsumerDemandCurve`
- `ResearchQualityAssessment`
- `ProductDecisionRecord`

### 227.3 Samples and assets

- `PhysicalSampleUnit`
- `SampleReservation`
- `SampleRequest`
- `SampleCustodyEvent`
- `SampleInventoryAudit`
- `SampleConditionAssessment`
- `SampleOpportunityAttribution`
- `AssetUsageRight`
- `AssetRequest`

### 227.4 Inventory and OMS

- `RFIDTag`
- `RFIDReadEvent`
- `InventoryPosition`
- `InventoryConfidenceAssessment`
- `CycleCountTask`
- `InventoryReconciliationCase`
- `VirtualInventoryPool`
- `InventoryPoolAllocation`
- `CustomerOrder`
- `FulfillmentOrder`
- `OrderPromise`
- `SourcingDecision`
- `StoreFulfillmentTask`
- `PickFailure`

### 227.5 Network commerce and PXM

- `DropshipAgreement`
- `SellerOffer`
- `SellerOrder`
- `SellerSettlement`
- `VendorOnboardingCase`
- `VendorCertification`
- `CatalogMappingProfile`
- `CatalogIngestionRun`
- `ProductGoldenRecord`
- `ProductProjection`
- `ChannelRequirement`
- `ChannelReadinessAssessment`
- `EndpointFeedback`
- `PublicationAcknowledgement`
- `DemandEvidenceEvent`

---

## 228. New Routes and Workspaces

```text
/planning/rollups
/planning/rollups/:rollupId
/buying/intents
/buying/intents/:intentId
/buying/appointments
/research/experiments
/research/demand-curves
/samples/inventory
/samples/requests
/samples/calendar
/samples/audits
/assets/rights
/inventory/item-visibility
/inventory/confidence
/inventory/counts
/oms/orders
/oms/promises
/oms/fulfillment
/oms/store-tasks
/oms/virtual-pools
/network/dropship-agreements
/network/vendors/onboarding
/network/catalog-ingestion
/pxm/products
/pxm/channel-requirements
/pxm/readiness
/pxm/publications
/pxm/endpoint-feedback
/analytics/demand-evidence
/governance/decision-journal
```

Every route requires organization scope, role scope and audit context.

---

## 229. New Domain Events

### 229.1 Buying and planning

- `AssortmentRollupCreated`
- `RollupTargetApproved`
- `BuyingIntentShared`
- `BuyingIntentAcknowledged`
- `BuyingIntentCountered`
- `BuyingIntentConvertedToOrder`
- `SupplierProductChangePublished`
- `AssortmentChangeAccepted`
- `AppointmentDecisionRecorded`

### 229.2 Research and samples

- `ProductExperimentLaunched`
- `ExperimentResultsApproved`
- `ConsumerDemandCurvePublished`
- `PhysicalSampleReceived`
- `SampleReserved`
- `SampleCheckedOut`
- `SampleOverdue`
- `SampleReturnedDamaged`
- `SampleDeclaredLost`
- `SampleCoverageLinked`

### 229.3 Inventory and fulfillment

- `RFIDReadIngested`
- `InventoryConfidenceChanged`
- `GhostStockDetected`
- `CycleCountRequested`
- `InventoryAdjustmentPosted`
- `OrderPromiseCreated`
- `FulfillmentSourceSelected`
- `PickFailed`
- `OrderResourced`
- `StoreCapacityThrottled`

### 229.4 Network commerce and PXM

- `DropshipAgreementActivated`
- `SellerOrderCreated`
- `SellerFulfillmentConfirmed`
- `SellerSettlementReleased`
- `VendorCertifiedLive`
- `CatalogIngestionFailed`
- `ProductProjectionApproved`
- `ChannelReadinessBlocked`
- `ProductPackagePublished`
- `EndpointRejectedProduct`
- `EndpointAcknowledgedPublication`

---

## 230. State Machines Added in v2.9

### 230.1 Vendor onboarding

```text
INVITED
→ APPLICATION
→ COMMERCIAL_REVIEW
→ TECHNICAL_SETUP
→ CATALOG_VALIDATION
→ ORDER_TEST
→ PILOT
→ CERTIFIED
→ LIVE
→ SUSPENDED / OFFBOARDED
```

### 230.2 Sample request

```text
DRAFT
→ SUBMITTED
→ REVIEW
→ APPROVED
→ RESERVED
→ DISPATCHED
→ IN_USE
→ RETURN_IN_TRANSIT
→ RECEIVED
→ CLOSED
```

Exception states: `DECLINED`, `CANCELLED`, `OVERDUE`, `LOST`, `DAMAGED`.

### 230.3 Fulfillment order

```text
CREATED
→ SOURCING
→ RESERVED
→ ASSIGNED
→ PICKING
→ PACKED
→ SHIPPED / READY_FOR_PICKUP
→ DELIVERED / COLLECTED
```

Exception states: `PICK_FAILED`, `RE_SOURCING`, `CANCELLED`, `RETURNED`.

### 230.4 Product publication

```text
DRAFT
→ VALIDATING
→ BLOCKED / READY
→ APPROVED
→ PUBLISHING
→ PUBLISHED
→ ACKNOWLEDGED
→ OUTDATED / REJECTED / WITHDRAWN
```

---

## 231. Metrics and Control Tower Additions

### 231.1 Buying intent

- intent-to-PO conversion;
- average versions before PO;
- value changed after supplier counterproposal;
- intent aging;
- capacity signal accuracy;
- delivery variance from intent to confirmed order.

### 231.2 Samples

- utilization rate;
- reservation conflict rate;
- overdue rate;
- loss/damage rate;
- average circulation time;
- sample-to-order influence;
- sample-to-content output;
- idle sample days;
- sample production avoided.

### 231.3 Inventory and OMS

- inventory confidence;
- ghost stock rate;
- pick failure rate;
- promise accuracy;
- cancellation due to stock;
- split shipment rate;
- fulfillment cost per order;
- source override rate;
- store fulfillment SLA;
- resourcing success rate.

### 231.4 PXM

- first-pass readiness;
- required-field completeness;
- endpoint rejection rate;
- average correction time;
- stale content rate;
- channel parity;
- publication acknowledgement latency;
- sales/returns by content version.

---

## 232. Additional UAT Scenarios

1. Rollup target changes after three child assortments are approved.
2. Private retailer margin field is excluded from an Order Intent.
3. Brand counters only one delivery while accepting others.
4. Buyer withdraws an intent after brand acknowledgement.
5. Supplier changes price in an active assortment.
6. Supplier cancels a style already included in approved intent.
7. Retailer organization merge finds conflicting tax IDs.
8. Product changes from Prebook to Immediate availability.
9. Limited allocation expires and is redistributed.
10. Consumer test contains low-quality respondents.
11. Synthetic and human research results diverge.
12. Consumer preference conflicts with margin floor.
13. Sample has overlapping PR and sales reservations.
14. Sample returns late and misses another appointment.
15. Sample barcode is valid but style/version is wrong.
16. RFID tag is read simultaneously in incompatible locations.
17. RFID item exists physically but is reserved elsewhere.
18. POS says sold while RFID still reads on sales floor.
19. Repeated ship-from-store picks fail for the same SKU.
20. Inventory confidence falls below channel threshold during checkout.
21. Order requires warehouse, store and dropship fulfillment.
22. Cheapest source violates promised delivery.
23. Store exceeds fulfillment capacity.
24. Preorder receipt is delayed after customer promise.
25. Dropship supplier rejects after customer payment.
26. Seller ships partially and misses SLA on remaining units.
27. Customer returns a mixed retailer-owned and dropship order.
28. Seller refunds retailer but consumer refund fails.
29. Vendor uploads duplicate GTINs in different categories.
30. AI category mapping has low confidence.
31. Mapping change breaks previously valid products.
32. Retailer adds a new mandatory attribute with future effective date.
33. Product is publishable to one endpoint but blocked for another.
34. Endpoint rejects an image due to channel-specific rights.
35. Canonical composition differs from retailer projection.
36. Product package is published but endpoint does not acknowledge.
37. A content correction must propagate to active orders and DPP.
38. Decision override performs better than model recommendation.
39. Decision override performs worse but model confidence was low.
40. One demand signal is duplicated through two integrations.

Each UAT result must include input fixtures, role, expected state transitions, emitted events, audit evidence and rollback behavior.

---

## 233. Priority Update after v2.9

### P0 — foundation required for reliable commerce

- organization identity hierarchy and deduplication;
- Buying Intent versioning and disclosure policy;
- product change-impact feed;
- inventory reservation service;
- product golden record and channel requirement registry;
- immutable audit and event idempotency.

### P1 — strongest differentiation versus JOOR

- assortment rollup targets and saved views;
- appointment decision workspace;
- consumer product experiments;
- physical sample inventory and chain of custody;
- inventory confidence and RFID event ingestion;
- ATP/order promising and configurable sourcing;
- virtual inventory pools;
- dropship agreements and seller order split;
- vendor onboarding and mapping studio;
- PXM readiness/publication/feedback loop.

### P2 — scale and optimization

- sample ROI and media attribution;
- advanced consumer demand curves;
- store fulfillment application;
- sourcing optimization;
- automated seller settlement;
- AI-assisted catalog mapping and enrichment;
- digital shelf performance loop.

### P3 — network intelligence

- learned evidence weighting;
- model-versus-human decision outcomes;
- cross-network benchmark with privacy thresholds;
- autonomous low-risk corrections with approval policies;
- predictive sample demand and inventory confidence.

---

## 234. Updated Competitive Gap Matrix

| Capability | Strong benchmark | JOOR audited status | Syntha target |
|---|---|---|---|
| Financial targets in assortment rollups | NuORDER | GATED / NOT CONFIRMED | Governed rollup control plane |
| Versioned pre-PO intent sharing | NuORDER | NOT CONFIRMED | Buying Intent protocol with privacy preview |
| Unified retailer organization profile | NuORDER | PARTIAL / UAT | Full group-to-door identity model |
| Immediate/Future/Prebook access segmentation | NuORDER | NOT CONFIRMED | Release and allocation policy engine |
| Consumer validation before line adoption | MakerSights | NOT CONFIRMED | Product experiment registry linked to PLM |
| Forward-looking consumer price testing | First Insight | NOT CONFIRMED | Demand-curve evidence in pricing workflow |
| Physical sample trafficking | Launchmetrics | NOT CONFIRMED | Barcode/RFID chain of custody and reservations |
| Sample-to-media/commercial attribution | Launchmetrics | NOT CONFIRMED | Multi-outcome sample ROI with confidence |
| Item-level RFID inventory | Nedap | NOT CONFIRMED | Item visibility plus inventory confidence |
| Distributed order management | Fluent Commerce | NOT CONFIRMED | Promise, sourcing, orchestration and store tasks |
| Virtual inventory pools | Fluent Commerce | NOT CONFIRMED | Common reservations across channels |
| Network dropship | Shopify Collective | NOT CONFIRMED | Agreement-driven multi-seller commerce |
| Vendor onboarding at scale | Mirakl | NOT CONFIRMED | Legal, catalog, order and fulfillment certification |
| AI-assisted catalog mapping | Mirakl | NOT CONFIRMED | Governed mapping studio with provenance |
| Product experience management | Akeneo/Salsify | PARTIAL | Golden record, projections and syndication |
| Two-way retailer content requirements | Salsify | NOT CONFIRMED | Requirement registry and endpoint feedback loop |
| Unified demand evidence graph | No single benchmark | NOT CONFIRMED | Syntha-native decision intelligence layer |

---

## 235. Official Source Register for v2.9

### NuORDER

- https://helpdesk.nuorder.com/hc/en-us/articles/47431602186907-Assortments-update-February-2026
- https://helpdesk.nuorder.com/hc/en-us/articles/18155221611675-Assortments-for-Brands-setup
- https://helpdesk.nuorder.com/hc/en-us/articles/18923106692379-Targets-in-assortments
- https://helpdesk.nuorder.com/hc/en-us/articles/23290603807387-Order-Intents
- https://helpdesk.nuorder.com/hc/en-us/articles/40694350822171-Assortments-update-August-2025
- https://helpdesk.nuorder.com/hc/en-us/articles/47286965076507-Brand-update-February-2026
- https://helpdesk.nuorder.com/hc/en-us/articles/8494830248987-Marketplace-overview-for-brands

### Consumer validation

- https://www.makersights.com/
- https://www.makersights.com/makerlabs
- https://www.firstinsight.com/solutions/retail-price-optimization-software

### Samples and showroom operations

- https://www.launchmetrics.com/software/samples-management
- https://www.launchmetrics.com/resources/product-news/product-update-samples-without-silos
- https://www.launchmetrics.com/resources/product-news/sample-inventory-audits
- https://www.launchmetrics.com/brand-performance-cloud

### RFID and OMS

- https://www.nedap-retail.com/platform/id-cloud-omnichannel/
- https://fluentcommerce.com/fluent-commerce-oms/
- https://fluentcommerce.com/inventory-accuracy/
- https://fluentcommerce.com/retail-distributed-order-management/
- https://docs.fluentcommerce.com/by-type/fluent-store-web-app-overview

### Network commerce, vendor onboarding and PXM

- https://www.shopify.com/collective
- https://help.shopify.com/en/manual/online-sales-channels/shopify-collective/retailers/managing-collective-orders
- https://help.shopify.com/en/manual/online-sales-channels/shopify-collective/retailers/policies/returns
- https://www.mirakl.com/products/dropship-platform/
- https://www.akeneo.com/
- https://www.akeneo.com/omnichannel/
- https://www.salsify.com/pxm-network
- https://www.salsify.com/product-experience-management/retailers
- https://www.salsify.com/pxm/syndication

---

## 236. Version 2.9 product decision

Syntha must become the system in which demand is progressively converted into accountable commitment:

```text
Consumer Evidence
→ Buyer Decision
→ Buying Intent
→ Supply and Inventory Promise
→ Order and Fulfillment
→ Product Experience
→ Sale / Return
→ Verified Outcome
```

The strategic advantage is not the number of isolated modules. It is a shared identity, version history and evidence graph across product development, wholesale buying, samples, content, inventory and consumer fulfillment.

No module may create its own incompatible truth for product, inventory, organization, price, order or outcome.

## 237. Version 3.0 scope — commercial operating system beyond JOOR

### 237.1 Why this version exists

Versions 2.0–2.9 expanded Syntha from a JOOR-like B2B cabinet into a connected fashion platform covering planning, PLM, sourcing, ordering, production, quality, logistics, pricing, inventory, payments, traceability and circular commerce.

Version 3.0 closes another structural gap: most B2B commerce products treat forecasts, agreements, supplier obligations, consignment, rebates, tax documents and recalls as external ERP/legal processes. Syntha must make them explicit, versioned and operational.

Target operating loop:

```text
Commercial Agreement
→ Joint Forecast
→ Supplier Commit
→ Capacity / Material Reservation
→ Buy / VMI / Consignment Decision
→ Fulfillment
→ Consumption / Sell-through
→ Rebate / Settlement / Invoice
→ Obligation and Compliance Evidence
→ Recall / Claim / Recovery when required
→ Relationship Performance Review
```

### 237.2 Evidence boundary

- NuORDER remains the primary direct benchmark for assortment collaboration, buying intent and retailer/brand workflow.
- Oracle Supply Chain Collaboration is used as a benchmark for forecast sharing, supplier commits, VMI and multitier collaboration.
- Icertis is used as a benchmark for contract lifecycle and obligation management.
- Vistex is used as a benchmark for rebates, reimbursements, chargebacks, marketing funds and incentive agreements.
- OpenPeppol is used as a benchmark for interoperable e-orders and e-invoices.
- GS1 EPCIS/CBV is used as the event model benchmark for traceability and recall.
- User-provided Omnidata PLM and Centric Software materials are treated as reference evidence for PLM, material roll-up, supplier collaboration, mobile capture, fit review and visual data workspaces.
- JOOR status for these flows is `NOT CONFIRMED / UAT` unless separately observed. The document does not assert absence from inaccessible JOOR tiers.

---

## 238. Collaborative Forecast and Commitment Network

### 238.1 Business purpose

A wholesale order arrives too late to be the first supply signal. Syntha must support a controlled collaboration process before PO creation so that brands, retailers, suppliers and factories can align expected demand, available capacity and material risk.

```text
Retailer Demand Forecast
→ Brand Supply Forecast
→ Factory / Supplier Commit
→ Exception Negotiation
→ Approved Collaborative Plan
→ Buying Intent / PO / Material Reservation
```

### 238.2 Canonical forecast hierarchy

```text
ForecastProgram
→ ForecastCycle
→ ForecastVersion
→ ForecastSeries
→ ForecastBucket
→ PartnerCommitment
→ CommitmentException
→ Resolution
```

Dimensions:

- organization and legal entity;
- brand and retailer relationship;
- season, collection and drop;
- style, colorway, SKU, material or capacity family;
- country, channel, cluster, door and fulfillment location;
- weekly, monthly and delivery-window buckets;
- base, upside, downside and event scenarios;
- units, value, cost, capacity minutes and material demand;
- confidence and data coverage.

### 238.3 Forecast states

```text
DRAFT
→ INTERNAL_REVIEW
→ PUBLISHED_TO_PARTNER
→ PARTNER_REVIEW
→ COMMITTED / PARTIALLY_COMMITTED / REJECTED
→ EXCEPTION_NEGOTIATION
→ AGREED
→ SUPERSEDED / CLOSED
```

A forecast is not an order. A supplier commit is not a legally binding PO unless an agreement explicitly says otherwise.

### 238.4 Partner commitment fields

- requested quantity/value/capacity;
- committed quantity/value/capacity;
- commit date and delivery bucket;
- minimum and maximum range;
- confidence;
- constraint reason;
- alternative material/factory/date;
- MOQ and economic batch effect;
- capacity reservation requirement;
- price validity assumptions;
- cancellation window;
- owner and approver;
- source forecast version;
- expiration date.

### 238.5 Exception types

- demand exceeds supplier capacity;
- demand below MOQ;
- material lead time exceeds launch window;
- price no longer valid;
- forecast change exceeds tolerance;
- supplier commit falls below threshold;
- retailer forecast conflicts with OTB;
- planned delivery conflicts with warehouse capacity;
- currency or cost assumption changed;
- product readiness insufficient;
- compliance evidence missing;
- forecast freshness SLA breached.

### 238.6 Forecast consumption

Syntha must show how downstream facts consume the collaborative forecast:

```text
Open Forecast
= Agreed Forecast
- Approved Buying Intents
- Confirmed POs
- Cancelled / Expired Commitments
```

The system must prevent double counting when a buying intent becomes a PO.

### 238.7 Accuracy and accountability

Metrics:

```text
Forecast Bias = Sum(Forecast - Actual) / Sum(Actual)
WAPE = Sum(abs(Forecast - Actual)) / Sum(Actual)
Commit Reliability = Delivered Against Commit / Committed Quantity
Commit Response SLA = Partner Response Time / Agreed SLA
Exception Resolution Time = Resolved At - Opened At
```

Accuracy must be shown by horizon, product level and partner. A forecast that was accurate only after repeated last-minute revisions must not receive the same quality score as an early accurate forecast.

---

## 239. Joint Business Planning workspace

### 239.1 Purpose

The relationship between a brand and retailer must have a shared operating plan rather than disconnected orders and messages.

`JointBusinessPlan` contains:

- strategic objectives;
- annual and seasonal sales targets;
- gross margin and intake margin targets;
- planned receipts and inventory;
- channel and door expansion;
- category growth priorities;
- exclusivity or launch commitments;
- marketing calendar;
- service-level commitments;
- data-sharing rules;
- payment and credit objectives;
- sustainability and compliance targets;
- action plan and owners.

### 239.2 Shared versus private layers

Shared:

- agreed targets;
- approved forecasts;
- obligations;
- actions;
- meeting decisions;
- performance against agreement.

Retailer-private:

- internal OTB;
- internal margin floors;
- competitor comparisons;
- planned negotiation range.

Brand-private:

- factory cost;
- internal capacity allocation;
- other retailer commitments;
- internal price floor.

### 239.3 Business review cadence

- weekly exception review;
- monthly operational review;
- seasonal line review;
- quarterly business review;
- annual agreement renewal.

Every review must freeze a versioned snapshot of metrics and decisions. Later data corrections cannot silently rewrite what participants saw at the meeting.

---

## 240. Vendor-Managed Inventory and consignment operating model

### 240.1 Distinct models

Syntha must keep these models separate:

| Model | Inventory owner before sale/consumption | Who plans replenishment | Settlement trigger |
|---|---|---|---|
| Wholesale | Retailer | Retailer or shared | Receipt/invoice terms |
| VMI, retailer-owned | Retailer | Supplier | Receipt/invoice terms |
| Consignment | Supplier | Retailer or supplier | Consumption/sale |
| VMI + consignment | Supplier | Supplier | Consumption/sale |
| Dropship | Supplier | Supplier | Customer shipment/delivery |

### 240.2 Consignment agreement

`ConsignmentAgreement` fields:

- supplier and buyer entities;
- covered products and locations;
- ownership-transfer event;
- valuation method;
- settlement price and price version;
- consumption reporting frequency;
- shrink and damage responsibility;
- return and aging policy;
- markdown authority;
- inventory count cadence;
- insurance responsibility;
- tax and e-invoice treatment;
- replenishment policy;
- minimum/maximum stock;
- termination and stock disposition rules.

### 240.3 Inventory ownership ledger

Every stock unit or quantity bucket must expose:

- physical custodian;
- legal owner;
- financial owner;
- planning owner;
- risk-of-loss owner;
- sellable status;
- settlement status;
- location;
- lot/serial where available.

Physical possession does not imply ownership.

### 240.4 Consumption advice

```text
Inventory Event
→ Consumption Candidate
→ Validation
→ Consumption Advice
→ Supplier Acknowledgement
→ Invoice / Self-bill
→ Payment
→ Reconciliation
```

Consumption can originate from:

- POS sale;
- e-commerce shipment;
- internal use;
- sample conversion;
- damage or shrink where contractually billable;
- ownership transfer;
- manual adjustment with approval.

### 240.5 VMI replenishment policy

- min/max;
- reorder point;
- target weeks of supply;
- service-level target;
- presentation minimum;
- forecast-based target;
- one-for-one replacement;
- seasonal ramp-up/ramp-down;
- event or launch override;
- supplier capacity constraint;
- retailer OTB or exposure ceiling.

Suppliers may propose replenishment, but retailer policy determines whether a request is auto-approved, requires review or is blocked.

### 240.6 Reconciliation

Required comparisons:

```text
Opening Stock
+ Receipts
- Sales / Consumption
- Returns to Supplier
- Write-offs
+ Adjustments
= Expected Closing Stock
```

Expected closing stock must reconcile with retailer count, supplier ledger and financial settlement. Differences create a `ConsignmentDiscrepancy` with evidence, owner and financial exposure.

---

## 241. Contract Lifecycle Management for fashion trade relationships

### 241.1 Contract hierarchy

```text
Master Agreement
→ Territory / Channel Addendum
→ Season Terms
→ Price List / Rebate Program
→ Purchase Order
→ Amendment
→ Claim / Settlement
```

### 241.2 Contract lifecycle

```text
REQUESTED
→ DRAFTING
→ INTERNAL_REVIEW
→ COUNTERPARTY_NEGOTIATION
→ APPROVAL
→ SIGNATURE
→ ACTIVE
→ AMENDED / SUSPENDED
→ EXPIRING
→ RENEWED / TERMINATED / EXPIRED
```

### 241.3 Clause library

Controlled clause categories:

- territory and channel rights;
- exclusivity;
- price and currency;
- payment terms;
- credit and security;
- MOQ/MOV;
- forecasts and commitments;
- cancellation;
- delivery windows;
- quality and inspection;
- product compliance;
- sustainability evidence;
- IP, imagery and content rights;
- data sharing and AI use;
- confidentiality;
- returns and claims;
- rebates and marketing funds;
- consignment/VMI;
- recalls;
- audit rights;
- governing law and dispute resolution;
- termination and post-termination obligations.

### 241.4 Contract-to-system policy compilation

Approved clauses must generate executable controls where possible:

```text
Signed Clause
→ Structured Term
→ Policy Rule
→ Transaction Validation
→ Evidence
```

Examples:

- exclusivity clause → assortment/territory conflict check;
- credit clause → order credit policy;
- delivery SLA → shipment exception threshold;
- rebate clause → accrual rule;
- data-sharing clause → feed permissions;
- return window → RMA eligibility;
- compliance clause → product readiness gate.

A human-readable contract remains authoritative. A compiled rule must always reference the exact clause and contract version.

---

## 242. Obligation and deliverable management

### 242.1 Obligation entity

`ContractObligation` fields:

- contract and clause reference;
- obligation type;
- obligated party;
- beneficiary;
- owner and approver;
- trigger event;
- due date or recurrence;
- grace period;
- required evidence;
- monetary exposure;
- severity;
- fulfillment criteria;
- waiver policy;
- status and history.

### 242.2 Lifecycle

```text
IDENTIFIED
→ ASSIGNED
→ SCHEDULED
→ IN_PROGRESS
→ EVIDENCE_SUBMITTED
→ VERIFIED
→ FULFILLED
```

Alternative states:

```text
ON_HOLD / WAIVED / BREACHED / DISPUTED / REMEDIATION / CANCELLED
```

### 242.3 Fashion-specific obligations

- provide seasonal line by agreed date;
- deliver samples before market appointment;
- publish approved imagery;
- maintain inventory feed SLA;
- meet launch delivery window;
- keep minimum stock;
- provide lab tests and certificates;
- maintain MAP/RRP policy;
- fund campaign or markdown allowance;
- provide sell-through data;
- complete corrective action;
- submit ASN before shipment;
- maintain insurance;
- provide recall response within SLA;
- remove expired content claim;
- destroy or return confidential samples.

### 242.4 Breach impact

A breach can trigger:

- alert and remediation plan;
- approval hold;
- shipment hold;
- order suspension;
- credit hold;
- financial deduction;
- rebate forfeiture;
- claim;
- contract escalation;
- supplier/retailer score impact.

No irreversible action may execute solely from an AI-extracted obligation without human validation.

---

## 243. Rebate, allowance and commercial fund engine

### 243.1 Program types

- volume rebate;
- growth rebate;
- sell-through rebate;
- early-order discount;
- prompt-payment discount;
- markdown support;
- marketing development fund;
- co-op advertising;
- new-store opening allowance;
- listing/onboarding fee;
- freight allowance;
- returns allowance;
- defective-product allowance;
- data-sharing incentive;
- sustainability-performance incentive;
- loyalty or tier rebate;
- royalty/licensing fee.

### 243.2 Rebate program structure

`CommercialProgram` contains:

- agreement and version;
- payer and beneficiary;
- eligible products, accounts and territories;
- effective period;
- calculation basis;
- thresholds and tiers;
- rate or fixed amount;
- inclusion/exclusion rules;
- stacking priority;
- accrual timing;
- claim requirement;
- evidence requirement;
- settlement method;
- cap/floor;
- currency and FX rule;
- tax treatment;
- reversal/clawback rule.

### 243.3 Calculation examples

```text
Volume Rebate
= Eligible Net Sales × Applicable Tier Rate

Growth Rebate
= max(0, Current Eligible Sales - Baseline Sales) × Growth Rate

Markdown Support
= Eligible Marked-down Units × Approved Support per Unit

Marketing Fund Available
= Earned Fund + Manual Credits - Approved Claims - Expired Amount
```

The system must define whether returns, cancellations, tax, freight, discounts and credit notes reduce the basis.

### 243.4 Accrual and settlement

```text
Program Activated
→ Eligible Transaction Posted
→ Accrual Calculated
→ Period Estimate
→ Partner Statement
→ Claim / Auto-settlement
→ Validation
→ Credit Note / Invoice / Payment
→ Reconciliation
→ Close
```

Estimated accrual, approved liability and settled amount are separate states.

### 243.5 Dispute workflow

- transaction-level drill-down;
- rule version used;
- excluded transaction reason;
- supporting documents;
- counterparty response;
- partial acceptance;
- credit note or correction;
- audit trail;
- impact on net-net margin.

---

## 244. Net-net profitability and commercial waterfall

Syntha must calculate profitability after all commercial programs, not only wholesale price minus product cost.

```text
Gross Invoice Revenue
- Line Discounts
- Returns and Cancellations
- Rebates and Allowances
- Markdown Support
- Marketing Funds
- Commissions
- Payment and Financing Cost
- Freight and Fulfillment
- Quality Claims and Chargebacks
- Tax Leakage / FX Variance
= Net-Net Revenue

Net-Net Margin
= Net-Net Revenue - Landed Cost - Service Cost
```

Required views:

- planned versus accrued versus settled;
- by brand, retailer, agreement, season, product and channel;
- controllable versus contractual cost;
- margin before and after rebate;
- profitability by relationship;
- lost value due to missed claims or expired funds.

---

## 245. Structured e-invoicing and fiscal compliance network

### 245.1 Principle

A PDF invoice is a visual document, not sufficient structured e-invoice data. Syntha must support country- and network-specific structured formats while retaining a human-readable rendering.

### 245.2 E-invoice profile

`EInvoiceComplianceProfile` fields:

- seller and buyer tax jurisdictions;
- B2B/B2G/export scope;
- mandatory start date;
- document format;
- network or government portal;
- real-time clearance versus post-audit;
- required identifiers;
- tax codes;
- signature/seal requirements;
- reporting deadline;
- archiving period and location;
- cancellation/correction method;
- permitted currencies and rounding;
- service provider/access point;
- evidence and acknowledgement requirements.

### 245.3 Processing lifecycle

```text
Invoice Draft
→ Commercial Validation
→ Tax Validation
→ Format Transformation
→ Network Submission
→ Technical Acknowledgement
→ Fiscal Clearance / Acceptance
→ Buyer Delivery
→ Buyer Business Response
→ Accounting Posting
→ Payment
→ Archive
```

Error states must distinguish:

- syntax rejected;
- tax validation failed;
- recipient not reachable;
- duplicate invoice;
- clearance timeout;
- buyer business rejection;
- accounting mismatch;
- cancelled/superseded.

### 245.4 Peppol-style interoperability

Syntha should implement a provider-neutral adapter model:

```text
Syntha Canonical Invoice
→ Country/Network Profile
→ Access Point / Service Provider
→ Recipient Access Point
→ Recipient System
```

One canonical invoice model must support multiple delivery networks without contaminating business logic with provider-specific fields.

### 245.5 Invoice corrections

Never mutate a fiscally issued invoice. Use:

- credit note;
- debit note;
- corrected invoice;
- cancellation message where legally supported;
- reference to original fiscal document and clearance ID.

---

## 246. Product incident, withdrawal and recall control tower

### 246.1 Incident sources

- failed lab test;
- production defect;
- consumer complaint;
- retailer return cluster;
- regulatory notice;
- supplier notification;
- incorrect label or composition;
- chemical restriction violation;
- counterfeit/authenticity issue;
- packaging safety issue;
- data or claim error;
- cyber compromise of serialized identities.

### 246.2 Incident scope resolution

```text
Material Lot
→ Production Batch
→ SKU / Serialized Items
→ Shipment / Container
→ Retailer / Location
→ Sale / Customer where legally permitted
```

The system must support batch-level and serialized scope. When identification is only class-level, uncertainty must be shown rather than hidden.

### 246.3 Recall lifecycle

```text
SIGNAL
→ TRIAGE
→ INVESTIGATION
→ SCOPE_CONFIRMED
→ DECISION
→ NOTIFICATION
→ QUARANTINE / STOP_SALE
→ RECOVERY
→ DISPOSITION
→ REGULATORY_CLOSE
→ ROOT_CAUSE / CAPA
→ CLOSED
```

### 246.4 Recall actions

- stop sale by channel/location;
- block replenishment and order release;
- quarantine warehouse and store stock;
- notify retailers, suppliers and logistics partners;
- consumer communication where required;
- generate item/location target lists;
- receive acknowledgement;
- track recovered, sold, consumed, destroyed and unresolved units;
- create return labels and reverse logistics;
- issue refund/credit;
- create supplier recovery claim;
- update DPP and serialized item status;
- preserve regulatory evidence.

### 246.5 Recall effectiveness

```text
Recovery Rate
= Recovered Affected Units / Recoverable Affected Units

Notification Coverage
= Acknowledged Target Parties / Total Target Parties

Time to Containment
= First Effective Stop Action - Incident Confirmed At

Traceability Completeness
= Units with Resolved Location / Affected Units
```

### 246.6 Mock recall

Syntha must support scheduled simulations without triggering real customer communications or stock blocks. Results must expose missing events, unresponsive partners, unresolved inventory and time-to-scope.

---

## 247. GS1 EPCIS-compatible event model

### 247.1 Event dimensions

Every traceability event answers:

- **What** object, lot, logistic unit or serialized item;
- **When** event and record time;
- **Where** read point and business location;
- **Why** business step and disposition;
- **How** sensor or condition data where relevant.

### 247.2 Event types

- object event;
- aggregation event;
- transformation event;
- transaction event;
- association event.

Fashion examples:

- material batch commissioned;
- fabric rolls aggregated on pallet;
- material lots transformed into garment batch;
- cartons linked to ASN/PO;
- serialized item received in store;
- item sold, returned, repaired, resold or recycled.

### 247.3 Correction rule

Historical traceability events are append-only. A correction must create a subsequent corrective event referencing the original; it must not silently delete physical history.

### 247.4 Interoperability identifiers

- GTIN;
- GLN;
- SSCC;
- lot/batch;
- serial/EPC;
- GDTI/document identifiers;
- internal IDs with explicit mapping.

---

## 248. Centric-inspired material roll-up and material sourcing

### 248.1 Reference capability

The user-provided Centric materials describe:

- material usage across product lines and seasons;
- aggregation to avoid under/over-purchase;
- material data sheets;
- lap dip/bulk dip/color assignments;
- seasonal material roll-up;
- material RFQ independent of styles;
- material-process tracking in calendars;
- supplier-quoted item-level costs and supplier portal collaboration.

### 248.2 SYNTHA TARGET — Material Demand Control Tower

```text
Approved BOM Demand
+ Forecast / Intent Demand
+ Sample Demand
+ Safety and Waste Allowance
- Available Material Stock
- Reserved Stock
- Valid Supplier Commitments
= Net Material Requirement
```

Views:

- material × color × supplier × season;
- raw requirement versus yield-adjusted requirement;
- confirmed versus at-risk demand;
- deadstock and reuse opportunities;
- shared material impact across multiple styles;
- minimum dye lot and MOQ gaps;
- late material effect on styles and orders;
- material price exposure by currency.

### 248.3 Material RFQ independent of style

The sourcing team can negotiate strategic material capacity before final style allocation.

`MaterialRFQ` includes:

- material specification/version;
- forecast volume bands;
- colors and testing requirements;
- delivery windows;
- supplier capacity;
- MOQ and minimum dye lot;
- sample/production price;
- lead time;
- payment and incoterms;
- validity;
- certification and traceability requirements;
- reservation fee;
- price-index linkage.

### 248.4 Material reservation ledger

Reservations must distinguish:

- forecast reservation;
- paid capacity reservation;
- physical stock allocation;
- supplier soft commitment;
- PO-backed hard commitment;
- released or expired reservation.

---

## 249. Mobile Capture and Fit Review

### 249.1 Mobile Capture

Based on the user-provided Centric reference, Syntha needs a native/mobile-web capture workflow for teams away from desks.

Capabilities:

- search or scan style/material/sample/item;
- capture photo/video;
- crop and annotate;
- identify color card or scale reference;
- record location, device time and user;
- attach directly to canonical entity;
- offline queue with encrypted storage;
- duplicate detection;
- upload quality and resolution rules;
- consent/privacy controls for people in images.

### 249.2 Fit Review app

- open assigned sample evaluation;
- display target, tolerance, previous actual and proposed revision;
- enter actual measurements;
- voice/text notes;
- photo annotation by point of measure;
- approve/reject/request revision;
- create measurement-chart proposal;
- publish background sync;
- retain draft offline;
- capture reviewer, date, sample unit and version.

### 249.3 Guardrails

- mobile review cannot overwrite approved measurement chart without workflow;
- offline edits require conflict resolution;
- unit of measure must be explicit;
- values outside plausible limits require confirmation;
- every published value references sample version and physical unit.

---

## 250. Live Visual Operating Boards

### 250.1 Beyond static moodboards

The user-provided Centric reference describes visual boards connected to PLM, ERP and PIM data, with visual assortment slicing and go-to-market outputs. Syntha should implement a governed, real-time visual workspace rather than image-only boards.

### 250.2 Board modes

- concept and inspiration;
- color/material direction;
- line architecture;
- assortment by delivery/channel/door;
- sample review;
- market appointment;
- range review;
- pricing and margin review;
- launch readiness;
- issue war room.

### 250.3 Data-bound objects

A visual card is a projection of a canonical entity, not a copied image.

It can show:

- style/colorway/SKU;
- placeholder/SMU;
- target and actual metrics;
- readiness;
- cost and margin with permission;
- order intent;
- sample status;
- delivery risk;
- inventory/sell-through;
- comments and decisions.

### 250.4 Board snapshots

- live mode for current data;
- frozen review snapshot;
- approved assortment baseline;
- presentation/public export projection;
- difference view between snapshots.

### 250.5 Go-to-market generation

From an approved board Syntha can generate:

- linesheet;
- showroom chapter;
- buyer presentation;
- PPT/PDF export;
- retailer-specific assortment proposal;
- product-content request;
- order-intent draft;
- launch task plan.

Generated output must retain source version and permissions.

---

## 251. Product and collection readiness score

The Omnidata reference structures PLM across planning, product design, supplier/production and order management, including BOM, BOL, measurement charts, samples, tech packs, supplier quotation, production status, delivery and QC. Syntha should convert this into a measurable readiness framework.

### 251.1 Readiness domains

```text
Design Readiness
Technical Readiness
Material Readiness
Cost Readiness
Sample and Fit Readiness
Compliance Readiness
Commercial Content Readiness
Wholesale Readiness
Production Readiness
Channel Readiness
```

### 251.2 Rule examples

- approved colorway but unapproved material color → blocked;
- wholesale price exists but cost version expired → warning/block by policy;
- tech pack generated from superseded BOM → blocked;
- order intent references unavailable size range → blocked;
- shipment planned before final inspection → exception;
- sustainability claim lacks current evidence → blocked from publication;
- product image missing for retailer-required angle → channel not ready.

### 251.3 Score versus gate

A score summarizes completeness. A gate decides whether an action is permitted. A high average score cannot override one critical missing compliance requirement.

---

## 252. Unified exception and commitment workbench

Operators need one queue for mismatches across forecasts, contracts, inventory and finance.

Exception categories:

- forecast/commit mismatch;
- capacity/material shortage;
- contract obligation overdue;
- consignment discrepancy;
- rebate accrual anomaly;
- invoice network rejection;
- recall acknowledgement overdue;
- traceability gap;
- product readiness failure;
- partner data SLA breach.

Workspace fields:

- severity and financial exposure;
- affected entities;
- root data facts;
- policy or contract rule;
- owner and due date;
- proposed actions;
- human decision;
- evidence;
- resolution;
- recurrence detection.

AI may summarize and rank exceptions but cannot fabricate missing facts or close an exception without permitted evidence.

---

## 253. New canonical entities

```text
ForecastProgram
ForecastCycle
ForecastVersion
ForecastSeries
ForecastBucket
PartnerCommitment
CommitmentException
JointBusinessPlan
BusinessReviewSnapshot
ConsignmentAgreement
ConsignedInventoryBalance
InventoryOwnershipRecord
ConsumptionAdvice
ConsignmentDiscrepancy
VMIReplenishmentPolicy
VMIReplenishmentRequest
CommercialContract
ContractClause
StructuredCommercialTerm
ContractAmendment
ContractObligation
ObligationFulfillment
ObligationWaiver
CommercialProgram
CommercialProgramTier
ProgramEligibilityRule
CommercialAccrual
ProgramClaim
ProgramSettlement
EInvoiceComplianceProfile
EInvoiceSubmission
FiscalAcknowledgement
ProductIncident
RecallCase
RecallScope
RecallTarget
RecallAction
RecallAcknowledgement
RecallRecovery
MockRecall
EPCISEvent
MaterialDemandSnapshot
MaterialRFQ
MaterialQuote
MaterialReservation
MobileCaptureAsset
FitReviewSession
VisualOperatingBoard
BoardSnapshot
ReadinessGate
CommitmentExceptionCase
```

---

## 254. New routes

```text
/collaboration/forecasts
/collaboration/forecasts/:forecastId
/collaboration/commitments
/collaboration/exceptions
/relationships/:relationshipId/joint-plan
/relationships/:relationshipId/business-reviews
/inventory/consignment
/inventory/consignment/agreements
/inventory/vmi
/contracts
/contracts/:contractId
/contracts/:contractId/obligations
/commercial-programs
/commercial-programs/:programId/accruals
/commercial-programs/:programId/claims
/finance/e-invoicing
/finance/e-invoicing/compliance-profiles
/quality/incidents
/quality/recalls
/quality/recalls/:recallId
/traceability/events
/materials/demand-control-tower
/materials/rfq
/mobile/capture
/mobile/fit-review
/boards
/readiness/control-tower
/exceptions/commitments
```

---

## 255. New API outline

```text
POST   /api/v1/forecast-programs
POST   /api/v1/forecast-versions/:id/publish
POST   /api/v1/partner-commitments
POST   /api/v1/partner-commitments/:id/respond
POST   /api/v1/commitment-exceptions/:id/resolve
POST   /api/v1/joint-business-plans
POST   /api/v1/business-reviews/:id/freeze
POST   /api/v1/consignment-agreements
POST   /api/v1/consumption-advices
POST   /api/v1/vmi-replenishment-requests
POST   /api/v1/contracts
POST   /api/v1/contracts/:id/compile-terms
POST   /api/v1/obligations/:id/submit-evidence
POST   /api/v1/commercial-programs
POST   /api/v1/commercial-programs/:id/calculate-accruals
POST   /api/v1/program-claims
POST   /api/v1/e-invoices/:id/submit
POST   /api/v1/e-invoices/:id/correct
POST   /api/v1/product-incidents
POST   /api/v1/recalls/:id/confirm-scope
POST   /api/v1/recalls/:id/activate
POST   /api/v1/recalls/:id/run-mock
POST   /api/v1/epcis/events
GET    /api/v1/epcis/events/query
POST   /api/v1/material-rfqs
POST   /api/v1/material-reservations
POST   /api/v1/mobile-captures
POST   /api/v1/fit-reviews/:id/publish
POST   /api/v1/boards/:id/freeze
GET    /api/v1/readiness/:entityType/:entityId
```

All mutations require tenant context, permission, idempotency where applicable and audit metadata.

---

## 256. New domain events

```text
forecast_version_published
partner_commitment_submitted
partner_commitment_revised
commitment_exception_opened
commitment_exception_resolved
joint_business_plan_approved
business_review_snapshot_frozen
consignment_stock_received
consigned_inventory_consumed
consumption_advice_issued
consignment_discrepancy_opened
vmi_replenishment_requested
contract_signed
contract_term_compiled
contract_amended
obligation_due
obligation_fulfilled
obligation_breached
commercial_accrual_calculated
program_claim_submitted
program_claim_settled
einvoice_submitted
einvoice_fiscally_accepted
einvoice_rejected
product_incident_opened
recall_scope_confirmed
recall_activated
recall_target_acknowledged
recall_unit_recovered
mock_recall_completed
epcis_event_captured
material_demand_snapshot_certified
material_reservation_created
mobile_capture_uploaded
fit_review_published
board_snapshot_frozen
readiness_gate_failed
```

---

## 257. UAT scenarios for version 3.0

1. Retailer publishes a forecast; brand sees only shared dimensions and not internal OTB.
2. Supplier partially commits due to capacity and proposes a later delivery.
3. Buyer accepts only part of the counterproposal; agreed version remains immutable.
4. Buying intent converts to PO without double-counting forecast consumption.
5. Forecast revision above tolerance opens an exception.
6. Joint business review freezes metrics while later data corrections remain visible separately.
7. VMI supplier proposes replenishment above retailer exposure ceiling; request is blocked.
8. Consigned stock is received without ownership transfer.
9. POS sale creates consumption advice and later supplier invoice.
10. Physical count exposes consignment shrink and opens discrepancy.
11. Agreement terminates with residual consigned stock; disposition workflow is required.
12. Signed exclusivity term blocks conflicting retailer/product assignment.
13. Contract amendment changes delivery SLA only for future orders.
14. Obligation evidence is rejected and due date remains open.
15. AI extracts an obligation but human review is required before activation.
16. Volume rebate crosses a tier; accrual recalculates with versioned basis.
17. Return posted after period close creates a rebate reversal in next period.
18. Marketing-fund claim exceeds available earned balance.
19. Partner disputes excluded sales and sees exact eligibility-rule reason.
20. Structured invoice passes business validation but fails network syntax validation.
21. Fiscal acknowledgement is received but buyer later rejects quantity mismatch.
22. Correction creates credit/debit document rather than editing issued invoice.
23. Product incident traces one material lot into multiple production batches.
24. Recall stop-sale reaches warehouse and stores; acknowledgements are monitored.
25. Serialized and non-serialized recall scope show different confidence.
26. Mock recall identifies a retailer feed gap without sending real notification.
27. Incorrect EPCIS event is corrected by append-only corrective event.
28. Material roll-up detects MOQ gap across styles and suggests consolidation.
29. Material reservation expires and releases demand back to sourcing.
30. Mobile capture uploads after offline period and detects a newer conflicting asset.
31. Fit review cannot overwrite approved chart without change request.
32. Frozen visual board retains old prices while live board shows current values.
33. Board export hides cost/margin for external buyer role.
34. Readiness score is high but critical compliance gate blocks publish.
35. Commitment workbench groups repeated supplier short-commit exceptions.
36. Cross-tenant contract, forecast and recall data remain isolated.

---

## 258. Updated competitive gap matrix

| Capability | Benchmark | JOOR evidence status | Syntha target | Priority |
|---|---|---|---|---|
| Forecast sharing and supplier commits | Oracle SCC | NOT CONFIRMED | Versioned collaborative forecast network | P1 |
| Joint business planning | Enterprise retail practice | NOT CONFIRMED | Shared plan with private data layers | P1 |
| VMI replenishment | Oracle | NOT CONFIRMED | Supplier proposals with retailer policy control | P1 |
| Consignment ownership and pay-on-use | Oracle | NOT CONFIRMED | Ownership ledger + consumption settlement | P1 |
| Contract lifecycle management | Icertis | NOT CONFIRMED | Contract hierarchy, clauses and amendments | P1 |
| Contract obligations | Icertis | NOT CONFIRMED | Obligation evidence, breach and remediation | P1 |
| Rebate and allowance management | Vistex | NOT CONFIRMED | Program, accrual, claim and settlement engine | P1 |
| Net-net margin | Vistex / enterprise practice | NOT CONFIRMED | Full commercial waterfall | P1 |
| Interoperable e-invoicing | OpenPeppol | NOT CONFIRMED | Canonical invoice + country/network adapters | P1 |
| Recall and event traceability | GS1 EPCIS | NOT CONFIRMED | Batch/serial recall control tower | P1 |
| Material seasonal roll-up | Centric reference | NOT CONFIRMED | Net material requirement and consolidation | P1 |
| Material RFQ independent of style | Centric reference | NOT CONFIRMED | Strategic material sourcing and reservation | P2 |
| Mobile product/material capture | Centric reference | NOT CONFIRMED | Offline governed capture | P2 |
| Mobile fit review | Centric reference | NOT CONFIRMED | Sample measurement and review app | P2 |
| Live data-bound visual boards | Centric reference | PARTIAL/GATED | Governed real-time operating boards | P1 |
| Cross-domain readiness gates | Omnidata/Centric reference | NOT CONFIRMED | Product/collection readiness control tower | P0 |

---

## 259. Updated delivery priorities

### P0 — transactional and readiness foundation

1. Canonical relationship/agreement IDs.
2. Readiness gates connected to product, content, order and shipment.
3. Append-only audit/event model.
4. Inventory ownership fields.
5. Canonical invoice and correction model.

### P1 — relationship and commercial operations

1. Collaborative forecasts and partner commitments.
2. Joint Business Plan and business-review snapshots.
3. VMI/consignment agreement and consumption advice.
4. Contract lifecycle and obligation management.
5. Commercial program, accrual and claim engine.
6. Net-net profitability.
7. Structured e-invoice adapters.
8. Product incident and recall control tower.
9. Material demand control tower.
10. Live data-bound visual boards.

### P2 — field execution and optimization

1. Material RFQ and capacity reservations.
2. Mobile Capture.
3. Mobile Fit Review.
4. Mock recall automation.
5. Forecast and commitment optimization.
6. Automated contract-term compilation with human review.

### P3 — network intelligence

1. Cross-partner forecast benchmarking with privacy controls.
2. Relationship health scoring.
3. Rebate leakage detection.
4. Recall propagation simulation.
5. Supplier commitment-risk prediction.
6. Autonomous recommendations that remain approval-bound.

---

## 260. Official and reference source register for version 3.0

### Public official sources

- Oracle Supply Chain Collaboration: https://www.oracle.com/scm/supply-chain-planning/supply-chain-collaboration/
- Oracle Consigned Inventory: https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25d/faims/consigned-inventory.html
- Oracle Vendor-Managed Inventory: https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25c/faims/overview-of-vendor-managed-inventory.html
- Icertis Contract Lifecycle Management: https://www.icertis.com/learn/what-is-contract-lifecycle-management/
- Vistex Rebates and Reimbursements: https://www.vistex.com/solutions/sap-margin-optimization-solutions/rebates-reimbursements/
- OpenPeppol: https://peppol.org/about/
- GS1 EPCIS and CBV: https://www.gs1.org/standards/epcis
- GS1 Global Traceability Standard: https://www.gs1.org/standards/gs1-global-traceability-standard/current-standard

### User-provided reference sources

- `Omnidata.PLM Fashion 2026-сжатый(1).pdf`
- `Centric Software x Mercury - Offer.pdf`

The user-provided files are reference material and may contain vendor claims, confidential/commercial details or dated statements. Syntha product requirements derived from them must be validated independently before procurement or public competitive claims.

---

## 261. Version 3.0 product decision

Syntha must not stop at connecting a buyer to a brand and converting a linesheet into an order. The platform must manage the economic and operational commitments that determine whether the relationship is actually profitable and reliable.

Final operating model:

```text
Plan Together
→ Commit Explicitly
→ Contract and Govern
→ Source and Reserve
→ Order / Consign / Replenish
→ Trace and Fulfill
→ Invoice and Settle
→ Measure Obligations and Net-Net Margin
→ Resolve Incidents and Recover Value
→ Improve the Next Plan
```

The decisive advantage over a conventional B2B wholesale portal is not the number of screens. It is the preservation of one explainable chain from intention and contract to physical event, financial outcome and partner accountability.

## 262. Version 3.1 scope — intelligent execution architecture beyond JOOR

### 262.1 Evidence boundary

Version 3.1 adds capabilities confirmed in current official NuORDER materials and in adjacent product, specification-management, material-sourcing and retail-planning benchmarks. It does not state that a capability is absent from all JOOR editions unless directly verified.

Status convention remains mandatory:

- `JOOR OBSERVED` — visible in the audited Retailer / LITE account;
- `JOOR GATED / UAT` — visible but not testable, or requiring another role/tier;
- `JOOR NOT CONFIRMED` — not confirmed in the audited account and public evidence used for this document;
- `SYNTHA TARGET` — proposed product requirement;
- `DECISION` — architecture or governance decision;
- `UAT` — controlled validation is required.

### 262.2 Product direction

Syntha must evolve from a collection of modules into three connected planes:

```text
SYSTEM OF RECORD
Product, partner, commercial, operational and financial truth

DECISION PLANE
Planning, scenarios, recommendations, approvals and explanations

EXECUTION PLANE
Orders, commitments, production, fulfillment, payments and exceptions
```

A recommendation that cannot be traced to certified source data must not become an executable transaction.

---

## 263. NuORDER June 2026 delta — commercial cockpit and navigation model

### 263.1 COMPETITOR CONFIRMED

NuORDER’s June 2026 brand update confirms:

- a Sales overview for brand users with reporting access;
- sales, orders, units and buying-company metrics for submitted orders;
- sales trends over time;
- breakdown by order status;
- comparison of Immediate and Prebook order types;
- top companies and top sales representatives;
- date filters and currency selection;
- enhanced payments and updated buyer invitation workflow;
- revised product navigation.

NuORDER also confirms that retailer profiles consolidate company information, locations, buyers and organization-level order visibility, while assortment rollups can contain financial targets and saved views.

### 263.2 JOOR evidence status

The audited JOOR account included order and reporting surfaces, but the following were not confirmed as one governed operating model:

- certified semantic definitions shared across dashboards, exports and APIs;
- organization-wide sales cockpit with metric lineage;
- merchant-level reporting views governed by role and data ownership;
- invitation lifecycle linked to organization identity and historical transactions;
- direct traceability from a dashboard number to the order versions that produced it.

Status: `JOOR PARTIAL / NOT CONFIRMED / UAT`.

### 263.3 SYNTHA TARGET — Commercial Performance Cockpit

The cockpit must provide:

- gross submitted order value;
- approved value;
- confirmed value;
- shipped value;
- invoiced value;
- paid value;
- cancelled value;
- returned and credited value;
- units by corresponding state;
- active buying companies;
- new versus returning companies;
- sales-rep contribution;
- direct, agent and marketplace channels;
- Immediate, Prebook, replenishment, customization and dropship order types;
- season, collection, drop, delivery and territory views;
- average order value;
- order conversion and confirmation time;
- fill rate and on-time delivery;
- net-net revenue and contribution margin where authorized.

Every card must support drill-down:

```text
Metric
→ Certified Definition
→ Filter Context
→ Included Transactions
→ Excluded Transactions
→ Source Events
→ Export / API Result
```

---

## 264. Certified commercial metric layer

### 264.1 Metric definition contract

Every production KPI requires:

- metric ID and human-readable name;
- business definition;
- grain;
- numerator and denominator;
- included and excluded states;
- event-time versus processing-time rule;
- currency conversion policy;
- timezone and fiscal-calendar policy;
- treatment of amendments, cancellations and returns;
- owner and approver;
- effective date;
- version;
- lineage to tables/events;
- data-quality threshold;
- certification state.

### 264.2 Revenue-state separation

The following values must never be collapsed into one generic `sales` number:

```text
Proposed
Submitted
Approved
Confirmed
Allocated
Shipped
Invoiced
Paid
Recognized
Net after returns / rebates / claims
```

### 264.3 Currency views

Support:

- transaction currency;
- brand reporting currency;
- retailer reporting currency;
- group consolidation currency;
- constant-currency comparison;
- contractual FX;
- accounting FX;
- budget FX.

Historical metric snapshots remain reproducible after FX tables or business rules change.

### 264.4 Dashboard trust indicator

Each metric displays:

- freshness;
- coverage;
- reconciliation state;
- known exclusions;
- last certified time;
- responsible data owner.

A number with incomplete data must be visibly marked rather than silently shown as final.

---

## 265. Assortment Constraints Compiler

### 265.1 COMPETITOR CONFIRMED

NuORDER Assortments supports per-product allocation constraints, including multiples and minimum/maximum limits, applied while allocating units across products, locations and deliveries.

### 265.2 SYNTHA TARGET

Syntha must generalize this into a governed constraints compiler covering:

- style, color, size and SKU;
- product group and category;
- brand and supplier;
- door, cluster, region, channel and climate;
- delivery and launch wave;
- order type;
- customer group;
- inventory ownership model;
- commercial agreement;
- capacity and material limits.

Constraint types:

- minimum;
- maximum;
- multiple-of;
- pack ratio;
- case-pack and inner-pack;
- minimum presentation quantity;
- maximum option count;
- mandatory core-size coverage;
- prohibited combination;
- mutually exclusive products;
- at-least-one-of group;
- budget ceiling;
- margin floor;
- OTB ceiling;
- supplier MOQ/MOV;
- capacity ceiling;
- material availability ceiling;
- territory or channel restriction;
- launch-date restriction.

### 265.3 Inheritance and precedence

```text
Legal / Safety Rule
→ Signed Commercial Agreement
→ Enterprise Policy
→ Brand / Retailer Policy
→ Season / Assortment Rule
→ Product / Door Override
→ User Draft Preference
```

A lower-priority rule cannot silently override a legal or contractual rule.

### 265.4 Conflict handling

The compiler must:

1. detect conflicting constraints before allocation;
2. identify the exact rules and versions in conflict;
3. calculate the feasible range;
4. propose a least-violation alternative when allowed;
5. request approval for controlled exceptions;
6. preserve the selected resolution and reason.

### 265.5 Explainability

For every generated quantity, users can answer:

- why this quantity was selected;
- which constraints were binding;
- what quantity would have been selected without each constraint;
- which target was missed and by how much;
- who approved an exception.

---

## 266. Proposal → Intent → Order negotiation protocol

### 266.1 COMPETITOR CONFIRMED

NuORDER supports brand assortment proposals, retailer order intents, partial/filtered intent submission, quantity breakdown choices and persistent version history. NuORDER explicitly distinguishes an Order Intent from a Purchase Order.

### 266.2 SYNTHA TARGET

Use separate canonical objects:

```text
AssortmentProposal
BuyingIntent
CommercialCounterproposal
PurchaseOrder
OrderAmendment
```

### 266.3 AssortmentProposal

A brand proposal may include:

- recommended products and alternatives;
- recommended units by door/delivery;
- minimum viable launch package;
- expected wholesale and retail value;
- suggested size curves;
- production assumptions;
- capacity reservation expiry;
- availability confidence;
- marketing and exclusivity package;
- rationale and supporting evidence.

It must not write into the retailer’s private assortment without explicit acceptance.

### 266.4 BuyingIntent

A retailer intent includes:

- exact shared scope;
- totals-only or detailed breakdown;
- visible and hidden fields preview;
- validity period;
- confidence state;
- internal approval state;
- OTB reservation policy;
- privacy policy;
- version and superseded versions.

### 266.5 Counterproposal

Structured counter fields:

- requested quantity versus confirmed capacity;
- requested versus proposed delivery;
- requested versus proposed price;
- MOQ/MOV exception;
- alternative color, material or factory;
- split delivery;
- payment/deposit change;
- exclusivity condition;
- reason and evidence;
- expiry.

### 266.6 Conversion control

When converting intent to PO:

- freeze the accepted commercial snapshot;
- consume only the approved intent version;
- prevent double conversion;
- release unused OTB reservation;
- preserve unconverted remainder;
- create a clear intent-to-order bridge;
- require a formal amendment for later change.

---

## 267. Retailer organization, buyer invitation and delegated administration

### 267.1 Organization hierarchy

```text
Group
→ Legal Entity
→ Retailer Banner
→ Business Unit
→ Location / Door
→ Department / Cost Center
→ Buyer Team
```

A user may belong to multiple organizations with different roles and data scopes.

### 267.2 Invitation lifecycle

```text
DRAFT
→ SENT
→ DELIVERED
→ OPENED
→ IDENTITY_VERIFIED
→ ORGANIZATION_MATCHED
→ ROLE_APPROVED
→ ACTIVE
```

Additional states:

```text
EXPIRED
REVOKED
DOMAIN_MISMATCH
DUPLICATE_IDENTITY
MANUAL_REVIEW
OFFBOARDED
```

### 267.3 Required controls

- verified domain or controlled exception;
- existing-contact and duplicate-user detection;
- organization-match review;
- least-privilege role template;
- invitation expiry;
- re-authentication for elevated access;
- delegated administrator approval;
- automatic removal from confidential workspaces on offboarding;
- preservation of authored orders, comments and approvals after user departure;
- transfer of open tasks and approvals;
- audit of every membership change.

### 267.4 External collaboration

Guests receive:

- time-limited access;
- object-level scope;
- restricted download/export;
- watermarking where appropriate;
- no visibility into internal margins, OTB or supplier cost;
- explicit data-use notice.

---

## 268. Payment orchestration by delivery, shipment and obligation

### 268.1 COMPETITOR CONFIRMED

NuORDER supports full and partial payment, pre-authorization, saved-card flows and checkout that may split payment by delivery. Its payment documentation also covers invoices, ACH, processor configurations and automatic transactions.

### 268.2 SYNTHA TARGET

Payment plans can be based on:

- order submission;
- brand confirmation;
- capacity reservation;
- production start;
- sample approval;
- shipment;
- delivery;
- acceptance;
- invoice due date;
- sell-through for consignment;
- milestone or calendar date.

### 268.3 PaymentAllocation

A payment or authorization may allocate to:

- order;
- delivery group;
- shipment;
- invoice;
- invoice line;
- deposit obligation;
- fee;
- tax;
- dispute reserve.

### 268.4 Authorization and capture controls

- authorization amount and expiry;
- incremental authorization;
- partial capture;
- multi-capture;
- void;
- refund and partial refund;
- failed capture recovery;
- shipment-before-capture rule;
- currency and processor restrictions;
- SCA/3DS and regional authentication;
- risk review;
- idempotent payment commands.

### 268.5 Financial separation

```text
Order Commercial State
Payment Authorization State
Payment Capture State
Invoice State
Settlement State
Seller Payout State
```

No state is inferred solely from another.

---

## 269. Spec-first Product DNA Graph

### 269.1 Benchmark

Specright describes specification management as centralized, structured and interconnected product, packaging and manufacturing requirements. Its many-to-many model links specifications so downstream impact becomes visible when one element changes.

### 269.2 JOOR evidence status

Structured product-specification graphs, packaging engineering, manufacturing-spec relationships and automated downstream impact analysis were not confirmed in the audited JOOR cabinet.

Status: `JOOR NOT CONFIRMED / UAT`.

### 269.3 SYNTHA TARGET

Canonical specification graph:

```text
Product Requirement
├── Style Specification
├── Colorway Specification
├── SKU Specification
├── Material Specification
├── Trim Specification
├── Packaging Specification
├── Label / Artwork Specification
├── Measurement Specification
├── Construction / Operation Specification
├── Test Specification
├── Quality Specification
├── Manufacturing Specification
└── Channel / Retailer Specification
```

### 269.4 Specification contract

Every specification requires:

- immutable specification ID;
- specification type;
- owner;
- structured attributes;
- units of measure;
- permitted values and tolerances;
- applicability scope;
- effective dates;
- lifecycle state;
- version;
- superseded version;
- source and evidence;
- approval policy;
- linked suppliers/facilities;
- linked products/components;
- confidentiality level;
- external projection rules.

### 269.5 Many-to-many relationships

A material can be used by many styles; a style can use many material variants; a packaging component can serve many SKUs; a retailer requirement can apply to many categories and markets.

The graph must support reverse queries:

```text
Where Used?
What Depends On This?
Which Orders Use This Version?
Which Markets or Claims Are Affected?
Which Suppliers Received It?
```

---

## 270. Specification change impact and controlled release

### 270.1 Change lifecycle

```text
CHANGE_REQUESTED
→ IMPACT_ANALYSIS
→ TECHNICAL_REVIEW
→ COMMERCIAL_REVIEW
→ SUPPLIER_REVIEW
→ APPROVED
→ RELEASE_SCHEDULED
→ RELEASED
→ ACKNOWLEDGED
→ EFFECTIVE
```

Alternative states:

```text
REJECTED
CANCELLED
EMERGENCY_RELEASE
ROLLED_BACK
PARTIALLY_ACKNOWLEDGED
```

### 270.2 Impact analysis dimensions

- affected styles, colorways and SKUs;
- open samples;
- approved samples;
- BOM and material commitments;
- open RFQs and quotations;
- production orders;
- work in progress;
- packaging and artwork;
- test reports;
- compliance claims;
- retailer content packages;
- open wholesale orders;
- shipments and inventory;
- DPP records;
- costing and margin;
- launch dates.

### 270.3 Change classification

- editorial/non-functional;
- commercial-content change;
- technical-compatible change;
- fit or measurement change;
- material substitution;
- cost-impacting change;
- regulatory change;
- safety-critical change;
- breaking change.

### 270.4 Release packet

A release packet contains:

- approved specification versions;
- change summary;
- affected object list;
- effective date;
- disposition for WIP and existing stock;
- supplier instructions;
- retailer/channel deltas;
- required acknowledgements;
- rollback instructions.

Silent replacement of an approved specification is forbidden.

---

## 271. Packaging and labeling engineering

### 271.1 Scope

Packaging must be modeled as product engineering, not as a free-text field in a tech pack.

Entities:

```text
PackagingSystem
PackagingComponent
PackagingSpecification
PackagingBOM
PackConfiguration
LabelSpecification
ArtworkVersion
CartonConfiguration
PalletConfiguration
RetailerPackagingRequirement
PackagingComplianceAssessment
```

### 271.2 Packaging data

- primary, secondary and tertiary packaging;
- component material and composition;
- dimensions and tolerances;
- weight;
- recycled content;
- color and print process;
- finish;
- artwork and dieline;
- barcode and placement;
- care, fiber, country-of-origin and legal labels;
- unit/inner/master carton;
- pack ratio;
- carton cube;
- pallet pattern;
- hazardous or special handling;
- supplier and facility;
- test and approval status;
- cost and lead time;
- recyclability and reporting attributes.

### 271.3 Retailer requirement compiler

A retailer-specific requirement may control:

- barcode type and placement;
- price-ticket format;
- hanger and polybag;
- carton dimensions and weight;
- carton-content rules;
- ASN linkage;
- routing label;
- sustainability fields;
- language and market markings;
- testing and evidence.

Product readiness remains blocked until the relevant packaging projection passes validation.

### 271.4 Packaging optimization

Scenario comparison includes:

- component cost;
- freight cube;
- warehouse handling;
- damage risk;
- compliance;
- recycled content;
- waste;
- consumer experience;
- store preparation time.

---

## 272. Digital material marketplace and material twin

### 272.1 Benchmark

Material Exchange describes a B2B fashion sourcing platform connecting brands and suppliers, including sourcing, scanning and sample ordering. Swatchbook describes digital material sourcing and management, color ranges, visualization and 3D assets.

### 272.2 SYNTHA TARGET

Material discovery must support:

- supplier catalog browsing;
- natural-language and attribute search;
- image/swatch similarity;
- composition;
- construction;
- weight, density and thickness;
- stretch and recovery;
- hand feel and performance tags;
- certifications and claim evidence;
- MOQ, lead time and price bands;
- country/facility;
- available colors;
- sample availability;
- digital-twin availability;
- permitted end uses;
- historical quality and delivery performance.

### 272.3 MaterialTwin

A material twin contains:

- canonical material identity;
- supplier material identity;
- physical specification;
- color and spectral data where available;
- high-resolution imagery;
- repeat/tile data;
- 3D material files and render settings;
- drape/stretch parameters;
- scan method and quality grade;
- digital rights and usage license;
- physical swatch references;
- approved status by brand and product type;
- linked tests, certificates and lots.

### 272.4 Sample request flow

```text
Material Shortlist
→ Digital Review
→ Sample Request
→ Supplier Confirmation
→ Dispatch
→ Receipt
→ Evaluation
→ Test
→ Approved / Conditional / Rejected
→ BOM Use
```

Digital similarity cannot substitute for physical or laboratory approval when a policy requires it.

---

## 273. Material qualification and substitution engine

### 273.1 Qualification scope

Qualification is specific to:

- product category;
- end use;
- market;
- color/process;
- supplier facility;
- test method;
- production technique;
- effective period.

A material approved for lining is not automatically approved for shell use.

### 273.2 Substitute classes

- exact approved alternate;
- approved equivalent with no commercial impact;
- conditional substitute requiring fit/sample review;
- visual substitute requiring color approval;
- compliance-impacting substitute;
- emergency substitute;
- prohibited substitute.

### 273.3 Substitution decision packet

- source material and candidate;
- specification delta;
- cost delta;
- lead-time delta;
- MOQ impact;
- color impact;
- fit/drape impact;
- test coverage;
- sustainability/claim impact;
- supplier/facility risk;
- affected BOMs, orders and commitments;
- required approvals;
- expiry and rollback.

### 273.4 Automated suggestions

AI may rank candidates, but the system must:

- expose feature-level similarity;
- identify missing evidence;
- exclude policy-ineligible candidates;
- never label a candidate `approved` without the required human/test workflow.

---

## 274. Governed Workflow and Policy Studio

### 274.1 Purpose

Enterprise customers require configurable processes, but uncontrolled no-code customization creates untestable systems. Syntha needs configuration with software-grade governance.

### 274.2 Workflow definitions

A workflow template defines:

- object type;
- states;
- transitions;
- role permissions;
- entry/exit criteria;
- required fields;
- validations;
- approvals;
- timers and SLAs;
- escalation;
- notifications;
- commands and side effects;
- integrations;
- exception paths;
- rollback policy.

### 274.3 Policy rules

Policy scopes:

- tenant;
- legal entity;
- brand;
- retailer;
- supplier;
- market;
- category;
- season;
- channel;
- commercial agreement;
- object instance.

### 274.4 Governance lifecycle

```text
DRAFT
→ VALIDATED
→ TESTED
→ APPROVED
→ SCHEDULED
→ ACTIVE
→ DEPRECATED
→ RETIRED
```

### 274.5 Required controls

- version control;
- diff preview;
- dependency analysis;
- test cases;
- sandbox simulation;
- sample-data replay;
- approval by business and technical owners;
- future effective date;
- rollback;
- audit;
- migration plan for objects already in progress.

### 274.6 Rule explanation

Every blocked action must return:

- rule ID/version;
- business explanation;
- failed condition;
- data used;
- remediation;
- override eligibility and approver.

---

## 275. Intelligent Execution and Agentic Planning architecture

### 275.1 Decision

AI agents are assistants operating through controlled tools. They are not privileged users and cannot bypass domain rules.

### 275.2 Agent types

- Buyer Planning Agent;
- Assortment Review Agent;
- Product Readiness Agent;
- Sourcing Agent;
- Material Alternative Agent;
- Costing Agent;
- Supplier Risk Agent;
- Production Exception Agent;
- Quality Root-Cause Agent;
- Content Readiness Agent;
- Replenishment Agent;
- Cash Collection Agent.

### 275.3 Agent execution contract

Every run includes:

- objective;
- authorized tenant and organization scope;
- acting user;
- permitted tools;
- read/write permissions;
- time and cost budget;
- model/version;
- input snapshot IDs;
- policy version;
- generated plan;
- tool calls;
- evidence citations;
- confidence and uncertainty;
- approvals required;
- final outcome.

### 275.4 Autonomy levels

```text
L0 — explain only
L1 — recommend
L2 — prepare draft
L3 — execute reversible low-risk action after policy checks
L4 — execute approved multi-step plan with checkpoints
```

Irreversible commercial, financial, legal, safety and external-publication actions remain human-approved.

### 275.5 DecisionPacket

An AI recommendation must be stored as a structured `DecisionPacket`:

- question/objective;
- options considered;
- constraints;
- evidence;
- assumptions;
- recommendation;
- expected impact;
- downside risk;
- uncertainty;
- required approval;
- expiry;
- later actual outcome.

This allows learning from decision quality rather than from acceptance clicks alone.

---

## 276. AI governance, evaluation and outcome learning

### 276.1 Agent registry

For every agent:

- owner;
- intended use;
- prohibited use;
- model/provider;
- training/grounding sources;
- tool scopes;
- data classification;
- evaluation set;
- risk tier;
- release version;
- rollback version;
- monitoring thresholds.

### 276.2 Evaluation dimensions

- factual grounding;
- calculation correctness;
- policy compliance;
- tenant isolation;
- permission compliance;
- explanation quality;
- recommendation uplift;
- false-positive and false-negative rate;
- user override rate;
- harmful-action prevention;
- latency and cost.

### 276.3 Offline and shadow evaluation

Before write access:

1. replay historical cases;
2. compare recommendation with actual outcomes;
3. run in shadow mode;
4. review disagreements;
5. approve a narrow action scope;
6. expand only after measured performance.

### 276.4 Outcome attribution

Store:

- recommendation accepted/rejected/modified;
- human reason;
- executed decision;
- later sell-through, margin, quality, delivery or cash outcome;
- external factors;
- whether the recommendation remained feasible at execution time.

### 276.5 Sensitive-data controls

Body data, payment data, personal buyer behavior and confidential supplier cost require separate data policies and cannot be used for cross-tenant training without explicit lawful authorization.

---

## 277. Fashion Knowledge Graph and semantic context

### 277.1 Graph purpose

The knowledge graph links business identity across systems:

```text
Concept
→ Style
→ Colorway
→ SKU
→ Material / Component
→ Supplier / Facility
→ Sample
→ Quote
→ BOM Version
→ Order / Production Batch
→ Shipment
→ Inventory Item
→ Sale / Return
→ Claim / Financial Outcome
```

### 277.2 Identity resolution

Support:

- canonical IDs;
- source-system IDs;
- brand and retailer aliases;
- GTIN/EAN/UPC;
- supplier codes;
- carry-over lineage;
- duplicate and merge candidates;
- split/merge history;
- confidence and provenance.

### 277.3 Semantic definitions

Business terms such as `available`, `confirmed`, `sell-through`, `gross margin`, `newness` and `on time` must have governed definitions by context.

### 277.4 Graph restrictions

A graph edge stores:

- relationship type;
- validity period;
- source;
- confidence;
- approved/declarative/observed state;
- confidentiality;
- tenant ownership.

Inferred relationships must never be displayed as verified facts.

---

## 278. Integration Control Plane

### 278.1 Integration methods

- REST/GraphQL APIs;
- webhooks;
- event streaming;
- EDI;
- SFTP/file drop;
- CSV/XLSX/XML/JSON;
- email/document ingestion where unavoidable;
- managed connectors;
- customer-built applications.

### 278.2 Canonical integration contract

Every integration declares:

- source and target system;
- business owner;
- technical owner;
- objects and fields;
- direction;
- frequency;
- source-of-truth rule;
- transformation/mapping version;
- identity strategy;
- idempotency strategy;
- SLA;
- security credentials;
- retry policy;
- reconciliation rule;
- retention;
- decommission plan.

### 278.3 Mapping Studio

Capabilities:

- source schema discovery;
- canonical-field mapping;
- lookup tables;
- units and currency conversion;
- taxonomy mapping;
- conditional transformations;
- validation preview;
- sample payload testing;
- versioned mappings;
- promotion from sandbox to production;
- rollback.

### 278.4 Activity Center

For every job/message:

- received time;
- source payload reference;
- parsed representation;
- validation result;
- transformation result;
- destination acknowledgement;
- retry count;
- final state;
- operator notes;
- linked business object.

### 278.5 Failure handling

```text
RECEIVED
→ VALIDATED
→ MAPPED
→ APPLIED
→ RECONCILED
```

Failure states:

```text
QUARANTINED
RETRY_SCHEDULED
DEAD_LETTER
MANUAL_REVIEW
PARTIALLY_APPLIED
REVERSED
```

Replaying a message must remain idempotent.

---

## 279. Data Quality and Observability Control Tower

### 279.1 Quality dimensions

- completeness;
- validity;
- uniqueness;
- consistency;
- timeliness;
- accuracy where verified;
- referential integrity;
- reconciliation;
- provenance;
- authorization.

### 279.2 DataQualityRule

Fields:

- object/field scope;
- condition;
- severity;
- blocking/non-blocking;
- owner;
- effective date;
- remediation;
- exception policy;
- certification impact.

### 279.3 DataQualityIssue lifecycle

```text
OPEN
→ ASSIGNED
→ INVESTIGATING
→ SOURCE_CORRECTION_PENDING
→ FIXED
→ REVALIDATED
→ CLOSED
```

Alternative states:

```text
ACCEPTED_RISK
WAIVED_UNTIL
DUPLICATE
NOT_REPRODUCIBLE
```

### 279.4 Data observability

Monitor:

- feed freshness;
- row/event volume anomalies;
- schema drift;
- mapping failure;
- duplicate rate;
- reconciliation variance;
- missing locations/dates;
- late-arriving data;
- lineage break;
- unusual access/export volume.

### 279.5 Business impact

Every issue must show affected:

- recommendations;
- reports;
- orders;
- replenishment;
- claims;
- financial statements;
- external content packages;
- AI agents.

Low-confidence source data reduces automation level automatically.

---

## 280. Extension platform and partner app ecosystem

### 280.1 Extension types

- connector;
- workflow action;
- validation rule;
- calculation function;
- report/dashboard;
- UI panel;
- product-card widget;
- document generator;
- AI tool;
- external application.

### 280.2 App manifest

- app ID/version;
- publisher;
- requested scopes;
- webhook subscriptions;
- UI locations;
- data residency;
- support contact;
- privacy terms;
- security review;
- billing model;
- compatibility range;
- deprecation policy.

### 280.3 Security model

- OAuth/service account;
- tenant administrator approval;
- least-privilege scopes;
- field-level restrictions;
- per-installation secrets;
- rate limits;
- signed webhooks;
- sandbox tenant;
- revocation;
- full audit.

### 280.4 Marketplace governance

Applications require:

- technical validation;
- security review;
- data-use review;
- business-function review;
- test scenarios;
- version compatibility;
- incident and support process.

An extension cannot alter canonical business history directly; it uses approved commands and APIs.

---

## 281. Enterprise trust architecture

### 281.1 Authorization

Combine:

- RBAC for job roles;
- ABAC for organization, territory, category, season and confidentiality;
- relationship-based access for brand-retailer-supplier connections;
- object-level sharing;
- field-level masking;
- purpose-based access for sensitive data.

### 281.2 Tenant isolation

Mandatory tests:

- direct-object access across tenants;
- search leakage;
- export leakage;
- cache leakage;
- analytics aggregate leakage;
- AI retrieval leakage;
- background-job leakage;
- support-session leakage.

### 281.3 Administrative controls

- SSO/SAML/OIDC;
- SCIM provisioning;
- MFA and step-up authentication;
- session and device policy;
- IP/network policy where required;
- delegated administration;
- break-glass account;
- privileged-access review;
- quarterly access certification.

### 281.4 Support access

Support impersonation requires:

- reason and ticket;
- customer approval where configured;
- time limit;
- visible banner;
- restricted actions;
- full session recording/audit;
- no hidden export.

### 281.5 Data residency and encryption

- region selection;
- encryption in transit and at rest;
- tenant-specific keys where required;
- key rotation;
- encrypted offline storage;
- controlled backups;
- verified deletion workflow.

---

## 282. Records, privacy, consent and confidential benchmark governance

### 282.1 Record classes

- contractual record;
- order/financial record;
- product and technical record;
- quality/safety record;
- personal data;
- operational log;
- analytics snapshot;
- temporary collaboration artifact.

### 282.2 Retention policy

Each class specifies:

- retention duration;
- legal hold behavior;
- archive format;
- deletion eligibility;
- anonymization policy;
- tenant export;
- evidence of deletion.

### 282.3 Consent and communication

Track consent separately for:

- marketing communication;
- transactional communication;
- engagement tracking;
- data sharing;
- AI use;
- benchmarking;
- external collaborator access.

### 282.4 Confidential source governance

Internal vendor offers, pricing and confidential presentations must not be copied into public product documentation. Their use is limited to capability benchmarking unless publication is explicitly authorized.

The public master map may retain generalized requirements but must exclude confidential commercial terms, named customer-sensitive details and proprietary screenshots.

---

## 283. Performance, scale and resilient collaboration

### 283.1 Scale targets

Design for:

- millions of SKUs;
- thousands of doors;
- hundreds of deliveries;
- large size/color matrices;
- multi-season rollups;
- high-volume POS/inventory events;
- large media and 3D assets;
- concurrent market appointments;
- long-running scenario calculations.

### 283.2 Grid and board performance

- server-side filtering/sorting/grouping;
- virtualized rows and columns;
- progressive aggregation;
- cached certified rollups;
- background export;
- partial loading;
- optimistic edits with conflict control;
- visible calculation state.

### 283.3 Offline resilience

For approved mobile/tablet workspaces:

- explicit download scope;
- encrypted local data;
- expiry;
- queued commands;
- version preconditions;
- conflict detection;
- reconnect preview;
- controlled merge;
- remote wipe where supported.

### 283.4 Degraded mode

If an external system is unavailable:

- display last successful snapshot and time;
- block actions requiring current confirmation;
- permit safe drafts;
- queue eligible commands;
- reconcile after recovery;
- never represent stale ATP, credit or compliance as current.

---

## 284. Implementation Accelerator and configuration factory

### 284.1 Benchmark

Centric SMB materials emphasize preconfigured industry practices, configurable workflows, cloud deployment, mobile capture/fit review, supplier sourcing, materials and calendars. Omnidata describes a phased implementation from product data and design through planning, suppliers, samples, orders and integrations.

### 284.2 SYNTHA TARGET

Offer implementation packs:

- Fashion Brand;
- Multi-brand Retailer;
- Distributor/Showroom;
- Private Label Retailer;
- Manufacturer;
- Agent/Sales Agency;
- Marketplace/Dropship Operator.

### 284.3 Pack contents

- reference organization model;
- role and permission templates;
- lifecycle templates;
- dictionaries and taxonomies;
- approval policies;
- product/specification templates;
- commercial agreement templates;
- integration mappings;
- dashboards;
- UAT scripts;
- sample data;
- migration rules;
- training paths.

### 284.4 Migration factory

Process:

```text
Inventory Sources
→ Profile Data
→ Map to Canonical Model
→ Cleanse / Deduplicate
→ Trial Load
→ Reconcile
→ Business Sign-off
→ Cutover
→ Hypercare
```

Required reconciliation:

- source count;
- target count;
- rejected records;
- merged duplicates;
- financial totals;
- open orders;
- current specifications;
- user memberships;
- document links.

### 284.5 Pilot design

Minimum controlled pilot:

- two contrasting styles;
- multiple colorways and sizes;
- one shared material;
- one alternative material;
- two suppliers/factories;
- quotation comparison;
- sample revision;
- buyer assortment and intent;
- PO and amendment;
- shipment and invoice;
- one quality exception;
- one return/claim;
- complete audit and analytics.

---

## 285. Adoption and value-realization system

### 285.1 Baseline before rollout

Capture current:

- time to create style/BOM/tech pack;
- sample rounds;
- quotation cycle time;
- order-entry time;
- error/rework rate;
- late milestone rate;
- material overbuy;
- data re-entry volume;
- report preparation time;
- assortment approval time;
- fill rate;
- time to resolve claims.

### 285.2 Value hypothesis

For each feature:

- target user;
- behavior to change;
- baseline;
- expected mechanism;
- measurable outcome;
- data source;
- review date;
- owner.

### 285.3 Adoption metrics

- active users by role;
- workflow completion in system;
- external spreadsheet dependency;
- structured versus attachment-only data;
- approval turnaround;
- mobile/offline use;
- supplier response rate;
- data-quality improvement;
- recommendation acceptance and outcome.

### 285.4 Claim discipline

Vendor-provided ROI figures are hypotheses or references, not Syntha commitments. Syntha claims require customer-specific baseline, measurement method, observation period and independently reviewable evidence.

---

## 286. Product analytics, feature flags and controlled rollout

### 286.1 Feature delivery

Every high-risk capability supports:

- feature flag;
- tenant allowlist;
- role allowlist;
- region restriction;
- shadow mode;
- percentage rollout;
- rollback;
- telemetry.

### 286.2 Product analytics

Events must answer:

- where users abandon a workflow;
- which validation blocks are frequent;
- which fields are repeatedly corrected;
- time spent waiting versus editing;
- which recommendations improve outcomes;
- which exports indicate a missing native workflow;
- where support intervention is required.

### 286.3 Experiment restrictions

Do not A/B test:

- legal compliance;
- safety gates;
- tenant isolation;
- hidden financial treatment;
- deceptive consent;
- irreversible order/payment actions without explicit approval.

---

## 287. Version 3.1 competitive gap matrix

| Capability | Benchmark | JOOR evidence status | Syntha target | Priority |
|---|---|---|---|---|
| Brand sales cockpit with order-type/status breakdown | NuORDER June 2026 | PARTIAL/UAT | Certified commercial cockpit with drill-through | P1 |
| Financial targets in assortment rollups | NuORDER | NOT CONFIRMED | Multi-level target and reconciliation engine | P1 |
| Product/door/delivery allocation constraints | NuORDER | NOT CONFIRMED | Governed constraints compiler | P1 |
| Brand proposal → retailer intent protocol | NuORDER | NOT CONFIRMED | Versioned proposal, counterproposal and PO conversion | P1 |
| Organization-level retailer profile and buyer governance | NuORDER | PARTIAL/UAT | Identity, invitation and delegated admin lifecycle | P0 |
| Split/partial payment orchestration | NuORDER | PARTIAL/UAT | Delivery/shipment/obligation payment allocation | P1 |
| Connected specification graph | Specright | NOT CONFIRMED | Product DNA graph with where-used and impact | P0 |
| Packaging engineering and spec governance | Specright | NOT CONFIRMED | Packaging BOM, labeling, compliance and optimization | P1 |
| Digital material marketplace and material twins | Material Exchange / Swatchbook | NOT CONFIRMED | Search, digital twin, sample and qualification loop | P1 |
| No-code workflow configuration with software governance | PLM/enterprise benchmark | NOT CONFIRMED | Versioned Workflow and Policy Studio | P0 |
| Agentic planning and controlled execution | Modern planning benchmark | NOT CONFIRMED | Governed agents with DecisionPackets | P2 |
| Canonical knowledge graph and semantic layer | Enterprise benchmark | NOT CONFIRMED | Identity, lineage and governed business definitions | P0 |
| Integration mapping and operations center | Enterprise benchmark | PARTIAL/UAT | Mapping Studio, replay, DLQ and reconciliation | P0 |
| Data observability and business-impact tracing | Enterprise benchmark | NOT CONFIRMED | Data Quality Control Tower | P0 |
| Extension/app ecosystem | Platform benchmark | NOT CONFIRMED | Scoped extension platform and marketplace | P2 |
| Implementation industry packs | Centric/Omnidata benchmark | NOT CONFIRMED | Configuration and migration factory | P1 |

---

## 288. New canonical entities

```text
MetricDefinition
MetricCertification
MetricSnapshot
MetricLineage
DashboardView
AssortmentConstraint
ConstraintSet
ConstraintConflict
ConstraintException
AssortmentProposal
CommercialCounterproposal
IntentConversion
OrganizationInvitation
MembershipApproval
DelegatedAdministratorScope
PaymentPlan
PaymentMilestone
PaymentAllocation
Specification
SpecificationVersion
SpecificationRelationship
SpecificationChangeRequest
SpecificationImpact
SpecificationRelease
SpecificationAcknowledgement
PackagingSystem
PackagingComponent
PackagingSpecification
PackagingBOM
PackConfiguration
LabelSpecification
ArtworkVersion
RetailerPackagingRequirement
MaterialTwin
MaterialDigitalAsset
MaterialColorRange
MaterialSampleRequest
MaterialQualification
MaterialSubstitutionCandidate
SubstitutionDecision
WorkflowDefinition
WorkflowVersion
PolicyDefinition
PolicyVersion
PolicyTestCase
AgentDefinition
AgentRun
AgentToolPermission
DecisionPacket
AgentEvaluation
OutcomeObservation
KnowledgeNode
KnowledgeEdge
IdentityMatch
BusinessTermDefinition
IntegrationDefinition
MappingDefinition
IntegrationMessage
IntegrationJob
ReconciliationResult
DataQualityRule
DataQualityIssue
DataObservabilityIncident
ExtensionApp
ExtensionInstallation
ExtensionPermission
ImplementationPack
MigrationBatch
MigrationReconciliation
ValueHypothesis
AdoptionMetric
FeatureFlag
ExperimentDefinition
```

---

## 289. New routes and workspaces

```text
/analytics/commercial-performance
/analytics/metrics-catalog
/analytics/data-lineage
/assortments/:id/constraints
/assortments/:id/proposals
/assortments/:id/intents
/organizations/invitations
/admin/memberships
/payments/plans
/payments/allocations
/specifications
/specifications/:id/where-used
/specifications/changes
/specifications/releases
/packaging/specifications
/packaging/requirements
/materials/marketplace
/materials/twins
/materials/samples
/materials/qualifications
/materials/substitutions
/admin/workflows
/admin/policies
/admin/policy-tests
/ai/agents
/ai/decision-packets
/ai/evaluations
/admin/knowledge-graph
/admin/business-terms
/admin/integrations/mappings
/admin/integrations/activity
/admin/data-quality
/admin/data-observability
/admin/extensions
/admin/implementation-packs
/admin/migrations
/admin/feature-flags
/admin/value-realization
```

---

## 290. New API outline

```text
GET    /api/v1/metrics/definitions
POST   /api/v1/metrics/:id/certify
GET    /api/v1/metrics/:id/lineage
POST   /api/v1/assortments/:id/constraints/validate
POST   /api/v1/assortments/:id/constraints/simulate
POST   /api/v1/assortments/:id/proposals
POST   /api/v1/buying-intents/:id/counterproposals
POST   /api/v1/buying-intents/:id/convert
POST   /api/v1/organizations/:id/invitations
POST   /api/v1/memberships/:id/approve
POST   /api/v1/payment-plans
POST   /api/v1/payments/:id/allocate
GET    /api/v1/specifications/:id/where-used
POST   /api/v1/specification-changes
POST   /api/v1/specification-changes/:id/analyze-impact
POST   /api/v1/specification-releases/:id/publish
POST   /api/v1/specification-releases/:id/acknowledge
POST   /api/v1/materials/:id/sample-requests
POST   /api/v1/materials/:id/qualifications
POST   /api/v1/material-substitutions/:id/evaluate
POST   /api/v1/workflows/:id/validate
POST   /api/v1/workflows/:id/simulate
POST   /api/v1/policies/:id/test
POST   /api/v1/agents/:id/runs
POST   /api/v1/agent-runs/:id/approve
POST   /api/v1/decision-packets/:id/outcomes
POST   /api/v1/integration-mappings/:id/test
POST   /api/v1/integration-messages/:id/replay
POST   /api/v1/data-quality/:id/waive
POST   /api/v1/extensions/:id/install
POST   /api/v1/migrations/:id/reconcile
```

Mutation endpoints require idempotency keys, optimistic concurrency/version preconditions and audit context.

---

## 291. New domain events

```text
commercial_metric_certified
commercial_metric_certification_revoked
assortment_constraint_violated
assortment_constraint_exception_approved
assortment_proposal_submitted
assortment_proposal_accepted
commercial_counterproposal_submitted
buying_intent_converted
organization_invitation_verified
membership_approved
membership_offboarded
payment_plan_activated
payment_milestone_due
payment_allocated
specification_version_created
specification_change_requested
specification_impact_calculated
specification_release_published
specification_release_acknowledged
packaging_requirement_failed
material_twin_created
material_sample_requested
material_qualified
material_substitution_proposed
material_substitution_approved
workflow_version_activated
policy_version_activated
policy_test_failed
agent_run_started
agent_decision_proposed
agent_action_approved
agent_action_blocked
agent_outcome_recorded
identity_match_reviewed
business_term_published
integration_mapping_activated
integration_message_quarantined
integration_message_replayed
data_quality_issue_opened
data_quality_issue_revalidated
data_observability_incident_opened
extension_installed
extension_permission_revoked
migration_batch_reconciled
value_hypothesis_reviewed
feature_flag_changed
```

---

## 292. Additional UAT scenarios

1. Sales dashboard total reconciles exactly to included submitted order versions.
2. Dashboard currency switch preserves transaction lineage and rounding policy.
3. Late cancellation updates the correct metric states without rewriting prior snapshots.
4. Product multiple-of constraint conflicts with maximum door quantity; compiler identifies infeasibility.
5. Contractual MOQ conflicts with OTB; system proposes options but does not auto-override.
6. Brand sends a proposal containing retailer-private fields by mistake; privacy validation blocks submission.
7. Retailer submits a filtered intent and verifies the external preview before sending.
8. Intent version two supersedes version one while brand retains auditable history.
9. Intent partially converts to two POs without duplicate quantities.
10. Invitation to an existing identity is merged rather than creating a duplicate user.
11. Offboarded buyer loses workspace access while historical authorship remains.
12. Payment plan allocates deposit by delivery and captures only after the configured milestone.
13. Failed partial capture retries idempotently without double charging.
14. Specification change shows all affected BOMs, samples, orders and content packages.
15. Emergency specification release requires elevated approval and explicit WIP disposition.
16. Supplier acknowledges an old release after a newer release exists; system blocks stale acknowledgement.
17. Packaging requirement changes for one retailer and marks only affected channel projections unready.
18. Carton optimization scenario improves cube but violates weight limit and is rejected.
19. Digital material twin is available but physical qualification is missing; production approval remains blocked.
20. Material substitute passes composition similarity but fails required shrinkage evidence.
21. Policy version is activated with a future date and does not affect current transactions early.
22. Workflow change for in-progress samples runs migration simulation before activation.
23. Agent recommends a quantity based on stale POS feed; automation level is reduced and warning shown.
24. Agent attempts a tool outside its scope and is denied with audit evidence.
25. DecisionPacket records options, constraints and later commercial outcome.
26. Knowledge-graph inferred supplier relationship is displayed as unverified, not factual.
27. Integration mapping schema drifts and incoming payload is quarantined.
28. Replayed EDI/API message does not create a duplicate order or invoice.
29. Missing one store’s inventory feed opens a data-quality issue and reduces recommendation coverage.
30. Extension requests a new sensitive scope; tenant administrator must reapprove.
31. Cross-tenant search, cache and AI retrieval tests return no unauthorized data.
32. Offline fit review reconnects after measurement version changed and requires conflict resolution.
33. Migration trial load reconciles product counts and financial totals before cutover.
34. Product team exports repeatedly to Excel; analytics flags a likely missing native workflow.
35. Vendor ROI claim is stored as benchmark evidence, not displayed as measured Syntha value.
36. Feature rollback disables a new agent action while preserving audit and created drafts.

---

## 293. Version 3.1 delivery roadmap and decisions

### P0 — platform trust and executable truth

1. Canonical specification graph and versioning.
2. Organization identity, invitations, memberships and delegated administration.
3. Workflow and Policy Studio foundations.
4. Certified metric catalog and lineage.
5. Integration mapping, activity, idempotency and reconciliation.
6. Data Quality and Observability Control Tower.
7. Knowledge/identity graph foundation.
8. Tenant isolation and enterprise authorization tests.

### P1 — differentiated buying and product execution

1. Constraints Compiler.
2. Proposal → Intent → Counterproposal → PO protocol.
3. Payment plan and allocation by delivery/shipment.
4. Specification impact and controlled release.
5. Packaging engineering and retailer requirement validation.
6. Digital material marketplace, sample and qualification workflow.
7. Implementation packs and migration factory.
8. Commercial Performance Cockpit.

### P2 — intelligent scale

1. Governed agent registry and DecisionPackets.
2. Shadow-mode planning and sourcing agents.
3. Extension platform.
4. Material substitution recommendations.
5. Product analytics and feature rollout platform.
6. Outcome-learning layer.

### P3 — ecosystem intelligence

1. Partner extension marketplace.
2. Cross-network benchmarks with explicit data agreements.
3. Advanced agent orchestration with approved checkpoints.
4. Automated configuration recommendations.
5. Continuous value-realization benchmarking.

### Final decisions

1. **Syntha is not a UI clone of JOOR or NuORDER.** It is an operating platform connecting product truth, commercial intent and execution.
2. **Targets, recommendations and metrics require certified definitions and lineage.**
3. **Specifications are structured graph objects, not only documents.**
4. **No-code configuration must be versioned, tested and governed.**
5. **AI produces evidence-backed DecisionPackets and acts only through scoped tools.**
6. **Material and packaging data are first-class product engineering domains.**
7. **Integration failure and stale data are visible business states, not hidden technical logs.**
8. **Confidential benchmark materials are not copied into public documentation.**

### Official source register for version 3.1

NuORDER:

- https://helpdesk.nuorder.com/hc/en-us/articles/52320082658843-Brand-update-June-2026
- https://helpdesk.nuorder.com/hc/en-us/articles/47431602186907-Assortments-update-February-2026
- https://helpdesk.nuorder.com/hc/en-us/articles/18923106692379-Targets-in-assortments
- https://helpdesk.nuorder.com/hc/en-us/articles/24379270501531-Constraints-in-assortments
- https://helpdesk.nuorder.com/hc/en-us/articles/23290603807387-Order-Intents
- https://helpdesk.nuorder.com/hc/en-us/articles/29555232652571-Assortments-update-September-2024
- https://helpdesk.nuorder.com/hc/en-us/articles/43537045658139-Retailer-profile-overview
- https://helpdesk.nuorder.com/hc/en-us/articles/209205146-Orders-page-overview
- https://helpdesk.nuorder.com/hc/en-us/articles/28203420398235-Order-checkout-overview

Specification and packaging management:

- https://www.specright.com/what-is-specification-management/
- https://www.specright.com/industry/packaging/
- https://www.specright.com/specright-network

Digital materials:

- https://material-exchange.com/sourcing-hub-terms-conditions/
- https://www.swatchbook.us/
- https://www.swatchbook.us/swatchbook-library

Retail planning reference:

- https://es.blueyonder.com/solutions/retail-planning/assortment

Internal capability references used without publishing confidential commercial terms:

- Omnidata PLM — Управление коллекциями в fashion-ритейле;
- Centric Software x Mercury — Offer, capability and implementation benchmark only.

## 294. Version 3.2 scope — market access, account growth and resilient execution

### 294.1 Why this expansion is required

Previous versions established the product, planning, wholesale, supply-chain, finance and intelligence backbone. Version 3.2 closes five remaining enterprise gaps:

1. **Can this exact product version legally and operationally be sold in a specific market and channel?**
2. **Can Syntha prove the chemical, safety, identity, origin and listing evidence behind that decision?**
3. **Can a wholesale team systematically grow an account from first contact to repeat, profitable business?**
4. **Can market events and appointments be converted into structured commercial outcomes rather than notes and spreadsheets?**
5. **Can the platform continue safely through integrations, infrastructure, regional and data-recovery failures?**

### 294.2 Evidence boundary

This version uses:

- official EU product-safety, ESPR and DPP materials;
- official ZDHC chemical-management guidance;
- official government restricted-party screening resources;
- current official Descartes, MarketTime, Swapcard and Phrase materials;
- AWS and Google SRE reliability guidance.

It does not interpret legal requirements as legal advice. Regulations, product scopes, dates and delegated acts must be maintained as versioned regulatory data with accountable legal owners.

### 294.3 Product direction

```text
Product and Partner Truth
→ Market Applicability
→ Evidence and Compliance
→ Commercial Access
→ Buyer Engagement
→ Appointment / Proposal / Intent
→ Order and Fulfillment
→ Certified Outcome
→ Account Growth
```

The platform must be able to answer not only **what happened**, but also:

- why a product was allowed or blocked;
- which rule version was applied;
- what evidence was used;
- which party accepted responsibility;
- whether the decision remains valid today;
- what commercial action should follow.

---

## 295. Regulatory Intelligence and Market Access Rules Engine

### 295.1 Problem

Product compliance is often fragmented between PLM attributes, spreadsheets, testing portals, legal emails, retailer manuals and marketplace listing forms. A product can appear commercially ready while lacking one market-specific requirement.

Syntha needs a versioned rules engine that determines whether a product is eligible for:

- development approval;
- supplier allocation;
- production release;
- shipment;
- customs entry;
- wholesale publication;
- consumer-channel publication;
- sale in a specific jurisdiction;
- continued sale after a regulatory or evidence change.

### 295.2 Canonical hierarchy

```text
RegulatoryAuthority
→ Regulation / Standard / Customer Requirement
→ Rule Set
→ Applicability Rule
→ Evidence Requirement
→ Validation Rule
→ Marketability Decision
```

### 295.3 RegulationVersion

Required fields:

- authority and jurisdiction;
- official identifier;
- title and short name;
- source URL/publication reference;
- published date;
- effective date;
- transition period;
- repeal/supersession date;
- product scope;
- market/channel scope;
- operator roles affected;
- obligations;
- evidence requirements;
- enforcement/remedy context;
- owner and legal reviewer;
- interpretation status;
- last reviewed date;
- next review date.

### 295.4 Applicability dimensions

- product category and taxonomy;
- fiber/material composition;
- leather, rubber, wood or other regulated commodity content;
- age group;
- intended use;
- safety claims;
- technology/electronics;
- packaging type;
- origin country;
- production facility;
- destination market;
- selling channel;
- B2B versus consumer sale;
- online versus physical sale;
- manufacturer/importer/distributor/marketplace role;
- date placed on market;
- batch or serialized item.

### 295.5 Rule result

A rule evaluation returns:

```text
APPLICABLE
NOT_APPLICABLE
POTENTIALLY_APPLICABLE
INSUFFICIENT_DATA
LEGAL_REVIEW_REQUIRED
```

The engine must never convert missing data into `NOT_APPLICABLE`.

### 295.6 Regulatory change impact

When a regulation or official scope changes, Syntha recalculates:

- affected product versions;
- active listings;
- open orders;
- shipments;
- unsold inventory;
- compliance claims;
- DPP records;
- supplier evidence requests;
- customer notifications;
- future line plans.

A current example of why this is required: regulatory product scope can change shortly before application. Such changes must be processed as versioned data rather than manually edited assumptions.

---

## 296. GPSR Product Safety and Online Listing Compliance

### 296.1 Benchmark and status

The EU General Product Safety Regulation applies to non-food consumer products sold offline and online and strengthened product identification, responsible-economic-operator, online-listing, authority-cooperation and recall requirements.

The audited JOOR retailer cabinet did not confirm a complete GPSR-style product safety and online-listing gate.

Status: `JOOR NOT CONFIRMED / UAT`.

### 296.2 SYNTHA TARGET — Product Safety File

```text
ProductSafetyFile
├── Product Identification
├── Manufacturer / Responsible Economic Operator
├── Risk Assessment
├── Standards and Test Evidence
├── Warnings and Instructions
├── Traceability Data
├── Incident History
├── Recall Readiness
└── Market / Language Projections
```

### 296.3 Product identity requirements

- product name and type;
- style/SKU/GTIN or other identifier;
- product image;
- batch/lot/serial where relevant;
- manufacturer identity;
- importer/responsible person where required;
- postal and electronic contact details;
- country/market relationship;
- linked technical documentation;
- version effective at listing time.

### 296.4 Safety risk assessment

Risk records include:

- foreseeable use;
- foreseeable misuse;
- vulnerable consumer group;
- physical/mechanical risk;
- chemical risk;
- flammability risk;
- choking/entrapment risk where applicable;
- allergen/sensitization context;
- labeling and warning mitigation;
- residual risk;
- assessor and approver;
- evidence and review date.

### 296.5 Online listing safety projection

Each consumer-facing listing must resolve and validate:

- manufacturer identity;
- responsible person/importer when applicable;
- product identifier and image;
- warnings and safety information;
- required local language;
- traceability link;
- recall/incident status;
- evidence freshness;
- product version.

### 296.6 Listing gate

```text
Technical File Complete
AND Responsible Operator Resolved
AND Required Warnings Approved
AND Required Language Approved
AND No Active Stop-Sale
AND Required Evidence Valid
→ LISTING ELIGIBLE
```

### 296.7 Notice-and-takedown operations

Entities:

```text
SafetyNotice
AuthorityRequest
MarketplaceTakedownRequest
ListingSuspension
CorrectiveAction
ConsumerRemedyProgram
```

Workflow:

```text
NOTICE_RECEIVED
→ TRIAGED
→ PRODUCT_MATCHED
→ RISK_CONFIRMED / DISMISSED
→ LISTINGS_IDENTIFIED
→ TAKEDOWN / CORRECTION
→ AUTHORITY_RESPONSE
→ CONSUMER_REMEDY
→ CLOSED
```

Every listing action must preserve who initiated it, the legal/evidence basis, affected channels and completion acknowledgement.

---

## 297. Chemical and Restricted Substance Management

### 297.1 Benchmark

ZDHC maintains an MRSL framework and a chemical gateway for textile, apparel, leather and footwear input chemistry. Its guidance distinguishes conformance levels, requires supporting evidence and uses supplier chemical-inventory analysis such as InCheck.

### 297.2 JOOR evidence status

A structured chemical inventory, MRSL/RSL rule engine, formulation conformance and facility-level chemical-use trace were not confirmed in the audited JOOR cabinet.

Status: `JOOR NOT CONFIRMED / UAT`.

### 297.3 Chemical master

```text
ChemicalFormulation
ChemicalManufacturer
ChemicalSupplier
SafetyDataSheet
TechnicalDataSheet
ChemicalCertificate
MRSLConformance
ChemicalLot
ChemicalInventoryPosition
ChemicalUseEvent
```

### 297.4 Chemical formulation fields

- commercial name;
- manufacturer/formulator;
- supplier;
- product code;
- intended use/function;
- material/process applicability;
- CAS/ingredient information where lawfully available;
- SDS version/date/language;
- TDS version/date;
- hazard and precaution statements;
- storage conditions;
- expiry/shelf life;
- lot/batch;
- MRSL scheme/version;
- conformance level;
- certifier;
- certificate validity;
- facility approval;
- prohibited or conditional uses.

### 297.5 Facility Chemical Inventory List

For each facility and period:

- quantity received;
- quantity on hand;
- quantity consumed;
- lot/batch;
- storage location;
- expiry;
- SDS/TDS status;
- MRSL conformance;
- linked production processes;
- linked material lots and production batches;
- disposal or return;
- reconciliation variance.

### 297.6 RSL versus MRSL

```text
MRSL
Controls chemicals intentionally used in manufacturing processes.

RSL
Controls restricted substances in the finished material/product.
```

Syntha must maintain both and prevent one result from being treated as proof of the other.

### 297.7 Chemical use authorization

```text
Facility Approved
AND Formulation Evidence Valid
AND MRSL Rule Passed
AND Intended Use Allowed
AND Lot Not Expired
AND Required SDS Language Available
→ USE AUTHORIZED
```

### 297.8 Finished-product chemical testing

- test protocol and version;
- product/material/batch sample;
- laboratory;
- chain of custody;
- tested substances;
- limits;
- result and uncertainty;
- pass/fail/conditional;
- retest;
- affected inventory;
- supplier recovery;
- regulatory/retailer projection.

### 297.9 Chemical substitution

A non-conforming or expired formulation triggers:

- stop-use;
- affected WIP identification;
- approved alternative search;
- process compatibility review;
- shade/hand-feel/performance review;
- test requirement;
- cost and lead-time impact;
- controlled release.

---

## 298. ESPR, DPP Registry and Unsold Goods Governance

### 298.1 Current implementation direction

The EU ESPR establishes a framework for product sustainability requirements and progressive DPP implementation. Textiles are among priority product groups. In July 2026 the Commission launched a DPP Registry and testing environment with registration through a user interface or API.

### 298.2 DPP architecture extension

Existing Syntha DPP functionality must add:

```text
DPPDataSet
DPPRegistration
DPPRegistrySubmission
DPPRegistryAcknowledgement
DPPBackupCopy
DPPAccessPolicy
DPPEconomicOperator
DPPFacilityIdentifier
DPPDataCarrier
DPPRevocation
```

### 298.3 DPP registration workflow

```text
DATASET_DRAFT
→ VALIDATED
→ OPERATOR_APPROVED
→ IDENTIFIER_ASSIGNED
→ REGISTRY_SUBMITTED
→ REGISTRY_ACCEPTED
→ PUBLISHED
→ UPDATED / SUPERSEDED / REVOKED
```

### 298.4 Validation

- unique product identifier;
- economic operator identity;
- facility identifiers where required;
- data-carrier resolution;
- required attributes by delegated act;
- access-right policy;
- data completeness;
- evidence links;
- current/accurate status;
- backup/availability policy;
- registry acknowledgement.

### 298.5 Regulation-specific DPP profiles

Do not hard-code one universal textile DPP. Use profile versions:

```text
DPPProfile
├── Required Data Elements
├── Conditional Data Elements
├── Access Classes
├── Identifier Rules
├── Data Carrier Rules
├── Registry Rules
└── Validation Rules
```

### 298.6 Unsold Goods Ledger

ESPR also creates governance around destruction and disclosure for unsold consumer goods, including textiles and footwear.

Syntha requires:

```text
UnsoldGoodsPosition
DispositionDecision
DestructionProhibitionCheck
DonationTransfer
ReuseTransfer
RepairRefurbishment
ResaleTransfer
RecyclingTransfer
DestructionRecord
UnsoldGoodsDisclosure
```

### 298.7 Disposition decision hierarchy

```text
Return to Full-price Sale
→ Transfer
→ Outlet / Controlled Markdown
→ Repair / Refurbish
→ Resale
→ Donation
→ Recycling / Material Recovery
→ Destruction only when legally permitted and justified
```

### 298.8 Evidence

- quantity and weight;
- product/SKU/batch;
- ownership;
- reason unsold;
- selected disposition;
- legal applicability;
- recipient/operator;
- transport evidence;
- completion evidence;
- recovered value;
- disclosure classification.

---

## 299. Marketability Passport and Publication Gate

### 299.1 Purpose

A single readiness score is not sufficient. Syntha requires a market/channel-specific decision object.

```text
MarketabilityPassport
= Product Version
+ Market
+ Channel
+ Selling Entity
+ Operator Role
+ Effective Date
+ Evidence Snapshot
```

### 299.2 Passport dimensions

- technical specification;
- composition and labeling;
- chemical compliance;
- safety assessment;
- required test evidence;
- responsible operator;
- customs classification;
- origin evidence;
- packaging requirements;
- DPP profile/registration;
- sustainability claims;
- required language;
- retailer/channel content;
- active incident/recall status;
- contract and territory rights.

### 299.3 Decision states

```text
DRAFT
DATA_REQUIRED
UNDER_REVIEW
CONDITIONALLY_ELIGIBLE
ELIGIBLE
BLOCKED
SUSPENDED
EXPIRED
SUPERSEDED
```

### 299.4 Conditional eligibility

A product may be eligible only under explicit conditions:

- selected channel only;
- selected date range;
- selected batch;
- corrected warning label;
- manual customs review;
- inventory already placed on market;
- no replenishment;
- approved exception.

### 299.5 Publication gate

Before catalog/showroom/PIM/marketplace publication:

```text
Marketability Passport ELIGIBLE
AND Commercial Access Valid
AND Price Valid
AND Inventory / Availability Policy Valid
AND Required Content Projection Complete
→ PUBLICATION ALLOWED
```

The publication system stores the passport version used at publication time.

---

## 300. Global Trade Classification and Landed Cost Workbench

### 300.1 Benchmark

Descartes provides product classification and duty-determination tooling using tariff codes, duties, regulations, trade agreements, rulings and compliance content across many countries. Government trade systems separately stress item classification, destination, end-use and counterparty screening.

### 300.2 JOOR evidence status

Basic origin or shipment fields may exist in wholesale systems, but a governed global classification, origin, tariff and landed-cost workbench was not confirmed in the audited JOOR cabinet.

Status: `JOOR NOT CONFIRMED / UAT`.

### 300.3 Classification entities

```text
TradeProductProfile
TariffClassification
ClassificationCandidate
ClassificationDecision
ClassificationRuling
DutyRate
TradeMeasure
ImportRestriction
TradeAgreement
LandedCostScenario
```

### 300.4 TradeProductProfile

- product description for customs;
- material composition;
- construction/knit/woven process;
- gender/age where classification-relevant;
- intended use;
- footwear upper/sole composition;
- accessories/components;
- origin and production process;
- product images and technical evidence;
- candidate HS/HTS/CN codes by country;
- classification owner;
- decision status and version.

### 300.5 Classification workflow

```text
DATA_COMPLETE
→ CANDIDATES_GENERATED
→ TRADE_REVIEW
→ CODE_SELECTED
→ EVIDENCE_ATTACHED
→ APPROVED
→ EFFECTIVE
```

AI-assisted classification may rank candidates, but approval remains attributable to a qualified owner or binding ruling where required.

### 300.6 Landed cost formula

```text
Landed Cost
= Product Cost
+ Packaging
+ Inland Origin Freight
+ Export Fees
+ International Freight
+ Insurance
+ Duty
+ Additional Tariffs
+ Import Tax where non-recoverable
+ Brokerage
+ Port / Handling
+ Compliance and Inspection Cost
+ Destination Freight
+ Financing / FX Cost
```

### 300.7 Scenario dimensions

- origin country;
- destination market;
- importer/legal entity;
- incoterm/version;
- transport mode;
- port/lane;
- tariff code;
- preference claim;
- quantity/value;
- exchange rate;
- shipment date;
- anti-dumping/countervailing/safeguard measure;
- broker assumptions.

### 300.8 Effective-dated trade content

Historical orders and margin reports must use the tariff, FX and trade-measure versions that were effective for the scenario, not today’s values.

---

## 301. Restricted Party, Sanctions and Transaction Screening

### 301.1 Benchmark

The U.S. Consolidated Screening List aggregates multiple government restrictions and provides machine-readable access, including fuzzy name matching. It explicitly requires further due diligence where a potential match exists. Enterprise trade platforms add continuous screening and audit workflows.

### 301.2 Screening scope

Screen:

- legal entities;
- ultimate beneficial owners where policy requires;
- buyers and suppliers;
- banks and payment beneficiaries;
- freight forwarders;
- consignees;
- ship-to parties;
- agents and distributors;
- vessels/carriers where relevant;
- end users and end-use declarations.

### 301.3 Screening events

- onboarding;
- connection approval;
- credit approval;
- order submission;
- order amendment;
- payment or payout;
- shipment release;
- scheduled re-screening;
- list update;
- entity/legal-name change.

### 301.4 Match lifecycle

```text
SCREENED_CLEAR
POTENTIAL_MATCH
UNDER_REVIEW
FALSE_POSITIVE
CONFIRMED_MATCH
RESTRICTED
LICENSE_REQUIRED
APPROVED_WITH_CONTROLS
```

### 301.5 Potential-match case

Required data:

- screened party snapshot;
- list source/version/date;
- matched names and aliases;
- score and matching fields;
- country/address/date-of-birth/company identifiers where permitted;
- transaction context;
- reviewer;
- supporting research;
- decision;
- next re-screen date;
- linked hold/release commands.

### 301.6 Screening is not a one-time checkbox

A clear result can become invalid after:

- government-list update;
- ownership change;
- address/identity change;
- new destination/end use;
- product reclassification;
- new license condition.

Syntha must retain both current screening state and historical decision evidence.

---

## 302. Origin, Preference and Customs Evidence

### 302.1 Origin separation

```text
Country of Manufacture
Country of Origin for Marking
Non-preferential Origin
Preferential Origin
Supplier-declared Origin
Verified Origin
```

These fields are related but not interchangeable.

### 302.2 Origin determination record

- finished-product HS classification;
- input materials and origins;
- production steps by facility/country;
- applicable origin rule;
- tariff-shift/value-content/specific-process calculation;
- cumulation rule;
- tolerance/de minimis;
- evidence period;
- reviewer and approval;
- resulting origin and preference eligibility.

### 302.3 Supplier declarations

- declaration type;
- supplier and facility;
- covered products/materials;
- origin;
- validity period;
- agreement/program;
- signature/evidence;
- revoked/superseded status.

### 302.4 Preference claim gate

A duty preference cannot be applied unless:

- agreement applies to trade lane/date;
- product meets rule of origin;
- required evidence is valid;
- direct-transport or other conditions pass;
- claim document is available;
- no contradictory supplier/material evidence exists.

### 302.5 Customs document pack

- commercial invoice;
- packing list;
- origin certificate/declaration;
- product classification evidence;
- permits/licenses;
- transport documents;
- valuation adjustments;
- DPP/product identity link where relevant;
- broker instructions;
- audit history.

---

## 303. Wholesale Account 360 and Relationship Graph

### 303.1 Problem

Wholesale teams need more than a connection status and order list. They need one governed view of the entire commercial relationship.

### 303.2 Account hierarchy

```text
Account Group
→ Legal Entity
→ Banner / Concept
→ Department
→ Door / Location
→ E-commerce Channel
→ Buyer Team
→ Contact
```

### 303.3 Account 360 domains

- organization identity and ownership;
- contacts, roles and influence;
- locations and channels;
- brand relationships;
- commercial agreements;
- price lists and terms;
- credit and receivables;
- assortment and order history;
- sell-through/inventory where shared;
- returns/claims;
- appointments and communications;
- open opportunities;
- service issues;
- profitability;
- data-sharing permissions;
- consent and communication preferences.

### 303.4 Relationship graph

Edges include:

- buys from;
- represents;
- owns;
- manages;
- influences;
- approves;
- pays for;
- ships to;
- belongs to buying group;
- shares inventory/POS data;
- participates in event;
- assigned sales representative.

Every inferred or third-party relationship is marked by provenance and confidence.

### 303.5 Contact governance

- verified work identity;
- role and buying responsibility;
- preferred language/timezone;
- communication consent;
- departed/stale contact detection;
- replacement/relationship transfer;
- duplicate contact resolution;
- confidential notes separated from shared notes.

---

## 304. Account Health, Whitespace and Opportunity Management

### 304.1 Account health model

Health must not be one opaque AI score. Display component signals:

- order frequency and recency;
- order growth/decline;
- assortment breadth;
- sell-through where shared;
- cancellation and return rate;
- fill rate and delivery reliability;
- receivables/credit status;
- appointment engagement;
- buyer response time;
- unresolved claims/issues;
- data-sharing freshness;
- margin and net-net profitability;
- contract/terms renewal risk.

### 304.2 Health states

```text
ONBOARDING
GROWING
HEALTHY
AT_RISK
DORMANT
CREDIT_HOLD
SERVICE_RECOVERY
OFFBOARDED
```

### 304.3 Whitespace analysis

Identify opportunities by:

- categories not purchased;
- locations not ranged;
- missing core products;
- price bands not covered;
- size/color gaps;
- competitor/market whitespace where licensed;
- products with strong performance at comparable doors;
- replenishment potential;
- regional/channel expansion;
- new collection fit;
- cross-brand or complementary products.

### 304.4 Opportunity object

```text
Opportunity
├── Account / Contact
├── Season / Category / Product Scope
├── Commercial Hypothesis
├── Expected Units / Value / Margin
├── Probability and Stage
├── Evidence
├── Required Actions
├── Risks / Constraints
└── Actual Outcome
```

### 304.5 Opportunity lifecycle

```text
IDENTIFIED
→ QUALIFIED
→ DISCOVERY
→ ASSORTMENT_PROPOSED
→ INTENT_RECEIVED
→ COMMERCIAL_NEGOTIATION
→ PO_RECEIVED
→ WON / LOST / DEFERRED
```

### 304.6 Lost-reason taxonomy

- price;
- margin;
- MOQ/MOV;
- delivery;
- assortment mismatch;
- product quality/fit;
- territory/conflict;
- credit/terms;
- competitor;
- no budget/OTB;
- capacity/availability;
- compliance/readiness;
- no decision.

Free-text notes supplement, but do not replace, structured reasons.

---

## 305. Territory, Field Sales and Representative Operations

### 305.1 Benchmark

MarketTime publicly describes account-to-rep assignment, territory management, commissions, appointments, customer leads, call reports, trade-show order writing and offline work.

### 305.2 Territory model

Territories may be based on:

- country/region;
- state/postcode;
- named accounts;
- retailer group;
- channel;
- category;
- brand/line;
- season;
- event;
- temporary coverage.

### 305.3 Conflict handling

- overlapping territory detection;
- house account rules;
- split account/commission rules;
- temporary substitution;
- manager override;
- effective dates;
- order-line-level attribution;
- post-order dispute workflow.

### 305.4 Rep workspace

- day/week plan;
- map and route;
- appointments;
- priority accounts;
- new leads;
- drafts/carts requiring action;
- expiring proposals/intents;
- overdue confirmations;
- at-risk accounts;
- collections relevant to territory;
- offline account/product/order data;
- visit notes and follow-up tasks.

### 305.5 Call/visit report

- account/location;
- attendees;
- purpose;
- products discussed;
- selected/rejected products;
- objections;
- competitor signals;
- next step;
- tasks;
- photos/documents;
- location/time evidence where permitted;
- shared versus internal notes.

### 305.6 Rep performance

Do not measure only submitted revenue. Include:

- profitable revenue;
- new-account activation;
- repeat order rate;
- assortment breadth;
- appointment show rate;
- proposal-to-intent and intent-to-order conversion;
- collections/receivables support;
- account retention;
- forecast accuracy;
- data completeness;
- claim/service recovery.

---

## 306. Hosted Buyer and Market Event Operating System

### 306.1 Benchmark

Swapcard’s current Hosted Buyer model supports grouping buyers/sellers, collecting meeting preferences, generating optimized schedules, configuring meeting constraints, confirming schedules and measuring attendance/ROI.

### 306.2 Existing Syntha foundation

Earlier sections defined appointments, collaborative buying and offline market mode. Version 3.2 expands this into a full event operating system.

### 306.3 Event hierarchy

```text
MarketEvent
├── Venue / Virtual Environment
├── Day / Session
├── Brand / Exhibitor
├── Buyer Program
├── Booth / Room / Table
├── Appointment
├── Product / Sample Set
└── Commercial Outcome
```

### 306.4 Event configuration

- event type;
- dates/timezones;
- venue map;
- registration and eligibility;
- participant groups;
- meeting permissions;
- hosted-buyer commitments;
- appointment durations;
- setup/cleanup buffers;
- locations/resources;
- capacity;
- priority rules;
- cancellation/no-show rules;
- data-sharing and consent;
- event-specific commercial access.

### 306.5 Participant profile

- organization and role;
- categories/brands of interest;
- price bands;
- markets/channels;
- buying authority;
- target deal/OTB band where voluntarily shared;
- languages;
- availability;
- accessibility needs;
- existing relationships;
- do-not-match rules;
- meeting objectives.

### 306.6 Hosted buyer obligations

- required number of meetings;
- attendance policy;
- travel/accommodation benefits;
- cancellation terms;
- qualification status;
- organizer review;
- fulfillment and exception evidence.

---

## 307. Appointment Matching and Resource Orchestration

### 307.1 Match inputs

- mutual preference;
- buyer category interest;
- seller assortment fit;
- territory/channel eligibility;
- existing connection;
- account whitespace;
- opportunity value;
- language;
- time availability;
- room/booth capacity;
- travel time between locations;
- conflict/do-not-match;
- hosted-buyer obligations;
- priority/sponsorship rules disclosed by event policy.

### 307.2 Match result

Each generated meeting stores:

- candidate participants;
- match score components;
- constraints;
- selected time/location;
- alternatives considered;
- reason for rejection of alternatives;
- organizer/manual override;
- publication state.

### 307.3 Scheduling lifecycle

```text
PREFERENCE_COLLECTION
→ DRAFT_GENERATED
→ ORGANIZER_REVIEW
→ PARTICIPANT_REVIEW
→ CONFIRMED
→ REMINDED
→ CHECKED_IN
→ COMPLETED / NO_SHOW / CANCELLED
```

### 307.4 Resource scheduling

Resources:

- showroom room;
- table;
- booth;
- video room;
- interpreter;
- sample rack/set;
- fit model;
- technical specialist;
- buyer/sales representative.

The scheduler prevents double booking and includes preparation, travel and handover buffers.

### 307.5 Sample set preparation

Appointment preparation automatically generates:

- relevant product shortlist;
- physical sample pick list;
- digital assets;
- price list;
- buyer-specific terms;
- previous purchase/performance context;
- account whitespace;
- suggested agenda;
- compliance/availability warnings.

---

## 308. Meeting-to-Assortment Conversion and Event ROI

### 308.1 Structured meeting workspace

During a meeting:

- scan/add products;
- record interest level;
- enter buyer/private notes;
- record objections;
- capture quantity hypotheses;
- compare colors/sizes/deliveries;
- create alternatives;
- attach photos/voice notes;
- assign tasks;
- create assortment proposal or buying-intent draft;
- preserve offline operation.

### 308.2 Meeting outcome states

```text
NO_COMMERCIAL_INTEREST
FOLLOW_UP_REQUIRED
SAMPLE_REQUESTED
PROPOSAL_REQUESTED
ASSORTMENT_CREATED
INTENT_EXPECTED
ORDER_DRAFTED
ORDER_SUBMITTED
```

### 308.3 Follow-up automation

Generate a reviewable follow-up package:

- agreed products;
- unresolved questions;
- requested samples/documents;
- commercial conditions;
- deadlines;
- responsible owners;
- shareable recap;
- next appointment or task.

AI-generated summaries require attendee review before external sending.

### 308.4 Event ROI model

Separate:

- registrations;
- qualified buyers;
- meetings requested;
- meetings confirmed;
- attendance;
- products reviewed;
- samples requested;
- proposals;
- intents;
- orders;
- shipped/invoiced/paid value;
- incremental margin;
- retained account value.

### 308.5 Attribution

```text
Event Assisted
≠ Event Sourced
≠ Event Closed
```

The platform records attribution rules and avoids crediting an event for an order that was already committed before the appointment.

---

## 309. Localization and Global Content Operations

### 309.1 Benchmark

Phrase describes governed localization workflows using translation memory, term bases/glossaries, review stages, context and automated quality controls.

### 309.2 JOOR evidence status

Multilingual content may be displayed in B2B systems, but a governed localization operating model with translation memory, terminology, legal review, market variants and release gating was not confirmed in the audited JOOR account.

Status: `JOOR NOT CONFIRMED / UAT`.

### 309.3 Localizable content types

- UI and notifications;
- product names/descriptions;
- materials and care;
- warnings/instructions;
- technical terms;
- size/fit guidance;
- packaging and labels;
- sustainability claims;
- commercial terms;
- showroom/campaign content;
- emails and documents;
- marketplace/channel attributes;
- legal and safety content.

### 309.4 Locale projection

```text
Canonical Source Content
→ Market/Channel Context
→ Translation / Adaptation
→ Linguistic Review
→ Legal / Technical Review
→ Layout and Data Validation
→ Approved Locale Version
→ Publication
```

### 309.5 Locale is more than language

A projection includes:

- language/script;
- country/market;
- tone/brand voice;
- currency and number format;
- date/time/timezone;
- units of measure;
- size-system conversion;
- tax/pricing display;
- legal terminology;
- required warnings;
- prohibited claims;
- images/symbols;
- channel character/format constraints;
- RTL layout where applicable.

---

## 310. Terminology, Translation Memory and Regulated Copy

### 310.1 Term Base

Each term includes:

- concept ID;
- source term;
- approved translations;
- forbidden translations;
- definition;
- part of speech;
- product/category context;
- market scope;
- brand ownership;
- case/plural/gender behavior;
- example;
- approval and version;
- effective dates.

### 310.2 Translation Memory

Store reusable approved segments with:

- source and target;
- language pair;
- context;
- content type;
- product/category;
- prior approval;
- quality score;
- source version;
- confidentiality/tenant ownership.

Cross-tenant translation memory sharing is prohibited without an explicit data agreement.

### 310.3 Regulated copy

Warnings, fiber declarations, country-of-origin statements, care instructions and safety information require:

- locked legal source;
- approved target language;
- market scope;
- effective date;
- legal reviewer;
- no uncontrolled machine-translation publication;
- exact version used on product/listing/packaging.

### 310.4 Quality checks

- missing translation;
- term-base violation;
- number/unit mismatch;
- placeholder/tag mismatch;
- punctuation/length rule;
- untranslated segment;
- inconsistent repeated segment;
- forbidden claim;
- outdated source;
- wrong market/language;
- layout overflow;
- RTL defect.

---

## 311. Localization Readiness and Simultaneous Launch

### 311.1 LocalizationPackage

```text
LocalizationPackage
├── Source Version
├── Required Locales
├── Content Inventory
├── Translation Jobs
├── Review Jobs
├── Quality Results
├── Channel Projections
└── Publication Acknowledgements
```

### 311.2 Readiness by market/channel

- required fields translated;
- regulated copy approved;
- units/sizes converted;
- price/currency/tax resolved;
- assets localized;
- channel validation passed;
- publication endpoint accepted;
- no unresolved high-severity issue.

### 311.3 Source change propagation

When source content changes:

- identify affected translations;
- classify material versus editorial change;
- preserve unaffected approved segments;
- reopen required reviews;
- block only impacted market projections;
- notify owners;
- compare old/new customer-facing copy.

### 311.4 Machine translation controls

Machine translation may:

- create a draft;
- suggest glossary-consistent wording;
- flag confidence;
- route low-confidence/high-risk content to humans.

It may not autonomously publish legal, safety or regulated claims.

---

## 312. Service Reliability, SLOs and Error Budgets

### 312.1 Benchmark

Google SRE formalizes service-level indicators, objectives and error budgets around user-relevant behavior. AWS reliability guidance emphasizes monitoring, fault isolation, recovery automation, tested backups, recovery objectives and game days.

### 312.2 User-journey SLOs

Define SLOs for business-critical journeys, not only servers:

- login and account switch;
- product/linesheet access;
- assortment save;
- order submission;
- payment authorization/capture;
- integration ingestion;
- inventory update freshness;
- DPP/product-safety publication;
- supplier acknowledgement;
- export generation;
- offline synchronization.

### 312.3 Example SLIs

- successful order submissions / valid attempts;
- p95 assortment-save latency;
- inventory events processed within freshness target;
- percentage of outbound messages acknowledged;
- percentage of payment commands with final state within target;
- percentage of read requests served with authorized, current data;
- reconciliation completion within SLA.

### 312.4 Error budget policy

When a journey consumes its error budget:

- pause risky feature rollout;
- reduce agent autonomy;
- prioritize reliability work;
- tighten change controls;
- communicate impact;
- resume only after recovery criteria.

### 312.5 Business calendar SLOs

SLOs may be stricter during:

- market appointments;
- seasonal order deadlines;
- major drops;
- invoicing/collection runs;
- regulatory submission windows;
- replenishment cutoffs.

---

## 313. Backup, Disaster Recovery and Tenant-safe Restore

### 313.1 Recovery classes

Classify data:

- financial/order ledger;
- product/specification history;
- operational state;
- media/assets;
- analytics/rebuildable data;
- integration queue;
- audit/security logs.

Each class receives RPO, RTO, backup, replication and restore requirements.

### 313.2 Required controls

- automated encrypted backups;
- separate fault domain/account;
- immutable backup protection where required;
- retention and legal hold;
- key recovery;
- restore testing;
- integrity verification;
- dependency order;
- DR configuration-drift monitoring;
- documented recovery owner.

### 313.3 Tenant-safe restore

Syntha must support:

- point-in-time tenant restore into isolated recovery space;
- object-level comparison;
- authorization review;
- selective merge through domain commands;
- no overwriting of later valid transactions;
- preservation of audit history;
- evidence of recovered/deleted objects.

A database snapshot must not be restored blindly over a live multi-tenant system.

### 313.4 Logical corruption scenario

Examples:

- integration sends mass incorrect prices;
- policy bug blocks/releases products incorrectly;
- user bulk-deletes content;
- schema migration corrupts relationships;
- AI agent creates invalid drafts.

Recovery requires event/object history and compensating actions, not only infrastructure failover.

### 313.5 DR tests

- regional outage;
- primary database loss;
- object storage corruption;
- identity provider outage;
- payment provider outage;
- queue/event-stream outage;
- lost encryption-key access;
- ransomware/admin compromise scenario;
- accidental tenant deletion;
- restore at order-deadline peak.

---

## 314. Incident Command, Customer Communication and Post-incident Learning

### 314.1 Incident severity

Severity considers:

- number/type of tenants;
- financial exposure;
- order/payment impact;
- compliance/safety impact;
- confidentiality/integrity impact;
- duration;
- workaround;
- deadline/event criticality.

### 314.2 Incident lifecycle

```text
DETECTED
→ TRIAGED
→ INCIDENT_DECLARED
→ CONTAINED
→ MITIGATED
→ RECOVERED
→ VERIFIED
→ CLOSED
→ POST_INCIDENT_ACTIONS
```

### 314.3 Command roles

- incident commander;
- technical lead;
- operations/business lead;
- security/privacy lead;
- communications lead;
- customer support lead;
- scribe/timeline owner;
- executive/legal escalation where needed.

### 314.4 Status communication

Messages must distinguish:

- investigating;
- identified;
- mitigation in progress;
- monitoring;
- resolved;
- data reconciliation pending.

`Service restored` does not automatically mean `all delayed transactions reconciled`.

### 314.5 Business-object impact list

For every incident, identify:

- failed commands;
- delayed events;
- possibly duplicated transactions;
- stale dashboards;
- affected orders/payments/shipments;
- missing acknowledgements;
- data requiring reconciliation;
- customers requiring direct notification.

### 314.6 Post-incident review

- factual timeline;
- user/business impact;
- detection gap;
- contributing conditions;
- safeguards that worked/failed;
- recovery result;
- corrective actions;
- owner/due date;
- recurrence test;
- no-blame process with accountable remediation.

---

## 315. Business Continuity and Graceful Degradation

### 315.1 Dependency criticality

Classify dependencies:

- authentication;
- product database;
- search;
- media/CDN;
- payment;
- tax;
- credit;
- carrier;
- ERP;
- PIM/PLM;
- email/SMS;
- AI/model provider;
- regulatory/third-party data.

### 315.2 Safe degraded modes

| Dependency unavailable | Safe behavior |
|---|---|
| Search | Navigate cached/recent authorized collections; no claim of complete results |
| ERP | Permit draft, block final action requiring current ERP validation |
| Inventory feed | Show last timestamp/confidence; apply hold or safety buffer |
| Payment provider | Preserve order draft; do not mark paid |
| Credit service | Use explicit manual-review/hold state, not assumed approval |
| Regulatory feed | Use last approved rule version with warning or block where policy requires current data |
| AI provider | Core deterministic workflow continues without recommendation |
| Email/SMS | Keep in-app task/notification and retry delivery |
| Analytics warehouse | Transactions continue; dashboards show freshness warning |

### 315.3 Peak-event continuity

For market events and order deadlines:

- pre-download authorized product/account data;
- preserve local drafts;
- generate unique offline command IDs;
- queue submissions;
- prevent duplicate order creation;
- display synchronization/reconciliation status;
- provide emergency support channel;
- maintain exportable recovery package.

### 315.4 Manual fallback governance

If a manual workaround is required:

- issue a controlled template;
- assign temporary IDs;
- define authority and cutoff;
- capture approvals;
- reconcile back to canonical objects;
- retire the workaround;
- prevent parallel uncontrolled spreadsheets.

---

## 316. Compliance, Trade and Market Access Control Tower

### 316.1 Portfolio view

Dashboards by:

- season;
- market;
- channel;
- category;
- brand;
- supplier/facility;
- responsible operator;
- regulation;
- evidence expiry;
- shipment/listing status.

### 316.2 Core metrics

- products eligible/blocked/data-required;
- evidence completeness;
- expiring certificates/tests;
- active safety notices;
- listing suspensions;
- chemical inventory conformance;
- classification coverage;
- origin/preference coverage;
- screening cases;
- DPP registration status;
- unsold-goods disposition;
- average time to marketability;
- blocked order/listing value;
- supplier response SLA.

### 316.3 Exception workbench

Each exception includes:

- affected product/market/channel;
- blocking rule;
- required evidence/action;
- owner;
- due date;
- financial/launch impact;
- possible alternatives;
- override eligibility;
- decision history.

### 316.4 No generic override

Overrides are rule-specific and time-limited. Safety, sanctions, active recall and legal prohibitions are not overrideable by normal commercial roles.

---

## 317. Version 3.2 competitive and capability gap matrix

| Capability | Benchmark / source | JOOR evidence status | Syntha target | Priority |
|---|---|---|---|---|
| Versioned regulatory applicability | EU regulatory implementation | NOT CONFIRMED | Regulatory Intelligence Engine | P0 |
| Online product-safety listing gate | GPSR | NOT CONFIRMED | Product Safety File and listing projection | P0 |
| Facility chemical inventory and MRSL | ZDHC | NOT CONFIRMED | Chemical/RSL/MRSL operating system | P0/P1 |
| DPP Registry integration | EU DPP implementation | NOT CONFIRMED | Registry/API registration and acknowledgements | P1 |
| Unsold textiles/footwear disposition governance | ESPR | NOT CONFIRMED | Unsold Goods Ledger | P1 |
| Market/channel-specific eligibility | Enterprise compliance benchmark | NOT CONFIRMED | Marketability Passport | P0 |
| Multi-country tariff classification | Descartes/trade benchmark | NOT CONFIRMED | Classification and duty workbench | P1 |
| Continuous restricted-party screening | Government/Descartes benchmark | NOT CONFIRMED | Transaction-linked screening cases | P0 |
| Origin and preference qualification | Global trade benchmark | NOT CONFIRMED | Origin calculation and evidence | P1 |
| Full wholesale Account 360 | CRM/MarketTime benchmark | PARTIAL/UAT | Relationship and profitability view | P1 |
| Whitespace/opportunity management | CRM benchmark | NOT CONFIRMED | Account growth workflow | P1 |
| Territory/call/offline rep operations | MarketTime | NOT CONFIRMED | Field Sales Operations | P1 |
| Hosted-buyer matching and schedule optimization | Swapcard | NOT CONFIRMED | Event Operating System | P2 |
| Meeting-to-order and event ROI | Event/wholesale benchmark | PARTIAL/UAT | Structured outcome attribution | P1/P2 |
| Translation memory and term bases | Phrase | NOT CONFIRMED | Localization Operations | P1 |
| Market-specific regulated-copy gate | Localization/compliance benchmark | NOT CONFIRMED | Localization readiness | P0/P1 |
| User-journey SLO/error-budget governance | Google SRE | NOT CONFIRMED | Reliability control plane | P0 |
| Tenant-safe point-in-time restore | AWS/enterprise SaaS benchmark | NOT CONFIRMED | Isolated restore and domain merge | P0 |
| Business-aware incident reconciliation | Enterprise/SRE benchmark | NOT CONFIRMED | Incident command and object impact | P0 |

---

## 318. New canonical entities

```text
RegulatoryAuthority
RegulationVersion
RegulatoryRuleSet
ApplicabilityRule
EvidenceRequirement
RegulatoryChangeImpact
ProductSafetyFile
ProductRiskAssessment
ResponsibleEconomicOperator
SafetyNotice
AuthorityRequest
MarketplaceTakedownRequest
ListingSuspension
ConsumerRemedyProgram
ChemicalFormulation
ChemicalManufacturer
SafetyDataSheet
TechnicalDataSheet
ChemicalCertificate
MRSLConformance
ChemicalLot
ChemicalInventoryPosition
ChemicalUseEvent
RestrictedSubstanceRule
ChemicalTestResult
DPPProfile
DPPDataSet
DPPRegistration
DPPRegistrySubmission
DPPRegistryAcknowledgement
DPPAccessPolicy
UnsoldGoodsPosition
DispositionDecision
UnsoldGoodsDisclosure
MarketabilityPassport
MarketabilityDecision
TradeProductProfile
TariffClassification
ClassificationCandidate
ClassificationRuling
DutyRate
TradeMeasure
TradeAgreement
LandedCostScenario
ScreeningRequest
ScreeningResult
PotentialMatchCase
ScreeningListSnapshot
OriginDetermination
SupplierOriginDeclaration
PreferenceQualification
CustomsDocumentPack
AccountHealthSnapshot
AccountRelationship
AccountWhitespace
Opportunity
OpportunityStageHistory
LostReason
TerritoryAssignment
CallReport
HostedBuyerProgram
HostedBuyerObligation
MeetingPreference
MeetingMatch
MeetingResource
AppointmentCheckIn
MeetingOutcome
EventAttribution
LocalizationPackage
LocaleProjection
TermBase
TermEntry
TranslationMemory
TranslationSegment
LocalizationQualityIssue
ServiceLevelIndicator
ServiceLevelObjective
ErrorBudget
RecoveryPolicy
BackupSnapshot
RestoreExercise
TenantRestoreRequest
Incident
IncidentImpact
IncidentUpdate
PostIncidentAction
BusinessContinuityPlan
DependencyHealth
DegradedModePolicy
```

---

## 319. New routes and workspaces

```text
/compliance/regulations
/compliance/applicability
/compliance/product-safety
/compliance/chemical-inventory
/compliance/restricted-substances
/compliance/dpp-registry
/compliance/unsold-goods
/compliance/marketability
/compliance/control-tower
/trade/classification
/trade/landed-cost
/trade/screening
/trade/origin
/trade/customs-packs
/accounts/:accountId/overview
/accounts/:accountId/health
/accounts/:accountId/opportunities
/accounts/:accountId/relationships
/sales/territories
/sales/field-workspace
/sales/call-reports
/events
/events/:eventId/hosted-buyers
/events/:eventId/matching
/events/:eventId/schedule
/events/:eventId/resources
/events/:eventId/outcomes
/localization/packages
/localization/term-bases
/localization/memory
/localization/quality
/admin/reliability/slos
/admin/reliability/error-budgets
/admin/reliability/backups
/admin/reliability/restores
/admin/incidents
/admin/business-continuity
```

---

## 320. New API outline

```text
POST   /api/v1/regulations
POST   /api/v1/regulations/:id/impact-analysis
POST   /api/v1/products/:id/applicability/evaluate
POST   /api/v1/products/:id/safety-files
POST   /api/v1/listings/:id/safety-validate
POST   /api/v1/safety-notices
POST   /api/v1/chemical-inventories/import
POST   /api/v1/chemical-formulations/:id/conformance/validate
POST   /api/v1/chemical-use/:id/authorize
POST   /api/v1/dpp/:id/registry-submit
POST   /api/v1/dpp/:id/registry-refresh
POST   /api/v1/unsold-goods/:id/disposition
POST   /api/v1/marketability-passports/evaluate
POST   /api/v1/trade/classifications/candidates
POST   /api/v1/trade/classifications/:id/approve
POST   /api/v1/trade/landed-cost/scenarios
POST   /api/v1/trade/screenings
POST   /api/v1/trade/screenings/:id/review
POST   /api/v1/trade/origin/determine
POST   /api/v1/accounts/:id/health/recalculate
POST   /api/v1/accounts/:id/whitespace/analyze
POST   /api/v1/opportunities
POST   /api/v1/territories/:id/validate-overlap
POST   /api/v1/call-reports
POST   /api/v1/events/:id/matches/generate
POST   /api/v1/events/:id/schedules/publish
POST   /api/v1/appointments/:id/check-in
POST   /api/v1/appointments/:id/outcomes
POST   /api/v1/localization/packages
POST   /api/v1/localization/packages/:id/quality-check
POST   /api/v1/locale-projections/:id/publish
POST   /api/v1/reliability/slos
POST   /api/v1/restores/:id/exercise
POST   /api/v1/incidents
POST   /api/v1/incidents/:id/impacts/reconcile
```

Mutations require idempotency keys, authorization context, source/evidence references and optimistic concurrency.

---

## 321. New domain events

```text
regulation_version_published
regulatory_scope_changed
regulatory_impact_calculated
product_applicability_evaluated
product_safety_file_approved
listing_safety_validation_failed
safety_notice_received
listing_suspended_for_safety
chemical_inventory_imported
chemical_formulation_conformance_expired
chemical_use_blocked
restricted_substance_test_failed
dpp_registry_submission_sent
dpp_registry_submission_accepted
dpp_registration_revoked
unsold_goods_disposition_approved
marketability_passport_issued
marketability_passport_suspended
classification_candidate_generated
tariff_classification_approved
landed_cost_scenario_calculated
restricted_party_potential_match_found
restricted_party_match_cleared
transaction_released_after_screening
origin_determination_approved
preference_qualification_expired
account_health_changed
account_whitespace_identified
opportunity_stage_changed
territory_overlap_detected
call_report_submitted
hosted_buyer_match_generated
event_schedule_published
appointment_checked_in
meeting_outcome_recorded
event_attribution_calculated
localization_package_created
regulated_translation_approved
localization_quality_check_failed
locale_projection_published
slo_breached
error_budget_exhausted
backup_restore_test_completed
tenant_restore_requested
incident_declared
incident_impact_reconciled
business_continuity_mode_activated
```

---

## 322. Additional UAT scenarios

1. A regulation scope changes and only affected products/markets are recalculated.
2. Missing applicability data returns `INSUFFICIENT_DATA`, not `NOT_APPLICABLE`.
3. Consumer listing is blocked because responsible-economic-operator data is missing.
4. Warning translation is outdated after source change; only affected market listing is suspended.
5. Product-safety notice identifies all listings, orders and unsold inventory using the affected version.
6. Chemical formulation certificate expires while stock remains at a factory; new use is blocked.
7. Facility imports a chemical inventory with duplicate formulation/lot records and receives reconciliation issues.
8. MRSL pass is not accepted as proof of finished-product RSL compliance.
9. Failed finished-product chemical test quarantines only affected batches and linked inventory.
10. DPP registry submission receives rejection; publication stays blocked and error is traceable.
11. DPP profile changes for textiles; impacted records are versioned and revalidated.
12. Unsold product is proposed for destruction where policy prohibits it; workflow blocks the decision.
13. Marketability passport is eligible for one country but blocked for another due to missing language warning.
14. Product classification suggestion lacks composition detail and cannot be approved.
15. Tariff change does not silently recalculate a historical landed-cost snapshot.
16. Preference claim expires before shipment and duty scenario is recalculated.
17. Counterparty is clear at onboarding but becomes a potential match after list update; affected transaction is held.
18. Fuzzy restricted-party match is reviewed as false positive with documented identifiers.
19. Account hierarchy merges two duplicate locations without losing order history.
20. Account health falls because of unresolved claims despite growing gross order value.
21. Whitespace recommendation excludes products outside territory or commercial access.
22. Territory overlap assigns the order to a dispute workflow rather than silently double-paying commission.
23. Offline rep creates an order draft and reconnects after price/availability changed; validation is required.
24. Hosted-buyer schedule respects mutual preferences, travel buffers and room capacity.
25. Sponsored priority is applied only where event policy permits and remains visible in schedule evidence.
26. Cancelled appointment releases the room and sample set without deleting history.
27. Meeting notes create a draft proposal but do not send it before buyer/rep review.
28. Event attribution distinguishes sourced, assisted and closed revenue.
29. Translation memory from one tenant is not accessible to another tenant.
30. Machine translation draft for safety warning cannot publish without required human/legal approval.
31. Source product description changes; unaffected approved translation segments remain valid.
32. RTL locale projection passes content but fails layout validation and is blocked.
33. Order-submission SLO breaches during a market event and feature rollout is paused.
34. Payment provider outage preserves draft/order state but never displays payment success.
35. Regional DR restores within target and transaction reconciliation confirms no duplicate commands.
36. Tenant point-in-time restore is performed in isolation and selectively merged through domain commands.
37. Database recovers but delayed integration events remain; incident is not marked fully reconciled early.
38. Analytics outage shows stale timestamp while transactional ordering continues.
39. AI provider outage disables recommendations but deterministic compliance/order workflows remain available.
40. Manual emergency workaround is reconciled and formally retired after service recovery.

---

## 323. Version 3.2 delivery roadmap and final decisions

### P0 — legal sellability and platform continuity

1. Regulatory version/applicability model.
2. Marketability Passport.
3. Product Safety File and listing safety gate.
4. Restricted-party continuous screening.
5. Regulated-copy localization gate.
6. User-journey SLOs and incident command.
7. Backup, restore and tenant-safe recovery testing.
8. Compliance/market-access exception workbench.

### P1 — operational compliance and account growth

1. Chemical inventory, MRSL and RSL workflow.
2. Trade classification, duty and landed cost.
3. Origin/preference evidence.
4. DPP Registry integration.
5. Unsold Goods Ledger.
6. Account 360, account health and whitespace.
7. Opportunity and field-sales operations.
8. Localization packages, term bases and translation memory.

### P2 — market-event network effects

1. Hosted Buyer Program.
2. Match and schedule optimizer.
3. Resource and sample-set scheduling.
4. Meeting-to-proposal/intent conversion.
5. Event ROI and attribution.
6. Advanced account-growth recommendations.

### Final decisions

1. **Sellability is market-, channel-, entity- and date-specific.** A generic product-ready flag is insufficient.
2. **Regulation scope and interpretation are versioned data.** Missing information never means non-applicability.
3. **Safety, sanctions, recall and legal prohibitions cannot be bypassed by a commercial override.**
4. **DPP is a governed product dataset and registry lifecycle, not merely a QR page.**
5. **Chemical input compliance, finished-product compliance and facility inventory are separate evidence layers.**
6. **Account growth must be connected to profitability, service, receivables and operational outcomes.**
7. **Appointments are structured commercial workflows, not calendar notes.**
8. **Localization includes legal, technical, numerical and channel adaptation, not only translation.**
9. **Reliability is measured through buyer, supplier and finance journeys.**
10. **Recovery is incomplete until delayed, duplicated and uncertain business transactions are reconciled.**

### Official source register for version 3.2

EU product safety and ESPR/DPP:

- https://www.consilium.europa.eu/en/policies/product-safety-market-surveillance/
- https://eur-lex.europa.eu/legal-content/en/ALL/?uri=CELEX%3A02023R0988-20260529
- https://single-market-economy.ec.europa.eu/single-market/goods/european-standards/harmonised-standards/digital-product-passport-dpp_en
- https://single-market-economy.ec.europa.eu/news/digital-product-passport-registry-now-live-2026-07-20_en
- https://green-forum.ec.europa.eu/news/ecodesign-sustainable-products-regulation-moves-implementation-2026-07-02_en
- https://www.consilium.europa.eu/en/policies/ecodesign-requirements-for-more-sustainable-products/
- https://environment.ec.europa.eu/news/commission-updates-product-scope-and-tools-support-eudr-2026-07-13_en

Chemical management:

- https://knowledge-base.roadmaptozero.com/hc/en-gb/articles/11716715527581-ZDHC-MRSL-Conformance-Guidance
- https://knowledge-base.roadmaptozero.com/hc/en-gb/articles/360009224998-What-is-the-ZDHC-Gateway-Chemical-Module
- https://knowledge-base.roadmaptozero.com/hc/en-gb/articles/23641380834589-Input-Management

Global trade:

- https://www.trade.gov/consolidated-screening-list
- https://www.descartes.com/solutions/global-trade-intelligence/product-classification-and-duty-determination
- https://www.descartes.com/solutions/global-trade-intelligence

Sales and events:

- https://www.markettime.com/sales-agencies/
- https://www.swapcard.com/features/hosted-buyer-software
- https://help.swapcard.com/en/articles/11985775-how-to-set-up-a-hosted-buyer-event
- https://www.swapcard.com/features/event-networking

Localization:

- https://phrase.com/platform/tms/
- https://support.phrase.com/hc/en-us/articles/5709733372188-Term-Bases-Overview
- https://phrase.com/blog/posts/translation-management-software-localization-and-translation-workflow/

Reliability:

- https://sre.google/sre-book/service-level-objectives/
- https://sre.google/sre-book/service-best-practices/
- https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/reliability.html
- https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/plan-for-disaster-recovery-dr.html

## 324. Version 3.3 scope — concurrent planning, supplier execution and process intelligence

### 324.1 Evidence boundary

Version 3.3 extends the master map with capabilities confirmed in current NuORDER release notes and official documentation from adjacent supply-chain planning, supplier-collaboration, process-intelligence, should-cost and product-carbon standards.

The following labels remain mandatory:

- `JOOR OBSERVED` — directly visible in the audited Retailer / LITE account;
- `JOOR PARTIAL / GATED / UAT` — visible only in part, limited by role/tier, or not safely executable;
- `JOOR NOT CONFIRMED` — not confirmed in the audited account and public evidence used for this document;
- `COMPETITOR CONFIRMED` — supported by an official competitor or standards source;
- `SYNTHA TARGET` — target product requirement;
- `DECISION` — adopted architecture rule;
- `UAT` — requires controlled testing.

### 324.2 Strategic direction

Syntha must now connect four loops that are usually separated:

```text
COMMERCIAL LOOP
Discovery → Assortment → Intent → Order → Account Growth

SUPPLY LOOP
Forecast → Capacity → Material → Production → Delivery

FINANCIAL LOOP
Cost → Price → Margin → Invoice → Cash → Net-Net Outcome

LEARNING LOOP
Event History → Process Analysis → Decision Quality → Policy Change
```

The strongest competitive advantage is not another dashboard. It is the ability to propagate a commercial change through supply, finance and execution immediately, then measure whether the decision improved the final outcome.

---

## 325. NuORDER 2026 operational delta — Product Directory, SMU resolution and recommendation loops

### 325.1 COMPETITOR CONFIRMED

Current NuORDER documentation confirms:

- a centralized Product Directory for brand administrators;
- retailer profiles that unify company information, locations, buyers and organization-linked orders;
- brand recommendations based on existing connections and recent orders;
- bulk linking and auto-matching of Special Make Ups / placeholders to real brand products;
- preservation of assortment quantities, door distribution, notes and custom attributes when a placeholder is linked;
- export/import of customized cart data without losing customization selections;
- product customization with controlled logos, proof/approval states and option-based prices;
- sales overview by orders, units, companies, status and Immediate versus Prebook order types.

### 325.2 JOOR evidence status

The audited JOOR cabinet showed catalog, product detail, linesheets, brands, connections, orders, account switching and gated assortment tools. The following were not confirmed as one governed operational model:

- a canonical product operations directory spanning PLM, wholesale and channel projections;
- bulk placeholder-to-product resolution with confidence, preservation rules and approval;
- network recommendations with explainable evidence and tenant-safe learning;
- organization-level order visibility combined with field-level confidentiality;
- controlled customization import/export preserving versioned technical and commercial context.

Status: `JOOR PARTIAL / NOT CONFIRMED / UAT`.

### 325.3 SYNTHA TARGET

Add the following connected workspaces:

```text
Product Operations Directory
Placeholder Resolution Queue
Network Recommendation Center
Customization Operations
Organization Order Overview
```

The Product Directory is not a second product master. It is an operational projection of canonical product, specification, content, commercial and channel-readiness data.

---

## 326. Product Operations Directory

### 326.1 Purpose

The Product Operations Directory must provide a single operational list of all product records that can be acted upon by brand, retailer, PLM, merchandising, content, compliance and wholesale teams.

### 326.2 Required columns and views

- canonical product ID;
- brand style code;
- season, collection and drop;
- style, colorway and SKU counts;
- lifecycle state;
- commercial state;
- technical-readiness state;
- marketability state;
- wholesale publication state;
- channel projection states;
- product owner;
- unresolved specification issues;
- missing images/content;
- missing price/availability;
- active retailer/market restrictions;
- open samples/tests;
- open orders and production commitments;
- last source update;
- last downstream synchronization;
- data-quality score;
- blocking reason.

Saved views:

- Ready to Publish;
- Missing Commercial Data;
- Missing Technical Data;
- Missing Compliance Evidence;
- Active but No Availability;
- Open Orders with Product Change;
- Superseded Product Versions;
- Carry-over Candidates;
- High Return / Fit Risk;
- High Carbon / Cost Exposure;
- Unmapped External Product IDs.

### 326.3 Bulk actions

Bulk actions must use controlled commands, not direct field overwrite:

- assign owner;
- request missing data;
- submit for readiness review;
- publish/unpublish channel projection;
- activate/deactivate season;
- generate content package;
- initiate specification change;
- create carry-over version;
- propose duplicate merge;
- apply taxonomy mapping;
- export selected projection;
- create buyer/retailer custom list.

### 326.4 Product lifecycle separation

```text
Technical Lifecycle
Commercial Lifecycle
Channel Publication Lifecycle
Inventory Lifecycle
Regulatory Lifecycle
```

These states must not be collapsed. A product can be technically approved but commercially inactive, or commercially active but blocked for one market.

---

## 327. Placeholder / SMU Resolution Engine

### 327.1 Purpose

Retailers and brands frequently plan with placeholders, SMUs, provisional style concepts or retailer-created rows before final product data exists. Syntha must preserve planning work while safely resolving those placeholders to canonical products.

### 327.2 Canonical objects

```text
PlaceholderProduct
PlaceholderRequirement
ProductMatchCandidate
ProductMatchDecision
PlaceholderResolution
ResolutionConflict
```

### 327.3 Match signals

- brand;
- style code;
- provisional code;
- product name;
- category and subcategory;
- color family;
- delivery window;
- wholesale price band;
- silhouette/fit;
- material/composition;
- image similarity;
- season/drop;
- supplier/factory reference;
- previously linked placeholder history.

### 327.4 Resolution rules

When linking a placeholder to a canonical product, the system must classify every field as:

- replace with canonical value;
- preserve retailer planning value;
- retain as private retailer attribute;
- merge;
- require conflict decision;
- archive as historical placeholder evidence.

Quantities, door allocations, buyer notes, targets and internal attributes must not be lost.

### 327.5 Match decision

The decision packet includes:

- candidate list;
- confidence by signal;
- conflicting fields;
- selected match;
- rejected candidates;
- data preservation preview;
- downstream impact;
- approver;
- effective date;
- rollback window.

### 327.6 Anti-error controls

- never auto-link across brands without explicit permission;
- prevent linking one placeholder to several incompatible product versions;
- detect already-linked product reuse where exclusivity applies;
- require review when price, delivery, category or gender materially conflicts;
- preserve historical assortment snapshots;
- support unlink/relink through a controlled event, never silent replacement.

---

## 328. Concurrent Planning Graph

### 328.1 Benchmark

Kinaxis describes concurrent planning as synchronized planning across demand, supply, inventory and operations, with real-time visibility, scenario evaluation and actionable insight in one environment. Its control-tower model links planning and execution data across functions and partners.

### 328.2 JOOR evidence status

Concurrent propagation of demand, supply, inventory, production and financial changes was not confirmed in the audited JOOR cabinet.

Status: `JOOR NOT CONFIRMED / UAT`.

### 328.3 SYNTHA TARGET

Create a `PlanningGraph` linking:

```text
Financial Target
→ Merchandise Plan
→ Assortment Plan
→ Buying Intent
→ Demand Forecast
→ Supply Plan
→ Material Plan
→ Capacity Plan
→ Production Plan
→ Inventory Plan
→ Fulfillment Plan
→ Cash Plan
```

### 328.4 Planning node contract

Every planning node stores:

- planning object type;
- grain;
- time bucket;
- scenario/version;
- baseline value;
- current value;
- source inputs;
- derived calculations;
- constraints;
- owner;
- approval state;
- effective horizon;
- freshness;
- confidence;
- linked execution objects.

### 328.5 Propagation requirement

A change to any planning node must show:

- direct impact;
- indirect impact;
- affected targets;
- affected orders/commitments;
- feasibility conflicts;
- cash and margin impact;
- service impact;
- recommended responses;
- unresolved decisions.

Example:

```text
Material lead time +21 days
→ Sample approval risk
→ Production start risk
→ Delivery-window risk
→ Retail launch risk
→ Revenue timing risk
→ OTB and cash-flow impact
```

---

## 329. Scenario Workbench and Scenario Governance

### 329.1 Scenario types

- demand upside/downside;
- delayed material;
- supplier capacity loss;
- factory shutdown;
- port/carrier disruption;
- FX movement;
- duty/tariff change;
- price increase;
- MOQ change;
- promotion uplift;
- warm/cold weather shift;
- store opening/closure;
- wholesale customer loss;
- quality failure;
- recall;
- credit restriction;
- production acceleration;
- assortment reduction;
- transfer/markdown alternative.

### 329.2 Scenario lifecycle

```text
DRAFT
→ CALCULATING
→ VALIDATED
→ REVIEWED
→ APPROVED_FOR_DECISION
→ SELECTED
→ EXECUTION_PLAN_CREATED
→ EXECUTED
→ OUTCOME_MEASURED
→ ARCHIVED
```

### 329.3 Required scenario outputs

- revenue;
- gross margin;
- net-net margin;
- cash timing;
- inventory units/value;
- stockout risk;
- excess risk;
- service level;
- fill rate;
- delivery risk;
- production utilization;
- material shortage;
- carbon impact;
- customer/account impact;
- contractual exposure;
- required approvals.

### 329.4 Scenario comparison

Scenarios must be comparable on one normalized baseline, using the same:

- source-data snapshot;
- forecast version;
- FX version;
- cost version;
- policy version;
- calendar;
- market assumptions.

### 329.5 Scenario-to-execution control

Selecting a scenario does not directly alter production or orders. It creates an `ExecutionPlan` with commands, owners, due dates, dependencies, reversibility and approval checkpoints.

---

## 330. Constraint Propagation and Feasibility Engine

### 330.1 Constraint domains

- assortment and OTB;
- material MOQ and availability;
- supplier/factory capacity;
- labor and machine capacity;
- production sequence;
- sample/test approval;
- regulatory readiness;
- customer allocation;
- delivery windows;
- transportation capacity;
- credit and cash;
- warehouse/store capacity;
- carbon or sustainability policy;
- contractual exclusivity.

### 330.2 Feasibility states

```text
FEASIBLE
FEASIBLE_WITH_RISK
FEASIBLE_WITH_EXCEPTION
PARTIALLY_FEASIBLE
INFEASIBLE
UNKNOWN_DUE_TO_DATA_GAP
```

### 330.3 Binding-constraint explanation

For every infeasible or constrained result, show:

- binding constraint;
- source and version;
- effective date;
- impacted quantity/date/value;
- available slack;
- alternative options;
- commercial impact;
- required approver;
- evidence quality.

### 330.4 Least-violation plan

Where policy permits, calculate alternatives such as:

- reduce quantity;
- split delivery;
- substitute material;
- change factory;
- expedite;
- defer lower-priority account;
- reallocate inventory;
- change assortment;
- revise price/promotion;
- use controlled exception.

The engine must never hide a violated rule inside an optimized result.

---

## 331. Demand Signal Hierarchy and Forecast Consumption

### 331.1 Signal classes

```text
Market / Trend Signal
Consumer Test
Buyer Engagement
Buyer Shortlist
Assortment Selection
Order Intent
Wholesale PO
Retail Preorder
POS Sale
Return
Lost Sale
Markdown
```

### 331.2 Signal strength

Each signal stores:

- signal class;
- quantity/value;
- probability;
- source;
- timestamp;
- horizon;
- customer/segment;
- product granularity;
- confidence;
- bias history;
- whether it is contractual;
- whether it consumes forecast.

### 331.3 Forecast consumption rules

- a confirmed PO consumes the applicable forecast bucket;
- an order intent reserves optional/soft demand according to policy;
- consumer-test intent informs forecast but does not consume it;
- duplicate signals from the same underlying demand must be deduplicated;
- cancellation releases consumed demand;
- shipment and sale close the relevant forecast-to-actual chain;
- late events are applied without rewriting certified historical snapshots.

### 331.4 Double-count prevention

The system must detect patterns such as:

```text
Buyer Intent + PO for the same demand
Preorder + POS Sale for the same unit
Marketplace Click + Cart + Order treated as three independent demands
```

---

## 332. Forecast Value Add and Override Accountability

### 332.1 Purpose

Syntha must measure whether human and model interventions improve the forecast rather than merely recording that an override occurred.

### 332.2 Forecast versions

```text
Naive Baseline
Statistical Forecast
ML Forecast
Consensus Forecast
Buyer Override
Merchant Override
Sales Override
Supplier Constraint Adjustment
Approved Operating Forecast
```

### 332.3 Core formulas

```text
Forecast Error = Actual - Forecast
Absolute Percentage Error = |Actual - Forecast| / Actual
Forecast Bias = Sum(Forecast - Actual) / Sum(Actual)
Forecast Value Add = Error(Baseline) - Error(Adjusted Forecast)
```

Use WAPE/MAE or alternative measures where actuals are zero or highly intermittent.

### 332.4 Override record

Every override requires:

- previous value;
- new value;
- reason code;
- narrative;
- affected horizon;
- evidence;
- owner;
- approval where required;
- expected impact;
- later actual outcome;
- measured value add.

### 332.5 Decision-quality view

Report forecast performance by:

- model/version;
- planner;
- buyer/merchant;
- brand;
- category;
- horizon;
- season;
- new versus carry-over;
- promotion/weather event;
- sparse versus mature data.

The objective is not to punish overrides, but to learn where human context adds value and where it introduces bias.

---

## 333. Capacity Reservation and Constrained Supply

### 333.1 Capacity objects

```text
CapacityResource
CapacityCalendar
CapacityBucket
CapacityOffer
CapacityReservation
CapacityCommitment
CapacityConsumption
CapacityRelease
CapacityException
```

### 333.2 Capacity dimensions

- supplier/factory;
- production line;
- operation type;
- skill;
- machine/tool;
- style/category;
- material/process dependency;
- week/day/shift;
- minimum run;
- setup/changeover;
- overtime;
- subcontracting;
- efficiency and yield;
- approved versus theoretical capacity.

### 333.3 Reservation types

- indicative;
- soft reservation;
- paid option;
- hard reservation;
- order-backed commitment;
- emergency hold;
- customer-dedicated capacity.

### 333.4 Reservation lifecycle

```text
REQUESTED
→ OFFERED
→ NEGOTIATING
→ RESERVED
→ COMMITTED
→ CONSUMED
```

Alternative states:

```text
PARTIALLY_RESERVED
EXPIRED
RELEASED
BREACHED
REALLOCATED
CANCELLED
```

### 333.5 Commercial controls

- reservation fee;
- expiry;
- cancellation fee;
- take-or-pay obligation;
- minimum utilization;
- priority tier;
- reallocation rights;
- compensation for breach;
- linkage to agreement and buying intent.

---

## 334. Scarce Supply Allocation and Fairness Governance

### 334.1 Allocation contexts

- limited initial production;
- bestseller shortage;
- delayed material;
- factory capacity loss;
- partial inbound receipt;
- recall replacement;
- constrained transport;
- new-launch allocation.

### 334.2 Allocation policy dimensions

- contractual commitment;
- customer priority tier;
- confirmed order date;
- launch importance;
- minimum presentation quantity;
- store/account productivity;
- margin and net-net value;
- strategic-account rule;
- fairness/minimum service;
- geographic balance;
- regulatory restrictions;
- customer-specific exclusivity;
- cancellation risk;
- inventory already available.

### 334.3 Allocation result

For every line/account:

- requested quantity;
- committed quantity;
- allocated quantity;
- short quantity;
- priority score components;
- binding constraint;
- reason code;
- alternative date/source;
- financial impact;
- approval/override history.

### 334.4 Fairness controls

- prevent hidden discrimination using protected or irrelevant attributes;
- expose strategic-account weighting;
- enforce minimum-service rules where configured;
- compare outcome concentration;
- preserve manual override reason;
- support appeals/dispute case;
- simulate policy before activation.

---

## 335. Supplier PO Collaboration benchmark

### 335.1 COMPETITOR CONFIRMED

Coupa Supplier Portal supports:

- purchase-order receipt through portal, cXML or email/HTML;
- header- or line-level confirmations;
- confirmation due times;
- accept/reject actions;
- confirmed quantity, price and need-by/delivery changes;
- reason codes and comments;
- bulk CSV confirmation;
- advance ship notices;
- shipment/tracking information;
- invoice creation from PO;
- transaction status and history.

### 335.2 JOOR evidence status

The audited JOOR account exposed retailer orders but did not confirm a full supplier/factory PO-collaboration protocol with line-level acknowledgement, supplier-proposed changes, ASN, receipt and invoice reconciliation.

Status: `JOOR NOT CONFIRMED / UAT`.

### 335.3 SYNTHA TARGET

Implement a multi-channel supplier collaboration layer:

```text
Portal
API
EDI / cXML
SFTP / CSV
Actionable Email
Mobile
```

All channels resolve to the same canonical commands and event history.

---

## 336. Purchase Order Confirmation and Change Protocol

### 336.1 Confirmation scopes

- whole PO;
- delivery group;
- line;
- SKU/size;
- schedule line;
- production lot.

### 336.2 Supplier responses

```text
ACCEPT
ACCEPT_WITH_CHANGES
PARTIAL_ACCEPT
REJECT
REQUEST_CLARIFICATION
DEFER_DECISION
```

Proposed changes may include:

- quantity;
- price;
- delivery date;
- ship date;
- factory;
- material;
- pack configuration;
- MOQ/MOV;
- payment/deposit condition;
- split shipment;
- cancellation.

### 336.3 Buyer resolution

```text
PROPOSAL_RECEIVED
→ IMPACT_CALCULATED
→ BUYER_REVIEW
→ ACCEPTED / COUNTERED / REJECTED
→ PO_AMENDMENT_CREATED
→ SUPPLIER_ACKNOWLEDGED
```

### 336.4 Time controls

- acknowledgement deadline;
- escalation before due time;
- overdue confirmation state;
- automatic risk score increase;
- controlled alternate-source search;
- customer communication trigger;
- history preserved after cancellation.

### 336.5 Concurrency protection

A supplier cannot confirm an obsolete PO version. Every confirmation carries:

- PO version;
- line version;
- current ETag/version precondition;
- idempotency key;
- responding organization and user;
- received timestamp;
- source channel.

---

## 337. PO → ASN → Receipt → Invoice Execution Chain

### 337.1 Canonical chain

```text
Purchase Order
→ Order Confirmation
→ Production / Supply Commitment
→ ASN
→ Shipment
→ Goods Receipt
→ Quality Acceptance
→ Invoice
→ Payment
```

### 337.2 ASN requirements

- PO and line references;
- shipment identifier;
- ship-from and ship-to;
- carrier/service;
- planned ship/arrival;
- carton/pallet/SSCC;
- SKU quantities;
- lot/batch/serial where applicable;
- packing-list documents;
- customs/trade documents;
- split/backorder indication;
- tracking;
- hazardous/special handling;
- cancellation/replacement chain.

### 337.3 Reconciliation dimensions

- ordered;
- confirmed;
- shipped;
- received;
- accepted;
- rejected/quarantined;
- invoiced;
- credited;
- paid.

### 337.4 Tolerance policy

Tolerance may be configured by:

- supplier;
- product/category;
- quantity;
- price;
- date;
- currency;
- delivery;
- unit of measure;
- over/under shipment;
- invoice amount.

Outside-tolerance values create a case; they do not silently pass.

---

## 338. Multi-enterprise Exception Case Management

### 338.1 Purpose

Messages, comments and alerts are insufficient for complex exceptions. Syntha needs a structured case that connects the business issue to all affected objects and decisions.

### 338.2 Case types

- PO confirmation delay;
- supplier change request;
- capacity shortage;
- material delay;
- sample/test failure;
- quality defect;
- shipment delay;
- quantity discrepancy;
- invoice mismatch;
- payment dispute;
- compliance block;
- recall;
- return/claim;
- data-quality issue;
- integration failure;
- commercial-term dispute.

### 338.3 Case model

```text
ExceptionCase
CaseParticipant
CaseObjectLink
CaseIssue
CaseEvidence
CaseDecision
CaseAction
CaseSLA
CaseEscalation
CaseResolution
CaseFinancialImpact
```

### 338.4 Lifecycle

```text
OPEN
→ TRIAGED
→ OWNER_ASSIGNED
→ INVESTIGATING
→ RESPONSE_REQUIRED
→ DECISION_PENDING
→ REMEDIATION
→ VERIFICATION
→ RESOLVED
→ CLOSED
```

Alternative states:

```text
ON_HOLD
ESCALATED
DISPUTED
REOPENED
DUPLICATE
CANCELLED
```

### 338.5 Collaboration rules

- internal and external notes are separate;
- each participant sees only authorized fields and evidence;
- decisions are immutable records;
- attachments are linked to canonical evidence objects;
- external partner response deadlines are explicit;
- commercial and financial impact updates dynamically;
- case closure requires resolution criteria, not only a comment.

---

## 339. Object-Centric Process Intelligence benchmark

### 339.1 COMPETITOR CONFIRMED

Celonis defines object-centric process mining as analysis of related business objects, events and relationships using one reusable model. Official documentation supports perspectives, process-health KPIs, bottleneck analysis, target-process/adherence models and deviation exploration.

### 339.2 JOOR evidence status

Process discovery, object-centric conformance, variant analysis and automated bottleneck identification were not confirmed in the audited JOOR cabinet.

Status: `JOOR NOT CONFIRMED / UAT`.

### 339.3 SYNTHA TARGET

Use the canonical event model already defined in this master map to build a `Process Intelligence Layer` rather than exporting data into disconnected BI tables.

Core object types:

```text
Style
Sample
Material
Supplier
RFQ
Quote
BOM
BuyingIntent
PurchaseOrder
ProductionOrder
Shipment
Receipt
Invoice
Payment
Return
Case
```

---

## 340. Process Model, Variant and Conformance

### 340.1 Process perspectives

- Concept to Approved Style;
- Sample Request to Fit Approval;
- Material Request to BOM Approval;
- RFQ to Supplier Allocation;
- Buying Intent to Purchase Order;
- PO to Supplier Confirmation;
- PO to Receipt;
- Receipt to Invoice Match;
- Invoice to Payment;
- Order to Cash;
- Return to Recovery;
- Product Incident to Recall Closure.

### 340.2 Target process definition

Each target process specifies:

- expected event order;
- permitted optional events;
- prohibited events;
- maximum/minimum duration;
- mandatory approvals;
- separation-of-duty rules;
- rework limits;
- data prerequisites;
- acceptable exception paths.

### 340.3 Conformance result

For every object/process instance:

- compliant/non-compliant;
- missing events;
- unexpected events;
- sequence deviation;
- timing deviation;
- repeated/rework loop;
- unauthorized transition;
- business impact;
- responsible role/system;
- recommended remediation.

### 340.4 Variant analysis

Identify:

- dominant successful variant;
- high-margin variant;
- fastest variant;
- lowest-rework variant;
- high-risk variant;
- supplier-specific variants;
- region/channel variants;
- manual-workaround variants;
- variants correlated with late delivery or claims.

---

## 341. Bottleneck, Rework and Waiting-Time Intelligence

### 341.1 Time decomposition

```text
Total Cycle Time
= Active Work Time
+ Waiting for Internal Decision
+ Waiting for External Partner
+ System/Integration Delay
+ Queue Time
+ Rework Time
```

### 341.2 Rework examples

- sample revision loops;
- repeated cost approval;
- BOM reopened after approval;
- PO amended multiple times;
- invoice repeatedly rejected;
- content corrected after retailer rejection;
- manual identity remapping;
- repeated data import correction.

### 341.3 Root-cause dimensions

- product complexity;
- supplier/factory;
- buyer/brand team;
- category;
- market;
- missing data;
- policy version;
- integration channel;
- order value/priority;
- workload;
- season peak;
- source-system quality.

### 341.4 Action trigger

A process insight may create:

- task;
- case;
- policy-change proposal;
- workflow-change proposal;
- data-quality issue;
- supplier improvement action;
- training recommendation;
- automation candidate.

No automatic policy change occurs solely from correlation.

---

## 342. Digital Process Twin and Historical Replay

### 342.1 Purpose

Before changing workflow, policy or automation, Syntha should replay historical event data against the proposed configuration.

### 342.2 Replay inputs

- selected historical period;
- object population;
- target workflow version;
- target policy version;
- SLA rules;
- automation rules;
- exception thresholds;
- cost assumptions.

### 342.3 Replay outputs

- number of cases that would follow a different path;
- new blocks and approvals;
- estimated cycle-time change;
- workload by role;
- expected exception volume;
- false-positive candidates;
- financial and service impact;
- affected integrations;
- unhandled edge cases.

### 342.4 Safety rules

- replay is read-only;
- historical records are never rewritten;
- replay results are explicitly labeled simulated;
- production activation requires approved test evidence;
- sensitive data remains scoped to authorized analysts.

---

## 343. Should-Cost Engineering benchmark

### 343.1 COMPETITOR CONFIRMED

aPriori defines should-cost analysis as a bottom-up calculation of material, manufacturing, service and distribution costs using efficient production practices and current regional inputs.

### 343.2 JOOR evidence status

The audited JOOR cabinet did not confirm engineering-grade bottom-up should-cost modeling linked to BOM, BOL, factory capability, regional labor, machine/process and logistics data.

Status: `JOOR NOT CONFIRMED / UAT`.

### 343.3 SYNTHA TARGET

Build a fashion-specific should-cost model:

```text
Material Cost
+ Trim Cost
+ Packaging Cost
+ Labor Operations
+ Machine / Process Cost
+ Waste / Yield
+ Overhead
+ Compliance / Testing
+ Quality Cost
+ Logistics / Duty
+ Financing / FX
+ Supplier Margin
= Should Cost
```

---

## 344. Cost Driver Library and Manufacturing Assumptions

### 344.1 Cost drivers

- material price by supplier/region/date;
- consumption and marker efficiency;
- waste and defect allowance;
- operation standard minute value;
- labor rate by facility/skill/shift;
- machine rate;
- setup/changeover;
- order quantity and learning curve;
- complexity factor;
- embellishment/printing/wash;
- quality inspection/testing;
- energy and utility assumptions;
- packaging;
- freight and duty;
- capacity utilization;
- financing period;
- supplier margin.

### 344.2 BOL connection

Every operation in the Bill of Labor links to:

- standard method;
- equipment;
- skill;
- standard time;
- allowed tolerance;
- facility capability;
- benchmark rate;
- observed actual rate;
- source and effective date.

### 344.3 Assumption reliability

Each cost input has:

- source;
- geography;
- currency;
- effective date;
- confidence;
- verified/estimated status;
- owner;
- expiry;
- sensitivity range.

---

## 345. Quote Decomposition and Negotiation Workspace

### 345.1 Quote structure

Supplier quotations must be decomposable into:

- material;
- trims;
- packaging;
- labor;
- process;
- overhead;
- testing/compliance;
- freight;
- duty/tax if included;
- tooling/development;
- margin;
- MOQ/MOV;
- capacity/lead time;
- payment terms.

### 345.2 Variance analysis

```text
Supplier Quote
- Should Cost
= Quote Variance
```

Variance is explained by driver, not only total amount.

### 345.3 Negotiation packet

- current quote version;
- should-cost version;
- comparable supplier/factory range;
- material-market movement;
- labor/process assumptions;
- quantity breakpoints;
- lead-time/capacity tradeoffs;
- requested change;
- supplier response;
- agreed concession;
- non-price value;
- expiry and effective date.

### 345.4 Governance

Should cost is a decision aid, not an accusation. The UI must distinguish:

- verified actual input;
- market benchmark;
- model assumption;
- confidential supplier data;
- user estimate.

---

## 346. Product Carbon Footprint benchmark

### 346.1 COMPETITOR / STANDARD CONFIRMED

WBCSD PACT Methodology Version 3 provides a harmonized framework for cradle-to-gate Product Carbon Footprints, including data-reliability and verification pathways. PACT also defines standardized exchange of product-level carbon information across software and supply-chain partners.

### 346.2 JOOR evidence status

Product-level carbon calculation, supplier-specific primary-data exchange, reliability scoring and versioned PCF evidence were not confirmed in the audited JOOR cabinet.

Status: `JOOR NOT CONFIRMED / UAT`.

### 346.3 SYNTHA TARGET

Create a `ProductCarbonFootprint` tied to a precise product/specification/production scope.

Required scope:

- product or component;
- specification version;
- supplier/facility;
- production route;
- geography;
- production period;
- quantity basis;
- system boundary;
- methodology version;
- allocation method;
- primary/secondary data ratio;
- verification state.

---

## 347. Carbon Activity Data and Calculation Graph

### 347.1 Activity sources

- material production;
- yarn/fabric processing;
- dyeing/finishing;
- cut-and-sew;
- trims;
- packaging;
- energy/electricity;
- fuel;
- water/wastewater where methodology requires;
- waste and yield loss;
- inbound transport;
- inter-facility transport;
- outbound transport to agreed boundary;
- land-sector emissions/removals where applicable.

### 347.2 Calculation graph

```text
Activity Data
× Emission Factor
× Allocation Rule
× Quantity Conversion
= Emission Contribution
```

All contributions roll up to product/component/facility/order/season views.

### 347.3 Evidence contract

- source document/system;
- supplier/facility;
- period;
- measurement unit;
- primary/secondary estimate;
- emission factor source/version;
- conversion;
- allocation basis;
- uncertainty;
- verification;
- expiry;
- audit evidence.

### 347.4 Versioning

A change in methodology, emission factor, specification, supplier, factory or production route creates a new PCF version. Historical commercial claims retain the PCF version used at publication time.

---

## 348. Carbon Data Exchange and Reliability

### 348.1 Exchange object

```text
PCFDataRequest
PCFDataResponse
PCFDataPackage
PCFDataValidation
PCFDataVerification
PCFDataDispute
```

### 348.2 Data-request workflow

```text
REQUESTED
→ SUPPLIER_ACCEPTED
→ DATA_SUBMITTED
→ TECHNICAL_VALIDATION
→ METHODOLOGY_VALIDATION
→ VERIFIED / CONDITIONALLY_ACCEPTED / REJECTED
→ INCORPORATED
```

### 348.3 Reliability score

Factors:

- primary-data share;
- supplier/facility specificity;
- recency;
- completeness;
- methodology conformance;
- factor quality;
- allocation quality;
- third-party verification;
- reconciliation with production quantities;
- uncertainty range.

### 348.4 Claim controls

Statements such as `lower carbon` require:

- defined comparison baseline;
- same functional unit;
- same boundary;
- compatible methodology;
- valid time period;
- approved evidence;
- legal/claim review;
- disclosure of material limitations.

---

## 349. Network Recommendation and Discovery Governance

### 349.1 Benchmark

NuORDER confirms brand recommendations based on existing brand connections and recent order activity.

### 349.2 SYNTHA TARGET

Recommendation types:

- brands for retailer;
- retailers for brand;
- products for buyer;
- complementary assortment;
- substitute product;
- new-market opportunity;
- replenishment opportunity;
- supplier/factory candidate;
- material alternative.

### 349.3 Input classes

- explicit preferences;
- connections;
- orders;
- assortments;
- product/category affinity;
- price band;
- geography;
- target customer;
- store/channel profile;
- capacity/availability;
- performance outcomes;
- exclusions and contractual restrictions.

### 349.4 RecommendationPacket

- recommended entity;
- reason codes;
- supporting signals;
- excluded constraints;
- confidence;
- novelty/diversity contribution;
- commercial eligibility;
- privacy-safe aggregation status;
- expiry;
- action and later outcome.

### 349.5 Governance

- no cross-tenant disclosure of confidential sales, margins or buyer identity;
- cold-start strategy uses explicit profile and public/authorized attributes;
- users can hide/dismiss and provide reason;
- prevent pay-to-rank from being shown as organic recommendation;
- sponsored placement is explicitly labeled and separated;
- measure qualified connection/order outcome, not only clicks;
- audit model/version and recommendation reason.

---

## 350. Product Recommendation Diversity and Assortment Cannibalization

### 350.1 Objectives

A recommendation engine must balance:

- relevance;
- newness;
- diversity;
- commercial availability;
- margin;
- price-band coverage;
- category balance;
- size/color coverage;
- territory rights;
- inventory risk;
- cannibalization;
- strategic brand/account goals.

### 350.2 Cannibalization model

For each suggested item:

- overlapping customer need;
- substitute/complement relationship;
- expected incremental demand;
- expected transferred demand;
- impact on current assortment;
- markdown risk;
- margin impact;
- uncertainty.

### 350.3 Human control

Buyers can set:

- required core brands/categories;
- exclusion list;
- maximum concentration;
- newness target;
- local/strategic brand target;
- sustainability requirements;
- price ladder;
- risk appetite.

---

## 351. Master Data Stewardship and Change Governance

### 351.1 Stewardship domains

- product/style/color/SKU;
- organization/legal entity;
- supplier/facility;
- customer/location/door;
- material/component;
- taxonomy;
- units of measure;
- currency/tax;
- payment/shipping terms;
- country/region/market;
- brand and account aliases;
- identifiers and cross-references.

### 351.2 Data-change request

```text
DRAFT
→ VALIDATED
→ STEWARD_REVIEW
→ BUSINESS_APPROVAL
→ EFFECTIVE_DATE_SCHEDULED
→ APPLIED
→ DOWNSTREAM_ACKNOWLEDGED
→ CLOSED
```

### 351.3 Merge/split controls

- proposed duplicate candidates;
- survivorship rules;
- field-by-field preview;
- linked object impact;
- historical alias retention;
- source-system writeback plan;
- rollback strategy;
- financial/order history preservation.

### 351.4 Effective dating

Legal-name, address, bank, tax and commercial-term changes must support future effective dates and must not rewrite historical documents.

---

## 352. Data Contracts and Event Schema Governance

### 352.1 Data contract

Every published API/event/data product defines:

- owner;
- consumers;
- schema;
- required/optional fields;
- semantics;
- units;
- identity keys;
- event time;
- privacy classification;
- quality expectations;
- freshness;
- compatibility policy;
- deprecation timeline;
- examples and test fixtures.

### 352.2 Schema lifecycle

```text
DRAFT
→ REVIEWED
→ APPROVED
→ ACTIVE
→ DEPRECATED
→ RETIRED
```

### 352.3 Compatibility rules

- additive optional fields may be backward compatible;
- removing/renaming fields requires a new major version;
- changing semantics without version change is forbidden;
- consumers declare supported versions;
- events retain original schema/version;
- replay uses the historical schema adapter.

### 352.4 Consumer impact

Before release, identify affected:

- integrations;
- dashboards;
- agents;
- exports;
- mobile/offline clients;
- customer extensions;
- archived/replay processes.

---

## 353. Planning and Execution Control Tower

### 353.1 Unified exception view

The control tower groups exceptions by business impact rather than source system:

- revenue at risk;
- margin at risk;
- launch at risk;
- customer/service risk;
- quality/safety risk;
- compliance risk;
- cash risk;
- excess inventory risk;
- carbon/claim risk.

### 353.2 Priority score

```text
Priority
= Severity
× Probability
× Time Criticality
× Financial Exposure
× Customer/Regulatory Weight
× Data Confidence Factor
```

Priority must remain explainable and manually overridable with reason.

### 353.3 Control-tower card

- issue summary;
- affected objects;
- predicted impact;
- current owner;
- decision deadline;
- partner response status;
- recommended options;
- open case;
- selected execution plan;
- resolution and actual outcome.

### 353.4 Noise control

- deduplicate alerts from the same root cause;
- suppress downstream symptoms when a root case exists;
- aggregate low-value repeating issues;
- reopen if impact changes;
- never suppress safety/compliance critical alerts;
- maintain alert-to-case lineage.

---

## 354. New canonical entities

```text
ProductOperationsView
ProductOperationalStatus
PlaceholderProduct
PlaceholderRequirement
ProductMatchCandidate
ProductMatchDecision
PlaceholderResolution
PlanningGraph
PlanningNode
PlanningEdge
PlanningPropagation
Scenario
ScenarioAssumption
ScenarioResult
ExecutionPlan
ExecutionPlanStep
ConstraintBinding
FeasibilityResult
DemandSignal
ForecastConsumption
ForecastVersion
ForecastOverride
ForecastValueAddResult
CapacityResource
CapacityBucket
CapacityOffer
CapacityReservation
CapacityCommitment
CapacityConsumption
ScarceSupplyPolicy
SupplyAllocationResult
SupplyAllocationAppeal
POConfirmationRequirement
POConfirmation
POConfirmationLine
SupplierChangeProposal
SupplierChangeDecision
AdvanceShipNotice
ASNLine
ReceiptReconciliation
ExceptionCase
CaseParticipant
CaseObjectLink
CaseIssue
CaseEvidence
CaseDecision
CaseAction
CaseResolution
ProcessModel
ProcessPerspective
ProcessInstance
ProcessVariant
ProcessDeviation
ConformanceResult
ProcessBottleneck
HistoricalReplay
ReplayResult
ShouldCostModel
ShouldCostVersion
CostDriver
CostAssumption
QuoteCostBreakdown
NegotiationPacket
ProductCarbonFootprint
PCFContribution
PCFActivityData
PCFEmissionFactor
PCFDataRequest
PCFDataPackage
PCFVerification
RecommendationPacket
RecommendationFeedback
CannibalizationEstimate
MasterDataChangeRequest
MasterDataMergeProposal
DataContract
SchemaVersion
ConsumerCompatibility
ControlTowerExceptionGroup
```

---

## 355. New routes and workspaces

```text
/products/operations
/products/placeholders
/products/match-review
/planning/concurrent
/planning/scenarios
/planning/feasibility
/planning/forecast-consumption
/planning/forecast-value-add
/capacity/resources
/capacity/reservations
/supply/allocation
/suppliers/po-confirmations
/suppliers/change-proposals
/logistics/asn
/reconciliation/order-flow
/cases
/cases/:id/collaboration
/process-intelligence/models
/process-intelligence/variants
/process-intelligence/conformance
/process-intelligence/bottlenecks
/process-intelligence/replay
/costing/should-cost
/costing/drivers
/costing/negotiations
/sustainability/product-carbon
/sustainability/pcf-data-exchange
/discovery/recommendations
/admin/master-data-stewardship
/admin/data-contracts
/control-tower/planning-execution
```

---

## 356. New API outline

```text
GET    /api/v1/product-operations
POST   /api/v1/placeholders/:id/match-candidates
POST   /api/v1/placeholders/:id/resolve
POST   /api/v1/planning-graphs/:id/propagate
POST   /api/v1/scenarios
POST   /api/v1/scenarios/:id/calculate
POST   /api/v1/scenarios/:id/select
POST   /api/v1/scenarios/:id/execution-plan
POST   /api/v1/feasibility/evaluate
POST   /api/v1/forecast-consumption/apply
GET    /api/v1/forecast-value-add
POST   /api/v1/capacity-reservations
POST   /api/v1/capacity-reservations/:id/commit
POST   /api/v1/supply-allocation/simulate
POST   /api/v1/supply-allocation/:id/approve
POST   /api/v1/purchase-orders/:id/confirmations
POST   /api/v1/purchase-orders/:id/change-proposals
POST   /api/v1/supplier-change-proposals/:id/decide
POST   /api/v1/asns
POST   /api/v1/receipts/:id/reconcile
POST   /api/v1/cases
POST   /api/v1/cases/:id/actions
POST   /api/v1/cases/:id/resolve
POST   /api/v1/process-models
POST   /api/v1/process-models/:id/analyze
POST   /api/v1/process-models/:id/replay
POST   /api/v1/should-cost-models/:id/calculate
POST   /api/v1/quotes/:id/cost-breakdown
POST   /api/v1/negotiation-packets
POST   /api/v1/product-carbon-footprints/calculate
POST   /api/v1/pcf-data-requests
POST   /api/v1/pcf-data-packages/:id/validate
GET    /api/v1/recommendations
POST   /api/v1/recommendations/:id/feedback
POST   /api/v1/master-data-change-requests
POST   /api/v1/data-contracts/:id/validate-compatibility
```

All mutations require idempotency, actor context, organization/tenant scope, optimistic concurrency and policy evaluation.

---

## 357. New domain events

```text
product_operational_state_changed
placeholder_match_candidates_generated
placeholder_resolved
planning_change_propagated
scenario_calculation_started
scenario_calculated
scenario_selected
execution_plan_created
feasibility_changed
binding_constraint_detected
demand_signal_recorded
forecast_consumed
forecast_override_applied
forecast_value_add_measured
capacity_offer_created
capacity_reserved
capacity_commitment_breached
scarce_supply_allocation_proposed
scarce_supply_allocation_approved
po_confirmation_requested
po_line_confirmed
supplier_change_proposed
supplier_change_accepted
supplier_change_rejected
asn_submitted
receipt_reconciled
exception_case_opened
case_response_requested
case_decision_recorded
case_resolved
process_deviation_detected
process_bottleneck_detected
historical_replay_completed
should_cost_calculated
quote_cost_variance_detected
negotiation_packet_approved
product_carbon_footprint_calculated
pcf_data_requested
pcf_data_verified
recommendation_generated
recommendation_dismissed
recommendation_outcome_recorded
master_data_change_requested
master_data_merge_applied
data_contract_published
schema_compatibility_failed
control_tower_exception_grouped
```

---

## 358. KPI catalogue additions

### Planning

```text
Plan Attainment = Actual / Approved Plan
Scenario Decision Lead Time = Decision Time - Scenario Creation Time
Propagation Coverage = Updated Dependent Nodes / Identified Dependent Nodes
Feasibility Rate = Feasible Planned Quantity / Total Planned Quantity
```

### Forecast

```text
WAPE = Sum(|Actual - Forecast|) / Sum(Actual)
Bias = Sum(Forecast - Actual) / Sum(Actual)
Forecast Value Add = Baseline Error - Final Forecast Error
Override Positive Rate = Overrides Improving Error / Measured Overrides
```

### Supplier collaboration

```text
PO Confirmation On-Time Rate = On-time Confirmations / Confirmation Requests
Supplier Commit Reliability = Fulfilled Confirmed Quantity / Confirmed Quantity
Change Proposal Rate = Lines with Supplier Change / Confirmed Lines
ASN Accuracy = Correct ASN Lines / ASN Lines
```

### Process

```text
Process Conformance Rate = Conforming Instances / Completed Instances
Rework Rate = Instances with Repeated Corrective Events / Instances
Waiting Ratio = Waiting Time / Total Cycle Time
First-Time-Right Rate = Instances without Rework / Completed Instances
```

### Cost

```text
Quote-to-Should-Cost Variance = Supplier Quote - Should Cost
Negotiated Savings = Initial Quote - Final Agreed Quote
Cost Assumption Coverage = Verified Cost Inputs / Total Cost Inputs
```

### Carbon

```text
Primary Data Share = Primary-data Emissions / Total PCF Emissions
Verified PCF Coverage = Products with Verified PCF / In-scope Products
PCF Reliability Score = Weighted Evidence-quality Index
Carbon Intensity = Product Carbon Footprint / Functional Unit
```

---

## 359. Additional UAT scenarios

1. Brand admin filters Product Operations Directory to products with open orders and a superseded specification.
2. Bulk product action attempts to publish a market-blocked product and is rejected with exact gate evidence.
3. Placeholder auto-match proposes two similar products; price and delivery conflict force manual review.
4. Resolving a placeholder preserves retailer quantities, doors, notes and private target margin.
5. Placeholder is relinked through a controlled event; historical assortment snapshot remains unchanged.
6. Material delay propagates into production, delivery, revenue timing and cash-plan impact.
7. Scenario comparison rejects results calculated from different FX or forecast snapshots.
8. Selected scenario creates an execution plan but does not directly mutate POs.
9. Constraint engine identifies impossible MOQ, OTB and capacity combination.
10. Least-violation option is shown but cannot override contractual restriction automatically.
11. Confirmed PO consumes forecast; its prior order intent no longer double-counts demand.
12. Cancellation releases consumed demand into the correct planning bucket.
13. Forecast override improves WAPE and is recorded as positive FVA.
14. Override based on obsolete weather evidence is flagged and later measured separately.
15. Capacity reservation expires and releases unused capacity with financial adjustment.
16. Supplier breaches paid capacity commitment; exception case and contractual exposure are created.
17. Scarce supply policy provides minimum service to several accounts instead of allocating all units to the highest-margin account.
18. Manual strategic-account override is visible in allocation explanation and fairness report.
19. Supplier confirms a PO line with lower quantity and later date.
20. Buyer accepts the proposed date but rejects the quantity change, creating a formal PO amendment.
21. Supplier attempts to confirm an obsolete PO version and receives a concurrency error.
22. CSV confirmation replay does not duplicate accepted quantities.
23. ASN references exact PO lines and carton identifiers.
24. Receipt variance outside tolerance creates a case and blocks automatic invoice match.
25. External supplier sees shared case evidence but not internal target cost or legal notes.
26. Closing a case without resolution criteria is prevented.
27. Process intelligence detects repeated sample revision loops for one factory.
28. Conformance analysis identifies invoice created before required receipt/acceptance event.
29. Historical replay shows a new approval rule would have created excessive workload.
30. Workflow policy is not activated until replay findings are reviewed.
31. Should-cost model recalculates after labor rate and material-price changes.
32. Supplier quotation variance is decomposed into material, labor, overhead and margin drivers.
33. Unverified benchmark rate is labeled as assumption, not actual supplier cost.
34. PCF calculation links to exact material, facility, period and methodology version.
35. New emission factor creates a new PCF version without rewriting the value used in a prior claim.
36. Supplier submits PCF package with insufficient primary data; it is conditionally accepted with low reliability.
37. `Lower carbon` claim is blocked because comparison boundary differs.
38. Brand recommendation explains category, price-band and order-history signals without exposing another retailer’s data.
39. Sponsored discovery placement is labeled and kept outside organic ranking score.
40. Master-data merge preserves source aliases and historical order references.
41. Breaking event-schema change fails compatibility validation for an offline mobile consumer.
42. Control tower groups shipment-delay, ATP and customer-risk alerts under one root exception.
43. Safety-critical issue is never suppressed by alert deduplication.
44. Process variant analysis identifies the route with the best first-time-right and on-time-delivery outcomes.

---

## 360. Version 3.3 competitive gap matrix

| Capability | Benchmark | JOOR evidence status | Syntha target | Priority |
|---|---|---|---|---|
| Central product operations directory | NuORDER Product Directory | PARTIAL/UAT | Canonical operational product projection | P1 |
| Bulk placeholder / SMU auto-match | NuORDER | NOT CONFIRMED | Governed placeholder resolution engine | P1 |
| Network brand recommendations | NuORDER | NOT CONFIRMED | Explainable privacy-safe recommendation service | P2 |
| Concurrent demand/supply/inventory planning | Kinaxis | NOT CONFIRMED | Planning Graph and propagation engine | P0 |
| Scenario evaluation and execution bridge | Kinaxis | NOT CONFIRMED | Governed Scenario Workbench | P0 |
| Capacity reservation and commitment | Supply-planning benchmark | NOT CONFIRMED | Capacity commercial and operational ledger | P1 |
| Scarce supply allocation | Planning benchmark | PARTIAL/UAT | Explainable allocation and fairness governance | P1 |
| Supplier line-level PO confirmation | Coupa | NOT CONFIRMED | Multi-channel confirmation/change protocol | P0 |
| ASN/receipt/invoice chain | Coupa | PARTIAL/UAT | Canonical execution and reconciliation chain | P0 |
| Multi-enterprise exception case | Coupa / network benchmark | NOT CONFIRMED | Structured Case Management | P0 |
| Object-centric process mining | Celonis | NOT CONFIRMED | Native Process Intelligence Layer | P1 |
| Process adherence and replay | Celonis | NOT CONFIRMED | Conformance and Digital Process Twin | P1 |
| Bottom-up should cost | aPriori | NOT CONFIRMED | Fashion Should-Cost Engine | P1 |
| Product carbon footprint exchange | WBCSD PACT | NOT CONFIRMED | Versioned PCF calculation and exchange | P1 |
| Forecast value add | Planning benchmark | NOT CONFIRMED | Override outcome and FVA analytics | P1 |
| Master-data change governance | Enterprise benchmark | PARTIAL/UAT | Stewardship, merge/split and effective dating | P0 |
| Data-contract/schema governance | Platform benchmark | NOT CONFIRMED | Versioned contracts and compatibility controls | P0 |

---

## 361. Version 3.3 delivery roadmap

### P0 — executable planning and supplier truth

1. Planning Graph foundation and propagation service.
2. Scenario snapshot/version governance.
3. PO confirmation and supplier change protocol.
4. ASN, receipt and invoice reconciliation chain.
5. Multi-enterprise Exception Case Management.
6. Master Data Stewardship.
7. Data Contracts and schema compatibility.
8. Control-tower root-cause grouping.

### P1 — commercial and operational differentiation

1. Product Operations Directory.
2. Placeholder / SMU Resolution Engine.
3. Forecast consumption and Forecast Value Add.
4. Capacity reservation and constrained-supply allocation.
5. Process intelligence, conformance and replay.
6. Should-cost and quote decomposition.
7. Product Carbon Footprint and supplier PCF exchange.
8. Scenario-to-execution planning.

### P2 — network intelligence

1. Explainable brand/product/account recommendations.
2. Cannibalization and assortment-diversity optimization.
3. Advanced process root-cause models.
4. Predictive supplier-confirmation and execution risk.
5. Carbon-aware sourcing and scenario optimization.
6. Agent-assisted case resolution under governance controls.

### Final decisions

1. **A plan is not executable unless feasibility, data freshness and policy version are known.**
2. **Supplier acknowledgements and change proposals are first-class versioned objects, not email comments.**
3. **Every exception must connect to affected objects, financial exposure, owner and resolution.**
4. **Process intelligence must use canonical object/event history and cannot rewrite operational records.**
5. **Should cost separates verified facts, benchmarks and assumptions.**
6. **Product carbon values require exact scope, methodology, evidence and historical versioning.**
7. **Recommendations must be explainable, privacy-safe and separated from sponsored placement.**
8. **Scenario selection creates an approved execution plan rather than silently changing transactions.**

### Official source register for version 3.3

NuORDER:

- https://helpdesk.nuorder.com/hc/en-us/articles/52320082658843-Brand-update-June-2026
- https://helpdesk.nuorder.com/hc/en-us/articles/51128650175387-Brand-update-May-2026
- https://helpdesk.nuorder.com/hc/en-us/articles/48563518237979-Brand-update-March-2026
- https://helpdesk.nuorder.com/hc/en-us/articles/47286965076507-Brand-update-February-2026
- https://helpdesk.nuorder.com/hc/en-us/articles/46493922326683-Brand-recommendations
- https://helpdesk.nuorder.com/hc/en-us/articles/43537045658139-Retailer-profile-overview
- https://helpdesk.nuorder.com/hc/en-us/articles/13898524646299-Product-Customizations-for-brands

Concurrent planning and control tower:

- https://www.kinaxis.com/en/solutions/planning-one
- https://www.kinaxis.com/en/supply-chain-control-tower
- https://kinaxis.com/en/solutions/supply-chain-control-tower-and-visibility-arc

Supplier collaboration:

- https://docs.coupa.com/en/supplier-documentation/coupa-for-suppliers/the-coupa-supplier-portal-or-csp/features-and-processes-in-the-coupa-supplier-portal/purchase-orders/purchase-order-collaboration-with-buyers
- https://docs.coupa.com/en/supplier-documentation/coupa-for-suppliers/the-coupa-supplier-portal-or-csp/features-and-processes-in-the-coupa-supplier-portal/purchase-orders/purchase-order-collaboration-with-buyers/confirm-supply-chain-collaboration-orders-with-csv-files
- https://docs.coupa.com/en/supplier-documentation/coupa-for-suppliers/the-coupa-supplier-portal-or-csp/features-and-processes-in-the-coupa-supplier-portal/purchase-orders/about-purchase-orders

Process intelligence:

- https://docs.celonis.com/en/glossary.html
- https://docs.celonis.com/en/pql---process-query-language
- https://docs.celonis.com/en/procurement-starter-kit---object-centric.html

Should cost:

- https://www.apriori.com/should-cost-analysis/

Product carbon footprint:

- https://www.wbcsd.org/resources/pact-methodology-version-3/
- https://www.wbcsd.org/actions/partnership-for-carbon-transparency-pact/
- https://www.wbcsd.org/news/pact-updated-tech-specifications-emissions-data/

## 362. Version 3.4 scope — partner data, retail execution and revenue protection

### 362.1 Evidence boundary

Version 3.4 extends Syntha beyond the traditional wholesale portal into controlled partner-data collaboration, physical retail execution, vendor compliance, retail-media accountability and multi-echelon inventory decisions.

The following evidence rules remain mandatory:

- competitor capabilities are marked `COMPETITOR CONFIRMED` only when supported by official public material;
- inability to confirm a feature in the audited JOOR account is marked `JOOR NOT CONFIRMED / UAT`, not `absent`;
- privacy, regulatory, financial and computer-vision outputs remain subject to policy and human review;
- retailer and brand data remain owned and governed by the contributing organization unless an agreement explicitly states otherwise.

### 362.2 Product direction

```text
Partner Data
→ Certified Demand and Inventory Signal
→ Retailer / Brand Decision
→ Inventory and Campaign Action
→ Store Execution
→ Commercial Outcome
→ Reconciliation and Learning
```

The differentiator is not data volume. It is controlled use, traceable decisions and measurable commercial execution.

---

## 363. Partner Data Collaboration Layer

### 363.1 Purpose

Brands and retailers need to collaborate on sell-through, inventory, returns, markdowns, store execution and campaigns without exposing unrestricted row-level data.

Syntha must support four collaboration modes:

```text
1. Raw governed exchange
2. Pseudonymized exchange
3. Aggregated data product
4. Query-only clean-room collaboration
```

### 363.2 Data domains

- wholesale orders and amendments;
- retail sales/POS;
- on-hand inventory;
- available inventory;
- in-transit inventory;
- returns and reason codes;
- markdown and promotion;
- lost sales and stockout indicators;
- store/door attributes;
- assortment membership;
- product hierarchy;
- retail price and realized price;
- campaign exposure and spend;
- store-execution observations;
- customer cohort results where legally and contractually permitted.

### 363.3 Canonical objects

```text
PartnerDataAgreement
PartnerDataProduct
PartnerDataField
PartnerDataPolicy
PartnerDatasetVersion
PartnerDataDelivery
PartnerDataQuery
PartnerDataOutput
PartnerDataUsageEvent
PartnerDataIncident
```

### 363.4 Data ownership rule

Data contribution, platform processing and permitted output must be separately recorded.

A party that can query an aggregated result does not automatically gain the right to:

- export underlying rows;
- identify stores, customers or suppliers outside the agreed scope;
- use data for model training;
- combine the result with another dataset;
- share the result with another organization;
- retain the result indefinitely.

---

## 364. Partner Data Agreement and purpose limitation

### 364.1 Agreement dimensions

A `PartnerDataAgreement` defines:

- contributing organization;
- receiving/processing organization;
- approved purposes;
- approved data products;
- fields and dimensions;
- allowed aggregation level;
- authorized users and service accounts;
- geographic scope;
- channels and brands;
- effective period;
- delivery cadence;
- freshness SLA;
- retention period;
- onward-sharing restrictions;
- derived-data ownership;
- benchmark eligibility;
- AI/model-training permission;
- audit rights;
- incident notification;
- termination and deletion behavior.

### 364.2 Purpose codes

Examples:

- replenishment;
- assortment review;
- sell-through analysis;
- demand forecast;
- returns analysis;
- retail-media measurement;
- product-quality investigation;
- sustainability reporting;
- commercial settlement;
- agreed peer benchmark.

A query or export without an active compatible purpose is blocked.

### 364.3 Policy hierarchy

```text
Law / Regulatory Requirement
→ Data Processing / Sharing Agreement
→ Enterprise Data Policy
→ Partner Agreement
→ Data Product Policy
→ Query / Export Request
```

### 364.4 Termination

At agreement termination the system must:

- stop future deliveries and queries;
- revoke credentials and shared workspaces;
- preserve legally required transaction evidence;
- execute deletion/anonymization policy;
- record outstanding derived outputs;
- prohibit silent continued use by an AI agent or scheduled report.

---

## 365. Privacy-safe Data Clean Room

### 365.1 Benchmark

Official Snowflake Data Clean Room documentation describes controlled collaboration across parties while enforcing policies around approved queries and outputs. This is a benchmark for architecture, not a claim that every Snowflake control is required unchanged.

### 365.2 SYNTHA TARGET

A clean-room workspace must provide:

- approved joins only;
- approved templates or reviewed SQL/query plans;
- minimum aggregation thresholds;
- small-cell suppression;
- row-level export prohibition;
- query budget/rate limits;
- output-column restrictions;
- allowed time windows;
- privacy and confidentiality checks;
- output approval for sensitive analyses;
- immutable query and output audit.

### 365.3 Join policies

Join keys may include:

- product/SKU identity;
- store/door identity;
- campaign identity;
- hashed/pseudonymized customer identity where permitted;
- order/invoice identity for settlement;
- date/calendar dimensions.

Each key has a classification and permitted use. A customer join key cannot be reused for an unrelated supplier-performance analysis.

### 365.4 Query safety

Before execution:

```text
Query Request
→ Purpose Validation
→ Agreement Validation
→ Field and Join Validation
→ Aggregation / Disclosure Risk Check
→ Cost and Query Budget Check
→ Execute
→ Output Review / Suppression
→ Usage Ledger
```

### 365.5 Prohibited behavior

- repeated differencing queries intended to infer a small group;
- unrestricted download of joined rows;
- creation of shadow identifiers;
- use outside the declared purpose;
- cross-tenant model training without explicit authorization;
- combining sponsored-media data with confidential cost or credit data without a compatible agreement.

---

## 366. Retail Sell-through Data Contract

### 366.1 Data contract scope

A sell-through feed must define:

- product and location grain;
- daily/weekly period;
- sales units;
- gross sales value;
- net sales value;
- returns units/value;
- markdown value;
- on-hand units;
- available units;
- in-transit units;
- open customer orders;
- lost-sales/stockout indicator;
- retail price;
- currency;
- calendar and timezone;
- source system;
- restatement policy;
- latency and coverage.

### 366.2 Zero, missing and unknown

These states must remain distinct:

```text
0 sales
No sales record received
Store closed
Product not ranged
Product ranged but inventory unavailable
Data suppressed by policy
Data not yet certified
```

### 366.3 Restatements

Retail data can be corrected after initial delivery. Each restatement requires:

- dataset version;
- affected period;
- changed records/counts;
- reason;
- previous and new totals;
- downstream metrics/recommendations affected;
- whether automated actions require reversal or review.

### 366.4 Coverage score

Each metric or recommendation displays:

- expected doors;
- reporting doors;
- complete periods;
- missing products;
- last successful feed;
- restatement status;
- confidence/coverage score.

---

## 367. Partner Data Product Catalog

### 367.1 Data product definition

A `PartnerDataProduct` is a governed, reusable output such as:

- weekly sell-through by SKU/door;
- inventory availability by region;
- returns reason summary;
- launch performance pack;
- campaign conversion cohort;
- size-curve performance;
- markdown effectiveness;
- replenishment recommendation input;
- supplier OTIF score input.

### 367.2 Required metadata

- business owner;
- technical owner;
- contributing organizations;
- fields and definitions;
- grain;
- certification state;
- freshness target;
- quality thresholds;
- permitted purposes;
- consumers;
- lineage;
- retention;
- version;
- deprecation date;
- cost/usage policy.

### 367.3 Contract tests

Before publication:

- schema validation;
- key uniqueness;
- referential integrity;
- reconciliation to source totals;
- coverage threshold;
- disclosure-risk checks;
- late-data behavior;
- restatement test;
- consumer compatibility.

---

## 368. Privacy-safe Peer Benchmarking

### 368.1 Purpose

Brands and retailers may benefit from peer context without revealing another participant’s confidential performance.

Possible benchmark metrics:

- sell-through;
- returns;
- size-curve balance;
- stockout rate;
- markdown timing;
- order confirmation time;
- fill rate;
- OTIF;
- sample turnaround;
- data completeness.

### 368.2 Cohort policy

A benchmark cohort defines:

- category;
- price band;
- market;
- channel;
- store type;
- season/time period;
- minimum participant count;
- minimum observation count;
- outlier handling;
- participant eligibility.

### 368.3 Disclosure controls

- suppress cohorts below threshold;
- suppress cells dominated by one participant;
- do not expose partner ranking unless explicitly agreed;
- do not permit repeated filters that isolate one organization;
- show cohort methodology and coverage;
- separate contributed data from modeled estimates.

### 368.4 Benchmark usage

Benchmark results are decision evidence, not contractual truth. They cannot automatically change price, credit, supplier status or assortment access.

---

## 369. Retail Media and Co-op Campaign Operating Model

### 369.1 Purpose

Syntha must connect wholesale planning, product availability, retailer media, co-op funds and measurable commercial outcomes.

### 369.2 Campaign hierarchy

```text
Commercial Program
→ Campaign Brief
→ Audience / Placement Plan
→ Creative Package
→ Budget and Funding
→ Activation
→ Delivery / Exposure
→ Conversion and Incrementality
→ Claim / Settlement
```

### 369.3 Campaign entities

```text
RetailMediaCampaign
CampaignBrief
CampaignAudience
CampaignPlacement
CampaignCreative
CampaignProductSet
CampaignBudget
CampaignFundingSource
CampaignFlight
CampaignExposureAggregate
CampaignConversionAggregate
CampaignMeasurementPlan
CampaignClaim
```

### 369.4 Funding

Campaign funding may include:

- brand budget;
- retailer budget;
- co-op accrual;
- marketing development fund;
- launch allowance;
- performance-based contribution;
- make-good credit.

Funding availability, eligibility, reservation, spend, claim and settlement remain distinct states.

### 369.5 Product readiness gate

A campaign cannot activate a product that is:

- legally blocked;
- unpublished;
- out of permitted territory;
- missing approved assets;
- below inventory confidence threshold;
- outside launch/embargo window;
- missing price or promotion approval.

---

## 370. Closed-loop Measurement and Incrementality Governance

### 370.1 Measurement hierarchy

```text
Eligible Audience
→ Exposed Audience
→ Engaged Audience
→ Product View
→ Add to Cart / Store Visit Signal
→ Purchase
→ Return / Cancellation
→ Net Incremental Outcome
```

### 370.2 Attribution models

Support separately:

- direct attribution;
- assisted attribution;
- view-through attribution;
- store/region matched-market test;
- holdout/control test;
- pre/post comparison;
- modeled incrementality.

The UI must not present modeled incrementality as observed fact.

### 370.3 Measurement plan

Before activation define:

- objective;
- primary KPI;
- secondary KPIs;
- attribution window;
- control method;
- eligible products/locations;
- inventory-availability requirement;
- return/cancellation adjustment;
- minimum sample size;
- data sources;
- privacy policy;
- reporting cadence.

### 370.4 Commercial settlement

Claims must reconcile:

```text
Contracted Budget
→ Reserved Budget
→ Delivered Media
→ Eligible Spend
→ Performance Adjustment
→ Approved Claim
→ Credit / Invoice / Payment
```

---

## 371. Physical Retail Execution Operating System

### 371.1 Scope

The platform must connect planned assortment and visual directives to physical store execution.

Core use cases:

- store visit planning;
- planogram/visual directive distribution;
- launch setup;
- assortment presence verification;
- stock count;
- out-of-stock capture;
- price/signage verification;
- competitor observation where legally permitted;
- photo evidence;
- issue creation;
- replenishment or transfer action.

### 371.2 Physical retail graph

```text
Retailer Organization
→ Location / Door
→ Department
→ Zone
→ Fixture
→ Placement Position
→ Product / Display Asset
```

### 371.3 Execution package

A `RetailExecutionPackage` contains:

- applicable stores;
- effective dates;
- assortment/placement requirements;
- fixture instructions;
- visual references;
- signage/price requirements;
- inventory target;
- required evidence;
- task owner;
- completion SLA;
- exception policy.

---

## 372. Planogram and Visual Directive Governance

### 372.1 Versioning

A planogram/visual directive requires:

- immutable ID;
- version;
- store-cluster scope;
- fixture dimensions;
- placement rules;
- product alternatives;
- min presentation quantities;
- launch and expiry dates;
- approval;
- linked assets;
- superseded version.

### 372.2 Store applicability

Applicability is calculated from:

- store cluster;
- format;
- fixture availability;
- floor area;
- category;
- climate/region;
- assortment;
- inventory;
- campaign participation;
- local legal restrictions.

### 372.3 Controlled deviation

A store may request deviation because of:

- missing fixture;
- insufficient inventory;
- local safety restriction;
- construction/refit;
- product withdrawal;
- local market requirement.

Deviation requires evidence, expiry and approver.

---

## 373. Computer Vision for Store Evidence

### 373.1 Benchmark

Retail-execution platforms such as Repsly publicly describe image-recognition support for shelf/display analysis. Syntha should use this capability as an assistive benchmark with stricter evidence governance.

### 373.2 AI observations

Possible observations:

- expected product visible/not visible;
- approximate facings/placement count;
- fixture occupancy;
- signage presence;
- incorrect price label;
- out-of-stock indicator;
- unauthorized product;
- visual directive deviation;
- damaged display.

### 373.3 Governance

Every AI observation stores:

- image/video source;
- capture time/location;
- model/version;
- predicted objects;
- confidence;
- applicable planogram version;
- human review state;
- correction reason;
- final disposition.

### 373.4 Prohibited automation

A low-confidence or unreviewed vision result cannot automatically:

- create a financial penalty;
- suspend a retailer or supplier;
- change inventory on hand;
- issue a chargeback;
- publish performance rankings.

---

## 374. Store Visit, Task and Issue Lifecycle

### 374.1 Visit lifecycle

```text
PLANNED
→ ASSIGNED
→ ROUTED
→ CHECKED_IN
→ IN_PROGRESS
→ EVIDENCE_SUBMITTED
→ REVIEWED
→ COMPLETED
```

Alternative states:

```text
RESCHEDULED
NO_ACCESS
STORE_CLOSED
CANCELLED
FOLLOW_UP_REQUIRED
```

### 374.2 Store task types

- count inventory;
- verify range;
- implement display;
- capture photo;
- correct signage;
- remove recalled product;
- investigate stockout;
- verify promotion;
- collect sample/return;
- train store team;
- confirm launch readiness.

### 374.3 Store issue lifecycle

```text
DETECTED
→ VALIDATED
→ OWNER_ASSIGNED
→ ACTION_PLANNED
→ ACTION_IN_PROGRESS
→ EVIDENCE_REVIEW
→ RESOLVED
→ CLOSED
```

An issue can generate replenishment, transfer, content correction, recall, fixture repair or commercial follow-up.

---

## 375. Vendor Compliance and Routing Guide Compiler

### 375.1 Benchmark

SPS Commerce publicly positions vendor compliance around standardized order, ASN, label and fulfillment requirements across trading partners. Syntha uses this as a benchmark for a governed retailer/brand routing-guide engine.

### 375.2 Routing guide hierarchy

```text
Global Legal / Carrier Rule
→ Retailer Routing Guide
→ Brand / Supplier Agreement
→ Distribution Center Rule
→ Season / Campaign Rule
→ Shipment-specific Instruction
```

### 375.3 Rule domains

- order acknowledgement deadline;
- ship window;
- delivery appointment;
- carrier/service level;
- ship-from/ship-to;
- carton dimensions/weight;
- inner/master pack;
- carton-content rules;
- label format and placement;
- SSCC/barcode requirements;
- ASN timing and fields;
- packing list;
- invoice references;
- hazardous/special handling;
- sustainability packaging rule;
- pallet configuration;
- documentation;
- tolerance and waiver policy.

### 375.4 Compile-time validation

Before shipment release:

```text
Order + Destination + Products + Packaging + Carrier + Dates
→ Applicable Rules
→ Validation
→ Required Corrections / Waiver
→ Shipment Authorization
```

---

## 376. Carton, Label and ASN Compliance Workbench

### 376.1 Carton identity

Each carton/pallet must link to:

- shipment;
- orders/order lines;
- contained SKUs and quantities;
- serial/lot where relevant;
- package hierarchy;
- weight/dimensions;
- SSCC/barcode;
- label version;
- destination;
- ASN.

### 376.2 Validation controls

- duplicate SSCC;
- unreadable barcode;
- wrong destination;
- wrong label template;
- quantity mismatch;
- unauthorized mixed carton;
- missing order reference;
- missing country-of-origin data;
- weight/dimension tolerance;
- ASN sent too early/late;
- ASN content mismatch.

### 376.3 Scan workflow

```text
Generate Label
→ Print
→ Scan Verification
→ Carton Close
→ ASN Build
→ ASN Validation
→ Submit
→ Retailer Acknowledgement
```

### 376.4 Waiver

A waiver requires:

- rule/version;
- shipment/carton scope;
- reason;
- financial exposure;
- approver;
- expiry;
- corrective action.

---

## 377. Deduction and Chargeback Prevention Engine

### 377.1 Principle

The preferred workflow is prevention before shipment, not dispute after deduction.

### 377.2 Risk preview

Before execution the system calculates potential exposure from:

- late shipment;
- incomplete fill;
- missing/late ASN;
- routing-guide violation;
- carton/label error;
- price discrepancy;
- invoice duplication;
- unauthorized substitution;
- packaging violation;
- quality failure.

### 377.3 Evidence packet

For each actual or disputed deduction:

```text
Deduction Notice
→ Contract / Routing Rule Version
→ Order and Amendment
→ Confirmation
→ ASN
→ Carrier Events
→ Delivery / Receipt
→ Label / Carton Evidence
→ Invoice / Credit
→ Communication and Waiver
→ Decision
```

### 377.4 Liability and recovery

A deduction may be allocated to:

- brand;
- supplier/factory;
- logistics provider;
- sales agency;
- retailer internal process;
- shared responsibility.

Allocation must follow contract/policy evidence and cannot be inferred solely from operational ownership.

---

## 378. Perfect Order and Certified Service Metrics

### 378.1 Perfect Order definition

A `Perfect Order` is separately certified against agreed rules:

- accepted/confirmed correctly;
- shipped on time;
- delivered on time;
- delivered in full;
- damage-free;
- correct product/quantity;
- compliant packaging/label;
- valid ASN/documents;
- correct invoice;
- no preventable deduction.

### 378.2 Metric decomposition

```text
Perfect Order Rate
= Orders meeting every required component
  / Eligible delivered orders
```

Also show each component independently:

- OTIF;
- fill rate;
- ASN compliance;
- label compliance;
- invoice accuracy;
- damage-free rate;
- deduction-free rate.

### 378.3 Eligibility and exclusions

Exclusions require explicit rules for:

- customer-requested date changes;
- force majeure;
- cancelled lines;
- approved substitutions;
- agreed split delivery;
- retailer-caused receiving delay;
- data coverage gaps.

---

## 379. Multi-Echelon Inventory Optimization

### 379.1 Purpose

Inventory policy must optimize the network rather than independently calculating safety stock at every node.

Network nodes:

- raw-material supplier;
- factory;
- consolidation hub;
- central DC;
- regional DC;
- store;
- marketplace/dropship supplier;
- in-transit location;
- returns/refurbishment node.

### 379.2 Policy inputs

- service-level target;
- demand distribution;
- forecast uncertainty;
- lead-time distribution;
- review cadence;
- order cycle;
- MOQ/MOV;
- pack multiple;
- capacity;
- shelf/season life;
- launch date;
- markdown/exit date;
- substitution;
- transfer capability;
- channel priority;
- inventory confidence;
- cost and carbon.

### 379.3 Policy outputs

- safety stock by echelon;
- cycle stock;
- reorder point;
- order-up-to level;
- target weeks of supply;
- inventory pool assignment;
- postponement point;
- transfer threshold;
- exit/markdown trigger;
- required upstream buffer.

### 379.4 Fashion-specific constraints

- short season and hard exit date;
- size/color fragmentation;
- carry-over versus seasonal item;
- launch minimum presentation;
- limited replenishment window;
- markdown risk;
- minimum viable size curve;
- supplier/factory capacity reservation;
- material shared across products.

### 379.5 Governance

An inventory policy is versioned and tested before activation. Historical replenishment decisions retain the policy version that created them.

---

## 380. Inventory Deployment, Transfer and Rebalancing

### 380.1 Decision types

- initial allocation;
- pre-launch deployment;
- replenishment;
- inter-store transfer;
- DC-to-DC transfer;
- channel reallocation;
- reserve release;
- return-to-vendor;
- outlet/markdown transfer;
- dropship fallback.

### 380.2 Transfer score

A transfer candidate considers:

```text
Expected Lost Sales Avoided
+ Markdown Avoided
+ Service Improvement
- Transfer Cost
- Handling Cost
- Carbon Cost / Policy Penalty
- Donor Stockout Risk
- Receiving Capacity Risk
```

### 380.3 Transfer controls

- item eligibility;
- source/destination inventory confidence;
- transfer lead time;
- minimum source presentation;
- destination need window;
- pack/size-curve integrity;
- legal/territory restriction;
- ownership model;
- in-transit reservation;
- receiving capacity.

### 380.4 Closed loop

Measure after transfer:

- units sold;
- markdown avoided;
- source lost sales;
- transfer cost;
- handling damage;
- actual arrival;
- net commercial value.

---

## 381. Launch and Drop Command Center

### 381.1 Launch object

A `LaunchProgram` connects:

- product/specification version;
- markets and channels;
- launch wave/timezone;
- assortment and doors;
- inventory deployment;
- commercial terms;
- campaign;
- assets and rights;
- marketability;
- store execution;
- support/returns readiness.

### 381.2 Readiness dimensions

```text
Product
Compliance
Content and Rights
Price and Promotion
Inventory and Promise
Order / Payment
Logistics
Store Execution
Campaign
Customer Service
```

### 381.3 Hard gates

Examples:

- product marketability blocked;
- required inventory not received;
- asset rights not active;
- embargo not reached;
- price not approved;
- payment/checkout unavailable;
- carrier promise unavailable;
- recall/quality hold;
- store launch task incomplete above threshold.

### 381.4 Launch states

```text
PLANNING
→ COMMITTED
→ READINESS_REVIEW
→ GO / CONDITIONAL_GO / NO_GO
→ ACTIVATING
→ LIVE
→ STABILIZING
→ POST_LAUNCH_REVIEW
→ CLOSED
```

### 381.5 Wave rollback

A failed wave can pause later markets/channels without silently deleting completed transactions.

---

## 382. Digital Asset Rights, Embargo and Usage Governance

### 382.1 Rights model

Each asset/rendition may be restricted by:

- organization;
- product/collection;
- territory;
- channel;
- campaign;
- customer group;
- start/end date;
- talent/model release;
- photographer/agency license;
- music/video rights;
- derivative-use permission;
- AI-training/generation permission;
- export/download permission.

### 382.2 Publication check

```text
Asset + Rendition + Product + Channel + Market + Time + User
→ Rights Validation
→ Watermark / Transform / Publish / Block
```

### 382.3 Expiry behavior

On rights expiry:

- stop new publication;
- identify active pages/campaigns/exports;
- replace with approved fallback where possible;
- preserve historical audit;
- notify owner;
- do not delete the original evidence silently.

### 382.4 Generative content

AI-generated or AI-edited assets require:

- source/provenance;
- approved brand policy;
- rights to source material;
- disclosure policy where applicable;
- human approval;
- model/version;
- prohibited-use check.

---

## 383. Retail Execution → Inventory → Commercial Action Loop

### 383.1 Decision loop

```text
Store Observation
→ Validation
→ Root Cause
→ Recommended Action
→ Approval / Auto-action Policy
→ Replenishment / Transfer / Correction
→ Outcome Measurement
```

### 383.2 Root-cause categories

- inventory unavailable upstream;
- inventory exists but not on floor;
- incorrect system stock;
- assortment not ranged;
- product misplaced;
- display not implemented;
- price/signage error;
- shipment/receiving delay;
- product hold/recall;
- local demand anomaly.

### 383.3 Action policy

Safe actions may be automated only when:

- evidence confidence exceeds threshold;
- inventory confidence is sufficient;
- policy permits;
- action is reversible;
- no legal/contractual gate exists;
- expected value exceeds cost and risk.

---

## 384. Partner Data and Automation Usage Ledger

### 384.1 Required records

For every access/use:

- user/service/agent;
- organization and tenant;
- purpose;
- agreement/version;
- data product/version;
- fields/rows/aggregation scope;
- query or export;
- output recipient;
- timestamp;
- retention/expiry;
- model/agent run where applicable.

### 384.2 User-facing transparency

Data owners can review:

- active consumers;
- recent queries/exports;
- scheduled deliveries;
- AI agents using the data;
- derived products;
- incidents;
- pending agreement expiry.

### 384.3 Revocation

Revocation stops future use and identifies cached/derived outputs requiring deletion, anonymization or legal retention review.

---

## 385. New canonical entities

```text
PartnerDataAgreement
PartnerDataPurpose
PartnerDataProduct
PartnerDataProductVersion
PartnerDataPolicy
PartnerDatasetVersion
PartnerDataDelivery
PartnerDataQuery
PartnerDataOutput
PartnerDataUsageEvent
BenchmarkCohort
BenchmarkResult
RetailMediaCampaign
CampaignMeasurementPlan
CampaignPlacement
CampaignCreative
CampaignExposureAggregate
CampaignConversionAggregate
CampaignClaim
RetailExecutionPackage
Planogram
PlanogramVersion
Fixture
PlacementPosition
StoreVisit
StoreTask
StoreObservation
VisionObservation
StoreExecutionIssue
RoutingGuide
RoutingGuideVersion
RoutingRule
RoutingWaiver
Carton
PackageHierarchy
ShippingLabel
ASNValidation
ComplianceExposure
DeductionEvidencePacket
PerfectOrderAssessment
InventoryPolicy
InventoryPolicyVersion
EchelonServiceTarget
InventoryDeploymentPlan
TransferRecommendation
TransferOrder
LaunchProgram
LaunchWave
LaunchReadinessAssessment
AssetRightsAgreement
AssetUsagePolicy
AssetUsageEvent
```

---

## 386. New routes and workspaces

```text
/partner-data/agreements
/partner-data/products
/partner-data/deliveries
/partner-data/clean-rooms
/partner-data/usage
/benchmarks/cohorts
/benchmarks/results
/retail-media/campaigns
/retail-media/measurement
/retail-media/claims
/retail-execution/packages
/retail-execution/planograms
/retail-execution/visits
/retail-execution/tasks
/retail-execution/issues
/retail-execution/vision-review
/vendor-compliance/routing-guides
/vendor-compliance/shipments
/vendor-compliance/cartons
/vendor-compliance/asn
/vendor-compliance/waivers
/vendor-compliance/deductions
/analytics/perfect-order
/inventory/policies
/inventory/deployment
/inventory/transfers
/inventory/rebalancing
/launches
/launches/:id/readiness
/launches/:id/waves
/assets/rights
/assets/usage
```

---

## 387. New API outline

```text
POST   /api/v1/partner-data/agreements
POST   /api/v1/partner-data/products/:id/publish
POST   /api/v1/partner-data/deliveries/:id/validate
POST   /api/v1/clean-rooms/:id/queries/validate
POST   /api/v1/clean-rooms/:id/queries/execute
GET    /api/v1/partner-data/usage
POST   /api/v1/benchmarks/:id/calculate
POST   /api/v1/retail-media/campaigns
POST   /api/v1/retail-media/campaigns/:id/activate
POST   /api/v1/retail-media/campaigns/:id/measure
POST   /api/v1/retail-execution/packages
POST   /api/v1/store-visits/:id/check-in
POST   /api/v1/store-observations
POST   /api/v1/vision-observations/:id/review
POST   /api/v1/routing-guides/:id/compile
POST   /api/v1/shipments/:id/compliance/validate
POST   /api/v1/cartons/:id/verify-scan
POST   /api/v1/asns/:id/validate
POST   /api/v1/routing-waivers
POST   /api/v1/deductions/:id/evidence-packets
POST   /api/v1/perfect-orders/:orderId/assess
POST   /api/v1/inventory-policies/:id/simulate
POST   /api/v1/inventory-policies/:id/activate
POST   /api/v1/inventory/deployment-plans
POST   /api/v1/inventory/transfers/recommend
POST   /api/v1/launches/:id/assess-readiness
POST   /api/v1/launches/:id/go-no-go
POST   /api/v1/assets/:id/check-usage-rights
```

All mutations require idempotency keys, actor context and optimistic concurrency/version preconditions.

---

## 388. New domain events

```text
partner_data_agreement_activated
partner_data_agreement_expired
partner_data_delivery_received
partner_data_delivery_restatement_received
partner_data_query_blocked
partner_data_output_approved
partner_data_usage_revoked
benchmark_cohort_suppressed
retail_media_campaign_activated
retail_media_campaign_paused
retail_media_measurement_completed
retail_media_claim_approved
retail_execution_package_published
store_visit_checked_in
store_observation_submitted
vision_observation_reviewed
store_execution_issue_opened
store_execution_issue_resolved
routing_guide_published
routing_rule_violated
routing_waiver_approved
carton_verified
shipping_label_rejected
asn_validation_failed
asn_acknowledged
compliance_exposure_calculated
deduction_evidence_packet_completed
perfect_order_assessed
inventory_policy_activated
inventory_deployment_planned
transfer_recommended
transfer_order_created
transfer_outcome_recorded
launch_readiness_assessed
launch_go_decision_recorded
launch_wave_activated
launch_wave_paused
asset_usage_blocked
asset_rights_expired
```

---

## 389. Additional UAT scenarios

1. Retailer shares weekly sell-through only for approved brands and markets.
2. Clean-room query attempting row-level export is blocked.
3. Repeated narrow queries that would isolate one store are suppressed.
4. Data agreement expires and scheduled agent access stops immediately.
5. Restated POS feed recalculates affected metrics without rewriting historical snapshots.
6. Missing store feed is not interpreted as zero sales.
7. Benchmark cohort below minimum participant threshold is hidden.
8. Retail-media campaign cannot activate while product inventory confidence is below policy.
9. Campaign report separates observed sales from modeled incrementality.
10. Returned orders are removed from net campaign conversion.
11. Co-op claim exceeds eligible delivered media and is partially rejected.
12. Store receives only the planogram version applicable to its cluster and fixture.
13. Store requests controlled planogram deviation with photo evidence and expiry.
14. Vision model detects missing product with low confidence; no automatic penalty is created.
15. Human reviewer corrects a vision observation and the correction is retained for evaluation.
16. Store stockout creates replenishment recommendation only after system-stock reconciliation.
17. Routing-guide update applies only to shipments after its effective date.
18. Supplier validates a shipment before label printing and receives exact remediation steps.
19. Duplicate SSCC is detected before ASN submission.
20. ASN quantity differs from closed-carton content and submission is blocked.
21. Approved routing waiver prevents an otherwise valid deduction for its exact scope.
22. Deduction evidence packet reconstructs rule, order, ASN, carrier and receiving evidence.
23. Perfect-order metric excludes a retailer-requested delivery-date change under the certified rule.
24. Multi-echelon policy reduces downstream safety stock without lowering the configured service target in simulation.
25. Seasonal item receives no replenishment recommendation after its economic exit date.
26. Transfer recommendation protects donor minimum presentation quantity.
27. Transfer outcome shows markdown avoided and source lost-sales impact.
28. Launch no-go is triggered by expired asset rights despite content readiness score being high.
29. Launch wave in one market is paused without deleting completed orders from another market.
30. Asset rights expire during an active campaign and approved fallback is substituted.
31. AI-generated creative without permitted source rights is blocked.
32. Partner usage ledger shows the exact agent run that queried a data product.
33. Revocation identifies scheduled exports and derived datasets requiring action.
34. Cross-tenant clean-room tests reveal no raw row leakage.
35. A data-product schema change fails consumer compatibility tests before publication.
36. Inventory policy replay preserves the version used for historical transfer decisions.

---

## 390. Version 3.4 competitive gap matrix

| Capability | Benchmark | JOOR evidence status | Syntha target | Priority |
|---|---|---|---|---|
| Governed partner sell-through exchange | Retail collaboration benchmark | PARTIAL/UAT | Purpose-bound data agreements and certified feeds | P0 |
| Privacy-safe clean-room analysis | Snowflake Data Clean Rooms | NOT CONFIRMED | Approved joins, thresholds and usage ledger | P1 |
| Privacy-safe peer benchmarks | Data collaboration benchmark | NOT CONFIRMED | Cohort thresholds and disclosure controls | P2 |
| Retail media linked to wholesale and inventory | Retail media benchmark | NOT CONFIRMED | Campaign, funding, availability gate and incrementality | P2 |
| Physical store execution | Repsly-style retail execution | NOT CONFIRMED | Planogram, visits, tasks, evidence and closed loop | P1 |
| Image-recognition evidence | Retail execution benchmark | NOT CONFIRMED | Human-reviewed vision observations | P2 |
| Routing-guide compiler | SPS Commerce-style compliance | NOT CONFIRMED | Versioned shipment rule compilation | P0 |
| Carton/label/ASN pre-validation | EDI/vendor compliance benchmark | PARTIAL/UAT | Scan-verified package hierarchy and ASN | P0 |
| Deduction prevention | Vendor compliance benchmark | PARTIAL/UAT | Pre-ship exposure and evidence packets | P1 |
| Perfect-order certification | Supply-chain benchmark | PARTIAL/UAT | Certified component metrics and exclusions | P1 |
| Multi-echelon inventory optimization | Inventory optimization benchmark | NOT CONFIRMED | Versioned network stock policies | P1 |
| Transfer/rebalancing optimization | Retail planning benchmark | NOT CONFIRMED | Value, service, carbon and donor-risk model | P1 |
| Launch/drop command center | Fashion operating benchmark | NOT CONFIRMED | Cross-domain readiness and wave control | P1 |
| Digital asset rights governance | DAM/rights benchmark | PARTIAL/UAT | Territory/channel/time/AI-use controls | P0 |

---

## 391. Version 3.4 delivery roadmap and final decisions

### P0 — prevent invalid execution and data misuse

1. Partner Data Agreement and usage ledger.
2. Sell-through data contract, restatement and coverage model.
3. Routing Guide Compiler.
4. Carton, label and ASN pre-validation.
5. Digital asset rights and embargo checks.
6. Perfect-order certified metric definitions.

### P1 — connect planning to store and inventory outcomes

1. Physical Retail Execution OS.
2. Planogram/visual directive versioning.
3. Deduction prevention and evidence packets.
4. Multi-echelon inventory policy foundation.
5. Deployment, transfer and rebalancing.
6. Launch/Drop Command Center.
7. Partner Data Product Catalog.

### P2 — privacy-safe network intelligence

1. Clean-room query controls.
2. Privacy-safe peer benchmarking.
3. Retail-media measurement and co-op settlement.
4. Human-reviewed store computer vision.
5. Optimization of transfers and campaign/inventory actions.

### Final decisions

1. **Partner data is governed by explicit purpose, agreement and usage evidence.**
2. **Missing retail data is never treated as zero.**
3. **Retail media cannot be separated from inventory, product readiness and net commercial outcome.**
4. **Computer vision creates observations, not unreviewed penalties.**
5. **Vendor compliance must prevent errors before shipment and reconstruct evidence after execution.**
6. **Inventory is optimized as a network with fashion seasonality, not as independent store buffers.**
7. **A launch requires synchronized product, rights, compliance, inventory, commercial and store readiness.**
8. **Asset licensing and AI-use permissions are executable policies, not attachment notes.**

### Official source register for version 3.4

- Snowflake Data Clean Rooms documentation: https://docs.snowflake.com/en/user-guide/cleanrooms/introduction
- SPS Commerce vendor compliance and fulfillment resources: https://www.spscommerce.com/resources/
- Repsly retail execution and image recognition resources: https://www.repsly.com/retail-execution
- IAB retail media measurement guidance: https://www.iab.com/guidelines/retail-media-measurement-guidelines/
- GS1 logistics label and SSCC standards: https://www.gs1.org/standards/id-keys/sscc
- GS1 EDI standards: https://www.gs1.org/standards/edi
- Blue Yonder inventory optimization reference: https://blueyonder.com/solutions/supply-chain-planning/inventory-planning
