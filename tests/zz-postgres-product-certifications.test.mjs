import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createProductCertificationService } from '../src/application/product-certification-service.mjs';
import { createPostgresProductCertificationStore } from '../src/infrastructure/postgres-product-certification-store.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-09-30T00:00:00.000Z';

// `product_styles.lifecycle_status` уже несёт стадию `compliance_ready`, но ни одной строки данных,
// отвечающей на вопрос «чем именно подтверждена эта готовность», не было нигде. Этот тест проходит
// настоящий цикл сервис → стор → реальный PostgreSQL: выставление сертификата, отказ по праву у роли
// без `product-certification.manage`, отказ на повторный номер сертификата, и продление сертификата
// через supersede — старый заменён, новый несёт ссылку на него, оба читаемы в реестре стиля.
test('PostgreSQL product certifications: issue, deny by capability, reject a duplicate number, and supersede on renewal', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-pg-${++sequence}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
    await seedBrandAndStyle(pool);

    const store = createPostgresProductCertificationStore({ pool });
    const certifications = createProductCertificationService({ store, clock: () => now, nextId });

    await assert.rejects(
      certifications.createProductCertification('cmd-denied', 'brand-sales', { styleId: 'style-pc', certificationType: 'OEKO-TEX Standard 100', certificateNumber: 'OTX-001', issuingBody: 'OEKO-TEX' }),
      (error) => error.code === 'CAPABILITY_DENIED',
    );

    const draft = await certifications.createProductCertification('cmd-create', 'brand-quality', {
      styleId: 'style-pc', certificationType: 'OEKO-TEX Standard 100', certificateNumber: 'OTX-001', issuingBody: 'OEKO-TEX',
      validFrom: '2026-01-01', validTo: '2026-12-31',
    });
    assert.equal(draft.status, 'draft');

    await assert.rejects(
      certifications.createProductCertification('cmd-dupe', 'brand-quality', { styleId: 'style-pc', certificationType: 'GOTS', certificateNumber: 'OTX-001', issuingBody: 'GOTS' }),
      (error) => error.code === 'PRODUCT_CERTIFICATION_ALREADY_EXISTS',
    );

    const issued = await certifications.issueProductCertification('cmd-issue', 'brand-quality', draft.id, { expectedVersion: 1 });
    assert.equal(issued.status, 'issued');
    assert.equal(issued.version, 2);

    const { supersededCertification, replacement } = await certifications.supersedeProductCertification('cmd-renew', 'brand-quality', issued.id, {
      expectedVersion: 2, replacementCertificateNumber: 'OTX-002', validFrom: '2027-01-01', validTo: '2027-12-31',
    });
    assert.equal(supersededCertification.status, 'superseded');
    assert.equal(replacement.supersedesCertificationId, issued.id);
    assert.equal(replacement.status, 'draft');

    const persisted = await pool.query('SELECT certificate_number, status, supersedes_certification_id FROM product_certifications ORDER BY certificate_number');
    assert.deepEqual(persisted.rows.map((row) => [row.certificate_number, row.status, row.supersedes_certification_id]), [
      ['OTX-001', 'superseded', null],
      ['OTX-002', 'draft', issued.id],
    ]);

    const list = await certifications.listForActor('brand-sales', 'style-pc');
    assert.equal(list.length, 2);

    await assert.rejects(
      pool.query('UPDATE product_certifications SET certificate_number = certificate_number WHERE id = $1', [issued.id]),
      (error) => error.code === '23514',
    );
  } finally {
    await pool.end();
  }
});

async function seedBrandAndStyle(pool) {
  const brand = { id: 'brand-pc', type: 'brand', name: 'Certification Brand' };
  await pool.query(`INSERT INTO organisations (id, type, payload) VALUES ($1, 'brand', $2::jsonb)`, [brand.id, JSON.stringify(brand)]);
  const salesMembership = { id: 'membership-sales-pc', organisationId: brand.id, organisationType: 'brand', userId: 'brand-sales', role: 'sales', status: 'active' };
  const qualityMembership = { id: 'membership-quality-pc', organisationId: brand.id, organisationType: 'brand', userId: 'brand-quality', role: 'quality', status: 'active' };
  await pool.query(
    `INSERT INTO memberships (id, organisation_id, user_id, organisation_type, role, status, payload) VALUES
     ($1, $2, $3, 'brand', 'sales', 'active', $4::jsonb),
     ($5, $6, $7, 'brand', 'quality', 'active', $8::jsonb)`,
    [salesMembership.id, brand.id, salesMembership.userId, JSON.stringify(salesMembership),
      qualityMembership.id, brand.id, qualityMembership.userId, JSON.stringify(qualityMembership)],
  );
  await pool.query(
    `INSERT INTO product_styles (id, brand_id, style_code, lifecycle_status, version, created_at, created_by, updated_at, updated_by)
     VALUES ('style-pc', $1, 'STYLE-PC', 'active', 1, $2, 'seed', $2, 'seed')`,
    [brand.id, now],
  );
}
