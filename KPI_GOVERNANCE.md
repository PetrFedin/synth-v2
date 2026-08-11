# SYNTH-V2 KPI Governance

Fashion KPI governance is a first-class platform capability, not a collection of dashboard formulas.

Start with [`docs/fashion-kpi/README.md`](docs/fashion-kpi/README.md).

Current layers:

- catalog baseline V14: 1,290 governed definitions;
- native executable methodology V16: source-bound economics/fulfillment subset and central calculation/DQ primitives;
- immutable registry V17: semantic definitions, release lifecycle, physical mappings, mapping verification and dependency graph;
- next runtime layer: calculation runs, observations, DQ/reconciliation and restatement lineage.

Key code/persistence:

- `src/modules/kpi-governance/public.mjs` — canonical calculation/DQ primitives;
- `src/modules/kpi-registry/public.mjs` — immutable registry domain and lifecycle rules;
- `src/infrastructure/postgres-kpi-registry-store.mjs` — registry persistence adapter;
- `db/migrations/044_kpi_registry.sql` — registry base schema and lifecycle guards;
- `db/migrations/045_kpi_registry_semantic_guards.sql` — mapping/dependency role guards;
- `db/migrations/046_kpi_registry_ready_mapping_guards.sql` — production-ready mapping evidence guard;
- `db/migrations/047_kpi_registry_current_state_views.sql` — canonical current-state read models;
- `scripts/validate-fashion-kpi.mjs` — methodology/native-source validation;
- `scripts/validate-kpi-registry.mjs` — registry invariant validation.

Repository rules:

1. Never redefine a governed KPI locally in UI code.
2. Semantic change -> new formula version.
3. Physical source change with unchanged meaning -> new mapping-set version.
4. Mapping review/approval without source change -> append verification event.
5. Readiness change without semantic change -> append definition release event.
6. Alias/blocked umbrellas never calculate independently.
7. `PRODUCTION_READY` requires verified effective mappings, calculation/population tests, reconciliation and owner/data-steward UAT.
8. Historical registry records are append-only; do not update/delete them.
9. Runtime observations must retain exact definition/mapping/run lineage and distinct data states (`ZERO`, `NOT_APPLICABLE`, `MISSING`, `INVALID`).
10. Run `npm run verify` before publishing changes.

The repository validators and tests are intended to fail on semantic/source/lifecycle drift before that drift reaches a dashboard or API consumer.
