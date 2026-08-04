# JOOR Retailer Cabinet → Syntha B2B Fashion Platform

Статус: рабочая продуктовая спецификация и master map.  
Версия: 2.3, 4 августа 2026 года.  
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
