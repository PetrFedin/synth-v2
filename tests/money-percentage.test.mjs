import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMoneyPercentage } from '../src/core/money.mjs';

test('money percentage uses exact fixed-point half-away-from-zero rounding', () => {
  assert.equal(calculateMoneyPercentage(480.7143, 600), 80.1191);
  assert.equal(calculateMoneyPercentage(-480.7143, 600), -80.1191);
  assert.equal(calculateMoneyPercentage(1, 6), 16.6667);
  assert.equal(calculateMoneyPercentage(-1, 6), -16.6667);
});

test('money percentage rejects zero basis and hidden precision', () => {
  assert.throws(
    () => calculateMoneyPercentage(1, 0),
    (error) => error?.code === 'MONEY_PERCENTAGE_INVALID',
  );
  assert.throws(
    () => calculateMoneyPercentage(1.00001, 2),
    (error) => error?.code === 'MONEY_PERCENTAGE_SCALE_INVALID',
  );
});
