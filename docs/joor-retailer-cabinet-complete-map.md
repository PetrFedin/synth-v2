# JOOR Retailer Cabinet → Syntha B2B Fashion Platform

Статус: рабочая продуктовая спецификация и master map.  
Версия: 2.0, 4 августа 2026 года.  
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
