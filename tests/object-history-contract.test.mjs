import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHistoryQueryService } from '../src/application/history-query-service.mjs';

const read = (relativePath) => readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
const service = (calls = []) => createHistoryQueryService({
  reader: { async forActor(actorId, subjectId, options) { calls.push({ actorId, subjectId, options }); return { items: [], nextCursor: null }; } },
});

test('a history page is a page, and a subject is required', async () => {
  const calls = [];
  const history = service(calls);
  await history.forActor('actor-1', 'style-1', {});
  assert.equal(calls[0].options.limit, 50);
  for (const limit of [0, -5, 201, 1.5]) {
    await assert.rejects(() => history.forActor('actor-1', 'style-1', { limit }), (error) => error.code === 'HISTORY_LIMIT_INVALID');
  }
  for (const subject of ['', '   ', null, 'x'.repeat(201)]) {
    await assert.rejects(() => history.forActor('actor-1', subject, {}), (error) => error.code === 'HISTORY_SUBJECT_INVALID');
  }
  await assert.rejects(() => history.forActor('', 'style-1', {}), (error) => error.code === 'HISTORY_ACTOR_REQUIRED');
});

test('who may read a history is decided by who owns the object, not by the event', async () => {
  const sql = await read('db/migrations/094_object_history_actor_fallback.sql');
  // Fewer than six events in ten carry a brand of their own. Gating on the event would silently hide
  // the rest, and a history that looks complete while omitting two changes in five is worse than none.
  assert.match(sql, /FROM object_brand_index brand_index/);
  const reader = await read('src/infrastructure/postgres-history-reader.mjs');
  assert.match(reader, /membership\.organisation_id = history\.brand_id/);
  assert.match(reader, /membership\.status = 'active'/);
});

test('a change is filed against the object a reader would say it was about', async () => {
  const sql = await read('db/migrations/093_object_history_subjects.sql');
  // Setting an attribute or attaching an image records against its own identifier, so without this a
  // style card would show its own status changes and none of the work done on it.
  assert.match(sql, /CREATE OR REPLACE VIEW object_history_subject_index/);
  for (const relation of ['product_colorways', 'product_media', 'product_style_responsibilities', 'product_attribute_values']) {
    assert.ok(sql.includes(relation), `${relation} must resolve to the style it belongs to`);
  }
  // Only relations where a child clearly belongs to one style are mapped.
  assert.match(sql, /WHERE value\.owner_type = 'style_version'/);
});

test('the actor is recovered from the row when a trigger emitted the event', async () => {
  const sql = await read('db/migrations/094_object_history_actor_fallback.sql');
  assert.match(sql, /event\.event -> 'metadata' ->> 'actorId',\s*\n\s*event\.event -> 'payload' ->> 'updated_by',\s*\n\s*event\.event -> 'payload' ->> 'created_by'/);
});

test('history is read-only and says nothing about objects the reader cannot see', async () => {
  const routes = await read('src/http/history-routes.mjs');
  assert.doesNotMatch(routes, /mutation: true/);
  assert.doesNotMatch(routes, /'POST'|'PATCH'|'PUT'|'DELETE'/);
  const application = await read('src/application/history-query-service.mjs');
  // An object with no history and one the reader may not see look the same, deliberately: the
  // alternative tells an outsider that the object exists.
  assert.match(application, /look the same from here, and/);
});
