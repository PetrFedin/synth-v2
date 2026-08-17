import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const ADDRESS_FIELDS = ['countryCode', 'postalCode', 'city', 'region', 'line1', 'line2'];
const CREATE_BODY = bodyContract(['shopId', 'code', 'name', 'shipToAddress', 'billToAddress'], { shipToAddress: ADDRESS_FIELDS, billToAddress: ADDRESS_FIELDS });
const UPDATE_BODY = bodyContract(['expectedVersion', 'name', 'shipToAddress', 'billToAddress'], { shipToAddress: ADDRESS_FIELDS, billToAddress: ADDRESS_FIELDS });
const VERSION_BODY = bodyContract(['expectedVersion']);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export function createRetailDoorRoutes({ retailDoors } = {}) {
  const service = retailDoors ?? unavailableRetailDoors();
  return Object.freeze([
    read('GET', /^\/v2\/shops\/([^/]+)\/doors$/, ({ actorId, params }) => {
      assertId(params[0], 'shopId');
      return service.listRetailDoorsForActor(actorId, params[0]);
    }),
    mutate('POST', /^\/v2\/shops\/([^/]+)\/doors$/, CREATE_BODY, ({ commandId, actorId, params, body }) => {
      assertId(params[0], 'shopId');
      invariant(body.shopId === params[0], 'HTTP_IDENTIFIER_MISMATCH', 'shopId in request body must match the route', { field: 'shopId' });
      return service.createRetailDoor(commandId, actorId, { ...body, shopId: params[0] });
    }),
    read('GET', /^\/v2\/retail-doors\/([^/]+)$/, ({ actorId, params }) => {
      assertId(params[0], 'retailDoorId');
      return service.getRetailDoorForActor(actorId, params[0]);
    }),
    mutate('PATCH', /^\/v2\/retail-doors\/([^/]+)$/, UPDATE_BODY, ({ commandId, actorId, params, body }) => {
      assertId(params[0], 'retailDoorId');
      requireVersion(body.expectedVersion);
      return service.updateRetailDoor(commandId, actorId, params[0], body);
    }),
    mutate('POST', /^\/v2\/retail-doors\/([^/]+)\/deactivate$/, VERSION_BODY, ({ commandId, actorId, params, body }) => {
      assertId(params[0], 'retailDoorId');
      requireVersion(body.expectedVersion);
      return service.deactivateRetailDoor(commandId, actorId, params[0], body);
    }),
    mutate('POST', /^\/v2\/retail-doors\/([^/]+)\/reactivate$/, VERSION_BODY, ({ commandId, actorId, params, body }) => {
      assertId(params[0], 'retailDoorId');
      requireVersion(body.expectedVersion);
      return service.reactivateRetailDoor(commandId, actorId, params[0], body);
    }),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) {
    assertQueryContract(context.query ?? {}, []);
    assertBodyContract(context.body, contract);
    return execute(context);
  } });
}
function read(method, pattern, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) {
    assertQueryContract(context.query ?? {}, []);
    return execute(context);
  } });
}
function assertId(value, field) {
  invariant(typeof value === 'string' && SAFE_ID.test(value), 'HTTP_PATH_PARAMETER_INVALID', `${field} must be a valid identifier`, { field });
}
function requireVersion(value) {
  invariant(Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647, 'HTTP_BODY_FIELD_INVALID', 'expectedVersion must be a positive PostgreSQL integer', { field: 'expectedVersion' });
}
function unavailableRetailDoors() {
  const fail = () => invariant(false, 'RETAIL_DOOR_SERVICE_REQUIRED', 'Retail door service is required');
  return Object.freeze({ createRetailDoor: fail, updateRetailDoor: fail, deactivateRetailDoor: fail, reactivateRetailDoor: fail, getRetailDoorForActor: fail, listRetailDoorsForActor: fail });
}
