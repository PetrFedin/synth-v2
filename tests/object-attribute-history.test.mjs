import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHistoryQueryService } from '../src/application/history-query-service.mjs';

const root = process.cwd();

function service(reader) {
  return createHistoryQueryService({ reader: { forActor: async () => ({ items: [], nextCursor: null }), ...reader } });
}

test('The attribute stream refuses a filter it cannot understand rather than ignoring it', async () => {
  // A filter that is quietly dropped answers a different question from the one that was asked, and
  // the reader has no way to tell. "Who changed the price in August" must not silently become
  // "every change ever made".
  const api = service({ attributesForActor: async () => ({ items: [], nextCursor: null }) });
  const code = async (options) => {
    try { await api.attributesForActor(options.actorId ?? 'user', options.subjectId ?? 'subject', options.query ?? {}); }
    catch (error) { return error.code; }
    return 'NO_ERROR';
  };
  assert.equal(await code({ query: { from: 'not-a-date' } }), 'HISTORY_FILTER_INVALID');
  assert.equal(await code({ query: { attribute: 'x'.repeat(201) } }), 'HISTORY_FILTER_INVALID');
  assert.equal(await code({ query: { from: '2026-09-02', to: '2026-09-01' } }), 'HISTORY_RANGE_INVALID');
  assert.equal(await code({ actorId: '' }), 'HISTORY_ACTOR_REQUIRED');
  assert.equal(await code({ subjectId: '' }), 'HISTORY_SUBJECT_INVALID');
  assert.equal(await code({ query: { limit: 5000 } }), 'HISTORY_LIMIT_INVALID');
});

test('The attribute stream passes its filters through as instants', async () => {
  let seen = null;
  const api = service({ attributesForActor: async (_actor, _subject, options) => { seen = options; return { items: [], nextCursor: null }; } });
  await api.attributesForActor('user', 'subject', { attribute: ' lifecycle_status ', actor: 'someone', from: '2026-09-01', to: '2026-09-30', limit: 10 });
  assert.equal(seen.attribute, 'lifecycle_status');
  assert.equal(seen.actor, 'someone');
  assert.equal(seen.from, new Date('2026-09-01').toISOString());
  assert.equal(seen.to, new Date('2026-09-30').toISOString());
  assert.equal(seen.limit, 10);
  const empty = await api.attributesForActor('user', 'subject', {});
  assert.deepEqual(empty.items, []);
  assert.equal(seen.attribute, null, 'an absent filter is absent, not an empty string');
});

test('The view only subtracts snapshots of the same aggregate and the same event type', async () => {
  const sql = await readFile(path.join(root, 'db/migrations/101_object_attribute_history.sql'), 'utf8');
  // Both restrictions are the correctness of the view, so both are pinned here: without the first
  // it reports edits between two different kinds of statement; without the second it reports one
  // command's arguments as changes to the object.
  assert.match(sql, /PARTITION BY event\.aggregate_id, event\.event_type/);
  assert.match(sql, /WHERE event\.event -> 'payload' ->> 'id' = event\.aggregate_id/);
  // Bookkeeping columns say nothing a reader wants and change on every write.
  for (const column of ['id', 'brand_id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'content_hash']) {
    assert.ok(sql.includes(`'${column}'`), `bookkeeping column not excluded: ${column}`);
  }
  assert.match(sql, /IS DISTINCT FROM/, 'a value set to null is a change as much as one set to a value');
  assert.match(sql, /object_brand_index/, 'every row must carry the brand that owns the object');
  // The access rule lives with the query, as it does for the event feed: an object's history is
  // readable by the brand that owns the object, and by nobody else.
  const reader = await readFile(path.join(root, 'src/infrastructure/postgres-history-reader.mjs'), 'utf8');
  const attributeQuery = reader.slice(reader.indexOf('attributesForActor'));
  assert.match(attributeQuery, /object_attribute_history_workspace/);
  assert.match(attributeQuery, /FROM memberships AS membership/);
  assert.match(attributeQuery, /membership\.status = 'active'/);
});

test('The product card offers the attribute stream with its own filters', async () => {
  const js = await readFile(path.join(root, 'public/modules/styles.js'), 'utf8');
  for (const token of ['changesPanel', 'loadChanges', '/attributes?', 'changedAttributeLabel', 'changedValue',
    // Renamed away from the obvious `attributeValue`, which this file already declares for the
    // category-attribute panel: two declarations of one name in one scope silently keep the later.
    'od-change-filters',
    "CHANGES.attribute", "CHANGES.actor", "CHANGES.from", "CHANGES.to"]) {
    assert.ok(js.includes(token), token);
  }
  const routes = await readFile(path.join(root, 'src/http/history-routes.mjs'), 'utf8');
  assert.match(routes, /\/v2\\\/history\\\/\(\[\^\/\]\+\)\\\/attributes/);
  assert.ok(routes.includes("'attribute', 'actor', 'from', 'to'"), 'the route must accept the filters the panel sends');
});
