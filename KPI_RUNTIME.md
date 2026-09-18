# SYNTH-V2 KPI Runtime

The KPI runtime turns governed definitions and verified physical mappings into reproducible observations.

Start with:

- [`docs/fashion-kpi/README.md`](docs/fashion-kpi/README.md) — overall KPI governance;
- [`docs/fashion-kpi/registry-model.md`](docs/fashion-kpi/registry-model.md) — semantic registry V17;
- [`docs/fashion-kpi/registry-mapping-set-activation.md`](docs/fashion-kpi/registry-mapping-set-activation.md) — active physical mapping selection;
- [`docs/fashion-kpi/runtime-observation-model.md`](docs/fashion-kpi/runtime-observation-model.md) — run/observation/DQ/restatement model;
- [`docs/fashion-kpi/numeric-precision.md`](docs/fashion-kpi/numeric-precision.md) — exact decimal contract;
- [`docs/fashion-kpi/runtime-control-contract.md`](docs/fashion-kpi/runtime-control-contract.md) — required DQ/reconciliation gates.

Runtime code/persistence:

- `src/modules/kpi-runtime/decimal.mjs` — exact `NUMERIC(38,12)` decimal-string adapter;
- `src/modules/kpi-runtime/public.mjs` — run, binding, observation, control and restatement domain rules;
- `src/infrastructure/postgres-kpi-runtime-store.mjs` — append-only PostgreSQL adapter;
- `db/migrations/049_kpi_runtime_observations.sql` — immutable runtime facts and lineage;
- `db/migrations/050_kpi_runtime_read_models.sql` — canonical run/publication read models;
- `db/migrations/051_kpi_runtime_control_summary_fix.sql` — fanout-safe control summary;
- `db/migrations/052_kpi_runtime_payload_numeric_guards.sql` — typed-column vs audit-payload consistency;
- `db/migrations/053_kpi_runtime_required_controls.sql` — required control execution gate.

Core invariants:

1. Definition/release/mapping/verification/activation history remains in registry V17; runtime never rewrites it.
2. Every normal run pins the exact current `PRODUCTION_READY` release event and active mapping-set activation event that existed by run request time.
3. Every logical variable used by the run is pinned to an exact mapping row and `VERIFIED` event.
4. Persisted KPI numbers are canonical decimal strings in Node and PostgreSQL `NUMERIC(38,12)`, never JavaScript `Number` as the audit contract.
5. `VALUE`, `ZERO`, `NOT_APPLICABLE`, `MISSING` and `INVALID` are different states.
6. Ratio/rate observations can retain numerator, denominator and normalizer so later aggregation/reconciliation does not average percentages.
7. DQ and reconciliation results are separate immutable facts.
8. A missing required control is a failure of publication evidence even if no explicit `FAIL` row exists.
9. Restatement creates a new run linked to the superseded run; observations are never overwritten.
10. Publication is derived from one governed read model, not reimplemented independently in each UI/API.
11. Organisation-owned observations remain organisation-scoped.
12. `npm test` executes the KPI runtime validators; `npm run verify` therefore rejects runtime contract drift.

The next application layer should add durable commands/services for requesting a run, selecting execution-ready definitions, materializing source manifests, calculating the V16 primitives, persisting observation/control facts atomically and emitting publication/outbox events.
