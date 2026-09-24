import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = Object.freeze(['owner', 'admin', 'finance']);

// План сезона и то, чем он обернулся, читаются одним снимком. Прочитанные порознь, слоты и их
// реализации могли бы прийти из разных моментов — и маржа сезона посчиталась бы по плану до правки
// и по факту после неё, то есть по сезону, которого не было.
const VISIBLE = `EXISTS (
        SELECT 1 FROM memberships AS membership
         WHERE membership.user_id = $1
           AND membership.organisation_id = placeholder.brand_id
           AND membership.status = 'active'
           AND membership.role = ANY($2::text[])
      )`;

const SELECT_PLACEHOLDERS = `
  SELECT placeholder.id,
         placeholder.campaign_id AS "campaignId",
         placeholder.placeholder_code AS "placeholderCode",
         placeholder.name_ru AS "nameRu",
         placeholder.name_en AS "nameEn",
         placeholder.status,
         placeholder.currency,
         placeholder.recommended_retail_price_minor AS "recommendedRetailPriceMinor",
         placeholder.planned_unit_cost_minor AS "plannedUnitCostMinor",
         placeholder.planned_margin_basis_points AS "plannedMarginBasisPoints",
         placeholder.planned_quantity AS "plannedQuantity",
         placeholder.colourway_count AS "colourwayCount"
    FROM product_placeholders AS placeholder
   WHERE placeholder.campaign_id = $3
     AND ${VISIBLE}
   ORDER BY placeholder.placeholder_code`;

const SELECT_REALISATIONS = `
  SELECT realisation.placeholder_id AS "placeholderId", realisation.payload
    FROM placeholder_realisation_workspace AS realisation
    JOIN product_placeholders AS placeholder ON placeholder.id = realisation.placeholder_id
   WHERE realisation.campaign_id = $3
     AND ${VISIBLE}
   ORDER BY realisation.sku`;

/** @param {{ pool?: any }} [options] */
export function createPostgresSeasonEconomicsReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    seasonForActor(actorId, campaignId) {
      return withPostgresTransaction(pool, async (queryable) => {
        const parameters = [actorId, READ_ROLES, campaignId];
        const placeholders = await queryable.query(SELECT_PLACEHOLDERS, parameters);
        const realisations = await queryable.query(SELECT_REALISATIONS, parameters);
        const bySlot = new Map();
        for (const row of realisations.rows) {
          const bucket = bySlot.get(row.placeholderId) ?? [];
          bucket.push(normalizeRealisation(row.payload));
          bySlot.set(row.placeholderId, bucket);
        }
        return Object.freeze(placeholders.rows.map((row) => Object.freeze({
          placeholder: Object.freeze({ ...row, ...numeric(row) }),
          realisations: Object.freeze(bySlot.get(row.id) ?? []),
        })));
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

// PostgreSQL отдаёт bigint строкой, чтобы не потерять точность на больших числах. Домен считает
// в копейках целыми, поэтому приведение делается здесь один раз, а не в каждом правиле.
function numeric(row) {
  return {
    recommendedRetailPriceMinor: toInteger(row.recommendedRetailPriceMinor),
    plannedUnitCostMinor: toInteger(row.plannedUnitCostMinor),
    plannedMarginBasisPoints: toInteger(row.plannedMarginBasisPoints),
    plannedQuantity: toInteger(row.plannedQuantity),
    colourwayCount: toInteger(row.colourwayCount),
  };
}

function normalizeRealisation(payload) {
  const plan = payload?.targetPlan ?? null;
  return Object.freeze({
    sku: payload.sku,
    styleId: payload.styleId ?? null,
    productionOrderNumber: payload.productionOrderNumber ?? null,
    quotedFobMinor: toInteger(payload.quotedFobMinor),
    quotedCurrency: payload.quotedCurrency ?? null,
    orderedQuantity: toInteger(payload.orderedQuantity),
    targetPlan: plan === null ? null : Object.freeze({
      id: plan.id,
      rrpCurrency: plan.rrpCurrency,
      targetRrpMinor: toInteger(plan.targetRrpMinor),
      retailMarkup: Number(plan.retailMarkup),
      landedFactor: Number(plan.landedFactor),
      targetLandedMinor: toInteger(plan.targetLandedMinor),
      fobCurrency: plan.fobCurrency,
      fxRate: Number(plan.fxRate),
    }),
  });
}

function toInteger(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  invariant(Number.isSafeInteger(number), 'SEASON_READ_MODEL_NUMBER_INVALID', 'A read model amount is not a safe integer', { value });
  return number;
}
