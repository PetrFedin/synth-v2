import { edit, replaceOnce } from './order-patch-utils.mjs';

await edit('src/http/api.mjs', source => replaceOnce(
  source,
  "    'CATALOG_PUBLISH_INVALID',\n    'AUTH_EMAIL_INVALID',",
  "    'CATALOG_PUBLISH_INVALID',\n    'ORDER_EXPECTED_VERSION_INVALID',\n    'AUTH_EMAIL_INVALID',",
  'HTTP order validation status',
));

await edit('src/http/openapi.mjs', source => {
  let updated = replaceOnce(
    source,
    "info: { title: 'Syntha Wholesale V2 API', version: '1.6.0' }",
    "info: { title: 'Syntha Wholesale V2 API', version: '1.7.0' }",
    'OpenAPI version',
  );
  updated = replaceOnce(
    updated,
`      OrderAccept: {
        type: 'object', required: ['organisationId'], additionalProperties: false,
        properties: { orderId: identifier, organisationId: identifier },
      },
      OrderCancel: {
        type: 'object', required: ['reason'], additionalProperties: false,
        properties: { orderId: identifier, reason: { type: 'string', minLength: 3, maxLength: 1000 } },
      },`,
`      OrderTermsUpdate: {
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
      },`,
    'OpenAPI order schemas',
  );
  return replaceOnce(
    updated,
`    '/orders': { post: operation('createOrderDraft', [], '#/components/schemas/OrderCreate') },
    '/orders/{orderId}/accept': { post: operation('acceptOrderTerms', ['orderId'], '#/components/schemas/OrderAccept') },
    '/orders/{orderId}/attach': { post: operation('attachOrderToCycle', ['orderId']) },
    '/orders/{orderId}/cancel': { post: operation('cancelOrder', ['orderId'], '#/components/schemas/OrderCancel') },`,
`    '/orders': { post: operation('createOrderDraft', [], '#/components/schemas/OrderCreate') },
    '/orders/{orderId}/terms': { patch: operation('reviseOrderTerms', ['orderId'], '#/components/schemas/OrderTermsUpdate') },
    '/orders/{orderId}/accept': { post: operation('acceptOrderTerms', ['orderId'], '#/components/schemas/OrderAccept') },
    '/orders/{orderId}/attach': { post: operation('attachOrderToCycle', ['orderId'], '#/components/schemas/OrderVersionExpectation') },
    '/orders/{orderId}/cancel': { post: operation('cancelOrder', ['orderId'], '#/components/schemas/OrderCancel') },`,
    'OpenAPI order paths',
  );
});
