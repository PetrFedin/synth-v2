import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { seasonPaletteEntry } from '../src/modules/season-palette/public.mjs';

const root = process.cwd();
const CAMPAIGN = Object.freeze({ id: 'campaign-1', brandId: 'brand-1' });
const COLOUR = Object.freeze({ id: 'mdm-entry:colour-colour:midnight-navy', dictionaryId: 'mdm-dictionary:colour-colour', code: 'MIDNIGHT_NAVY', version: 1, status: 'active' });
const BASE = Object.freeze({ id: 'season-palette-1', brandId: 'brand-1', campaign: CAMPAIGN, colourEntry: COLOUR, position: 1, createdAt: '2026-09-22T10:00:00.000Z', createdBy: 'owner' });

function refusal(overrides) {
  try { seasonPaletteEntry({ ...BASE, ...overrides }); return 'NO_ERROR'; } catch (error) { return error.code; }
}

test('a season palette pins the version of the colour it was approved with', () => {
  // Палитра — решение, принятое один раз: переименование оттенка в справочнике не должно менять
  // утверждённый сезон, поэтому версия записывается вместе с записью.
  const entry = seasonPaletteEntry(BASE);
  assert.equal(entry.colourEntryId, COLOUR.id);
  assert.equal(entry.colourEntryVersion, 1);
  assert.equal(entry.colourCode, 'MIDNIGHT_NAVY');
  assert.equal(entry.campaignId, 'campaign-1');
});

test('a season palette is drawn from the colour dictionary and from the brand’s own campaign', () => {
  // Запись другого справочника — не цвет: семейство цвета, размер или что угодно ещё сюда попасть
  // не должно, даже если у него есть код.
  assert.equal(refusal({ colourEntry: { ...COLOUR, dictionaryId: 'mdm-dictionary:colour-family' } }), 'SEASON_PALETTE_COLOUR_DICTIONARY_INVALID');
  // Отставленный цвет не открывает новый сезон.
  assert.equal(refusal({ colourEntry: { ...COLOUR, status: 'retired' } }), 'SEASON_PALETTE_COLOUR_NOT_ACTIVE');
  // Чужую кампанию нельзя покрасить даже случайно.
  assert.equal(refusal({ campaign: { id: 'campaign-2', brandId: 'brand-2' } }), 'SEASON_PALETTE_CAMPAIGN_FOREIGN');
});

test('position is part of the decision, not decoration', () => {
  // Палитра читается сверху вниз, и первым идёт главный цвет сезона.
  assert.equal(refusal({ position: 0 }), 'SEASON_PALETTE_POSITION_INVALID');
  assert.equal(refusal({ position: 1.5 }), 'SEASON_PALETTE_POSITION_INVALID');
  assert.equal(seasonPaletteEntry({ ...BASE, position: 7 }).position, 7);
});

test('the three empty tables say what they are', async () => {
  // Таблица без строк и без объяснения читается как недоделка независимо от того, чем является.
  const sql = await readFile(path.join(root, 'db/migrations/128_empty_shells_say_what_they_are.sql'), 'utf8');
  assert.match(sql, /COMMENT ON TABLE season_colour_palettes IS/);
  assert.match(sql, /COMMENT ON TABLE tech_pack_operations IS[\s\S]*?ВЫТЕСНЕНА/);
  assert.match(sql, /COMMENT ON TABLE catalog_outbox_events IS[\s\S]*?ОТСТАВНОЙ/);
});

test('nothing writes to the retired catalog outbox any more', async () => {
  // Основание вердикта «отставной путь»: вставок нет нигде — ни в службах, ни в миграциях.
  const store = await readFile(path.join(root, 'src/infrastructure/postgres-catalog-store.mjs'), 'utf8');
  assert.doesNotMatch(store, /INSERT INTO catalog_outbox_events/);
});
