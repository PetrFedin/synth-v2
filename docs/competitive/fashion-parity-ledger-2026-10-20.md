# SYNTHA V2 — Fashion Platform Capability Parity & Differentiation Ledger
Date: 2026-10-20
Status: RESEARCH / PLANNED; not a production feature or implementation approval.
Authority: working comparison accompanying ARCHITECTURE.md, docs/backlog-not-yet-integrated.md and Issue #283. If this document conflicts with them or code, re-verify the executable source first.

## Scope and evidence discipline

- Current code baseline for Syntha: main 546ef6afd0dd4f70bda54716fa3770566d014480. Latest P0 selection authorization work: Draft PR #311, not main. Current canonical Tech Pack / media candidates: stacked Draft PRs #280–#310, not main.
- Competitor capabilities below are supported by cited vendors' public documentation; NOT by authenticated access, contractual documentation or hands-on third-party functional tests. Marketing figures and "best" claims are not verified by this research.
- Legend: CORE = main has executable modules/architecture, not automatically production-proven; PARTIAL = requires named end-to-end/UI/operational acceptance; DRAFT = unmerged code; GAP = not confirmed in current canonical architecture; PROPOSED = proposed innovation, not proven market-unique.
- Competitive aim: exceed baseline in evidence quality, cross-module decision lineage and clarity of buyer/factory actions, not simply copy proprietary screens or code.
- No third-party source code, proprietary branding, datasets, weights or templates may be copied without an explicit license/contract check. Many proprietary vendors have no downloadable code.

## 1. Vendor capability references (official sources)

| Product | Verified public capability statements | Official source |
|---|---|---|
| Centric PLM + Planning/Pricing/Visual Boards/PXM | Design and product lifecycle, supplier collaboration, merchandise/assortment planning, pricing and inventory optimization, market intelligence, product experience management | https://www.centricsoftware.com/what-is-centric-plm ; https://www.centricsoftware.com/press-releases/centric-software-showcase-ai-powered-solutions-driving-retail-impact-nrf-2026 |
| PTC FlexPLM | Fashion product design, specs, costing, sourcing, sustainability, planning connectors, Flex Boards, Flex Insights | https://www.ptc.com/en/industries/retail ; https://www.ptc.com/en/industries/retail/flexplm |
| Lectra Kubix Link | PLM, PIM, visual Board, online Forms, supplier collaboration, collection calendar, tech packs, sustainability and traceability | https://www.lectra.com/en/library/discover-the-main-features-of-kubix-link-the-fashion-plm-solution ; https://www.lectra.com/en/fashion/products/kubix-link-plm |
| WFX | BOM, fabrics, grades/measurements, sampling, supplier collaboration, critical paths, detailed costing, Illustrator connector | https://www.worldfashionexchange.com/fashion-plm-software |
| Delogue | Supplier-connected BOM, reuse of components including packaging/care labels, sample reviews, role taskboards, attached comments and approvals | https://www.delogue.com/en/platform/core-features ; https://www.delogue.com/solutions/use-cases/collaboration-project-management |
| JOOR | Wholesale linesheets, customer-specific assortment/prices/discounts, orders, dashboards, buyer engagement signals | https://www.joor.com/wholesale-management ; https://www.joor.com/reporting-and-analytics |
| NuORDER | Virtual shows, shoppable 360/3D/video hotspots, dynamic price/ATS, branded e-commerce, draft orders and reorders | https://www.nuorder.com/wholesale/ ; https://www.nuorder.com/wholesale/virtual-showrooms/ |
| Omnidata.PLM (RU) | Model/colorway, assortment plans, BOM/material references, sample/PPS, deadlines, supplier quote process, import/export and ERP links | https://omnidata.ru/products/plm/ |
| 1C: Retail clothing & 1C: Trade Management (RU) | Clothing/shoes retail operations, stocks, procurement, warehouse, POS/cash, marked-goods operations | https://solutions.1c.ru/catalog/boutique/features ; https://v8.1c.ru/trade/ut-integratsiya-s-sistemoy-chestnyy-znak/ |
| MoySklad (RU) | Marking/Chestny Znak, inventory, Ozon/Wildberries order/stock/price integrations | https://www.moysklad.ru/programmy-dlja-biznesa/programma-dlya-markirovki-tovarov/ ; https://support.moysklad.ru/hc/ru/%D0%BE%D0%BD%D0%BB%D0%B0%D0%B8%D0%BD%20%D1%82%D0%BE%D1%80%D0%B3%D0%BE%D0%B2%D0%BB%D1%8F/%D0%BC%D0%B0%D1%80%D0%BA%D0%B5%D1%82%D0%BF%D0%BB%D0%B5%D0%B8%D1%81%D1%8B/%D1%81%D1%80%D0%B0%D0%B2%D0%BD%D0%B5%D0%BD%D0%B8%D0%B5_%D0%B2%D0%BE%D0%B7%D0%BC%D0%BE%D0%B6%D0%BD%D0%BE%D1%81%D1%82%D0%B5%D0%B8_%D0%B8%D0%BD%D1%82%D0%B5%D0%B3%D1%80%D0%B0%D1%86%D0%B8%D0%B8_%D0%BC%D0%BE%D0%B5%D0%B3%D0%BE%D1%81%D0%BA%D0%BB%D0%B0%D0%B4%D0%B0_%D0%B4%D0%BB%D1%8F_%D0%BC%D0%B0%D1%80%D0%BA%D0%B5%D1%82%D0%BF%D0%BB%D0%B5%D0%B8%D1%81%D0%BE%D0%B2 |
| Style3D | Digital fabric and physics-based garment creation, digital sampling, fashion collaboration, AI visual content | https://www.style3d.com/blog/digital-fashion-workflow-how-style3d-transforms-design-to-delivery-june-2026/ |
| Coats Digital FastReactPlan | Multi-stage apparel capacity planning, sewing line and upstream operations scheduling, workload/capacity visualization | https://web.coatsdigital.com/frp-en ; https://www.coatsdigital.com/en/testimonial/esquire-knit-composite-ltd-fastreactplan/ |
| RELEX Solutions | Demand forecasting/sensing, store/SKU replenishment, new-product analogue forecasting, merchandise/assortment planning, pricing and production schedules; manufacturer forecasting can use retailer POS rather than just wholesale sell-in | https://www.relexsolutions.com/solutions-overview/ ; https://www.relexsolutions.com/solutions/retail-connected-planning-for-manufacturers/ |
| o9 Solutions Apparel, Footwear & Luxury | Merchandise Financial Planning, OTB, store clustering and localization, size/pack optimization, omnichannel allocation, new product planning and scenario analysis | https://o9solutions.com/industries/retail/apparel-footwear-luxury ; https://o9solutions.com/solutions/merchandise-planning/assortment-planning |
| BlueCherry | PLM/BOM/costing connected with fashion ERP and MES real-time shop-floor execution and quality | https://bluecherry.com/en/solutions |
| Julivi (RU) | Apparel pattern CAD, 2D/3D modeling, digitization, grading and marker-making/cutting workflow | https://julivi.ru/ |
| САПР АССОЛЬ (RU) | Parametric pattern drafting, grading, auto-layout, 2D+3D pattern development and plotter-ready marker output | https://www.assol.org/ |

The assessment is bounded to publicly described features as of the stated date. "Not listed" never proves a competitor does not have a capability. Independent sandbox access is required for functional parity claims.

## 2. Feature parity matrix and target contracts

| Domain and feature | Syntha status in main | Strong public competitor reference | Syntha implementation improvement / objective |
|---|---|---|---|
| Exact Style/StyleVersion/Colorway/ProductSku identities | CORE | Centric, PTC, Lectra, Omnidata | Preserve one authoritative product lineage; remove SKU-text guessing in new commerce |
| BOM/material/trim versioning | CORE | WFX, Delogue, PTC | Frozen design/material change impact on cost and production |
| Sample / PPS approvals | CORE/PARTIAL | WFX, Delogue, Omnidata | Rich fit report, photos, tolerance, revision diff, rejection causes and owner |
| Measurement/size grading | CORE/PARTIAL | WFX, Delogue | Per-category POM ontology, grade rules, cross-size consistency, safe PDF |
| Canonical factory Tech Pack | PARTIAL, DRAFT | WFX, PTC, Delogue | Issued immutable source + current rights checking; canonical PDF HOLD until byte/font/print evidence |
| Packaging, labels, care instruction | PARTIAL/GAP | Delogue | Packaging BOM + care-label locale rules, supplier acknowledgment |
| Visual inspirations and collection board | PARTIAL | Centric Visual Boards, PTC Flex Boards, Lectra Board | Reusable layout from canonical StyleVersion, visual and commercial annotation |
| Calendar / T&A / critical path dependency | PARTIAL | Omnidata, Kubix Link, WFX | Machine-readable DAG, dependency lag, capacity conflicts, automatic impact proposal |
| Supplier portal and RFQ collaboration | CORE/PARTIAL | Omnidata, Delogue, WFX | Counterparty-scoped submissions + privacy-safe scoring + negotiation proof |
| Unit cost / landed cost / margin | CORE/PARTIAL | WFX, Centric | Preserve currencies, revisions, taxes, factory-specific constraints |
| BuyerCatalog/PriceList snapshot | CORE/PARTIAL | JOOR, NuORDER | Exact published version, buyer/shop/brand grant, effective price, no mutable fallback |
| Showroom Look pricing secrecy | GAP in main; #284 DRAFT | JOOR, NuORDER | Unlisted SKU buyer price redacted; no brand-owned price leak |
| Shoppable 3D/video Looks | GAP | NuORDER | Versioned media asset plus product hotspots linked to authorised BuyerCatalog, never raw brand price |
| Dynamic size/color wholesale matrix | CORE/PARTIAL | JOOR, NuORDER | ProductSku exact identity, MOQ, pack size, ATS and cutoff |
| Draft order + two-party approval | CORE | JOOR, NuORDER | Current grants/revoked trade checked before every negotiation and commit |
| Unbroken OrderCommit snapshot chain | CORE/PARTIAL | JOOR, Centric | Immutable purchase terms, revision evidence, physical fulfilment link |
| Retail doors / store allocation | CORE/PARTIAL | NuORDER, 1C, retail planners | Split per door, explicit delivery and volume constraints, cost impact |
| Forecasting by demand type | GAP | Centric Planning | Wholesale booking vs POS/sell-through as separate target series |
| Forecast backtesting and model registry | GAP | Retail planning providers | Time split, naive vs model, WAPE/MASE/bias, data cutoff |
| Store-cluster size/pack optimization | GAP/PARTIAL | o9 retail planning | Size-curve allocations by store/cluster/channel with exact constraint, SKU and budget lineage; no projected volume claimed without retailer POS |
| Consumer POS demand sensing vs wholesale bookings | GAP | RELEX manufacturer connected planning | Distinguish consumer sell-through, retailer inbound orders, returns and OOS; provide explicit forecast target and permitted POS data |
| Real-time factory MES evidence | PARTIAL | BlueCherry MES | Machine/operator/task completion with qualified factory data, offline replay, deviations, immutable QA/QC and safety access |
| Pattern engineering and maker integration | GAP/PARTIAL | Julivi, САПР АССОЛЬ | Versioned DXF/AAMA/ASTM pattern asset adapter with CAD ownership and marker/size grading, never invent geometry from Tech Pack screenshots |
| Optimized budget (OTB) and assortment | GAP/PARTIAL | Centric Planning, PTC Flex Insights | OR-Tools proposals with explicit constraints, approver, scenario comparison |
| Multi-factory line/capacity optimizer | GAP/PARTIAL | FastReactPlan | Line loading, SMV, equipment, personnel, fabric and sewing upstream bottlenecks |
| Wholesale buyer behavior analytics | PARTIAL/GAP | JOOR | Buyer view, shortlist, response rates only from consented attributable event streams |
| Supplier SLA and production confidence | PARTIAL | WFX, Delogue, FastReactPlan | Evidence-driven deviations, latest authoritative progress vs quoted date |
| Bulk vendor/ERP document ingestion | PARTIAL | Omnidata, Lectra | Docling behind source scan + field-level review + idempotent canonical commit |
| Mass PIM publishing / retail syndication | GAP/PARTIAL | Lectra PIM, Centric PXM | Channel-specific translations, image rights, attributes and export proof |
| RU warehouse/retail mark/EDI handling | GAP/PARTIAL | 1C, MoySklad | 1C/ЭДО/Chestny Znak adapters; retain regulatory source and audit |
| Fabric 3D physical simulation | GAP | Style3D | Attach qualified external digital material/pattern output to StyleVersion, do not pretend Three.js is physics engine |
| DPP / material traceability | PARTIAL/GAP | Kubix Link | GS1-compatible EPCIS event bridge and provenance with legal-scoped declaration |
| Decision/exception workcenter | PARTIAL | Delogue, PTC | Role-filtered blocker, suggested mitigation, execution receipt, explainable timeline |
| Multi-tenant permission revocation | CORE; hardening #311 DRAFT | Enterprise PLM suites | Test grant expiry / relation revocation / idempotency replay without leakage |

## 3. P0 technical gates (must precede new intelligent modules)

1. Stabilize PR #311 exact-head Verify and PostgreSQL CI. Run negative tests for revoked relationship, expired/revoked invite, cross-tenant pinned catalog substitution, and unchanged selection/outbox on denial. Test current authorization before replay.
2. Independently reconcile Draft #284 showroom commercial price redaction with #311 (the active branch based on main does not automatically contain #284). Avoid duplicate code or relying on closed UI hides.
3. Land immutable BuyerCatalog-only NEW Selection writes (PUB-005) at API, application and DB level, preserving read-only historical legacy. Explicitly reject selector-less or guessed ProductSku identity.
4. Order Builder negotiation requires active trade and exact current invitation/BuyerCatalog for every pre-commit mutation, not only commit; preserve cancellation and approved historical order audit after revocation.
5. Publish lifecycle DRAFT → READY → PUBLISHED → SUPERSEDED/REVOKED; append-only prices and explicit effective period and market (PRICE-009, COMM-LC-008).
6. Confirm factory Tech Pack production read and print boundaries separately: byte-retained media rights, no cost disclosure, deterministic PDF/UTF-8, per-role 2 revision browser evidence.
7. Secure branch protection, independent review, exact-SHA green, transactional PostgreSQL negative probes and authentic 375/768/1440 screenshots.

## 4. Implementation waves: backlog and acceptance

### P1 — Operational completeness
- Supplier quotation comparison matrix: explicit currency, MOQ, lead time, logistics, validity, award trail; negative test for wrong-tenanted quote and post-expiry award.
- Collection critical path: each task has upstream ids, required deadline, owner, dependency lag and publication/production implication; recompute generates proposed changes, not auto-commit.
- Tech Pack / fitting feedback: source page, POM, target/actual/tolerance, revision and supplier acknowledgment; production gate blocks unresolved critical deviations.
- Packaging/care labels with multi-language and composition derivation, regulatory review workflow, versioned supplier export.
- External Integration Gateway v1: staging upload with source hash, parser version, row-level errors, MDM reconciliation, read-only preview, human approval, canonical service commit and replay safety.
- Russian adapters: 1C inventory/prices/orders, 1C-ЭДО/УПД, Chestny Znak marked goods with strict legal qualification; isolate to data-contract level before any live API.
- Commercial PIM: SKU attributes, locales, media provenance, exact publication-version exports, channel-specific policy.
- Showroom Media: visual layouts, shoppable hotspots/images/video subject to buyer-specific catalog, permissions and media-rights.

### P2 — Decision intelligence (do not disguise wholesale orders as POS demand)
- DuckDB snapshot prototypes with tenant isolation, append-only extraction manifests and observable freshness; PostgreSQL remains source of truth.
- StatsForecast univariate seasonal baselines for each clearly labeled target metric, with rolling origin holdout and missing/OOS data policy.
- Chronos challenger only after reproducible naive/statistical benchmark; licence check extends to model weights.
- OR-Tools (Apache-2.0 code) for OTB allocation and production resource constraints; recommendations remain uncommitted until approval.
- Size Curve & Store Cluster Optimizer v1: validate local size distributions, store capacity, pack/MOQ, margin and OTB constraints, compare against naive equal allocation, and keep all proposals uncommitted.
- Consumer Demand Source Contract: no wholesale bookings relabelled POS; distinguish SKU/store sell-through, stockout censoring, returns, promotions, and data ownership with per-feed freshness.
- Garment CAD Bridge: optional ASTM/AAMA/DXF connector to Julivi/Assol/other CAD with explicit pattern/marker file provenance and version controls; do not assert format support without tested vendor exchange.
- Buyer Intelligence on explicitly captured permitted event data (views, favorites, carts, responses) with accurate missingness.
- Supplier capability, trust and capacity passports backed by evidence, no private cross-tenant data leakage.
- EPCIS/DPP optional GS1-compatible event projections and C2PA optional media signatures, each with explicit claims scope, provenance and privacy policy.
- Style3D/Three.js-based optional 3D viewer/asset exchange; VTON blocked until models/weights/commercial rights and photo privacy are qualified.

## 5. Common acceptance scenario — compare all new features with one trusted process

Brand creates season and StyleVersion → materials/BOM → POM/graded size → PPS → canonical Tech Pack publication → factory acknowledgment → approved commercial projection → immutable buyer-specific catalog → showroom visual presentation → selection matrix → two-party order → exact OrderCommit → supplier allocation/production/QC → shipment/receipt → actual landed cost and margin → analytic snapshot and next-season proposal.

Every new feature must produce explicit actor/org/id/version/time, events and irreversible evidence where applicable. Test counterparty revocation *between* every adjacent transition. Ensure customer proposal cannot write directly to Product Master, Order, payments or inventory. Snapshot history persists without surviving permissions.

## 6. Proposed differentiation (not claims of unique market ownership)

- Decision Evidence Graph: each forecast/optimization recommendation links exact snapshot, constraints, reviewer and eventual measured result; transparent model version and re-evaluation cost.
- Change Impact Preview: before committing a PLM revision, show affected BOM, price, supplier material, production reservation, existing orders and their immutability boundaries.
- Cross-organization Trust Ledger: provenance-qualified supplier competence, factory quality, delivery commitments and external certifications. Never leak other companies' commercial terms.
- Evidence-First Investor Tour: SHA-bound CI, product screenshots and annotated 20–30s videos for genuine role workflows with reproducible real API and DB isolation, never theatrical mockups.

## 7. Required next artifact sequence

A. Exact SHA green PR #311 and independent security review;
B. Order negotiation live-grant P0 slice in separately auditable PR;
C. PUB-005 and price/publication lifecycle convergence PRs;
D. Integration Gateway contract plus Docling opt-in adapter and negative tests;
E. Demand Baseline Studio + provenance/evaluation;
F. OR-Tools scenario optimizer; only then external market network and DPP/3D.

**Current release gate: HOLD; this research is not proof of installed third-party software, parity, revenue or production readiness.**
