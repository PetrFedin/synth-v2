import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const EMPTY_BODY = bodyContract([]);

export function createInventoryRoutes({ inventory } = {}) {
  const service = inventory ?? unavailableInventory();
  return Object.freeze([
    Object.freeze({
      method: 'POST',
      pattern: /^\/v2\/receipts\/([^/]+)\/inventory-postings$/,
      mutation: true,
      execute(context) {
        assertQueryContract(context.query ?? {}, []);
        assertBodyContract(context.body ?? {}, EMPTY_BODY);
        return service.postReceipt(context.commandId, context.actorId, context.params[0]);
      },
    }),
    Object.freeze({
      method: 'GET',
      pattern: /^\/v2\/shops\/([^/]+)\/warehouse-locations\/([^/]+)\/positions$/,
      mutation: false,
      execute(context) {
        assertQueryContract(context.query ?? {}, ['sku']);
        const sku = context.query?.sku ?? null;
        if (sku !== null) requiredString(sku, 'sku', 1, 160);
        return service.getWarehousePositionsForActor(context.actorId, context.params[0], context.params[1], { sku });
      },
    }),
  ]);
}

function requiredString(value, field, min, max) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  invariant(normalized.length >= min && normalized.length <= max, 'HTTP_QUERY_FIELD_INVALID', `${field} must contain ${min} to ${max} characters`, { field });
}
function unavailableInventory() {
  const fail = () => invariant(false, 'INVENTORY_SERVICE_REQUIRED', 'Inventory service is required');
  return Object.freeze({ postReceipt: fail, getWarehousePositionsForActor: fail });
}
