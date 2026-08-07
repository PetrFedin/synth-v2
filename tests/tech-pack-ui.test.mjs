import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relative) => readFile(path.join(root, relative), 'utf8');

function loadCore(text) {
  const context = vm.createContext({ window: {} });
  new vm.Script(text, { filename: 'tech-pack-core.js' }).runInContext(context);
  return context.window.SynthaTechPackCore;
}

function pack(overrides = {}) {
  return {
    techPackCode: 'TP-STYLE-001-R01', sku: 'STYLE-001', title: 'Production pack', supplierCode: 'FACTORY-01', supplierName: 'Factory One',
    status: 'acknowledged', revision: 1, version: 3, acknowledgedAt: '2026-08-05T10:00:00.000Z', dependencySnapshot: { skuVersion: 3, bomVersion: 4 },
    acknowledgement: { supplierCode: 'FACTORY-01', issuedTechPackVersion: 2, acknowledgedAt: '2026-08-05T10:00:00.000Z', acknowledgementReference: 'ACK-1' },
    ...overrides,
  };
}

test('Tech Pack UI core calculates production readiness and only exposes valid lifecycle actions', async () => {
  const core = loadCore(await source('public/modules/tech-pack-core.js'));
  assert.equal(core.isProductionReady(pack()), true);
  assert.equal(core.isProductionReady(pack({ status: 'issued' })), false);
  assert.equal(core.isProductionReady(pack({ acknowledgement: { ...pack().acknowledgement, issuedTechPackVersion: 1 } })), false);
  assert.deepEqual([...core.allowedActions(pack({ status: 'draft' }), { canManage: true })], ['edit', 'issue', 'withdraw']);
  assert.deepEqual([...core.allowedActions(pack({ status: 'issued' }), { canManage: true, canAcknowledge: true })], ['acknowledge', 'revision', 'withdraw']);
  assert.deepEqual([...core.allowedActions(pack(), { canManage: false, canAcknowledge: false })], []);
  assert.equal(core.nextRevisionCode(pack()), 'TP-STYLE-001-R02');
});

test('Tech Pack UI filters and summaries distinguish supplier-acknowledged readiness from issued documents', async () => {
  const core = loadCore(await source('public/modules/tech-pack-core.js'));
  const values = [pack(), pack({ techPackCode: 'TP-STYLE-002-R01', sku: 'STYLE-002', status: 'issued', version: 2, acknowledgedAt: null, acknowledgement: null }), pack({ techPackCode: 'TP-STYLE-003-R01', status: 'withdrawn', acknowledgedAt: null, acknowledgement: null })];
  const summary = core.summarize(values);
  assert.deepEqual({ total: summary.total, issued: summary.issued, acknowledged: summary.acknowledged, ready: summary.ready, blocked: summary.blocked }, { total: 3, issued: 1, acknowledged: 1, ready: 1, blocked: 1 });
  assert.deepEqual(Array.from(core.filter(values, { ready: 'ready' }), (value) => value.techPackCode), ['TP-STYLE-001-R01']);
  assert.deepEqual(Array.from(core.filter(values, { status: 'issued', search: 'factory' }), (value) => value.techPackCode), ['TP-STYLE-002-R01']);
});

test('Tech Pack workspace is syntactically valid, uses real API commands and inherits ODS semantics without local CSS', async () => {
  const [workspace, bridge, index, adapters, adapterCss, capabilities] = await Promise.all([
    source('public/modules/tech-packs.js'), source('public/modules/tech-pack-navigation.js'), source('public/index.html'), source('public/modules/omnidata-v14-module-adapters.js'), source('public/omnidata-v14-module-adapters.css'), source('public/modules/ui-capabilities.js'),
  ]);
  assert.doesNotThrow(() => new vm.Script(workspace, { filename: 'tech-packs.js' }));
  assert.doesNotThrow(() => new vm.Script(bridge, { filename: 'tech-pack-navigation.js' }));
  for (const fragment of ['/v2/tech-packs?', '/issue', '/acknowledge', '/revisions', '/withdraw', "state.view = 'tech-packs'"]) assert.ok(workspace.includes(fragment) || bridge.includes(fragment), fragment);
  assert.match(bridge, /MutationObserver/);
  assert.match(bridge, /stopImmediatePropagation/);
  assert.doesNotMatch(index, /\/tech-packs\.css(?:\?|\")/);
  assert.match(index, /\/ui\/tech-pack-core\.js\?v=industrial-20260805-3/);
  assert.match(index, /\/ui\/tech-pack-navigation\.js\?v=industrial-20260805-3/);
  assert.match(index, /\/ui\/tech-packs\.js\?v=industrial-20260805-3/);
  for (const hook of ['tech-pack-kpis','tech-pack-filters','tech-pack-layout','tech-pack-table-wrap','tech-pack-inspector','tech-pack-readiness','tech-pack-card','tech-pack-badge','tech-pack-empty','tech-pack-error']) assert.ok(adapters.includes(hook), hook);
  assert.match(adapters, /\.tech-pack-error,\.production-orders-error,\.production-execution-error/);
  assert.match(workspace, /h\('dialog'/);
  assert.match(workspace, /h\('form'/);
  assert.match(adapterCss, /body\.omnidata-v14 dialog/);
  assert.match(adapterCss, /data-od14-component="form"/);
  assert.match(adapterCss, /data-od14-component="field-group"/);
  assert.match(capabilities, /TECH_PACK_MANAGE: 'tech-pack\.manage'/);
  assert.match(capabilities, /TECH_PACK_ACKNOWLEDGE: 'tech-pack\.acknowledge'/);
});

test('Tech Pack migration enforces an approved pre-production sample from the same supplier', async () => {
  const migration = await source('db/migrations/020_tech_packs.sql');
  assert.match(migration, /enforce_tech_pack_approved_pps_supplier/);
  assert.match(migration, /sample_record\.sample_type <> 'pre-production'/);
  assert.match(migration, /sample_record\.supplier_code IS DISTINCT FROM NEW\.supplier_code/);
  assert.match(migration, /tech_packs_approved_pps_supplier_match/);
});
