const SAFE_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
const mutationHeaders = [{
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN },
}];
const auth = [{ bearerAuth: [] }];
const identifier = { type: 'string', minLength: 1, maxLength: 160 };
const dateOrDateTime = { oneOf: [{ type: 'string', format: 'date' }, { type: 'string', format: 'date-time' }] };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const postgresIntegerMaximum = 2_147_483_647;
const moneyMaximum = 900_719_925_474.0991;

export const wholesaleV2OpenApi = Object.freeze({
  openapi: '3.1.0',
  info: { title: 'Syntha Wholesale V2 API', version: '1.0.0' },
  servers: [{ url: '/v2' }],
  'x-operational-endpoints': Object.freeze({ liveness: '/health', readiness: '/ready', specification: '/openapi.json' }),
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Opaque Syntha V2 session token' } },
    schemas: {
      Error: {
        type: 'object', required: ['error', 'requestId'],
        properties: {
          error: {
            type: 'object', required: ['code', 'message', 'details'],
            properties: { code: { type: 'string' }, message: { type: 'string' }, details: { type: 'object' } },
          },
          requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN },
        },
      },
      LoginRequest: {
        type: 'object', required: ['email', 'password'], additionalProperties: false,
        properties: {
          email: { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 12, maxLength: 1024 },
        },
      },
      CampaignCreate: {
        type: 'object', required: ['brandId', 'name', 'season', 'startsAt', 'endsAt'], additionalProperties: false,
        properties: {
          brandId: identifier,
          name: { type: 'string', minLength: 2, maxLength: 160 },
          season: { type: 'string', minLength: 2, maxLength: 40 },
          startsAt: dateOrDateTime,
          endsAt: dateOrDateTime,
        },
      },
      CollectionCreate: {
        type: 'object', required: ['campaignId', 'brandId', 'name', 'currency'], additionalProperties: false,
        properties: {
          campaignId: identifier,
          brandId: identifier,
          name: { type: 'string', minLength: 2, maxLength: 160 },
          currency,
        },
      },
      CatalogSkuCreate: {
        type: 'object',
        required: ['sku', 'collectionId', 'brandId', 'name', 'wholesalePrice', 'currency', 'minimumOrderQuantity', 'availableQuantity'],
        additionalProperties: false,
        properties: {
          sku: { type: 'string', pattern: '^[A-Z0-9][A-Z0-9._-]{1,63}$' },
          collectionId: identifier,
          brandId: identifier,
          name: { type: 'string', minLength: 2, maxLength: 160 },
          wholesalePrice: { type: 'number', exclusiveMinimum: 0, maximum: moneyMaximum, multipleOf: 0.0001 },
          currency,
          minimumOrderQuantity: { type: 'integer', minimum: 1, maximum: postgresIntegerMaximum },
          availableQuantity: { type: 'integer', minimum: 0, maximum: postgresIntegerMaximum },
        },
      },
      ShowroomCreate: {
        type: 'object', required: ['collectionId', 'brandId', 'name', 'opensAt', 'closesAt'], additionalProperties: false,
        properties: {
          collectionId: identifier,
          brandId: identifier,
          name: { type: 'string', minLength: 2, maxLength: 160 },
          opensAt: dateOrDateTime,
          closesAt: dateOrDateTime,
        },
      },
      RelationshipCreate: {
        type: 'object', required: ['brandId', 'shopId'], additionalProperties: false,
        properties: { brandId: identifier, shopId: identifier },
      },
      ShowroomInvitationCreate: {
        type: 'object', required: ['shopId', 'expiresAt'], additionalProperties: false,
        properties: { showroomId: identifier, shopId: identifier, expiresAt: dateOrDateTime },
      },
      CycleCreate: {
        type: 'object', required: ['brandId', 'shopId', 'campaignId', 'collectionId'], additionalProperties: false,
        properties: { brandId: identifier, shopId: identifier, campaignId: identifier, collectionId: identifier },
      },
      CycleAdvance: {
        type: 'object', required: ['targetStage'], additionalProperties: false,
        properties: {
          cycleId: identifier,
          targetStage: { type: 'string', enum: ['collection', 'showroom', 'selection', 'order-builder', 'order', 'deal-space'] },
        },
      },
      SelectionCreate: {
        type: 'object', required: ['cycleId', 'showroomId'], additionalProperties: false,
        properties: { cycleId: identifier, showroomId: identifier },
      },
      SelectionLineInput: {
        type: 'object', required: ['sku', 'quantity'], additionalProperties: false,
        properties: {
          selectionId: identifier,
          sku: { type: 'string', pattern: '^[A-Z0-9][A-Z0-9._-]{1,63}$' },
          quantity: { type: 'integer', minimum: 1, maximum: postgresIntegerMaximum },
          note: { type: 'string', maxLength: 2000 },
        },
      },
      OrderTerms: {
        type: 'object', required: ['incoterm', 'paymentDays', 'prepaymentPercent', 'deliveryStart', 'deliveryEnd'], additionalProperties: false,
        properties: {
          incoterm: { type: 'string', enum: ['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP'] },
          paymentDays: { type: 'integer', minimum: 0, maximum: 365 },
          prepaymentPercent: { type: 'number', minimum: 0, maximum: 100 },
          deliveryStart: dateOrDateTime,
          deliveryEnd: dateOrDateTime,
        },
      },
      OrderCreate: {
        type: 'object', required: ['selectionId', 'terms'], additionalProperties: false,
        properties: { selectionId: identifier, terms: { $ref: '#/components/schemas/OrderTerms' } },
      },
      OrderAccept: {
        type: 'object', required: ['organisationId'], additionalProperties: false,
        properties: { orderId: identifier, organisationId: identifier },
      },
      OrderCancel: {
        type: 'object', required: ['reason'], additionalProperties: false,
        properties: { orderId: identifier, reason: { type: 'string', minLength: 3, maxLength: 1000 } },
      },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        operationId: 'login',
        requestBody: requestBody('#/components/schemas/LoginRequest'),
        responses: {
          200: { description: 'Session created' },
          400: { description: 'Invalid credentials payload' },
          401: { description: 'Invalid credentials' },
          413: { description: 'Request body too large' },
          415: { description: 'Unsupported content type' },
          429: { description: 'Too many login attempts', headers: { 'Retry-After': { schema: { type: 'integer', minimum: 1 } } } },
        },
      },
    },
    '/auth/me': { get: readOperation('currentUser', { 200: 'Current authenticated user', 401: 'Authentication required' }) },
    '/auth/logout': { post: { operationId: 'logout', security: auth, responses: standardResponses() } },
    '/campaigns': { post: operation('createCampaign', [], '#/components/schemas/CampaignCreate') },
    '/campaigns/{campaignId}/open': { post: operation('openCampaign', ['campaignId']) },
    '/collections': { post: operation('createCollection', [], '#/components/schemas/CollectionCreate') },
    '/collections/{collectionId}/publish': { post: operation('publishCollection', ['collectionId']) },
    '/catalog/skus': { post: operation('createCatalogSku', [], '#/components/schemas/CatalogSkuCreate') },
    '/catalog/skus/{sku}/publish': { post: operation('publishCatalogSku', ['sku']) },
    '/showrooms': { post: operation('createShowroom', [], '#/components/schemas/ShowroomCreate') },
    '/showrooms/{showroomId}/open': { post: operation('openShowroom', ['showroomId']) },
    '/relationships': { post: operation('requestRelationship', [], '#/components/schemas/RelationshipCreate') },
    '/relationships/{relationshipId}/accept': { post: operation('acceptRelationship', ['relationshipId']) },
    '/relationships/{relationshipId}/reject': { post: operation('rejectRelationship', ['relationshipId']) },
    '/relationships/{relationshipId}/revoke': { post: operation('revokeRelationship', ['relationshipId']) },
    '/showrooms/{showroomId}/invitations': { post: operation('inviteShopToShowroom', ['showroomId'], '#/components/schemas/ShowroomInvitationCreate') },
    '/invitations/{invitationId}/accept': { post: operation('acceptShowroomInvitation', ['invitationId']) },
    '/invitations/{invitationId}/decline': { post: operation('declineShowroomInvitation', ['invitationId']) },
    '/invitations/{invitationId}/revoke': { post: operation('revokeShowroomInvitation', ['invitationId']) },
    '/cycles': { post: operation('startCycle', [], '#/components/schemas/CycleCreate') },
    '/cycles/{cycleId}/advance': { post: operation('advanceCycle', ['cycleId'], '#/components/schemas/CycleAdvance') },
    '/cycles/{cycleId}/confirm': { post: operation('confirmAndOpenDeal', ['cycleId']) },
    '/selections': { post: operation('createSelection', [], '#/components/schemas/SelectionCreate') },
    '/selections/{selectionId}/lines/{sku}': { put: operation('upsertSelectionLine', ['selectionId', 'sku'], '#/components/schemas/SelectionLineInput') },
    '/selections/{selectionId}/submit': { post: operation('submitSelection', ['selectionId']) },
    '/orders': { post: operation('createOrderDraft', [], '#/components/schemas/OrderCreate') },
    '/orders/{orderId}/accept': { post: operation('acceptOrderTerms', ['orderId'], '#/components/schemas/OrderAccept') },
    '/orders/{orderId}/attach': { post: operation('attachOrderToCycle', ['orderId']) },
    '/orders/{orderId}/cancel': { post: operation('cancelOrder', ['orderId'], '#/components/schemas/OrderCancel') },
    '/workspace': { get: readOperation('loadWorkspace', { 200: 'Actor workspace', 401: 'Authentication required' }) },
    '/notifications': { get: readOperation('listNotifications', { 200: 'Notifications', 401: 'Authentication required' }) },
    '/notifications/{notificationId}/read': { post: operation('markNotificationRead', ['notificationId']) },
  },
});

function operation(operationId, pathNames = [], schemaRef) {
  return {
    operationId,
    security: auth,
    parameters: [...pathNames.map(pathParameter), ...mutationHeaders],
    ...(schemaRef ? { requestBody: requestBody(schemaRef) } : {}),
    responses: standardResponses(),
  };
}

function readOperation(operationId, descriptions) {
  return {
    operationId,
    security: auth,
    responses: Object.fromEntries(Object.entries(descriptions).map(([status, description]) => [status, { description }])),
  };
}

function pathParameter(name) {
  return { name, in: 'path', required: true, schema: identifier };
}

function requestBody(schemaRef) {
  const media = { schema: { $ref: schemaRef } };
  return { required: true, content: { 'application/json': media, 'application/*+json': media } };
}

function standardResponses() {
  return {
    200: { description: 'Success' },
    400: { description: 'Invalid transport request' },
    401: { description: 'Authentication required' },
    403: { description: 'Capability denied' },
    404: { description: 'Resource or route not found' },
    409: { description: 'Conflict' },
    413: { description: 'Request body too large' },
    415: { description: 'Unsupported content type' },
    422: { description: 'Domain validation failed, including MOQ or availability failures' },
  };
}
