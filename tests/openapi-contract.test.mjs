import test from 'node:test';
import assert from 'node:assert/strict';
import { wholesaleV2OpenApi } from '../src/http/openapi.mjs';

const expectedOperations = Object.freeze({
  '/relationships/{relationshipId}/reject': 'rejectRelationship',
  '/relationships/{relationshipId}/revoke': 'revokeRelationship',
  '/invitations/{invitationId}/decline': 'declineShowroomInvitation',
  '/invitations/{invitationId}/revoke': 'revokeShowroomInvitation',
  '/orders/{orderId}/cancel': 'cancelOrder',
});

test('OpenAPI includes every mutation route added to the HTTP router', () => {
  for (const [path, operationId] of Object.entries(expectedOperations)) {
    assert.equal(wholesaleV2OpenApi.paths[path]?.post?.operationId, operationId, path);
  }
});

test('mutation keys use the same safe global 128-character contract as HTTP', () => {
  const parameter = wholesaleV2OpenApi.paths['/campaigns'].post.parameters.find((item) => item.name === 'Idempotency-Key');
  assert.equal(parameter.required, true);
  assert.equal(parameter.schema.maxLength, 128);
  assert.equal(parameter.schema.pattern, '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
  assert.match(parameter.description, /Globally unique/);
  assert.match(parameter.description, /HTTP 409/);
});

test('documented catalog and selection limits match domain and PostgreSQL contracts', () => {
  const catalog = wholesaleV2OpenApi.components.schemas.CatalogSkuCreate.properties;
  assert.equal(catalog.name.maxLength, 160);
  assert.equal(catalog.wholesalePrice.multipleOf, 0.0001);
  assert.equal(catalog.availableQuantity.maximum, 2_147_483_647);
  const selection = wholesaleV2OpenApi.components.schemas.SelectionLineInput.properties;
  assert.equal(selection.quantity.maximum, 2_147_483_647);
  assert.equal(selection.note.maxLength, 2000);
});

test('all structured write bodies document JSON and vendor JSON media types', () => {
  for (const pathItem of Object.values(wholesaleV2OpenApi.paths)) {
    for (const method of ['post', 'put', 'patch']) {
      const operation = pathItem[method];
      if (!operation?.requestBody) continue;
      assert.ok(operation.requestBody.content['application/json']);
      assert.ok(operation.requestBody.content['application/*+json']);
    }
  }
});
