import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-10-02T10:00:00.000Z';
const issued = '2026-09-30T10:00:00.000Z';
const future = '2026-11-20T00:00:00.000Z';
const past = '2026-10-01T00:00:00.000Z';
const validUntil = '2027-01-31T00:00:00.000Z';

// «Ждёт вас» поставщика против настоящей базы. Поставщик не член организации: единственное основание —
// грант портала, и читается всё через те же представления, что и списки портала. Поэтому изоляция
// проверяется между двумя поставщиками одного бренда, а не только между брендом и поставщиком.
test('PostgreSQL lists for a supplier only what is addressed to its own grant, and nothing once the grant or the standing is gone', { skip: !databaseUrl }, async () => {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
    await seed(pool);
    let sequence = 0;
    const runtime = createPostgresWholesaleRuntime({ pool, clock: () => now, nextId: (prefix) => `${prefix}-sa-${++sequence}` });
    const portal = runtime.supplierPortal;

    // До выдачи гранта нет ничего: ни ошибки, ни чужих дел.
    const nothing = await portal.awaitingActionsForActor('user-one', { limit: '200' });
    assert.equal(nothing.total, 0);
    assert.deepEqual(nothing.items, []);

    const grantOne = await runtime.sourcing.grantPortalAccess('cmd-g1', 'brand-owner', 'SUP-ONE', { email: 'rep@one.example', contactName: 'Mei Lin' });
    await runtime.sourcing.grantPortalAccess('cmd-g2', 'brand-owner', 'SUP-TWO', { email: 'rep@two.example', contactName: 'Ali Kaya' });
    await runtime.sourcing.grantPortalAccess('cmd-g3', 'brand-owner', 'SUP-THREE', { email: 'rep@three.example', contactName: 'Jan Novak' });

    const keys = (page) => page.items.map((item) => `${item.type}:${item.entityId}`).sort();

    // Поставщик ONE: запрос без своей котировки, встречное предложение на свою котировку, свой выпущенный заказ.
    const one = await portal.awaitingActionsForActor('user-one', { limit: '200' });
    assert.deepEqual(keys(one), [
      'portal-counter-accept:RFQ-COUNTER',
      'portal-order-confirm:PO-ONE',
      'portal-quote-submit:RFQ-ALL',
      'portal-quote-submit:RFQ-ONLY-ONE',
    ]);
    assert.equal(one.total, 4);
    assert.deepEqual(Object.fromEntries(Object.entries(one.counts).map(([type, entry]) => [type, entry.count])), {
      'portal-quote-submit': 2, 'portal-counter-accept': 1, 'portal-order-confirm': 1,
    });
    // Маршрут ведёт на экран портала и называет запись.
    const quote = one.items.find((item) => item.entityId === 'RFQ-ONLY-ONE');
    assert.equal(quote.route.view, 'supplier-portal-rfqs');
    assert.equal(quote.route.entityId, 'RFQ-ONLY-ONE');
    assert.equal(quote.detail.supplierCode, 'SUP-ONE');
    assert.equal(one.items.find((item) => item.type === 'portal-order-confirm').route.view, 'supplier-portal-orders');
    // Срок ответа — срок дела.
    assert.equal(quote.dueAt, future);

    // Поставщик TWO: общий запрос и свой заказ; чужой запрос, чужое встречное предложение и чужой заказ не видны.
    const two = await portal.awaitingActionsForActor('user-two', { limit: '200' });
    assert.deepEqual(keys(two), ['portal-order-confirm:PO-TWO', 'portal-quote-submit:RFQ-ALL']);
    for (const leaked of ['RFQ-ONLY-ONE', 'RFQ-COUNTER', 'PO-ONE', 'SUP-ONE']) {
      assert.equal(JSON.stringify(two).includes(leaked), false, `supplier two was handed ${leaked}`);
    }

    // Просроченный срок ответа, черновик, присуждённый запрос и подтверждённый заказ — не дела.
    for (const absent of ['RFQ-LATE', 'RFQ-DRAFT', 'RFQ-AWARDED', 'PO-CONFIRMED']) {
      assert.equal(JSON.stringify(one).includes(absent), false, `${absent} is not waiting for anybody`);
    }
    // Встречное предложение, отвечающее на устаревшую ревизию, принять нельзя — и дела нет.
    assert.equal(JSON.stringify(one).includes('RFQ-STALE-COUNTER'), false);

    // Поставщик не квалифицирован — ничего: грант остался, доступа нет.
    assert.equal((await portal.awaitingActionsForActor('user-three', { limit: '200' })).total, 1, 'while qualified, supplier three has its own request waiting');
    const three = (await pool.query("SELECT version FROM suppliers WHERE supplier_code = 'SUP-THREE'")).rows[0];
    await runtime.sourcing.suspendSupplier('cmd-suspend-3', 'brand-owner', 'SUP-THREE', { expectedVersion: three.version, reason: 'Audit lapsed' });
    assert.equal((await portal.awaitingActionsForActor('user-three', { limit: '200' })).total, 0);

    // Член бренда, не держатель гранта, через портал не видит ничего, а у держателя гранта нет дел «по членству».
    assert.equal((await portal.awaitingActionsForActor('brand-owner', { limit: '200' })).total, 0);
    const byMembership = await runtime.awaitingActions.forActor('user-one', { limit: '200' });
    assert.equal(byMembership.total, 0, 'the supplier holds no membership, so the brand register is empty for it');

    // Фильтры и счётчик-без-списка.
    const quotesOnly = await portal.awaitingActionsForActor('user-one', { type: 'portal-quote-submit', limit: '200' });
    assert.deepEqual(keys(quotesOnly), ['portal-quote-submit:RFQ-ALL', 'portal-quote-submit:RFQ-ONLY-ONE']);
    const cheap = await portal.awaitingActionsForActor('user-one', { limit: '0' });
    assert.equal(cheap.total, 4);
    assert.deepEqual(cheap.items, []);
    await assert.rejects(() => portal.awaitingActionsForActor('user-one', { type: 'rfq-award' }), (error) => error.code === 'AWAITING_ACTION_TYPE_INVALID', 'a brand type is not a supplier type');
    await assert.rejects(() => portal.awaitingActionsForActor('user-one', { group: 'quality' }), (error) => error.code === 'AWAITING_ACTION_GROUP_INVALID');

    // Дело исчезает, как только ход сделан: котировка подана — запроса в списке нет.
    const rfqs = await portal.rfqsForActor('user-one', {});
    const target = rfqs.items.find((item) => item.rfqCode === 'RFQ-ONLY-ONE');
    await portal.submitQuote('cmd-q1', 'user-one', 'RFQ-ONLY-ONE', {
      expectedVersion: target.version, supplierCode: 'SUP-ONE', unitPriceMinor: 5200, fixedCostMinor: 0,
      leadTimeDays: 30, minimumOrderQuantity: 100, validUntil, notes: null, tiers: [],
    });
    assert.deepEqual(keys(await portal.awaitingActionsForActor('user-one', { limit: '200' })), [
      'portal-counter-accept:RFQ-COUNTER', 'portal-order-confirm:PO-ONE', 'portal-quote-submit:RFQ-ALL',
    ]);
    // Заказ подтверждён — заказа в списке нет.
    const orders = await portal.ordersForActor('user-one', {});
    await portal.confirmOrder('cmd-c1', 'user-one', 'PO-ONE', {
      expectedVersion: orders.items.find((item) => item.productionOrderNumber === 'PO-ONE').version, supplierCode: 'SUP-ONE',
      confirmationReference: 'ACK-1', notes: null,
    });
    assert.equal(keys(await portal.awaitingActionsForActor('user-one', { limit: '200' })).includes('portal-order-confirm:PO-ONE'), false);

    // Принято встречное предложение — дела нет.
    const counter = (await portal.rfqsForActor('user-one', {})).items.find((item) => item.rfqCode === 'RFQ-COUNTER');
    await portal.acceptCounterOffer('cmd-a1', 'user-one', 'RFQ-COUNTER', { expectedVersion: counter.version, supplierCode: 'SUP-ONE' });
    assert.equal(keys(await portal.awaitingActionsForActor('user-one', { limit: '200' })).includes('portal-counter-accept:RFQ-COUNTER'), false);

    // Отозванный грант — пустой список в тот же момент.
    await runtime.sourcing.revokePortalAccess('cmd-r1', 'brand-owner', 'SUP-ONE', { expectedVersion: grantOne.version, userId: grantOne.userId });
    assert.equal((await portal.awaitingActionsForActor('user-one', { limit: '200' })).total, 0);
    // А поставщик TWO этого не заметил.
    assert.equal((await portal.awaitingActionsForActor('user-two', { limit: '200' })).total, 2);
  } finally {
    await pool.end();
  }
});

async function seed(pool) {
  const brand = { id: 'brand-sa', type: 'brand', name: 'Awaiting Brand' };
  await pool.query('INSERT INTO organisations (id, type, payload) VALUES ($1,$2,$3::jsonb)', [brand.id, 'brand', JSON.stringify(brand)]);
  await pool.query(
    `INSERT INTO auth_users (id, email, email_normalized, display_name, password_hash, status, created_at, updated_at)
     VALUES ('user-one','rep@one.example','rep@one.example','Mei Lin','x','active',$1,$1),
            ('user-two','rep@two.example','rep@two.example','Ali Kaya','x','active',$1,$1),
            ('user-three','rep@three.example','rep@three.example','Jan Novak','x','active',$1,$1),
            ('brand-owner','owner@brand.example','owner@brand.example','Owner','x','active',$1,$1)`, [now]);
  const owner = { id: 'm-owner-sa', organisationId: brand.id, organisationType: 'brand', userId: 'brand-owner', role: 'owner', status: 'active' };
  await pool.query('INSERT INTO memberships (id,organisation_id,user_id,organisation_type,role,status,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)',
    [owner.id, brand.id, owner.userId, 'brand', 'owner', 'active', JSON.stringify(owner)]);
  for (const [id, code] of [['supplier-one', 'SUP-ONE'], ['supplier-two', 'SUP-TWO'], ['supplier-three', 'SUP-THREE']]) {
    const supplier = { id, supplierCode: code, brandId: brand.id, status: 'qualified', countryCode: 'TR', currency: 'EUR', legalName: `${code} Mills`, leadTimeDays: 30, minimumOrderQuantity: 1, auditExpiresAt: '2027-09-19T10:00:00.000Z', version: 1, incoterms: ['FOB'], categories: ['apparel'], createdAt: now, updatedAt: now, qualifiedAt: now };
    await pool.query(
      `INSERT INTO suppliers (id,supplier_code,brand_id,status,country_code,currency,lead_time_days,minimum_order_quantity,audit_expires_at,version,payload,created_at,updated_at,qualified_at)
       VALUES ($1,$2,$3,'qualified','TR','EUR',30,1,$4,1,$5::jsonb,$6,$6,$6)`, [id, code, brand.id, supplier.auditExpiresAt, JSON.stringify(supplier), now]);
  }
  const campaign = { id: 'campaign-sa', brandId: brand.id, status: 'open', version: 1 };
  const collection = { id: 'collection-sa', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
  await pool.query('INSERT INTO campaigns (id,brand_id,status,version,payload) VALUES ($1,$2,$3,$4,$5::jsonb)', [campaign.id, brand.id, 'open', 1, JSON.stringify(campaign)]);
  await pool.query('INSERT INTO collections (id,campaign_id,brand_id,status,currency,version,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)', [collection.id, campaign.id, brand.id, 'published', 'EUR', 1, JSON.stringify(collection)]);
  const sku = { id: 'SKU-SA', sku: 'SKU-SA', collectionId: collection.id, brandId: brand.id, name: 'Awaiting Jacket', wholesalePrice: 120, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 100, reservedQuantity: 0, availableToSell: 100, status: 'published', version: 1, createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO catalog_skus (sku,collection_id,brand_id,status,currency,wholesale_price,minimum_order_quantity,available_quantity,reserved_quantity,version,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10::jsonb)',
    [sku.sku, collection.id, brand.id, 'published', 'EUR', 120, 1, 100, 1, JSON.stringify(sku)]);

  const quoteOf = (supplierCode, extra = {}) => ({
    supplierCode, supplierName: `${supplierCode} Mills`, supplierVersion: 1, unitPriceMinor: 5000, fixedCostMinor: 0, totalCostMinor: 5000 * 400,
    leadTimeDays: 20, minimumOrderQuantity: 1, validUntil, tiers: [], receivedAt: now, revision: 1, ...extra,
  });
  const counter = (overrides = {}) => ({ quantity: 400, unitPriceMinor: 4800, totalCostMinor: 4800 * 400, notes: null, answersQuoteRevision: 1, offeredAt: now, offeredBy: 'brand-owner', ...overrides });

  await insertRfq(pool, brand.id, { id: 'rfq-all', rfqCode: 'RFQ-ALL', supplierCodes: ['SUP-ONE', 'SUP-TWO'], quotes: [] });
  await insertRfq(pool, brand.id, { id: 'rfq-three', rfqCode: 'RFQ-THREE', supplierCodes: ['SUP-THREE'], quotes: [] });
  await insertRfq(pool, brand.id, { id: 'rfq-only-one', rfqCode: 'RFQ-ONLY-ONE', supplierCodes: ['SUP-ONE'], quotes: [] });
  // Встречное предложение бренда поставщику ONE; поставщик TWO ответил на тот же запрос без встречного.
  await insertRfq(pool, brand.id, { id: 'rfq-counter', rfqCode: 'RFQ-COUNTER', status: 'quoted', supplierCodes: ['SUP-ONE', 'SUP-TWO'],
    quotes: [quoteOf('SUP-ONE', { counterOffer: counter() }), quoteOf('SUP-TWO')] });
  // Встречное предложение на прежнюю ревизию: принять уже нельзя.
  await insertRfq(pool, brand.id, { id: 'rfq-stale', rfqCode: 'RFQ-STALE-COUNTER', status: 'quoted', supplierCodes: ['SUP-ONE'],
    quotes: [quoteOf('SUP-ONE', { revision: 2, counterOffer: counter({ answersQuoteRevision: 1 }) })] });
  await insertRfq(pool, brand.id, { id: 'rfq-late', rfqCode: 'RFQ-LATE', supplierCodes: ['SUP-ONE'], quotes: [], due: past });
  await insertRfq(pool, brand.id, { id: 'rfq-draft', rfqCode: 'RFQ-DRAFT', status: 'draft', supplierCodes: ['SUP-ONE'], quotes: [] });
  await insertRfq(pool, brand.id, { id: 'rfq-awarded', rfqCode: 'RFQ-AWARDED', status: 'awarded', selectedSupplierCode: 'SUP-TWO', supplierCodes: ['SUP-ONE', 'SUP-TWO'], quotes: [quoteOf('SUP-TWO')] });
  for (const [id, code, supplierCode] of [['rfq-po-one', 'RFQ-PO-ONE', 'SUP-ONE'], ['rfq-po-two', 'RFQ-PO-TWO', 'SUP-TWO'], ['rfq-po-conf', 'RFQ-PO-CONF', 'SUP-ONE']]) {
    // Запросы, из которых выросли заказы, уже отвечены: сами по себе они дел не создают.
    await insertRfq(pool, brand.id, { id, rfqCode: code, status: 'quoted', supplierCodes: [supplierCode], quotes: [quoteOf(supplierCode)] });
  }
  // Заказы — фикстуры: триггер вставки требует размещённый RFQ, а это сторона бренда, не предмет теста.
  await pool.query('ALTER TABLE production_orders DISABLE TRIGGER USER');
  await insertOrder(pool, brand.id, { id: 'po-one', number: 'PO-ONE', rfqId: 'rfq-po-one', rfqCode: 'RFQ-PO-ONE', supplierCode: 'SUP-ONE' });
  await insertOrder(pool, brand.id, { id: 'po-two', number: 'PO-TWO', rfqId: 'rfq-po-two', rfqCode: 'RFQ-PO-TWO', supplierCode: 'SUP-TWO' });
  await insertOrder(pool, brand.id, { id: 'po-conf', number: 'PO-CONFIRMED', rfqId: 'rfq-po-conf', rfqCode: 'RFQ-PO-CONF', supplierCode: 'SUP-ONE', status: 'confirmed' });
  await pool.query('ALTER TABLE production_orders ENABLE TRIGGER USER');
}

async function insertRfq(pool, brandId, { id, rfqCode, supplierCodes, quotes, status = 'issued', due = future, selectedSupplierCode = null }) {
  const draft = status === 'draft';
  const awarded = status === 'awarded';
  const payload = {
    id, rfqCode, brandId, sku: 'SKU-SA', skuVersion: 1, bomVersion: 1, status, targetQuantity: 400, responseDueAt: due,
    deliveryDueAt: '2027-02-15T00:00:00.000Z', bomCurrency: 'EUR', selectedSupplierCode, version: 1, supplierCodes, quotes, incoterm: 'FOB', notes: null,
    createdAt: issued, updatedAt: issued, issuedAt: draft ? null : issued, ...(awarded ? { award: { supplierCode: selectedSupplierCode, awardedAt: now } } : {}),
  };
  await pool.query(
    `INSERT INTO sourcing_rfqs (id,rfq_code,brand_id,sku,sku_version,bom_version,status,target_quantity,response_due_at,delivery_due_at,selected_supplier_code,version,payload,created_at,updated_at,issued_at,awarded_at)
     VALUES ($1,$2,$3,'SKU-SA',1,1,$4,400,$5,$6,$7,1,$8::jsonb,$9,$9,$10,$11)`,
    [id, rfqCode, brandId, status, due, payload.deliveryDueAt, selectedSupplierCode, JSON.stringify(payload), issued, draft ? null : issued, awarded ? now : null]);
}

async function insertOrder(pool, brandId, { id, number, rfqId, rfqCode, supplierCode, status = 'issued' }) {
  const payload = {
    id, productionOrderNumber: number, rfqId, rfqCode, rfqVersion: 1, brandId, supplierCode, sku: 'SKU-SA', skuVersion: 1, bomVersion: 1, quantity: 400,
    status, version: 2, productionStartAt: '2026-11-01T00:00:00.000Z', deliveryDueAt: '2027-02-15T00:00:00.000Z',
    supplierSnapshot: { supplierCode, legalName: `${supplierCode} Mills` },
    commercialSnapshot: { currency: 'EUR', incoterm: 'FOB', unitPriceMinor: 4800 },
    techPackSnapshot: { techPackCode: 'TP-SA', acknowledgementReference: 'ACK-TP' },
    issuedAt: issued, issuedBy: 'brand-owner', confirmedAt: status === 'confirmed' ? issued : null,
    confirmation: status === 'confirmed' ? { confirmationReference: 'ACK-0', confirmedBy: 'brand-owner' } : null, cancelledAt: null, cancellationReason: null, createdAt: issued, updatedAt: issued,
  };
  await pool.query(
    `INSERT INTO production_orders (id,production_order_number,rfq_id,rfq_code,rfq_version,brand_id,supplier_code,sku,sku_version,bom_version,quantity,status,version,production_start_at,delivery_due_at,payload,issued_at,created_at,updated_at,confirmed_at)
     VALUES ($1,$2,$3,$4,1,$5,$6,'SKU-SA',1,1,400,$7,2,$8,$9,$10::jsonb,$11,$11,$11,$12)`,
    [id, number, rfqId, rfqCode, brandId, supplierCode, status, payload.productionStartAt, payload.deliveryDueAt, JSON.stringify(payload), issued, status === 'confirmed' ? issued : null]);
}
