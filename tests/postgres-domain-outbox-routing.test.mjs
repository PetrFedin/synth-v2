import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { createPostgresMaterialStore } from '../src/infrastructure/postgres-material-store.mjs';

function fixture() {
  const queries = [];
  const client = {
    async query(sql, params = []) { queries.push({ sql, params }); return { rows: [], rowCount: 1 }; },
    release() { queries.push({ sql: 'RELEASE', params: [] }); },
  };
  return {
    queries,
    pool: {
      async connect() { return client; },
      async query() { return { rows: [], rowCount: 0 }; },
    },
  };
}

const event = Object.freeze({
  id: 'event-1', type: 'material.created', aggregateId: 'FAB-001', occurredAt: '2026-08-03T12:00:00.000Z',
  payload: { brandId: 'brand-1' }, metadata: { commandId: 'cmd-1', actorId: 'user-1' },
});

for (const [label, createStore] of [
  ['catalog', createPostgresCatalogStore],
  ['material', createPostgresMaterialStore],
]) {
  test(`${label} store writes events to the publisher-visible unified outbox`, async () => {
    const { pool, queries } = fixture();
    const store = createStore({ pool });
    await store.transaction((tx) => tx.appendOutbox(event));
    const insert = queries.find((entry) => /INSERT INTO outbox_events/.test(entry.sql));
    assert.ok(insert, 'unified outbox insert is required');
    assert.equal(queries.some((entry) => /INSERT INTO catalog_outbox_events/.test(entry.sql)), false);
    assert.deepEqual(insert.params.slice(0, 3), ['event-1', 'material.created', 'FAB-001']);
    assert.equal(JSON.parse(insert.params[3]).id, 'event-1');
    assert.equal(queries[0].sql, 'BEGIN');
    assert.equal(queries.at(-2).sql, 'COMMIT');
    assert.equal(queries.at(-1).sql, 'RELEASE');
  });
}
