import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createStandaloneHandler } from '../src/web/static-handler.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relative) => readFile(path.join(root, relative), 'utf8');

async function withServer(work) {
  const handler = createStandaloneHandler({ publicDir: path.join(root, 'public'), apiHandler: (_request, response) => { response.statusCode = 404; response.end(); } });
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await work(`http://127.0.0.1:${server.address().port}`); }
  finally { server.close(); await once(server, 'close'); }
}

function execution({ status = 'active', milestoneStatus = 'pending', dueAt = '2026-08-05T12:00:00.000Z' } = {}) {
  const codes = ['materials-ready','cutting-complete','assembly-complete','finishing-complete','packing-complete','ready-for-qc'];
  return { executionCode: 'EXEC-PO-001', productionOrderNumber: 'PO-001', supplierCode: 'FACTORY-01', sku: 'STYLE-001', status, milestones: codes.map((code, index) => ({ code, status: index === 0 ? milestoneStatus : 'pending', dueAt })) };
}

test('Production Execution UI core exposes only valid current-stage actions and risk summaries', async () => {
  const context = { window: {} };
  vm.runInNewContext(await source('public/modules/production-execution-core.js'), context);
  const core = context.window.SynthaProductionExecutionCore;
  assert.deepEqual([...core.allowedActions(execution(), { canManage: true })], ['complete','block','cancel']);
  assert.deepEqual([...core.allowedActions(execution({ milestoneStatus: 'blocked' }), { canManage: true })], ['resolve','cancel']);
  assert.deepEqual([...core.allowedActions(execution({ status: 'ready-for-qc' }), { canManage: true })], []);
  const summary = core.summarize([execution({ milestoneStatus: 'blocked' }), execution()], '2026-08-06T00:00:00.000Z');
  assert.equal(summary.blocked, 1);
  assert.equal(summary.overdue, 2);
  assert.equal(Object.isFrozen(summary), true);
});

test('Production Execution workspace is syntactically valid and calls only governed lifecycle APIs', async () => {
  const js = await source('public/modules/production-executions.js');
  const css = await source('public/production-executions.css');
  assert.doesNotThrow(() => new Function(js));
  for (const token of ['/v2/production-executions?','/from-production-order/','/start','/milestones/complete','/milestones/block','/milestones/resolve','/cancel','expectedVersion','PRODUCTION_EXECUTION_MANAGE','Производственный календарь','Production Execution']) assert.ok(js.includes(token), token);
  assert.doesNotMatch(js, /prompt\s*\(|\.style\./);
  assert.match(css, /\.production-execution-layout/);
  assert.match(css, /\.production-milestone\.blocked/);
  assert.doesNotMatch(css, /@import|https?:\/\//i);
});

test('V14 shell loads Production Execution after Production Orders and before module adapters', async () => {
  const html = await source('public/index.html');
  const core = html.indexOf('/ui/production-execution-core.js?v=industrial-20260805-1');
  const orders = html.indexOf('/ui/production-orders.js?v=industrial-20260805-1');
  const executions = html.indexOf('/ui/production-executions.js?v=industrial-20260805-1');
  const adapters = html.indexOf('/ui/omnidata-v14-module-adapters.js?v=visual-20260805-14-module-adapters-3');
  assert.ok(core >= 0 && orders >= 0 && executions > orders && adapters > executions);
  assert.match(html, /production-executions\.css\?v=industrial-20260805-1/);
  assert.match(html, /ui-capabilities\.js\?v=industrial-20260805-4/);
});

test('standalone server delivers Production Execution assets with no-store caching', async () => {
  await withServer(async (base) => {
    for (const asset of ['/production-executions.css','/ui/production-execution-core.js','/ui/production-executions.js']) {
      const response = await fetch(`${base}${asset}`);
      assert.equal(response.status, 200, asset);
      assert.equal(response.headers.get('cache-control'), 'no-store', asset);
      assert.match(response.headers.get('content-type') || '', asset.endsWith('.css') ? /text\/css/ : /text\/javascript/);
    }
  });
});
