import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createLegalEntityService } from '../src/application/legal-entity-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresLegalEntityStore } from '../src/infrastructure/postgres-legal-entity-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL Legal Entity preserves an exact requisites history, capabilities and immutability', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let tick = 0;
  const baseTime = Date.parse('2026-08-10T09:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
  const nextId = (prefix) => `${prefix}_${++tick}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });
    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const legalEntityStore = createPostgresLegalEntityStore({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const legalEntities = createLegalEntityService({ store: legalEntityStore, clock, nextId });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-legal', type: 'brand', name: 'Legal Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-legal', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('member-sales', 'owner-user', createMembership({ id: 'membership-sales', organisationId: 'brand-legal', organisationType: 'brand', userId: 'sales-user', role: 'sales', createdAt: clock() }));

    await assert.rejects(() => legalEntities.createLegalEntity('deny', 'sales-user', { organisationId: 'brand-legal', entityCode: 'RU-MAIN' }), { code: 'CAPABILITY_DENIED' });

    const entity = await legalEntities.createLegalEntity('create', 'owner-user', { organisationId: 'brand-legal', entityCode: 'RU-MAIN' });
    assert.equal(entity.status, 'draft');
    assert.equal((await legalEntities.createLegalEntity('create', 'owner-user', { organisationId: 'brand-legal', entityCode: 'RU-MAIN' })).id, entity.id);

    const ruRequisites = { inn: '7707083893', ogrn: '1027700132195', kpp: '770701001', legalAddress: 'г. Москва, ул. Тверская, д. 1', bankName: 'АО «Тинькофф Банк»', bankAccount: '40702810100000000001', bankBik: '044525974' };
    const v1 = await legalEntities.createLegalEntityVersion('v1', 'owner-user', entity.id, { expectedLatestVersionNo: 0, jurisdiction: 'RU', nameRu: 'ООО «Синта Рус»', nameEn: 'Syntha Rus LLC', requisites: ruRequisites });
    assert.equal(v1.versionNo, 1);
    assert.equal(v1.sourceLegalEntityVersionId, null);

    await assert.rejects(() => legalEntities.createLegalEntityVersion('bad-inn', 'owner-user', entity.id, {
      expectedLatestVersionNo: 1, jurisdiction: 'RU', nameRu: 'ООО «Синта Рус»', nameEn: 'Syntha Rus LLC',
      requisites: { ...ruRequisites, inn: '123' },
    }), { code: 'LEGAL_ENTITY_INN_INVALID' });

    const v2 = await legalEntities.createLegalEntityVersion('v2', 'owner-user', entity.id, {
      expectedLatestVersionNo: 1, jurisdiction: 'RU', nameRu: 'ООО «Синта Рус»', nameEn: 'Syntha Rus LLC',
      requisites: { ...ruRequisites, bankName: 'АО «Альфа-Банк»', bankAccount: '40702810200000000002', bankBik: '044525593' },
    });
    assert.equal(v2.versionNo, 2);
    assert.equal(v2.sourceLegalEntityVersionId, v1.id);
    assert.notEqual(v2.contentHash, v1.contentHash);

    // History is exact: reading v1 back must still show the original bank, not the current one.
    const historyRow = (await pool.query('SELECT requisites FROM legal_entity_versions WHERE id = $1', [v1.id])).rows[0];
    assert.equal(historyRow.requisites.bankName, 'АО «Тинькофф Банк»');

    await assert.rejects(() => pool.query('UPDATE legal_entity_versions SET name_ru = $1 WHERE id = $2', ['tampered', v1.id]), /immutable/);
    await assert.rejects(() => pool.query('DELETE FROM legal_entity_versions WHERE id = $1', [v1.id]), /immutable/);

    const activated = await legalEntities.transitionLegalEntity('activate', 'owner-user', entity.id, { expectedVersion: 1, nextStatus: 'active' });
    assert.equal(activated.status, 'active');
    await assert.rejects(() => legalEntities.transitionLegalEntity('bad-transition', 'owner-user', entity.id, { expectedVersion: 2, nextStatus: 'draft' }), { code: 'LEGAL_ENTITY_STATUS_TRANSITION_INVALID' });

    const listed = await legalEntities.listForActor('owner-user', 'brand-legal');
    assert.equal(listed.length, 1);
    assert.equal(listed[0].latestVersion.versionNo, 2);
    assert.equal(listed[0].latestVersion.requisites.bankName, 'АО «Альфа-Банк»');

    const events = (await pool.query("SELECT event_type FROM outbox_events WHERE event_type LIKE 'legal-entity%'")).rows.map((row) => row.event_type).sort();
    assert.deepEqual(events, ['legal-entity-version.created', 'legal-entity-version.created', 'legal-entity.created', 'legal-entity.status-changed'].sort());
  } finally { await pool.end(); }
});
