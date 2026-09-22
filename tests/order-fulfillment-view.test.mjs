import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createOrderFulfillmentViewService } from '../src/application/order-fulfillment-view-service.mjs';

const root = process.cwd();
const ORDER = Object.freeze({ id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR' });

function serviceFor(memberships) {
  return createOrderFulfillmentViewService({
    store: {
      transaction: (work) => work({
        getOrder: async () => ORDER,
        getMembership: async (organisationId) => memberships[organisationId],
      }),
    },
    reader: { readOrderFulfillment: async () => Object.freeze([Object.freeze({ id: 'plan-1', shipments: [] })]) },
  });
}

const BRAND_OWNER = { organisationId: 'brand-1', userId: 'a', role: 'owner', status: 'active' };
const SHOP_BUYER = { organisationId: 'shop-1', userId: 'b', role: 'buyer', status: 'active' };

test('both sides of the trade may see where the goods are', async () => {
  // Бренд отгружает, магазин принимает — цепочка у них одна, и право спрашивается у той
  // организации, в которой состоит спрашивающий.
  for (const memberships of [{ 'brand-1': BRAND_OWNER }, { 'shop-1': SHOP_BUYER }]) {
    const view = await serviceFor(memberships).getOrderFulfillmentForActor('actor-1', 'order-1');
    assert.equal(view.orderId, 'order-1');
    assert.equal(view.plans.length, 1);
  }
});

test('a stranger to both organisations is refused', async () => {
  await assert.rejects(
    () => serviceFor({}).getOrderFulfillmentForActor('actor-1', 'order-1'),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
});

test('the tail is read in one request instead of one per level', async () => {
  // Поштучное чтение по идентификатору у хвоста было; спросить про заказ целиком было нечем — и
  // это, а не отсутствие вёрстки, держало экран пустым. Запрос на каждый уровень означал бы N+1
  // там, где заведомо нужен весь список.
  const source = await readFile(path.join(root, 'src/infrastructure/postgres-order-fulfillment-reader.mjs'), 'utf8');
  for (const table of ['fulfillment_plan_snapshots', 'shipment_notice_snapshots', 'receipt_snapshots',
    'receipt_discrepancy_snapshots', 'receipt_discrepancy_claim_snapshots', 'receipt_claim_resolution_snapshots']) {
    assert.ok(source.includes(table), `${table} must be part of the chain`);
  }
  assert.match(source, /= ANY\(\$1\)/, 'дочерние уровни читаются пачкой, а не по одному');
});

test('the screen names the shortage and the claim, not only the happy path', async () => {
  const view = await readFile(path.join(root, 'public/modules/order-fulfillment-view.js'), 'utf8');
  for (const marker of ['Принято к учёту', 'Повреждено', 'Недостача', 'Претензия', 'Решение по претензии']) {
    assert.ok(view.includes(marker), `${marker} must be shown`);
  }
  // Сошедшаяся поставка говорит об этом прямо, а не молчит.
  assert.ok(view.includes('нет, поставка сошлась'));
  const actions = await readFile(path.join(root, 'public/modules/order-lifecycle-actions.js'), 'utf8');
  assert.match(actions, /window\.orderFulfillmentDialog\(item\)/);
  assert.match(actions, /CAPABILITIES\.LOGISTICS_READ/);
});
