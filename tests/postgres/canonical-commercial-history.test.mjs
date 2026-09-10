import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
import { createPostgresCommercialPublicationStore } from '../../src/infrastructure/postgres-commercial-publication-store.mjs';

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;

test('pre-cutover V1 commercial history survives forward migrations unchanged but cannot seed fresh buyer truth', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required');
  const schema = `pub005_history_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString, max: 1 });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}`, max: 2 });
  const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
  const oldMigrationsDir = await mkdtemp(path.join(tmpdir(), 'syntha-pub005-history-'));

  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    for (const file of await readdir(migrationsDir)) {
      if (/^\d+.*\.sql$/.test(file) && Number(file.slice(0, 3)) <= 55) {
        await copyFile(path.join(migrationsDir, file), path.join(oldMigrationsDir, file));
      }
    }
    await migratePostgres({ pool, migrationsDir: oldMigrationsDir });

    await seedLegacyTopology(pool);
    const history = legacySnapshots();
    await insertPublication(pool, history.publication);
    await insertPrice(pool, history.price);
    await insertCatalog(pool, history.catalog);

    const before = await readHistory(pool, history);
    await migratePostgres({ pool, migrationsDir });
    const after = await readHistory(pool, history);
    assert.deepEqual(after, before, 'forward migration must not rewrite immutable V1 payloads');

    const store = createPostgresCommercialPublicationStore({ pool });
    assert.deepEqual(await store.getCommercialPublication(history.publication.id), history.publication);
    assert.deepEqual(await store.getBuyerCatalogVersion(history.catalog.id), history.catalog);

    await assert.rejects(
      insertPrice(pool, { ...history.price, id: 'history-price-new', contentHash: 'd'.repeat(64) }),
      (error) => error?.code === '23514' && error.message === 'PRICE_LIST_CANONICAL_PUBLICATION_REQUIRED',
    );
    await assert.rejects(
      insertCatalog(pool, { ...history.catalog, id: 'history-catalog-new', contentHash: 'e'.repeat(64) }),
      (error) => error?.code === '23514' && error.message === 'PRICE_LIST_CANONICAL_PUBLICATION_REQUIRED',
    );

    for (const [table, id] of [
      ['commercial_publications', history.publication.id],
      ['price_list_versions', history.price.id],
      ['buyer_catalog_versions', history.catalog.id],
    ]) {
      await assert.rejects(pool.query(`UPDATE ${table} SET payload = payload WHERE id = $1`, [id]), (error) => error?.code === '55000');
      await assert.rejects(pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]), (error) => error?.code === '55000');
    }
    assert.deepEqual(await readHistory(pool, history), before);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    await rm(oldMigrationsDir, { recursive: true, force: true });
  }
});

async function seedLegacyTopology(pool) {
  await pool.query(`INSERT INTO organisations (id, type, payload) VALUES
    ('history-brand', 'brand', '{"id":"history-brand","type":"brand"}'::jsonb),
    ('history-shop', 'shop', '{"id":"history-shop","type":"shop"}'::jsonb)`);
  await pool.query(`INSERT INTO campaigns (id, brand_id, status, version, payload)
    VALUES ('history-campaign', 'history-brand', 'open', 1, '{"id":"history-campaign"}'::jsonb)`);
  await pool.query(`INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload)
    VALUES ('history-collection', 'history-campaign', 'history-brand', 'published', 'EUR', 1, '{"id":"history-collection"}'::jsonb)`);
  await pool.query(`INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload)
    VALUES ('history-showroom', 'history-collection', 'history-brand', 'open', 1, '{"id":"history-showroom"}'::jsonb)`);
}

function legacySnapshots() {
  const publishedAt = '2026-08-01T00:00:00.000Z';
  const publication = {
    id: 'history-publication', brandId: 'history-brand', collectionId: 'history-collection', currency: 'EUR', status: 'published',
    lines: [{ sku: 'HISTORICAL-SKU', name: 'Historical', catalogVersion: 4, unitPrice: 100, currency: 'EUR', minimumOrderQuantity: 1 }],
    contentHash: 'a'.repeat(64), publishedAt,
  };
  const price = {
    id: 'history-price', publicationId: publication.id, brandId: publication.brandId, shopId: 'history-shop', currency: 'EUR', status: 'published',
    lines: [{ sku: 'HISTORICAL-SKU', catalogVersion: 4, unitPrice: 90, currency: 'EUR', minimumOrderQuantity: 1 }],
    contentHash: 'b'.repeat(64), publishedAt,
  };
  const catalog = {
    id: 'history-catalog', publicationId: publication.id, priceListVersionId: price.id, brandId: publication.brandId, shopId: price.shopId,
    showroomId: 'history-showroom', accessGrantId: 'history-access', collectionId: publication.collectionId, currency: 'EUR', status: 'published',
    lines: price.lines, contentHash: 'c'.repeat(64), publishedAt,
  };
  return { publication, price, catalog };
}

async function insertPublication(pool, value) {
  return pool.query(`INSERT INTO commercial_publications
    (id, brand_id, collection_id, currency, published_at, content_hash, payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
  [value.id, value.brandId, value.collectionId, value.currency, value.publishedAt, value.contentHash, JSON.stringify(value)]);
}
async function insertPrice(pool, value) {
  return pool.query(`INSERT INTO price_list_versions
    (id, publication_id, brand_id, shop_id, currency, published_at, content_hash, payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
  [value.id, value.publicationId, value.brandId, value.shopId, value.currency, value.publishedAt, value.contentHash, JSON.stringify(value)]);
}
async function insertCatalog(pool, value) {
  return pool.query(`INSERT INTO buyer_catalog_versions
    (id, publication_id, price_list_version_id, brand_id, shop_id, showroom_id, access_grant_id, currency, published_at, content_hash, payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
  [value.id, value.publicationId, value.priceListVersionId, value.brandId, value.shopId, value.showroomId, value.accessGrantId,
    value.currency, value.publishedAt, value.contentHash, JSON.stringify(value)]);
}
async function readHistory(pool, history) {
  const result = await pool.query(`SELECT
    (SELECT payload FROM commercial_publications WHERE id = $1) AS publication,
    (SELECT payload FROM price_list_versions WHERE id = $2) AS price,
    (SELECT payload FROM buyer_catalog_versions WHERE id = $3) AS catalog`,
  [history.publication.id, history.price.id, history.catalog.id]);
  return result.rows[0];
}
