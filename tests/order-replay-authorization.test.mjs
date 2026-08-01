import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';
import { canonicalJson } from '../src/core/fingerprints.mjs';

function draftReplayFixture({ membership }) {
  const calls = [];
  const terms = Object.freeze({ paymentTerms: 'NET30' });
  const previousResult = Object.freeze({
    id: 'order-1',
    selectionId: 'selection-1',
    cycleId: 'cycle-1',
    brandId: 'brand-1',
    shopId: 'shop-1',
    status: 'draft',
    version: 1,
  });
  const store = {
    async transaction(work) {
      return work({
        async getCommand(id) {
          calls.push(`command:${id}`);
          return Object.freeze({
            id,
            actorId: 'buyer-1',
            fingerprint: `createOrderDraft:buyer-1:selection-1:${canonicalJson(terms)}`,
            result: previousResult,
          });
        },
        async getSelection(id) {
          calls.push(`selection:${id}`);
          return Object.freeze({ id, cycleId: 'cycle-1', collectionId: 'collection-1', shopId: 'shop-1' });
        },
        async getMembership(organisationId, userId) {
          calls.push(`membership:${organisationId}:${userId}`);
          return membership;
        },
        getCycle() { throw new Error('replay must not recheck mutable cycle stage'); },
        getCollection() { throw new Error('replay must not recheck collection'); },
        getOrderByCycle() { throw new Error('replay must not recheck uniqueness'); },
        insertOrder() { throw new Error('replay must not insert order'); },
        appendOutbox() { throw new Error('replay must not append outbox'); },
        insertCommand() { throw new Error('replay must not insert command'); },
      });
    },
    async snapshot() { return {}; },
  };
  return { calls, terms, previousResult, store };
}

test('revoked buyer cannot retrieve a stored order draft result', async () => {
  const fixture = draftReplayFixture({ membership: undefined });
  const service = createOrderBuilderService({ store: fixture.store });

  await assert.rejects(
    () => service.createOrderDraft('command-1', 'buyer-1', { selectionId: 'selection-1', terms: fixture.terms }),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
  assert.deepEqual(fixture.calls, [
    'command:command-1',
    'selection:selection-1',
    'membership:shop-1:buyer-1',
  ]);
});

test('authorized order draft replay skips mutable stage and uniqueness guards', async () => {
  const fixture = draftReplayFixture({
    membership: Object.freeze({
      organisationId: 'shop-1',
      userId: 'buyer-1',
      organisationType: 'shop',
      status: 'active',
      role: 'buyer',
    }),
  });
  const service = createOrderBuilderService({ store: fixture.store });

  const result = await service.createOrderDraft('command-1', 'buyer-1', {
    selectionId: 'selection-1',
    terms: fixture.terms,
  });

  assert.equal(result, fixture.previousResult);
  assert.deepEqual(fixture.calls, [
    'command:command-1',
    'selection:selection-1',
    'membership:shop-1:buyer-1',
  ]);
});

test('trade order replay requires a currently authorized trade membership', async () => {
  const previousResult = Object.freeze({ order: Object.freeze({ id: 'order-1' }), cycle: Object.freeze({ id: 'cycle-1' }) });
  const calls = [];
  const store = {
    async transaction(work) {
      return work({
        async getCommand(id) {
          calls.push(`command:${id}`);
          return Object.freeze({
            id,
            actorId: 'former-buyer',
            fingerprint: 'attachOrderToCycle:former-buyer:order-1',
            result: previousResult,
          });
        },
        async getOrder(id) {
          calls.push(`order:${id}`);
          return Object.freeze({ id, cycleId: 'cycle-1' });
        },
        async getCycle(id) {
          calls.push(`cycle:${id}`);
          return Object.freeze({ id, brandId: 'brand-1', shopId: 'shop-1', stage: 'order' });
        },
        async listMembershipsForTrade() {
          calls.push('trade-memberships');
          return [];
        },
        saveCycle() { throw new Error('replay must not mutate cycle'); },
        saveOrder() { throw new Error('replay must not mutate order'); },
        appendOutbox() { throw new Error('replay must not append outbox'); },
        insertCommand() { throw new Error('replay must not insert command'); },
      });
    },
    async snapshot() { return {}; },
  };
  const service = createOrderBuilderService({ store });

  await assert.rejects(
    () => service.attachOrderToCycle('command-1', 'former-buyer', 'order-1'),
    (error) => error.code === 'TRADE_MEMBERSHIP_REQUIRED',
  );
  assert.deepEqual(calls, [
    'command:command-1',
    'order:order-1',
    'cycle:cycle-1',
    'trade-memberships',
  ]);
});
