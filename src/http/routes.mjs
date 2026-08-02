import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';
import { decodePathParameter } from './transport-contract.mjs';

const EMPTY_BODY = bodyContract();
const CAMPAIGN_BODY = bodyContract(['brandId', 'name', 'season', 'startsAt', 'endsAt']);
const COLLECTION_BODY = bodyContract(['campaignId', 'brandId', 'name', 'currency']);
const CATALOG_SKU_BODY = bodyContract(['sku', 'collectionId', 'brandId', 'name', 'wholesalePrice', 'currency', 'minimumOrderQuantity', 'availableQuantity']);
const SHOWROOM_BODY = bodyContract(['collectionId', 'brandId', 'name', 'opensAt', 'closesAt']);
const RELATIONSHIP_BODY = bodyContract(['brandId', 'shopId']);
const INVITATION_BODY = bodyContract(['showroomId', 'shopId', 'expiresAt']);
const CYCLE_BODY = bodyContract(['brandId', 'shopId', 'campaignId', 'collectionId']);
const CYCLE_ADVANCE_BODY = bodyContract(['cycleId', 'targetStage']);
const SELECTION_BODY = bodyContract(['cycleId', 'showroomId']);
const SELECTION_LINE_BODY = bodyContract(['selectionId', 'sku', 'quantity', 'note', 'unitPrice', 'currency', 'catalogVersion']);
const ORDER_BODY = bodyContract(['selectionId', 'terms'], {
  terms: ['incoterm', 'paymentDays', 'prepaymentPercent', 'deliveryStart', 'deliveryEnd'],
});
const ORDER_ACCEPT_BODY = bodyContract(['orderId', 'organisationId']);
const ORDER_CANCEL_BODY = bodyContract(['orderId', 'reason']);

export function createWholesaleRoutes({ platform, catalog, partners, collaboration, orders, notifications, workspace }) {
  invariant(platform && partners && collaboration && orders && notifications && workspace, 'HTTP_SERVICES_REQUIRED', 'All V2 application services are required');
  const catalogService = catalog ?? unavailableCatalog();
  return [
    mutate('POST', /^\/v2\/campaigns$/, CAMPAIGN_BODY, ({ commandId, actorId, body }) => platform.createCampaign(commandId, actorId, body)),
    mutate('POST', /^\/v2\/campaigns\/([^/]+)\/open$/, EMPTY_BODY, ({ commandId, actorId, params }) => platform.openCampaign(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/collections$/, COLLECTION_BODY, ({ commandId, actorId, body }) => platform.createCollection(commandId, actorId, body)),
    mutate('POST', /^\/v2\/collections\/([^/]+)\/publish$/, EMPTY_BODY, ({ commandId, actorId, params }) => platform.publishCollection(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/catalog\/skus$/, CATALOG_SKU_BODY, ({ commandId, actorId, body }) => catalogService.createSku(commandId, actorId, body)),
    mutate('POST', /^\/v2\/catalog\/skus\/([^/]+)\/publish$/, EMPTY_BODY, ({ commandId, actorId, params }) => catalogService.publishSku(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/showrooms$/, SHOWROOM_BODY, ({ commandId, actorId, body }) => collaboration.createShowroom(commandId, actorId, body)),
    mutate('POST', /^\/v2\/showrooms\/([^/]+)\/open$/, EMPTY_BODY, ({ commandId, actorId, params }) => collaboration.openShowroom(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/relationships$/, RELATIONSHIP_BODY, ({ commandId, actorId, body }) => partners.requestRelationship(commandId, actorId, body)),
    mutate('POST', /^\/v2\/relationships\/([^/]+)\/accept$/, EMPTY_BODY, ({ commandId, actorId, params }) => partners.acceptRelationship(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/relationships\/([^/]+)\/reject$/, EMPTY_BODY, ({ commandId, actorId, params }) => partners.rejectRelationship(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/relationships\/([^/]+)\/revoke$/, EMPTY_BODY, ({ commandId, actorId, params }) => partners.revokeRelationship(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/showrooms\/([^/]+)\/invitations$/, INVITATION_BODY, ({ commandId, actorId, params, body }) => {
      sameId(body.showroomId, params[0], 'showroomId');
      return partners.inviteShopToShowroom(commandId, actorId, { ...body, showroomId: params[0] });
    }),
    mutate('POST', /^\/v2\/invitations\/([^/]+)\/accept$/, EMPTY_BODY, ({ commandId, actorId, params }) => partners.acceptShowroomInvitation(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/invitations\/([^/]+)\/decline$/, EMPTY_BODY, ({ commandId, actorId, params }) => partners.declineShowroomInvitation(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/invitations\/([^/]+)\/revoke$/, EMPTY_BODY, ({ commandId, actorId, params }) => partners.revokeShowroomInvitation(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/cycles$/, CYCLE_BODY, ({ commandId, actorId, body }) => platform.startCycle(commandId, actorId, body)),
    mutate('POST', /^\/v2\/cycles\/([^/]+)\/advance$/, CYCLE_ADVANCE_BODY, ({ commandId, actorId, params, body }) => {
      sameId(body.cycleId, params[0], 'cycleId');
      return platform.advanceCycle(commandId, actorId, params[0], body.targetStage);
    }),
    mutate('POST', /^\/v2\/cycles\/([^/]+)\/confirm$/, EMPTY_BODY, ({ commandId, actorId, params }) => platform.confirmAndOpenDeal(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/selections$/, SELECTION_BODY, ({ commandId, actorId, body }) => collaboration.createSelection(commandId, actorId, body)),
    mutate('PUT', /^\/v2\/selections\/([^/]+)\/lines\/([^/]+)$/, SELECTION_LINE_BODY, ({ commandId, actorId, params, body }) => {
      const sku = params[1];
      sameId(body.selectionId, params[0], 'selectionId');
      sameId(body.sku, sku, 'sku');
      return collaboration.upsertSelectionLine(commandId, actorId, params[0], { ...body, sku });
    }),
    mutate('POST', /^\/v2\/selections\/([^/]+)\/submit$/, EMPTY_BODY, ({ commandId, actorId, params }) => collaboration.submitSelection(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/orders$/, ORDER_BODY, ({ commandId, actorId, body }) => orders.createOrderDraft(commandId, actorId, body)),
    mutate('POST', /^\/v2\/orders\/([^/]+)\/accept$/, ORDER_ACCEPT_BODY, ({ commandId, actorId, params, body }) => {
      sameId(body.orderId, params[0], 'orderId');
      return orders.acceptTerms(commandId, actorId, { ...body, orderId: params[0] });
    }),
    mutate('POST', /^\/v2\/orders\/([^/]+)\/attach$/, EMPTY_BODY, ({ commandId, actorId, params }) => orders.attachOrderToCycle(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/orders\/([^/]+)\/cancel$/, ORDER_CANCEL_BODY, ({ commandId, actorId, params, body }) => {
      sameId(body.orderId, params[0], 'orderId');
      return orders.cancelOrder(commandId, actorId, { orderId: params[0], reason: body.reason });
    }),
    read('GET', /^\/v2\/workspace\/([^/]+)\/page$/, ['limit', 'cursor'], ({ actorId, params, query }) => workspace.pageForActor(actorId, {
      section: params[0],
      limit: query.limit,
      cursor: query.cursor,
    })),
    read('GET', /^\/v2\/workspace$/, ['limit'], ({ actorId, query }) => workspace.loadForActor(actorId, { limit: query.limit })),
    read('GET', /^\/v2\/notifications\/page$/, ['limit', 'cursor'], ({ actorId, query }) => notifications.pageForActor(actorId, { limit: query.limit, cursor: query.cursor })),
    read('GET', /^\/v2\/notifications$/, ['limit'], ({ actorId, query }) => notifications.listForActor(actorId, { limit: query.limit })),
    mutate('POST', /^\/v2\/notifications\/([^/]+)\/read$/, EMPTY_BODY, ({ commandId, actorId, params }) => notifications.markRead(commandId, actorId, params[0])),
  ];
}

export function matchWholesaleRoute(routes, method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.pattern);
    if (match) return { ...route, params: match.slice(1).map(decodePathParameter) };
  }
  return null;
}

function mutate(method, pattern, contract, execute) {
  return {
    method,
    pattern,
    mutation: true,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      assertBodyContract(context.body, contract);
      return execute(context);
    },
  };
}

function read(method, pattern, queryFields, execute) {
  return {
    method,
    pattern,
    mutation: false,
    async execute(context) {
      assertQueryContract(context.query ?? {}, queryFields);
      return execute(context);
    },
  };
}

function sameId(bodyValue, routeValue, field) {
  invariant(bodyValue === undefined || bodyValue === routeValue, 'HTTP_IDENTIFIER_MISMATCH', 'Body identifier does not match route identifier', { field, routeValue, bodyValue });
}
function unavailableCatalog() {
  const fail = () => invariant(false, 'CATALOG_SERVICE_REQUIRED', 'Catalog service is required');
  return Object.freeze({ createSku: fail, publishSku: fail });
}
