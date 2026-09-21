import { invariant } from '../core/errors.mjs';
import { placeholderReconciliation, seasonEconomics } from '../modules/season-economics/public.mjs';

/**
 * Плановая экономика сезона на чтение.
 *
 * Сервис ничего не считает сам: он берёт снимок плана и его реализаций и прогоняет через те же
 * правила домена, что и тесты. Считать здесь означало бы завести второе место, где живёт маржа, —
 * и второе место разошлось бы с первым.
 */
/** @param {{ reader?: any }} [options] */
export function createSeasonEconomicsQueryService({ reader } = {}) {
  invariant(reader && typeof reader.seasonForActor === 'function', 'SEASON_READER_REQUIRED', 'Season economics reader is required');
  return Object.freeze({
    async seasonEconomicsForCampaign(actorId, campaignId) {
      invariant(typeof campaignId === 'string' && campaignId.trim(), 'SEASON_CAMPAIGN_REQUIRED', 'A campaign is required');
      const rows = await reader.seasonForActor(actorId, campaignId);
      invariant(Array.isArray(rows), 'SEASON_LISTING_INVALID', 'Season listing is invalid');
      const placeholders = rows.map((row) => placeholderReconciliation(row.placeholder, row.realisations));
      return Object.freeze({
        campaignId,
        placeholders: Object.freeze(placeholders),
        season: seasonEconomics(placeholders),
      });
    },
  });
}
