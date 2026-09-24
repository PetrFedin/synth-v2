import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;
const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

// Правила обмеров живут и в домене, и теперь в базе. Проверять их нужно **в обход домена** — сырым
// SQL, — иначе тест доказывает только то, что модуль вызывает сам себя. Смысл триггера ровно в
// путях, которые через приложение не идут: миграция, скрипт, ручная правка в консоли.

const CHART = 'measurement_trigger-probe';
const BRAND = 'brand_trigger-probe';
// Таблица обмеров обязана быть либо SKU-формы, либо канонической (measurement_charts_identity_kind_check).
// Для проверки триггеров берём SKU-форму: она короче и правилам не мешает.
const SKU = 'SYN.TRIGGER.PROBE';

async function seedPublishedChart(pool) {
  const payload = {
    id: CHART,
    sku: SKU,
    unit: 'CM',
    sizes: [{ code: 'M', label: 'M', position: 1 }],
    points: [{
      pointCode: 'CHEST_CIRC',
      name: 'Обхват груди изделия',
      position: 1,
      measurements: [{ sizeCode: 'M', value: 112, deltaFromPrevious: null }],
    }],
  };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO organisations (id, type, payload) VALUES ($1, 'brand', $2::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [BRAND, JSON.stringify({ id: BRAND, type: 'brand', name: 'Trigger Probe Brand' })],
    );
    await client.query(
      `INSERT INTO measurement_charts (id, sku, brand_id, sku_version, status, unit, base_size_code, version, payload, created_at, updated_at, published_at)
       VALUES ($1, $2, $3, 1, 'published', 'CM', 'M', 1, $4::jsonb, now(), now(), now())`,
      [CHART, SKU, BRAND, JSON.stringify(payload)],
    );
    await client.query(
      `INSERT INTO measurement_chart_sizes (chart_id, size_code, label, position) VALUES ($1, 'M', 'M', 1)`,
      [CHART],
    );
    await client.query(
      `INSERT INTO measurement_points (chart_id, point_code, name, position, tolerance_plus, tolerance_minus, payload)
       VALUES ($1, 'CHEST_CIRC', 'Обхват груди изделия', 1, 0, 0, '{}'::jsonb)`,
      [CHART],
    );
    await client.query(
      `INSERT INTO measurement_values (chart_id, point_code, size_code, value, delta_from_previous, source)
       VALUES ($1, 'CHEST_CIRC', 'M', 112, NULL, 'override')`,
      [CHART],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Правило имеет прямое следствие для любой уборки: опубликованную таблицу нельзя снести, пока эта
// версия не в архиве. Это не неудобство теста, а смысл правила — поэтому уборка сначала
// архивирует, как это делает и приложение, и лишь потом удаляет.
// Уборка идёт тем же путём, каким шло бы приложение, и это свойство правил, а не обход их:
// опубликованную таблицу нельзя ни подменить, ни снести, пока её версия не сохранена. Причём
// **удалить опубликованную нельзя вовсе**: внешний ключ требует снять архив раньше таблицы, а
// правило требует, чтобы архив был на месте. Законный порядок один — сохранить версию, увести
// таблицу в черновик и лишь тогда разбирать. Черновик правила не охраняют: охраняется то, что
// уже показали байеру и фабрике.
async function removeChart(pool, chartId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO measurement_chart_revisions (chart_id, revision_version, sku, brand_id, sku_version, payload, published_at, archived_at)
       SELECT id, version, sku, brand_id, sku_version, payload, COALESCE(published_at, now()), now()
         FROM measurement_charts WHERE id = $1 AND status = 'published'
       ON CONFLICT DO NOTHING`,
      [chartId],
    );
    await client.query(`UPDATE measurement_charts SET status = 'draft', published_at = NULL WHERE id = $1 AND status = 'published'`, [chartId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const second = await pool.connect();
  try {
    await second.query('BEGIN');
    await second.query('DELETE FROM measurement_values WHERE chart_id = $1', [chartId]);
    await second.query('DELETE FROM measurement_points WHERE chart_id = $1', [chartId]);
    await second.query('DELETE FROM measurement_chart_sizes WHERE chart_id = $1', [chartId]);
    await second.query('DELETE FROM measurement_chart_revisions WHERE chart_id = $1', [chartId]);
    await second.query('DELETE FROM measurement_charts WHERE id = $1', [chartId]);
    await second.query('COMMIT');
  } catch (error) {
    await second.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    second.release();
  }
}

async function refusalFor(pool, statements) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const statement of statements) await client.query(statement);
    await client.query('COMMIT');
    return null;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return error.message;
  } finally {
    client.release();
  }
}

test('published measurement charts hold their own rules against raw SQL', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');
  const pool = new Pool({ connectionString, max: 2 });
  try {
    await migratePostgres({ pool, migrationsDir });
    await removeChart(pool, CHART);
    // Законная публикация проходит — иначе правило запрещало бы работу, а не нарушение.
    await seedPublishedChart(pool);

    // 1. Матрица опубликованной таблицы не может стать неполной.
    assert.match(
      await refusalFor(pool, [`DELETE FROM measurement_values WHERE chart_id = '${CHART}'`]),
      /MEASUREMENT_MATRIX_INCOMPLETE/,
    );
    assert.match(
      await refusalFor(pool, [`INSERT INTO measurement_chart_sizes (chart_id, size_code, label, position) VALUES ('${CHART}', 'L', 'L', 2)`]),
      /MEASUREMENT_(MATRIX_INCOMPLETE|PROJECTION_DIVERGED)/,
    );

    // 2. payload и проекции обязаны совпадать — и составом, и самим числом. Второе важнее: реестр
    //    показывал бы обхват груди 119 см там, где payload держит 112, и изделие скроили бы по
    //    одному из двух.
    assert.match(
      await refusalFor(pool, [`UPDATE measurement_values SET value = value + 7 WHERE chart_id = '${CHART}'`]),
      /MEASUREMENT_PROJECTION_DIVERGED/,
    );
    assert.match(
      await refusalFor(pool, [`UPDATE measurement_charts SET payload = jsonb_set(payload, '{points,0,measurements,0,value}', '999') WHERE id = '${CHART}'`]),
      /MEASUREMENT_PROJECTION_DIVERGED/,
    );
    assert.match(
      await refusalFor(pool, [`UPDATE measurement_charts SET payload = jsonb_set(payload, '{points,0,pointCode}', '"FORGED"') WHERE id = '${CHART}'`]),
      /MEASUREMENT_PROJECTION_DIVERGED/,
    );

    // 3. Опубликованную версию нельзя заменить или удалить, не сохранив её в архиве: именно по ней
    //    кроили и принимали.
    assert.match(
      await refusalFor(pool, [`UPDATE measurement_charts SET version = version + 1 WHERE id = '${CHART}'`]),
      /MEASUREMENT_PUBLISHED_REVISION_NOT_ARCHIVED/,
    );
    assert.match(
      await refusalFor(pool, [
        `DELETE FROM measurement_values WHERE chart_id = '${CHART}'`,
        `DELETE FROM measurement_points WHERE chart_id = '${CHART}'`,
        `DELETE FROM measurement_chart_sizes WHERE chart_id = '${CHART}'`,
        `DELETE FROM measurement_charts WHERE id = '${CHART}'`,
      ]),
      /MEASUREMENT_PUBLISHED_REVISION_NOT_ARCHIVED/,
    );

    // Вместе с внешним ключом правило даёт свойство сильнее заявленного: опубликованную таблицу
    // **нельзя удалить вовсе**. Снять архив раньше таблицы требует внешний ключ, а правило требует,
    // чтобы архив был на месте, — оба сразу не выполнить. Это и проверяется, чтобы свойство было
    // названным, а не случайным.
    assert.match(
      await refusalFor(pool, [
        `DELETE FROM measurement_chart_revisions WHERE chart_id = '${CHART}'`,
        `DELETE FROM measurement_values WHERE chart_id = '${CHART}'`,
        `DELETE FROM measurement_points WHERE chart_id = '${CHART}'`,
        `DELETE FROM measurement_chart_sizes WHERE chart_id = '${CHART}'`,
        `DELETE FROM measurement_charts WHERE id = '${CHART}'`,
      ]),
      /MEASUREMENT_PUBLISHED_REVISION_NOT_ARCHIVED/,
    );

    // …а с архивом — можно: правило охраняет прошлое, а не запрещает ревизию.
    assert.equal(
      await refusalFor(pool, [
        `INSERT INTO measurement_chart_revisions (chart_id, revision_version, sku, brand_id, sku_version, payload, published_at, archived_at)
         SELECT id, version, sku, brand_id, sku_version, payload, published_at, now() FROM measurement_charts WHERE id = '${CHART}'`,
        `UPDATE measurement_charts SET version = version + 1 WHERE id = '${CHART}'`,
      ]),
      null,
    );

    // Черновик вправе быть неполным: домен проверяет полноту только при публикации. Но уйти в
    // черновик можно тоже лишь с архивом — иначе опубликованная версия исчезнет. Здесь это и
    // видно: перед уходом архивируется текущая версия, и лишь тогда правило уступает.
    assert.equal(
      await refusalFor(pool, [
        `INSERT INTO measurement_chart_revisions (chart_id, revision_version, sku, brand_id, sku_version, payload, published_at, archived_at)
         SELECT id, version, sku, brand_id, sku_version, payload, published_at, now() FROM measurement_charts WHERE id = '${CHART}'`,
        `UPDATE measurement_charts SET status = 'draft', published_at = NULL WHERE id = '${CHART}'`,
        `DELETE FROM measurement_values WHERE chart_id = '${CHART}'`,
        `UPDATE measurement_charts SET payload = jsonb_set(payload, '{points,0,measurements}', '[]'::jsonb) WHERE id = '${CHART}'`,
      ]),
      null,
    );
  } finally {
    await removeChart(pool, CHART).catch(() => {});
    await pool.query('DELETE FROM organisations WHERE id = $1', [BRAND]).catch(() => {});
    await pool.end();
  }
});
