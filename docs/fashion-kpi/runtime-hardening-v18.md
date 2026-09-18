# SYNTH-V2 KPI Runtime Hardening V18

This addendum records correctness issues discovered while turning the KPI methodology into persistence/runtime code.

## 1. Mapping verification is not mapping-set certification

A mapping can correctly point `ReceivedQuantity` to a real field while the replacement adapter still selects a different population or snapshot than the previous implementation.

Therefore V18 requires:

- each mapping individually `VERIFIED`;
- calculation regression for the complete set;
- population regression;
- reconciliation PASS/legitimate N/A;
- data-steward UAT;
- owner UAT PASS or governed NOT_REQUIRED;
- explicit activation event.

Runtime execution checks the certified activation, not `MAX(mapping_set_version)`.

## 2. Run lineage is frozen before RUNNING

Append-only storage alone is insufficient if new child records can be appended after a run reaches a terminal state.

V18 phase model:

1. create run;
2. append initial `REQUESTED` status;
3. bind exact definition/release/activation;
4. bind every exact physical mapping/verification event;
5. prove mapping binding completeness;
6. transition to `RUNNING`;
7. append observations + DQ + reconciliation;
8. transition to `SUCCEEDED`/`FAILED`/`CANCELLED`.

Definition/mapping bindings cannot be added once the run leaves `REQUESTED`.

Observations/controls cannot be appended unless current status is exactly `RUNNING`.

This prevents a historical `SUCCEEDED` run from becoming incomplete later.

## 3. Null current status must fail closed

SQL comparisons such as:

`current_status <> 'RUNNING'`

are unsafe when `current_status` is NULL because SQL three-valued logic yields UNKNOWN.

V18 hardening uses:

`current_status IS DISTINCT FROM 'RUNNING'`.

Therefore missing lifecycle evidence rejects inserts instead of accidentally allowing them.

## 4. Persistent numerics are exact decimals

The original runtime draft used JavaScript `Number` for stored KPI values. That was rejected before merge.

V18 exact uses:

- canonical decimal strings in Node;
- fixed-scale `BigInt` for exact subtraction/comparison;
- PostgreSQL `NUMERIC(38,12)`;
- DB payload guards that compare immutable JSON decimal strings to typed NUMERIC columns.

Regression fixture:

`9007199254740993.01 - 9007199254740992.99 = 0.02`.

## 5. One numeric value, one audit representation

DB direct SQL cannot persist:

- typed `value_numeric = 0.964`;
- payload `valueNumeric = "96.4"`.

Nor can it use alternate noncanonical strings such as:

- `-0`;
- `0.9600`;
- `1e-3`.

Canonical payload representation avoids content-hash/audit ambiguity.

## 6. Required control missing is different from no failure

A required reconciliation that never executed creates no `FAIL` row.

Therefore publication needs both:

- absence of blocking failures;
- positive evidence that every definition-required rule ID/version/scope has a satisfying result.

Missing required control -> publication blocked.

## 7. Required control scope is explicit

Required rules declare:

- `OBSERVATION`; or
- `BINDING`.

An observation-level PASS cannot satisfy a binding-level rule, and a binding-level PASS cannot satisfy an observation-specific rule.

This prevents evidence reuse across the wrong perimeter.

## 8. NOT_APPLICABLE is explicit policy

A required rule carries `allowNotApplicable`.

Only when true may a `NOT_APPLICABLE` result satisfy the rule.

Otherwise only PASS satisfies the required-control gate.

N/A is never inferred from a missing result.

## 9. Control-summary fanout is prohibited

Joining quality results and reconciliation results directly to the same observation can create a many-to-many product and inflate counts.

V18 replaces this with independent correlated aggregates.

General rule:

> Aggregate independent one-to-many evidence sets separately before combining them in one read model.

## 10. PostgreSQL view evolution must preserve column compatibility

`CREATE OR REPLACE VIEW` cannot silently insert new columns into the middle of an existing view signature.

V18 uses an explicit intermediate migration to prepare the publication-view shape before replacing its expressions with required-control logic.

Schema migrations are treated as executable contracts, not just SQL text that “looks right”.

## 11. Governance events cannot arrive from the future

A run requested at time T cannot bind:

- release event created after T;
- mapping activation created after T;
- mapping verification created after T.

Normal runs additionally use current leaf events.

If governance changes concurrently, the old run fails closed and a new run request is created against the new lineage.

This makes input selection deterministic.

## 12. Restatement never overwrites

A correction creates a new `RESTATEMENT` run with:

- same organisation;
- same reporting period/as-of;
- later request time;
- reason code/evidence;
- link to superseded run.

Old observations remain auditable.

## 13. Publication is derived centrally

UI/API consumers must not independently decide:

- whether MISSING means 0;
- whether N/A is acceptable;
- whether a missing reconciliation matters;
- whether a DQ failure blocks;
- which run status counts as complete.

They consume the governed publication candidate/read model or an application service built on the same rules.

## 14. Deliberate remaining boundary

V18 stores and governs runs/observations but does not yet implement the full calculation scheduler/executor for all 1,191 KPI.

The next layer should:

- resolve execution-ready definitions;
- lock exact registry lineage;
- build source manifests;
- execute V16 calculation primitives;
- write observations and controls transactionally;
- close the run;
- emit outbox events for publication/notifications.

That layer must reuse these V17/V18 contracts rather than creating alternate runtime semantics.
