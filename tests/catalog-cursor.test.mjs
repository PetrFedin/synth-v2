import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { decodeCatalogCursor, encodeCatalogCursor } from '../src/core/catalog-cursor.mjs';

test('catalog cursor round-trips canonically and is bound to filter scope', () => {
  const cursor = encodeCatalogCursor({ scope: '[null,"published",null,null]', sku: 'SKU-10' });
  assert.deepEqual(decodeCatalogCursor(cursor, { scope: '[null,"published",null,null]' }), {
    scope: '[null,"published",null,null]',
    sku: 'SKU-10',
  });
  assert.throws(
    () => decodeCatalogCursor(cursor, { scope: '[null,"draft",null,null]' }),
    (error) => error?.code === 'CATALOG_CURSOR_INVALID',
  );
});

test('catalog cursor rejects malformed, noncanonical and invalid payloads', () => {
  for (const cursor of ['', 'not+base64', Buffer.from(JSON.stringify([2, 'scope', 'SKU-10'])).toString('base64url')]) {
    assert.throws(() => decodeCatalogCursor(cursor), (error) => error?.code === 'CATALOG_CURSOR_INVALID');
  }
  assert.throws(
    () => encodeCatalogCursor({ scope: 'scope', sku: 'bad sku' }),
    (error) => error?.code === 'CATALOG_CURSOR_INVALID',
  );
});
