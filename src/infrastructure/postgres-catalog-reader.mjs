import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';
import { loadPostgresVisibilityScope } from './postgres-visibility-scope.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

export function createPostgresCatalogReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    async pageForActor(actorId, { limit, afterSku, filters } = {}) {
      validateRequest({ actorId, limit, afterSku, filters });
      return withPostgresTransaction(pool, async (queryable) => {
        const scope = await loadPostgresVisibilityScope(queryable, actorId);
        if (!scope.brandIds.length && !scope.visibleCollectionIds.length) return emptyPage();
        const params = [scope.brandIds, scope.visibleCollectionIds];
        const clauses = ["(brand_id = ANY($1::text[]) OR (collection_id = ANY($2::text[]) AND status = 'published'))"];
        addFilter(clauses, params, 'status', filters.status);
        addFilter(clauses, params, 'brand_id', filters.brandId);
        addFilter(clauses, params, 'collection_id', filters.collectionId);
        if (filters.q) {
          const skuParameter = params.push(`${filters.q.toUpperCase()}%`);
          const nameParameter = params.push(`${filters.q.toLowerCase()}%`);
          clauses.push(`(sku LIKE $${skuParameter} OR lower(payload->>'name') LIKE $${nameParameter})`);
        }
        if (afterSku) {
          const afterParameter = params.push(afterSku);
          clauses.push(`sku > $${afterParameter}`);
        }
        const fetchLimitParameter = params.push(limit + 1);
        const result = await queryable.query(
          `SELECT payload, sku
             FROM catalog_skus
            WHERE ${clauses.join(' AND ')}
            ORDER BY sku ASC
            LIMIT $${fetchLimitParameter}`,
          params,
        );
        const rows = result.rows.slice(0, limit);
        const hasMore = result.rows.length > limit;
        return Object.freeze({
          items: Object.freeze(rows.map((row) => row.payload)),
          hasMore,
          ...(hasMore ? { nextSku: rows.at(-1).sku } : {}),
        });
      }, { begin: SNAPSHOT_BEGIN });
    },

    async getForActor(actorId, sku) {
      invariant(typeof actorId === 'string' && actorId.length > 0, 'CATALOG_ACTOR_INVALID', 'Catalog actor is invalid');
      invariant(typeof sku === 'string' && sku.length > 0, 'CATALOG_SKU_INVALID', 'Catalog SKU is invalid');
      return withPostgresTransaction(pool, async (queryable) => {
        const scope = await loadPostgresVisibilityScope(queryable, actorId);
        if (!scope.brandIds.length && !scope.visibleCollectionIds.length) return undefined;
        const result = await queryable.query(
          `SELECT payload
             FROM catalog_skus
            WHERE sku = $1
              AND (brand_id = ANY($2::text[]) OR (collection_id = ANY($3::text[]) AND status = 'published'))`,
          [sku, scope.brandIds, scope.visibleCollectionIds],
        );
        return result.rows[0]?.payload;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

function addFilter(clauses, params, column, value) {
  if (!value) return;
  const parameter = params.push(value);
  clauses.push(`${column} = $${parameter}`);
}

function validateRequest({ actorId, limit, afterSku, filters }) {
  invariant(typeof actorId === 'string' && actorId.length > 0, 'CATALOG_ACTOR_INVALID', 'Catalog actor is invalid');
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= 200, 'CATALOG_PAGE_LIMIT_INVALID', 'Catalog page limit is invalid');
  invariant(afterSku === undefined || (typeof afterSku === 'string' && afterSku.length > 0), 'CATALOG_CURSOR_INVALID', 'Catalog cursor SKU is invalid');
  invariant(filters && typeof filters === 'object' && !Array.isArray(filters), 'CATALOG_FILTERS_INVALID', 'Catalog filters are invalid');
}

function emptyPage() {
  return Object.freeze({ items: Object.freeze([]), hasMore: false });
}
