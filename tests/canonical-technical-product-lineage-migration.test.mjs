import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../db/migrations/061_canonical_technical_product_sku_lineage.sql', import.meta.url);
const readinessSourceUrl = new URL('../src/infrastructure/postgres-product-readiness-source-reader.mjs', import.meta.url);
const readinessDomainUrl = new URL('../src/modules/product-readiness/public.mjs', import.meta.url);
const readinessServiceUrl = new URL('../src/application/product-readiness-service.mjs', import.meta.url);

const technicalTables = [
  'boms',
  'samples',
  'tech_packs',
  'sourcing_rfqs',
  'production_orders',
  'quality_inspections',
];

test('migration 061 pins readiness technical sources to canonical ProductSku lineage', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  for (const table of technicalTables) {
    assert.match(sql, new RegExp(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS product_sku_id text NULL;`));
    assert.match(sql, new RegExp(`ALTER TABLE ${table}[\\s\\S]*FOREIGN KEY \\(product_sku_id, brand_id\\) REFERENCES product_skus\\(id, brand_id\\)`));
    assert.match(sql, new RegExp(`${table}_assign_product_sku_lineage`));
    assert.match(sql, new RegExp(`BEFORE INSERT OR UPDATE ON ${table}`));
  }

  assert.doesNotMatch(sql, /INSERT OR UPDATE OF/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION technical_evidence_assign_product_sku_lineage\(\)/);
  assert.match(sql, /product_sku\.brand_id = NEW\.brand_id/);
  assert.match(sql, /product_sku\.sku_code = NEW\.sku/);
  assert.match(sql, /technical_evidence_product_sku_lineage_match/);
});

test('Product Readiness technical query no longer traverses flat catalog compatibility tables', async () => {
  const source = await readFile(readinessSourceUrl, 'utf8');
  const technicalQuery = source.match(/const evidenceResult = await pool\.query\([\s\S]*?\n\s*\);\n\n\s*const measurementResult/)?.[0] ?? '';
  assert.ok(technicalQuery.length > 0, 'canonical technical readiness query must exist');

  const canonicalJoins = technicalQuery.match(/WHERE product_sku_id = product_sku\.id/g) ?? [];
  assert.equal(canonicalJoins.length, technicalTables.length);
  assert.doesNotMatch(technicalQuery, /catalog_skus|product_catalog_sku_links|catalog_sku|link\./);
  assert.match(source, /technicalEvidence: Object\.freeze\(evidenceResult\.rows\.map\(mapTechnicalEvidence\)\)/);
});

test('new readiness snapshots and evaluator use technicalEvidence rather than legacy catalog evidence', async () => {
  const [domain, service] = await Promise.all([
    readFile(readinessDomainUrl, 'utf8'),
    readFile(readinessServiceUrl, 'utf8'),
  ]);

  assert.match(domain, /technicalSnapshot\.technicalEvidence/);
  assert.match(domain, /source: 'canonical-product-sku'/);
  assert.doesNotMatch(domain, /legacyEvidence|linkedLegacy|catalogSku/);
  assert.match(service, /technicalEvidence: context\.technicalEvidence \?\? \[\]/);
  assert.doesNotMatch(service, /legacyEvidence/);
});
