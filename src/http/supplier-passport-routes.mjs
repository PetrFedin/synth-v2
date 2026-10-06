import { invariant } from '../core/errors.mjs';
import { assertQueryContract } from './request-contract.mjs';

export function createSupplierPassportRoutes({ supplierPassport } = {}) {
  const service = supplierPassport ?? unavailable();
  return Object.freeze([
    Object.freeze({
      method: 'GET',
      pattern: /^\/v2\/suppliers\/([^/]+)\/passport$/,
      mutation: false,
      execute(context) {
        assertQueryContract(context.query ?? {}, []);
        return service.getSupplierPassportForActor(context.actorId, context.params[0]);
      },
    }),
  ]);
}

function unavailable() {
  return Object.freeze({
    getSupplierPassportForActor() {
      invariant(false, 'SUPPLIER_PASSPORT_SERVICE_REQUIRED', 'Supplier passport service is required');
    },
  });
}
