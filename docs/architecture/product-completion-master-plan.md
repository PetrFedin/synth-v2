# Syntha V2 — Product Completion Master Plan

Status: ACTIVE EXECUTION PLAN
Date established: 2026-09-09
Authority: subordinate to and synchronized with `ARCHITECTURE.md`; it does not redefine canonical entities or contracts. If this plan and `ARCHITECTURE.md` disagree, the discrepancy must be resolved in the same implementation PR before the work is considered complete.

## 1. Purpose

This is not a demo plan, MVP plan, pilot-only plan, investor-only plan or time-boxed delivery plan.

It is the standing execution plan for completing Syntha V2 as one full production-grade fashion operating platform. The system must remain continuous across the complete canonical chain and every planned capability remains in scope unless it is explicitly removed from the product contract by a later architecture decision.

The target product is:

```text
DESIGN
→ PLAN
→ DEVELOP
→ SOURCE
→ SAMPLE
→ TECH PACK
→ PRODUCE
→ QUALITY
→ PRODUCT READINESS
→ COMMERCIAL PROJECTION
→ PUBLISH
→ COLLECTION / SHOWROOM / LINE SHEET
→ BUYER CATALOG
→ ASSORT / SELECTION / COLOR × SIZE MATRIX
→ WHOLESALE ORDER
→ ORDER COMMIT SNAPSHOT
→ SUPPLY COMMITMENT
→ SHIPMENT / RECEIPT
→ INVENTORY
→ ACTUAL COST / LANDED COST
→ COST ALLOCATION
→ MARGIN ACTUALIZATION / CLOSE
→ SELL-THROUGH / KPI / SUPPLIER PERFORMANCE
```

No phase below limits the product to the portion currently being worked on. Each phase closes one part of the same whole.

## 2. Default execution rule

Work proceeds from the highest-priority open item in this plan.

After a task or PR is completed, the next task is selected from the next highest-priority unresolved item in this plan. The plan remains the default source for sequencing future work.

The execution order may be overridden only when one of the following is true:

1. the user explicitly requests a new or different priority;
2. a newly discovered P0 data-integrity, security, runtime, architecture or end-to-end defect is more critical than the current item;
3. a dependency must be completed earlier to avoid building a second source of truth or rework;
4. a failing release/production gate blocks all downstream work;
5. an architecture decision changes the canonical product contract and is recorded in `ARCHITECTURE.md`.

An override does not silently delete or deprioritize the displaced item. The unfinished item returns to the queue after the higher-priority interruption is closed.

## 3. Non-negotiable product-completion rules

- The product is completed as one connected operating platform, not as independent screens or isolated modules.
- No planned capability is removed merely because it is outside the current acceptance slice or current visible UI path.
- A capability is not complete because a domain service, migration, mock UI or unit test exists.
- A visible control without capability, handler, public API, domain validation, persistence and interaction evidence is forbidden.
- Canonical identifiers and immutable snapshots must cross every boundary; textual labels must not replace exact identity where ambiguity is possible.
- Historical truth is corrected by new immutable facts, not by rewriting frozen history.
- PostgreSQL, API/OpenAPI, domain logic, UI behavior, RBAC, i18n and `ARCHITECTURE.md` must describe the same product behavior.
- New work must reuse the current canonical architecture and ODS v1. It must not introduce a parallel catalog, product master, pricing truth, inventory truth, commercial truth, navigation dialect or visual design layer.
- Browser behavior is product behavior. UI verification cannot be reduced to checking text in source files.
- Compatibility paths may remain temporarily only when explicitly marked DEPRECATED/PARTIAL and prevented from originating new canonical facts.

## 4. Product Completion Matrix

A maintained completion matrix is required for every material capability. Each row must be evaluated across these columns:

```text
Specification
Domain model
Application service
PostgreSQL persistence
Public API / OpenAPI
RBAC / organisation isolation
UI / interaction states
Error semantics
Idempotency / concurrency
Unit/integration evidence
PostgreSQL evidence
Browser E2E evidence
Operational/runtime evidence
Current status
Open gap / next action
```

Allowed readiness conclusions remain those governed by `ARCHITECTURE.md`: IMPLEMENTED, PARTIAL, PLANNED, GAP, DEPRECATED, PROD-PROVEN.

The matrix is an execution index over the architecture, not a second source of business semantics.

## 5. Phase A — establish factual whole-product truth

Goal: determine the actual state of every planned capability before large convergence work.

Required work:

- inventory all canonical modules, routes, migrations, tables, workspaces, screens, roles, commands, workers and acceptance harnesses;
- map each capability to the Product Completion Matrix;
- identify duplicate or competing sources of truth;
- identify compatibility code still able to create fresh canonical business facts;
- identify UI actions with no complete supported handler path;
- verify every navigation item and workspace against current runtime behavior;
- classify all confirmed findings as P0/P1/P2 and record them in `ARCHITECTURE.md` gap/status sections when they affect the product contract;
- verify claimed dead code before deleting it;
- verify error-code/HTTP behavior instead of assuming current mapping is complete;
- inspect memory-store versus PostgreSQL-store contract parity and ensure production behavior is not inferred only from memory-backed tests;
- audit direct database constraints/triggers against domain/API semantics;
- identify unused schema objects and decide whether they are unfinished product capability or obsolete persistence.

Exit condition: no major area of the planned product is represented only by an assumption such as “code exists, therefore it works”.

## 6. Phase B — runtime, browser shell and navigation convergence

Goal: make the complete application shell trustworthy before expanding feature work.

Required work:

- prove clean-clone startup, migration, login, workspace hydration, readiness, worker health and graceful shutdown;
- establish browser-level smoke coverage for login, startup, organisation context, RU/EN and every visible workspace;
- converge navigation onto one canonical registry and stable route/action identifiers;
- remove text-search/DOM-observer navigation hacks where confirmed;
- remove only verified orphaned legacy CSS/JS and update architecture/tests in the same PR;
- ensure every visible menu item either opens a real supported workspace or is removed until that planned capability is actually implemented;
- preserve planned product capabilities in this plan even when unfinished menu placeholders are removed;
- enforce loading, empty, populated, filtered/no-results, validation, permission, domain/server, transient/network, busy/idempotent replay, success, stale/conflict and responsive states where applicable;
- eliminate browser console errors and unhandled rejection paths from supported flows;
- add dedicated browser CI, preferably Playwright or equivalent supported external browser runner.

Exit condition: the application shell and all exposed navigation are truthful, deterministic and browser-tested.

## 7. Phase C — Product / PLM development completeness

Goal: complete the technical product-development spine as one fashion-native system.

Scope remains fully in product:

### Planning
- season/year/collection planning;
- line plan and assortment structure;
- category/gender/product-type/brand/season governed references;
- target quantity, costing, price/margin and capacity planning where specified;
- development calendars, milestones, dependencies and critical path;
- reusable task templates and execution tracking;
- import/export where part of canonical workflow.

### Product Identity / Style development
- ProductStyle / StyleVersion;
- Colorway;
- SizeScale / SizeScaleVersion / SizeValue;
- ProductSku;
- media, sketches, references, construction data and attachments;
- exact version history and lifecycle;
- re-use/carryover only through explicit version semantics.

### Materials / BOM
- material and trim libraries;
- exact material versions and supplier context;
- composition, colour, UOM, certificates/care/test evidence;
- multi-BOM / sample versus production BOM where required;
- component placement, consumption, wastage/efficiency and size/colour dependencies;
- costing linkage without introducing a competing actual-cost truth.

### Measurements
- governed measurement point/unit libraries;
- measurement blocks/charts;
- base size and ordered size range;
- grading rules;
- versioning and publication;
- sample-to-chart comparison;
- import/export integrations only through explicit contracts.

### Samples
- sample request lifecycle;
- sample types/revisions including proto/fit/size-set/PPS where applicable;
- supplier/factory linkage;
- measurement, fit, laboratory, industrial and expert evaluation;
- comments, defects, attachments and approvals;
- explicit connection to readiness.

### Tech Pack
- canonical tech-pack assembly from exact frozen technical versions;
- factory/supplier template profiles where required;
- version identity and generation status;
- PDF/ZIP/export contract;
- change history and stale-version protection;
- no decorative tech-pack menu without working generation/open/download paths.

### Sourcing / supplier development
- supplier master/relationship context;
- RFQ / quote / comparison;
- commercial terms;
- award/allocation;
- MOQ, lead time, capacity and factory assignment;
- supplier scorecard and quality/compliance evidence where specified.

Exit condition: the development path can be executed from planning to a technically complete and governed product without manual reconstruction between modules.

## 8. Phase D — Production and quality completeness

Goal: connect the frozen technical product to physical execution.

Required work:

- production order / production execution lifecycle;
- exact factory/supplier and committed ProductSku/order-line context;
- production milestones and quantities;
- work-in-progress and readiness-to-ship states;
- manufacturing/operation specifications where part of the product contract;
- in-line/final quality inspections;
- defects linked to exact ProductSku/batch/shipment context;
- defect photos, protocols, corrective action and disposition;
- supplier recovery/claim flow with exact lineage;
- production and quality evidence consumed by Product Readiness rather than re-entered as external arbitrary truth where repository-authoritative evidence exists.

Exit condition: the system can prove what was planned, what was produced, what was inspected and what is allowed to progress.

## 9. Phase E — Product Readiness and commercial publication convergence

Goal: make the PLM-to-commerce handoff canonical and unambiguous.

Required work:

- preserve both blocked and positive READY scenarios;
- close remaining readiness evidence gaps with repository-authoritative sources where practical;
- ProductReadinessSnapshot remains the formal technical gate;
- CommercialProductProjectionVersion can originate only from exact READY lineage;
- eliminate all fresh flat-catalog publication/pricing/catalog origination paths (`PUB-005`);
- decide and implement one canonical CommercialPublication lifecycle (`COMM-LC-008`) or formally establish the atomic immutable model as the sole product contract;
- complete exact ProductSku pricing identity, market and effective-period semantics (`PRICE-009`);
- preserve immutable publication/pricing history;
- prevent historical compatibility readers from becoming new-write sources;
- keep Collection / Showroom / Line Sheet assignment consistent with frozen publication truth.

Exit condition: technical truth becomes commercial truth through one explicit supported handoff with no competing fresh-write path.

## 10. Phase F — Buyer commerce completeness

Goal: complete the buyer-side commercial workflow, not merely catalog display.

Required work:

### Showroom / buyer access
- showroom lifecycle;
- invitations and accepted access;
- active relationship checks;
- brand/shop actor separation;
- catalogue visibility and expiry/revocation semantics.

### Buyer Catalog / Line Sheet
- exact CommercialPublication + PriceListVersion pin;
- variant-rich ProductSku hierarchy;
- images, colour, size, terms, MOQ, delivery context and price visibility;
- stable RU/EN and responsive buyer UX;
- no textual-SKU pricing identity on canonical writes.

### Selection / Assortment / Color × Size
- selection from exact BuyerCatalogVersion;
- immutable/frozen commercial references needed downstream;
- colour × size matrix quantities;
- validation against available commercial variants;
- catalog supersession behavior for open selections;
- explicit stale/version conflict handling;
- buyer draft/save/reopen/submit workflow where specified.

### Wholesale Order
- selection → order conversion;
- quantities, prices, currency, MOQ and terms derived server-side from frozen catalog/selection truth;
- brand review/accept/reject/amend lifecycle where specified;
- exact order line identity;
- OrderCommitSnapshot as the immutable commercial commitment boundary;
- both actors see the correct committed result.

Exit condition: a buyer can complete a real commercial transaction from an authorized catalog to immutable committed order without unsupported manual bridges.

## 11. Phase G — Supply, shipment, receipt and inventory completeness

Goal: carry the immutable commercial commitment into physical fulfillment.

Required work:

- SupplyCommitment from exact OrderCommitSnapshot;
- supply allocations by exact committed order line + ProductSku;
- shipment lifecycle and exact ShipmentLine identity;
- partial shipment, split shipment and outstanding quantity behavior;
- receipt and discrepancy handling;
- receipt claims and supplier recovery;
- logistics dates/statuses and external integration events where specified;
- centralized InventoryLocation / Balance / Reservation / Allocation / Movement truth;
- ATS derived centrally;
- in-transit, quality-hold, damaged, returned and quarantine states where specified;
- concurrency, locking, idempotency and reconciliation;
- no buyer/order screen may maintain a competing inventory balance.

Exit condition: committed order quantities become traceable physical supply, shipment, receipt and stock without losing ProductSku/order-line identity.

## 12. Phase H — Actual cost, landed cost, allocation, margin and close completeness

Goal: prove exact economics of the same physical/commercial lineage.

Required work:

- SKU-specific physical ActualCost requires exact `orderLineNo + productSkuId` and shipment/supply context where applicable;
- generic costs remain explicitly aggregate when exact physical scope does not exist;
- LandedCostSnapshot freezes exact cost basis;
- CostAllocationRunSnapshot preserves exact canonical ProductSku line allocation;
- MarginActualizationSnapshot pins committed revenue and exact landed/allocation provenance;
- CostCloseReadiness and CostClose freeze the same basis;
- post-close costs create PostCloseAdjustment rather than rewrite history;
- pending-post-close margin requires explicit exact reallocation/reconciliation before returning to current detailed provenance;
- OrderEconomicsPosition exposes the effective immutable position without hiding historical facts;
- end-to-end public-runtime/PostgreSQL acceptance must prove the complete Product → Margin chain.

Exit condition: Syntha can explain where every committed revenue and actual landed-cost amount came from and how it affects margin, including late-cost correction.

## 13. Phase I — KPI, sell-through, supplier performance and management intelligence

Goal: convert operational facts into governed management information without a parallel analytics truth.

Required work:

- connect `kpi-governance` to real runtime/persistence or explicitly redesign/remove only through an architecture decision;
- persist governed KPI observations with exact source lineage;
- formula version, methodology version and DQ status remain explicit;
- no recomputation of historical KPI meaning from changed methodology without versioned restatement semantics;
- sell-through and inventory performance from canonical sales/inventory sources;
- margin and profitability from exact commercial/economic chain;
- supplier performance from sourcing, production, quality, shipment, claim and cost facts;
- calendar/critical-path/product-development performance;
- buyer/order/wholesale performance;
- dashboards must distinguish VALUE, ZERO, NOT_APPLICABLE, MISSING and INVALID where methodology requires;
- management screens show decisions/exceptions, not only decorative metrics.

Exit condition: analytics are traceable to canonical operational facts and usable for management decisions.

## 14. Phase J — integrations and enterprise operating requirements

Goal: make the platform deployable and operable as a real enterprise product.

Required work:

- transactional outbox for external effects;
- supported ERP/WMS/PIM/OMS/QMS/accounting integrations only through versioned contracts;
- integration idempotency, replay, dead-letter and monitoring;
- authentication/session hardening and organisation isolation;
- security headers and CSP;
- secrets/configuration separation;
- backup/restore and migration operational runbook;
- observability, metrics, health/readiness and alerting;
- worker failure/dead-letter visibility;
- retention and maintenance jobs;
- deployment automation;
- managed PostgreSQL-compatible production topology;
- deterministic environment/bootstrap procedures;
- non-destructive acceptance namespaces;
- performance/load/concurrency verification on critical write paths;
- accessibility and responsive browser quality for supported workspaces.

Exit condition: the product is supportable in a long-running production environment, not merely executable on a developer laptop.

## 15. Phase K — product UX and role-by-role completion

Goal: make the whole product understandable and efficient for real fashion teams.

For every persona/workspace:

- first useful action from login must be clear;
- navigation must expose only authorized and functioning capabilities;
- role-specific workspace contains the facts, actions, exceptions and decisions needed by that role;
- no user must remember hidden state that the system can derive;
- repetitive navigation and duplicate manual entry are removed;
- task/calendar/notification surfaces link to the exact object requiring action;
- forms use governed references and safe defaults;
- batch actions exist where fashion workflows require scale;
- tables support search/filter/sort/pagination where needed;
- inspector/detail views preserve context;
- error messages are actionable and semantically correct;
- RU/EN parity is maintained;
- ODS v1 is the only new visual/component language;
- visual polish never masks incomplete handler/domain behavior.

Exit condition: each supported role can execute its real daily workflow without unsupported side channels for core planned capabilities.

## 16. Phase L — error semantics, idempotency and backend convergence

Goal: remove systemic backend debt that can make otherwise complete flows unreliable.

Required work:

- audit all domain error codes and classify them by stable client semantic class;
- ensure HTTP mapping is complete and maintainable, not dependent on a fragile manually growing fallback list;
- document error class/status meaning in the API contract;
- preserve original domain error across rollback/retry failures;
- audit command/idempotency registries and converge redundant command-log structures when this can be done without weakening bounded-context guarantees;
- prove idempotent replay, same-key/different-payload conflict, concurrent duplicate submission and stale version conflict for critical mutations;
- ensure background workers and public commands share one durable transactional truth where required.

Exit condition: clients can react predictably to errors/retries and duplicate commands cannot corrupt business state.

## 17. Phase M — MDM and reference-data completion

Goal: ensure all governed fashion reference data has a real operational lifecycle.

Required work:

- complete taxonomy depth only where demanded by canonical flows;
- preserve exact entry/version/effective/active/approval semantics;
- audit `mdm_change_requests`, `mdm_dictionary_versions`, `mdm_source_states` and any other unused tables;
- if these represent planned MDM governance, implement the missing workflow, API, permissions and UI;
- if they are obsolete, remove only through a forward migration and synchronized architecture decision;
- prevent physical delete where immutable usage history depends on reference facts;
- provide controlled bootstrap and update process for operational reference profiles.

Exit condition: reference governance is intentional, executable and auditable; no unexplained dead persistence remains.

## 18. Phase N — advanced fashion intelligence and AI

Goal: add differentiated intelligence only on top of canonical product data.

Planned/eligible directions include, subject to explicit product decisions:

- trend and market intelligence;
- design assistance from prompts/sketches/reference images;
- brand-trained design context;
- colour/material-aware design assistance;
- digital sampling/visualization integrations;
- tech-pack assistance and validation;
- cost anomaly detection and cost optimization;
- supplier risk/performance intelligence;
- assortment, demand and replenishment intelligence;
- visual search across historical product/material/style data;
- content/e-commerce asset generation;
- AI decision support with source evidence and human approval where business risk requires it.

AI output must never silently replace governed ProductSku, BOM, measurement, commercial, order, physical, cost or margin truth.

Exit condition: AI accelerates the platform without creating an ungoverned second product database.

## 19. Complete acceptance ladder

Acceptance is expanded through independent slices while preserving all earlier gates.

Required sequence:

1. Campaign → Collection.
2. Product Identity → blocked Product Readiness → rejected Projection.
3. Product Identity + governed MDM + canonical Measurement → READY.
4. READY → Projection → Publication → PriceList → BuyerCatalog.
5. BuyerCatalog → Selection → Color × Size → WholesaleOrder → OrderCommitSnapshot.
6. OrderCommit → SupplyCommitment → Production/Quality as applicable → Shipment.
7. Shipment → Receipt → Inventory / claim/recovery invariants.
8. Shipment/Receipt → SKU-specific ActualCost → LandedCost → exact CostAllocation → MarginActualization → Cost Close.
9. Post-close late-cost adjustment → pending margin → exact reallocation → reconciliation → current margin.
10. Full connected Product → Margin golden path.
11. Sell-through/KPI/supplier-performance continuation where source integrations are available.

Each slice must use supported authenticated public-runtime mutations for business facts, verify the exact same PostgreSQL environment, assert positive lineage, assert important negative/fail-closed behavior, and assert prohibited side effects remain unchanged.

A lower slice being complete does not remove any later slice from scope.

## 20. Current continuation point

The current merged baseline is `main@0048d10c410231055d13436d61d0cf33db3e95b7` (#118).

At this baseline:

- Campaign → Collection acceptance exists;
- Product Identity → blocked readiness and positive READY harnesses exist;
- READY → Projection → projection-native CommercialPublication → PriceListVersion → BuyerCatalogVersion public-runtime acceptance exists at repository-CI evidence level;
- downstream BuyerCatalog → Selection → OrderCommit acceptance is still open;
- full OrderCommit → physical → ActualCost → Margin live proof is still open;
- `PUB-005`, `COMM-LC-008`, `PRICE-009`, `UI-006` and full `ACC-004` remain open/partial as recorded in `ARCHITECTURE.md`;
- PR #119 is the current open draft for canonical buyer commercial new-write convergence and must be evaluated/fixed/merged or superseded without losing its intended invariants;
- PR #120 is tooling/governance support and does not by itself change product capability status.

Therefore, unless superseded by a newly discovered more critical P0 or an explicit user instruction, the next execution priorities are:

```text
A. restore green exact-head repository/runtime gates for the active convergence work;
B. complete/supersede #119 safely and continue PUB-005 canonical new-write convergence;
C. specify and close BuyerCatalog → Selection → Color × Size → WholesaleOrder → OrderCommit transition contracts and acceptance;
D. close PRICE-009 and resolve COMM-LC-008 without introducing parallel commercial truth;
E. continue OrderCommit → Supply → Production/Quality → Shipment → Receipt → Inventory acceptance;
F. continue exact Shipment/Receipt → ActualCost → Landed → Allocation → Margin → Close → post-close reconciliation acceptance;
G. close the full connected Product → Margin `ACC-004` proof;
H. continue PLM, KPI, MDM, UX, integration, enterprise and advanced-intelligence completion phases until every planned capability reaches its required production status.
```

This sequence is the default continuation path. Completing any item moves execution to the next highest-priority open item; it does not end the product-completion program.

## 21. Definition of complete product

Syntha V2 is not complete when one investor path works, when all screens render, or when all unit tests pass.

The product is complete only when the planned canonical operating model has no material unsupported break between modules, all exposed capabilities satisfy the architecture Definition of Done, compatibility debt can no longer originate conflicting canonical truth, critical browser/runtime paths are tested, production operations are supportable, and the remaining PARTIAL/GAP/PLANNED entries are either closed or explicitly removed by a later approved product-contract decision.

Until then, this plan remains active.