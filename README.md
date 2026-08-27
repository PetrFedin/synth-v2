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

`docker compose` starts a dev PostgreSQL on port `5434` and a separate verification PostgreSQL on port `5435`. `.env.example` maps `SYNTHA_V2_DATABASE_URL` to the dev database and `POSTGRES_TEST_URL` to the verification database, so `npm run verify:postgres` does not populate or mutate normal workspace data.

The local example keeps `HOST=127.0.0.1`. `bootstrap:owner` waits for PostgreSQL and applies repository migrations before ensuring the initial owner organisation and membership. The operation is idempotent and concurrency-serialized: rerunning it with the same credentials and organisation returns the existing owner instead of creating duplicates. It does not rotate credentials or silently reinterpret an existing account as another organisation.

The application also waits for PostgreSQL and applies any pending migrations during startup.

## Cloud start

A physical `.env` file is optional. `npm start`, database migration, owner bootstrap and other operational commands load `.env` only when it exists; environment variables already supplied by the platform take precedence over local file values.

Configure at least `SYNTHA_V2_DATABASE_URL` (or `DATABASE_URL`). Managed platforms normally inject `PORT`; otherwise Syntha uses `4100`. When `HOST` is not supplied, the supported startup command binds to `0.0.0.0` so the service is reachable through a container or cloud ingress. Set `HOST` explicitly when a deployment requires a narrower bind address.

Recommended deployment sequence:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
npm start
```

Provision the first owner with `SYNTHA_BOOTSTRAP_EMAIL`, `SYNTHA_BOOTSTRAP_PASSWORD`, `SYNTHA_BOOTSTRAP_NAME`, `SYNTHA_BOOTSTRAP_ORGANISATION` and `SYNTHA_BOOTSTRAP_ORGANISATION_TYPE`, then run `npm run bootstrap:owner`. Re-running the command is safe only with the same owner password and ownership topology; changing either is intentionally fail-closed and must use an explicit account/organisation administration path instead. Do not bake bootstrap credentials into an image or repository file.

Use `GET /health` as the process liveness probe and `GET /ready` as the traffic/readiness probe. Readiness verifies PostgreSQL, migration state and registered operational workers; a non-ready dependency returns HTTP 503. Startup migrations are checksum-verified and serialized with a PostgreSQL advisory lock, so concurrent application instances do not race the migration sequence.

Run `npm run verify:postgres` against the dedicated PostgreSQL verification database before promoting a release candidate. The gate includes a real runtime process smoke: it starts the production-compatible `scripts/start.mjs` entrypoint against `POSTGRES_TEST_URL`, verifies migrations plus `/health` and `/ready`, sends `SIGTERM`, and requires a clean HTTP/worker/PostgreSQL shutdown. It never substitutes the normal development/production database for the verification database. GitHub CI runs the same PostgreSQL-backed verification on pull requests.

## Live acceptance gate

`npm run acceptance:collection` is the first non-destructive live acceptance scenario for a running Syntha environment. It uses reserved acceptance organisations and actor identities, checks liveness/readiness/authentication, and drives the real `/v2` HTTP surface through:

`Campaign draft → Campaign open → Collection draft → Collection published`.

The command then verifies that the exact Campaign/Collection are visible in the configured PostgreSQL database and that no downstream commercial publication, buyer catalog, selection/order, ProductSku inventory, warehouse movement, SupplyCommitment or ActualCost state changed during the collection-only flow. Reusing `SYNTHA_ACCEPTANCE_RUN_ID` replays the same mutation idempotency keys; omitting it creates a fresh isolated acceptance run.

Remote execution is fail-closed: non-local targets require HTTPS plus explicit `SYNTHA_ACCEPTANCE_ALLOW_REMOTE=true`. The configured database URL must point to the same environment as `SYNTHA_ACCEPTANCE_BASE_URL`, otherwise the persistence check fails. Use dedicated acceptance credentials or a short-lived token for the reserved `syntha-acceptance-brand-owner`; credentials and tokens are never printed by the command. See [`CURSOR_START_HERE.md`](CURSOR_START_HERE.md) and `.env.example` for the exact variables.

## Operations

Production metrics, scrape security, cardinality rules and incident response are documented in [`docs/observability.md`](docs/observability.md). Initial Prometheus alerts are provided in [`ops/prometheus/syntha-v2-alerts.yml`](ops/prometheus/syntha-v2-alerts.yml).
