import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const CREATE_BODY = bodyContract(['split'], {}, { split: ['triggerEvent', 'shareBasisPoints', 'labelRu', 'labelEn'] });
const PAY_BODY = bodyContract(['expectedVersion', 'sequence', 'paidAt', 'reference']);

export function createSupplierPaymentRoutes({ supplierPayments } = {}) {
  const service = supplierPayments ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/payment-schedules$/, ({ actorId }) => service.paymentSchedulesForActor(actorId)),
    read('GET', /^\/v2\/production-orders\/([^/]+)\/payment-schedule$/, ({ actorId, params }) => service.paymentScheduleForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/production-orders\/([^/]+)\/payment-schedule$/, CREATE_BODY, ({ commandId, actorId, params, body }) => service.createSchedule(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/production-orders\/([^/]+)\/payment-schedule\/payments$/, PAY_BODY, ({ commandId, actorId, params, body }) => service.recordPayment(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); assertBodyContract(context.body, contract); return execute(context); } });
}
function read(method, pattern, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, []); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'PAYMENT_SERVICE_REQUIRED', 'Supplier payment service is required');
  return Object.freeze({ paymentSchedulesForActor: fail, paymentScheduleForActor: fail, createSchedule: fail, recordPayment: fail });
}
