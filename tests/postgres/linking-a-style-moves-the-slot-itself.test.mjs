import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;
const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

// Слот перестаёт быть планом, когда под него связали первую модель, — и переводит его триггер базы,
// чтобы вызывающий не мог про это забыть. Двигал он при этом только колонки `status` и `version`,
// оставляя `payload` прежним, а полезная нагрузка в этой системе и есть запись: её читает домен,
// её версию сверяет `transitionProductPlaceholder`.
//
// Найдено живьём на демо-данных: слот показывал человеку версию 2 и статус «в разработке», кнопка
// посылала 2, писатель читал из нагрузки 1 и отвечал конфликтом версий — слот замирал навсегда.
// Проверка идёт сырым SQL, в обход домена: смысл триггера ровно в путях, которые через приложение
// не идут.

const BRAND = 'organisation_slot-probe';
const CAMPAIGN = 'campaign_slot-probe';
const STYLE = 'product-style_slot-probe';
const PLACEHOLDER = 'product-placeholder_slot-probe';
const LINK = 'placeholder-style-link_slot-probe';
const AT = '2026-09-23T10:00:00.000Z';

// Убирается только то, что этот тест заводит заново. Модель, бренд и кампания остаются: строки
// Product Identity неизменяемы по правилу самой базы («Product Identity snapshot rows are
// immutable»), и удалять их — значит спорить с тем, что проверяешь.
async function reset(pool) {
  await pool.query('DELETE FROM product_placeholder_style_links WHERE id = $1', [LINK]);
  await pool.query('DELETE FROM product_placeholders WHERE id = $1', [PLACEHOLDER]);
}

async function seed(pool, { status = 'planned', version = 1, payloadVersion = version, payloadStatus = status } = {}) {
  await pool.query(
    'INSERT INTO organisations (id, type, payload) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
    [BRAND, 'brand', JSON.stringify({ id: BRAND, type: 'brand', name: 'Slot probe brand', status: 'active', version: 1 })],
  );
  await pool.query(
    'INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ($1, $2, $3, 1, $4) ON CONFLICT (id) DO NOTHING',
    [CAMPAIGN, BRAND, 'open', JSON.stringify({ id: CAMPAIGN, brandId: BRAND, status: 'open', version: 1 })],
  );
  await pool.query(
    `INSERT INTO product_styles (id, brand_id, style_code, lifecycle_status, version, created_at, created_by, updated_at, updated_by)
     VALUES ($1, $2, 'SLOT.PROBE', 'draft', 1, $3, 'probe', $3, 'probe') ON CONFLICT (id) DO NOTHING`,
    [STYLE, BRAND, AT],
  );
  const payload = {
    id: PLACEHOLDER,
    brandId: BRAND,
    campaignId: CAMPAIGN,
    placeholderCode: 'SLOT-PROBE-001',
    nameRu: 'Проверочный слот',
    nameEn: 'Probe slot',
    currency: 'EUR',
    status: payloadStatus,
    version: payloadVersion,
    createdAt: AT,
    createdBy: 'probe',
    updatedAt: AT,
    updatedBy: 'probe',
  };
  await pool.query(
    `INSERT INTO product_placeholders
       (id, brand_id, campaign_id, placeholder_code, name_ru, name_en, currency, status, version, payload, created_at, created_by, updated_at, updated_by)
     VALUES ($1, $2, $3, 'SLOT-PROBE-001', 'Проверочный слот', 'Probe slot', 'EUR', $4, $5, $6, $7, 'probe', $7, 'probe')`,
    [PLACEHOLDER, BRAND, CAMPAIGN, status, version, JSON.stringify(payload), AT],
  );
}

async function linkStyle(pool, linkedAt = '2026-09-23T11:30:45.123Z') {
  await pool.query(
    `INSERT INTO product_placeholder_style_links (id, placeholder_id, style_id, brand_id, campaign_id, linked_at, linked_by, payload)
     VALUES ($1, $2, $3, $4, $5, $6, 'linker', $7)`,
    [LINK, PLACEHOLDER, STYLE, BRAND, CAMPAIGN, linkedAt, JSON.stringify({ id: LINK, placeholderId: PLACEHOLDER, styleId: STYLE })],
  );
}

async function slot(pool) {
  const { rows } = await pool.query(
    `SELECT status, version, payload ->> 'status' AS payload_status,
            (payload ->> 'version')::int AS payload_version,
            payload ->> 'updatedAt' AS payload_updated_at,
            payload ->> 'updatedBy' AS payload_updated_by
       FROM product_placeholders WHERE id = $1`,
    [PLACEHOLDER],
  );
  return rows[0];
}

test('linking a style moves the slot in the record, not only in its columns', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');
  const pool = new Pool({ connectionString, max: 2 });
  try {
    await migratePostgres({ pool, migrationsDir });
    await reset(pool);
    await seed(pool);
    await linkStyle(pool);

    const moved = await slot(pool);
    // Колонка и нагрузка отвечают одно и то же — иначе читатель и писатель видят разные слоты.
    assert.equal(moved.status, 'in_development');
    assert.equal(moved.payload_status, 'in_development');
    assert.equal(moved.version, 2);
    assert.equal(moved.payload_version, 2);
    // Метка времени той же формы, что пишет приложение: ISO с миллисекундами и Z.
    assert.equal(moved.payload_updated_at, '2026-09-23T11:30:45.123Z');
    assert.equal(moved.payload_updated_by, 'linker');
  } finally {
    await reset(pool).catch(() => {});
    await pool.end();
  }
});

test('a slot that already left the plan is not moved back by a second link', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');
  const pool = new Pool({ connectionString, max: 2 });
  try {
    await migratePostgres({ pool, migrationsDir });
    await reset(pool);
    // Слот уже сдан: связывание ещё одной модели не должно возвращать его в разработку.
    await seed(pool, { status: 'delivered', version: 3 });
    await linkStyle(pool);

    const untouched = await slot(pool);
    assert.equal(untouched.status, 'delivered');
    assert.equal(untouched.payload_status, 'delivered');
    assert.equal(untouched.version, 3);
    assert.equal(untouched.payload_version, 3);
  } finally {
    await reset(pool).catch(() => {});
    await pool.end();
  }
});

test('slots the old trigger had already split are repaired by the migration', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');
  const pool = new Pool({ connectionString, max: 2 });
  try {
    await migratePostgres({ pool, migrationsDir });
    await reset(pool);
    // Ровно та подпись, какую оставлял прежний триггер: колонка ушла вперёд на одну версию, а
    // нагрузка осталась запланированной. Такой слот не переводился ни одним действием.
    await seed(pool, { status: 'in_development', version: 2, payloadStatus: 'planned', payloadVersion: 1 });

    const split = await slot(pool);
    assert.equal(split.payload_version, 1, 'the divergence must be reproducible at all');

    // Миграция выполняется один раз, поэтому починка проверяется её же условием, применённым
    // к этой строке: тест доказывает, что условие узнаёт подпись и сводит запись.
    await pool.query(`
      UPDATE product_placeholders
         SET payload = jsonb_set(
               jsonb_set(
                 jsonb_set(
                   jsonb_set(payload, '{status}', '"in_development"'::jsonb),
                   '{version}', to_jsonb(version)),
                 '{updatedAt}', to_jsonb(to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
               '{updatedBy}', to_jsonb(updated_by))
       WHERE status = 'in_development'
         AND payload ->> 'status' = 'planned'
         AND (payload ->> 'version')::int = version - 1`);

    const repaired = await slot(pool);
    assert.equal(repaired.payload_status, 'in_development');
    assert.equal(repaired.payload_version, 2);
    assert.equal(repaired.payload_updated_at, AT);
  } finally {
    await reset(pool).catch(() => {});
    await pool.end();
  }
});
