import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { bootstrapMdmReference } from '../../src/infrastructure/mdm-reference-bootstrap.mjs';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
import { createPostgresProductIdentityStore } from '../../src/infrastructure/postgres-product-identity-store.mjs';

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;
const dataset = JSON.parse(await fs.readFile(new URL('../../mdm/reference/russia-fashion-core.json', import.meta.url), 'utf8'));
// Ожидания считаются по самому набору, а не вписаны числом: когда в него добавили справочник,
// тест упал на «6 !== 5», хотя загрузчик отработал верно. Проверять надо, что загружено ровно
// то, что описано, — это остаётся правдой при любом размере набора.
const EXPECTED_DICTIONARIES = dataset.dictionaries.length;
const EXPECTED_ENTRIES = dataset.dictionaries.reduce((total, dictionary) => total + (dictionary.entries?.length ?? 0), 0);

test('Russia fashion reference core bootstraps idempotently and is readable by Product Identity', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');
  const pool = new Pool({ connectionString, max: 2 });
  const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
  try {
    await migratePostgres({ pool, migrationsDir });

    const first = await bootstrapMdmReference({ pool, datasets: [dataset], actorId: 'test:mdm-bootstrap' });
    assert.equal(first.insertedDictionaries + first.existingDictionaries + first.evolvedDictionaries, EXPECTED_DICTIONARIES);
    assert.equal(first.insertedEntries + first.existingEntries + first.evolvedEntries, EXPECTED_ENTRIES);

    const second = await bootstrapMdmReference({ pool, datasets: [dataset], actorId: 'test:mdm-bootstrap-replay' });
    assert.equal(second.insertedDictionaries, 0);
    assert.equal(second.insertedEntries, 0);
    assert.equal(second.existingDictionaries + second.evolvedDictionaries, EXPECTED_DICTIONARIES);
    assert.equal(second.existingEntries + second.evolvedEntries, EXPECTED_ENTRIES);

    const store = createPostgresProductIdentityStore({ pool });
    const resolved = await store.transaction(async (tx) => ({
      sizeSystem: await tx.getMdmEntryVersion('mdm-entry:size-system:ru-apparel-numeric', 1),
      sizeValue: await tx.getMdmEntryVersion('mdm-entry:size:ru-46', 1),
    }));

    assert.equal(resolved.sizeSystem.dictionaryCode, 'size.system');
    assert.equal(resolved.sizeSystem.status, 'active');
    assert.equal(resolved.sizeSystem.approvalStatus, 'not_required');
    assert.equal(resolved.sizeSystem.snapshot.translations.ru, 'Российская числовая система одежды');
    assert.equal(resolved.sizeValue.dictionaryCode, 'size.size');
    assert.equal(resolved.sizeValue.snapshot.attributes.size_system_entry_id, 'mdm-entry:size-system:ru-apparel-numeric');
    assert.equal(resolved.sizeValue.snapshot.attributes.display_code, '46');
  } finally {
    await pool.end();
  }
});
