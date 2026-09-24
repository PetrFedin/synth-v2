import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = Object.freeze(['owner', 'admin', 'sales', 'finance']);

// Инлайн-контроль и финальный AQL накапливают брак по одному исполнению независимо друг от друга и
// нигде не встречались, хотя оба уже пишут в `execution_id`. Свод только показывает — приёмочное
// число выборки остаётся решением плана, а не переписывается накопленным браком по вехам, это было
// бы политикой, а не связью. Считается в обоих чтениях (списке и карточке): список — то, что видит
// инспектор до открытия карточки, и там же он решает, с которой инспекции начать.
const INLINE_DEFECT_HISTORY = `(SELECT COALESCE(json_agg(milestone ORDER BY milestone."milestoneCode"), '[]'::json)
    FROM (
      SELECT check_row.milestone_code AS "milestoneCode",
             SUM(check_row.checked_quantity)::int AS "checkedQuantity",
             SUM(check_row.defective_quantity)::int AS "defectiveQuantity",
             COUNT(*) FILTER (WHERE check_row.defective_quantity > 0 AND check_row.disposition IS NULL)::int AS "openDispositions"
        FROM inline_quality_checks AS check_row
       WHERE check_row.execution_id = inspection.payload ->> 'executionId'
       GROUP BY check_row.milestone_code
    ) AS milestone
  )`;

export function createPostgresFinalQualityReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    pageForActor(actorId, options) { return withPostgresTransaction(pool, (queryable) => page(queryable, actorId, options), { begin: SNAPSHOT_BEGIN }); },
    getForActor(actorId, inspectionCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT inspection.payload, ${INLINE_DEFECT_HISTORY} AS "inlineDefectHistory"
             FROM quality_inspections AS inspection
            WHERE inspection.inspection_code = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $2
                   AND membership.organisation_id = inspection.brand_id
                   AND membership.status = 'active'
                   AND membership.role = ANY($3::text[])
              )`,
          [inspectionCode, actorId, READ_ROLES],
        );
        const row = result.rows[0];
        if (!row) return undefined;
        return withInlineDefectHistory(row);
      }, { begin: SNAPSHOT_BEGIN });
    },
    // The plan sets this actor's brands work to, collapsed to one row per standard and level.
    //
    // The inspector picks a set and the two limits; the sample size is not offered as a choice
    // because it is not one — it follows from the lot and the level, and the run resolves it. What
    // the list has to carry is only what a person legitimately chooses between.
    samplingPlanSetsForActor(actorId) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT plan.brand_id AS "brandId",
                  plan.standard_code AS "standardCode",
                  plan.inspection_level AS "inspectionLevel",
                  array_agg(DISTINCT plan.aql ORDER BY plan.aql) AS aqls,
                  min(plan.lot_from) AS "lotFrom",
                  max(plan.lot_to) AS "lotTo",
                  count(*)::integer AS rows,
                  min(plan.source_note) AS "sourceNote"
             FROM aql_sampling_plans AS plan
            WHERE EXISTS (
                    SELECT 1 FROM memberships AS membership
                     WHERE membership.user_id = $1
                       AND membership.organisation_id = plan.brand_id
                       AND membership.status = 'active'
                       AND membership.role = ANY($2::text[])
                  )
            GROUP BY plan.brand_id, plan.standard_code, plan.inspection_level
            ORDER BY plan.standard_code, plan.inspection_level`,
          [actorId, READ_ROLES],
        );
        return result.rows.map((row) => ({ ...row, aqls: row.aqls.map(Number) }));
      }, { begin: SNAPSHOT_BEGIN });
    },
    getShipmentReleaseForActor(actorId, releaseCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT release.payload
             FROM quality_shipment_releases AS release
            WHERE release.release_code = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $2
                   AND membership.organisation_id = release.brand_id
                   AND membership.status = 'active'
                   AND membership.role = ANY($3::text[])
              )`,
          [releaseCode, actorId, READ_ROLES],
        );
        return result.rows[0]?.payload;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

async function page(queryable, actorId, { limit, afterInspectionCode, filters }) {
  const params = [actorId, READ_ROLES];
  const clauses = [`EXISTS (
    SELECT 1 FROM memberships AS membership
     WHERE membership.user_id = $1
       AND membership.organisation_id = inspection.brand_id
       AND membership.status = 'active'
       AND membership.role = ANY($2::text[])
  )`];
  if (filters.brandId) { params.push(filters.brandId); clauses.push(`inspection.brand_id = $${params.length}`); }
  if (filters.status) { params.push(filters.status); clauses.push(`inspection.status = $${params.length}`); }
  if (filters.supplierCode) { params.push(filters.supplierCode); clauses.push(`inspection.supplier_code = $${params.length}`); }
  if (filters.sku) { params.push(filters.sku); clauses.push(`inspection.sku = $${params.length}`); }
  if (filters.q) {
    params.push(`${escapeLike(filters.q.toLowerCase())}%`);
    clauses.push(`(lower(inspection.inspection_code) LIKE $${params.length} ESCAPE '\\' OR lower(inspection.execution_code) LIKE $${params.length} ESCAPE '\\' OR lower(inspection.production_order_number) LIKE $${params.length} ESCAPE '\\' OR lower(inspection.sku) LIKE $${params.length} ESCAPE '\\' OR lower(inspection.supplier_code) LIKE $${params.length} ESCAPE '\\')`);
  }
  if (afterInspectionCode) { params.push(afterInspectionCode); clauses.push(`inspection.inspection_code > $${params.length}`); }
  params.push(limit + 1);
  const result = await queryable.query(
    `SELECT inspection.payload, inspection.inspection_code, ${INLINE_DEFECT_HISTORY} AS "inlineDefectHistory"
       FROM quality_inspections AS inspection
      WHERE ${clauses.join(' AND ')}
      ORDER BY inspection.inspection_code ASC
      LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, limit);
  return Object.freeze({
    items: Object.freeze(rows.map((row) => withInlineDefectHistory(row))),
    hasMore: result.rows.length > limit,
    ...(result.rows.length > limit ? { nextInspectionCode: rows.at(-1).inspection_code } : {}),
  });
}
function withInlineDefectHistory(row) {
  return Object.freeze({ ...row.payload, inlineDefectHistory: Object.freeze(row.inlineDefectHistory.map((entry) => Object.freeze(entry))) });
}
function escapeLike(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
