# JOOR Retailer Cabinet → Syntha B2B Fashion Platform

Статус: рабочая продуктовая спецификация и master map.  
Версия: 2.4, 4 августа 2026 года.  
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
