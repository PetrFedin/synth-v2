import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-09-19T10:00:00.000Z';

test('PostgreSQL resolves a plan written in words, refuses the whole file while a row is wrong, and skips what is already planned', { skip: !databaseUrl }, async () => {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
    await seed(pool);
    let sequence = 0;
    const runtime = createPostgresWholesaleRuntime({ pool, clock: () => now, nextId: (prefix) => `${prefix}-import-pg-${++sequence}` });

    const good = [
      { line: 2, placeholderCode: 'SS27-OUT-001', nameRu: 'Куртка', nameEn: 'Jacket', category: 'Одежда', currency: 'EUR', recommendedRetailPrice: '249,00', plannedUnitCost: '72,50', plannedQuantity: '1 200' },
      { line: 3, placeholderCode: 'SS27-TOP-002', nameRu: 'Футболка', nameEn: 'Tee', category: 'APPAREL', currency: 'EUR', recommendedRetailPrice: '39.00' },
    ];

    // A dry run says what would happen and writes nothing.
    const dry = await runtime.platform.importProductPlaceholders('cmd-dry', 'brand-owner', { campaignId: 'campaign-import-pg', mode: 'validate', rows: good });
    assert.equal(dry.committed, false);
    assert.deepEqual(dry.summary, { total: 2, ready: 2, skipped: 0, rejected: 0 });
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM product_placeholders')).rows[0].count, 0);

    // One wrong row holds the whole file back: a season half-loaded looks exactly like a season.
    const mixed = [...good, { line: 4, placeholderCode: 'SS27-UNK-003', nameRu: 'Космос', nameEn: 'Space', category: 'Космос', currency: 'EUR' }];
    const refused = await runtime.platform.importProductPlaceholders('cmd-mixed', 'brand-owner', { campaignId: 'campaign-import-pg', mode: 'commit', rows: mixed });
    assert.equal(refused.committed, false);
    assert.equal(refused.summary.rejected, 1);
    assert.deepEqual(refused.rows.find((row) => row.line === 4).problems, [{ column: 'category', reason: 'unknownValue', value: 'Космос' }]);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM product_placeholders')).rows[0].count, 0);

    const committed = await runtime.platform.importProductPlaceholders('cmd-commit', 'brand-owner', { campaignId: 'campaign-import-pg', mode: 'commit', rows: good });
    assert.equal(committed.committed, true);
    assert.deepEqual(committed.summary, { total: 2, ready: 2, skipped: 0, rejected: 0 });
    assert.deepEqual(committed.rows.map((row) => row.verdict), ['created', 'created']);

    // The words in the file became governed references, and the derived margin follows the two prices.
    const stored = await pool.query('SELECT placeholder_code, category_entry_id, category_entry_version, planned_quantity, planned_margin_basis_points FROM product_placeholders ORDER BY placeholder_code');
    assert.equal(stored.rows[0].category_entry_id, 'mdm-entry:category:apparel');
    assert.equal(stored.rows[0].category_entry_version, 1);
    assert.equal(stored.rows[0].planned_quantity, 1200);
    assert.equal(stored.rows[0].planned_margin_basis_points, 7088);
    // "APPAREL" and "Одежда" are the same entry; a file may use either.
    assert.equal(stored.rows[1].category_entry_id, 'mdm-entry:category:apparel');

    // Sending a corrected file again must not double the plan.
    const again = await runtime.platform.importProductPlaceholders('cmd-again', 'brand-owner', { campaignId: 'campaign-import-pg', mode: 'commit', rows: good });
    assert.equal(again.committed, false);
    assert.deepEqual(again.summary, { total: 2, ready: 0, skipped: 2, rejected: 0 });
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM product_placeholders')).rows[0].count, 2);

    // An import is a decision about a brand's plan, so it needs standing in that brand.
    await assert.rejects(
      () => runtime.platform.importProductPlaceholders('cmd-outsider', 'nobody', { campaignId: 'campaign-import-pg', mode: 'commit', rows: good }),
      (error) => ['ACTIVE_MEMBERSHIP_REQUIRED', 'MEMBERSHIP_NOT_FOUND', 'CAPABILITY_DENIED'].includes(error.code),
    );
    await assert.rejects(
      () => runtime.platform.importProductPlaceholders('cmd-empty', 'brand-owner', { campaignId: 'campaign-import-pg', mode: 'validate', rows: [] }),
      (error) => error.code === 'PLACEHOLDER_IMPORT_EMPTY',
    );
  } finally {
    await pool.end();
  }
});

async function seed(pool) {
  const brand = { id: 'brand-import-pg', type: 'brand', name: 'Import Brand' };
  await pool.query('INSERT INTO organisations (id, type, payload) VALUES ($1,$2,$3::jsonb)', [brand.id, 'brand', JSON.stringify(brand)]);
  const owner = { id: 'm-owner-import', organisationId: brand.id, organisationType: 'brand', userId: 'brand-owner', role: 'owner', status: 'active' };
  await pool.query('INSERT INTO memberships (id,organisation_id,user_id,organisation_type,role,status,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)',
    [owner.id, brand.id, owner.userId, 'brand', 'owner', 'active', JSON.stringify(owner)]);
  const campaign = { id: 'campaign-import-pg', brandId: brand.id, status: 'open', version: 1 };
  await pool.query('INSERT INTO campaigns (id,brand_id,status,version,payload) VALUES ($1,$2,$3,$4,$5::jsonb)', [campaign.id, brand.id, 'open', 1, JSON.stringify(campaign)]);
  await seedDictionary(pool);
}

async function seedDictionary(pool) {
  const columns = (await pool.query(
    `SELECT column_name, is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'mdm_dictionaries' AND is_nullable = 'NO' AND column_default IS NULL`,
  )).rows.map((row) => row.column_name);
  const dictionary = {
    id: 'mdm-dictionary:category', code: 'assortment.category', name: 'Assortment category',
    status: 'active', version: 1, domain: 'product', data_class: 'classifier', scope_model: 'global',
    owner_actor_id: 'system', steward_actor_id: 'system', approval_status: 'approved',
    source_system: 'reference', lifecycle: 'active', created_at: now, updated_at: now,
    payload: JSON.stringify({ code: 'assortment.category' }), translations: JSON.stringify({ ru: 'Категория' }),
    names: JSON.stringify({ ru: 'Категория', en: 'Assortment category' }),
    external_ids: JSON.stringify({}), aliases: JSON.stringify([]), tenant_id: null,
    created_by: 'system', updated_by: 'system',
  };
  await insertRow(pool, 'mdm_dictionaries', dictionary, columns);

  const entryColumns = (await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'mdm_entries' AND is_nullable = 'NO' AND column_default IS NULL`,
  )).rows.map((row) => row.column_name);
  await insertRow(pool, 'mdm_entries', {
    id: 'mdm-entry:category:apparel', dictionary_id: dictionary.id, code: 'APPAREL', name: 'Одежда',
    translations: JSON.stringify({ ru: 'Одежда', en: 'Apparel' }), aliases: JSON.stringify(['Верхняя одежда']),
    status: 'active', version: 1, source_system: 'reference', owner_actor_id: 'system',
    steward_actor_id: 'system', approval_status: 'approved', external_ids: JSON.stringify({}),
    created_at: now, updated_at: now, payload: JSON.stringify({ code: 'APPAREL' }), tenant_id: null,
    parent_id: null, valid_from: now, valid_to: null,
    names: JSON.stringify({ ru: 'Одежда', en: 'Apparel' }), created_by: 'system', updated_by: 'system',
  }, entryColumns);
}

async function insertRow(pool, table, candidate, requiredColumns) {
  const present = (await pool.query(
    'SELECT column_name FROM information_schema.columns WHERE table_name = $1', [table],
  )).rows.map((row) => row.column_name);
  const missing = requiredColumns.filter((column) => candidate[column] === undefined);
  assert.deepEqual(missing, [], `${table} needs values for ${missing.join(', ')}`);
  const fields = Object.keys(candidate).filter((field) => present.includes(field));
  const placeholders = fields.map((field, index) => (
    ['payload', 'translations', 'aliases', 'external_ids', 'names'].includes(field) ? `$${index + 1}::jsonb` : `$${index + 1}`
  ));
  await pool.query(
    `INSERT INTO ${table} (${fields.join(',')}) VALUES (${placeholders.join(',')})`,
    fields.map((field) => candidate[field]),
  );
}
