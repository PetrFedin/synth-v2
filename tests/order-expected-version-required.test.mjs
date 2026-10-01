import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acceptOrderTerms, attachReadyOrder, cancelAttachedOrder, reviseOrderTerms } from '../src/modules/orders/public.mjs';

const terms = Object.freeze({ incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01', deliveryEnd: '2027-03-31' });
const base = { id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', version: 3, terms, acceptedOrganisationIds: [] };
const at = '2027-01-01T00:00:00.000Z';

test('O-07: order mutations without expectedVersion are rejected, not defaulted to the current version', () => {
  const invalid = (error) => error?.code === 'ORDER_EXPECTED_VERSION_INVALID';
  assert.throws(() => reviseOrderTerms({ ...base, status: 'draft' }, { ...terms, paymentDays: 45 }, at), invalid);
  assert.throws(() => acceptOrderTerms({ ...base, status: 'draft' }, 'brand-1', at), invalid);
  assert.throws(() => attachReadyOrder({ ...base, status: 'ready', acceptedOrganisationIds: ['brand-1', 'shop-1'] }, at), invalid);
  assert.throws(() => cancelAttachedOrder({ ...base, status: 'attached' }, 'Cancelled by buyer', at), invalid);
});

test('O-07: a correct expectedVersion still succeeds and a stale one conflicts', () => {
  assert.equal(acceptOrderTerms({ ...base, status: 'draft' }, 'brand-1', at, 3).version, 4);
  assert.throws(() => acceptOrderTerms({ ...base, status: 'draft' }, 'brand-1', at, 2), (e) => e?.code === 'ORDER_CONCURRENCY_CONFLICT');
});

test('O-07: every UI caller of accept/attach/cancel/terms sends expectedVersion', () => {
  for (const file of ['public/modules/omnidata-workspace.js', 'public/modules/order-lifecycle-actions.js', 'public/modules/views-4.js', 'public/modules/forms-3.js']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const calls = source.match(/mutate\(\s*`\/v2\/orders\/\$\{[^}]+\}\/(?:accept|attach|cancel|terms)`[^;]*/g) ?? [];
    for (const call of calls) assert.match(call, /expectedVersion/, `${file}: ${call.slice(0, 120)}`);
  }
});
