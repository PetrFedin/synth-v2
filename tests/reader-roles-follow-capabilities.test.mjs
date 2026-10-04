import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITIES, ROLE_CAPABILITIES } from '../src/modules/access-control/public.mjs';
import { createPostgresBomReader } from '../src/infrastructure/postgres-bom-reader.mjs';
import { createPostgresBomSizeLineReader } from '../src/infrastructure/postgres-bom-size-line-reader.mjs';
import { createPostgresCuttingReader } from '../src/infrastructure/postgres-cutting-reader.mjs';
import { createPostgresFinalQualityReader } from '../src/infrastructure/postgres-final-quality-reader.mjs';
import { createPostgresInlineQualityReader } from '../src/infrastructure/postgres-inline-quality-reader.mjs';
import { createPostgresMaterialColourReader } from '../src/infrastructure/postgres-material-colour-reader.mjs';
import { createPostgresMaterialLotReader } from '../src/infrastructure/postgres-material-lot-reader.mjs';
import { createPostgresMeasurementReader } from '../src/infrastructure/postgres-measurement-reader.mjs';
import { createPostgresOperationSequenceReader } from '../src/infrastructure/postgres-operation-sequence-reader.mjs';
import { createPostgresProductionExecutionReader } from '../src/infrastructure/postgres-production-execution-reader.mjs';
import { createPostgresProductionOrderReader } from '../src/infrastructure/postgres-production-order-reader.mjs';
import { createPostgresSampleReader } from '../src/infrastructure/postgres-sample-reader.mjs';
import { createPostgresSeasonEconomicsReader } from '../src/infrastructure/postgres-season-economics-reader.mjs';
import { createPostgresSourcingReader } from '../src/infrastructure/postgres-sourcing-reader.mjs';
import { createPostgresSupplierPaymentReader } from '../src/infrastructure/postgres-supplier-payment-reader.mjs';
import { createPostgresTargetPricingReader } from '../src/infrastructure/postgres-target-pricing-reader.mjs';
import { createPostgresTechPackReader } from '../src/infrastructure/postgres-tech-pack-reader.mjs';

// Каждый читатель отбирает строки по роли в SQL. Список ролей, который он передаёт в запрос, обязан
// совпадать со списком ролей, которым таблица способностей даёт то, что читатель отдаёт. Матрица
// «роль × читатель» собирается здесь из самой таблицы, а не из второго рукописного списка: иначе
// тест расходился бы с кодом тем же способом, каким расходились захардкоженные списки.
const READERS = [
  ['bom', createPostgresBomReader, CAPABILITIES.BOM_READ],
  ['bom-size-line', createPostgresBomSizeLineReader, CAPABILITIES.PRODUCT_READ],
  ['cutting', createPostgresCuttingReader, CAPABILITIES.QUALITY_READ],
  ['final-quality', createPostgresFinalQualityReader, CAPABILITIES.QUALITY_READ],
  ['inline-quality', createPostgresInlineQualityReader, CAPABILITIES.QUALITY_READ],
  ['material-colour', createPostgresMaterialColourReader, CAPABILITIES.PRODUCT_READ],
  ['material-lot', createPostgresMaterialLotReader, CAPABILITIES.QUALITY_READ],
  ['measurement', createPostgresMeasurementReader, CAPABILITIES.MEASUREMENT_READ],
  ['operation-sequence', createPostgresOperationSequenceReader, CAPABILITIES.TECH_PACK_READ],
  ['production-execution', createPostgresProductionExecutionReader, CAPABILITIES.PRODUCTION_EXECUTION_READ],
  ['production-order', createPostgresProductionOrderReader, CAPABILITIES.PRODUCTION_ORDER_READ],
  ['sample', createPostgresSampleReader, CAPABILITIES.SAMPLE_READ],
  ['sourcing', createPostgresSourcingReader, CAPABILITIES.SOURCING_READ],
  ['tech-pack', createPostgresTechPackReader, CAPABILITIES.TECH_PACK_READ],
  // Деньги: читать их мог и читают только те, кто ими распоряжается. Capability здесь — `cost.manage`,
  // не `margin.read`: `margin.read` есть у продаж, а им себестоимость сезона, цели и платежи не открыты.
  ['season-economics', createPostgresSeasonEconomicsReader, CAPABILITIES.COST_MANAGE],
  ['supplier-payment', createPostgresSupplierPaymentReader, CAPABILITIES.COST_MANAGE],
  ['target-pricing', createPostgresTargetPricingReader, CAPABILITIES.COST_MANAGE],
];

const BRAND_ROLES = ['owner', 'admin', 'sales', 'production', 'quality', 'finance', 'viewer'];

function recordingPool(log) {
  return {
    connect: async () => ({
      query: async (sql, params) => { log.push({ sql, params }); return { rows: [], rowCount: 0 }; },
      release() {},
    }),
  };
}

async function rolesPassedBy(factory) {
  const log = [];
  const reader = factory({ pool: recordingPool(log) });
  const page = { limit: 10, filters: {}, afterSku: undefined };
  for (const method of Object.values(reader)) {
    if (typeof method !== 'function') continue;
    for (const args of [['actor-1', page, 'X'], ['actor-1', 'X', 'Y'], ['actor-1']]) {
      try { await method(...args); } catch { /* форма аргументов не та — берём следующую */ }
    }
  }
  const lists = log.flatMap(({ params }) => (params ?? []).filter((value) => Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && BRAND_ROLES.includes(item))));
  return { lists, log };
}

for (const [name, factory, capability] of READERS) {
  test(`the ${name} reader serves exactly the roles that hold ${capability}`, async () => {
    const expected = BRAND_ROLES.filter((role) => ROLE_CAPABILITIES[role].includes(capability));
    const { lists } = await rolesPassedBy(factory);
    assert.ok(lists.length > 0, `${name}: no role list reached the query`);
    for (const list of lists) {
      assert.deepEqual([...list].filter((role) => BRAND_ROLES.includes(role)).sort(), [...expected].sort(), `${name} reader role list diverges from the capability table`);
    }
  });
}

test('the matrix covers production and quality where the table gives them the capability', () => {
  const served = (capability) => BRAND_ROLES.filter((role) => ROLE_CAPABILITIES[role].includes(capability));
  assert.deepEqual(served(CAPABILITIES.BOM_READ).sort(), ['admin', 'finance', 'owner', 'production', 'quality']);
  assert.deepEqual(served(CAPABILITIES.MEASUREMENT_READ).sort(), ['admin', 'owner', 'production', 'quality', 'sales']);
  assert.ok(served(CAPABILITIES.TECH_PACK_READ).includes('production'));
});

test('money readers stay closed to everyone but the finance side', async () => {
  for (const [name, factory] of READERS.filter(([, , capability]) => capability === CAPABILITIES.COST_MANAGE)) {
    const { lists } = await rolesPassedBy(factory);
    for (const list of lists) assert.deepEqual([...list].sort(), ['admin', 'finance', 'owner'], name);
  }
});

test('production and quality read a production order but not its linked actual cost', async () => {
  const { lists, log } = await rolesPassedBy(createPostgresProductionOrderReader);
  assert.ok(lists.every((list) => list.includes('production') && list.includes('quality')));
  const sql = log.map((entry) => entry.sql).join('\n');
  const costRoles = /ARRAY\[([^\]]*)\]::text\[\]/.exec(sql)?.[1] ?? '';
  assert.match(costRoles, /'finance'/);
  assert.doesNotMatch(costRoles, /'production'|'quality'|'viewer'/);
});
