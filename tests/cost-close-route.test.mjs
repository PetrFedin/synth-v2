import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderEconomicsRoutes } from '../src/http/order-economics-routes.mjs';

function routeFor(service, method, path) {
  return createOrderEconomicsRoutes({ orderEconomics: service }).find((route) => route.method === method && route.pattern.test(path));
}

test('cost close route pins explicit landed cost and margin snapshots', async () => {
  const calls = [];
  const path = '/v2/orders/ORDER-1/cost-close';
  const service = { closeCost: async (...args) => { calls.push(args); return { id: 'CLOSE-1' }; } };
  const route = routeFor(service, 'POST', path);
  const body = { landedCostSnapshotId: 'LANDED-1', marginActualizationSnapshotId: 'MARGIN-1' };
  const result = await route.execute({ commandId: 'CMD-CLOSE', actorId: 'USER-1', params: ['ORDER-1'], query: {}, body });
  assert.deepEqual(result, { id: 'CLOSE-1' });
  assert.deepEqual(calls, [['CMD-CLOSE', 'USER-1', 'ORDER-1', body]]);
});

test('post-close adjustment route requires reason and full cost lineage', async () => {
  const calls = [];
  const path = '/v2/orders/ORDER-1/cost-close/adjustments';
  const service = { recordPostCloseAdjustment: async (...args) => { calls.push(args); return { adjustment: { id: 'ADJ-1' } }; } };
  const route = routeFor(service, 'POST', path);
  const body = {
    reason: 'Late freight invoice',
    supplyCommitmentSnapshotId: 'SUPPLY-1',
    costType: 'freight', amount: 50, currency: 'EUR', sourceRef: 'FREIGHT-1',
  };
  const result = await route.execute({ commandId: 'CMD-ADJ', actorId: 'USER-1', params: ['ORDER-1'], query: {}, body });
  assert.equal(result.adjustment.id, 'ADJ-1');
  assert.deepEqual(calls, [['CMD-ADJ', 'USER-1', 'ORDER-1', body]]);

  assert.throws(
    () => route.execute({
      commandId: 'CMD-BAD', actorId: 'USER-1', params: ['ORDER-1'], query: {},
      body: { supplyCommitmentSnapshotId: 'SUPPLY-1', costType: 'freight', amount: 50, currency: 'EUR', sourceRef: 'FREIGHT-1' },
    }),
    (error) => error?.code === 'HTTP_BODY_FIELD_INVALID',
  );
});

test('cost close read route forwards immutable close identity', async () => {
  const path = '/v2/cost-closes/CLOSE-1';
  const calls = [];
  const service = { getCostCloseForActor: async (...args) => { calls.push(args); return { costClose: { id: 'CLOSE-1' }, orderId: 'ORDER-1' }; } };
  const route = routeFor(service, 'GET', path);
  const result = await route.execute({ actorId: 'USER-1', params: ['CLOSE-1'], query: {} });
  assert.equal(result.costClose.id, 'CLOSE-1');
  assert.deepEqual(calls, [['USER-1', 'CLOSE-1']]);
});
