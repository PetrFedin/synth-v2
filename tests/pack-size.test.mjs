import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createCatalogSku, updateDraftCatalogSku } from '../src/modules/catalog/public.mjs';
import { assertBuyerCatalogQuantity } from '../src/modules/commercial-publication/buyer-catalog-product.mjs';

const root = process.cwd();
const collection = { id: 'collection-1', brandId: 'brand-1', currency: 'EUR' };
const base = { sku: 'TEE-1', collection, brandId: 'brand-1', name: 'Tee', wholesalePrice: 24, currency: 'EUR', createdAt: '2026-09-21T09:00:00.000Z' };
function makeSku(overrides = {}) {
  return createCatalogSku({ ...base, minimumOrderQuantity: 12, availableQuantity: 600, ...overrides });
}
function codeOf(fn) { try { fn(); } catch (error) { return error.code; } return 'NO_ERROR'; }

test('A SKU may declare the box its goods travel in', () => {
  assert.equal(makeSku({ packSize: 6 }).packSize, 6);
  assert.equal(makeSku().packSize, null, 'no pack means the SKU is sold by the unit');
  assert.equal(makeSku({ packSize: null }).packSize, null);
});

test('A minimum that no whole number of boxes can reach is refused where it is set', () => {
  // A minimum of twelve with a pack of five is not two rules, it is a contradiction: the smallest
  // orderable quantity at or above twelve is fifteen, so the stated minimum is unreachable. The
  // brand hears it now; the buyer would otherwise hear it as a refusal they cannot act on.
  assert.equal(codeOf(() => makeSku({ packSize: 5 })), 'CATALOG_PACK_SIZE_CONFLICTS_MOQ');
  assert.equal(makeSku({ minimumOrderQuantity: 15, packSize: 5 }).packSize, 5);
  assert.equal(codeOf(() => makeSku({ packSize: 0 })), 'CATALOG_PACK_SIZE_INVALID');
  assert.equal(codeOf(() => makeSku({ packSize: 2.5 })), 'CATALOG_PACK_SIZE_INVALID');
});

test('An edit that does not mention the pack keeps it', () => {
  const sku = makeSku({ packSize: 6 });
  const edited = updateDraftCatalogSku(sku, collection, { name: 'Tee two', wholesalePrice: 25, minimumOrderQuantity: 12, availableQuantity: 600 }, '2026-09-21T10:00:00.000Z');
  assert.equal(edited.packSize, 6, 'a field nobody mentioned is not a field they asked to clear');
  const cleared = updateDraftCatalogSku(sku, collection, { name: 'Tee', wholesalePrice: 24, minimumOrderQuantity: 12, availableQuantity: 600, packSize: null }, '2026-09-21T10:00:00.000Z');
  assert.equal(cleared.packSize, null);
});

test('A quantity between two boxes is refused, and the refusal names the next whole box', () => {
  const product = { sku: 'TEE-1', minimumOrderQuantity: 12, packSize: 6, availability: null };
  assert.doesNotThrow(() => assertBuyerCatalogQuantity(product, 12));
  assert.doesNotThrow(() => assertBuyerCatalogQuantity(product, 18));
  try {
    assertBuyerCatalogQuantity(product, 14);
    assert.fail('an off-pack quantity must be refused');
  } catch (error) {
    assert.equal(error.code, 'BUYER_CATALOG_PACK_MULTIPLE_NOT_MET');
    assert.equal(error.details.nearest, 18, 'the refusal does the division so the buyer does not have to');
  }
  // With no pack declared the SKU is sold by the unit and any quantity above the minimum stands.
  assert.doesNotThrow(() => assertBuyerCatalogQuantity({ ...product, packSize: null }, 14));
});

test('The pack travels frozen from the SKU to the cell the order is typed in', async () => {
  const sql = await readFile(path.join(root, 'db/migrations/108_catalog_sku_pack_size.sql'), 'utf8');
  assert.match(sql, /minimum_order_quantity % pack_size = 0/, 'the database holds the same contradiction rule');
  assert.match(sql, /pack_size IS NULL OR pack_size >= 1/);

  const publication = await readFile(path.join(root, 'src/modules/commercial-publication/public.mjs'), 'utf8');
  assert.ok(publication.includes('packSize: sku.packSize ?? null'), 'the publication freezes the pack with the price');
  assert.ok(publication.includes('packSize: preparation.packSize ?? null'), 'so does the price line');

  const source = await readFile(path.join(root, 'src/modules/commercial-publication/canonical-source.mjs'), 'utf8');
  assert.ok(source.includes('buyerPackSize: price.packSize ?? null'), 'and the buyer catalogue carries it');

  const matrix = await readFile(path.join(root, 'public/modules/linesheet-matrix-core.js'), 'utf8');
  assert.match(matrix, /BUYER_MATRIX_PACK_MULTIPLE_NOT_MET/, 'the save is refused off-pack, not only the cell');

  const grid = await readFile(path.join(root, 'public/modules/order-grid-core.js'), 'utf8');
  assert.match(grid, /PACK_MULTIPLE_NOT_MET/, 'and the cell says so where the number was typed');
  assert.match(grid, /BELOW_PACK_STOCK/, 'stock under one box is the same dead end as no stock');

  const ui = await readFile(path.join(root, 'public/modules/linesheets.js'), 'utf8');
  assert.ok(ui.includes('Кратно'), 'the cell names the next whole box rather than leaving the reader to divide');
});
