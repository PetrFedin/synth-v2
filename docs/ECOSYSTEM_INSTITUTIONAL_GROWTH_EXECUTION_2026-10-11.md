# Synth-v2 — Institutional Growth & Commercial Network Execution
Status: PROPOSED / documentation-only; 2026-10-11.
Companion to [Integration Master Plan](SYNTH_V2_INTEGRATION_MASTER_PLAN_2026-10-01.md). No feature here is asserted deployed.

## Outcomes and boundary
Grow a governed B2B fashion operating network without forking Product Master, supplier, order, pricing, or PostgreSQL authorities. All external integrations use versioned admitted events and immutable evidence references.

## Priority lanes
1. **Buyer and supplier golden path (P0).** Product readiness -> collection publication -> buyer-specific assortment and price -> size-grid order -> confirmation -> allocation -> delivery -> sell-through -> reorder. Each role sees one next action, deadline, owner and source evidence. Gate: reproducible role-separated end-to-end test.
2. **Supplier qualification passports (P1).** Signed supplier evidence, issuer status/expiry/revocation, factory/QC milestones, actual performance history. Source of truth remains native; external verifiers read constrained projections. Gate: revoke and verify tests.
3. **Commercial decision cockpit (P1).** Margin, WOS, size-curve gaps, sell-through, stockout risk, delayed supply and scenario comparison; provenance and confidence per recommendation. Recommendations require buyer approval; never auto-commit orders.
4. **Partner integration kit (P2).** OpenAPI, event catalog, sample sandbox, import contracts, self-certification conformance suite for ERP, POS, logistics and brand agencies; versioned compatibility guarantees and error taxonomy.
5. **Network economics (P2).** Opt-in certified supplier directory, verified performance badges, enterprise white-label/OEM offers, marketplace lead attribution and rev-share ledger. No rankings purchased as factual quality claims.

## Parallel responsibility lanes
Re-use existing workflow assignees; projections: buyer, supplier, production, logistics, finance, compliance. Display workload, deadline and unblocker, no independent assignment authority.

## Execution controls
Every slice requires exact-head CI, tenant isolation/price leakage tests, replay/idempotency, audit trail, user walkthrough on mobile/desktop, and measurable baseline for order cycle-time, manual hours, on-time delivery, GMROI. Roll out by pilot cohort; do not claim commercial improvements before measured proof.
