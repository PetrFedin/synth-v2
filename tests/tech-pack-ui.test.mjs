import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relative) => readFile(path.join(root, relative), 'utf8');

function loadCore() {
  const window = {};
  return source('public/modules/tech-pack-core.js').then((code) => { vm.runInNewContext(code, { window, Object, Map, Set, Number, String }); return window.SynthaTechPackCore; });
}

const pack = {
  techPackCode: 'TP-STYLE-001-R01', sku: 'STYLE-001', brandId: 'brand-1', skuVersion: 3, revision: 1, status: 'draft',
  supplierCode: 'FACTORY-01', supplierName: 'Factory One', supplierEmail: 'factory@example.com', constructionNotes: 'Construction', qualityNotes: 'Quality', packingNotes: 'Packing',
};
const dependencies = {
  catalogSku: { sku: pack.sku, brandId: pack.brandId, status: 'published', version: 3 },
  bom: { sku: pack.sku, brandId: pack.brandId, status: 'published' },
  measurementChart: { sku: pack.sku, brandId: pack.brandId, status: 'published' },
  approvedSample: { sku: pack.sku, brandId: pack.brandId, status: 'approved' },
};

test('Tech Pack UI core blocks issue until every authoritative dependency is ready', async () => {
  const core = await loadCore();
  assert.deepEqual([...core.assess(pack, dependencies).issues], []);
  assert.equal(core.assess(pack, dependencies).readyToIssue, true);
  assert.deepEqual([...core.allowedActions(pack, { canManage: true, dependencies })], ['edit', 'issue', 'withdraw']);
  const blocked = { ...dependencies, approvedSample: undefined };
  assert.deepEqual([...core.assess(pack, blocked).issues], ['TECH_PACK_SAMPLE_NOT_APPROVED']);
  assert.deepEqual([...core.allowedActions(pack, { canManage: true, dependencies: blocked })], ['edit', 'withdraw']);
});

test('Tech Pack UI core supports cross-realm dependency maps and deterministic revision codes', async () => {
  const core = await loadCore();
  const foreignMap = vm.runInNewContext('new Map()', { Map });
  foreignMap.set(pack.sku, dependencies);
  assert.equal(core.summarize([pack], foreignMap).blocked, 0);
  assert.equal(core.nextRevisionCode(pack), 'TP-STYLE-001-R02');
});

test('Tech Pack V9 assets are loaded, protected and activated in navigation', async () => {
  const [index, handler, installed, workspace, css, capabilities] = await Promise.all([
    source('public/index.html'), source('src/web/static-handler.mjs'), source('public/modules/omnidata-v7-installed.js'),
    source('public/modules/tech-packs.js'), source('public/tech-packs.css'), source('public/modules/ui-capabilities.js'),
  ]);
  assert.match(index, /tech-packs\.css/); assert.match(index, /tech-pack-core\.js/); assert.match(index, /tech-packs\.js/);
  assert.ok(index.indexOf('tech-pack-core.js') < index.indexOf('tech-packs.js'));
  for (const asset of ['/tech-packs.css', '/ui/tech-pack-core.js', '/ui/tech-packs.js']) assert.ok(handler.includes(`'${asset}'`), asset);
  assert.match(installed, /activate\('Tech Packs', 'tech-packs'/);
  for (const endpoint of ['/v2/tech-packs', '/v2/boms', '/v2/measurements', '/v2/samples']) assert.ok(workspace.includes(endpoint), endpoint);
  assert.match(workspace, /dependencySnapshot/); assert.match(workspace, /TECH_PACK_CONCURRENCY_CONFLICT/);
  assert.match(css, /\.tech-pack-layout/); assert.match(capabilities, /TECH_PACK_MANAGE/);
});
