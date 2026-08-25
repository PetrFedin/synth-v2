import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const SUPPLIER_EDITABLE = ['legalName', 'countryCode', 'email', 'currency', 'incoterms', 'categories', 'leadTimeDays', 'minimumOrderQuantity', 'paymentTermsDays', 'auditExpiresAt', 'notes'];
const SUPPLIER_CREATE_BODY = listBody(bodyContract(['supplierCode', 'brandId', ...SUPPLIER_EDITABLE]), ['incoterms', 'categories']);
const SUPPLIER_UPDATE_BODY = listBody(bodyContract(['expectedVersion', ...SUPPLIER_EDITABLE]), ['incoterms', 'categories']);
const VERSION_BODY = bodyContract(['expectedVersion']);
const SUPPLIER_SUSPEND_BODY = bodyContract(['expectedVersion', 'reason']);
const RFQ_EDITABLE = ['targetQuantity', 'responseDueAt', 'deliveryDueAt', 'incoterm', 'supplierCodes', 'notes'];
const RFQ_CREATE_BODY = listBody(bodyContract(['rfqCode', 'sku', ...RFQ_EDITABLE]), ['supplierCodes']);
const PRODUCTION_RFQ_BODY = listBody(bodyContract(['rfqCode', 'responseDueAt', 'deliveryDueAt', 'incoterm', 'supplierCodes', 'notes']), ['supplierCodes']);
const RFQ_UPDATE_BODY = listBody(bodyContract(['expectedVersion', ...RFQ_EDITABLE]), ['supplierCodes']);
const QUOTE_BODY = bodyContract(['expectedVersion', 'supplierCode', 'unitPriceMinor', 'fixedCostMinor', 'leadTimeDays', 'minimumOrderQuantity', 'validUntil', 'notes']);
const AWARD_BODY = bodyContract(['expectedVersion', 'supplierCode']);
const ALLOCATION_BODY = bodyContract(['expectedVersion', 'purchaseOrderNumber', 'quantity', 'productionStartAt', 'deliveryDueAt', 'notes']);
const CANCEL_BODY = bodyContract(['expectedVersion', 'reason']);
const SUPPLIER_QUERY_FIELDS = Object.freeze(['limit', 'cursor', 'q', 'status', 'brandId', 'countryCode', 'category']);
const RFQ_QUERY_FIELDS = Object.freeze(['limit', 'cursor', 'q', 'status', 'brandId', 'sku', 'supplierCode', 'overdue']);

export function createSourcingRoutes({ sourcing } = {}) {
  const service = sourcing ?? unavailableSourcing();
  return Object.freeze([
    read('GET', /^\/v2\/suppliers$/, SUPPLIER_QUERY_FIELDS, ({ actorId, query }) => service.supplierPageForActor(actorId, query)),
    read('GET', /^\/v2\/suppliers\/([^/]+)$/, [], ({ actorId, params }) => service.supplierGetForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/suppliers$/, SUPPLIER_CREATE_BODY, ({ commandId, actorId, body }) => service.createSupplier(commandId, actorId, body)),
    mutate('PATCH', /^\/v2\/suppliers\/([^/]+)$/, SUPPLIER_UPDATE_BODY, ({ commandId, actorId, params, body }) => service.updateSupplier(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/suppliers\/([^/]+)\/qualify$/, VERSION_BODY, ({ commandId, actorId, params, body }) => service.qualifySupplier(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/suppliers\/([^/]+)\/suspend$/, SUPPLIER_SUSPEND_BODY, ({ commandId, actorId, params, body }) => service.suspendSupplier(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/suppliers\/([^/]+)\/archive$/, VERSION_BODY, ({ commandId, actorId, params, body }) => service.archiveSupplier(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/rfqs$/, RFQ_QUERY_FIELDS, ({ actorId, query }) => service.rfqPageForActor(actorId, query)),
    read('GET', /^\/v2\/rfqs\/([^/]+)$/, [], ({ actorId, params }) => service.rfqGetForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/rfqs$/, RFQ_CREATE_BODY, ({ commandId, actorId, body }) => service.createRfq(commandId, actorId, body)),
    mutate('POST', /^\/v2\/production-requirements\/([^/]+)\/lines\/([1-9][0-9]*)\/rfq$/, PRODUCTION_RFQ_BODY, ({ commandId, actorId, params, body }) => service.createRfqFromProductionRequirement(commandId, actorId, { ...body, productionRequirementSnapshotId: params[0], orderLineNo: positiveIntegerPath(params[1]) })),
    mutate('PATCH', /^\/v2\/rfqs\/([^/]+)$/, RFQ_UPDATE_BODY, ({ commandId, actorId, params, body }) => service.updateRfq(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/rfqs\/([^/]+)\/issue$/, VERSION_BODY, ({ commandId, actorId, params, body }) => service.issueRfq(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/rfqs\/([^/]+)\/quotes$/, QUOTE_BODY, ({ commandId, actorId, params, body }) => service.upsertQuote(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/rfqs\/([^/]+)\/award$/, AWARD_BODY, ({ commandId, actorId, params, body }) => service.awardRfq(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/rfqs\/([^/]+)\/allocate$/, ALLOCATION_BODY, ({ commandId, actorId, params, body }) => service.allocateRfq(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/rfqs\/([^/]+)\/cancel$/, CANCEL_BODY, ({ commandId, actorId, params, body }) => service.cancelRfq(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: true,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      if (typeof contract === 'function') contract(context.body);
      else assertBodyContract(context.body, contract);
      return execute(context);
    },
  });
}
function read(method, pattern, queryFields, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: false,
    execute(context) {
      assertQueryContract(context.query ?? {}, queryFields);
      return execute(context);
    },
  });
}
function listBody(contract, fields) {
  return (body) => {
    assertBodyContract(body, contract);
    for (const field of fields) {
      invariant(Array.isArray(body[field]), 'HTTP_BODY_FIELD_INVALID', `${field} must be a JSON array`, { field });
      body[field].forEach((item, index) => invariant(typeof item === 'string', 'HTTP_BODY_FIELD_INVALID', `${field}[${index}] must be a string`, { field, index }));
    }
    return body;
  };
}
function positiveIntegerPath(value) {
  const parsed = Number(value);
  invariant(Number.isSafeInteger(parsed) && parsed > 0, 'HTTP_PATH_PARAMETER_INVALID', 'Production requirement order line number must be a positive integer', { value });
  return parsed;
}
function unavailableSourcing() {
  const fail = () => invariant(false, 'SOURCING_SERVICE_REQUIRED', 'Sourcing service is required');
  return Object.freeze({
    supplierPageForActor: fail, supplierGetForActor: fail, createSupplier: fail, updateSupplier: fail,
    qualifySupplier: fail, suspendSupplier: fail, archiveSupplier: fail, rfqPageForActor: fail,
    rfqGetForActor: fail, createRfq: fail, createRfqFromProductionRequirement: fail, updateRfq: fail, issueRfq: fail, upsertQuote: fail,
    awardRfq: fail, allocateRfq: fail, cancelRfq: fail,
  });
}