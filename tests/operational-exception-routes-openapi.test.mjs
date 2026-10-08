import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationalExceptionRoutes } from '../src/http/operational-exception-routes.mjs';
import { withOperationalExceptionOpenApi } from '../src/http/operational-exception-openapi.mjs';
import { wholesaleV2OpenApi } from '../src/http/openapi.mjs';

test('operational exception routes expose one governed lifecycle and SLA authority', () => {
  const calls=[];
  const service=new Proxy({}, { get:(_target,name)=>(...args)=>{calls.push([name,...args]);return {ok:true};} });
  const routes=createOperationalExceptionRoutes({ operationalExceptions:service });
  const patterns=routes.map((route)=>String(route.pattern));
  for(const expected of ['sla-policies','exceptions','assign','wait','escalate','resolve','accept-risk','close']) {
    assert.ok(patterns.some((pattern)=>pattern.includes(expected)), expected);
  }
});

test('operational exception OpenAPI publishes lifecycle, SLA and entity projection paths', () => {
  const spec=withOperationalExceptionOpenApi(wholesaleV2OpenApi);
  for(const path of [
    '/operational/sla-policies',
    '/operational/sla-policies/{policyId}/retire',
    '/operational/exceptions',
    '/operational/exceptions/{exceptionId}',
    '/operational/entities/{entityType}/{entityId}/exceptions',
    '/operational/exceptions/{exceptionId}/accept-risk',
  ]) assert.ok(spec.paths[path], path);
  assert.ok(spec.components.schemas.OperationalException);
  assert.ok(spec.components.schemas.OperationalSlaPolicy);
  assert.ok(spec.components.schemas.OperationalExceptionTransition);
});


test('recovery route refuses an empty evidence set before the service is called', () => {
  let called = false;
  const service = new Proxy({}, { get: () => () => { called = true; return { ok: true }; } });
  const route = createOperationalExceptionRoutes({ operationalExceptions: service })
    .find((candidate) => String(candidate.pattern).includes('resolve'));
  assert.throws(
    () => route.execute({
      actorId: 'user-1',
      commandId: 'cmd-1',
      params: ['ex-1'],
      query: {},
      body: { actingOrganisationId: 'org-1', expectedVersion: 2, resolution: 'Recovered.', evidenceRefs: [] },
    }),
    (error) => error.code === 'HTTP_BODY_FIELD_INVALID',
  );
  assert.equal(called, false);
});

test('OperationalException schema exposes the persisted SLA breach checkpoint', () => {
  const spec = withOperationalExceptionOpenApi(wholesaleV2OpenApi);
  assert.ok(spec.components.schemas.OperationalException.properties.slaBreachedAt);
});
