import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, rolesWithCapability } from '../modules/access-control/public.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = rolesWithCapability(CAPABILITIES.PRODUCTION_ORDER_READ);

// Платёжная веха и фактическая затрата — два независимых денежных регистра, и простой связью их не
// свести: веха ключуется производственным заказом, затрата — оптовым, и путь между ними существует
// только когда этот PO вырос из подтверждённой потребности (`lineageVersion === 2`), а не из
// распределения RFQ. Читатель только показывает оба факта рядом — сумму того, что записано по
// связанному оптовому заказу, если связь есть, и честно `null`, если её нет в принципе. Платёж не
// становится строкой затрат: суммы не вычитаются друг из друга, это было бы учётным решением, а не
// связью для починки.
// Фактическая затрата — регистр себестоимости. Читать заказ фабрике могут и производство с качеством
// (`production-order.read`), но затрату видят только те, у кого есть доступ к деньгам: тот же
// критерий, что у истории (`cost.manage` или `margin.read`). Остальным поле приходит `null`, как у
// заказа без связи, — самого заказа это не прячет.
const COST_VISIBLE_ROLES = Object.freeze([...new Set([...rolesWithCapability(CAPABILITIES.COST_MANAGE), ...rolesWithCapability(CAPABILITIES.MARGIN_READ)])]);
const COST_VISIBLE_SQL = `ARRAY[${COST_VISIBLE_ROLES.map((role) => `'${role}'`).join(', ')}]::text[]`;
const linkedActualCost = (actorParameter) => `(CASE WHEN production_order.payload ->> 'orderId' IS NOT NULL AND EXISTS (
      SELECT 1 FROM memberships AS cost_membership
       WHERE cost_membership.user_id = ${actorParameter}
         AND cost_membership.organisation_id = production_order.brand_id
         AND cost_membership.status = 'active'
         AND cost_membership.role = ANY(${COST_VISIBLE_SQL})
    ) THEN
    (SELECT jsonb_build_object(
              'orderId', production_order.payload ->> 'orderId',
              'totalCost', COALESCE(SUM(entry.amount), 0)::numeric,
              'currency', MIN(entry.currency),
              'entryCount', COUNT(*)::int
            )
       FROM actual_cost_ledger_entries AS entry
      WHERE entry.order_id = production_order.payload ->> 'orderId')
  ELSE NULL END)`;

export function createPostgresProductionOrderReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    pageForActor(actorId, options) { return withPostgresTransaction(pool, (queryable) => page(queryable, actorId, options), { begin: SNAPSHOT_BEGIN }); },
    getForActor(actorId, productionOrderNumber) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT production_order.payload, ${linkedActualCost('$2')} AS "linkedActualCost"
             FROM production_orders AS production_order
            WHERE production_order.production_order_number = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $2
                   AND membership.organisation_id = production_order.brand_id
                   AND membership.status = 'active'
                   AND membership.role = ANY($3::text[])
              )`,
          [productionOrderNumber, actorId, READ_ROLES],
        );
        const row = result.rows[0];
        if (!row) return undefined;
        return withLinkedActualCost(row);
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
function withLinkedActualCost(row) {
  return Object.freeze({
    ...row.payload,
    lineageVersion: row.payload.lineageVersion ?? null,
    linkedWholesaleOrderId: row.payload.orderId ?? null,
    linkedActualCost: row.linkedActualCost ? Object.freeze({
      orderId: row.linkedActualCost.orderId,
      totalCost: Number(row.linkedActualCost.totalCost),
      currency: row.linkedActualCost.currency,
      entryCount: row.linkedActualCost.entryCount,
    }) : null,
  });
}

async function page(queryable, actorId, { limit, afterProductionOrderNumber, filters }) {
  const params = [actorId, READ_ROLES];
  const clauses = [`EXISTS (
    SELECT 1 FROM memberships AS membership
     WHERE membership.user_id = $1
       AND membership.organisation_id = production_order.brand_id
       AND membership.status = 'active'
       AND membership.role = ANY($2::text[])
  )`];
  if (filters.brandId) { params.push(filters.brandId); clauses.push(`production_order.brand_id = $${params.length}`); }
  if (filters.status) { params.push(filters.status); clauses.push(`production_order.status = $${params.length}`); }
  if (filters.supplierCode) { params.push(filters.supplierCode); clauses.push(`production_order.supplier_code = $${params.length}`); }
  if (filters.sku) { params.push(filters.sku); clauses.push(`production_order.sku = $${params.length}`); }
  if (filters.q) {
    params.push(`${escapeLike(filters.q.toLowerCase())}%`);
    clauses.push(`(lower(production_order.production_order_number) LIKE $${params.length} ESCAPE '\\' OR lower(production_order.rfq_code) LIKE $${params.length} ESCAPE '\\' OR lower(production_order.sku) LIKE $${params.length} ESCAPE '\\' OR lower(production_order.supplier_code) LIKE $${params.length} ESCAPE '\\')`);
  }
  if (afterProductionOrderNumber) { params.push(afterProductionOrderNumber); clauses.push(`production_order.production_order_number > $${params.length}`); }
  params.push(limit + 1);
  const result = await queryable.query(
    `SELECT production_order.payload, production_order.production_order_number, ${linkedActualCost('$1')} AS "linkedActualCost"
       FROM production_orders AS production_order
      WHERE ${clauses.join(' AND ')}
      ORDER BY production_order.production_order_number ASC
      LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, limit);
  return Object.freeze({
    items: Object.freeze(rows.map((row) => withLinkedActualCost(row))),
    hasMore: result.rows.length > limit,
    ...(result.rows.length > limit ? { nextProductionOrderNumber: rows.at(-1).production_order_number } : {}),
  });
}
function escapeLike(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
