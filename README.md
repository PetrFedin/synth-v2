# Syntha V2

Standalone fashion B2B operating platform for brands, retailers, distributors and production partners.

Syntha V2 combines and extends the strongest operating patterns of JOOR, NuORDER, Brandboom, Centra and adjacent platforms without copying proprietary implementations.

The legacy `PetrFedin/syntha` repository remains unchanged; this repository is the independent home of all further Syntha V2 development.

## Executable core

`Campaign → Collection → Showroom → Selection → Order Builder → Order → Confirmation → DealSpace`

The current system includes PostgreSQL-owned authentication, organisation RBAC, partner access, digital showrooms, server-authoritative catalog pricing, MOQ and ATS controls, atomic inventory reservations, bilateral confirmation, DealSpace, calendar milestones, notifications, OpenAPI and a standalone web workspace.

## Product direction

Digital linesheets and buyer collaboration; assortment planning, budgets, doors and size curves; wholesale CRM and payments; style/color/size catalog; PLM, BOM and samples; production, QC, logistics and landed cost; analytics and integration APIs.

## Start

```bash
cp .env.example .env
npm install
docker compose up -d
npm run bootstrap:owner
npm run dev
```

Run `npm run verify` before publishing changes.
