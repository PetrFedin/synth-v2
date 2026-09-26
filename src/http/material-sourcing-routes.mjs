import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const RFQ_EDITABLE = ['targetQuantity', 'unit', 'responseDueAt', 'deliveryDueAt', 'incoterm', 'supplierCodes', 'notes'];
const RFQ_CREATE_BODY = listBody(bodyContract(['rfqCode', 'materialCode', ...RFQ_EDITABLE]), ['supplierCodes']);
const RFQ_UPDATE_BODY = listBody(bodyContract(['expectedVersion', ...RFQ_EDITABLE]), ['supplierCodes']);
const VERSION_BODY = bodyContract(['expectedVersion']);
const QUOTE_BODY = bodyContract(['expectedVersion', 'supplierCode', 'currency', 'unitPriceMinor', 'fixedCostMinor', 'leadTimeDays', 'minimumOrderQuantity', 'validUntil', 'notes']);
const AWARD_BODY = bodyContract(['expectedVersion', 'supplierCode']);
const ALLOCATION_BODY = bodyContract(['expectedVersion', 'purchaseOrderNumber', 'quantity', 'orderPlacedAt', 'deliveryDueAt', 'notes']);
const CANCEL_BODY = bodyContract(['expectedVersion', 'reason']);

export function createMaterialSourcingRoutes({ materialSourcing } = {}) {
  const service = materialSourcing ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/material-rfqs\/([^/]+)$/, [], ({ actorId, params }) => service.getForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/material-rfqs$/, RFQ_CREATE_BODY, ({ commandId, actorId, body }) => service.createRfq(commandId, actorId, body)),
    mutate('PATCH', /^\/v2\/material-rfqs\/([^/]+)$/, RFQ_UPDATE_BODY, ({ commandId, actorId, params, body }) => service.updateRfq(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/material-rfqs\/([^/]+)\/issue$/, VERSION_BODY, ({ commandId, actorId, params, body }) => service.issueRfq(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/material-rfqs\/([^/]+)\/quotes$/, QUOTE_BODY, ({ commandId, actorId, params, body }) => service.upsertQuote(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/material-rfqs\/([^/]+)\/award$/, AWARD_BODY, ({ commandId, actorId, params, body }) => service.awardRfq(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/material-rfqs\/([^/]+)\/allocate$/, ALLOCATION_BODY, ({ commandId, actorId, params, body }) => service.allocateRfq(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/material-rfqs\/([^/]+)\/cancel$/, CANCEL_BODY, ({ commandId, actorId, params, body }) => service.cancelRfq(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({
    method, pattern, mutation: true,
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
    method, pattern, mutation: false,
    execute(context) { assertQueryContract(context.query ?? {}, queryFields); return execute(context); },
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
function unavailable() {
  const fail = () => invariant(false, 'MATERIAL_SOURCING_SERVICE_REQUIRED', 'Material sourcing service is required');
  return Object.freeze({ getForActor: fail, createRfq: fail, updateRfq: fail, issueRfq: fail, upsertQuote: fail, awardRfq: fail, allocateRfq: fail, cancelRfq: fail });
}
