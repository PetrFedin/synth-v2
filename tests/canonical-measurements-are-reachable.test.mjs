import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeasurementQueryService } from '../src/application/measurement-query-service.mjs';

// Авторитетный реестр обмеров был недостижим через API: канонических таблиц не было ни в списке,
// ни в ответе по стилю, ни в рабочем пространстве — только по прямому идентификатору. При этом
// спецификация (ARCHITECTURE §356) объявляет именно каноническую таблицу репозиторно-авторитетной
// и единственной, что удовлетворяет гейт готовности продукта. Отсутствие моста по идентичности
// между двумя семействами — решение намеренное; недостижимость авторитетного реестра — нет.

function canonicalChart(id, styleVersionId, colorwayId) {
  return { id, brandId: 'brand-1', styleVersionId, colorwayId, sizeScaleVersionId: 'scale-1', status: 'published', unit: 'cm', version: 2 };
}

function readerWith(charts) {
  const calls = [];
  return {
    calls,
    pageForActor: async () => ({ items: [], hasMore: false }),
    getForActor: async () => undefined,
    getCanonicalForActor: async () => undefined,
    pageCanonicalForActor: async (actorId, options) => {
      calls.push(options);
      const matching = charts.filter((chart) => !options.filters.styleVersionId || chart.styleVersionId === options.filters.styleVersionId);
      const after = options.afterId ? matching.filter((chart) => chart.id > options.afterId) : matching;
      const items = after.slice(0, options.limit);
      return { items, hasMore: after.length > options.limit, ...(after.length > options.limit ? { nextId: items.at(-1).id } : {}) };
    },
  };
}

test('the canonical register can be read without already knowing an identifier', async () => {
  const charts = [
    canonicalChart('measurement_a', 'style-version-1', 'colorway-1'),
    canonicalChart('measurement_b', 'style-version-1', 'colorway-2'),
    canonicalChart('measurement_c', 'style-version-2', 'colorway-3'),
  ];
  const service = createMeasurementQueryService({ reader: readerWith(charts) });

  const first = await service.pageCanonicalForActor('user-1', { limit: 2 });
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor, 'a truncated register must say how to continue');

  const second = await service.pageCanonicalForActor('user-1', { limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map((item) => item.id), ['measurement_c']);
  assert.equal(second.nextCursor, null);
  // Идентификаторы не повторяются между страницами: позиция ведётся по id, а не по SKU, которого
  // у канонической таблицы нет вовсе.
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 3);
});

test('a person looking at one style version can ask for exactly its measurements', async () => {
  const charts = [
    canonicalChart('measurement_a', 'style-version-1', 'colorway-1'),
    canonicalChart('measurement_b', 'style-version-1', 'colorway-2'),
    canonicalChart('measurement_c', 'style-version-2', 'colorway-3'),
  ];
  const reader = readerWith(charts);
  const service = createMeasurementQueryService({ reader });

  const page = await service.pageCanonicalForActor('user-1', { styleVersionId: 'style-version-1' });
  assert.deepEqual(page.items.map((item) => item.id), ['measurement_a', 'measurement_b']);
  assert.equal(reader.calls.at(-1).filters.styleVersionId, 'style-version-1');
});

test('a cursor cannot be carried across a different filter set', async () => {
  const service = createMeasurementQueryService({ reader: readerWith([
    canonicalChart('measurement_a', 'style-version-1', 'colorway-1'),
    canonicalChart('measurement_b', 'style-version-1', 'colorway-2'),
  ]) });
  const page = await service.pageCanonicalForActor('user-1', { limit: 1 });
  await assert.rejects(
    () => service.pageCanonicalForActor('user-1', { limit: 1, cursor: page.nextCursor, styleVersionId: 'style-version-2' }),
    (error) => error.code === 'MEASUREMENT_CURSOR_INVALID',
  );
});

test('the two registers stay separate: neither list answers for the other', async () => {
  // Спецификация объявляет, что каноническая таблица **никогда** не выводит идентичность из
  // текстового SKU. Поэтому список по SKU не должен начать отдавать канонические, а канонический —
  // те, что заведены на SKU: достижимость чинится, а разделение остаётся.
  const reader = readerWith([canonicalChart('measurement_a', 'style-version-1', 'colorway-1')]);
  const service = createMeasurementQueryService({ reader });
  const canonical = await service.pageCanonicalForActor('user-1', {});
  assert.ok(canonical.items.every((item) => item.sku === undefined));
  const bySku = await service.pageForActor('user-1', {});
  assert.deepEqual(bySku.items, []);
});

test('a reader without the canonical page is refused rather than silently answering nothing', async () => {
  const service = createMeasurementQueryService({
    reader: { pageForActor: async () => ({ items: [], hasMore: false }), getForActor: async () => undefined },
  });
  await assert.rejects(
    () => service.pageCanonicalForActor('user-1', {}),
    (error) => error.code === 'MEASUREMENT_CANONICAL_READER_REQUIRED',
  );
});
