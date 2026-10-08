import { invariant } from '../../core/errors.mjs';
import { CAPABILITIES, ROLE_CAPABILITIES } from '../access-control/public.mjs';
import { SUPPLIER_PORTAL_CAPABILITIES } from '../supplier-portal/public.mjs';

// «Ждёт вас» — не новая сущность и не новая таблица, а ответ на вопрос «чей сейчас ход».
//
// Раньше платформа умела только сообщать о случившемся (уведомления проецируются из событий
// outbox), но не говорила, что человек должен сделать сам: заказ, который ждёт его подтверждения,
// котировки, из которых надо выбрать, инспекция, которую никто кроме него не решит. Это решение
// принимает не отправитель, а читатель — по состоянию самих сущностей, поэтому ничего не
// хранится: ход за человеком ровно до тех пор, пока сущность стоит в этом состоянии, и пропадает
// сам, как только кто-то его сделал. Хранимая копия «задачи» разошлась бы с этим состоянием.
//
// Каталог ниже — единственное место, где сказано, какое состояние чего чей ход и какого права он
// требует. Право берётся из тех же `CAPABILITIES`, что проверяет команда, которая этот ход
// выполняет: если роли команду не разрешат, пункта в списке нет — иначе список обещал бы то, что
// кнопка тут же откажет сделать.

/**
 * @typedef {object} AwaitingActionType
 * @property {string} type              Stable machine code; also the `type` filter value.
 * @property {string} entityKind        What `entityId` identifies.
 * @property {string} capability        Capability the executing command requires.
 * @property {'brand'|'shop'|'either'} side  Organisation side that holds the move.
 * @property {string} view              SPA screen that opens the entity.
 * @property {string} group             Coarse family used by the screen filter.
 * @property {string} labelRu
 * @property {string} labelEn
 * @property {{ tab?: string, parent?: string, focus?: string, dialog?: string }} target  Where «Перейти» lands.
 */

// `target` — точная цель перехода, а не только экран: вкладка экрана-владельца (`tab`), поле
// `detail`, в котором лежит содержащая запись (`parent`: заказ для правки и приёмки, материал для
// партии и образца цвета), поле `detail` с подзаписью, которую подсветить (`focus`), и диалог,
// который открыть поверх выбранной записи (`dialog`). Клиент разбирает это одним общим механизмом
// (`public/modules/view-refresh.js`): экран-владелец сам знает, как выбрать запись по коду.
function define(type, entityKind, capability, side, view, group, labelRu, labelEn, target = {}) {
  return Object.freeze({ type, entityKind, capability, side, view, group, labelRu, labelEn, target: Object.freeze({ ...target }) });
}

export const AWAITING_ACTION_TYPES = Object.freeze([
  // Торговая сторона: заказ, ассортимент, связи.
  define('order-accept-terms', 'order', CAPABILITIES.ORDER_CONFIRM, 'either', 'orders', 'orders', 'Заказ ждёт подтверждения условий', 'Order awaits your acceptance of terms', { tab: 'orders' }),
  define('order-attach', 'order', CAPABILITIES.ORDER_WRITE, 'either', 'orders', 'orders', 'Заказ согласован — осталось зафиксировать', 'Order is agreed — commit it', { tab: 'orders' }),
  define('order-amendment-response', 'order-amendment', CAPABILITIES.ORDER_WRITE, 'either', 'orders', 'orders', 'Правка заказа ждёт согласования', 'Order amendment awaits your response', { tab: 'orders', parent: 'orderId', dialog: 'amendments' }),
  define('selection-approval', 'selection', CAPABILITIES.SELECTION_APPROVE, 'shop', 'selections', 'orders', 'Ассортимент ждёт согласования', 'Assortment awaits your approval', { tab: 'selections' }),
  define('relationship-response', 'relationship', CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE, 'either', 'partners', 'partners', 'Запрос на партнёрство ждёт ответа', 'Partnership request awaits your answer', { tab: 'relationships' }),
  define('showroom-invitation-response', 'showroom-invitation', CAPABILITIES.SHOWROOM_INVITATION_ACCEPT, 'shop', 'showrooms', 'partners', 'Приглашение в шоурум ждёт ответа', 'Showroom invitation awaits your answer', { tab: 'invitations' }),
  // Поставка: приёмка — ход магазина, решение по претензии — ход бренда. Срок приёмки — ожидаемая
  // доставка из уведомления об отгрузке: пришла бы раньше — ждали бы раньше.
  define('receipt-accept', 'shipment-notice', CAPABILITIES.RECEIPT_MANAGE, 'shop', 'orders', 'orders', 'Принять поставку', 'Receive the shipment', { tab: 'orders', parent: 'orderId', dialog: 'fulfilment' }),
  define('claim-resolve', 'receipt-claim', CAPABILITIES.CLAIM_RESOLVE, 'brand', 'orders', 'orders', 'Решить по претензии', 'Resolve the claim', { tab: 'orders', parent: 'orderId', dialog: 'fulfilment' }),
  // Закупки и производство.
  define('rfq-award', 'sourcing-rfq', CAPABILITIES.SOURCING_AWARD, 'brand', 'rfqs', 'sourcing', 'По запросу цен есть котировки — выберите поставщика', 'Quotations received — choose a supplier'),
  define('material-rfq-award', 'material-rfq', CAPABILITIES.SOURCING_AWARD, 'brand', 'material-rfqs', 'sourcing', 'По запросу на материал есть котировки — выберите поставщика', 'Material quotations received — choose a supplier'),
  define('production-order-confirm', 'production-order', CAPABILITIES.PRODUCTION_ORDER_CONFIRM, 'brand', 'production-orders', 'production', 'Производственный заказ ждёт подтверждения фабрики', 'Production order awaits supplier confirmation'),
  define('material-purchase-order-confirm', 'material-purchase-order', CAPABILITIES.MATERIAL_PURCHASE_MANAGE, 'brand', 'material-purchase-orders', 'production', 'Заказ на материал ждёт подтверждения поставщика', 'Material purchase order awaits supplier confirmation'),
  define('tech-pack-acknowledge', 'tech-pack', CAPABILITIES.TECH_PACK_ACKNOWLEDGE, 'brand', 'tech-packs', 'production', 'Технический пакет ждёт подтверждения получения', 'Tech pack awaits acknowledgement'),
  define('technical-review', 'product-engineering-review', CAPABILITIES.PRODUCT_ENGINEERING_MANAGE, 'brand', 'styles', 'production', 'AI-инжиниринг ждёт технической проверки', 'AI engineering awaits technical review', { tab: 'engineering', parent: 'styleId' }),
  define('sample-decision', 'sample', CAPABILITIES.SAMPLE_MANAGE, 'brand', 'samples', 'production', 'Образец получен — нужно решение', 'Sample received — decision needed'),
  // Качество.
  define('inspection-review', 'quality-inspection', CAPABILITIES.QUALITY_APPROVE, 'brand', 'final-quality', 'quality', 'Инспекция ждёт решения', 'Inspection awaits a decision'),
  define('operational-exception', 'exception', CAPABILITIES.EXCEPTION_MANAGE, 'either', 'awaiting-action', 'exceptions', 'Операционное исключение ждёт действия', 'Operational exception awaits action'),
  define('material-lot-release', 'material-lot', CAPABILITIES.QUALITY_MANAGE, 'brand', 'materials', 'quality', 'Партия материала на карантине ждёт решения', 'Quarantined material lot awaits a decision', { tab: 'lots', parent: 'materialCode', focus: 'lotReference' }),
  define('lab-dip-decision', 'lab-dip', CAPABILITIES.QUALITY_MANAGE, 'brand', 'materials', 'quality', 'Лабораторный образец цвета ждёт решения', 'Lab dip awaits a decision', { tab: 'colour', parent: 'materialCode', focus: 'colourCode' }),
  // Деньги и документы.
  define('supplier-payment', 'payment-milestone', CAPABILITIES.COST_MANAGE, 'brand', 'production-orders', 'finance', 'Платёж поставщику наступил — ждёт выплаты', 'Supplier payment is due', { parent: 'productionOrderNumber' }),
  define('compliance-document-issue', 'compliance-document', CAPABILITIES.COMPLIANCE_DOCUMENT_MANAGE, 'either', 'partners', 'compliance', 'Документ соответствия — черновик ждёт проверки и выпуска', 'Compliance document draft awaits review and issue', { tab: 'compliance-documents' }),
]);

// Ход поставщика. Поставщик — не член организации, а держатель гранта портала, поэтому его «ждёт
// вас» устроен иначе: ни роли, ни членства, ни `ROLE_CAPABILITIES` — стоит грант, и права на три
// ответа принадлежат гранту (`SUPPLIER_PORTAL_CAPABILITIES`), а не роли бренда. Каталог отдельный,
// и бренд его видов не видит: запрос бренда с таким `type` отказывает так же, как с любым неизвестным.
function defineSupplier(type, entityKind, capability, view, group, labelRu, labelEn) {
  return Object.freeze({ type, entityKind, capability, side: 'supplier', view, group, labelRu, labelEn, target: Object.freeze({}) });
}

export const SUPPLIER_AWAITING_ACTION_TYPES = Object.freeze([
  defineSupplier('portal-quote-submit', 'sourcing-rfq', SUPPLIER_PORTAL_CAPABILITIES.QUOTE_SUBMIT, 'supplier-portal-rfqs', 'sourcing', 'Запрос цен ждёт вашей котировки', 'Request for quotation awaits your quotation'),
  defineSupplier('portal-counter-accept', 'sourcing-rfq', SUPPLIER_PORTAL_CAPABILITIES.COUNTER_ACCEPT, 'supplier-portal-rfqs', 'sourcing', 'Встречное предложение бренда ждёт вашего ответа', 'Brand counter-offer awaits your answer'),
  defineSupplier('portal-order-confirm', 'production-order', SUPPLIER_PORTAL_CAPABILITIES.ORDER_CONFIRM, 'supplier-portal-orders', 'production', 'Заказ ждёт вашего подтверждения', 'Order awaits your confirmation'),
]);
export const SUPPLIER_AWAITING_ACTION_TYPE_CODES = Object.freeze(SUPPLIER_AWAITING_ACTION_TYPES.map((entry) => entry.type));
export const SUPPLIER_AWAITING_ACTION_GROUPS = Object.freeze([...new Set(SUPPLIER_AWAITING_ACTION_TYPES.map((entry) => entry.group))]);

export const AWAITING_ACTION_TYPE_CODES = Object.freeze(AWAITING_ACTION_TYPES.map((entry) => entry.type));
export const AWAITING_ACTION_GROUPS = Object.freeze([...new Set(AWAITING_ACTION_TYPES.map((entry) => entry.group))]);
export const AWAITING_ACTION_DEFAULT_LIMIT = 100;
export const AWAITING_ACTION_MAX_LIMIT = 200;

const BY_TYPE = new Map(AWAITING_ACTION_TYPES.map((entry) => [entry.type, entry]));
const SUPPLIER_BY_TYPE = new Map(SUPPLIER_AWAITING_ACTION_TYPES.map((entry) => [entry.type, entry]));

/** The catalogue of a kind of reader: `brand` is a member of organisations, `supplier` holds a portal grant. */
export function awaitingActionCatalogue(scope = 'brand') {
  invariant(scope === 'brand' || scope === 'supplier', 'AWAITING_ACTION_SCOPE_INVALID', 'Awaiting action scope is invalid', { scope });
  return scope === 'supplier'
    ? Object.freeze({ scope, entries: SUPPLIER_AWAITING_ACTION_TYPES, codes: SUPPLIER_AWAITING_ACTION_TYPE_CODES, groups: SUPPLIER_AWAITING_ACTION_GROUPS, byType: SUPPLIER_BY_TYPE })
    : Object.freeze({ scope, entries: AWAITING_ACTION_TYPES, codes: AWAITING_ACTION_TYPE_CODES, groups: AWAITING_ACTION_GROUPS, byType: BY_TYPE });
}

export function awaitingActionType(type, scope = 'brand') {
  return awaitingActionCatalogue(scope).byType.get(type) ?? null;
}

/** Roles that hold the capability of this type: the only roles to whom the move is shown. */
export function rolesForAwaitingAction(type) {
  const entry = BY_TYPE.get(type);
  invariant(entry, 'AWAITING_ACTION_TYPE_UNKNOWN', 'Awaiting action type is unknown', { type });
  return Object.freeze(Object.keys(ROLE_CAPABILITIES).filter((role) => ROLE_CAPABILITIES[role].includes(entry.capability)));
}

/**
 * Validate the query of the read. `type` takes one code or a comma-separated list, `group` takes
 * one family; both narrow the work the reader does, so a screen that wants only quality moves
 * does not pay for the payment join.
 */
export function normalizeAwaitingActionQuery(query = {}, scope = 'brand') {
  invariant(query && typeof query === 'object' && !Array.isArray(query), 'AWAITING_ACTION_QUERY_INVALID', 'Awaiting action query is invalid');
  const catalogue = awaitingActionCatalogue(scope);
  let types = catalogue.codes;
  if (query.group !== undefined && query.group !== '') {
    invariant(typeof query.group === 'string' && catalogue.groups.includes(query.group), 'AWAITING_ACTION_GROUP_INVALID', 'Awaiting action group is invalid', { group: query.group });
    types = catalogue.entries.filter((entry) => entry.group === query.group).map((entry) => entry.type);
  }
  if (query.type !== undefined && query.type !== '') {
    invariant(typeof query.type === 'string', 'AWAITING_ACTION_TYPE_INVALID', 'Awaiting action type is invalid');
    const requested = [...new Set(query.type.split(',').map((value) => value.trim()).filter(Boolean))];
    invariant(requested.length > 0 && requested.every((value) => catalogue.byType.has(value)), 'AWAITING_ACTION_TYPE_INVALID', 'Awaiting action type is invalid', { type: query.type });
    types = types.filter((value) => requested.includes(value));
  }
  let limit = AWAITING_ACTION_DEFAULT_LIMIT;
  if (query.limit !== undefined && query.limit !== '') {
    const parsed = Number(query.limit);
    invariant(Number.isInteger(parsed) && parsed >= 0 && parsed <= AWAITING_ACTION_MAX_LIMIT, 'AWAITING_ACTION_LIMIT_INVALID', `Limit must be an integer from 0 to ${AWAITING_ACTION_MAX_LIMIT}`, { limit: query.limit });
    limit = parsed;
  }
  return Object.freeze({ types: Object.freeze([...types]), limit });
}

// Маршрут говорит клиенту не только «какой экран», но и «какая запись и какая вкладка». Поля цели
// берутся из `detail` строки по именам, которые назвал каталог; пустое поле в маршрут не попадает,
// чтобы клиент не выбирал запись по `undefined`.
function buildRoute(entry, row) {
  const detail = row?.detail && typeof row.detail === 'object' ? row.detail : {};
  const target = entry.target ?? {};
  const pick = (field) => (field && detail[field] !== undefined && detail[field] !== null && String(detail[field]) !== '' ? String(detail[field]) : null);
  const parentId = pick(target.parent);
  const focus = pick(target.focus);
  return Object.freeze({
    view: entry.view,
    entityId: String(row.entityId),
    ...(target.tab ? { tab: target.tab } : {}),
    ...(parentId ? { parentId } : {}),
    ...(focus ? { focus } : {}),
    ...(target.dialog ? { dialog: target.dialog } : {}),
  });
}

/**
 * Turn a row read from the database into the item the API returns. Age and lateness are derived
 * here from the reference time, never stored: "waiting for 3 days" is true of a moment, and a
 * copy of it would be wrong by tomorrow.
 */
export function buildAwaitingActionItem(row, asOf, scope = 'brand') {
  const entry = awaitingActionCatalogue(scope).byType.get(row?.type);
  invariant(entry, 'AWAITING_ACTION_TYPE_UNKNOWN', 'Awaiting action type is unknown', { type: row?.type });
  const now = Date.parse(asOf);
  invariant(Number.isFinite(now), 'AWAITING_ACTION_AS_OF_INVALID', 'Reference time is invalid');
  const sinceMs = Date.parse(row.since);
  const since = Number.isFinite(sinceMs) ? new Date(sinceMs).toISOString() : null;
  const dueMs = row.dueAt ? Date.parse(row.dueAt) : Number.NaN;
  const dueAt = Number.isFinite(dueMs) ? new Date(dueMs).toISOString() : null;
  const overdue = dueAt !== null && dueMs < now;
  return Object.freeze({
    type: entry.type,
    group: entry.group,
    entityKind: entry.entityKind,
    entityId: String(row.entityId),
    label: row.label === null || row.label === undefined ? String(row.entityId) : String(row.label),
    organisationId: String(row.organisationId),
    titleRu: entry.labelRu,
    titleEn: entry.labelEn,
    route: buildRoute(entry, row),
    waitingSince: since,
    ageSeconds: since === null ? 0 : Math.max(0, Math.floor((now - sinceMs) / 1000)),
    dueAt,
    overdue,
    ...(overdue ? { overdueSeconds: Math.floor((now - dueMs) / 1000) } : {}),
    detail: Object.freeze({ ...(row.detail && typeof row.detail === 'object' ? row.detail : {}) }),
  });
}

/** Counters for the badge and the filter chips. Computed from every row, not from the page. */
export function summariseAwaitingActionCounts(counts, scope = 'brand') {
  const byTypeCatalogue = awaitingActionCatalogue(scope).byType;
  const byType = {};
  let total = 0;
  let overdue = 0;
  for (const row of counts) {
    if (!byTypeCatalogue.has(row.type)) continue;
    const count = Number(row.count);
    const late = Number(row.overdue ?? 0);
    invariant(Number.isSafeInteger(count) && count >= 0 && Number.isSafeInteger(late) && late >= 0, 'AWAITING_ACTION_COUNT_INVALID', 'Awaiting action count is invalid');
    byType[row.type] = { count, overdue: late };
    total += count;
    overdue += late;
  }
  return Object.freeze({
    total,
    overdue,
    byType: Object.freeze(Object.fromEntries(Object.entries(byType).map(([key, value]) => [key, Object.freeze(value)]))),
  });
}
