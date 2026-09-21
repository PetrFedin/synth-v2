import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

export function createPostgresMaterialReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    pageForActor(actorId, options) {
      return withPostgresTransaction(pool, (queryable) => page(queryable, actorId, options), { begin: SNAPSHOT_BEGIN });
    },
    getForActor(actorId, code) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT m.payload, ${COMPOSITION_LATERAL}
             FROM materials m
            WHERE m.code = $1
              AND EXISTS (
                SELECT 1 FROM memberships mem
                 WHERE mem.user_id = $2 AND mem.organisation_id = m.brand_id AND mem.status = 'active'
              )`,
          [code, actorId],
        );
        return result.rows[0] ? withComposition(result.rows[0]) : undefined;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

async function page(queryable, actorId, { limit, afterCode, filters }) {
  const params = [actorId];
  const clauses = [
    `EXISTS (
       SELECT 1 FROM memberships mem
        WHERE mem.user_id = $1 AND mem.organisation_id = m.brand_id AND mem.status = 'active'
     )`,
  ];
  if (filters.brandId) { params.push(filters.brandId); clauses.push(`m.brand_id = $${params.length}`); }
  if (filters.status) { params.push(filters.status); clauses.push(`m.status = $${params.length}`); }
  if (filters.type) { params.push(filters.type); clauses.push(`m.material_type = $${params.length}`); }
  if (filters.q) {
    params.push(`${escapeLike(filters.q.toLowerCase())}%`);
    clauses.push(`(lower(m.code) LIKE $${params.length} ESCAPE '\\' OR lower(m.payload->>'name') LIKE $${params.length} ESCAPE '\\')`);
  }
  if (afterCode) { params.push(afterCode); clauses.push(`m.code > $${params.length}`); }
  params.push(limit + 1);
  const result = await queryable.query(
    `SELECT m.payload, m.code, ${COMPOSITION_LATERAL}
       FROM materials m
      WHERE ${clauses.join(' AND ')}
      ORDER BY m.code ASC
      LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, limit);
  return Object.freeze({
    items: Object.freeze(rows.map(withComposition)),
    hasMore: result.rows.length > limit,
    ...(result.rows.length > limit ? { nextCode: rows.at(-1).code } : {}),
  });
}

function escapeLike(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }

// Состав живёт строками в своей таблице, потому что сумма процентов держится проверкой базы. Для
// читателя он приезжает вместе с материалом: отдельный запрос за составом означал бы, что карточка
// материала и его состав прочитаны в разные моменты.
const COMPOSITION_LATERAL = `(
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'fibreCode', line.fibre_code,
           'percentage', line.percentage,
           'position', line.position,
           'nameRu', fibre.translations ->> 'ru',
           'nameEn', fibre.translations ->> 'en',
           'originClassCode', fibre.attributes ->> 'origin_class_code'
         ) ORDER BY line.position), '[]'::jsonb)
    FROM material_compositions line
    LEFT JOIN mdm_entries fibre ON fibre.id = line.fibre_entry_id
   WHERE line.material_code = m.code
) AS composition_lines`;

function withComposition(row) {
  const lines = Array.isArray(row.composition_lines) ? row.composition_lines : [];
  const payload = row.payload ?? {};
  return Object.freeze({
    ...payload,
    compositionLines: Object.freeze(lines.map((line) => Object.freeze({
      ...line,
      percentage: Number(line.percentage),
    }))),
    // Текст состава выводится из строк, когда строки есть: два независимых поля про один и тот же
    // состав разошлись бы при первой правке. Старое свободное поле остаётся только у материалов,
    // состав которых ещё не разобран на строки.
    composition: lines.length > 0
      ? lines.map((line) => `${formatPercent(line.percentage)}% ${line.nameRu || line.fibreCode}`).join(', ')
      : (payload.composition ?? null),
    compositionSource: lines.length > 0 ? 'lines' : (payload.composition ? 'legacy-text' : 'none'),
  });
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(3)));
}
