import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';
import { decodePathParameter } from './transport-contract.mjs';

const ENTITY_FIELDS = ['type','id','version','contentHash'];
const POLICY_BODY = bodyContract(['id','ownerOrganisationId','name','status','responseMinutes','resolutionMinutes','escalationMinutes','applicability'], { applicability: ['categories','severities','blockingOnly'] });
const POLICY_RETIRE_BODY = bodyContract(['actingOrganisationId']);
const OPEN_BODY = bodyContract([
  'ownerOrganisationId','entity','category','severity','blocking','ownerRole','ownerUserId','threadId',
  'calendarMilestoneId','slaPolicyId','slaPolicyVersion','recoveryAction','businessImpact','sourceEventId',
], { entity: ENTITY_FIELDS });
const ASSIGN_BODY = bodyContract(['actingOrganisationId','expectedVersion','ownerUserId']);
const WAIT_BODY = bodyContract(['actingOrganisationId','expectedVersion','waitingFor','note']);
const ESCALATE_BODY = bodyContract(['actingOrganisationId','expectedVersion','reason','ownerRole','ownerUserId']);
const RESOLVE_BODY = bodyContract(['actingOrganisationId','expectedVersion','resolution','evidenceRefs']);
const ACCEPT_RISK_BODY = bodyContract(['actingOrganisationId','expectedVersion','decisionId']);
const CLOSE_BODY = bodyContract(['actingOrganisationId','expectedVersion']);

/** @param {{ operationalExceptions?: any }} [options] */
export function createOperationalExceptionRoutes({ operationalExceptions } = {}) {
  const service = operationalExceptions ?? unavailable();
  return Object.freeze([
    mutation('POST', /^\/v2\/operational\/sla-policies$/, POLICY_BODY, (context) =>
      service.createSlaPolicy(context.commandId, context.actorId, context.body)),
    mutation('POST', /^\/v2\/operational\/sla-policies\/([^/]+)\/retire$/, POLICY_RETIRE_BODY, (context) =>
      service.retireSlaPolicy(context.commandId, context.actorId, decodePathParameter(context.params?.[0]), context.body)),
    mutation('POST', /^\/v2\/operational\/exceptions$/, OPEN_BODY, (context) =>
      service.openException(context.commandId, context.actorId, context.body)),
    Object.freeze({
      method:'GET',
      pattern:/^\/v2\/operational\/exceptions\/([^/]+)$/,
      mutation:false,
      execute(context) {
        assertQueryContract(context.query ?? {}, []);
        return service.getForActor(context.actorId, decodePathParameter(context.params?.[0]));
      },
    }),
    Object.freeze({
      method:'GET',
      pattern:/^\/v2\/operational\/entities\/([^/]+)\/([^/]+)\/exceptions$/,
      mutation:false,
      execute(context) {
        assertQueryContract(context.query ?? {}, []);
        return service.listForEntity(context.actorId, decodePathParameter(context.params?.[0]), decodePathParameter(context.params?.[1]));
      },
    }),
    mutation('POST', /^\/v2\/operational\/exceptions\/([^/]+)\/assign$/, ASSIGN_BODY, (context) =>
      service.assign(context.commandId, context.actorId, decodePathParameter(context.params?.[0]), context.body)),
    mutation('POST', /^\/v2\/operational\/exceptions\/([^/]+)\/wait$/, WAIT_BODY, (context) =>
      service.wait(context.commandId, context.actorId, decodePathParameter(context.params?.[0]), context.body)),
    mutation('POST', /^\/v2\/operational\/exceptions\/([^/]+)\/escalate$/, ESCALATE_BODY, (context) =>
      service.escalate(context.commandId, context.actorId, decodePathParameter(context.params?.[0]), context.body)),
    mutation('POST', /^\/v2\/operational\/exceptions\/([^/]+)\/resolve$/, RESOLVE_BODY, (context) =>
      service.resolve(context.commandId, context.actorId, decodePathParameter(context.params?.[0]), context.body)),
    mutation('POST', /^\/v2\/operational\/exceptions\/([^/]+)\/accept-risk$/, ACCEPT_RISK_BODY, (context) =>
      service.acceptRisk(context.commandId, context.actorId, decodePathParameter(context.params?.[0]), context.body)),
    mutation('POST', /^\/v2\/operational\/exceptions\/([^/]+)\/close$/, CLOSE_BODY, (context) =>
      service.close(context.commandId, context.actorId, decodePathParameter(context.params?.[0]), context.body)),
  ]);
}

function mutation(method, pattern, contract, execute) {
  return Object.freeze({
    method, pattern, mutation:true,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      assertBodyContract(context.body, contract);
      if (context.body?.evidenceRefs !== undefined) {
        invariant(Array.isArray(context.body.evidenceRefs) && context.body.evidenceRefs.every((v) => typeof v === 'string'), 'HTTP_BODY_FIELD_INVALID', 'evidenceRefs must be a string array');
      }
      return execute(context);
    },
  });
}
function unavailable() {
  const fail=()=>invariant(false,'OPERATIONAL_EXCEPTION_SERVICE_REQUIRED','Operational exception service is required');
  return Object.freeze({createSlaPolicy:fail,retireSlaPolicy:fail,openException:fail,getForActor:fail,listForEntity:fail,assign:fail,wait:fail,escalate:fail,resolve:fail,acceptRisk:fail,close:fail});
}
