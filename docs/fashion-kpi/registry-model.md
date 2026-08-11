# SYNTH-V2 KPI Registry Model

Version: 17.0

The KPI registry is the durable semantic control plane for SYNTH-V2 analytics. It stores **what a KPI means** and **how a logical KPI input is physically mapped**, but it does not yet store calculated observations. Observations/runs are deliberately separated so definition history cannot be overwritten by recalculation history.

## 1. Why the registry is separate

Without a registry, KPI meaning tends to leak into:

- SQL views;
- dashboard formulas;
- one-off API handlers;
- spreadsheet calculations;
- local module helpers.

That creates silent definition drift. The registry makes formula version, population, time basis, aggregation and source mapping explicit first-class data.

## 2. Three immutable registry objects

### `kpi_definition_versions`

One immutable semantic definition version.

It contains:

- scope (`system` or `organisation`);
- optional organisation ID;
- stable KPI code;
- immutable formula version;
- role (`CANONICAL`, `SPLIT_CHILD`, `BLOCKED_UMBRELLA`, `ALIAS`);
- canonical RU/EN names;
- domain;
- release status;
- business definition/formula;
- calculation primitive;
- canonical UOM;
- directionality/goal function;
- grain/population/temporal/aggregation/dimensional contracts;
- zero/null/error policy;
- controls/publication contract;
- effective period;
- creator/time;
- content hash and complete JSON payload.

The SQL row and payload identities are cross-checked so a payload cannot claim another KPI code/formula version than the indexed columns.

### `kpi_source_mapping_versions`

One immutable physical mapping for one logical variable within a mapping-set version.

A mapping records:

- KPI definition ID;
- mapping-set version;
- logical variable name;
- governed source-contract ID;
- source system/entity/path;
- datatype;
- primary/event key;
- event timestamp path;
- UOM/currency paths where applicable;
- join/filter contracts;
- mapping status;
- verification evidence.

`VERIFIED` requires both `verifiedAt` and `verifiedBy`. Unverified mappings are prohibited from carrying fake verification fields.

### `kpi_definition_dependencies`

Version-to-version semantic graph edge.

Supported relations:

- `ALIAS_OF`;
- `SPLIT_FROM`;
- `COMPONENT_OF`;
- `DRIVER_OF`;
- `GUARDRAIL_OF`.

Self-reference is prohibited.

`ALIAS_OF` must point from an alias definition to a calculable definition. `SPLIT_FROM` must point from a split-child to its blocked umbrella parent.

## 3. Formula version is not mapping version

This distinction is mandatory.

### New formula version required

Create a new KPI formula version when any semantic meaning changes, including:

- numerator;
- denominator/exposure;
- population;
- inclusion/exclusion;
- grain;
- event identity;
- time/cohort/as-of basis;
- UOM algebra;
- normalizer K;
- aggregation method;
- statistical estimator/quantile method;
- sign convention;
- interpretation that changes what the number means.

Example:

`DamageRate = DamagedUnits / ReceivedUnits`

changing denominator to `ShippedUnits` is a **new formula version**.

### Mapping-set version only

A new mapping-set version is sufficient when the KPI meaning is unchanged but the physical implementation changes, for example:

- table/topic renamed;
- event moved to another read model;
- ERP adapter replaced;
- source column changed while semantic variable remains identical;
- join path changes without changing eligible population.

Example:

`ReceivedQuantity` moving from an external WMS table to a governed SYNTH-V2 receipt read model does not require a new formula version if the business meaning/population remains identical.

## 4. System vs organisation scope

### System scope

`scopeType = system`, `organisationId = null`.

Use for canonical platform definitions such as native receipt acceptance or canonical contribution-margin ratio.

System definitions are platform governance objects. Ordinary organisation members must not receive a generic capability to redefine them.

### Organisation scope

`scopeType = organisation`, `organisationId` required.

Use only when an organisation intentionally owns a semantic variant. A tenant-specific threshold normally belongs in threshold policy, not a new formula definition. Create an organisation definition only when meaning genuinely differs.

Do not create tenant clones merely to change display name, target or dashboard visibility.

## 5. Role and publication semantics

### Canonical

Normal calculable KPI definition.

### Split child

Calculable KPI created by resolving an ambiguous umbrella into one explicit basis.

Example:

Blocked umbrella: `Cancellation Rate (orders or units)`.

Split children:

- `CancelledOrders / Orders`;
- `CancelledUnits / OrderedUnits`.

### Blocked umbrella

Documentation only. Must never own executable mappings or observations.

### Alias

Legacy/name compatibility only. Must never calculate independently. The dependency graph resolves it through `ALIAS_OF`.

## 6. Release lifecycle

Governed stages:

`DRAFT -> DEFINED -> MAPPING_PENDING -> MAPPED_UNVERIFIED -> VALIDATION_PENDING -> UAT_PENDING -> PRODUCTION_READY -> DEPRECATED`

Non-calculable roles use:

- `BLOCKED_UMBRELLA`;
- `ALIAS_NONPUBLISH`.

A stage is not decoration. Each stage has evidence requirements.

### DRAFT

Business idea exists but contract can still change.

### DEFINED

Semantic/mathematical/time/UOM contracts frozen for this formula version.

### MAPPING_PENDING

Physical variables still unresolved.

### MAPPED_UNVERIFIED

Paths identified but not independently verified/tested.

### VALIDATION_PENDING

Mappings verified; calculation/population/reconciliation tests incomplete.

### UAT_PENDING

Technical checks complete; business owner/data steward acceptance incomplete.

### PRODUCTION_READY

All applicable source, calculation, population/time, reconciliation and UAT gates pass.

### DEPRECATED

Historical definition remains immutable/readable but new calculation runs should not use it unless reconstructing history.

## 7. Production-ready assertion

The domain exposes `assertKpiDefinitionReadyForProduction(...)`.

It requires:

- calculable definition role;
- non-empty mapping set;
- every supplied mapping belongs to the definition;
- every mapping is `VERIFIED`;
- calculation tests pass;
- population/time tests pass;
- reconciliation passes;
- owner UAT passes;
- data-steward UAT passes.

This keeps `PRODUCTION_READY` from becoming a manual label with no evidence.

## 8. Content hashing

Definition, mapping and dependency domain objects receive a SHA-256 content hash over canonical JSON.

Purpose:

- reproducibility;
- duplicate detection;
- immutable audit evidence;
- safe comparison between repository seed and persisted registry;
- future calculation-run lineage.

The hash is not a substitute for formula version. Two semantically different versions must have different explicit formula versions even if a hash already proves bytes differ.

## 9. Effective dating

Definition versions carry `effectiveFrom` and optional `effectiveTo`.

Rules:

- `effectiveTo > effectiveFrom`;
- historical rows never updated/deleted;
- effective selection happens before calculation;
- calculation run stores the exact definition ID, not only KPI code;
- restatement may intentionally rerun historical period with either historical definition or a new approved restatement policy, but the choice must be explicit.

The registry does not automatically close a prior row because immutable records cannot be updated. Future governance workflow should create a superseding version plus a separate lifecycle/effectivity decision record if automated closure is needed. Until that workflow exists, overlapping active versions must be prevented/flagged by registry service policy.

## 10. Mapping-set semantics

A KPI usually has multiple logical inputs. Example:

`ReceiptAcceptanceRate = AcceptedQuantity / ReceivedQuantity`.

Mapping-set version 1 can include:

- `AcceptedQuantity -> NATIVE-RECEIPT.AcceptedQuantity`;
- `ReceivedQuantity -> NATIVE-RECEIPT.ReceivedQuantity`.

A mapping set is complete only when every required formula/population/time input is resolved.

A single verified row does **not** mean the KPI mapping set is complete.

Future application service should compare required logical inputs from definition contract with mapped variable names before allowing `VALIDATION_PENDING` or higher status.

## 11. Registry and repository-native contracts

`docs/fashion-kpi/native-source-contracts.json` describes source contracts verified against current repository files/migrations.

The durable registry may reference those contract IDs, for example:

`sourceContractId = NATIVE-RECEIPT`.

Repository validation protects source drift; durable mapping rows capture the effective mapping used by runtime governance.

These layers complement each other:

- JSON source contract = code/repository contract;
- persisted source mapping = effective runtime registry record.

## 12. Example — Receipt Acceptance Rate

Definition:

- KPI code: `SYNTH-LOG-001`;
- formula version: `17.0` (example registry version, not a claim that V16 native bundle changed semantics);
- primitive: `TRUE_SUBSET_SHARE`;
- formula: `AcceptedQuantity / ReceivedQuantity`;
- grain: receipt snapshot x shipment line;
- temporal class: period exposure;
- aggregation: ratio of sums;
- canonical UOM: ratio;
- zero exposure: N/A;
- accepted > received: invalid.

Mapping set:

- AcceptedQuantity -> native receipt line accepted quantity;
- ReceivedQuantity -> native receipt line received quantity;
- event time -> receipt `receivedAt`.

Control:

`Accepted + Damaged + Rejected = Received`.

Portfolio calculation:

`SUM(Accepted) / SUM(Received)`.

Never average line-level acceptance percentages.

## 13. Example — Contribution Margin Ratio

Definition formula:

`ContributionMarginAmount / NetRevenue`.

Native mapping:

- margin amount -> actualization snapshot;
- revenue -> same actualization snapshot;
- source percentage points -> optional reconciliation mirror.

Canonical storage is decimal ratio.

If native source stores 24.0000 percentage points and canonical result is 0.24:

`24.0000 / 100 = 0.24` -> scale reconciliation passes.

Changing only the source field from one read model to another is a mapping version. Changing denominator from net revenue to gross sales is a formula version.

## 14. Organisation isolation

Organisation-scoped registry queries must enforce the same isolation discipline as other SYNTH-V2 modules.

Do not implement a query that accepts arbitrary `organisationId` from client input without membership/capability checks.

System definitions can be read as platform metadata, but system-definition mutation needs a platform-governance path, not ordinary tenant membership.

## 15. Mutation rules

When application commands are introduced, they must follow repository rules:

- durable command ID;
- deterministic fingerprint;
- command registry replay/conflict behavior;
- transaction;
- immutable insert;
- transactional outbox event;
- capability/governance authorization;
- no update/delete of historical registry rows.

The PostgreSQL registry store already exposes command-registry and outbox primitives for that next application layer.

## 16. What V17 intentionally does not do

V17 does not yet:

- expose registry HTTP routes;
- grant tenant roles the right to manage system definitions;
- persist calculation runs;
- persist observations;
- persist DQ results;
- persist threshold/target policy;
- auto-import all 1,290 catalog definitions.

Those are separate rollout layers. Keeping them separate reduces the chance that a dashboard/API becomes live before semantic governance is stable.

## 17. Next persistence layer

The next layer should add:

- `kpi_calculation_runs`;
- `kpi_observations`;
- `kpi_quality_results`;
- `kpi_reconciliation_results`;
- restatement lineage;
- exact definition/mapping IDs on every observation;
- threshold-policy versions separately from formula versions.

Definition history and observation history must remain separate immutable concerns.
