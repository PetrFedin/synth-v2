import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderEconomicsRoutes } from '../src/http/order-economics-routes.mjs';

const path = '/v2/orders/ORDER-1/actual-costs/COST-1/corrections';

function correctionRoute(service) {
  return createOrderEconomicsRoutes({ orderEconomics: service }).find((route) => route.method === 'POST' && route.pattern.test(path));
}

test('actual cost correction route forwards immutable ledger identity and replacement basis', async () => {
  const calls = [];
  const route = correctionRoute({
    correctActualCost: async (...args) => { calls.push(args); return { correctionId: 'CORR-1' }; },
  });
  assert.ok(route);
  const body = {
    reason: 'Corrected supplier invoice',
    supplyCommitmentSnapshotId: 'SUPPLY-1',
    costType: 'factory',
    amount: 450,
    currency: 'EUR',
    sourceRef: 'INVOICE-2',
  };
  const result = await route.execute({
    commandId: 'CMD-1', actorId: 'USER-1', params: ['ORDER-1', 'COST-1'], query: {}, body,
  });
  assert.deepEqual(result, { correctionId: 'CORR-1' });
  assert.deepEqual(calls, [['CMD-1', 'USER-1', 'ORDER-1', 'COST-1', body]]);
});

test('actual cost correction route rejects missing reason and supply lineage', () => {
  const route = correctionRoute({ correctActualCost: async () => undefined });
  assert.throws(
    () => route.execute({
      commandId: 'CMD-X', actorId: 'USER-1', params: ['ORDER-1', 'COST-1'], query: {},
      body: { costType: 'factory', amount: 10, currency: 'EUR', sourceRef: 'INV-X' },
    }),
    (error) => error?.code === 'HTTP_BODY_FIELD_INVALID',
  );
});
