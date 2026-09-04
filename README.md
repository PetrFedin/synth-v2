# Syntha V2

Standalone fashion B2B operating platform for brands, retailers, distributors and production partners.

Syntha V2 combines and extends the strongest operating patterns of JOOR, NuORDER, Brandboom, Centra and adjacent platforms without copying proprietary implementations.

The legacy `PetrFedin/syntha` repository remains unchanged; this repository is the independent home of all further Syntha V2 development.

## Authoritative platform specification

[`ARCHITECTURE.md`](ARCHITECTURE.md) is the authoritative living specification and technical requirements source of truth for Syntha V2. It records the canonical business chain, domain/entity lineage, module relations, fields and lifecycle rules, API/PostgreSQL/runtime contracts, UI/UX/ODS tokens and screen rules, current implementation status, architecture gaps, acceptance evidence and change register.

Every governed product/runtime change must update the affected `ARCHITECTURE.md` sections in the same pull request. This includes changes to behavior, entities/fields/relations, API/OpenAPI, migrations, lifecycle, roles/actions, UI blocks/fields/tables/buttons/icons, typography/colour/design tokens, deployment/env/workers and acceptance behavior. `npm run validate:architecture` enforces this synchronization in GitHub Actions. Supporting files under `docs/` deepen individual topics but do not replace the master specification.

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

## Live acceptance gates

Acceptance commands use reserved acceptance organisations and real authenticated `/v2` runtime mutations. They never use direct SQL for business mutation. PostgreSQL access is used for environment setup where explicitly governed and for same-environment persistence/lineage proof. Remote execution is fail-closed: non-local targets require HTTPS plus explicit `SYNTHA_ACCEPTANCE_ALLOW_REMOTE=true`.

`npm run acceptance:collection` drives:

`Campaign draft → Campaign open → Collection draft → Collection published`.

It verifies exact Campaign/Collection persistence and proves downstream commercial, buyer, inventory, supply and ActualCost state is unchanged.

`npm run acceptance:product-readiness` runs two independent Product Identity scenarios. The negative scenario deliberately omits governed category and canonical Measurement evidence, requires a BLOCKED readiness snapshot with exactly `category + measurements`, then proves Commercial Projection is rejected. The positive scenario creates governed APPAREL/INT_ALPHA/INT_M Product Identity plus a published canonical Measurement Chart and requires a READY snapshot with zero blockers. Both scenarios prove the exact PostgreSQL lineage without replacing one another.

`npm run acceptance:product-commercialization` continues a newly created positive READY graph through:

`READY ProductReadinessSnapshot → CommercialProductProjectionVersion → projection-backed CommercialPublication → PriceListVersion → BuyerCatalogVersion`.

The command also creates the exact Collection assortment assignment, open Showroom, active brand↔shop relationship and accepted showroom invitation required by the buyer-specific catalog boundary. It authenticates the reserved brand owner and shop owner as separate actors, verifies immutable ProductSku/projection/readiness/price lineage through public reads and same-environment PostgreSQL, and fails if the slice creates Selection, Order, SupplyCommitment, ActualCost or inventory movements. This gate proves the currently executable atomic-published commercial snapshot path; it does not imply that the planned staged CommercialPublication lifecycle or deeper effective-dated pricing contract is already implemented.

All acceptance commands require `SYNTHA_ACCEPTANCE_BASE_URL` and a database URL pointing to the same environment. Brand authentication uses `SYNTHA_ACCEPTANCE_EMAIL` / `SYNTHA_ACCEPTANCE_PASSWORD` or optional `SYNTHA_ACCEPTANCE_TOKEN`. Product commercialization additionally uses `SYNTHA_ACCEPTANCE_SHOP_EMAIL` / `SYNTHA_ACCEPTANCE_SHOP_PASSWORD` or optional `SYNTHA_ACCEPTANCE_SHOP_TOKEN`. `SYNTHA_ACCEPTANCE_RUN_ID` can pin deterministic idempotency keys for replay. Credentials and tokens are never printed by the commands. See [`CURSOR_START_HERE.md`](CURSOR_START_HERE.md), `.env.example` and the authoritative acceptance sections in `ARCHITECTURE.md` for the exact contract and status.

## Operations

Production metrics, scrape security, cardinality rules and incident response are documented in [`docs/observability.md`](docs/observability.md). Initial Prometheus alerts are provided in [`ops/prometheus/syntha-v2-alerts.yml`](ops/prometheus/syntha-v2-alerts.yml).
