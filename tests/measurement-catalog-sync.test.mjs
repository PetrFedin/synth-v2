import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public', 'modules', 'measurement-catalog-sync.js'), 'utf8');
const match = source.match(/async function fetchAllCatalogSkus\(request = api\) \{([\s\S]*?)\n  \}\n\n  function actorKey/);
assert.ok(match, 'Measurement Catalog synchronizer must keep its loader independently testable');
const createLoader = () => new Function(`return async function fetchAllCatalogSkus(request) {${match[1]}\n  };`)();

test('catalog synchronizer exhausts cursor pages and keeps the newest SKU snapshot', async () => {
  const pages = new Map([
    [null, { items: [{ sku: 'STYLE-001', version: 1 }, { sku: 'STYLE-002', version: 1 }], nextCursor: 'page-2' }],
    ['page-2', { items: [{ sku: 'STYLE-002', version: 2 }, { sku: 'STYLE-201', version: 1 }], nextCursor: null }],
  ]);
  const requests = [];
  const load = createLoader();
  const result = await load(async (requestPath) => {
    requests.push(requestPath);
    const url = new URL(requestPath, 'http://syntha.local');
    assert.equal(url.pathname, '/v2/catalog/skus');
    assert.equal(url.searchParams.get('limit'), '200');
    const cursor = url.searchParams.get('cursor');
    assert.ok(pages.has(cursor), `Unexpected cursor ${cursor}`);
    return pages.get(cursor);
  });
  assert.deepEqual(requests, ['/v2/catalog/skus?limit=200', '/v2/catalog/skus?limit=200&cursor=page-2']);
  assert.deepEqual(result, [
    { sku: 'STYLE-001', version: 1 },
    { sku: 'STYLE-002', version: 2 },
    { sku: 'STYLE-201', version: 1 },
  ]);
  assert.ok(Object.isFrozen(result));
});

test('catalog synchronizer blocks cyclic cursors and malformed pages', async () => {
  const load = createLoader();
  let calls = 0;
  await assert.rejects(
    load(async () => ({ items: [{ sku: `STYLE-${++calls}`, version: 1 }], nextCursor: 'repeat' })),
    /MEASUREMENT_CATALOG_CURSOR_CYCLE/,
  );
  assert.equal(calls, 2);
  await assert.rejects(load(async () => ({ items: null, nextCursor: null })), /MEASUREMENT_CATALOG_PAGE_INVALID/);
  await assert.rejects(load(async () => ({ items: [{}], nextCursor: null })), /MEASUREMENT_CATALOG_SKU_INVALID/);
});

test('catalog synchronizer enforces a bounded maximum page count', async () => {
  const load = createLoader();
  let page = 0;
  await assert.rejects(
    load(async () => ({ items: [{ sku: `STYLE-${String(++page).padStart(4, '0')}`, version: 1 }], nextCursor: `cursor-${page}` })),
    /MEASUREMENT_CATALOG_PAGE_LIMIT_EXCEEDED/,
  );
  assert.equal(page, 500);
});
