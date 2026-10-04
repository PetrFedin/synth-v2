import { invariant } from '../core/errors.mjs';
import { costVisibleTo } from '../modules/access-control/public.mjs';
import { styleSizeLine } from '../modules/bom/public.mjs';

/**
 * Размерный ряд ведомости на чтение.
 *
 * Сервис ничего не считает сам: он берёт снимок строк и прогоняет через то же правило домена, что
 * и тесты. Считать здесь означало бы завести второе место, где живёт градация расхода.
 */
/** @param {{ reader?: any }} [options] */
export function createBomSizeLineQueryService({ reader } = {}) {
  invariant(reader && typeof reader.sizeLineForActor === 'function', 'BOM_SIZE_LINE_READER_REQUIRED', 'Size line reader is required');
  return Object.freeze({
    async styleSizeLineForActor(actorId, styleId) {
      invariant(typeof styleId === 'string' && styleId.trim(), 'BOM_SIZE_LINE_STYLE_REQUIRED', 'A style is required');
      const listing = await reader.sizeLineForActor(actorId, styleId);
      invariant(listing && Array.isArray(listing.rows), 'BOM_SIZE_LINE_LISTING_INVALID', 'Size line listing is invalid');
      // Расчёт идёт по полным строкам, а наружу уходит то, что роль вправе видеть: расход и отходы
      // остаются, стоимость и доли по ней — только у ролей с `cost.manage` или `margin.read` (A-02).
      const sheet = { styleId, ...styleSizeLine(listing.rows) };
      return Object.freeze(costVisibleTo(listing.viewerRole, sheet));
    },
  });
}
