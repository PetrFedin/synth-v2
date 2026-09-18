import assert from 'node:assert/strict';
import test from 'node:test';

import {
  absoluteKpiDecimalDifference,
  canonicalKpiDecimal,
  compareKpiDecimals,
  isZeroKpiDecimal,
} from '../src/modules/kpi-runtime/decimal.mjs';

test('canonical KPI decimals reject float/exponent ambiguity and normalize zero', () => {
  assert.equal(canonicalKpiDecimal('24.0000'), '24');
  assert.equal(canonicalKpiDecimal('-0.000000000000'), '0');
  assert.equal(isZeroKpiDecimal('0.000'), true);
  assert.throws(() => canonicalKpiDecimal('1e-3'), (error) => error?.code === 'KPI_DECIMAL_INVALID');
  assert.throws(() => canonicalKpiDecimal(0.1), (error) => error?.code === 'KPI_DECIMAL_INVALID');
  assert.throws(() => canonicalKpiDecimal('0.1234567890123'), (error) => error?.code === 'KPI_DECIMAL_INVALID');
});

test('exact decimal reconciliation remains correct beyond Number.MAX_SAFE_INTEGER', () => {
  const left = '9007199254740993.01';
  const right = '9007199254740992.99';
  assert.equal(absoluteKpiDecimalDifference(left, right), '0.02');
  assert.equal(compareKpiDecimals(left, right), 1);
});

test('exact decimal comparison preserves sub-cent and negative ordering', () => {
  assert.equal(compareKpiDecimals('-0.000000000001', '0'), -1);
  assert.equal(compareKpiDecimals('12345678901234567890.123456789012', '12345678901234567890.123456789011'), 1);
  assert.equal(absoluteKpiDecimalDifference('-10.25', '2.75'), '13');
});
