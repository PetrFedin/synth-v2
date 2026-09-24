import { invariant } from '../../core/errors.mjs';

/**
 * Палитра сезона: цвета, которыми сезон разрешено рисовать.
 *
 * Таблица была заведена и осталась пустой: ни одной строки кода во всём репозитории, то есть вопрос
 * «что вообще в этом сезоне» задать было некому. Регистр отвечает на него списком governed-цветов,
 * закреплённых **версией**: палитра сезона — это решение, принятое один раз, и если справочник
 * потом переименует оттенок, сезон должен остаться тем, каким его утвердили.
 *
 * Порядок — часть решения, а не оформление: палитра читается сверху вниз, и первым идёт главный
 * цвет сезона. Поэтому позиция обязательна и уникальна внутри кампании.
 */
const CODE = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;

export function seasonPaletteEntry({ id, brandId, campaign, colourEntry, position, createdAt, createdBy }) {
  invariant(typeof id === 'string' && id.length > 0, 'SEASON_PALETTE_ID_REQUIRED', 'Palette entry id is required');
  invariant(typeof brandId === 'string' && brandId.length > 0, 'SEASON_PALETTE_BRAND_REQUIRED', 'Brand is required');
  invariant(campaign?.id, 'SEASON_PALETTE_CAMPAIGN_REQUIRED', 'Campaign is required');
  // Палитру сезона ведёт тот бренд, чей это сезон. Чужую кампанию нельзя покрасить даже случайно.
  invariant(campaign.brandId === brandId, 'SEASON_PALETTE_CAMPAIGN_FOREIGN',
    'A season palette belongs to the brand whose campaign it is', { campaignId: campaign.id, brandId });

  invariant(colourEntry?.id && Number.isInteger(colourEntry.version) && colourEntry.version >= 1,
    'SEASON_PALETTE_COLOUR_REQUIRED', 'Palette entry needs a governed colour entry and its version');
  // Справочник цветов, а не любой справочник: цвет сезона — это запись именно из палитры.
  invariant(colourEntry.dictionaryId === 'mdm-dictionary:colour-colour', 'SEASON_PALETTE_COLOUR_DICTIONARY_INVALID',
    'A season palette is drawn from the colour dictionary', { dictionaryId: colourEntry.dictionaryId ?? null });
  invariant(colourEntry.status === 'active', 'SEASON_PALETTE_COLOUR_NOT_ACTIVE',
    'A retired colour cannot open a new season', { colourCode: colourEntry.code, status: colourEntry.status });
  invariant(typeof colourEntry.code === 'string' && CODE.test(colourEntry.code), 'SEASON_PALETTE_COLOUR_CODE_INVALID',
    'Colour code is invalid', { colourCode: colourEntry.code });

  invariant(Number.isInteger(position) && position >= 1 && position <= 999, 'SEASON_PALETTE_POSITION_INVALID',
    'Palette position must be a positive integer up to 999', { position });

  const at = timestamp(createdAt, 'SEASON_PALETTE_CREATED_AT_INVALID');
  invariant(typeof createdBy === 'string' && createdBy.length > 0, 'SEASON_PALETTE_ACTOR_REQUIRED', 'Palette author is required');

  return Object.freeze({
    id,
    brandId,
    campaignId: campaign.id,
    colourEntryId: colourEntry.id,
    // Версия закрепляется вместе с записью: сезон остаётся тем, каким его утвердили.
    colourEntryVersion: colourEntry.version,
    colourCode: colourEntry.code,
    position,
    createdAt: at,
    createdBy,
  });
}

function timestamp(value, code) {
  const parsed = Date.parse(value);
  invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time');
  return new Date(parsed).toISOString();
}
