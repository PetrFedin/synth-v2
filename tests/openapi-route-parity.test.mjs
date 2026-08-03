import test from 'node:test';
import assert from 'node:assert/strict';
import { wholesaleV2OpenApi } from '../src/http/openapi.mjs';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';

const routes = createWholesaleRoutes({
  platform: {},
  catalog: {},
  partners: {},
  collaboration: {},
  orders: {},
  notifications: {},
  workspace: {},
});

const contracts = [
  ['POST', '/v2/campaigns', '/campaigns'],
  ['POST', '/v2/campaigns/campaign-1/open', '/campaigns/{campaignId}/open'],
  ['POST', '/v2/collections', '/collections'],
  ['POST', '/v2/collections/collection-1/publish', '/collections/{collectionId}/publish'],
  ['GET', '/v2/catalog/skus', '/catalog/skus'],
  ['GET', '/v2/catalog/skus/SKU-1', '/catalog/skus/{sku}'],
  ['POST', '/v2/catalog/skus', '/catalog/skus'],
  ['POST', '/v2/catalog/skus/SKU-1/publish', '/catalog/skus/{sku}/publish'],
  ['POST', '/v2/showrooms', '/showrooms'],
  ['POST', '/v2/showrooms/showroom-1/open', '/showrooms/{showroomId}/open'],
  ['POST', '/v2/relationships', '/relationships'],
  ['POST', '/v2/relationships/relationship-1/accept', '/relationships/{relationshipId}/accept'],
  ['POST', '/v2/relationships/relationship-1/reject', '/relationships/{relationshipId}/reject'],
  ['POST', '/v2/relationships/relationship-1/revoke', '/relationships/{relationshipId}/revoke'],
  ['POST', '/v2/showrooms/showroom-1/invitations', '/showrooms/{showroomId}/invitations'],
  ['POST', '/v2/invitations/invitation-1/accept', '/invitations/{invitationId}/accept'],
  ['POST', '/v2/invitations/invitation-1/decline', '/invitations/{invitationId}/decline'],
  ['POST', '/v2/invitations/invitation-1/revoke', '/invitations/{invitationId}/revoke'],
  ['POST', '/v2/cycles', '/cycles'],
  ['POST', '/v2/cycles/cycle-1/advance', '/cycles/{cycleId}/advance'],
  ['POST', '/v2/cycles/cycle-1/confirm', '/cycles/{cycleId}/confirm'],
  ['POST', '/v2/selections', '/selections'],
  ['PUT', '/v2/selections/selection-1/lines/SKU-1', '/selections/{selectionId}/lines/{sku}'],
  ['POST', '/v2/selections/selection-1/submit', '/selections/{selectionId}/submit'],
  ['POST', '/v2/orders', '/orders'],
  ['POST', '/v2/orders/order-1/accept', '/orders/{orderId}/accept'],
  ['POST', '/v2/orders/order-1/attach', '/orders/{orderId}/attach'],
  ['POST', '/v2/orders/order-1/cancel', '/orders/{orderId}/cancel'],
  ['GET', '/v2/workspace', '/workspace'],
  ['GET', '/v2/workspace/orders/page', '/workspace/{section}/page'],
  ['GET', '/v2/notifications/page', '/notifications/page'],
  ['GET', '/v2/notifications', '/notifications'],
  ['POST', '/v2/notifications/notification-1/read', '/notifications/{notificationId}/read'],
];

test('every executable wholesale route has a method-matched OpenAPI operation', () => {
  for (const [method, runtimePath, specificationPath] of contracts) {
    assert.ok(matchWholesaleRoute(routes, method, runtimePath), `runtime route missing: ${method} ${runtimePath}`);
    assert.ok(
      wholesaleV2OpenApi.paths[specificationPath]?.[method.toLowerCase()],
      `OpenAPI operation missing: ${method} ${specificationPath}`,
    );
  }
});

test('adapter-owned authentication routes are documented relative to the /v2 server prefix', () => {
  for (const [method, path] of [
    ['post', '/auth/login'],
    ['get', '/auth/me'],
    ['post', '/auth/logout'],
  ]) assert.ok(wholesaleV2OpenApi.paths[path]?.[method], `${method.toUpperCase()} ${path}`);
});

test('drifted routes from the retired router contract stay absent', () => {
  for (const path of [
    '/auth/register',
    '/organisations',
    '/memberships',
    '/showroom-invitations/{invitationId}/accept',
    '/selections/{selectionId}/lines',
    '/orders/{orderId}/accept-terms',
    '/cycles/{cycleId}/order',
    '/snapshot',
  ]) assert.equal(wholesaleV2OpenApi.paths[path], undefined, `retired path remains documented: ${path}`);
});

test('cursor page responses reference bounded typed page schemas', () => {
  const catalogResponse = wholesaleV2OpenApi.paths['/catalog/skus'].get.responses[200];
  assert.equal(catalogResponse.content['application/json'].schema.$ref, '#/components/schemas/CatalogSkuPage');
  const catalogPage = wholesaleV2OpenApi.components.schemas.CatalogSkuPage;
  assert.deepEqual(catalogPage.required, ['items', 'nextCursor']);
  assert.equal(catalogPage.additionalProperties, false);
  assert.equal(catalogPage.properties.items.maxItems, 200);
  assert.equal(catalogPage.properties.items.items.$ref, '#/components/schemas/CatalogSku');
  assert.equal(catalogPage.properties.nextCursor.oneOf[0].maxLength, 2048);

  const notificationResponse = wholesaleV2OpenApi.paths['/notifications/page'].get.responses[200];
  assert.equal(notificationResponse.content['application/json'].schema.$ref, '#/components/schemas/NotificationPage');
  const notificationPage = wholesaleV2OpenApi.components.schemas.NotificationPage;
  assert.deepEqual(notificationPage.required, ['items', 'nextCursor', 'unreadCount']);
  assert.equal(notificationPage.additionalProperties, false);
  assert.equal(notificationPage.properties.items.maxItems, 200);
  assert.deepEqual(notificationPage.properties.unreadCount, {
    type: 'integer',
    minimum: 0,
    maximum: 9_007_199_254_740_991,
    description: 'Exact unread notification count across every active organisation visible to the authenticated actor.',
  });

  const workspaceResponse = wholesaleV2OpenApi.paths['/workspace/{section}/page'].get.responses[200];
  assert.equal(workspaceResponse.content['application/json'].schema.$ref, '#/components/schemas/WorkspaceSectionPage');
  const workspacePage = wholesaleV2OpenApi.components.schemas.WorkspaceSectionPage;
  assert.deepEqual(workspacePage.required, ['items', 'nextCursor']);
  assert.equal(workspacePage.additionalProperties, false);
  assert.equal(workspacePage.properties.items.maxItems, 200);
  assert.equal(workspacePage.properties.nextCursor.oneOf[0].maxLength, 2048);
});
