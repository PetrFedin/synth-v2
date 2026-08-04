# JOOR Retailer Cabinet → Syntha B2B Fashion Platform

Статус: рабочая продуктовая спецификация и master map.  
Версия: 2.7, 5 августа 2026 года.  
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
