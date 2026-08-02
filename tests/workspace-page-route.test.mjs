import test from 'node:test';
import assert from 'node:assert/strict';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';

function services(calls) {
  return {
    platform: {},
    catalog: {},
    partners: {},
    collaboration: {},
    orders: {},
    notifications: {},
    workspace: {
      async pageForActor(actorId, options) {
        calls.push({ actorId, options });
        return { items: [], nextCursor: null };
      },
    },
  };
}

test('workspace section page route forwards decoded section, limit and cursor only', async () => {
  const calls = [];
  const route = matchWholesaleRoute(
    createWholesaleRoutes(services(calls)),
    'GET',
    '/v2/workspace/catalogSkus/page',
  );
  assert.ok(route);
  assert.deepEqual(route.params, ['catalogSkus']);

  await route.execute({
    actorId: 'actor-1',
    params: route.params,
    query: { limit: '75', cursor: 'opaque-cursor' },
    body: {},
  });
  assert.deepEqual(calls, [{
    actorId: 'actor-1',
    options: { section: 'catalogSkus', limit: '75', cursor: 'opaque-cursor' },
  }]);
});

test('workspace section page route rejects undeclared query fields before service invocation', async () => {
  const calls = [];
  const route = matchWholesaleRoute(
    createWholesaleRoutes(services(calls)),
    'GET',
    '/v2/workspace/orders/page',
  );

  await assert.rejects(
    () => route.execute({
      actorId: 'actor-1',
      params: route.params,
      query: { limit: '25', offset: '25' },
      body: {},
    }),
    (error) => error.code === 'HTTP_QUERY_FIELD_UNKNOWN',
  );
  assert.equal(calls.length, 0);
});

test('workspace section path decoding rejects malformed encoded separators', () => {
  const routes = createWholesaleRoutes(services([]));
  assert.throws(
    () => matchWholesaleRoute(routes, 'GET', '/v2/workspace/orders%2Fhidden/page'),
    (error) => error.code === 'HTTP_PATH_PARAMETER_INVALID',
  );
});
