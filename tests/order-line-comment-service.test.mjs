import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderLineCommentService } from '../src/application/order-line-comment-service.mjs';

function fixture() {
  const memberships = new Map([
    ['brand-1:brand-sales', { id: 'm1', organisationId: 'brand-1', organisationType: 'brand', userId: 'brand-sales', role: 'sales', status: 'active' }],
    ['brand-1:brand-finance', { id: 'm2', organisationId: 'brand-1', organisationType: 'brand', userId: 'brand-finance', role: 'finance', status: 'active' }],
    ['shop-1:shop-buyer', { id: 'm3', organisationId: 'shop-1', organisationType: 'shop', userId: 'shop-buyer', role: 'buyer', status: 'active' }],
  ]);
  const order = { id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', lines: [{ sku: 'SKU-1' }, { sku: 'SKU-2' }] };
  const state = { comments: new Map(), commands: new Map(), outbox: [] };
  const key = (orderId, lineNo, side) => `${orderId}:${lineNo}:${side}`;
  const store = {
    async transaction(work) {
      const tx = {
        getMembership: async (orgId, userId) => memberships.get(`${orgId}:${userId}`),
        getOrder: async (id) => (id === order.id ? order : undefined),
        listOrderLineComments: async (orderId) => [...state.comments.values()].filter((value) => value.orderId === orderId),
        upsertOrderLineComment: async (value) => state.comments.set(key(value.orderId, value.lineNo, value.side), value),
        deleteOrderLineComment: async ({ orderId, lineNo, side }) => state.comments.delete(key(orderId, lineNo, side)),
        getCommand: async (id) => state.commands.get(id),
        insertCommand: async (value) => state.commands.set(value.id, value),
        appendOutbox: async (event) => state.outbox.push(event),
      };
      return work(tx);
    },
  };
  let sequence = 0;
  const service = createOrderLineCommentService({ store, clock: () => '2026-09-30T00:00:00.000Z', nextId: (prefix) => `${prefix}-${++sequence}` });
  return { state, service };
}

test('brand sales writes as the supplier, shop buyer writes as the customer', async () => {
  const { service } = fixture();
  const supplierComment = await service.setOrderLineComment('cmd-1', 'brand-sales', 'order-1', { lineNo: 1, body: 'Late by one week' });
  assert.equal(supplierComment.side, 'supplier');
  assert.equal(supplierComment.body, 'Late by one week');

  const customerComment = await service.setOrderLineComment('cmd-2', 'shop-buyer', 'order-1', { lineNo: 1, body: 'Please confirm ETA' });
  assert.equal(customerComment.side, 'customer');

  const view = await service.getOrderLineCommentsForActor('brand-sales', 'order-1');
  assert.equal(view.comments.length, 2);
  const bySide = Object.fromEntries(view.comments.map((entry) => [entry.side, entry.body]));
  assert.equal(bySide.supplier, 'Late by one week');
  assert.equal(bySide.customer, 'Please confirm ETA');
});

test('a role without order.write can read but not write', async () => {
  const { service } = fixture();
  await assert.rejects(
    () => service.setOrderLineComment('cmd-1', 'brand-finance', 'order-1', { lineNo: 1, body: 'Should not land' }),
    (error) => error.code === 'CAPABILITY_DENIED',
  );
  const view = await service.getOrderLineCommentsForActor('brand-finance', 'order-1');
  assert.deepEqual(view.comments, []);
});

test('a stranger to both organisations is refused on read and write', async () => {
  const { service } = fixture();
  await assert.rejects(
    () => service.setOrderLineComment('cmd-1', 'nobody', 'order-1', { lineNo: 1, body: 'x' }),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
  await assert.rejects(
    () => service.getOrderLineCommentsForActor('nobody', 'order-1'),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
});

test('a line number outside the order is refused', async () => {
  const { service } = fixture();
  await assert.rejects(
    () => service.setOrderLineComment('cmd-1', 'brand-sales', 'order-1', { lineNo: 3, body: 'x' }),
    (error) => error.code === 'ORDER_LINE_COMMENT_LINE_NOT_FOUND',
  );
});

test('an empty body clears an existing comment instead of storing a blank one', async () => {
  const { state, service } = fixture();
  await service.setOrderLineComment('cmd-1', 'brand-sales', 'order-1', { lineNo: 1, body: 'First note' });
  assert.equal(state.comments.size, 1);
  const cleared = await service.setOrderLineComment('cmd-2', 'brand-sales', 'order-1', { lineNo: 1, body: '   ' });
  assert.equal(cleared.body, null);
  assert.equal(state.comments.size, 0);
});

test('the same commandId replays its result instead of writing twice', async () => {
  const { state, service } = fixture();
  const first = await service.setOrderLineComment('cmd-1', 'brand-sales', 'order-1', { lineNo: 1, body: 'Note' });
  const second = await service.setOrderLineComment('cmd-1', 'brand-sales', 'order-1', { lineNo: 1, body: 'Note' });
  assert.deepEqual(first, second);
  assert.equal(state.outbox.length, 1);
});
