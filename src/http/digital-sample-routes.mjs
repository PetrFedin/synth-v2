import { invariant } from '../core/errors.mjs';
import { DIGITAL_SAMPLE_INPUT_FIELDS, SCENARIO_FIELDS, digitalSampleId, normalizeDigitalSamplePage } from '../modules/digital-samples/public.mjs';

/** @param {any} [options] */
export function createDigitalSampleRoutes({ digitalSamples } = {}) {
  const unavailable = () => invariant(false, 'DIGITAL_SAMPLE_SERVICE_REQUIRED', 'Digital sample registry unavailable');
  const service = digitalSamples ?? new Proxy({}, { get: () => unavailable });
  return Object.freeze([
    route('POST', /^\/v2\/product\/style-versions\/([^/]+)\/digital-samples$/, DIGITAL_SAMPLE_INPUT_FIELDS, false,
      c => service.create(c.commandId, c.actorId, id(c), c.body)),
    route('GET', /^\/v2\/product\/style-versions\/([^/]+)\/digital-samples$/, null, true,
      c => service.list(c.actorId, id(c), page(c))),
    route('POST', /^\/v2\/digital-sample-series\/([^/]+)\/versions$/, [...DIGITAL_SAMPLE_INPUT_FIELDS, 'expectedHeadId'], false,
      c => { const { expectedHeadId, ...input } = c.body; return service.append(c.commandId,c.actorId,id(c),expectedHeadId,input); }),
    route('GET', /^\/v2\/digital-sample-series\/([^/]+)\/versions$/, null, true,
      c => service.history(c.actorId, id(c), page(c))),
    route('GET', /^\/v2\/digital-sample-versions\/([^/]+)$/, null, false,
      c => service.get(c.actorId, id(c))),
    route('POST', /^\/v2\/digital-sample-versions\/([^/]+)\/scenarios$/, SCENARIO_FIELDS, false,
      c => service.createScenario(c.commandId, c.actorId, id(c), c.body)),
    route('GET', /^\/v2\/digital-sample-versions\/([^/]+)\/scenarios$/, null, true,
      c => service.listScenarios(c.actorId, id(c), page(c))),
  ]);
}
function id(c) {
  let decoded;
  try { decoded = decodeURIComponent(c.params[0]); } catch {
    invariant(false, 'DIGITAL_SAMPLE_ID_INVALID', 'Malformed path identifier');
  }
  return digitalSampleId(decoded);
}
function page(c) {
  const q = c.query ?? {};
  invariant(q.limit === undefined || (typeof q.limit === 'string' && /^[1-9][0-9]{0,2}$/.test(q.limit)),
    'DIGITAL_SAMPLE_PAGE_INVALID', 'Invalid page size');
  return normalizeDigitalSamplePage({
    limit: q.limit === undefined ? 50 : Number(q.limit), afterId: q.afterId ?? null,
  });
}
function route(method, pattern, fields, paged, execute) {
  return Object.freeze({
    method, pattern, mutation: method === 'POST',
    execute(c) {
      const queryFields = paged ? ['limit','afterId'] : [];
      invariant(Object.keys(c.query ?? {}).every(key => queryFields.includes(key)),
        'HTTP_QUERY_FIELD_UNKNOWN', 'Unknown query field');
      if (fields) {
        invariant(c.body && Object.getPrototypeOf(c.body) === Object.prototype,
          'HTTP_BODY_FIELD_INVALID', 'JSON object required');
        invariant(Object.keys(c.body).every(key => fields.includes(key)),
          'HTTP_BODY_FIELD_UNKNOWN', 'Unknown body field');
      }
      return execute(c);
    },
  });
}
