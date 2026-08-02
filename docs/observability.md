# Syntha V2 observability

## Scope

Syntha V2 exposes a protected Prometheus endpoint at `GET /metrics`. The endpoint is disabled by default and is independent from end-user session authentication.

The metrics surface covers:

- process uptime and memory;
- PostgreSQL pool occupancy and waiters;
- pending, scheduled, expired and dead-letter queue states;
- notification projection backlog;
- active authentication sessions;
- bounded HTTP request counts and duration histograms;
- background worker readiness, activity, runs and failures;
- retention maintenance runs and deleted-record totals;
- collector availability and stale-snapshot state.

No actor id, organisation id, order id, SKU, request id, raw URL, exception text or other user-controlled value is emitted as a Prometheus label.

## Enable the endpoint

Set the following environment variables:

```dotenv
SYNTHA_METRICS_ENABLED=true
SYNTHA_METRICS_TOKEN=<unique-random-secret-with-at-least-32-characters>
SYNTHA_METRICS_CACHE_TTL_MS=5000
```

Startup fails when metrics are enabled without a valid token. Keep the token in the deployment secret store, not in source control, images, shell history or monitoring configuration committed to the repository.

## Prometheus scrape configuration

Inject the bearer token from the monitoring platform's secret mechanism.

```yaml
scrape_configs:
  - job_name: syntha-v2
    metrics_path: /metrics
    scheme: https
    authorization:
      type: Bearer
      credentials_file: /run/secrets/syntha_metrics_token
    static_configs:
      - targets:
          - syntha-v2.internal:4100
```

Production scraping must use TLS or a private service-mesh connection. Do not expose `/metrics` through a public ingress. Rotate the token after suspected disclosure and periodically under the organisation's secret-rotation policy.

## Collection behaviour

The PostgreSQL snapshot is gathered by one fixed query and cached for `SYNTHA_METRICS_CACHE_TTL_MS`. Concurrent scrapes share a single in-flight query. This prevents Prometheus replicas from amplifying database load.

When PostgreSQL collection fails after at least one successful scrape, Syntha serves the last successful bounded snapshot and sets:

- `syntha_metrics_collector_up{collector="postgres"} 0`
- `syntha_metrics_collector_stale{collector="postgres"} 1`
- increments `syntha_metrics_collection_errors_total`

This keeps dashboards useful during a transient outage while making stale data explicit. Readiness remains authoritative for traffic routing; metrics collection does not mask a failed `/ready` check.

## Online index migrations and readiness

Large workspace paging indexes are installed with `CREATE INDEX CONCURRENTLY` through migrations marked `-- syntha:migration-mode=online`. Every statement is executed outside a transaction while the global migration advisory lock remains held.

At every startup, already-recorded online migrations are reconciled with the actual PostgreSQL catalog:

- a valid index is left untouched;
- a missing index is rebuilt concurrently;
- an invalid remnant from an interrupted build is dropped concurrently and rebuilt;
- the migration ledger is written only after every new index is verified with `pg_index.indisvalid`;
- a retry after a ledger-only failure does not rebuild healthy indexes.

The `/ready` endpoint independently inspects every required online index. Applied migration checksums are not sufficient: a missing or invalid required index returns `503`, `reason: migration-drift`, and includes `missingIndexes` or `invalidIndexes` in the migration state.

Operational rules:

1. do not edit or delete rows in `schema_migrations` manually;
2. do not create replacement indexes under different names;
3. after an interrupted deployment, restart the same application version and allow the migrator to reconcile the index state;
4. keep the instance out of traffic until `/ready` returns `ready`;
5. investigate repeated rebuild failures for locks, disk capacity, permissions, statement timeouts and PostgreSQL health;
6. never run multiple independent migration tools against the same schema outside the Syntha advisory-lock protocol.

## Initial alerts

The repository contains `ops/prometheus/syntha-v2-alerts.yml`. Tune queue thresholds only after observing normal production volume, but do not remove alerts for collector failure, worker readiness, dead letters or PostgreSQL waiters.

Recommended response order:

1. confirm `/ready` and `syntha_metrics_collector_up`;
2. inspect PostgreSQL saturation, migration checksums and required index state;
3. inspect worker readiness and consecutive failures;
4. inspect dead letters, expired claims and backlog growth;
5. use application logs and audited dead-letter records for root-cause analysis;
6. requeue a dead letter only after the underlying defect is fixed and record a specific recovery reason.

## Cardinality contract

Only controlled enums may become labels. Adding a new metric label requires all of the following:

- a documented finite value set;
- a regression test proving arbitrary identifiers cannot appear;
- an alert/dashboard need that cannot be met without the label;
- review of expected time-series growth.

Never add raw path parameters, query parameters, headers, emails, external error messages or database identifiers as labels.
