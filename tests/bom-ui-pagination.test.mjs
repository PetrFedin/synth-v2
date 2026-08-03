import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public', 'modules', 'bom.js'), 'utf8');
const match = source.match(/async function fetchPublishedMaterials\(\) \{([\s\S]*?)\n  \}\n  async function openEditor/);
assert.ok(match, 'BOM Material Master loader must remain independently testable');

function createLoader(api) {
  return new Function('api', 'text', `return async function fetchPublishedMaterials() {${match[1]}\n  };`)(api, (ru) => ru);
}

test('BOM editor traverses every published Material Master cursor page and de-duplicates codes', async () => {
  const requests = [];
  const pages = new Map([
    [null, { items: [{ code: 'FAB-001', name: 'Wool' }, { code: 'TRIM-001', name: 'Button v1' }], nextCursor: 'cursor-2' }],
    ['cursor-2', { items: [{ code: 'TRIM-001', name: 'Button v2' }, { code: 'FAB-201', name: 'Silk' }], nextCursor: 'cursor-3' }],
    ['cursor-3', { items: [{ code: 'PACK-001', name: 'Bag' }], nextCursor: null }],
  ]);
  const loader = createLoader(async (requestPath) => {
    requests.push(requestPath);
    const url = new URL(requestPath, 'http://syntha.local');
    assert.equal(url.pathname, '/v2/materials');
    assert.equal(url.searchParams.get('limit'), '200');
    assert.equal(url.searchParams.get('status'), 'published');
    const cursor = url.searchParams.get('cursor');
    assert.ok(pages.has(cursor), `Unexpected cursor ${cursor}`);
    return pages.get(cursor);
  });

  const materials = await loader();
  assert.deepEqual(requests, [
    '/v2/materials?limit=200&status=published',
    '/v2/materials?limit=200&status=published&cursor=cursor-2',
    '/v2/materials?limit=200&status=published&cursor=cursor-3',
  ]);
  assert.deepEqual(materials, [
    { code: 'FAB-001', name: 'Wool' },
    { code: 'TRIM-001', name: 'Button v2' },
    { code: 'FAB-201', name: 'Silk' },
    { code: 'PACK-001', name: 'Bag' },
  ]);
});

test('BOM editor stops corrupted cyclic cursor responses instead of looping forever', async () => {
  let calls = 0;
  const loader = createLoader(async () => {
    calls += 1;
    return { items: [{ code: `MAT-${calls}`, name: 'Material' }], nextCursor: 'same-cursor' };
  });

  await assert.rejects(loader(), /циклический курсор/);
  assert.equal(calls, 2);
});
