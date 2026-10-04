import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITIES, ROLE_CAPABILITIES, rolesWithCapability, roleSeesCost, withholdCostFields } from '../src/modules/access-control/public.mjs';
import { createBomQueryService } from '../src/application/bom-query-service.mjs';
import { createBomSizeLineQueryService } from '../src/application/bom-size-line-service.mjs';
import { createSourcingQueryService } from '../src/application/sourcing-query-service.mjs';
import { createProductionOrderQueryService } from '../src/application/production-order-query-service.mjs';
import { createPostgresBomReader } from '../src/infrastructure/postgres-bom-reader.mjs';
import { createPostgresBomSizeLineReader } from '../src/infrastructure/postgres-bom-size-line-reader.mjs';
import { createPostgresSourcingReader } from '../src/infrastructure/postgres-sourcing-reader.mjs';
import { createPostgresProductionOrderReader } from '../src/infrastructure/postgres-production-order-reader.mjs';

// A-02: себестоимость и маржа видны только ролям с `cost.manage` или `margin.read`. После #229
// читатели берут роли из таблицы способностей, и `bom.read` / `sourcing.read` /
// `production-order.read` дали доступ производству и качеству вместе с деньгами. Матрица
// «роль × читатель × поля стоимости» собрана из самой таблицы: кто видит деньги, определяет она.
const BRAND_ROLES = ['owner', 'admin', 'sales', 'production', 'quality', 'finance', 'viewer'];
const sees = (role) => ROLE_CAPABILITIES[role].includes(CAPABILITIES.COST_MANAGE) || ROLE_CAPABILITIES[role].includes(CAPABILITIES.MARGIN_READ);

// Пул, который отвечает одной и той же строкой на любой запрос и записывает, что у него спросили.
function poolReturning(rows, log = []) {
  return {
    connect: async () => ({ query: async (sql, params) => { log.push({ sql, params }); return { rows, rowCount: rows.length }; }, release() {} }),
  };
}

const BOM = {
  id: 'bom-1', sku: 'STYLE-001', brandId: 'brand-1', currency: 'EUR', status: 'published', version: 3,
  lines: [{
    lineId: 'SHELL', position: 1, component: 'Shell', materialCode: 'WOOL-1', materialName: 'Wool', materialType: 'fabric', unit: 'm',
    quantity: 1.5, wastePercent: 7, grossQuantity: 1.605, materialCurrency: 'EUR', exchangeRate: 1,
    unitCostSnapshot: 40, lineCost: 64.2,
  }],
  materialCost: 64.2, laborCost: 10, overheadCost: 2, logisticsCost: 1, otherCost: 0, totalCost: 77.2, notes: null,
};
const COST_KEYS_BOM = ['materialCost', 'laborCost', 'overheadCost', 'logisticsCost', 'otherCost', 'totalCost'];
const COST_KEYS_LINE = ['unitCostSnapshot', 'lineCost'];

function assertBom(bom, role) {
  for (const key of COST_KEYS_BOM) assert.equal(key in bom, sees(role), `${role}: ${key}`);
  for (const key of COST_KEYS_LINE) assert.equal(key in bom.lines[0], sees(role), `${role}: line ${key}`);
  // Структура ведомости остаётся: материалы, расход, единицы, расход с отходом.
  assert.equal(bom.sku, 'STYLE-001');
  assert.deepEqual(
    { materialCode: bom.lines[0].materialCode, unit: bom.lines[0].unit, quantity: bom.lines[0].quantity, wastePercent: bom.lines[0].wastePercent, grossQuantity: bom.lines[0].grossQuantity, materialCurrency: bom.lines[0].materialCurrency },
    { materialCode: 'WOOL-1', unit: 'm', quantity: 1.5, wastePercent: 7, grossQuantity: 1.605, materialCurrency: 'EUR' },
  );
  assert.equal(bom.lines.length, 1);
}

test('the capability table decides who sees money: production and quality read the BOM but not what it costs', () => {
  assert.ok(rolesWithCapability(CAPABILITIES.BOM_READ).includes('production'));
  assert.ok(rolesWithCapability(CAPABILITIES.BOM_READ).includes('quality'));
  assert.equal(roleSeesCost('production'), false);
  assert.equal(roleSeesCost('quality'), false);
  assert.equal(roleSeesCost('finance'), true);
  assert.equal(roleSeesCost(undefined), false, 'a row without a role is treated as the least privileged one');
  for (const role of BRAND_ROLES) assert.equal(roleSeesCost(role), sees(role), role);
});

for (const role of BRAND_ROLES) {
  test(`GET /v2/boms and /v2/boms/{sku} as ${role}: cost fields ${sees(role) ? 'present' : 'absent'}`, async () => {
    const service = createBomQueryService({ reader: createPostgresBomReader({ pool: poolReturning([{ payload: BOM, sku: 'STYLE-001', viewer_role: role }]) }) });
    assertBom(await service.getForActor('actor-1', 'STYLE-001'), role);
    const page = await service.pageForActor('actor-1', { limit: 5 });
    assertBom(page.items[0], role);
  });
}

test('the BOM query asks for the role the actor holds in the BOM brand', async () => {
  const log = [];
  const reader = createPostgresBomReader({ pool: poolReturning([], log) });
  await reader.getForActor('actor-1', 'STYLE-001');
  await reader.pageForActor('actor-1', { limit: 5, filters: {} });
  const selects = log.filter(({ sql }) => /SELECT/.test(sql));
  assert.equal(selects.length, 2);
  for (const { sql } of selects) assert.match(sql, /AS viewer_role/);
});

const RFQ = {
  id: 'rfq-1', rfqCode: 'RFQ-1', brandId: 'brand-1', sku: 'STYLE-001', status: 'awarded', bomCurrency: 'EUR', bomTotalCost: 77.2, version: 4,
  quotes: [{ supplierCode: 'SUP-1', leadTimeDays: 30, unitPriceMinor: 5000, fixedCostMinor: 100, totalCostMinor: 100100, revision: 1 }],
  award: { supplierCode: 'SUP-1', currency: 'EUR', incoterm: 'FOB', unitPriceMinor: 5000, fixedCostMinor: 100, totalCostMinor: 100100, quoteRevision: 1 },
};
for (const role of BRAND_ROLES) {
  test(`RFQ read as ${role}: supplier prices and BOM cost snapshot ${sees(role) ? 'present' : 'absent'}`, async () => {
    const service = createSourcingQueryService({ reader: createPostgresSourcingReader({ pool: poolReturning([{ payload: RFQ, code: 'RFQ-1', viewer_role: role }]) }) });
    for (const rfq of [await service.rfqGetForActor('actor-1', 'RFQ-1'), (await service.rfqPageForActor('actor-1', { limit: 5 })).items[0]]) {
      assert.equal('bomTotalCost' in rfq, sees(role));
      for (const holder of [rfq.quotes[0], rfq.award]) {
        for (const key of ['unitPriceMinor', 'fixedCostMinor', 'totalCostMinor']) assert.equal(key in holder, sees(role), `${role}: ${key}`);
      }
      assert.equal(rfq.quotes[0].leadTimeDays, 30);
      assert.equal(rfq.award.incoterm, 'FOB');
      assert.equal(rfq.rfqCode, 'RFQ-1');
    }
  });
}

const PRODUCTION_ORDER = {
  id: 'po-1', productionOrderNumber: 'PO-0001', brandId: 'brand-1', sku: 'STYLE-001', status: 'issued', version: 2, quantity: 100,
  commercialSnapshot: { currency: 'EUR', incoterm: 'FOB', unitPriceMinor: 5000, fixedCostMinor: 100, totalCostMinor: 500100, quoteRevision: 1 },
};
for (const role of BRAND_ROLES) {
  test(`production order read as ${role}: award prices ${sees(role) ? 'present' : 'absent'}`, async () => {
    const row = { payload: PRODUCTION_ORDER, production_order_number: 'PO-0001', viewer_role: role, linkedActualCost: null };
    const service = createProductionOrderQueryService({ reader: createPostgresProductionOrderReader({ pool: poolReturning([row]) }) });
    for (const order of [await service.getForActor('actor-1', 'PO-0001'), (await service.pageForActor('actor-1', { limit: 5 })).items[0]]) {
      for (const key of ['unitPriceMinor', 'fixedCostMinor', 'totalCostMinor']) assert.equal(key in order.commercialSnapshot, sees(role), `${role}: ${key}`);
      assert.equal(order.commercialSnapshot.currency, 'EUR');
      assert.equal(order.commercialSnapshot.incoterm, 'FOB');
      assert.equal(order.quantity, 100);
    }
  });
}

const SIZE_ROWS = ['S', 'M'].map((sizeCode, index) => ({
  sizeCode, sizeSortOrder: index, catalogSku: `STYLE-001-${sizeCode}`, bomStatus: 'published', currency: 'EUR', bomTotalCost: 77.2,
  materialCode: 'WOOL-1', materialType: 'fabric', component: 'Shell', unit: 'm', isMain: true,
  quantity: 1.5 + index * 0.1, grossQuantity: 1.6 + index * 0.1, wastePercent: 7, lineCost: 64.2 + index,
}));
for (const role of BRAND_ROLES) {
  test(`size-line sheet read as ${role}: cost figures ${sees(role) ? 'present' : 'absent'}`, async () => {
    const pool = poolReturning(SIZE_ROWS.map((row) => ({ payload: row, viewer_role: role })));
    const service = createBomSizeLineQueryService({ reader: createPostgresBomSizeLineReader({ pool }) });
    const sheet = await service.styleSizeLineForActor('actor-1', 'STYLE-001');
    const text = JSON.stringify(sheet);
    assert.equal(/cost/i.test(text), sees(role), `${role}: ${text.match(/"[A-Za-z]*[Cc]ost[A-Za-z]*"/)?.[0]}`);
    // Расход по размерам остаётся.
    assert.ok(text.includes('"grossQuantity":1.6'));
    assert.ok(text.includes('WOOL-1'));
  });
}

test('withholdCostFields removes fields on any depth and leaves everything else', () => {
  const value = { a: 1, totalCost: 5, nested: [{ unitCostSnapshot: 1, kept: 'x', deeper: { marginPercent: 3, ok: true } }] };
  assert.deepEqual(withholdCostFields(value), { a: 1, nested: [{ kept: 'x', deeper: { ok: true } }] });
  assert.deepEqual(withholdCostFields({ unitPriceMinor: 1, quantity: 2 }, { extraKeys: ['unitPriceMinor'] }), { quantity: 2 });
});
