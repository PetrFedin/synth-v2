import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createTechPackRoutes } from '../src/http/tech-pack-routes.mjs';
import { matchWholesaleRoute } from '../src/http/routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const payload = Object.freeze({
  techPackCode: 'TP-001', brandId: 'brand-1', eligible: true, blockers: [],
  identity: { productSkuId: 'sku-1', styleVersionId: 'sv-1', colorwayId: 'cw-1', sizeScaleVersionId: 'ssv-1' },
  dependencies: { bom: { id: 'BOM-1', version: 3 }, measurement: { id: 'CHART-1', version: 2 }, sample: { code: 'PPS-1', version: 4 } },
});

function fakeElement(tag) {
  let label = '';
  return {
    tagName: String(tag).toUpperCase(), className: '', children: [], attributes: {}, listeners: {}, dataset: {}, disabled: false,
    append(...children) { this.children.push(...children); },
    setAttribute(key,value) { this.attributes[key] = String(value); },
    addEventListener(key,fn) { this.listeners[key] = fn; },
    get textContent() { return label + this.children.map(x => x.textContent ?? String(x)).join(''); },
    set textContent(value) { label = String(value); },
  };
}
async function inspectorHarness(handler, locale = 'ru') {
  const source = await read('public/modules/tech-pack-canonical-inspector.js');
  const requests = [];
  const context = vm.createContext({
    window: {}, document: { createElement: fakeElement }, localText: (ru, en) => locale === 'en' ? en : ru,
    state: { view: 'tech-packs' }, renderApp: () => {},
    I18N: { localeTag: () => locale === 'en' ? 'en-GB' : 'ru-RU' },
    api: async path => { requests.push(path); return handler(path); },
  });
  new vm.Script(source, { filename:'tech-pack-canonical-inspector.js' }).runInContext(context);
  return { inspector:context.window.SynthaTechPackCanonicalInspector, context, requests };
}

test('canonical Tech Pack route returns only a read-only, authenticated service projection', async () => {
  const calls = [];
  const routes = createTechPackRoutes({ techPacks: {
    canonicalPreflightForActor: async (actor, code) => { calls.push([actor,code]); return payload; },
  } });
  const route = matchWholesaleRoute(routes, 'GET', '/v2/tech-packs/TP-001/canonical-preflight');
  assert.ok(route);
  assert.equal(route.mutation, false);
  assert.deepEqual(await route.execute({ actorId:'brand-user', query:{}, params:route.params }), payload);
  assert.deepEqual(calls, [['brand-user','TP-001']]);
  assert.throws(() => route.execute({ actorId:'brand-user', query:{ bypass:'1' }, params:route.params }),
    error => error?.code === 'HTTP_QUERY_FIELD_UNKNOWN');
  const spec = wholesaleV2ExtendedOpenApi;
  const apiPath = spec.paths['/tech-packs/{techPackCode}/canonical-preflight']?.get;
  assert.ok(apiPath);
  assert.deepEqual(apiPath.security, [{ bearerAuth:[] }]);
  assert.ok(spec.components.schemas.TechPackCanonicalPreflight);
  assert.equal(spec.components.schemas.TechPackCanonicalPreflight.additionalProperties, false);
});

test('actual Tech Pack inspection button reads the API and renders exact sources, not seeded statuses', async () => {
  const { inspector, requests } = await inspectorHarness(async () => payload);
  assert.match(inspector.render(payload).textContent, /Проверка ещё не запускалась/);
  await inspector.check('TP-001');
  assert.deepEqual(requests, ['/v2/tech-packs/TP-001/canonical-preflight']);
  const visible = inspector.render(payload);
  assert.match(visible.textContent, /Источники согласованы/);
  assert.match(visible.textContent, /BOM-1 · v3/);
  assert.match(visible.textContent, /CHART-1 · v2/);
  assert.match(visible.textContent, /PPS-1 · v4/);
  assert.match(visible.textContent, /не разрешение на выпуск/);
  inspector.invalidate('TP-001');
  assert.match(inspector.render(payload).textContent, /Проверка ещё не запускалась/);
});

test('blocked source evidence and read denial cannot appear as successful inspection', async () => {
  const broken = { ...payload, eligible:false, blockers:['CANONICAL_IDENTITY_MISSING','PPS_SUPPLIER_MISMATCH'] };
  const h=await inspectorHarness(async () => broken);
  await h.inspector.check('TP-001');
  assert.match(h.inspector.render(payload).textContent, /Требуются исправления/);
  assert.match(h.inspector.render(payload).textContent, /Фабрика образца не совпадает/);
  h.context.api = async () => { throw Object.assign(new Error('Access denied'), { code:'CAPABILITY_DENIED' }); };
  await h.inspector.check('TP-001');
  const visible=h.inspector.render(payload);
  assert.match(visible.textContent, /Access denied/);
  assert.doesNotMatch(visible.textContent, /Источники согласованы/);
});

test('source inspector is mounted in the real Tech Pack detail and its script is server-deliverable', async()=>{
  const [workspace,html,staticHandler]=await Promise.all([
    read('public/modules/tech-packs.js'),read('public/index.html'),read('src/web/static-handler.mjs'),
  ]);
  assert.match(workspace, /SynthaTechPackCanonicalInspector\?\.render\(value\)/);
  assert.match(workspace, /SynthaTechPackCanonicalInspector\?\.invalidate\(value\.techPackCode\)/);
  assert.ok(html.indexOf('/ui/tech-pack-canonical-inspector.js') < html.indexOf('/ui/tech-packs.js'));
  assert.match(staticHandler, /'\/ui\/tech-pack-canonical-inspector\.js'/);
  const script=await read('public/modules/tech-pack-canonical-inspector.js');
  assert.doesNotThrow(()=>new vm.Script(script));
});

function deferredResponse() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('reloaded or tenant-switched Tech Pack cannot resurrect revoked in-flight source evidence', async () => {
  const oldResponse = deferredResponse();
  const freshResponse = deferredResponse();
  let count = 0;
  const h = await inspectorHarness(() => (++count === 1 ? oldResponse.promise : freshResponse.promise));
  const first = h.inspector.check('TP-001');
  assert.equal(count, 1);
  h.inspector.invalidate(); // The workspace reset path also runs on an organisation switch.
  assert.match(h.inspector.render(payload).textContent, /Проверка ещё не запускалась/);
  const second = h.inspector.check('TP-001');
  assert.equal(count, 2, 'a fresh check must not be blocked by an invalidated request');

  freshResponse.resolve({ ...payload, eligible: false, blockers: ['PPS_SUPPLIER_MISMATCH'] });
  await second;
  assert.match(h.inspector.render(payload).textContent, /Требуются исправления/);
  oldResponse.resolve(payload);
  await first;
  assert.match(h.inspector.render(payload).textContent, /Требуются исправления/);
  assert.doesNotMatch(h.inspector.render(payload).textContent, /Источники согласованы/);
});

test('a stale rejected request cannot erase newer successful evidence', async () => {
  const oldResponse = deferredResponse();
  const h = await inspectorHarness(() => oldResponse.promise);
  const first = h.inspector.check('TP-001');
  h.inspector.invalidate('TP-001');
  h.context.api = async () => payload;
  await h.inspector.check('TP-001');
  oldResponse.reject(new Error('Old tenant access denied'));
  await first;
  const visible = h.inspector.render(payload).textContent;
  assert.match(visible, /Источники согласованы/);
  assert.doesNotMatch(visible, /Old tenant access denied/);
});

test('rechecking clears previously green state and rejects contradictory green-with-blockers', async () => {
  const pending = deferredResponse();
  let count = 0;
  const h = await inspectorHarness(() => ++count === 1 ? payload : pending.promise);
  await h.inspector.check('TP-001');
  assert.match(h.inspector.render(payload).textContent, /Источники согласованы/);
  const recheck = h.inspector.check('TP-001');
  const waiting = h.inspector.render(payload).textContent;
  assert.match(waiting, /Сверяем точные версии источников/);
  assert.doesNotMatch(waiting, /Источники согласованы/);
  pending.resolve({ ...payload, blockers: ['CANONICAL_IDENTITY_MISSING'] });
  await recheck;
  const result = h.inspector.render(payload).textContent;
  assert.match(result, /TECH_PACK_PREFLIGHT_RESPONSE_INVALID/);
  assert.doesNotMatch(result, /Источники согласованы/);
});

test('incomplete, malformed or contradictory evidence cannot acquire a green diagnostic', async t => {
  const variants = [
    ['empty identity', { identity: {} }],
    ['array identity', { identity: [] }],
    ['null canonical identity', { identity: { ...payload.identity, productSkuId: null } }],
    ['blank canonical identity', { identity: { ...payload.identity, styleVersionId: ' ' } }],
    ['empty dependencies', { dependencies: {} }],
    ['missing BOM', { dependencies: { ...payload.dependencies, bom: null } }],
    ['missing sample version', { dependencies: { ...payload.dependencies, sample: { code: 'PPS-1' } } }],
    ['null published version', { dependencies: { ...payload.dependencies, bom: { id: 'BOM-1', version: null } } }],
    ['zero published version', { dependencies: { ...payload.dependencies, measurement: { id: 'CHART-1', version: 0 } } }],
    ['fractional published version', { dependencies: { ...payload.dependencies, bom: { id: 'BOM-1', version: 1.5 } } }],
    ['invalid sample code', { dependencies: { ...payload.dependencies, sample: { code: 'bad code', version: 1 } } }],
    ['blank brand', { brandId: ' ' }],
    ['wrong brand', { brandId: 'brand-2' }],
    ['blocked without explanation', { eligible: false }],
    ['non-text blocker', { eligible: false, blockers: [null] }],
    ['duplicate blockers', { eligible: false, blockers: ['MISSING', 'MISSING'] }],
    ['extra response field', { unexpected: true }],
  ];
  for (const [label, override] of variants) {
    await t.test(label, async () => {
      const h = await inspectorHarness(async () => ({ ...payload, ...override }));
      await h.inspector.check('TP-001', 'brand-1');
      const visible = h.inspector.render(payload).textContent;
      assert.match(visible, /TECH_PACK_PREFLIGHT_RESPONSE_INVALID/);
      assert.doesNotMatch(visible, /Источники согласованы/);
    });
  }
});

test('valid missing-source diagnostic remains visible and cached evidence stays brand-scoped', async () => {
  const h = await inspectorHarness(async () => ({ ...payload, eligible: false,
    blockers: ['CANONICAL_IDENTITY_MISSING'],
    identity: Object.fromEntries(Object.keys(payload.identity).map(key => [key, null])),
    dependencies: { bom: null, measurement: null, sample: null },
  }));
  await h.inspector.check('TP-001', 'brand-1');
  assert.match(h.inspector.render(payload).textContent, /Требуются исправления/);
  assert.doesNotMatch(h.inspector.render(payload).textContent, /RESPONSE_INVALID/);
  assert.match(h.inspector.render({ ...payload, brandId: 'brand-2' }).textContent, /Проверка ещё не запускалась/);
  h.context.api = async () => payload;
  await h.inspector.check('TP-001', 'brand-1');
  assert.doesNotMatch(h.inspector.render({ ...payload, brandId: 'brand-2' }).textContent, /Источники согласованы/);
});

test('the actual RU/EN button binds source checks to the displayed brand', async t => {
  for (const locale of ['ru', 'en']) {
    await t.test(locale, async () => {
      const h = await inspectorHarness(async () => ({ ...payload, brandId: 'brand-2' }), locale);
      const visible = h.inspector.render(payload);
      const button = visible.children[0].children[1];
      assert.equal(button.textContent, locale === 'ru' ? 'Проверить источники' : 'Check sources');
      button.listeners.click();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(h.requests, ['/v2/tech-packs/TP-001/canonical-preflight']);
      const rejected = h.inspector.render(payload).textContent;
      assert.match(rejected, /TECH_PACK_PREFLIGHT_RESPONSE_INVALID/);
      assert.doesNotMatch(rejected, /Источники согласованы|Sources are consistent/);
    });
  }
});


test('preflight query alias delegates the exact slash-containing code and rejects unwanted query fields', () => {
  const calls = [], code = 'TP/PREF/2026-R01';
  const routes = createTechPackRoutes({techPacks:{
    canonicalPreflightForActor:(actor,requested)=> {
      calls.push([actor,requested]);
      return {...payload,techPackCode:requested};
    },
  }});
  const route=matchWholesaleRoute(routes,'GET','/v2/tech-packs/by-code/canonical-preflight');
  assert.ok(route);
  assert.equal(route.mutation,false);
  const result=route.execute({actorId:'brand-owner',query:{code},params:route.params});
  assert.equal(result.techPackCode,code);
  assert.deepEqual(calls,[['brand-owner',code]]);
  for(const query of [{},{code:'bad code'},{code,bypass:'1'}]) {
    assert.throws(()=>route.execute({actorId:'brand-owner',query,params:route.params}),
      error=>error?.code===(query.bypass?'HTTP_QUERY_FIELD_UNKNOWN':'TECH_PACK_CODE_INVALID'));
  }
  assert.equal(calls.length,1);
  const operation=wholesaleV2ExtendedOpenApi.paths['/tech-packs/by-code/canonical-preflight']?.get;
  assert.ok(operation);
  assert.equal(operation.operationId,'getTechPackCanonicalPreflightByCode');
  assert.deepEqual(operation.security,[{bearerAuth:[]}]);
  assert.equal(operation.parameters[0].name,'code');
  assert.equal(operation.parameters[0].in,'query');
  assert.equal(operation.parameters[0].required,true);
});

test('inspector reads a slash-coded pack via query alias, displays blockers, and revokes stale evidence', async () => {
  const code='TP/PREF/2026-R01';
  const blocked={...payload,techPackCode:code,eligible:false,
    blockers:['CANONICAL_IDENTITY_MISSING'],
    identity:{...payload.identity,productSkuId:null}};
  const h=await inspectorHarness(async()=>blocked);
  await h.inspector.check(code,'brand-1');
  assert.deepEqual(h.requests,['/v2/tech-packs/by-code/canonical-preflight?code=TP%2FPREF%2F2026-R01']);
  const rendered=h.inspector.render(blocked).textContent;
  assert.match(rendered,/Требуются исправления/);
  assert.match(rendered,/не разрешение на выпуск/);
  assert.doesNotMatch(rendered,/Источники согласованы/);
  h.inspector.invalidate(code);
  assert.match(h.inspector.render(blocked).textContent,/Проверка ещё не запускалась/);
});
