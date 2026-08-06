import test from 'node:test';
import assert from 'node:assert/strict';
import { createTechPackRoutes } from '../src/http/tech-pack-routes.mjs';
import { matchWholesaleRoute } from '../src/http/routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

function fixture() {
  const calls = [];
  const techPacks = {
    pageForActor: async (...args) => { calls.push(['page', ...args]); return { items: [], nextCursor: null }; }, getForActor: async (...args) => { calls.push(['get', ...args]); return { techPackCode: args[1] }; }, createTechPack: async (...args) => { calls.push(['create', ...args]); return args[2]; }, updateTechPack: async (...args) => { calls.push(['update', ...args]); return { techPackCode: args[2], ...args[3] }; }, issueTechPack: async (...args) => { calls.push(['issue', ...args]); return { techPackCode: args[2], status: 'issued' }; }, acknowledgeTechPack: async (...args) => { calls.push(['acknowledge', ...args]); return { techPackCode: args[2], status: 'acknowledged' }; }, createRevision: async (...args) => { calls.push(['revision', ...args]); return { techPackCode: args[3].techPackCode, status: 'draft' }; }, withdrawTechPack: async (...args) => { calls.push(['withdraw', ...args]); return { techPackCode: args[2], status: 'withdrawn' }; },
  };
  return { calls, routes: createTechPackRoutes({ techPacks }) };
}
const editable = { supplierCode: 'FACTORY-01', supplierName: 'Factory One', supplierEmail: 'production@factory.example', title: 'Style production pack', description: null, constructionNotes: 'Approved construction sequence', qualityNotes: 'Inspect critical measurements', packingNotes: 'Pack by size and colour' };

test('Tech Pack routes expose issue, acknowledgement, revision and withdrawal commands', async () => {
  const { calls, routes } = fixture();
  const cases = [
    ['GET','/v2/tech-packs',{ query: { status: 'acknowledged' } }],['GET','/v2/tech-packs/TP-STYLE-001-R01',{}],['POST','/v2/tech-packs',{ body: { techPackCode: 'TP-STYLE-001-R01', sku: 'STYLE-001', ...editable } }],['PATCH','/v2/tech-packs/TP-STYLE-001-R01',{ body: { expectedVersion: 1, ...editable } }],['POST','/v2/tech-packs/TP-STYLE-001-R01/issue',{ body: { expectedVersion: 2 } }],['POST','/v2/tech-packs/TP-STYLE-001-R01/acknowledge',{ body: { expectedVersion: 3, supplierCode: 'FACTORY-01', acknowledgementReference: 'ACK-9081', acknowledgedBy: 'Mei Lin', notes: null } }],['POST','/v2/tech-packs/TP-STYLE-001-R01/revisions',{ body: { expectedVersion: 4, techPackCode: 'TP-STYLE-001-R02' } }],['POST','/v2/tech-packs/TP-STYLE-001-R01/withdraw',{ body: { expectedVersion: 4, reason: 'Production allocation cancelled' } }],
  ];
  for (let index = 0; index < cases.length; index += 1) { const [method, path, input] = cases[index]; const route = matchWholesaleRoute(routes, method, path); assert.ok(route, `${method} ${path}`); await route.execute({ actorId: 'owner-user', commandId: `command-${index}`, body: input.body ?? {}, query: input.query ?? {}, params: route.params }); }
  assert.deepEqual(calls.map((call) => call[0]), ['page','get','create','update','issue','acknowledge','revision','withdraw']);
});

test('Tech Pack routes reject generic transitions and unsupported acknowledgement fields', () => {
  const { calls, routes } = fixture(); assert.equal(matchWholesaleRoute(routes, 'POST', '/v2/tech-packs/TP-STYLE-001-R01/transition'), null);
  const acknowledge = matchWholesaleRoute(routes, 'POST', '/v2/tech-packs/TP-STYLE-001-R01/acknowledge');
  assert.throws(() => acknowledge.execute({ actorId: 'owner', commandId: 'bad', query: {}, params: acknowledge.params, body: { expectedVersion: 2, supplierCode: 'FACTORY-01', acknowledgementReference: 'ACK-1', acknowledgedBy: 'Mei Lin', notes: null, status: 'acknowledged' } }), { code: 'HTTP_BODY_FIELD_UNKNOWN' });
  assert.equal(calls.length, 0);
});

test('authoritative OpenAPI 1.18 documents supplier acknowledgement and guarded production allocation', () => {
  const specification = wholesaleV2ExtendedOpenApi; assert.equal(specification.info.version, '1.18.0');
  for (const path of ['/tech-packs','/tech-packs/{techPackCode}','/tech-packs/{techPackCode}/issue','/tech-packs/{techPackCode}/acknowledge','/tech-packs/{techPackCode}/revisions','/tech-packs/{techPackCode}/withdraw']) assert.ok(specification.paths[path], path);
  assert.equal(specification.components.schemas.TechPackCreate.additionalProperties, false);
  assert.equal(specification.components.schemas.TechPack.required.includes('dependencySnapshot'), true);
  assert.equal(specification.components.schemas.TechPack.required.includes('acknowledgement'), true);
  assert.deepEqual(specification.components.schemas.TechPack.properties.status.enum, ['draft','issued','acknowledged','superseded','withdrawn']);
  const allocation = specification.components.schemas.RfqAllocation;
  assert.equal(allocation.required.includes('techPackCode'), true); assert.equal(allocation.required.includes('techPackAcknowledgementReference'), true);
  assert.equal(specification.paths['/rfqs/{rfqCode}/allocate'].post['x-syntha-production-gate'], 'supplier-acknowledged-current-tech-pack');
  assert.equal(Object.isFrozen(specification), true);
});