import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, roleHasCapability } from '../modules/access-control/public.mjs';
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
  invariant(reader && typeof reader.seasonForActor === 'function' && typeof reader.roleForCampaign === 'function', 'SEASON_READER_REQUIRED', 'Season economics reader is required');
  return Object.freeze({
    async seasonEconomicsForCampaign(actorId, campaignId) {
      invariant(typeof campaignId === 'string' && campaignId.trim(), 'SEASON_CAMPAIGN_REQUIRED', 'A campaign is required');
      // Плановая себестоимость и маржа сезона — деньги бренда. Чужой или несуществующей кампании для
      // читающего нет (404, не подтверждаем, что она есть); своя, но без права на деньги — отказ.
      const role = await reader.roleForCampaign(actorId, campaignId);
      invariant(role, 'SEASON_CAMPAIGN_NOT_FOUND', 'Campaign not found', { campaignId });
      invariant(roleHasCapability(role, CAPABILITIES.COST_MANAGE), 'CAPABILITY_DENIED', 'Role does not grant required capability', { role, capability: CAPABILITIES.COST_MANAGE });
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
