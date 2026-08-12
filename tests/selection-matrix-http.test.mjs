import assert from 'node:assert/strict';
import test from 'node:test';
import { createSelectionMatrixRoutes } from '../src/http/selection-matrix-routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

test('selection matrix HTTP route forwards one atomic server-authoritative matrix command', async () => {
  let received;
  const routes = createSelectionMatrixRoutes({
    collaboration: Object.freeze({
      replaceSelectionMatrix: async (commandId, actorId, selectionId, input) => {
        received = { commandId, actorId, selectionId, input };
        return { id: selectionId, status: 'draft', buyerCatalogVersionId: 'buyer-1', commercialBasisHash: 'hash', lines: [], version: 2 };
      },
    }),
  });
  const route = routes[0];
  const result = await route.execute({
    commandId: 'command-1', actorId: 'buyer-1', params: ['selection-1'], query: {},
    body: { selectionId: 'selection-1', lines: [{ sku: 'SKU-1', quantity: 3, note: 'buy' }] },
  });

  assert.equal(route.method, 'PUT');
  assert.equal(route.mutation, true);
  assert.equal(result.id, 'selection-1');
  assert.deepEqual(received, {
    commandId: 'command-1', actorId: 'buyer-1', selectionId: 'selection-1',
    input: { selectionId: 'selection-1', lines: [{ sku: 'SKU-1', quantity: 3, note: 'buy' }] },
  });
});

test('selection matrix HTTP route rejects duplicate SKUs and client-controlled price fields', async () => {
  const [route] = createSelectionMatrixRoutes({ collaboration: { replaceSelectionMatrix: async () => ({}) } });
  await assert.rejects(
    async () => route.execute({ commandId: 'c1', actorId: 'buyer-1', params: ['selection-1'], query: {}, body: { selectionId: 'selection-1', lines: [{ sku: 'SKU-1', quantity: 2 }, { sku: 'SKU-1', quantity: 3 }] } }),
    error => error?.code === 'HTTP_BODY_FIELD_INVALID',
  );
  await assert.rejects(
    async () => route.execute({ commandId: 'c2', actorId: 'buyer-1', params: ['selection-1'], query: {}, body: { selectionId: 'selection-1', lines: [{ sku: 'SKU-1', quantity: 2, unitPrice: 1 }] } }),
    error => error?.code === 'HTTP_BODY_FIELD_UNKNOWN',
  );
});

test('authoritative OpenAPI exposes atomic buyer matrix replacement contract', () => {
  assert.equal(wholesaleV2ExtendedOpenApi.info.version, '1.18.0');
  const operation = wholesaleV2ExtendedOpenApi.paths['/selections/{selectionId}/matrix']?.put;
  assert.equal(operation?.operationId, 'replaceSelectionMatrix');
  assert.equal(operation.requestBody.content['application/json'].schema.$ref, '#/components/schemas/SelectionMatrixReplaceInput');
  assert.equal(wholesaleV2ExtendedOpenApi.components.schemas.SelectionMatrixReplaceInput.properties.lines.maxItems, 5_000);
});
