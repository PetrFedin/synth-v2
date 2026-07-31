import { invariant } from '../core/errors.mjs';

export function createWholesaleRoutes({ platform, catalog, partners, collaboration, orders, notifications, workspace }) {
  invariant(platform && partners && collaboration && orders && notifications && workspace, 'HTTP_SERVICES_REQUIRED', 'All V2 application services are required');
  const catalogService = catalog ?? unavailableCatalog();
  return [
    mutate('POST', /^\/v2\/campaigns$/, ({ commandId, actorId, body }) => platform.createCampaign(commandId, actorId, body)),
    mutate('POST', /^\/v2\/campaigns\/([^/]+)\/open$/, ({ commandId, actorId, params }) => platform.openCampaign(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/collections$/, ({ commandId, actorId, body }) => platform.createCollection(commandId, actorId, body)),
    mutate('POST', /^\/v2\/collections\/([^/]+)\/publish$/, ({ commandId, actorId, params }) => platform.publishCollection(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/catalog\/skus$/, ({ commandId, actorId, body }) => catalogService.createSku(commandId, actorId, body)),
    mutate('POST', /^\/v2\/catalog\/skus\/([^/]+)\/publish$/, ({ commandId, actorId, params }) => catalogService.publishSku(commandId, actorId, decodeURIComponent(params[0]))),
    mutate('POST', /^\/v2\/showrooms$/, ({ commandId, actorId, body }) => collaboration.createShowroom(commandId, actorId, body)),
    mutate('POST', /^\/v2\/showrooms\/([^/]+)\/open$/, ({ commandId, actorId, params }) => collaboration.openShowroom(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/relationships$/, ({ commandId, actorId, body }) => partners.requestRelationship(commandId, actorId, body)),
    mutate('POST', /^\/v2\/relationships\/([^/]+)\/accept$/, ({ commandId, actorId, params }) => partners.acceptRelationship(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/showrooms\/([^/]+)\/invitations$/, ({ commandId, actorId, params, body }) => {
      sameId(body.showroomId, params[0], 'showroomId');
      return partners.inviteShopToShowroom(commandId, actorId, { ...body, showroomId: params[0] });
    }),
    mutate('POST', /^\/v2\/invitations\/([^/]+)\/accept$/, ({ commandId, actorId, params }) => partners.acceptShowroomInvitation(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/cycles$/, ({ commandId, actorId, body }) => platform.startCycle(commandId, actorId, body)),
    mutate('POST', /^\/v2\/cycles\/([^/]+)\/advance$/, ({ commandId, actorId, params, body }) => {
      sameId(body.cycleId, params[0], 'cycleId');
      return platform.advanceCycle(commandId, actorId, params[0], body.targetStage);
    }),
    mutate('POST', /^\/v2\/cycles\/([^/]+)\/confirm$/, ({ commandId, actorId, params }) => platform.confirmAndOpenDeal(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/selections$/, ({ commandId, actorId, body }) => collaboration.createSelection(commandId, actorId, body)),
    mutate('PUT', /^\/v2\/selections\/([^/]+)\/lines\/([^/]+)$/, ({ commandId, actorId, params, body }) => {
      const sku = decodeURIComponent(params[1]);
      sameId(body.selectionId, params[0], 'selectionId');
      sameId(body.sku, sku, 'sku');
      return collaboration.upsertSelectionLine(commandId, actorId, params[0], { ...body, sku });
    }),
    mutate('POST', /^\/v2\/selections\/([^/]+)\/submit$/, ({ commandId, actorId, params }) => collaboration.submitSelection(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/orders$/, ({ commandId, actorId, body }) => orders.createOrderDraft(commandId, actorId, body)),
    mutate('POST', /^\/v2\/orders\/([^/]+)\/accept$/, ({ commandId, actorId, params, body }) => {
      sameId(body.orderId, params[0], 'orderId');
      return orders.acceptTerms(commandId, actorId, { ...body, orderId: params[0] });
    }),
    mutate('POST', /^\/v2\/orders\/([^/]+)\/attach$/, ({ commandId, actorId, params }) => orders.attachOrderToCycle(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/orders\/([^/]+)\/cancel$/, ({ commandId, actorId, params, body }) => {
      sameId(body.orderId, params[0], 'orderId');
      return orders.cancelOrder(commandId, actorId, { orderId: params[0], reason: body.reason });
    }),
    read('GET', /^\/v2\/workspace$/, ({ actorId }) => workspace.loadForActor(actorId)),
    read('GET', /^\/v2\/notifications$/, ({ actorId }) => notifications.listForActor(actorId)),
    mutate('POST', /^\/v2\/notifications\/([^/]+)\/read$/, ({ commandId, actorId, params }) => notifications.markRead(commandId, actorId, params[0])),
  ];
}

export function matchWholesaleRoute(routes, method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.pattern);
    if (match) return { ...route, params: match.slice(1) };
  }
  return null;
}

function mutate(method, pattern, execute) { return { method, pattern, execute, mutation: true }; }
function read(method, pattern, execute) { return { method, pattern, execute, mutation: false }; }
function sameId(bodyValue, routeValue, field) {
  invariant(bodyValue === undefined || bodyValue === routeValue, 'HTTP_IDENTIFIER_MISMATCH', 'Body identifier does not match route identifier', { field, routeValue, bodyValue });
}
function unavailableCatalog() {
  const fail = () => invariant(false, 'CATALOG_SERVICE_REQUIRED', 'Catalog service is required');
  return Object.freeze({ createSku: fail, publishSku: fail });
}
