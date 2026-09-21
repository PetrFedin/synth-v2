import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresOutboxPublicationStore } from '../src/infrastructure/postgres-outbox-publication-store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the outbox records when an event was queued, seeded from the event it already carries', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '124_outbox_queue_age.sql'), 'utf8');
  assert.match(sql, /ALTER TABLE outbox_events\s+ADD COLUMN IF NOT EXISTS queued_at timestamptz/);
  // Засев из полезной нагрузки, а не `now()`: `now()` объявил бы месячную очередь новорождённой и
  // стёр бы ровно тот факт, ради которого колонка и заводится.
  assert.match(sql, /SET queued_at = COALESCE\(\(event->>'occurredAt'\)::timestamptz, published_at, now\(\)\)/);
  assert.match(sql, /ALTER COLUMN queued_at SET DEFAULT now\(\)/);
  assert.match(sql, /ALTER COLUMN queued_at SET NOT NULL/);
  // Частичный индекс: спрашивают всегда про ждущих, а доставленных со временем становится больше всех.
  assert.match(sql, /CREATE INDEX IF NOT EXISTS outbox_pending_queued_at_idx\s+ON outbox_events \(queued_at\)\s+WHERE status = 'pending'/);
});

test('the publisher claims the events that have waited longest by their queue time, not by text from jsonb', async () => {
  const queries = [];
  const store = createPostgresOutboxPublicationStore({
    pool: {
      async connect() {
        return {
          async query(sql, params = []) { queries.push({ sql, params }); return { rows: [], rowCount: 0 }; },
          release() {},
        };
      },
      async query(sql, params = []) { queries.push({ sql, params }); return { rows: [], rowCount: 0 }; },
    },
  });
  await store.claimPending({
    workerId: 'worker-1', claimToken: 'token-1',
    claimedAt: '2026-09-22T00:00:00.000Z', leaseExpiresAt: '2026-09-22T00:05:00.000Z', limit: 10,
  });
  const claim = queries.find((entry) => entry.sql.includes('outbox_publication_claims'));
  assert.ok(claim, 'claimPending must query the claims table');
  assert.match(claim.sql, /ORDER BY source\.queued_at, source\.id/);
  assert.doesNotMatch(claim.sql, /ORDER BY source\.event->>'occurredAt'/);
});

test('the queue can state how much is waiting and how long the oldest has waited', async () => {
  const store = createPostgresOutboxPublicationStore({
    pool: {
      async connect() { return { async query() { return { rows: [], rowCount: 0 }; }, release() {} }; },
      async query(sql) {
        assert.match(sql, /count\(\*\)::integer AS pending/);
        assert.match(sql, /min\(queued_at\) AS oldest_queued_at/);
        assert.match(sql, /WHERE status = 'pending'/);
        return { rows: [{ pending: 1067, oldest_queued_at: '2026-08-19T00:00:00.000Z' }], rowCount: 1 };
      },
    },
  });
  const backlog = await store.readBacklog();
  assert.equal(backlog.pending, 1067);
  assert.equal(backlog.oldestQueuedAt, '2026-08-19T00:00:00.000Z');
  assert.ok(Object.isFrozen(backlog));
});

test('an empty queue reports nothing waiting rather than a missing measurement', async () => {
  const store = createPostgresOutboxPublicationStore({
    pool: {
      async connect() { return { async query() { return { rows: [], rowCount: 0 }; }, release() {} }; },
      async query() { return { rows: [{ pending: 0, oldest_queued_at: null }], rowCount: 1 }; },
    },
  });
  const backlog = await store.readBacklog();
  assert.deepEqual({ ...backlog }, { pending: 0, oldestQueuedAt: null });
});

test('the server names an unpublished backlog and the absence of a subscriber instead of staying silent', async () => {
  const source = await readFile(path.join(root, 'src', 'server.mjs'), 'utf8');
  // Проверка готовности раньше молчала об очереди вовсе: она проверяет живость
  // **зарегистрированных** работников, а без адреса вебхука этот не регистрировался.
  assert.match(source, /if \(!runtime\.outboxPublication\) \{/);
  assert.match(source, /healthRegistry\.register\('outbox-publication', \(\) => Object\.freeze\(\{/);
  assert.match(source, /publisher: 'not-configured'/);
  assert.match(source, /pending: outboxBacklog\?\.pending \?\? null/);
  // Отсутствие подписчика не делает узел неготовым: это законная настройка.
  assert.match(source, /status: 'ready',\s+publisher: 'not-configured'/);
  assert.match(source, /SYNTHA_OUTBOX_WEBHOOK_URL is unset/);
  assert.match(source, /await refreshOutboxBacklog\(\)/);
});
