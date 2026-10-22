import { invariant } from '../core/errors.mjs';
import { DIGITAL_SAMPLE_INPUT_FIELDS, SCENARIO_FIELDS, digitalSampleId, normalizeDigitalSamplePage } from '../modules/digital-samples/public.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';
import { decodePathParameter } from './transport-contract.mjs';

const MANIFEST_REQUIRED = DIGITAL_SAMPLE_INPUT_FIELDS.filter(field => field !== 'note');
const MANIFEST = required(bodyContract(DIGITAL_SAMPLE_INPUT_FIELDS), MANIFEST_REQUIRED);
const APPEND = required(
  bodyContract([...DIGITAL_SAMPLE_INPUT_FIELDS, 'expectedHeadId']),
  [...MANIFEST_REQUIRED, 'expectedHeadId'],
);
const SCENARIO = required(bodyContract(SCENARIO_FIELDS), SCENARIO_FIELDS);

/** @param {any} [options] */
export function createDigitalSampleRoutes({ digitalSamples } = {}) {
  const unavailable = () => invariant(false, 'DIGITAL_SAMPLE_SERVICE_REQUIRED', 'Digital sample registry unavailable');
  const service = digitalSamples ?? new Proxy({}, { get: () => unavailable });
  return Object.freeze([
    mutate('POST', /^\/v2\/product\/style-versions\/([^/]+)\/digital-samples$/, MANIFEST,
      ({ commandId, actorId, params, body }) => service.create(commandId, actorId, id(params[0]), body)),
    read('GET', /^\/v2\/product\/style-versions\/([^/]+)\/digital-samples$/, ['limit','afterId'],
      ({ actorId, params, query }) => service.list(actorId, id(params[0]), page(query))),
    mutate('POST', /^\/v2\/digital-sample-series\/([^/]+)\/versions$/, APPEND,
      ({ commandId, actorId, params, body }) => {
        const { expectedHeadId, ...input } = body;
        return service.append(commandId, actorId, id(params[0]), expectedHeadId, input);
      }),
    read('GET', /^\/v2\/digital-sample-series\/([^/]+)\/versions$/, ['limit','afterId'],
      ({ actorId, params, query }) => service.history(actorId, id(params[0]), page(query))),
    read('GET', /^\/v2\/digital-sample-versions\/([^/]+)$/, [],
      ({ actorId, params }) => service.get(actorId, id(params[0]))),
    mutate('POST', /^\/v2\/digital-sample-versions\/([^/]+)\/scenarios$/, SCENARIO,
      ({ commandId, actorId, params, body }) => service.createScenario(commandId, actorId, id(params[0]), body)),
    read('GET', /^\/v2\/digital-sample-versions\/([^/]+)\/scenarios$/, ['limit','afterId'],
      ({ actorId, params, query }) => service.listScenarios(actorId, id(params[0]), page(query))),
  ]);
}

function id(raw) {
  return digitalSampleId(decodePathParameter(raw));
}

function page(query = {}) {
  invariant(query.limit === undefined || (typeof query.limit === 'string' && /^[1-9][0-9]{0,2}$/.test(query.limit)),
    'DIGITAL_SAMPLE_PAGE_INVALID', 'Invalid page size');
  return normalizeDigitalSamplePage({
    limit: query.limit === undefined ? 50 : Number(query.limit),
    afterId: query.afterId ?? null,
  });
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({
    method, pattern, mutation: true,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      contract(context.body);
      return execute(context);
    },
  });
}

function read(method, pattern, queryFields, execute) {
  return Object.freeze({
    method, pattern, mutation: false,
    execute(context) {
      assertQueryContract(context.query ?? {}, queryFields);
      return execute(context);
    },
  });
}

function required(contract, fields) {
  return body => {
    assertBodyContract(body, contract);
    for (const field of fields) {
      invariant(Object.hasOwn(body, field) && body[field] !== undefined,
        'HTTP_BODY_FIELD_INVALID', field + ' is required', { field });
    }
    return body;
  };
}
