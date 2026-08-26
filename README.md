# Syntha V2

Standalone fashion B2B operating platform for brands, retailers, distributors and production partners.

Syntha V2 combines and extends the strongest operating patterns of JOOR, NuORDER, Brandboom, Centra and adjacent platforms without copying proprietary implementations.

The legacy `PetrFedin/syntha` repository remains unchanged; this repository is the independent home of all further Syntha V2 development.

## Executable core

`Campaign → Collection → Showroom → Selection → Order Builder → Order → Confirmation → DealSpace`

The current system includes PostgreSQL-owned authentication, organisation RBAC, partner access, digital showrooms, server-authoritative catalog pricing, MOQ and ATS controls, atomic inventory reservations, bilateral confirmation, order cancellation with inventory release, DealSpace, calendar milestones, notifications, OpenAPI and a standalone web workspace.

## Omnidata Design System v1

All PLM workspaces share one visual and bilingual contract through Omnidata Design System v1. Planning, BOM, Measurements, Samples, Sourcing, Tech Packs, Production and Final Quality load beneath the same final token/role layer. New workspaces must reuse the seven canonical ODS roles (`table`, `filterbar`, `card`, `status`, `inspector`, `button`, `field`) and semantic `data-ods-part` structure instead of creating a local visual dialect.

The complete integration and migration rules are documented in [`docs/omnidata-design-system-v1.md`](docs/omnidata-design-system-v1.md). `npm run verify` includes the ODS contract validator.

## Interface languages

The web workspace supports Russian and English. The `RU / EN` switch is available before authentication and inside the workspace. The selected locale is persisted in the browser and controls navigation, forms, statuses, dates, numbers and fallback UI messages without reloading the application.

All new user-facing text must be routed through `public/modules/i18n-runtime.js`. `npm run validate:i18n` verifies dictionary integrity, browser execution order, locale persistence, static delivery and critical UI action wiring.

## Product direction

Digital linesheets and buyer collaboration; assortment planning, budgets, doors and size curves; wholesale CRM and payments; style/color/size catalog; PLM, BOM and samples; production, QC, logistics and landed cost; analytics and integration APIs.

## Local start / Cursor

Node.js 22+ and PostgreSQL 17 are the supported runtime baseline. For a deterministic local workspace:

```bash
cp .env.example .env
npm ci
docker compose up -d
npm run bootstrap:owner
npm run dev
```

The local example keeps `HOST=127.0.0.1`. `bootstrap:owner` waits for PostgreSQL and applies repository migrations before creating the initial owner organisation and membership. The application also waits for PostgreSQL and applies any pending migrations during startup.

## Cloud start

A physical `.env` file is optional. `npm start`, database migration, owner bootstrap and other operational commands load `.env` only when it exists; environment variables already supplied by the platform take precedence over local file values.

Configure at least `SYNTHA_V2_DATABASE_URL` (or `DATABASE_URL`). Managed platforms normally inject `PORT`; otherwise Syntha uses `4100`. When `HOST` is not supplied, the supported startup command binds to `0.0.0.0` so the service is reachable through a container or cloud ingress. Set `HOST` explicitly when a deployment requires a narrower bind address.

Recommended deployment sequence:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
npm start
```

Provision the first owner once with `SYNTHA_BOOTSTRAP_EMAIL`, `SYNTHA_BOOTSTRAP_PASSWORD`, `SYNTHA_BOOTSTRAP_NAME`, `SYNTHA_BOOTSTRAP_ORGANISATION` and `SYNTHA_BOOTSTRAP_ORGANISATION_TYPE`, then run `npm run bootstrap:owner`. Do not bake these bootstrap credentials into an image or repository file.

Use `GET /health` as the process liveness probe and `GET /ready` as the traffic/readiness probe. Readiness verifies PostgreSQL, migration state and registered operational workers; a non-ready dependency returns HTTP 503. Startup migrations are checksum-verified and serialized with a PostgreSQL advisory lock, so concurrent application instances do not race the migration sequence.

Run `npm run verify:postgres` against PostgreSQL before promoting a release candidate. GitHub CI runs the same PostgreSQL-backed verification on pull requests.

## Operations

Production metrics, scrape security, cardinality rules and incident response are documented in [`docs/observability.md`](docs/observability.md). Initial Prometheus alerts are provided in [`ops/prometheus/syntha-v2-alerts.yml`](ops/prometheus/syntha-v2-alerts.yml).
