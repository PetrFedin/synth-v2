import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createShowroomLook, updateShowroomLook } from '../src/modules/showroom-looks/public.mjs';

const showroom = Object.freeze({ id: 'showroom-1', brandId: 'brand-1', collectionId: 'collection-1', status: 'open' });
const collection = Object.freeze({ id: 'collection-1' });
const base = Object.freeze({
  id: 'look-1', showroom, collection, position: 1,
  titleRu: 'Городской слой', titleEn: 'City layer',
  skus: ['SKU-A', 'SKU-B'], createdAt: '2026-09-20T10:00:00.000Z', createdBy: 'owner',
});

test('a look belongs to the collection its showroom presents', () => {
  const look = createShowroomLook(base);
  assert.equal(look.collectionId, 'collection-1');
  assert.equal(look.showroomId, 'showroom-1');
  assert.throws(
    () => createShowroomLook({ ...base, collection: { id: 'another-collection' } }),
    (error) => error.code === 'SHOWROOM_LOOK_COLLECTION_MISMATCH',
  );
});

test('a look a buyer cannot order from is not a look', () => {
  // Empty, or the same piece twice, or more than a rail holds.
  assert.throws(() => createShowroomLook({ ...base, skus: [] }), (error) => error.code === 'SHOWROOM_LOOK_PRODUCTS_INVALID');
  assert.throws(() => createShowroomLook({ ...base, skus: Array.from({ length: 25 }, (_, index) => `SKU-${index}`) }),
    (error) => error.code === 'SHOWROOM_LOOK_PRODUCTS_INVALID');
  assert.throws(() => createShowroomLook({ ...base, skus: ['SKU-A', 'SKU-A'] }), (error) => error.code === 'SHOWROOM_LOOK_SKU_DUPLICATE');
});

test('a closed showroom is not composed any further', () => {
  assert.throws(
    () => createShowroomLook({ ...base, showroom: { ...showroom, status: 'closed' } }),
    (error) => error.code === 'SHOWROOM_CLOSED',
  );
});

test('the order a brand chose is a number, not an accident', () => {
  for (const position of [0, -1, 501, 2.5, '3', null]) {
    assert.throws(() => createShowroomLook({ ...base, position }), (error) => error.code === 'SHOWROOM_LOOK_POSITION_INVALID');
  }
});

test('an image is a link, because there is nowhere to upload one yet', () => {
  assert.equal(createShowroomLook({ ...base, imageUri: '  https://cdn.example/look-1.jpg ' }).imageUri, 'https://cdn.example/look-1.jpg');
  assert.equal(createShowroomLook({ ...base, imageUri: '' }).imageUri, null);
  for (const uri of ['/local/look.jpg', 'http://cdn.example/x.jpg', 'data:image/png;base64,AAA', 'javascript:alert(1)']) {
    assert.throws(() => createShowroomLook({ ...base, imageUri: uri }), (error) => error.code === 'SHOWROOM_LOOK_IMAGE_INVALID', `accepted ${uri}`);
  }
});

test('editing a look keeps what was not touched and refuses a stale version', () => {
  const look = createShowroomLook({ ...base, storyRu: 'Первый текст', storyEn: 'First story' });
  const changed = updateShowroomLook(look, { titleRu: 'Слой города', updatedAt: '2026-09-21T10:00:00.000Z', updatedBy: 'owner', expectedVersion: 1 });
  assert.equal(changed.titleRu, 'Слой города');
  assert.equal(changed.titleEn, 'City layer');
  assert.deepEqual([...changed.skus], ['SKU-A', 'SKU-B']);
  assert.equal(changed.storyRu, 'Первый текст');
  assert.equal(changed.version, 2);
  assert.throws(
    () => updateShowroomLook(look, { titleRu: 'Ещё раз', updatedAt: '2026-09-21T11:00:00.000Z', updatedBy: 'owner', expectedVersion: 7 }),
    (error) => error.code === 'SHOWROOM_LOOK_CONCURRENCY_CONFLICT',
  );
});

test('the database holds the same two rules the domain does', async () => {
  const sql = await readFile(new URL('../db/migrations/100_showroom_looks.sql', import.meta.url), 'utf8');
  // A look showing something outside its collection is the one failure a buyer would feel.
  assert.match(sql, /SHOWROOM_LOOK_SKU_OUTSIDE_COLLECTION/);
  assert.match(sql, /SHOWROOM_LOOK_SHOWROOM_MISMATCH/);
  assert.match(sql, /showroom_looks_position_unique UNIQUE \(showroom_id, position\)/);
  // The buyer's view carries the commercial facts, not just the codes a brand picked.
  assert.match(sql, /'wholesalePrice', sku\.wholesale_price/);
  assert.match(sql, /'minimumOrderQuantity', sku\.minimum_order_quantity/);
});
