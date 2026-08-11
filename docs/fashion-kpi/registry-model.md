# SYNTH-V2 KPI Registry Model

Version: 17.0

The KPI registry is the durable semantic control plane for SYNTH-V2 analytics. It stores **what a KPI means**, **how its logical inputs are physically mapped**, and the independent append-only lifecycle histories for definition release and mapping verification.

Calculated runs/observations are intentionally not stored in this registry layer yet. Definition history, mapping history, governance lifecycle and future observation history are separate concerns.

## 1. Why the registry is separate

Without a registry, KPI meaning leaks into SQL views, dashboard formulas, API handlers, spreadsheets and local module helpers. That creates silent drift.

The registry makes these concepts first-class and versioned:

- formula semantics;
- grain/population/time basis;
- aggregation/UOM/scale;
- physical input mapping;
- mapping verification;
- release readiness;
- alias/split/component/driver relationships.

## 2. Five append-only registry object types

### `kpi_definition_versions`

One immutable semantic definition version.

It contains:

- scope (`system` or `organisation`) and optional organisation ID;
- stable KPI code;
- immutable formula version;
- role (`CANONICAL`, `SPLIT_CHILD`, `BLOCKED_UMBRELLA`, `ALIAS`);
- canonical RU/EN names and domain;
- business definition/formula;
- calculation primitive;
- canonical UOM;
- directionality/goal function;
- grain/population/temporal/aggregation/dimensional contracts;
- zero/null/error policy;
- controls/publication contract;
- effective period;
- creator/time;
- SHA-256 content hash and complete JSON payload.

**It does not contain mutable release status.** Definition meaning remains immutable after insert.

### `kpi_definition_release_events`

Append-only lifecycle stream for one immutable definition.

Each event contains:

- definition ID;
- previous release-event ID;
- new release status;
- evidence;
- creator/time/hash/payload.

Current release state is derived from the latest event in the chain. Moving `DEFINED -> MAPPING_PENDING -> VALIDATION_PENDING` does not modify the semantic definition and does not require a new formula version.

### `kpi_source_mapping_versions`

One immutable physical mapping for one logical variable within a mapping-set version.

It contains:

- definition ID;
- mapping-set version;
- logical variable name;
- governed source-contract ID;
- source system/entity/path;
- datatype;
- primary/event key;
- event timestamp path;
- UOM/currency paths where applicable;
- join/filter contracts;
- creator/time/hash/payload.

**It does not contain mutable verification status.** Physical mapping identity and mapping verification are separate.

### `kpi_source_mapping_verification_events`

Append-only verification stream for one immutable physical mapping.

Statuses:

- `MAPPED_UNVERIFIED`;
- `VERIFIED`;
- `DEPRECATED`.

A `VERIFIED` event requires verification evidence. Moving from unverified to verified does not create a fake new mapping-set version because the physical path did not change.

### `kpi_definition_dependencies`

Immutable version-to-version semantic graph edge.

Supported relations:

- `ALIAS_OF`;
- `SPLIT_FROM`;
- `COMPONENT_OF`;
- `DRIVER_OF`;
- `GUARDRAIL_OF`.

Self-reference is prohibited. `ALIAS_OF` must point from an alias to a calculable definition. `SPLIT_FROM` must point from a split child to a blocked umbrella parent.

## 3. Why release status is not part of the definition row

Suppose a formula is frozen as version `17.0`.

Its governance path may be:

`DRAFT -> DEFINED -> MAPPING_PENDING -> MAPPED_UNVERIFIED -> VALIDATION_PENDING -> UAT_PENDING -> PRODUCTION_READY`.

If `releaseStatus` were stored inside an immutable definition row, the status could never advance. If the row were updated, the registry would no longer be immutable. Creating another row with the same formula version just to change status would mix lifecycle with semantics.

Therefore release state is a separate append-only event chain.

This is the same event-sourcing principle used elsewhere in SYNTH-V2: facts that happened are appended; historical meaning is not rewritten.

## 4. Why mapping verification is not part of the physical mapping row

Physical mapping version means **where the logical variable comes from**.

Example mapping version 1:

`ReceivedQuantity -> NATIVE-RECEIPT.lines[].receivedQuantity`.

A data engineer can map it today and a steward can verify it tomorrow. The source path has not changed, so a new mapping-set version would be false history.

Therefore:

- mapping path/version = immutable physical contract;
- verification = append-only lifecycle event.

A new mapping-set version is created only when the actual physical implementation changes.

## 5. Formula version is not mapping-set version

This distinction is mandatory.

### New formula version required

Create a new formula version when business meaning changes, including:

- numerator;
- denominator/exposure;
- eligible population;
- inclusion/exclusion;
- grain;
- case/event identity;
- time/cohort/as-of basis;
- UOM algebra;
- normalizer `K`;
- aggregation method;
- statistical estimator/quantile method;
- sign convention;
- interpretation that changes what the number means.

Example:

`DamageRate = DamagedUnits / ReceivedUnits`.

Changing denominator to `ShippedUnits` is a **new formula version**.

### New mapping-set version only

Create a new mapping-set version when meaning is unchanged but the physical implementation changes, for example:

- source table/topic renamed;
- field moved to another read model;
- ERP/WMS adapter replaced;
- join path changes without changing population meaning.

Example:

`ReceivedQuantity` moving from an external WMS column to governed SYNTH-V2 receipt data is normally a mapping-set change, not a formula change.

### Verification event only

If the path remains exactly the same and is simply reviewed/verified, append a mapping-verification event. Do not increment mapping-set version merely to record approval.

## 6. System vs organisation scope

### System scope

`scopeType = system`, `organisationId = null`.

Use for platform canonical definitions such as receipt acceptance or canonical contribution-margin ratio.

System definitions are platform governance objects. Ordinary organisation membership must not grant the ability to redefine them.

### Organisation scope

`scopeType = organisation`, organisation ID required.

Use only for a genuine tenant-specific semantic variant. A tenant-specific threshold or dashboard target usually belongs in threshold policy, not a cloned formula definition.

Organisation-scoped queries must enforce normal SYNTH-V2 organisation isolation and capability checks.

## 7. Role and publication semantics

### Canonical

Normal calculable definition.

### Split child

Calculable KPI produced by resolving an ambiguous umbrella into one explicit basis.

Example blocked umbrella:

`Cancellation Rate (orders or units)`.

Split children:

- `CancelledOrders / Orders`;
- `CancelledUnits / OrderedUnits`.

### Blocked umbrella

Documentation-only semantic parent. It must not own executable source mappings or observations.

Its release stream begins in `BLOCKED_UMBRELLA` and can later move only to `DEPRECATED`.

### Alias

Compatibility/name indirection only. It does not calculate independently and resolves via `ALIAS_OF`.

Its release stream begins in `ALIAS_NONPUBLISH` and can later move only to `DEPRECATED`.

## 8. Calculable release lifecycle

Normal forward order:

`DRAFT -> DEFINED -> MAPPING_PENDING -> MAPPED_UNVERIFIED -> VALIDATION_PENDING -> UAT_PENDING -> PRODUCTION_READY`.

`DEPRECATED` is terminal and may be appended from a prior state with a documented reason.

The domain prevents backwards transitions and duplicate no-op lifecycle events.

### DRAFT

Business idea exists; semantic contract may still change.

### DEFINED

Semantic/mathematical/time/UOM contracts are frozen for this formula version.

### MAPPING_PENDING

Required logical inputs are not fully mapped.

### MAPPED_UNVERIFIED

Physical paths exist but verification is incomplete.

### VALIDATION_PENDING

Required mappings are verified; calculation/population/reconciliation tests remain incomplete.

### UAT_PENDING

Technical checks are complete; owner/data-steward acceptance remains incomplete.

### PRODUCTION_READY

All applicable source, calculation, population/time, reconciliation and UAT gates pass.

A `PRODUCTION_READY` release event requires explicit evidence including verified mapping IDs, passed calculation/population tests, reconciliation status, owner UAT and steward UAT.

### DEPRECATED

Historical definition remains immutable/readable but should not be selected for new normal calculations. The deprecation event requires a reason.

## 9. Mapping verification lifecycle

### Initial `MAPPED_UNVERIFIED`

Use when the path has been identified but independent verification/test evidence is incomplete.

### `VERIFIED`

Requires evidence with at least who verified and how verification was performed.

Examples of verification method:

- repository native source contract + test fixture;
- ERP data dictionary + source query validation;
- event schema + sample payload reconciliation.

### `DEPRECATED`

Terminal state for a physical mapping. Requires a reason. A replacement path is a **new mapping-set version**, not a mutation of the deprecated row.

## 10. Production-ready assertion

The domain exposes `assertKpiDefinitionReadyForProduction(...)`.

It requires:

- calculable definition role;
- non-empty mapping set;
- all mappings belong to the definition;
- one coherent mapping-set version;
- unique logical variables;
- one current verification event per effective mapping;
- every effective mapping verification status = `VERIFIED`;
- calculation tests pass;
- population/time tests pass;
- reconciliation passes;
- owner UAT passes;
- data-steward UAT passes.

This assertion can be used before appending a `PRODUCTION_READY` release event. The release event additionally stores durable evidence of the decision.

## 11. Content hashing

Definition, release event, mapping, mapping-verification event and dependency receive a SHA-256 content hash over canonical JSON.

Purpose:

- reproducibility;
- duplicate detection;
- immutable audit evidence;
- safe comparison between repository seed and persisted registry;
- future calculation-run lineage.

Hash does not replace explicit formula/mapping versions.

## 12. Effective dating

Definition versions carry `effectiveFrom` and optional `effectiveTo`.

Rules:

- `effectiveTo > effectiveFrom`;
- historical rows never update/delete;
- effective selection happens before calculation;
- future calculation run stores exact definition ID;
- restatement policy explicitly chooses which definition applies.

V17 does not yet implement an automated supersession/effectivity workflow. Overlapping effective versions must be prevented/flagged by the future registry application service before runtime selection.

## 13. Mapping-set completeness

A KPI usually requires multiple logical inputs.

Example:

`ReceiptAcceptanceRate = AcceptedQuantity / ReceivedQuantity`.

Mapping-set version 1 may contain:

- `AcceptedQuantity -> NATIVE-RECEIPT.AcceptedQuantity`;
- `ReceivedQuantity -> NATIVE-RECEIPT.ReceivedQuantity`.

A mapping set is complete only when every formula/population/time/UOM input required by the definition is present.

A single verified mapping does not mean the mapping set is complete.

Verification is also per mapping row. Production readiness requires the effective set to be complete and every mapping verified.

## 14. Registry and repository-native contracts

`docs/fashion-kpi/native-source-contracts.json` describes repository-native source contracts verified against current code and migration history.

Durable registry mappings reference those contract IDs, e.g. `NATIVE-RECEIPT`.

Layers:

- repository source contract = what current code/persistence exposes;
- durable mapping version = which source path a KPI logical variable uses;
- verification event = whether that mapping has been independently verified;
- formula definition = what the KPI means.

Keeping these separate is what lets a source adapter evolve without silently changing KPI semantics.

## 15. Example — Receipt Acceptance Rate

Definition:

- KPI code `SYNTH-LOG-001`;
- primitive `TRUE_SUBSET_SHARE`;
- formula `AcceptedQuantity / ReceivedQuantity`;
- grain receipt snapshot x shipment line;
- temporal class period exposure;
- aggregation ratio of sums;
- canonical UOM ratio;
- zero exposure N/A;
- accepted > received invalid.

Mapping set:

- AcceptedQuantity -> native receipt accepted quantity;
- ReceivedQuantity -> native receipt received quantity;
- receipt event time -> `receivedAt` as needed by population contract.

Control:

`Accepted + Damaged + Rejected = Received`.

Portfolio:

`SUM(Accepted) / SUM(Received)`.

Never average line-level percentages.

## 16. Example — Contribution Margin Ratio

Definition:

`ContributionMarginAmount / NetRevenue`.

Native mapping:

- amount -> margin actualization snapshot;
- revenue -> same snapshot;
- source percentage points -> optional reconciliation mirror.

Canonical storage is decimal ratio.

If native source stores `24.0000` percentage points and canonical result is `0.24`:

`24.0000 / 100 = 0.24` -> scale reconciliation passes.

Changing only the physical read-model path is a mapping-set change. Changing denominator from net revenue to another revenue basis is a formula change.

## 17. Mutation rules

Future registry commands must follow repository standards:

- durable command ID;
- deterministic fingerprint;
- replay/conflict behavior;
- transaction;
- append immutable definition/mapping/lifecycle record;
- transactional outbox event;
- platform/organisation governance authorization;
- no update/delete of registry history.

The PostgreSQL store already exposes command-registry and outbox primitives for this next application layer.

## 18. What V17 intentionally does not do

V17 does not yet:

- expose registry HTTP routes;
- grant tenant roles management of system definitions;
- persist calculation runs;
- persist observations;
- persist DQ/reconciliation results;
- persist threshold/target policy;
- auto-import all 1,290 catalog definitions.

This keeps semantic governance ahead of dashboards and prevents a half-governed observation model from becoming production truth.

## 19. Next persistence layer

Next should add separate immutable runtime history:

- `kpi_calculation_runs`;
- `kpi_observations`;
- `kpi_quality_results`;
- `kpi_reconciliation_results`;
- restatement lineage;
- exact definition ID and mapping-set lineage on every observation;
- threshold-policy versions separate from formula versions.

Definition, release, mapping, verification, calculation and observation history must remain separate immutable concerns.
