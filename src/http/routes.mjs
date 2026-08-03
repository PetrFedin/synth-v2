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
const ORDER_BODY = bodyContract(['selectionId', 'terms'], { terms: ['incoterm', 'paymentDays', 'prepaymentPercent', 'deliveryStart', 'deliveryEnd'] });
const ORDER_ACCEPT_BODY = bodyContract(['orderId', 'organisationId']);
const ORDER_CANCEL_BODY = bodyContract(['orderId', 'reason']);
const COLLABORATION_THREAD_BODY = bodyContract(['ownerOrganisationId', 'subjectType', 'subjectId', 'title']);
const COLLABORATION_MESSAGE_BODY = bodyContract(['body']);
const CALENDAR_EVENT_BODY = bodyContract([
  'ownerOrganisationId', 'subjectType', 'subjectId', 'eventType', 'visibility', 'title', 'description',
  'startsAt', 'endsAt', 'allDay', 'location', 'participantOrganisationIds', 'reminders',
]);
const CALENDAR_STATUS_BODY = bodyContract(['status']);

const COMPATIBILITY_ROUTES = Object.freeze([
  routeContract('GET', /^\/v2\/notifications\/page$/, false, undefined, ['limit', 'cursor']),
  routeContract('GET', /^\/v2\/notifications$/, false, undefined, ['limit']),
  routeContract('GET', /^\/v2\/workspace$/, false, undefined, ['limit']),
  routeContract('GET', /^\/v2\/workspace\/([^/]+)\/page$/, false, undefined, ['limit', 'cursor']),
]);

export function createWholesaleRoutes({ platform, catalog, partners, collaboration, collaborationCalendar, orders, notifications, workspace }) {
  invariant(platform && partners && collaboration && orders && notifications && workspace, 'HTTP_SERVICES_REQUIRED', 'All V2 application services are required');
  const catalogService = catalog ?? unavailableCatalog();
  const collaborationCalendarService = collaborationCalendar ?? unavailableCollaborationCalendar();
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
    mutate('POST', /^\/v2\/collaboration\/threads$/, COLLABORATION_THREAD_BODY, ({ commandId, actorId, body }) => collaborationCalendarService.createThread(commandId, actorId, body)),
    mutate('POST', /^\/v2\/collaboration\/threads\/([^/]+)\/messages$/, COLLABORATION_MESSAGE_BODY, ({ commandId, actorId, params, body }) => collaborationCalendarService.postMessage(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/collaboration\/threads\/([^/]+)\/archive$/, EMPTY_BODY, ({ commandId, actorId, params }) => collaborationCalendarService.archiveThread(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/calendar\/events$/, CALENDAR_EVENT_BODY, ({ commandId, actorId, body }) => collaborationCalendarService.createEvent(commandId, actorId, body)),
    mutate('POST', /^\/v2\/calendar\/events\/([^/]+)\/status$/, CALENDAR_STATUS_BODY, ({ commandId, actorId, params, body }) => collaborationCalendarService.updateEventStatus(commandId, actorId, params[0], body.status)),
    read('GET', /^\/v2\/workspace\/([^/]+)\/page$/, ['limit', 'cursor'], ({ actorId, params, query }) => workspace.pageForActor(actorId, compactOptions({ section: params[0], limit: query.limit, cursor: query.cursor }))),
    read('GET', /^\/v2\/workspace$/, ['limit'], ({ actorId, query }) => invokeWithOptionalOptions(workspace.loadForActor.bind(workspace), actorId, { limit: query.limit })),
    read('GET', /^\/v2\/notifications\/page$/, ['limit', 'cursor'], ({ actorId, query }) => invokeWithOptionalOptions(notifications.pageForActor.bind(notifications), actorId, { limit: query.limit, cursor: query.cursor })),
    read('GET', /^\/v2\/notifications$/, ['limit'], ({ actorId, query }) => invokeWithOptionalOptions(notifications.listForActor.bind(notifications), actorId, { limit: query.limit })),
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

export function matchRoute(method, pathname) {
  for (const route of COMPATIBILITY_ROUTES) {
    if (route.method !== method) continue;
    const match = pathname.match(route.pattern);
    if (match) return Object.freeze({ route, params: Object.freeze(match.slice(1).map(decodePathParameter)) });
  }
  return null;
}

export function validateRouteInput(route, { url, body } = {}) {
  invariant(route && url instanceof URL, 'REQUEST_ROUTE_VALIDATION_INVALID', 'Route and URL are required');
  const query = {};
  for (const field of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(field);
    invariant(values.length === 1, 'REQUEST_QUERY_FIELD_DUPLICATE', 'Query field must not be repeated', { field, count: values.length });
    query[field] = values[0];
  }
  assertQueryContract(query, route.queryFields ?? []);
  if (route.mutation) assertBodyContract(body, route.bodyContract ?? EMPTY_BODY);
  return Object.freeze({ query: Object.freeze(query), body });
}

function mutate(method, pattern, contract, execute) {
  return {
    method, pattern, mutation: true, bodyContract: contract, queryFields: Object.freeze([]),
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      assertBodyContract(context.body, contract);
      return execute(context);
    },
  };
}

function read(method, pattern, queryFields, execute) {
  return {
    method, pattern, mutation: false, queryFields: Object.freeze([...queryFields]),
    execute(context) {
      assertQueryContract(context.query ?? {}, queryFields);
      return execute(context);
    },
  };
}

function routeContract(method, pattern, mutation, bodyContractValue, queryFields) {
  return Object.freeze({ method, pattern, mutation, bodyContract: bodyContractValue, queryFields: Object.freeze([...queryFields]) });
}
function compactOptions(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)); }
function invokeWithOptionalOptions(fn, actorId, options) {
  const normalized = compactOptions(options);
  return Object.keys(normalized).length ? fn(actorId, normalized) : fn(actorId);
}
function sameId(bodyValue, routeValue, field) {
  invariant(bodyValue === undefined || bodyValue === routeValue, 'HTTP_IDENTIFIER_MISMATCH', 'Body identifier does not match route identifier', { field, routeValue, bodyValue });
}
function unavailableCatalog() {
  const fail = () => invariant(false, 'CATALOG_SERVICE_REQUIRED', 'Catalog service is required');
  return Object.freeze({ createSku: fail, publishSku: fail });
}
function unavailableCollaborationCalendar() {
  const fail = () => invariant(false, 'COLLABORATION_CALENDAR_SERVICE_REQUIRED', 'Collaboration and calendar service is required');
  return Object.freeze({ createThread: fail, postMessage: fail, archiveThread: fail, createEvent: fail, updateEventStatus: fail });
}
