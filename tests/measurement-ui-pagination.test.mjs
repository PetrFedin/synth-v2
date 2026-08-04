import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public', 'modules', 'measurements.js'), 'utf8');
const match = source.match(/async function fetchCatalogSkus\(\) \{([\s\S]*?)\n  \}\n\n  async function openEditor/);
assert.ok(match, 'Measurement Charts catalog loader must remain independently testable');

function createLoader(api) {
  return new Function('api', 'text', `return async function fetchCatalogSkus() {${match[1]}\n  };`)(api, (ru) => ru);
}

test('Measurement Charts traverses every Catalog cursor page and de-duplicates SKU snapshots', async () => {
  const requests = [];
  const pages = new Map([
    [null, { items: [{ sku: 'STYLE-001', version: 1 }, { sku: 'STYLE-002', version: 1 }], nextCursor: 'cursor-2' }],
    ['cursor-2', { items: [{ sku: 'STYLE-002', version: 2 }, { sku: 'STYLE-201', version: 1 }], nextCursor: 'cursor-3' }],
    ['cursor-3', { items: [{ sku: 'STYLE-401', version: 1 }], nextCursor: null }],
  ]);
  const loader = createLoader(async (requestPath) => {
    requests.push(requestPath);
    const url = new URL(requestPath, 'http://syntha.local');
    assert.equal(url.pathname, '/v2/catalog/skus');
    assert.equal(url.searchParams.get('limit'), '200');
    const cursor = url.searchParams.get('cursor');
    assert.ok(pages.has(cursor), `Unexpected cursor ${cursor}`);
    return pages.get(cursor);
  });

  const skus = await loader();
  assert.deepEqual(requests, [
    '/v2/catalog/skus?limit=200',
    '/v2/catalog/skus?limit=200&cursor=cursor-2',
    '/v2/catalog/skus?limit=200&cursor=cursor-3',
  ]);
  assert.deepEqual(skus, [
    { sku: 'STYLE-001', version: 1 },
    { sku: 'STYLE-002', version: 2 },
    { sku: 'STYLE-201', version: 1 },
    { sku: 'STYLE-401', version: 1 },
  ]);
});

test('Measurement Charts rejects cyclic Catalog cursors', async () => {
  let calls = 0;
  const loader = createLoader(async () => {
    calls += 1;
    return { items: [{ sku: `STYLE-${calls}`, version: 1 }], nextCursor: 'same-cursor' };
  });
  await assert.rejects(loader(), /циклический курсор/);
  assert.equal(calls, 2);
});
