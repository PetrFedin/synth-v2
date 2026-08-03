import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/core/errors.mjs';
import { withNotificationPageMetadata } from '../src/application/notification-page-service.mjs';
import { createPostgresNotificationReader } from '../src/infrastructure/postgres-notification-reader.mjs';

test('notification metadata decorates a validated page with an exact unread count', async () => {
  const calls = [];
  const service = withNotificationPageMetadata({
    service: {
      async pageForActor(actorId, options) {
        calls.push(['page', actorId, options]);
        return Object.freeze({ items: Object.freeze([{ id: 'notification-1' }]), nextCursor: 'cursor-2' });
      },
      async markRead() { return true; },
    },
    reader: {
      async countUnreadForActor(actorId) {
        calls.push(['count', actorId]);
        return 17;
      },
    },
  });

  const page = await service.pageForActor('actor-1', { limit: 1 });
  assert.deepEqual(page, {
    items: [{ id: 'notification-1' }],
    nextCursor: 'cursor-2',
    unreadCount: 17,
  });
  assert.equal(Object.isFrozen(page), true);
  assert.deepEqual(calls, [
    ['page', 'actor-1', { limit: 1 }],
    ['count', 'actor-1'],
  ]);
  assert.equal(typeof service.markRead, 'function');
});

test('invalid requests and malformed pages fail before the unread count query', async () => {
  for (const page of [
    () => { throw new DomainError('NOTIFICATION_CURSOR_INVALID', 'Invalid cursor'); },
    () => ({ items: 'not-an-array', nextCursor: null }),
    () => ({ items: [], nextCursor: 42 }),
  ]) {
    let counts = 0;
    const service = withNotificationPageMetadata({
      service: { async pageForActor() { return page(); } },
      reader: {
        async countUnreadForActor() { counts += 1; return 0; },
      },
    });

    await assert.rejects(
      () => service.pageForActor('actor-1', { cursor: 'invalid' }),
      error => ['NOTIFICATION_CURSOR_INVALID', 'NOTIFICATION_PAGE_RESULT_INVALID'].includes(error.code),
    );
    assert.equal(counts, 0);
  }
});

test('PostgreSQL unread count is actor-scoped and validates bigint conversion', async () => {
  const queries = [];
  const reader = createPostgresNotificationReader({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [{ unread_count: '42' }] };
      },
    },
  });

  assert.equal(await reader.countUnreadForActor('actor-1'), 42);
  assert.match(queries[0].sql, /notification\.status = 'unread'/);
  assert.match(queries[0].sql, /membership\.user_id = \$1/);
  assert.match(queries[0].sql, /membership\.status = 'active'/);
  assert.deepEqual(queries[0].params, ['actor-1']);

  const unsafe = createPostgresNotificationReader({
    pool: { async query() { return { rows: [{ unread_count: '9007199254740992' }] }; } },
  });
  await assert.rejects(
    () => unsafe.countUnreadForActor('actor-1'),
    error => error.code === 'NOTIFICATION_COUNT_INVALID',
  );
});
