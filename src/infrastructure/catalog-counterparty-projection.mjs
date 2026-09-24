// Что контрагент видит в опубликованном каталоге бренда.
//
// Магазин, связанный с брендом коммерческим циклом, намеренно видит опубликованные позиции его
// коллекции — это витрина обнаружения, и черновики ему при этом не показываются. Но вместе со
// строкой ему уходил и **внутренний склад**: сколько у бренда на руках и сколько уже зарезервировано.
//
// Резерв — это чужой спрос. Он складывается из обязательств перед **другими** покупателями, и
// показывать его контрагенту нельзя: по нему читается, кто и сколько у этого бренда забрал.
// Свободный остаток — внутреннее число бренда той же природы.
//
// Коммерческая правда для покупателя лежит не здесь, а в замороженной версии каталога
// (`GET /v2/showrooms/{id}/buyer-catalog`): там и цена, и доступность зафиксированы и подписаны
// хешем, с которым сверяется заказ. Каталог остаётся витриной, а не источником обязательств.
const INTERNAL_STOCK_FIELDS = Object.freeze(['availableQuantity', 'reservedQuantity', 'availableToSell']);

/**
 * Убрать внутренние складские числа из строки, если организация читателя не владеет ею.
 *
 * Владелец видит свою строку целиком: это его склад.
 */
export function projectCatalogSkuForActor(payload, brandIds) {
  if (!payload || typeof payload !== 'object') return payload;
  const owned = Array.isArray(brandIds) && brandIds.includes(payload.brandId);
  if (owned) return payload;
  const projected = { ...payload };
  for (const field of INTERNAL_STOCK_FIELDS) delete projected[field];
  return Object.freeze(projected);
}

export function projectCatalogSkusForActor(payloads, brandIds) {
  return (Array.isArray(payloads) ? payloads : []).map((payload) => projectCatalogSkuForActor(payload, brandIds));
}
