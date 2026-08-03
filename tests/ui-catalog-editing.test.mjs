import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const form = await readFile(new URL('../public/modules/catalog-form.js', import.meta.url), 'utf8');
const view = await readFile(new URL('../public/modules/catalog.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../public/modules/api.js', import.meta.url), 'utf8');

test('catalog edit reloads the actor-scoped detail and submits only mutable fields with expectedVersion', () => {
  assert.match(form, /api\(`\/v2\/catalog\/skus\/\$\{encodeURIComponent\(item\.sku\)\}`\)/);
  assert.match(form, /latest\.status !== 'draft'/);
  assert.match(form, /mutate\(`\/v2\/catalog\/skus\/\$\{encodeURIComponent\(latest\.sku\)\}`/);
  assert.match(form, /expectedVersion: latest\.version/);
  assert.match(form, /}, 'PATCH'\)\)/);
  const editBlock = form.slice(form.indexOf('async function catalogSkuEditForm'));
  assert.doesNotMatch(editBlock, /collectionId:/);
  assert.doesNotMatch(editBlock, /brandId:/);
  assert.doesNotMatch(editBlock, /currency:/);
  assert.doesNotMatch(editBlock, /sku:/);
});

test('draft cards expose edit independently from publication and publish with the rendered version', () => {
  assert.match(view, /canManageDraft/);
  assert.match(view, /actions\.push\(catalogEditActionButton\(item\)\)/);
  assert.match(view, /collection\?\.status === 'published'/);
  assert.match(view, /\{ expectedVersion: item\.version \}/);
  assert.match(view, /runAction\(\(\) => catalogSkuEditForm\(item\), button\)/);
});

test('API errors preserve structured concurrency details for recovery UI', () => {
  assert.match(api, /error\.details = payload\.error\?\.details \|\| \{\}/);
});
