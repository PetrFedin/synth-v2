import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceSource = await readFile(path.join(root, 'public', 'modules', 'samples.js'), 'utf8');
const catalogSource = await readFile(path.join(root, 'public', 'modules', 'sample-catalog-sync.js'), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function workspaceContext() {
  const window = {
    SynthaSampleCore: {},
    SynthaUiCapabilities: {},
  };
  const context = vm.createContext({
    window, URLSearchParams, Node: class {}, state: { workspace: {} },
    renderView: () => null, renderApp: () => {}, localText: (ru) => ru,
    api: async () => { throw new Error('unexpected api'); }, mutate: async () => {}, toast: () => {}, confirm: () => true,
    document: {}, queueMicrotask,
  });
  window.window = window;
  vm.runInContext(workspaceSource, context, { filename: 'samples.js' });
  return context.window.SynthaSamplesWorkspace;
}

function catalogContext() {
  const window = {};
  const context = vm.createContext({
    window, URLSearchParams, state: { workspace: {}, user: { actorId: 'user-1' } },
    renderView: () => null, renderApp: () => {}, localText: (ru) => ru,
    api: async () => { throw new Error('unexpected api'); }, document: {},
  });
  window.window = window;
  vm.runInContext(catalogSource, context, { filename: 'sample-catalog-sync.js' });
  return context.window.SynthaSampleCatalogSync;
}

test('Samples workspace exhausts all cursor pages with stable reference time and dedupe', async () => {
  const workspace = workspaceContext();
  const calls = [];
  const request = async (url) => {
    calls.push(url);
    if (calls.length === 1) return { items: [{ sampleCode: 'SMP-A' }, { sampleCode: 'SMP-B', version: 1 }], referenceTime: '2026-08-04T10:00:00.000Z', nextCursor: 'cursor-1' };
    return { items: [{ sampleCode: 'SMP-B', version: 2 }, { sampleCode: 'SMP-C' }], referenceTime: '2026-08-04T10:00:00.000Z', nextCursor: null };
  };
  const result = await workspace.fetchAllSamples(request);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /cursor=cursor-1/);
  assert.deepEqual(plain(result.items), [{ sampleCode: 'SMP-A' }, { sampleCode: 'SMP-B', version: 2 }, { sampleCode: 'SMP-C' }]);
  assert.equal(result.referenceTime, '2026-08-04T10:00:00.000Z');
});

test('Samples workspace rejects cursor cycles and reference-time drift', async () => {
  const workspace = workspaceContext();
  await assert.rejects(() => workspace.fetchAllSamples(async () => ({ items: [{ sampleCode: 'SMP-A' }], referenceTime: '2026-08-04T10:00:00.000Z', nextCursor: 'same' })), /SAMPLE_CURSOR_CYCLE/);
  let page = 0;
  await assert.rejects(() => workspace.fetchAllSamples(async () => (++page === 1
    ? { items: [{ sampleCode: 'SMP-A' }], referenceTime: '2026-08-04T10:00:00.000Z', nextCursor: 'next' }
    : { items: [{ sampleCode: 'SMP-B' }], referenceTime: '2026-08-04T10:01:00.000Z', nextCursor: null })), /SAMPLE_REFERENCE_TIME_DRIFT/);
});

test('Samples catalog guard exhausts pages, deduplicates and rejects cycles', async () => {
  const sync = catalogContext();
  let page = 0;
  const catalog = await sync.fetchAllCatalogSkus(async () => (++page === 1
    ? { items: [{ sku: 'A', version: 1 }, { sku: 'B', version: 1 }], nextCursor: 'next' }
    : { items: [{ sku: 'B', version: 2 }, { sku: 'C', version: 1 }], nextCursor: null }));
  assert.deepEqual(plain(catalog), [{ sku: 'A', version: 1 }, { sku: 'B', version: 2 }, { sku: 'C', version: 1 }]);
  await assert.rejects(() => sync.fetchAllCatalogSkus(async () => ({ items: [{ sku: 'A' }], nextCursor: 'same' })), /SAMPLE_CATALOG_CURSOR_CYCLE/);
});
