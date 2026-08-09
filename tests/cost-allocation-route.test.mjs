import test from 'node:test';
import assert from 'node:assert/strict';
import { createCostAllocationRoutes } from '../src/http/cost-allocation-routes.mjs';

function routeFor(service, method, path) {
  return createCostAllocationRoutes({ costAllocation: service }).find((route) => route.method === method && route.pattern.test(path));
}

test('policy route forwards immutable version definition', async () => {
  const calls = [];
  const service = { createPolicyVersion: async (...args) => { calls.push(args); return { id: 'POLICY-1' }; } };
  const route = routeFor(service, 'POST', '/v2/brands/BRAND-1/cost-allocation-policies');
  const body = { name: 'Default', version: 1, defaultBasis: 'net_value', rules: [{ costType: 'freight', basis: 'unit' }] };
  const result = await route.execute({ commandId: 'CMD-1', actorId: 'USER-1', params: ['BRAND-1'], query: {}, body });
  assert.equal(result.id, 'POLICY-1');
  assert.deepEqual(calls, [['CMD-1', 'USER-1', 'BRAND-1', body]]);
});

test('allocation run route forwards exact landed cost, policy and custom weights', async () => {
  const calls = [];
  const service = { allocateLandedCost: async (...args) => { calls.push(args); return { id: 'RUN-1' }; } };
  const route = routeFor(service, 'POST', '/v2/orders/ORDER-1/cost-allocation-runs');
  const body = {
    landedCostSnapshotId: 'LANDED-1', policyVersionId: 'POLICY-1',
    customWeightsByCostEntryId: { 'COST-1': { 'SKU-A': 2, 'SKU-B': 1 } },
  };
  const result = await route.execute({ commandId: 'CMD-2', actorId: 'USER-1', params: ['ORDER-1'], query: {}, body });
  assert.equal(result.id, 'RUN-1');
  assert.deepEqual(calls, [['CMD-2', 'USER-1', 'ORDER-1', body]]);
});

test('allocation run route rejects negative custom weights', () => {
  const route = routeFor({ allocateLandedCost: async () => ({}) }, 'POST', '/v2/orders/ORDER-1/cost-allocation-runs');
  assert.throws(
    () => route.execute({
      commandId: 'CMD-BAD', actorId: 'USER-1', params: ['ORDER-1'], query: {},
      body: { landedCostSnapshotId: 'LANDED-1', policyVersionId: 'POLICY-1', customWeightsByCostEntryId: { 'COST-1': { 'SKU-A': -1 } } },
    }),
    (error) => error?.code === 'HTTP_BODY_FIELD_INVALID',
  );
});

test('allocation read routes expose immutable policy and run identities', async () => {
  const policyRoute = routeFor({ getPolicyVersionForActor: async () => ({ id: 'POLICY-1' }) }, 'GET', '/v2/cost-allocation-policies/POLICY-1');
  const runRoute = routeFor({ getAllocationRunForActor: async () => ({ id: 'RUN-1' }) }, 'GET', '/v2/cost-allocation-runs/RUN-1');
  assert.equal((await policyRoute.execute({ actorId: 'USER-1', params: ['POLICY-1'], query: {} })).id, 'POLICY-1');
  assert.equal((await runRoute.execute({ actorId: 'USER-1', params: ['RUN-1'], query: {} })).id, 'RUN-1');
});
