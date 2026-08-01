import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, fingerprintsMatch } from '../src/core/fingerprints.mjs';
import { createCatalogService } from '../src/application/catalog-service.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('canonical JSON is independent of object key insertion order', () => {
  const left = {
    sku: 'SKU-1',
    terms: { paymentDays: 30, incoterm: 'DAP' },
    lines: [{ quantity: 2, sku: 'SKU-1' }],
  };
  const right = {
    lines: [{ sku: 'SKU-1', quantity: 2 }],
    terms: { incoterm: 'DAP', paymentDays: 30 },
    sku: 'SKU-1',
  };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(canonicalJson({ value: undefined, list: [undefined] }), '{"list":[null]}');
});

test('legacy fingerprints normalize JSON suffixes without trusting delimiter positions', () => {
  const legacy = 'createCampaign:actor{legacy}:{"season":"FW27","brandId":"brand-1","name":"Main"}';
  const current = `createCampaign:actor{legacy}:${canonicalJson({ name: 'Main', brandId: 'brand-1', season: 'FW27' })}`;
  assert.equal(fingerprintsMatch(legacy, current), true);
  assert.equal(fingerprintsMatch(legacy, `${current.slice(0, -1)},"other":true}`), false);
});

test('canonical JSON fails closed for unsafe values', () => {
  assert.throws(() => canonicalJson(Number.NaN), (error) => error.code === 'COMMAND_FINGERPRINT_VALUE_INVALID');
  assert.throws(() => canonicalJson(1n), (error) => error.code === 'COMMAND_FINGERPRINT_VALUE_INVALID');
  const circular = {};
  circular.self = circular;
  assert.throws(() => canonicalJson(circular), (error) => error.code === 'COMMAND_FINGERPRINT_CIRCULAR');
});

test('catalog command replay accepts reordered legacy JSON but rejects changed values', async () => {
  const originalInput = {
    sku: 'SKU-1',
    collectionId: 'collection-1',
    brandId: 'brand-1',
    name: 'Jacket',
    wholesalePrice: 10,
    currency: 'EUR',
    minimumOrderQuantity: 1,
    availableQuantity: 20,
  };
  const reorderedInput = {
    availableQuantity: 20,
    minimumOrderQuantity: 1,
    currency: 'EUR',
    wholesalePrice: 10,
    name: 'Jacket',
    brandId: 'brand-1',
    collectionId: 'collection-1',
    sku: 'SKU-1',
  };
  const previousResult = Object.freeze({ sku: 'SKU-1', status: 'draft' });
  const previous = {
    fingerprint: `createCatalogSku:actor-1:${JSON.stringify(originalInput)}`,
    result: previousResult,
  };
  const wholesaleStore = {
    async transaction(work) {
      return work({
        getCollection: async () => ({ id: 'collection-1', brandId: 'brand-1', currency: 'EUR' }),
        getMembership: async () => ({ organisationId: 'brand-1', status: 'active', role: 'owner' }),
        syncCatalogInventory() {},
      });
    },
  };
  const catalogStore = {
    async transaction(work) {
      return work({
        getCommand: async () => previous,
        insertSku() { throw new Error('replayed command must not execute'); },
      });
    },
  };
  const service = createCatalogService({ wholesaleStore, catalogStore });
  assert.equal(await service.createSku('command-1', 'actor-1', reorderedInput), previousResult);
  await assert.rejects(
    () => service.createSku('command-1', 'actor-1', { ...reorderedInput, wholesalePrice: 11 }),
    (error) => error.code === 'COMMAND_ID_CONFLICT',
  );
});

test('JSON-bearing application fingerprints use canonical serialization', async () => {
  for (const file of [
    'src/application/platform.mjs',
    'src/application/catalog-service.mjs',
    'src/application/showroom-selection-service.mjs',
    'src/application/order-builder-service.mjs',
  ]) {
    const source = await readFile(path.join(root, file), 'utf8');
    assert.match(source, /canonicalJson/);
    assert.doesNotMatch(source, /\$\{JSON\.stringify\(/, file);
    assert.match(source, /fingerprintsMatch\(previous\.fingerprint, fingerprint\)/);
  }
});
