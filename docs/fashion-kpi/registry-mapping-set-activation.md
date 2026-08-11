# SYNTH-V2 KPI Mapping-Set Activation

V17 registry addendum.

This document extends `registry-model.md` with one additional append-only governance history: **mapping-set activation**.

The original registry separation remains valid, but physical mapping requires three distinct concepts rather than two:

1. mapping version — what physical path each logical variable uses;
2. mapping verification — whether that individual mapping has been independently verified;
3. mapping-set activation — which complete verified set the runtime is currently allowed to execute for a definition.

Therefore current V17 runtime governance uses six separate registry histories/object types:

1. semantic definition versions;
2. definition release events;
3. physical source mapping versions;
4. mapping verification events;
5. definition dependency edges;
6. mapping-set activation events.

## Why activation is separate

Suppose KPI formula version `17.0` is already `PRODUCTION_READY` using mapping-set version 1.

Later the same semantic inputs move from one physical read model to another:

- formula meaning does not change;
- formula version must stay `17.0`;
- new source paths create mapping-set version 2;
- version 2 mappings are independently verified;
- runtime must not switch to version 2 merely because those rows exist.

An explicit activation decision is required.

Without an activation history, implementations tend to use dangerous rules such as:

- `MAX(mapping_set_version)`;
- latest creation timestamp;
- whatever table/view is newest;
- first verified mapping set returned by a query.

Those rules make source selection implicit and non-auditable.

## Activation event

`kpi_mapping_set_activation_events` stores:

- definition ID;
- selected mapping-set version;
- predecessor activation event;
- activation evidence/reason;
- actor/time;
- content hash and payload.

It is append-only.

The current active mapping set is the **leaf** of the predecessor chain, not `MAX(version)`.

This permits a governed rollback to an older still-valid mapping set if required; the activation event records why the rollback happened.

## Activation preconditions

The database insert guard requires:

- definition exists;
- definition role is calculable (`CANONICAL` or `SPLIT_CHILD`);
- selected mapping set exists and is non-empty;
- every mapping in the set currently has a `VERIFIED` leaf verification event;
- `activationReason` evidence is present;
- predecessor event, when supplied, belongs to the same definition;
- the event selects a different mapping-set version from its predecessor;
- event time does not move backwards.

A source path being mapped is not enough. A single mapping being verified is not enough. **The whole set must be verified before activation.**

## Execution readiness is derived, not copied

Definition release state and mapping activation state can diverge over time.

Example:

- definition release event says `PRODUCTION_READY`;
- active mapping-set version 1 was verified;
- later one mapping in version 1 is deprecated because its source became invalid.

The historic release event remains true: the definition was approved at that time.

But the KPI is no longer executable with the current active mappings.

Therefore `kpi_definition_execution_readiness` derives current execution status from both:

- current definition release leaf;
- current active mapping-set leaf;
- current verification state of every mapping in that set.

Possible reasons include:

- `NON_CALCULABLE_ROLE`;
- `NO_RELEASE_EVENT`;
- `RELEASE_NOT_PRODUCTION_READY`;
- `NO_ACTIVE_MAPPING_SET`;
- `ACTIVE_MAPPING_SET_NOT_FOUND`;
- `ACTIVE_MAPPING_SET_NOT_FULLY_VERIFIED`;
- `READY`.

A scheduler/calculation service must check **execution readiness**, not only the historic release status.

## Example — source adapter migration

Formula:

`ReceiptAcceptanceRate = AcceptedQuantity / ReceivedQuantity`.

### Existing execution

Mapping-set 1:

- AcceptedQuantity -> source A;
- ReceivedQuantity -> source A;
- both mappings VERIFIED;
- activation event selects set 1;
- release state PRODUCTION_READY;
- execution readiness READY.

### New physical implementation

Mapping-set 2:

- AcceptedQuantity -> new source B;
- ReceivedQuantity -> new source B.

Until both mappings are verified, set 2 cannot be activated.

After verification:

- append activation event selecting set 2;
- formula version does not change;
- release status does not need a fake new formula version;
- future runs use set 2;
- historical runs remain pinned to set 1.

## Mapping deprecation after activation

If a currently active mapping receives a `DEPRECATED` verification event:

- immutable mapping row remains;
- activation event remains historically valid;
- `execution_ready` becomes false because the active set is no longer fully verified;
- normal production calculation must stop or fail closed;
- a replacement mapping set must be created, verified and explicitly activated.

Do not silently fall back to another mapping set based on version number.

## Run lineage requirement

Future calculation runs must persist the exact active mapping-set version or, preferably, the exact mapping IDs selected for the run.

This ensures a historical observation can answer:

> Which source path for each logical variable produced this value?

A run must not simply store `formulaVersion=17.0` because the same formula can legitimately be executed through different physical mapping sets over time.

## Formula version vs mapping version vs activation

- semantic meaning changes -> new **formula version**;
- physical path changes -> new **mapping-set version**;
- unchanged mapped path gets reviewed -> new **verification event**;
- complete verified mapping set becomes runtime source -> new **activation event**;
- definition readiness advances -> new **release event**.

These histories must not be collapsed into one status/version field.
