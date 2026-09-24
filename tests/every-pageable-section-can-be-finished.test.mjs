import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { WORKSPACE_CURSOR_POSITION_LENGTHS, WORKSPACE_SECTION_NAMES, encodeWorkspaceCursor } from '../src/core/workspace-cursor.mjs';

const root = process.cwd();

// Списки страничных разделов живут в четырёх местах: имена и длины курсора в ядре, порядок
// сортировки в службе и в читателе, и ещё один — в клиенте. Разойтись они могут молча, и именно
// так и разошлись: клиент знал четырнадцать разделов из семнадцати, а `reset()` отбрасывает всё,
// чего нет в его списке, — без ошибки. Сервер объявлял `placeholders`, `colorways` и `media`
// обрезанными и выдавал курсор, клиент выбрасывал курсор, и первая сотня выглядела как всё.
//
// Поэтому тест проверяет не случай, а причину: списки обязаны совпадать.

function parseSortFieldSections(source) {
  const body = source.match(/const SORT_FIELDS = Object\.freeze\(\{([\s\S]*?)\n\}\);/)[1];
  return [...body.matchAll(/^\s{2}(\w+): Object\.freeze\(\[(.*)\]\),$/gm)].map(([, section, fields]) => ({
    section,
    fields: [...fields.matchAll(/\['(\w+)', '(?:asc|desc)'\]/g)].map(([, field]) => field),
  }));
}

function parsePageSortSections(source) {
  const body = source.match(/const PAGE_SORT = Object\.freeze\(\{([\s\S]*?)\n\}\);/)[1];
  return [...body.matchAll(/^\s{2}(\w+): Object\.freeze\(\[(.*)\]\),$/gm)].map(([, section, fields]) => ({
    section,
    expressions: [...fields.matchAll(/expression: (?:"([^"]+)"|'([^']+)')/g)].map(([, doubles, singles]) => (doubles ?? singles).trim()),
  }));
}

test('the client pages exactly the sections the server pages', async () => {
  const client = await readFile(path.join(root, 'public/modules/workspace-pagination.js'), 'utf8');
  const listed = client.match(/const SECTIONS = Object\.freeze\(\[([\s\S]*?)\]\);/)[1];
  const sections = [...listed.matchAll(/'(\w+)'/g)].map(([, name]) => name);
  assert.deepEqual(sections, [...WORKSPACE_SECTION_NAMES]);
});

test('the service and the reader sort every section the core names', async () => {
  const service = await readFile(path.join(root, 'src/application/workspace-query-service.mjs'), 'utf8');
  const reader = await readFile(path.join(root, 'src/infrastructure/postgres-workspace-reader.mjs'), 'utf8');
  assert.deepEqual(parseSortFieldSections(service).map(entry => entry.section), [...WORKSPACE_SECTION_NAMES]);
  assert.deepEqual(parsePageSortSections(reader).map(entry => entry.section), [...WORKSPACE_SECTION_NAMES]);
  assert.deepEqual(Object.keys(WORKSPACE_CURSOR_POSITION_LENGTHS), [...WORKSPACE_SECTION_NAMES]);
});

test('every section ends its order on a key that is unique and never empty', async () => {
  // Курсор keyset-постраничный: последнее поле — «замок», по которому страница продолжается. Если
  // оно не уникально, строки с одинаковым значением теряются или повторяются на границе страниц;
  // если оно может быть пустым, курсор не выпускается вовсе. `media` был ровно таким: пара
  // (styleVersionId, colorwayId) — не ключ, а у строки уровня стиля colorwayId пуст, и сервер
  // отвечал 400 на собственный же курсор.
  const UNIQUE_KEYS = new Set(['id', 'sku']);
  const service = await readFile(path.join(root, 'src/application/workspace-query-service.mjs'), 'utf8');
  const reader = await readFile(path.join(root, 'src/infrastructure/postgres-workspace-reader.mjs'), 'utf8');

  for (const { section, fields } of parseSortFieldSections(service)) {
    assert.ok(UNIQUE_KEYS.has(fields.at(-1)), `${section} must end its sort on a unique key, not ${fields.at(-1)}`);
    assert.equal(fields.length, WORKSPACE_CURSOR_POSITION_LENGTHS[section], `${section} cursor length must match its sort`);
  }
  for (const { section, expressions } of parsePageSortSections(reader)) {
    assert.ok(UNIQUE_KEYS.has(expressions.at(-1)), `${section} page sort must end on a unique column, not ${expressions.at(-1)}`);
  }
});

test('a cursor cannot be issued for a position whose tie-breaker is empty', () => {
  // Это и было живым дефектом, а не теорией: половина строк media не имеет colorway.
  assert.throws(
    () => encodeWorkspaceCursor({ section: 'campaigns', position: ['2026-01-01', 'Resort', null] }),
    (error) => error.code === 'WORKSPACE_CURSOR_INVALID',
  );
  assert.ok(encodeWorkspaceCursor({ section: 'media', position: ['product-style-version_x:product-colorway_y'] }));
});

test('the media register carries the key it is paged by', async () => {
  // Клиент видит только payload, поэтому ключ обязан быть в нём, иначе склейка страниц не может
  // опознать запись. Вьюха строит его сама и держит одну строку на пару — он уникален по
  // построению и никогда не пуст.
  const migration = await readFile(path.join(root, 'db/migrations/129_media_can_be_paged.sql'), 'utf8');
  assert.match(migration, /'id', chosen\.style_version_id \|\| COALESCE\(':' \|\| chosen\.colorway_id, ''\)/);
});
