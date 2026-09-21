import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const DEFECT_TYPE_BODY = bodyContract(['brandId', 'code', 'severity', 'originStage', 'nameRu', 'nameEn']);
const CHECK_BODY = bodyContract(['milestoneCode', 'checkedQuantity', 'inspectorName', 'defects', 'notes'], {}, { defects: ['defectCode', 'quantity', 'notes'] });
const DISPOSITION_BODY = bodyContract(['expectedVersion', 'disposition', 'notes']);
const RETIRE_BODY = bodyContract(['brandId']);

export function createInlineQualityRoutes({ inlineQuality } = {}) {
  const service = inlineQuality ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/defect-types$/, ({ actorId }) => service.defectTypesForActor(actorId)),
    read('GET', /^\/v2\/production-executions\/([^/]+)\/inline-quality-checks$/, ({ actorId, params }) => service.checksForExecution(actorId, params[0])),
    mutate('POST', /^\/v2\/defect-types$/, DEFECT_TYPE_BODY, ({ commandId, actorId, body }) => service.registerDefectType(commandId, actorId, body)),
    mutate('POST', /^\/v2\/defect-types\/([^/]+)\/retire$/, RETIRE_BODY, ({ commandId, actorId, params, body }) => service.retireDefectType(commandId, actorId, body.brandId, params[0])),
    mutate('POST', /^\/v2\/production-executions\/([^/]+)\/inline-quality-checks$/, CHECK_BODY, ({ commandId, actorId, params, body }) => service.recordCheck(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/inline-quality-checks\/([^/]+)\/disposition$/, DISPOSITION_BODY, ({ commandId, actorId, params, body }) => service.disposition(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); assertBodyContract(context.body, contract); return execute(context); } });
}
function read(method, pattern, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, []); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'INLINE_QC_SERVICE_REQUIRED', 'Inline quality service is required');
  return Object.freeze({ defectTypesForActor: fail, checksForExecution: fail, registerDefectType: fail, retireDefectType: fail, recordCheck: fail, disposition: fail });
}
