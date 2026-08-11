import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-08-11T11:00:00.000Z';

test('PostgreSQL supplier performance is a brand-authorized derived read model', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });

    const brand = { id: 'brand-performance-pg', type: 'brand', name: 'Performance Brand' };
    await pool.query('INSERT INTO organisations (id,type,payload) VALUES ($1,$2,$3::jsonb)', [brand.id, brand.type, JSON.stringify(brand)]);
    const finance = { id: 'm-finance-performance', organisationId: brand.id, organisationType: 'brand', userId: 'finance-performance', role: 'finance', status: 'active' };
    const viewer = { id: 'm-viewer-performance', organisationId: brand.id, organisationType: 'brand', userId: 'viewer-performance', role: 'viewer', status: 'active' };
    await pool.query(
      `INSERT INTO memberships (id,organisation_id,user_id,organisation_type,role,status,payload) VALUES
       ($1,$2,$3,'brand','finance','active',$4::jsonb),
       ($5,$6,$7,'brand','viewer','active',$8::jsonb)`,
      [finance.id, brand.id, finance.userId, JSON.stringify(finance), viewer.id, brand.id, viewer.userId, JSON.stringify(viewer)],
    );

    const supplier = {
      id: 'supplier-performance-pg', supplierCode: 'SUP-PERF', brandId: brand.id, legalName: 'Performance Supplier',
      countryCode: 'TR', email: 'performance@example.test', currency: 'EUR', incoterms: ['DAP'], categories: ['apparel'],
      leadTimeDays: 30, minimumOrderQuantity: 10, paymentTermsDays: 30, auditExpiresAt: '2027-08-11T11:00:00.000Z',
      notes: null, status: 'qualified', version: 1, qualifiedAt: now, suspendedAt: null, suspensionReason: null, archivedAt: null,
      createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO suppliers
       (id,supplier_code,brand_id,status,country_code,currency,lead_time_days,minimum_order_quantity,audit_expires_at,version,payload,created_at,updated_at,qualified_at,suspended_at,archived_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,NULL,NULL)`,
      [supplier.id, supplier.supplierCode, supplier.brandId, supplier.status, supplier.countryCode, supplier.currency, supplier.leadTimeDays, supplier.minimumOrderQuantity, supplier.auditExpiresAt, supplier.version, JSON.stringify(supplier), supplier.createdAt, supplier.updatedAt, supplier.qualifiedAt],
    );

    const runtime = createPostgresWholesaleRuntime({ pool, clock: () => now });
    const performance = await runtime.supplierPerformance.getSupplierEconomicPerformanceForActor('finance-performance', 'SUP-PERF');
    assert.equal(performance.supplier.supplierCode, 'SUP-PERF');
    assert.equal(performance.operations.productionOrderCount, 0);
    assert.equal(performance.operations.onTimeQcPercent, null);
    assert.equal(performance.quality.inspectionCount, 0);
    assert.equal(performance.quality.firstPassYieldPercent, null);
    assert.deepEqual(performance.economicsByCurrency, []);
    assert.equal(performance.attribution.version, 'unique-recovery-supplier-v1');
    assert.equal(performance.attribution.mutableScoreUsed, false);

    await assert.rejects(
      runtime.supplierPerformance.getSupplierEconomicPerformanceForActor('viewer-performance', 'SUP-PERF'),
      (error) => error.code === 'CAPABILITY_DENIED',
    );

    const row = await pool.query('SELECT production_order_count, quality_inspection_count FROM supplier_operational_performance WHERE brand_id=$1 AND supplier_code=$2', [brand.id, supplier.supplierCode]);
    assert.deepEqual(row.rows[0], { production_order_count: 0, quality_inspection_count: 0 });
  } finally {
    await pool.end();
  }
});
