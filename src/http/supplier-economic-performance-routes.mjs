import { invariant } from '../core/errors.mjs';
import { assertQueryContract } from './request-contract.mjs';

export function createSupplierEconomicPerformanceRoutes({ supplierPerformance } = {}) {
  const service = supplierPerformance ?? unavailable();
  return Object.freeze([
    Object.freeze({
      method: 'GET',
      pattern: /^\/v2\/suppliers\/([^/]+)\/economic-performance$/,
      mutation: false,
      execute(context) {
        assertQueryContract(context.query ?? {}, []);
        return service.getSupplierEconomicPerformanceForActor(context.actorId, context.params[0]);
      },
    }),
  ]);
}

function unavailable() {
  return Object.freeze({
    getSupplierEconomicPerformanceForActor() {
      invariant(false, 'SUPPLIER_PERFORMANCE_SERVICE_REQUIRED', 'Supplier economic performance service is required');
    },
  });
}
