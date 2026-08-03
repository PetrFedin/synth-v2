# Syntha V2

Standalone fashion B2B operating platform for brands, retailers, distributors and production partners.

Syntha V2 combines and extends the strongest operating patterns of JOOR, NuORDER, Brandboom, Centra and adjacent platforms without copying proprietary implementations.

The legacy `PetrFedin/syntha` repository remains unchanged; this repository is the independent home of all further Syntha V2 development.

## Executable core

`Campaign → Collection → Showroom → Selection → Order Builder → Order → Confirmation → DealSpace`

The current system includes PostgreSQL-owned authentication, organisation RBAC, partner access, digital showrooms, server-authoritative catalog pricing, MOQ and ATS controls, atomic inventory reservations, bilateral confirmation, order cancellation with inventory release, DealSpace, shared collaboration threads, operational calendar events and reminders, system milestones, notifications, OpenAPI and a standalone web workspace.

## Interface languages

The web workspace supports Russian and English. The `RU / EN` switch is available before authentication and inside the workspace. The selected locale is persisted in the browser and controls navigation, forms, statuses, dates, numbers and fallback UI messages without reloading the application.

All new user-facing text must be routed through `public/modules/i18n-runtime.js`. `npm run validate:i18n` verifies dictionary integrity, browser execution order, locale persistence, static delivery and critical UI action wiring.

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

When PostgreSQL runs through Homebrew instead of Docker, point `SYNTHA_V2_DATABASE_URL` in `.env` to its actual local port before starting the application.

## Connected demo workspace

After the owner is created, populate the existing interface with a repeatable connected scenario:

```bash
npm run demo:seed
npm run dev
```

The seed uses the real application services and creates:

- brand owner, sales manager and buyer accounts;
- active, pending, rejected and revoked partner relationships;
- open and draft campaigns, collections, SKU catalog, MOQ and ATS cases;
- open and draft digital showrooms plus accepted and pending invitations;
- draft Selection, cancelled order and completed DealSpace scenarios;
- operational calendar events with scheduled, in-progress, completed and cancelled statuses;
- linked collaboration threads, messages and an archived discussion;
- projected notifications and existing system milestones.

The command is idempotent and can be run again without duplicating the scenario. The bootstrap owner keeps the password configured in `SYNTHA_BOOTSTRAP_PASSWORD`; optional demo accounts use `SYNTHA_DEMO_PASSWORD`.

Run `npm run verify` before publishing changes.

## Operations

Production metrics, scrape security, cardinality rules and incident response are documented in [`docs/observability.md`](docs/observability.md). Initial Prometheus alerts are provided in [`ops/prometheus/syntha-v2-alerts.yml`](ops/prometheus/syntha-v2-alerts.yml).
