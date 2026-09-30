import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createProductIdentityService } from '../src/application/product-identity-service.mjs';
import { createProductIdentityQueryService } from '../src/application/product-identity-query-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresProductIdentityStore } from '../src/infrastructure/postgres-product-identity-store.mjs';
import { createPostgresProductIdentityReader } from '../src/infrastructure/postgres-product-identity-reader.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { bootstrapMdmReference } from '../src/infrastructure/mdm-reference-bootstrap.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

// docs/backlog-not-yet-integrated.md, раздел C: «технологические узлы на продукте (справочник есть,
// привязки к изделию нет)» — справочник `design.construction_node` существовал с самого начала
// (заведён в BOL/последовательности операций), но ни разу не был привязываем к самому стилю. Этот
// тест проходит настоящий цикл сервис → стор → реальный PostgreSQL, с реальными каталогизированными
// записями справочника (не выдуманными кодами), включая обе уникальности доски (узел и позиция).
test('PostgreSQL Construction Node board attaches real design.construction_node entries to the style, replay-safe and duplicate-safe', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let tick = 0;
  const baseTime = Date.parse('2026-09-30T09:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
  const nextId = (prefix) => `${prefix}_${++tick}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });

    const constructionDataset = JSON.parse(await readFile(path.join(root, 'mdm', 'reference', 'russia-fashion-construction-core.json'), 'utf8'));
    await bootstrapMdmReference({ pool, datasets: [constructionDataset] });
    const collar = (await pool.query("SELECT id, version FROM mdm_entries WHERE code = 'COLLAR_SET_IN'")).rows[0];
    const zip = (await pool.query("SELECT id, version FROM mdm_entries WHERE code = 'ZIP_CENTRE_FRONT'")).rows[0];
    assert.ok(collar && zip, 'both seeded construction node entries must resolve from the real reference dataset');

    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const productIdentityStore = createPostgresProductIdentityStore({ pool });
    const productIdentityReader = createPostgresProductIdentityReader({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const productIdentity = createProductIdentityService({ store: productIdentityStore, clock, nextId });
    const productIdentityQuery = createProductIdentityQueryService({ reader: productIdentityReader });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-pcn', type: 'brand', name: 'Construction Node Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-pcn', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('member-buyer', 'owner-user', createMembership({ id: 'membership-buyer', organisationId: 'brand-pcn', organisationType: 'brand', userId: 'buyer-user', role: 'quality', createdAt: clock() }));

    const style = await productIdentity.createStyle('style-create', 'owner-user', { brandId: 'brand-pcn', styleCode: 'DRS-PCN' });

    // a role without product.manage cannot attach a node
    await assert.rejects(
      productIdentity.addConstructionNode('deny', 'buyer-user', style.id, { mdmRef: { entryId: collar.id, version: collar.version }, sortOrder: 0 }),
      (error) => error.code === 'CAPABILITY_DENIED',
    );

    const first = await productIdentity.addConstructionNode('node-collar', 'owner-user', style.id, {
      mdmRef: { entryId: collar.id, version: collar.version },
      note: 'Проверить посадку воротника на образце',
      sortOrder: 0,
    });
    assert.deepEqual(first.mdmRef, { entryId: collar.id, version: collar.version });

    const persisted = await pool.query('SELECT construction_node_entry_id, construction_node_entry_version, note, sort_order FROM product_style_construction_nodes WHERE style_id = $1', [style.id]);
    assert.deepEqual(persisted.rows, [{
      construction_node_entry_id: collar.id,
      construction_node_entry_version: collar.version,
      note: 'Проверить посадку воротника на образце',
      sort_order: 0,
    }]);

    // replay is idempotent
    const replay = await productIdentity.addConstructionNode('node-collar', 'owner-user', style.id, {
      mdmRef: { entryId: collar.id, version: collar.version },
      note: 'Проверить посадку воротника на образце',
      sortOrder: 0,
    });
    assert.equal(replay.id, first.id);
    const afterReplay = await pool.query('SELECT count(*)::int AS count FROM product_style_construction_nodes WHERE style_id = $1', [style.id]);
    assert.equal(afterReplay.rows[0].count, 1);

    // the same node cannot be attached a second time at a different position
    await assert.rejects(
      productIdentity.addConstructionNode('node-collar-again', 'owner-user', style.id, { mdmRef: { entryId: collar.id, version: collar.version }, sortOrder: 1 }),
      (error) => error.code === 'PRODUCT_STYLE_CONSTRUCTION_NODE_ALREADY_ATTACHED',
    );

    // a second, distinct node at the same position is refused; the first node stays intact
    await assert.rejects(
      productIdentity.addConstructionNode('node-zip-collide', 'owner-user', style.id, { mdmRef: { entryId: zip.id, version: zip.version }, sortOrder: 0 }),
      (error) => error.code === 'PRODUCT_STYLE_CONSTRUCTION_NODE_POSITION_CONFLICT',
    );

    const second = await productIdentity.addConstructionNode('node-zip', 'owner-user', style.id, { mdmRef: { entryId: zip.id, version: zip.version }, sortOrder: 1 });
    assert.equal(second.note, null);

    // the board rides along in the same aggregate the style screen reads, ordered by position
    const aggregate = await productIdentityQuery.getStyleForActor('owner-user', style.id);
    assert.deepEqual(aggregate.styleConstructionNodes.map((value) => value.mdmRef.entryId), [collar.id, zip.id]);
  } finally {
    await pool.end();
  }
});
