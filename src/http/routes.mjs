import { invariant } from '../core/errors.mjs';
import { asArray, asObject, query } from './request-contract.mjs';

const ROUTES = Object.freeze([
  post('/v2/auth/register', body(['email', 'password', 'displayName']), ({ auth }, _, body) => auth.register(body)),
  post('/v2/auth/login', body(['email', 'password']), ({ auth }, _, body) => auth.login(body)),
  get('/v2/auth/me', empty(), ({ auth }, context) => auth.me(context.actorId)),
  post('/v2/auth/logout', empty(), ({ auth }, context) => auth.logout(context.token)),
  post('/v2/organisations', body(['id', 'type', 'name', 'createdAt']), ({ platform }, context, body) => platform.registerOrganisation(context.commandId, context.actorId, body)),
  post('/v2/memberships', body(['id', 'organisationId', 'userId', 'organisationType', 'role', 'status']), ({ platform }, context, body) => platform.grantMembership(context.commandId, context.actorId, body)),
  post('/v2/campaigns', body(['brandId', 'name', 'season', 'salesWindow']), ({ platform }, context, body) => platform.createCampaign(context.commandId, context.actorId, body)),
  post(/^\/v2\/campaigns\/([^/]+)\/open$/, empty(), ({ platform }, context, _, campaignId) => platform.openCampaign(context.commandId, context.actorId, campaignId)),
  post('/v2/collections', body(['campaignId', 'name', 'currency']), ({ platform }, context, body) => platform.createCollection(context.commandId, context.actorId, body)),
  post(/^\/v2\/collections\/([^/]+)\/publish$/, empty(), ({ platform }, context, _, collectionId) => platform.publishCollection(context.commandId, context.actorId, collectionId)),
  post('/v2/cycles', body(['brandId', 'shopId', 'campaignId', 'collectionId']), ({ platform }, context, body) => platform.startCycle(context.commandId, context.actorId, body)),
  post(/^\/v2\/cycles\/([^/]+)\/advance$/, body(['targetStage']), ({ platform }, context, body, cycleId) => platform.advanceCycle(context.commandId, context.actorId, cycleId, body.targetStage)),
  post(/^\/v2\/cycles\/([^/]+)\/order$/, body(['order']), ({ platform }, context, body, cycleId) => platform.attachOrder(context.commandId, context.actorId, cycleId, asObject(body.order))),
  post(/^\/v2\/cycles\/([^/]+)\/confirm$/, empty(), ({ platform }, context, _, cycleId) => platform.confirmAndOpenDeal(context.commandId, context.actorId, cycleId)),
  post('/v2/relationships', body(['brandId', 'shopId']), ({ partners }, context, body) => partners.requestRelationship(context.commandId, context.actorId, body)),
  post(/^\/v2\/relationships\/([^/]+)\/accept$/, empty(), ({ partners }, context, _, id) => partners.acceptRelationship(context.commandId, context.actorId, id)),
  post(/^\/v2\/relationships\/([^/]+)\/reject$/, empty(), ({ partners }, context, _, id) => partners.rejectRelationship(context.commandId, context.actorId, id)),
  post(/^\/v2\/relationships\/([^/]+)\/revoke$/, empty(), ({ partners }, context, _, id) => partners.revokeRelationship(context.commandId, context.actorId, id)),
  post('/v2/catalog/skus', body(['sku', 'collectionId', 'name', 'currency', 'wholesalePrice', 'minimumOrderQuantity', 'availableQuantity']), ({ catalog }, context, body) => catalog.createSku(context.commandId, context.actorId, body)),
  post(/^\/v2\/catalog\/skus\/([^/]+)\/publish$/, empty(), ({ catalog }, context, _, sku) => catalog.publishSku(context.commandId, context.actorId, sku)),
  post('/v2/showrooms', body(['collectionId', 'name']), ({ collaboration }, context, body) => collaboration.createShowroom(context.commandId, context.actorId, body)),
  post(/^\/v2\/showrooms\/([^/]+)\/open$/, empty(), ({ collaboration }, context, _, id) => collaboration.openShowroom(context.commandId, context.actorId, id)),
  post(/^\/v2\/showrooms\/([^/]+)\/invitations$/, body(['shopId', 'expiresAt']), ({ partners }, context, body, showroomId) => partners.inviteShopToShowroom(context.commandId, context.actorId, { showroomId, ...body })),
  post(/^\/v2\/showroom-invitations\/([^/]+)\/accept$/, empty(), ({ partners }, context, _, id) => partners.acceptShowroomInvitation(context.commandId, context.actorId, id)),
  post(/^\/v2\/showroom-invitations\/([^/]+)\/decline$/, empty(), ({ partners }, context, _, id) => partners.declineShowroomInvitation(context.commandId, context.actorId, id)),
  post(/^\/v2\/showroom-invitations\/([^/]+)\/revoke$/, empty(), ({ partners }, context, _, id) => partners.revokeShowroomInvitation(context.commandId, context.actorId, id)),
  post('/v2/selections', body(['cycleId', 'showroomId']), ({ collaboration }, context, body) => collaboration.createSelection(context.commandId, context.actorId, body)),
  put(/^\/v2\/selections\/([^/]+)\/lines$/, body(['line']), ({ collaboration }, context, body, id) => collaboration.upsertSelectionLine(context.commandId, context.actorId, id, asObject(body.line))),
  post(/^\/v2\/selections\/([^/]+)\/submit$/, empty(), ({ collaboration }, context, _, id) => collaboration.submitSelection(context.commandId, context.actorId, id)),
  post('/v2/orders', body(['selectionId', 'terms']), ({ orders }, context, body) => orders.createOrderDraft(context.commandId, context.actorId, { selectionId: body.selectionId, terms: asObject(body.terms) })),
  post(/^\/v2\/orders\/([^/]+)\/accept-terms$/, body(['organisationId']), ({ orders }, context, body, orderId) => orders.acceptTerms(context.commandId, context.actorId, { orderId, organisationId: body.organisationId })),
  post(/^\/v2\/orders\/([^/]+)\/attach$/, empty(), ({ orders }, context, _, orderId) => orders.attachOrderToCycle(context.commandId, context.actorId, orderId)),
  post(/^\/v2\/orders\/([^/]+)\/cancel$/, body(['reason']), ({ orders }, context, body, orderId) => orders.cancelOrder(context.commandId, context.actorId, { orderId, reason: body.reason })),
  get('/v2/notifications/page', query(['limit', 'cursor']), ({ notifications }, context, body) => notifications.pageForActor(context.actorId, { limit: body.limit, cursor: body.cursor })),
  get('/v2/notifications', query(['limit']), ({ notifications }, context, body) => notifications.listForActor(context.actorId, { limit: body.limit })),
  post(/^\/v2\/notifications\/([^/]+)\/read$/, empty(), ({ notifications }, context, _, notificationId) => notifications.markRead(context.commandId, context.actorId, notificationId)),
  get('/v2/workspace', empty(), ({ workspace }, context) => workspace.loadForActor(context.actorId)),
  get('/v2/snapshot', empty(), ({ platform }, context) => platform.snapshot(context.actorId)),
]);

export function matchRoute(method, pathname) {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    if (typeof route.matcher === 'string') {
      if (route.matcher === pathname) return Object.freeze({ route, params: Object.freeze([]) });
      continue;
    }
    const match = pathname.match(route.matcher);
    if (match) return Object.freeze({ route, params: Object.freeze(match.slice(1).map(decodePathParameter)) });
  }
  return undefined;
}

export function validateRouteInput(route, { body: rawBody, url }) {
  invariant(route?.contract, 'ROUTE_CONTRACT_REQUIRED', 'Route contract is required');
  if (route.contract.source === 'query') return queryFields(url, route.contract.fields);
  const bodyValue = rawBody === undefined || rawBody === null ? {} : asObject(rawBody);
  return exactFields(bodyValue, route.contract.fields, 'body');
}

function get(matcher, contract, run) { return route('GET', matcher, contract, run); }
function post(matcher, contract, run) { return route('POST', matcher, contract, run); }
function put(matcher, contract, run) { return route('PUT', matcher, contract, run); }
function route(method, matcher, contract, run) { return Object.freeze({ method, matcher, contract, run }); }
function body(fields) { return Object.freeze({ source: 'body', fields: Object.freeze(fields) }); }
function query(fields) { return Object.freeze({ source: 'query', fields: Object.freeze(fields) }); }
function empty() { return body([]); }

function exactFields(value, allowedFields, location) {
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(value).filter((field) => !allowed.has(field));
  invariant(unknown.length === 0, 'REQUEST_FIELD_UNKNOWN', `Unknown ${location} field`, { location, fields: unknown.sort() });
  return value;
}

function queryFields(url, fields) {
  const allowed = new Set(fields);
  const unknown = [...new Set([...url.searchParams.keys()].filter((field) => !allowed.has(field)))];
  invariant(unknown.length === 0, 'REQUEST_FIELD_UNKNOWN', 'Unknown query field', { location: 'query', fields: unknown.sort() });
  const result = {};
  for (const field of fields) {
    const values = url.searchParams.getAll(field);
    invariant(values.length <= 1, 'REQUEST_QUERY_FIELD_DUPLICATE', 'Query field must not be repeated', {
      location: 'query',
      field,
      count: values.length,
    });
    if (values.length === 1) result[field] = values[0];
  }
  return Object.freeze(result);
}

function decodePathParameter(value) {
  try {
    const decoded = decodeURIComponent(value);
    invariant(decoded.length > 0 && !decoded.includes('/') && !decoded.includes('\\'), 'PATH_PARAMETER_INVALID', 'Path parameter is invalid');
    return decoded;
  } catch (error) {
    if (error?.code === 'PATH_PARAMETER_INVALID') throw error;
    invariant(false, 'PATH_PARAMETER_INVALID', 'Path parameter encoding is invalid');
  }
}
