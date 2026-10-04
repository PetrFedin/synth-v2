import { invariant } from '../core/errors.mjs';
import { SUPPLIER_AWAITING_ACTION_TYPE_CODES } from '../modules/awaiting-action/public.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const MAX_LIMIT = 200;

// «Ждёт вас» поставщика. Ни членства, ни роли: единственное основание — грант, а грант уже разобран
// двумя представлениями портала (активный грант, квалифицированный поставщик, запрос адресован
// именно этому поставщику, заказ размещён именно у него). Поэтому ветки читают из этих же
// представлений по `user_id`, и всё, что читатель не видит в портале, не может появиться здесь:
// чужой запрос, запрос другого бренда, запрос неквалифицированного поставщика, отозванный грант.
//
// `$1` — читатель, `$2` — момент отсчёта, `$3` — размер страницы.
const SUPPLIER_BRANCHES = Object.freeze({
  // Котировку можно подать, пока запрос открыт и срок ответа не вышел (`upsertRfqQuote` отказывает
  // позже), и пока своей котировки нет — обновление уже поданной не «ждёт вас».
  'portal-quote-submit': () => `
    SELECT 'portal-quote-submit'::text AS type, portal.rfq_code AS entity_id,
           portal.rfq_code || ' · ' || COALESCE(portal.payload->>'sku', '') AS label, portal.brand_id AS organisation_id,
           (portal.payload->>'issuedAt')::timestamptz AS since, portal.response_due_at AS due_at,
           jsonb_build_object('supplierCode', portal.supplier_code, 'brandName', portal.payload->>'brandName', 'sku', portal.payload->>'sku',
                              'productName', portal.payload->>'productName', 'targetQuantity', portal.payload->'targetQuantity') AS detail
      FROM supplier_portal_rfq_workspace AS portal
     WHERE portal.user_id = $1 AND portal.payload->>'supplierStatus' = 'awaiting_quote'
       AND portal.response_due_at >= $2::timestamptz`,

  // Встречное предложение можно принять, пока оно отвечает на последнюю ревизию котировки, на то же
  // количество, что в запросе, и котировка не просрочена: это условия `acceptRfqCounterOffer`.
  'portal-counter-accept': () => `
    SELECT 'portal-counter-accept'::text, portal.rfq_code,
           portal.rfq_code || ' · ' || COALESCE(portal.payload->>'sku', ''), portal.brand_id,
           (portal.payload#>>'{ownQuote,counterOffer,offeredAt}')::timestamptz, (portal.payload#>>'{ownQuote,validUntil}')::timestamptz,
           jsonb_build_object('supplierCode', portal.supplier_code, 'brandName', portal.payload->>'brandName', 'sku', portal.payload->>'sku',
                              'productName', portal.payload->>'productName', 'targetQuantity', portal.payload->'targetQuantity',
                              'counterUnitPriceMinor', portal.payload#>'{ownQuote,counterOffer,unitPriceMinor}', 'currency', portal.payload->>'currency')
      FROM supplier_portal_rfq_workspace AS portal
     WHERE portal.user_id = $1 AND portal.payload->>'supplierStatus' = 'quote_submitted'
       AND portal.payload#>'{ownQuote,counterOffer}' IS NOT NULL
       AND portal.payload#>>'{ownQuote,counterOffer,acceptedAt}' IS NULL
       AND (portal.payload#>>'{ownQuote,counterOffer,answersQuoteRevision}')::bigint = (portal.payload#>>'{ownQuote,revision}')::bigint
       AND (portal.payload#>>'{ownQuote,counterOffer,quantity}')::bigint = (portal.payload->>'targetQuantity')::bigint
       AND (portal.payload#>>'{ownQuote,validUntil}')::timestamptz >= $2::timestamptz`,

  'portal-order-confirm': () => `
    SELECT 'portal-order-confirm'::text, portal.production_order_number, portal.production_order_number, portal.brand_id,
           (portal.payload->>'issuedAt')::timestamptz, NULL::timestamptz,
           jsonb_build_object('supplierCode', portal.supplier_code, 'brandName', portal.payload->>'brandName', 'sku', portal.payload->>'sku',
                              'productName', portal.payload->>'productName', 'quantity', portal.payload->'quantity',
                              'deliveryDueAt', portal.payload->>'deliveryDueAt')
      FROM supplier_portal_order_workspace AS portal
     WHERE portal.user_id = $1 AND portal.payload->>'status' = 'issued'`,
});

invariant(
  SUPPLIER_AWAITING_ACTION_TYPE_CODES.every((type) => typeof SUPPLIER_BRANCHES[type] === 'function')
    && Object.keys(SUPPLIER_BRANCHES).length === SUPPLIER_AWAITING_ACTION_TYPE_CODES.length,
  'AWAITING_ACTION_BRANCHES_INCOMPLETE',
  'Every supplier awaiting action type needs exactly one reader branch',
);

// The reading side of the portal. There is no brand filter and no role check here, because the caller
// is not a member of anything: the grant is the whole of their standing, and the two views already
// resolve it. An account with no grant sees an empty list, which is also what an account whose grant
// was revoked sees — the portal never distinguishes "nothing addressed to you" from "no longer yours".
/** @param {{ pool?: any }} [options] */
export function createPostgresSupplierPortalReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'SUPPLIER_PORTAL_POOL_REQUIRED', 'PostgreSQL pool is required');

  function page(view, order, actorId, { limit, supplierCode }) {
    return withPostgresTransaction(pool, async (queryable) => {
      const params = [actorId, Math.min(limit, MAX_LIMIT) + 1];
      let filter = '';
      if (supplierCode) { params.push(supplierCode); filter = ` AND portal.supplier_code = $${params.length}`; }
      const result = await queryable.query(
        `SELECT portal.payload FROM ${view} AS portal WHERE portal.user_id = $1${filter} ORDER BY ${order} LIMIT $2`,
        params,
      );
      const rows = result.rows.map((row) => row.payload);
      const hasMore = rows.length > limit;
      return { items: hasMore ? rows.slice(0, limit) : rows, hasMore };
    }, { begin: SNAPSHOT_BEGIN });
  }

  return Object.freeze({
    awaitingForActor(actorId, { types, limit, asOf }) {
      invariant(typeof actorId === 'string' && actorId.length > 0, 'AWAITING_ACTION_ACTOR_REQUIRED', 'Actor is required');
      invariant(Array.isArray(types) && types.every((type) => SUPPLIER_AWAITING_ACTION_TYPE_CODES.includes(type)), 'AWAITING_ACTION_TYPE_INVALID', 'Awaiting action type is invalid');
      invariant(Number.isInteger(limit) && limit >= 0, 'AWAITING_ACTION_LIMIT_INVALID', 'Limit is invalid');
      if (types.length === 0) return Promise.resolve({ rows: [], counts: [] });
      const statement = `
        WITH waiting (type, entity_id, label, organisation_id, since, due_at, detail) AS (
          ${types.map((type) => SUPPLIER_BRANCHES[type]()).join('\n          UNION ALL\n')}
        ), ranked AS (
          SELECT waiting.*, row_number() OVER (ORDER BY waiting.due_at ASC NULLS LAST, waiting.since ASC NULLS LAST, waiting.type, waiting.entity_id) AS rank_no
            FROM waiting
        )
        SELECT 'item'::text AS row_kind, type, entity_id, label, organisation_id, since, due_at, detail,
               NULL::bigint AS item_count, rank_no
          FROM ranked WHERE rank_no <= $3
        UNION ALL
        SELECT 'count'::text, type, NULL, NULL, NULL, NULL::timestamptz, NULL::timestamptz, NULL::jsonb, count(*)::bigint, NULL::bigint
          FROM waiting GROUP BY type
        ORDER BY row_kind, rank_no NULLS LAST`;
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(statement, [actorId, asOf, limit]);
        const rows = [];
        const counts = [];
        for (const row of result.rows) {
          if (row.row_kind === 'count') counts.push({ type: row.type, count: Number(row.item_count), overdue: 0 });
          else {
            rows.push({
              type: row.type, entityId: row.entity_id, label: row.label, organisationId: row.organisation_id,
              since: row.since ? new Date(row.since).toISOString() : null,
              dueAt: row.due_at ? new Date(row.due_at).toISOString() : null,
              detail: row.detail ?? {},
            });
          }
        }
        return { rows, counts };
      }, { begin: SNAPSHOT_BEGIN });
    },
    rfqsForActor: (actorId, options) => page('supplier_portal_rfq_workspace', 'portal.response_due_at ASC, portal.rfq_code ASC', actorId, options),
    ordersForActor: (actorId, options) => page('supplier_portal_order_workspace', 'portal.delivery_due_at ASC, portal.production_order_number ASC', actorId, options),
    // Q-03. A suspended or archived supplier is not listed: the person keeps the grant, not the access.
    suppliersForActor(actorId) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT access.payload ->> 'supplierCode' AS supplier_code,
                  access.payload ->> 'contactName' AS contact_name,
                  supplier.payload ->> 'legalName' AS legal_name,
                  brand.payload ->> 'name' AS brand_name,
                  access.brand_id
             FROM supplier_portal_grants AS access
             JOIN suppliers AS supplier
               ON supplier.brand_id = access.brand_id AND supplier.supplier_code = access.supplier_code
             JOIN organisations AS brand ON brand.id = access.brand_id
            WHERE access.user_id = $1 AND access.status = 'active'
              AND supplier.status = 'qualified'
            ORDER BY access.supplier_code ASC`,
          [actorId],
        );
        return result.rows.map((row) => Object.freeze({
          supplierCode: row.supplier_code,
          contactName: row.contact_name,
          legalName: row.legal_name,
          brandId: row.brand_id,
          brandName: row.brand_name,
        }));
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
