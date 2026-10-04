import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, rolesWithCapability } from '../modules/access-control/public.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = rolesWithCapability(CAPABILITIES.COST_MANAGE);

// Цель и то, с чем её сравнивают, читаются одним снимком: котировка фабрики из подтверждённого
// заказа и себестоимость по опубликованной ведомости. Прочитанные порознь, они могли бы прийти из
// разных моментов, и «не укладываемся» оказалось бы выдуманным.
const SELECT_PLAN = `
  SELECT plan.payload AS plan,
         -- Цена за единицу — это **итог заказа**, делённый на количество, а не строчная цена.
         -- Фабрика берёт unitPrice × количество **плюс** постоянную часть: оснастку, образцы,
         -- приладку. Она лежит в том же снимке, и пока она не входила в сравнение, запас до цели
         -- был завышен, а маржа сезона систематически оптимистична. Итог снимка уже содержит обе
         -- части, поэтому делится именно он.
         (SELECT ROUND(
                   (production_order.payload -> 'commercialSnapshot' ->> 'totalCostMinor')::numeric
                   / NULLIF(production_order.quantity, 0))::bigint
            FROM production_orders AS production_order
           WHERE production_order.sku = plan.sku AND production_order.status = 'confirmed'
           ORDER BY production_order.confirmed_at DESC LIMIT 1) AS "quotedFobMinor",
         (SELECT production_order.payload -> 'commercialSnapshot' ->> 'currency'
            FROM production_orders AS production_order
           WHERE production_order.sku = plan.sku AND production_order.status = 'confirmed'
           ORDER BY production_order.confirmed_at DESC LIMIT 1) AS "quotedCurrency",
         (SELECT ROUND((bom.payload ->> 'totalCost')::numeric * 100)
            FROM boms AS bom
           WHERE bom.sku = plan.sku AND bom.status = 'published' LIMIT 1) AS "bomCostMinor",
         (SELECT bom.payload ->> 'currency'
            FROM boms AS bom
           WHERE bom.sku = plan.sku AND bom.status = 'published' LIMIT 1) AS "bomCurrency"
    FROM target_price_plans AS plan`;

const VISIBLE = `EXISTS (
        SELECT 1 FROM memberships AS membership
         WHERE membership.user_id = $1
           AND membership.organisation_id = plan.brand_id
           AND membership.status = 'active'
           AND membership.role = ANY($2::text[])
      )`;

const SELECT_SEASON_RATES = `
  SELECT rate.payload AS rate
    FROM season_fx_rates AS rate`;
const SEASON_RATE_VISIBLE = `EXISTS (
        SELECT 1 FROM memberships AS membership
         WHERE membership.user_id = $1
           AND membership.organisation_id = rate.brand_id
           AND membership.status = 'active'
           AND membership.role = ANY($2::text[])
      )`;

export function createPostgresTargetPricingReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    // Прежде у сезонных курсов не было чтения списком — только запись и внутреннее чтение при
    // составлении плана. Без него нельзя показать историю: ни свою, ни курса ЦБ рядом с ней.
    seasonRatesForActor(actorId, { brandId, campaignId, fromCurrency, toCurrency } = {}) {
      return withPostgresTransaction(pool, async (queryable) => {
        const conditions = [SEASON_RATE_VISIBLE];
        const values = [actorId, READ_ROLES];
        if (brandId) { values.push(brandId); conditions.push(`rate.brand_id = $${values.length}`); }
        if (campaignId) { values.push(campaignId); conditions.push(`rate.campaign_id = $${values.length}`); }
        if (fromCurrency) { values.push(fromCurrency); conditions.push(`rate.from_currency = $${values.length}`); }
        if (toCurrency) { values.push(toCurrency); conditions.push(`rate.to_currency = $${values.length}`); }
        const result = await queryable.query(
          `${SELECT_SEASON_RATES} WHERE ${conditions.join(' AND ')} ORDER BY rate.effective_on DESC`,
          values,
        );
        return result.rows.map((row) => row.rate);
      }, { begin: SNAPSHOT_BEGIN });
    },
    plansForActor(actorId) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `${SELECT_PLAN} WHERE plan.status <> 'superseded' AND ${VISIBLE} ORDER BY plan.sku`,
          [actorId, READ_ROLES],
        );
        return result.rows.map(normalize);
      }, { begin: SNAPSHOT_BEGIN });
    },
    planForSku(actorId, sku) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `${SELECT_PLAN} WHERE plan.sku = $3 AND plan.status <> 'superseded' AND ${VISIBLE}`,
          [actorId, READ_ROLES, sku],
        );
        return result.rows[0] ? normalize(result.rows[0]) : null;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

function normalize(row) {
  return {
    plan: row.plan,
    quotedFobMinor: row.quotedFobMinor === null ? null : Number(row.quotedFobMinor),
    quotedCurrency: row.quotedCurrency ?? null,
    // Себестоимость по ведомости сравнима только в своей валюте: пересчитывать её вторым курсом
    // значило бы сравнивать с числом, которого никто не называл.
    bomCostMinor: row.bomCostMinor === null || row.bomCurrency !== row.plan.fobCurrency ? null : Number(row.bomCostMinor),
  };
}
