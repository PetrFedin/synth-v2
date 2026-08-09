import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderEconomicsRoutes } from '../src/http/order-economics-routes.mjs';

function routeFor(service, method, path) {
  return createOrderEconomicsRoutes({ orderEconomics: service }).find((route) => route.method === method && route.pattern.test(path));
}

test('cost close readiness route forwards exact economics basis and reconciliation requirements', async () => {
  const calls = [];
  const path = '/v2/orders/ORDER-1/cost-close/readiness';
  const service = { evaluateCostCloseReadiness: async (...args) => { calls.push(args); return { id: 'READY-1', status: 'READY_TO_CLOSE' }; } };
  const route = routeFor(service, 'POST', path);
  const body = {
    landedCostSnapshotId: 'LANDED-1',
    marginActualizationSnapshotId: 'MARGIN-1',
    requirements: [
      { type: 'factory', status: 'complete', evidenceEntryIds: ['COST-1'] },
      { type: 'freight', status: 'waived', waiverReason: 'No separate freight charge' },
      { type: 'duty', status: 'waived', waiverReason: 'No duty on this lane' },
      { type: 'credits', status: 'waived', waiverReason: 'No open credits' },
    ],
  };
  const result = await route.execute({ commandId: 'CMD-READY', actorId: 'USER-1', params: ['ORDER-1'], query: {}, body });
  assert.equal(result.status, 'READY_TO_CLOSE');
  assert.deepEqual(calls, [['CMD-READY', 'USER-1', 'ORDER-1', body]]);
});

test('cost close route requires explicit readiness snapshot with landed cost and margin', async () => {
  const calls = [];
  const path = '/v2/orders/ORDER-1/cost-close';
  const service = { closeCost: async (...args) => { calls.push(args); return { id: 'CLOSE-1' }; } };
  const route = routeFor(service, 'POST', path);
  const body = { landedCostSnapshotId: 'LANDED-1', marginActualizationSnapshotId: 'MARGIN-1', costCloseReadinessSnapshotId: 'READY-1' };
  const result = await route.execute({ commandId: 'CMD-CLOSE', actorId: 'USER-1', params: ['ORDER-1'], query: {}, body });
  assert.deepEqual(result, { id: 'CLOSE-1' });
  assert.deepEqual(calls, [['CMD-CLOSE', 'USER-1', 'ORDER-1', body]]);

  assert.throws(
    () => route.execute({ commandId: 'CMD-CLOSE-BAD', actorId: 'USER-1', params: ['ORDER-1'], query: {}, body: { landedCostSnapshotId: 'LANDED-1', marginActualizationSnapshotId: 'MARGIN-1' } }),
    (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN' || error?.code === 'HTTP_BODY_FIELD_INVALID' || error?.code === 'HTTP_BODY_FIELD_REQUIRED',
  );
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

test('order economics position route returns one canonical effective view', async () => {
  const calls = [];
  const path = '/v2/orders/ORDER-1/economics-position';
  const position = {
    orderId: 'ORDER-1', orderCommitSnapshotId: 'COMMIT-1', currency: 'EUR', status: 'ADJUSTED',
    effectiveTotalLandedCost: 630, effectiveContributionMarginAmount: 370,
  };
  const service = { getOrderEconomicsPositionForActor: async (...args) => { calls.push(args); return position; } };
  const route = routeFor(service, 'GET', path);
  const result = await route.execute({ actorId: 'USER-1', params: ['ORDER-1'], query: {} });
  assert.deepEqual(result, position);
  assert.deepEqual(calls, [['USER-1', 'ORDER-1']]);
});

test('readiness and cost close read routes forward immutable identities', async () => {
  const readinessCalls = [];
  const readinessRoute = routeFor(
    { getCostCloseReadinessForActor: async (...args) => { readinessCalls.push(args); return { readiness: { id: 'READY-1' }, orderId: 'ORDER-1' }; } },
    'GET',
    '/v2/cost-close-readiness/READY-1',
  );
  const readinessResult = await readinessRoute.execute({ actorId: 'USER-1', params: ['READY-1'], query: {} });
  assert.equal(readinessResult.readiness.id, 'READY-1');
  assert.deepEqual(readinessCalls, [['USER-1', 'READY-1']]);

  const closeCalls = [];
  const closeRoute = routeFor(
    { getCostCloseForActor: async (...args) => { closeCalls.push(args); return { costClose: { id: 'CLOSE-1' }, orderId: 'ORDER-1' }; } },
    'GET',
    '/v2/cost-closes/CLOSE-1',
  );
  const closeResult = await closeRoute.execute({ actorId: 'USER-1', params: ['CLOSE-1'], query: {} });
  assert.equal(closeResult.costClose.id, 'CLOSE-1');
  assert.deepEqual(closeCalls, [['USER-1', 'CLOSE-1']]);
});
