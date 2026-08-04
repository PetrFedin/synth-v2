import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(new URL('..', import.meta.url).pathname);

test('sourcing UI core exposes deterministic action matrices and quote ranking', async () => {
  const source = await readFile(path.join(root, 'public/modules/sourcing-core.js'), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window, Object, Array, Number, String, Date, Set, Map });
  const core = window.SynthaSourcingCore;
  assert.ok(core);
  assert.deepEqual(Array.from(core.allowedSupplierActions({ status: 'draft' }, { canManage: true })), ['edit', 'qualify', 'archive']);
  assert.deepEqual(Array.from(core.allowedRfqActions({ status: 'quoted' }, { manage: true, award: true, allocate: false })), ['quote', 'cancel', 'award']);
  const ranked = core.rankQuotes({ quotes: [
    { supplierCode: 'B', totalCostMinor: 1000, leadTimeDays: 40 },
    { supplierCode: 'A', totalCostMinor: 1000, leadTimeDays: 30 },
    { supplierCode: 'C', totalCostMinor: 900, leadTimeDays: 60 },
  ] });
  assert.deepEqual(Array.from(ranked, (item) => item.supplierCode), ['C', 'A', 'B']);
  assert.equal(core.isRfqOverdue({ status: 'issued', responseDueAt: '2026-08-01T00:00:00.000Z' }, '2026-08-02T00:00:00.000Z'), true);
});

test('sourcing workspace wires every visible mutation to a concrete API endpoint', async () => {
  const [workspace, index, installed, staticHandler] = await Promise.all([
    readFile(path.join(root, 'public/modules/sourcing.js'), 'utf8'),
    readFile(path.join(root, 'public/index.html'), 'utf8'),
    readFile(path.join(root, 'public/modules/omnidata-v7-installed.js'), 'utf8'),
    readFile(path.join(root, 'src/web/static-handler.mjs'), 'utf8'),
  ]);
  for (const endpoint of ['/v2/suppliers', '/qualify', '/suspend', '/archive', '/v2/rfqs', '/issue', '/quotes', '/award', '/allocate', '/cancel']) assert.ok(workspace.includes(endpoint), `missing UI endpoint ${endpoint}`);
  for (const handler of ['openSupplierDialog', 'qualifySupplier', 'openSupplierSuspendDialog', 'archiveSupplier', 'openRfqDialog', 'issueRfq', 'openQuoteDialog', 'openAwardDialog', 'openAllocationDialog', 'openRfqCancelDialog']) assert.match(workspace, new RegExp(`function ${handler}\\(`));
  assert.ok(index.includes('/ui/sourcing-core.js'));
  assert.ok(index.includes('/ui/sourcing.js'));
  assert.ok(index.includes('/sourcing.css'));
  assert.ok(staticHandler.includes("'/ui/sourcing.js'"));
  assert.ok(staticHandler.includes("'/sourcing.css'"));
  assert.ok(installed.includes("activate('Requests for quotation', 'rfqs'"));
  assert.ok(installed.includes("activate('Production', 'production'"));
});
