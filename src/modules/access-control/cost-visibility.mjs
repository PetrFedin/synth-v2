import { CAPABILITIES, roleHasCapability } from './public.mjs';

/**
 * Принцип A-02: себестоимость и маржа видны только ролям с `cost.manage` или `margin.read`.
 *
 * Один критерий и один способ скрытия для всех читателей: история объекта (#210), ведомости, RFQ,
 * производственные заказы и размерный ряд. Поле не обнуляется, а исчезает: `null` в ответе
 * говорил бы «затрат нет», а не «вам их не показывают».
 */
export const COST_FIELD = /cost|margin/i;

export function roleSeesCost(role) {
  return Boolean(role) && (roleHasCapability(role, CAPABILITIES.COST_MANAGE) || roleHasCapability(role, CAPABILITIES.MARGIN_READ));
}

/**
 * Копия значения без полей, чьё имя содержит cost/margin (на любой глубине). `extraKeys` — точные
 * имена, которые не названы стоимостью, но ею являются (цена поставщика за единицу).
 */
export function withholdCostFields(value, { extraKeys = [] } = {}) {
  const extra = new Set(extraKeys);
  const strip = (node) => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== 'object') return node;
    return Object.fromEntries(Object.entries(node)
      .filter(([key]) => !COST_FIELD.test(key) && !extra.has(key))
      .map(([key, nested]) => [key, strip(nested)]));
  };
  return strip(value);
}

/** Значение как оно есть для роли с доступом к деньгам; для остальных и для неизвестной роли — без стоимости. */
export function costVisibleTo(role, value, options) {
  return roleSeesCost(role) ? value : withholdCostFields(value, options);
}
