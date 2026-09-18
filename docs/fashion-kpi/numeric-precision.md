# SYNTH-V2 KPI Numeric Precision Contract

Version: 18.0

This document governs numeric representation for persisted KPI runs, observations, components and reconciliation evidence.

## 1. Why JavaScript `Number` is not the persisted KPI contract

JavaScript `Number` is IEEE-754 binary floating point. It cannot exactly represent every decimal currency, ratio or large integer-like amount that fits PostgreSQL `NUMERIC(38,12)`.

For example, the exact decimal difference between:

- `9007199254740993.01`
- `9007199254740992.99`

is `0.02`.

Those values are already beyond JavaScript's safe integer range. Converting them to `Number` before persistence/reconciliation can lose cents or more.

Therefore **persistent KPI numeric values are canonical decimal strings** in the Node domain and PostgreSQL `NUMERIC(38,12)` in storage.

## 2. Canonical decimal string

Accepted examples:

- `0`
- `0.964`
- `-0.025`
- `12000000.15`
- `9007199254740993.01`
- `12345678901234567890.123456789012`

Rejected examples:

- JavaScript number `0.964` as a persisted-domain input;
- `1e-3`;
- `NaN`;
- `Infinity`;
- locale forms such as `1 234,50`;
- values with more than 12 fractional digits;
- values exceeding precision 38.

`src/modules/kpi-runtime/decimal.mjs` is the canonical parser/normalizer.

## 3. Normalization

The utility normalizes representation without changing decimal value:

- `24.0000` -> `24`;
- `0.9600` -> `0.96`;
- `-0.000000000000` -> `0`.

Trailing decimal zeroes are representation detail, not semantic precision metadata.

If business precision/rounding matters, it belongs in the KPI dimensional/publication contract rather than inferred from string length.

## 4. Precision and scale

Persistent runtime contract:

- maximum precision: **38 decimal digits**;
- maximum scale: **12 fractional digits**;
- PostgreSQL storage: `NUMERIC(38,12)`.

The Node domain rejects values outside this contract before persistence.

## 5. VALUE vs ZERO

Numeric state remains separate from numeric representation.

### VALUE

Requires a non-zero canonical decimal string.

Example:

`dataState = VALUE`, `valueNumeric = "0.964"`.

### ZERO

Requires canonical decimal zero.

Example:

`dataState = ZERO`, `valueNumeric = "0"`.

### NOT_APPLICABLE / MISSING / INVALID

Must carry `valueNumeric = null`.

Do not use `0` as a surrogate for these states.

## 6. Ratio storage

Percentage-like KPI are normally stored as canonical decimal ratios when the KPI contract says ratio.

Example:

`482 / 500 = 0.964`.

Persist:

`valueNumeric = "0.964"`, `canonicalUom = "ratio"`.

Display layer may render `96.4%`.

Do not persist `96.4` merely because the UI shows percent.

## 7. Native source scale adapters

A source may use a different numeric scale from the canonical KPI.

Current example:

native contribution margin source may contain `24.0000` percentage points while canonical ratio is `0.24`.

The mapping/adapter contract must explicitly normalize:

`24.0000 / 100 = 0.24`.

A scale change in the physical source with unchanged business meaning is normally a mapping/adapter change, not automatically a formula change.

## 8. Exact reconciliation arithmetic

Absolute reconciliation differences use exact decimal arithmetic rather than binary floats.

`absoluteKpiDecimalDifference(left, right)` converts canonical decimals to fixed-scale integers using `BigInt`, subtracts exactly and converts back.

Example:

`9007199254740993.01 - 9007199254740992.99 = 0.02` exactly.

## 9. Relative differences

Relative differences should also be calculated by an exact decimal/rational calculation service before persistence.

V18 stores a canonical decimal result but does not mandate one universal rounding scale beyond the maximum 12 fractional digits.

The calculation primitive/formula contract must define rounding/precision policy where it materially changes the KPI.

Do not compute a high-materiality financial relative difference with `parseFloat`/`Number` and then treat that rounded binary result as audit evidence.

## 10. Component preservation

For ratio-of-sums and normalized-rate KPI, persist components as exact decimals when they are needed for roll-up/reconciliation:

- `numeratorNumeric`;
- `denominatorNumeric`;
- `normalizerK`;
- optional `componentPayload`.

Example:

`numerator = "482"`

`denominator = "500"`

`value = "0.964"`.

The platform can explain/reconcile the ratio without reverse-engineering a rounded display number.

## 11. Database/payload consistency

PostgreSQL `NUMERIC` columns are authoritative typed values. The immutable JSON payload must represent the same value.

Repository migrations/validators must prevent direct SQL from storing, for example:

- typed `value_numeric = 0.964`;
- payload `valueNumeric = "96.4"`.

This is why V18 adds payload-to-column numeric guards rather than relying only on application code.

## 12. Rounding

Rounding is applied only where the KPI contract requires it.

Recommended distinction:

- calculation/storage precision: maximum useful governed precision;
- reconciliation precision: sufficient to detect material drift;
- display precision: UI formatting only.

Example:

stored `0.964285714286` may display as `96.43%`.

The display value must not be written back as the canonical observation.

## 13. Currency minor units

Currency amounts may have currency-specific operational minor units, but the generic KPI engine still stores exact decimal strings/NUMERIC.

Currency rounding policy must be explicit where used in costing, invoice, landed-cost or margin reconciliation.

Do not assume every currency has two decimal minor units.

## 14. Units and dimensionless values

Exact decimal representation applies to:

- money;
- ratios;
- rates;
- quantities that may be fractional;
- durations expressed numerically;
- normalized emissions/water/energy intensities;
- statistical outputs.

It does not remove the need for `canonicalUom`. `"10" kg` and `"10" m` remain incompatible even though both are exact decimals.

## 15. Test requirement

Runtime regression tests must include at least:

- value beyond `Number.MAX_SAFE_INTEGER`;
- fractional difference smaller than one currency unit;
- negative value;
- zero normalization;
- maximum supported scale;
- exponent rejection;
- JS `Number` rejection at the persistence-domain boundary.

Any future optimization/library change must continue to pass these exactness fixtures.
