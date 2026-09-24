import { invariant } from '../core/errors.mjs';
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
      const rows = await reader.sizeLineForActor(actorId, styleId);
      invariant(Array.isArray(rows), 'BOM_SIZE_LINE_LISTING_INVALID', 'Size line listing is invalid');
      return Object.freeze({ styleId, ...styleSizeLine(rows) });
    },
  });
}
