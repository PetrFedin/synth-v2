import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createLibraryQueryService } from '../src/application/library-query-service.mjs';

const read = (relativePath) => readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');

function serviceWith(calls) {
  return createLibraryQueryService({
    reader: {
      async listForActor() { return [{ code: 'colour.colour' }]; },
      async entriesForActor(actorId, dictionaryCode, options) {
        calls.push({ actorId, dictionaryCode, options });
        return { items: [{ code: 'BLACK' }], nextCursor: null };
      },
    },
  });
}

test('a library page is a page, whatever the caller asks for', async () => {
  const calls = [];
  const service = serviceWith(calls);
  await service.entriesForActor('actor-1', 'colour.colour', {});
  assert.equal(calls[0].options.limit, 100);

  for (const limit of [0, -1, 201, 2.5, 'many']) {
    await assert.rejects(
      () => service.entriesForActor('actor-1', 'colour.colour', { limit }),
      (error) => error.code === 'LIBRARY_LIMIT_INVALID',
    );
  }
});

test('a library is named by a governed code, not by whatever arrives', async () => {
  const service = serviceWith([]);
  for (const code of ['', 'Colour', 'colour colour', '../etc/passwd', null]) {
    await assert.rejects(
      () => service.entriesForActor('actor-1', code, {}),
      (error) => error.code === 'LIBRARY_CODE_INVALID',
    );
  }
  await assert.rejects(() => service.listForActor(''), (error) => error.code === 'LIBRARY_ACTOR_REQUIRED');
});

test('reference data is read-only from the application', async () => {
  const routes = await read('src/http/library-routes.mjs');
  // A library changes through the MDM bootstrap, under review. Offering a write here would put an
  // unreviewed edit into the data every other rule is checked against.
  assert.doesNotMatch(routes, /mutation: true/);
  assert.doesNotMatch(routes, /'POST'|'PATCH'|'PUT'|'DELETE'/);
});

test('an account with no membership sees no libraries', async () => {
  const reader = await read('src/infrastructure/postgres-library-reader.mjs');
  // Reference data is global, so there is nothing to scope by brand — but it is still not public.
  assert.match(reader, /FROM memberships AS membership[\s\S]*?membership\.status = 'active'/);
  assert.match(reader, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
});

test('the governance bookkeeping is kept out of what a reader sees', async () => {
  const sql = await read('db/migrations/091_mdm_library_workspace.sql');
  assert.match(sql, /entry\.attributes - 'descriptionRu' - 'descriptionEn' - 'source'/);
  assert.match(sql, /- 'change_reason' - 'datasetVersion' - 'operationalProfile'/);
});

test('the construction node library describes how a part is made and on which machine', async () => {
  const dataset = JSON.parse(await read('mdm/reference/russia-fashion-construction-core.json'));
  const nodes = dataset.dictionaries.find((dictionary) => dictionary.code === 'design.construction_node');
  assert.ok(nodes.entries.length >= 10);
  for (const entry of nodes.entries) {
    assert.ok(entry.attributes.machine_class, `${entry.code} must name the machine class it needs`);
    assert.ok(entry.description_ru.trim().length > 20, `${entry.code} must say what the node is`);
  }
});
