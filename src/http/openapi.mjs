const SAFE_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
const mutationHeaders = [{
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  description: 'Globally unique command key across every authenticated mutation. Reusing a key for another command returns HTTP 409.',
  schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN },
}];
const auth = [{ bearerAuth: [] }];
const identifier = { type: 'string', minLength: 1, maxLength: 160 };
const nullableIdentifier = { oneOf: [identifier, { type: 'null' }] };
const dateOrDateTime = { oneOf: [{ type: 'string', format: 'date' }, { type: 'string', format: 'date-time' }] };
const nullableDateTime = { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const postgresIntegerMaximum = 2_147_483_647;
const javascriptSafeIntegerMaximum = 9_007_199_254_740_991;
const moneyMaximum = 900_719_925_474.0991;
const workspaceSections = Object.freeze([
  'memberships',
  'organisations',
  'relationships',
  'invitations',
  'campaigns',
  'collections',
  'catalogSkus',
  'showrooms',
  'cycles',
  'selections',
  'orders',
  'deals',
  'calendar',
]);

export const wholesaleV2OpenApi = Object.freeze({
  openapi: '3.1.0',
  info: { title: 'Syntha Wholesale V2 API', version: '1.7.0' },
  servers: [{ url: '/v2', description: 'Authenticated Syntha V2 API prefix' }],
  'x-operational-endpoints': Object.freeze({
    liveness: '/health',
    readiness: '/ready',
    specification: '/openapi.json',
    metrics: '/metrics',
  }),
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Opaque Syntha V2 session token' } },
    schemas: {
      Error: {
        type: 'object', required: ['error', 'requestId'], additionalProperties: false,
        properties: {
          error: {
            type: 'object', required: ['code', 'message', 'details'], additionalProperties: false,
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
        properties: { campaignId: identifier, brandId: identifier, name: { type: 'string', minLength: 2, maxLength: 160 }, currency },
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
      CatalogSkuUpdate: {
        type: 'object',
        required: ['expectedVersion', 'name', 'wholesalePrice', 'minimumOrderQuantity', 'availableQuantity'],
        additionalProperties: false,
        properties: {
          expectedVersion: { type: 'integer', minimum: 1, maximum: postgresIntegerMaximum },
          name: { type: 'string', minLength: 2, maxLength: 160 },
          wholesalePrice: { type: 'number', exclusiveMinimum: 0, maximum: moneyMaximum, multipleOf: 0.0001 },
          minimumOrderQuantity: { type: 'integer', minimum: 1, maximum: postgresIntegerMaximum },
          availableQuantity: { type: 'integer', minimum: 0, maximum: postgresIntegerMaximum },
        },
      },
      CatalogSkuVersionExpectation: {
        type: 'object', required: ['expectedVersion'], additionalProperties: false,
        properties: { expectedVersion: { type: 'integer', minimum: 1, maximum: postgresIntegerMaximum } },
      },
      CatalogSku: {
        type: 'object',
        required: ['id', 'sku', 'collectionId', 'brandId', 'name', 'wholesalePrice', 'currency', 'minimumOrderQuantity', 'availableQuantity', 'reservedQuantity', 'availableToSell', 'status', 'version', 'publishedAt', 'createdAt', 'updatedAt'],
        additionalProperties: false,
        properties: {
          id: identifier,
          sku: { type: 'string', pattern: '^[A-Z0-9][A-Z0-9._-]{1,63}$' },
          collectionId: identifier,
          brandId: identifier,
          name: { type: 'string', minLength: 2, maxLength: 160 },
          wholesalePrice: { type: 'number', exclusiveMinimum: 0, maximum: moneyMaximum, multipleOf: 0.0001 },
          currency,
          minimumOrderQuantity: { type: 'integer', minimum: 1, maximum: postgresIntegerMaximum },
          availableQuantity: { type: 'integer', minimum: 0, maximum: postgresIntegerMaximum },
          reservedQuantity: { type: 'integer', minimum: 0, maximum: postgresIntegerMaximum },
          availableToSell: { type: 'integer', minimum: 0, maximum: postgresIntegerMaximum },
          status: { type: 'string', enum: ['draft', 'published'] },
          version: { type: 'integer', minimum: 1, maximum: postgresIntegerMaximum },
          publishedAt: nullableDateTime,
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CatalogSkuPage: {
        type: 'object', required: ['items', 'nextCursor'], additionalProperties: false,
        properties: {
          items: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/CatalogSku' } },
          nextCursor: { oneOf: [{ type: 'string', minLength: 1, maxLength: 2048 }, { type: 'null' }] },
        },
      },
      ShowroomCreate: {
        type: 'object', required: ['collectionId', 'brandId', 'name', 'opensAt', 'closesAt'], additionalProperties: false,
        properties: { collectionId: identifier, brandId: identifier, name: { type: 'string', minLength: 2, maxLength: 160 }, opensAt: dateOrDateTime, closesAt: dateOrDateTime },
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
          unitPrice: { type: 'number', exclusiveMinimum: 0, maximum: moneyMaximum, multipleOf: 0.0001 },
          currency,
          catalogVersion: { type: 'integer', minimum: 1, maximum: postgresIntegerMaximum },
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
      OrderTermsUpdate: {
        type: 'object', required: ['expectedVersion', 'terms'], additionalProperties: false,
        properties: {
          expectedVersion: { type: 'integer', minimum: 1, maximum: postgresIntegerMaximum },
          terms: { $ref: '#/components/schemas/OrderTerms' },
        },
      },
      OrderVersionExpectation: {
        type: 'object', required: ['expectedVersion'], additionalProperties: false,
        properties: { expectedVersion: { type: 'integer', minimum: 1, maximum: postgresIntegerMaximum } },
      },
      OrderAccept: {
        type: 'object', required: ['organisationId', 'expectedVersion'], additionalProperties: false,
        properties: {
          orderId: identifier,
          organisationId: identifier,
          expectedVersion: { type: 'integer', minimum: 1, maximum: postgresIntegerMaximum },
        },
      },
      OrderCancel: {
        type: 'object', required: ['reason', 'expectedVersion'], additionalProperties: false,
        properties: {
          orderId: identifier,
          reason: { type: 'string', minLength: 3, maxLength: 1000 },
          expectedVersion: { type: 'integer', minimum: 1, maximum: postgresIntegerMaximum },
        },
      },
      Notification: {
        type: 'object',
        required: ['id', 'sourceEventId', 'recipientOrganisationId', 'type', 'title', 'body', 'status', 'version', 'createdAt', 'updatedAt'],
        additionalProperties: false,
        properties: {
          id: identifier,
          dedupeKey: { type: 'string', minLength: 3, maxLength: 512 },
          sourceEventId: identifier,
          recipientOrganisationId: identifier,
          type: { type: 'string', enum: ['selection-submitted', 'order-terms-accepted', 'deal-opened'] },
          title: { type: 'string', minLength: 2, maxLength: 500 },
          body: { type: 'string', minLength: 2, maxLength: 5000 },
          status: { type: 'string', enum: ['unread', 'read'] },
          version: { type: 'integer', minimum: 1, maximum: postgresIntegerMaximum },
          createdAt: { type: 'string', format: 'date-time' },
          readAt: nullableDateTime,
          readBy: nullableIdentifier,
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      NotificationPage: {
        type: 'object', required: ['items', 'nextCursor', 'unreadCount'], additionalProperties: false,
        properties: {
          items: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/Notification' } },
          nextCursor: { oneOf: [{ type: 'string', minLength: 1, maxLength: 1024 }, { type: 'null' }] },
          unreadCount: {
            type: 'integer',
            minimum: 0,
            maximum: javascriptSafeIntegerMaximum,
            description: 'Exact unread notification count across every active organisation visible to the authenticated actor.',
          },
        },
      },
      WorkspacePageInfo: {
        type: 'object', required: ['limit', 'hasMore', 'truncatedSections', 'nextCursors'], additionalProperties: false,
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 500 },
          hasMore: { type: 'boolean' },
          truncatedSections: {
            type: 'array', uniqueItems: true,
            items: { type: 'string', enum: workspaceSections },
          },
          nextCursors: {
            type: 'object',
            description: 'Opaque continuation cursor for every truncated section. Property names are workspace section names.',
            propertyNames: { enum: workspaceSections },
            additionalProperties: { type: 'string', minLength: 1, maxLength: 2048 },
          },
        },
      },
      Workspace: {
        type: 'object',
        required: ['memberships', 'organisations', 'relationships', 'invitations', 'campaigns', 'collections', 'catalogSkus', 'showrooms', 'cycles', 'selections', 'orders', 'deals', 'calendar', 'pageInfo'],
        additionalProperties: false,
        properties: {
          memberships: { type: 'array', items: { type: 'object' } },
          organisations: { type: 'array', items: { type: 'object' } },
          relationships: { type: 'array', items: { type: 'object' } },
          invitations: { type: 'array', items: { type: 'object' } },
          campaigns: { type: 'array', items: { type: 'object' } },
          collections: { type: 'array', items: { type: 'object' } },
          catalogSkus: { type: 'array', items: { type: 'object' } },
          showrooms: { type: 'array', items: { type: 'object' } },
          cycles: { type: 'array', items: { type: 'object' } },
          selections: { type: 'array', items: { type: 'object' } },
          orders: { type: 'array', items: { type: 'object' } },
          deals: { type: 'array', items: { type: 'object' } },
          calendar: { type: 'array', items: { type: 'object' } },
          pageInfo: { $ref: '#/components/schemas/WorkspacePageInfo' },
        },
      },
      WorkspaceSectionPage: {
        type: 'object', required: ['items', 'nextCursor'], additionalProperties: false,
        properties: {
          items: { type: 'array', maxItems: 200, items: { type: 'object' } },
          nextCursor: { oneOf: [{ type: 'string', minLength: 1, maxLength: 2048 }, { type: 'null' }] },
        },
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
    '/catalog/skus': {
      get: {
        ...readOperation('pageCatalogSkus', { 200: 'Stable actor-scoped catalog page', 400: 'Invalid catalog filters, limit or cursor', 401: 'Authentication required' }),
        description: 'Returns a keyset-paginated catalog page. Brand members can read their own draft and published SKU; counterparties can read only published SKU from collections visible through their commercial workspace.',
        parameters: [
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
          { name: 'cursor', in: 'query', required: false, description: 'Opaque continuation cursor bound to the exact filter set.', schema: { type: 'string', minLength: 1, maxLength: 2048 } },
          { name: 'q', in: 'query', required: false, description: 'Case-insensitive SKU or product-name prefix.', schema: { type: 'string', minLength: 1, maxLength: 80 } },
          { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['draft', 'published'] } },
          { name: 'brandId', in: 'query', required: false, schema: identifier },
          { name: 'collectionId', in: 'query', required: false, schema: identifier },
        ],
        responses: responseContent(
          readOperation('pageCatalogSkus', { 200: 'Stable actor-scoped catalog page', 400: 'Invalid catalog filters, limit or cursor', 401: 'Authentication required' }).responses,
          200,
          '#/components/schemas/CatalogSkuPage',
        ),
      },
      post: operation('createCatalogSku', [], '#/components/schemas/CatalogSkuCreate'),
    },
    '/catalog/skus/{sku}': {
      get: {
        ...readOperation('getCatalogSku', { 200: 'Actor-scoped catalog SKU', 400: 'Invalid SKU', 401: 'Authentication required', 404: 'SKU is absent or not visible' }),
        parameters: [pathParameter('sku')],
        responses: responseContent(
          readOperation('getCatalogSku', { 200: 'Actor-scoped catalog SKU', 400: 'Invalid SKU', 401: 'Authentication required', 404: 'SKU is absent or not visible' }).responses,
          200,
          '#/components/schemas/CatalogSku',
        ),
      },
      patch: operation('updateCatalogSku', ['sku'], '#/components/schemas/CatalogSkuUpdate'),
    },
    '/catalog/skus/{sku}/publish': { post: operation('publishCatalogSku', ['sku'], '#/components/schemas/CatalogSkuVersionExpectation') },
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
    '/orders/{orderId}/terms': { patch: operation('reviseOrderTerms', ['orderId'], '#/components/schemas/OrderTermsUpdate') },
    '/orders/{orderId}/accept': { post: operation('acceptOrderTerms', ['orderId'], '#/components/schemas/OrderAccept') },
    '/orders/{orderId}/attach': { post: operation('attachOrderToCycle', ['orderId'], '#/components/schemas/OrderVersionExpectation') },
    '/orders/{orderId}/cancel': { post: operation('cancelOrder', ['orderId'], '#/components/schemas/OrderCancel') },
    '/workspace': {
      get: {
        ...readOperation('loadWorkspace', { 200: 'Bounded actor workspace', 400: 'Invalid workspace limit', 401: 'Authentication required' }),
        description: 'Returns one repeatable-read workspace bootstrap snapshot. Every collection is capped by limit; pageInfo.truncatedSections and pageInfo.nextCursors expose exact continuations for omitted records.',
        parameters: [{
          name: 'limit',
          in: 'query',
          required: false,
          description: 'Maximum records returned for each workspace collection. Continue every name reported by pageInfo.truncatedSections using its pageInfo.nextCursors entry and /workspace/{section}/page.',
          schema: { type: 'integer', minimum: 1, maximum: 500, default: 200 },
        }],
        responses: responseContent(
          readOperation('loadWorkspace', { 200: 'Bounded actor workspace', 400: 'Invalid workspace limit', 401: 'Authentication required' }).responses,
          200,
          '#/components/schemas/Workspace',
        ),
      },
    },
    '/workspace/{section}/page': {
      get: {
        ...readOperation('pageWorkspaceSection', { 200: 'Stable workspace section page', 400: 'Invalid section, limit or cursor', 401: 'Authentication required' }),
        description: 'Returns a keyset-paginated page for one visible workspace section. Cursors are versioned, section-bound and must be treated as opaque.',
        parameters: [
          {
            name: 'section',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: workspaceSections },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            description: 'Opaque continuation cursor returned by the same section endpoint.',
            schema: { type: 'string', minLength: 1, maxLength: 2048 },
          },
        ],
        responses: responseContent(
          readOperation('pageWorkspaceSection', { 200: 'Stable workspace section page', 400: 'Invalid section, limit or cursor', 401: 'Authentication required' }).responses,
          200,
          '#/components/schemas/WorkspaceSectionPage',
        ),
      },
    },
    '/notifications/page': {
      get: {
        ...readOperation('pageNotifications', { 200: 'Stable notification page with exact unread count', 400: 'Invalid limit or cursor', 401: 'Authentication required' }),
        description: 'Returns a stable notification keyset page and the exact unread count across all active organisations visible to the actor.',
        parameters: [
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
          { name: 'cursor', in: 'query', required: false, schema: { type: 'string', minLength: 1, maxLength: 1024 } },
        ],
        responses: responseContent(
          readOperation('pageNotifications', { 200: 'Stable notification page with exact unread count', 400: 'Invalid limit or cursor', 401: 'Authentication required' }).responses,
          200,
          '#/components/schemas/NotificationPage',
        ),
      },
    },
    '/notifications': {
      get: {
        ...readOperation('listNotifications', { 200: 'Notifications', 400: 'Invalid notification limit', 401: 'Authentication required' }),
        parameters: [{ name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 } }],
      },
    },
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

function responseContent(responses, status, schemaRef) {
  return {
    ...responses,
    [status]: { ...responses[status], content: { 'application/json': { schema: { $ref: schemaRef } } } },
  };
}

function standardResponses() {
  return {
    200: { description: 'Success' },
    400: { description: 'Invalid transport request' },
    401: { description: 'Authentication required' },
    403: { description: 'Capability denied' },
    404: { description: 'Resource or route not found' },
    409: { description: 'Conflict, including global idempotency-key reuse' },
    413: { description: 'Request body too large' },
    415: { description: 'Unsupported content type' },
    422: { description: 'Domain validation failed, including MOQ or availability failures' },
  };
}
