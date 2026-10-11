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
async function inspectorHarness(handler) {
  const source = await read('public/modules/tech-pack-canonical-inspector.js');
  const requests = [];
  const context = vm.createContext({
    window: {}, document: { createElement: fakeElement }, localText: ru => ru,
    state: { view: 'tech-packs' }, renderApp: () => {},
    I18N: { localeTag: () => 'ru-RU' },
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
