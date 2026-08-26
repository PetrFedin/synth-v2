import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollectionStyleVersionRoutes } from '../src/http/collection-style-version-routes.mjs';

function fixture() {
  const calls = [];
  const platform = Object.freeze({
    assignStyleVersionToCollection(commandId, actorId, input) {
      calls.push({ commandId, actorId, input });
      return Object.freeze({ id: 'assignment-1', ...input, brandId: 'brand-1', assignedAt: '2026-08-26T14:00:00.000Z', assignedBy: actorId });
    },
  });
  return Object.freeze({ routes: createCollectionStyleVersionRoutes({ platform }), calls });
}

test('collection Style Version route forwards the path Collection and body Style Version', async () => {
  const context = fixture();
  const [route] = context.routes;
  const result = await route.execute({
    commandId: 'cmd-1',
    actorId: 'brand-owner',
    params: ['collection-1'],
    query: {},
    body: { styleVersionId: 'style-version-1' },
  });

  assert.equal(route.method, 'POST');
  assert.equal(route.mutation, true);
  assert.equal(route.pattern.test('/v2/collections/collection-1/style-versions'), true);
  assert.deepEqual(context.calls, [{
    commandId: 'cmd-1',
    actorId: 'brand-owner',
    input: { collectionId: 'collection-1', styleVersionId: 'style-version-1' },
  }]);
  assert.equal(result.styleVersionId, 'style-version-1');
});

test('collection Style Version route rejects missing or unknown body fields before application execution', async () => {
  const context = fixture();
  const [route] = context.routes;

  assert.throws(
    () => route.execute({ commandId: 'cmd-1', actorId: 'brand-owner', params: ['collection-1'], query: {}, body: {} }),
    (error) => error.code === 'HTTP_BODY_FIELD_INVALID',
  );
  assert.throws(
    () => route.execute({ commandId: 'cmd-2', actorId: 'brand-owner', params: ['collection-1'], query: {}, body: { styleVersionId: 'style-version-1', collectionId: 'forged' } }),
    (error) => error.code === 'HTTP_BODY_FIELD_UNKNOWN',
  );
  assert.equal(context.calls.length, 0);
});
