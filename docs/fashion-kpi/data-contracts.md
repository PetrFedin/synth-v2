# SYNTH-V2 Fashion KPI Data Contracts

This document defines how KPI methodology is connected to SYNTH-V2 domain data and external enterprise systems.

## 1. Principle

Business formulas use stable logical variables. Physical mappings bind those variables to actual source systems. These layers are intentionally separate.

Example:

`GoodOutputUnits` is a logical variable. A deployment may map it to a SYNTH-V2 production execution read model today and to an external MES event tomorrow without changing the KPI ID or business formula.

## 2. Physical mapping contract

Every required logical variable must resolve to:

- source system;
- schema/table/view/topic or domain read model;
- field or event attribute;
- datatype;
- primary/business/event key;
- event timestamp;
- posting/ingestion timestamp where distinct;
- organisation/tenant key;
- UOM field or fixed UOM;
- currency field where applicable;
- join path and cardinality;
- population filter;
- version/effective-date rule;
- source owner;
- verification evidence;
- mapping status.

Allowed mapping statuses:

- `PENDING`;
- `MAPPED_UNVERIFIED`;
- `VERIFIED`;
- `DEPRECATED`.

A production-ready KPI may not depend on a required `PENDING` or `MAPPED_UNVERIFIED` variable.

## 3. Join contract

Every join used by a KPI calculation must declare expected cardinality.

Examples:

- production order -> order lines: `1:N`;
- order line -> active style version effective at transaction time: governed `N:1` after version filter;
- inspection -> defects: `1:N`;
- shipment -> shipment legs: `1:N`;
- material lot -> receipt transaction: may be `N:N` unless a bridge is explicitly modeled.

Unexpected cardinality is a DQ failure, not an excuse to add `DISTINCT` to the final query.

Required controls:

- orphan fact count;
- duplicate key count;
- join row-multiplication factor;
- missing dimension/version resolution;
- temporal-effective join validation.

## 4. Event-time contract

For event KPI, distinguish:

- `business_event_at` — when the business event occurred;
- `recorded_at` — when source system recorded it;
- `ingested_at` — when analytics layer received it;
- `corrected_at` — when a source correction occurred.

Reporting normally follows business event time unless the definition says otherwise. Watermark/late-data policy governs when a period is considered stable.

Do not silently substitute ingestion time for business event time.

## 5. Versioned master data

KPI calculations must resolve the version effective for the observation/event date where the domain is versioned.

Examples:

- BOM version;
- tech-pack version;
- routing/SAM version;
- target-cost version;
- material specification;
- FX policy;
- threshold policy;
- inspection method;
- calibration validity.

The current latest version must not be applied retrospectively to historical events unless the restatement policy explicitly requires it.

## 6. Domain contracts

### 6.1 Catalog / styles / collections

Typical logical objects:

- Style;
- Colorway;
- Size;
- Collection;
- Season;
- Assortment option;
- price list/version;
- lifecycle status.

Controls:

- stable IDs;
- no duplicate active style-color-size identity;
- valid collection/season relationships;
- effective price version;
- currency/UOM completeness.

Potential KPI inputs:

- active SKU count;
- adoption population;
- carry-over/new/core classification;
- option productivity denominator;
- launch readiness.

### 6.2 Materials

Objects:

- MaterialID;
- supplier material reference;
- composition/specification;
- lot/roll/skin where relevant;
- UOM;
- approved status;
- test/specification version.

Controls:

- material UOM conversion;
- lot traceability;
- width/GSM/composition method;
- density when converting liquid volume to mass;
- approval effective dates.

### 6.3 BOM

Objects:

- StyleVersionID;
- BOMVersionID;
- BOMLineID;
- material/component;
- net consumption;
- gross consumption;
- allowance/waste;
- unit;
- size/color applicability.

Controls:

- one frozen version for the costing/production context;
- no duplicated effective BOM lines;
- explicit size/color applicability;
- conversion from source UOM to canonical consumption UOM;
- net/gross relationship.

Reconciliation:

`opening/reserved + receipts/transfers -> issues - returns - scrap - ending` where the process boundary permits.

### 6.4 Measurements

Objects:

- measurement specification/POM;
- size;
- target;
- tolerance;
- sample/inspection result;
- method;
- equipment;
- timestamp.

Controls:

- target version;
- tolerance direction;
- measurement method;
- calibration status;
- sample identity.

Never mix measurements from different methods or units without an approved conversion/equivalence rule.

### 6.5 Samples

Objects:

- SampleID;
- sample type/round;
- requested/received/approved/rejected timestamps;
- decision/status;
- defect/comment lineage.

Potential KPI:

- sample first-pass approval;
- sample lead time;
- number of iterations;
- late sample rate.

For first-pass approval, denominator is eligible first-round samples, not all sample rounds.

### 6.6 Tech packs

Objects:

- TechPackID;
- version;
- readiness/completeness elements;
- released/frozen timestamp;
- dependencies on BOM/measurement/material/sample versions.

Controls:

- immutable released versions;
- dependency version references;
- completeness rule version;
- release user/timestamp.

### 6.7 Sourcing / suppliers

Objects:

- SupplierID;
- RFQ/quote;
- purchase/commercial terms;
- MOQ;
- lead time;
- source approval;
- claim;
- recovery/credit.

Separate bases:

- claim event count;
- affected units;
- monetary claim value;
- recovered value.

Do not use one ambiguous `claim rate` for all four.

### 6.8 Production orders

Objects:

- WorkOrderID;
- style/color/size;
- planned quantity;
- planned start/end;
- factory/site/line;
- frozen routing/BOM/SAM versions.

Controls:

- one effective frozen planning version per execution context;
- explicit cancellations/splits;
- planned vs released quantity distinction.

### 6.9 Production execution

Objects/events:

- operation execution;
- shift/line;
- productive minutes;
- downtime;
- good output;
- total output;
- rework;
- scrap/second quality;
- WIP movement.

Important identities:

`FactoryID + WorkOrderID + OperationID + LineID + ShiftID + EventID`.

Do not double count rework output as new good output unless the KPI definition explicitly treats it as such.

### 6.10 Final quality / QMS

Objects:

- InspectionID;
- inspection lot/population;
- inspected units;
- unique defective units;
- defect events;
- defect severity/type;
- release/hold/reject decision;
- CAPA.

DHU requires defect events. Defective-unit rate requires distinct defective units. AQL parameters belong to the sampling plan and acceptance rule, not to observed defect rate.

### 6.11 Orders / wholesale

Objects:

- order;
- order line;
- ordered/confirmed/cancelled/shipped quantities;
- price/discount;
- partner/account;
- promised/actual timestamps;
- sell-out/stock when available.

Unit cancellation and order cancellation are different KPI and require different denominators.

### 6.12 Calendar / notifications

Calendar data can support due-cohort construction only when the business event and due-date semantics are governed. Notification sent time is not automatically the business due time.

### 6.13 Logistics / TMS / customs

Objects:

- ShipmentID;
- LegID;
- booking/pickup/departure/arrival/POD events;
- gross/chargeable weight;
- CBM;
- freight/insurance/surcharges;
- customs declaration;
- HS classification;
- origin;
- duty/tax basis.

Freight per chargeable kg and freight per gross kg are different KPI.

### 6.14 Finance / ERP / GL

Objects:

- invoice/credit note;
- receipt/issue;
- GL posting;
- payroll;
- overhead pool;
- cost center;
- FX rate;
- payment;
- inventory balance.

Controls:

- accounting period;
- posting status;
- currency basis;
- normal-capacity allocation policy;
- recoverable tax treatment;
- duplicate invoice/accrual detection.

### 6.15 Retail / POS / OMS

Objects:

- transaction;
- item line;
- store/door;
- traffic/session where available;
- stock snapshot;
- return/exchange;
- markdown/promotion.

Sell-through and stock-cover KPI need consistent stock snapshots and period sales boundaries.

### 6.16 E-commerce / marketplaces

Objects:

- session/user/account;
- product view;
- cart/checkout;
- payment;
- order/item;
- fulfillment;
- return/refund;
- media attribution where governed.

Reach must use a declared identity model. Person reach and platform-account reach are not interchangeable.

### 6.17 ESG / EHS / utilities / laboratory

Objects:

- utility meter reading;
- energy carrier;
- water withdrawal/discharge;
- wastewater sample;
- chemical inventory/use;
- waste movement;
- emissions activity data/factor;
- incident;
- certification/evidence.

Controls:

- meter identity/calibration;
- conversion factors and effective dates;
- organizational/product boundary;
- Scope classification;
- input/output treatment matching;
- regulatory/customer-specific limit version.

### 6.18 Traceability

Minimum event model:

`TraceObject -> CriticalTrackingEvent -> KeyDataElements -> Actor -> Location -> Timestamp -> Transformation/Aggregation`.

Controls:

- object identity continuity;
- parent-child transformation links;
- event chronology;
- origin/evidence completeness;
- subcontractor disclosure where in scope.

## 7. Reconciliation contracts

A KPI must identify a reconciliation when one is available.

Examples:

- PO quantity -> GRN -> accepted QC quantity -> invoice quantity;
- BOM standard -> warehouse issue -> return -> scrap -> output;
- marker -> lay -> cut -> bundle;
- SAM/attendance -> earned minutes/output;
- shipment packing -> invoice -> POD/warehouse receipt;
- customs declaration -> landed-cost components;
- inventory opening + movement -> closing;
- source financial total -> KPI allocated total.

A reconciliation tolerance must be explicit: absolute, relative, or both.

## 8. Source freshness and late data

Each physical mapping must define expected freshness and maximum tolerated lateness.

KPI runs should record source watermarks. If late data arrives after publication, either:

- leave the published observation unchanged and open a restatement;
- or recalculate under a documented provisional/final close policy.

Never silently mutate the historical value without lineage.

## 9. Security and tenancy

All KPI source mappings, runs and observations must preserve SYNTH-V2 organisation isolation.

A calculation must never join or aggregate data across organisations unless the user has an explicit cross-organisation capability and the KPI definition permits that perimeter.

Tenant-specific thresholds or formula versions must not leak across organisations.
