import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';

test('memory store rolls back an entire failed transaction', async () => {
  const store = createMemoryWholesaleStore();
  await assert.rejects(store.transaction((tx) => {
    tx.insertOrganisation(Object.freeze({ id: 'brand-1', type: 'brand', name: 'Brand' }));
    throw new Error('boom');
  }));
  assert.equal(store.snapshot().organisations.length, 0);
});

test('optimistic concurrency rejects stale aggregate version', async () => {
  const store = createMemoryWholesaleStore();
  await store.transaction((tx) => tx.insertCampaign(Object.freeze({ id: 'c1', version: 1 })));
  await assert.rejects(
    store.transaction((tx) => tx.saveCampaign(Object.freeze({ id: 'c1', version: 2 }), 0)),
    (error) => error.code === 'CAMPAIGN_CONCURRENCY_CONFLICT',
  );
});

test('outbox publication state is persisted', async () => {
  const store = createMemoryWholesaleStore();
  const event = Object.freeze({ id: 'event-1' });
  await store.transaction((tx) => tx.appendOutbox(event));
  assert.equal(store.readOutbox('pending').length, 1);
  await store.markOutboxPublished(['event-1'], 'now');
  assert.equal(store.readOutbox('pending').length, 0);
  assert.equal(store.readOutbox('published')[0].publishedAt, 'now');
});
