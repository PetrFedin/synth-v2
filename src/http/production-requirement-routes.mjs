import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const EMPTY_BODY = bodyContract();

export function createProductionRequirementRoutes({ productionRequirements } = {}) {
  const service = productionRequirements ?? unavailable();
  return Object.freeze([
    mutate(
      'POST',
      /^\/v2\/orders\/([^/]+)\/supply-commitments\/([^/]+)\/production-requirement$/,
      EMPTY_BODY,
      ({ commandId, actorId, params }) => service.createFromSupplyCommitment(commandId, actorId, params[0], params[1]),
    ),
    read(
      'GET',
      /^\/v2\/production-requirements\/([^/]+)$/,
      ({ actorId, params }) => service.getForActor(actorId, params[0]),
    ),
    read(
      'GET',
      /^\/v2\/supply-commitments\/([^/]+)\/production-requirement$/,
      ({ actorId, params }) => service.getBySupplyCommitmentForActor(actorId, params[0]),
    ),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: true,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      assertBodyContract(context.body, contract);
      return execute(context);
    },
  });
}
function read(method, pattern, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: false,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      return execute(context);
    },
  });
}
function unavailable() {
  const fail = () => invariant(false, 'PRODUCTION_REQUIREMENT_SERVICE_REQUIRED', 'Production requirement service is required');
  return Object.freeze({ createFromSupplyCommitment: fail, getForActor: fail, getBySupplyCommitmentForActor: fail });
}
