import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationalCollaborationRoutes } from '../src/http/operational-collaboration-routes.mjs';
import { matchWholesaleRoute } from '../src/http/routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

function fixture() {
  const calls = [];
  const operationalCollaboration = {
    forEntity: async (...args) => { calls.push(['read', ...args]); return { entity: { type: args[1], id: args[2], version: null, contentHash: null }, threads: [], decisions: [] }; },
    createThread: async (...args) => { calls.push(['create', ...args]); return { id: 'thread-1' }; },
    postMessage: async (...args) => { calls.push(['message', ...args]); return { id: 'message-1' }; },
    resolveThread: async (...args) => { calls.push(['resolve', ...args]); return { id: args[2], status: 'resolved' }; },
    archiveThread: async (...args) => { calls.push(['archive', ...args]); return { id: args[2], status: 'archived' }; },
    recordDecision: async (...args) => { calls.push(['decision', ...args]); return { id: 'decision-1' }; },
  };
  return { calls, routes: createOperationalCollaborationRoutes({ operationalCollaboration }) };
}

test('operational collaboration routes expose contextual read, threads, messages and decisions', async () => {
  const { calls, routes } = fixture();
  const cases = [
    ['GET','/v2/operational/entities/order/order-1/collaboration',{ query: {} }],
    ['POST','/v2/operational/threads',{ body: { ownerOrganisationId:'brand-1', participantOrganisationIds:[], entity:{type:'order',id:'order-1'}, title:'Thread', kind:'general' } }],
    ['POST','/v2/operational/threads/thread-1/messages',{ body: { actingOrganisationId:'brand-1', body:'Message' } }],
    ['POST','/v2/operational/threads/thread-1/resolve',{ body: { actingOrganisationId:'brand-1', expectedVersion:1 } }],
    ['POST','/v2/operational/threads/thread-1/archive',{ body: { actingOrganisationId:'brand-1', expectedVersion:2 } }],
    ['POST','/v2/operational/decisions',{ body: { actingOrganisationId:'brand-1', entity:{type:'order',id:'order-1'}, decisionType:'test', outcome:'recorded', rationale:'Recorded.' } }],
  ];
  for (let index=0; index<cases.length; index+=1) {
    const [method,path,input]=cases[index];
    const route=matchWholesaleRoute(routes,method,path);
    assert.ok(route, `${method} ${path}`);
    await route.execute({ actorId:'owner-1', commandId:`cmd-${index}`, body:input.body??{}, query:input.query??{}, params:route.params });
  }
  assert.deepEqual(calls.map((call)=>call[0]), ['read','create','message','resolve','archive','decision']);
});

test('operational collaboration routes reject unknown fields and non-array evidence before service execution', () => {
  const { calls, routes } = fixture();
  const create=matchWholesaleRoute(routes,'POST','/v2/operational/threads');
  assert.throws(() => create.execute({
    actorId:'owner-1',commandId:'bad',query:{},params:create.params,
    body:{ ownerOrganisationId:'brand-1',participantOrganisationIds:[],entity:{type:'order',id:'order-1'},title:'Thread',kind:'general',status:'open' },
  }), { code:'HTTP_BODY_FIELD_UNKNOWN' });
  const message=matchWholesaleRoute(routes,'POST','/v2/operational/threads/thread-1/messages');
  assert.throws(() => message.execute({
    actorId:'owner-1',commandId:'bad-2',query:{},params:message.params,
    body:{ actingOrganisationId:'brand-1',body:'Message',evidenceRefs:'not-array' },
  }), { code:'HTTP_BODY_FIELD_INVALID' });
  assert.equal(calls.length,0);
});

test('authoritative OpenAPI 1.18 documents operational collaboration without version drift', () => {
  const spec=wholesaleV2ExtendedOpenApi;
  assert.equal(spec.info.version,'1.18.0');
  for (const path of [
    '/operational/entities/{entityType}/{entityId}/collaboration',
    '/operational/threads',
    '/operational/threads/{threadId}/messages',
    '/operational/threads/{threadId}/resolve',
    '/operational/threads/{threadId}/archive',
    '/operational/decisions',
  ]) assert.ok(spec.paths[path],path);
  assert.equal(spec.components.schemas.OperationalThreadCreateInput.additionalProperties,false);
  assert.deepEqual(spec.components.schemas.OperationalDecision.properties.outcome.enum,['approved','rejected','accepted_with_risk','deferred','waived','recorded']);
  assert.equal(Object.isFrozen(spec),true);
});
