import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, rolesWithCapability } from '../modules/access-control/public.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';
import { verifyFrozenCanonicalTechPackSources } from '../application/tech-pack-canonical-issue-snapshot.mjs';
import { buildFrozenCanonicalTechPackDocument } from '../application/tech-pack-frozen-document.mjs';
import { evaluateCanonicalTechPackRenderAdmission } from '../application/tech-pack-public-render-policy.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = rolesWithCapability(CAPABILITIES.TECH_PACK_READ);

export function createPostgresTechPackReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    pageForActor(actorId, options) { return withPostgresTransaction(pool, (queryable) => page(queryable, actorId, options), { begin: SNAPSHOT_BEGIN }); },
    getForActor(actorId, techPackCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT pack.payload
             FROM tech_packs AS pack
            WHERE pack.tech_pack_code = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $2
                   AND membership.organisation_id = pack.brand_id
                   AND membership.status = 'active'
                   AND membership.role = ANY($3::text[])
              )`,
          [techPackCode, actorId, READ_ROLES],
        );
        return result.rows[0]?.payload;
      }, { begin: SNAPSHOT_BEGIN });
    },

    getCanonicalFrozenDocumentForActor(actorId, techPackCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result=await queryable.query(
          `SELECT pack.payload, pack.issue_format
             FROM tech_packs AS pack
            WHERE pack.tech_pack_code=$1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id=$2
                   AND membership.organisation_id=pack.brand_id
                   AND membership.status='active'
                   AND membership.role = ANY($3::text[])
              )`,
          [techPackCode,actorId,READ_ROLES],
        );
        const row=result.rows[0];
        if(!row) return undefined;
        invariant(row.issue_format === 'canonical-v1',
          'TECH_PACK_CANONICAL_FORMAT_REQUIRED','Canonical Tech Pack not available');
        return buildFrozenCanonicalTechPackDocument({...row.payload,issueFormat:row.issue_format});
      }, { begin: SNAPSHOT_BEGIN });
    },

    getCanonicalRenderAdmissionForActor(actorId,techPackCode,evaluatedAt) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result=await queryable.query(
          `SELECT pack.payload,pack.issue_format
             FROM tech_packs AS pack
            WHERE pack.tech_pack_code=$1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id=$2
                   AND membership.organisation_id=pack.brand_id
                   AND membership.status='active'
                   AND membership.role = ANY($3::text[])
              )`,
          [techPackCode,actorId,READ_ROLES],
        );
        const row=result.rows[0];
        if(!row) return undefined;
        invariant(row.issue_format==='canonical-v1',
          'TECH_PACK_CANONICAL_FORMAT_REQUIRED','Canonical Tech Pack not available');
        const document=buildFrozenCanonicalTechPackDocument({...row.payload,issueFormat:row.issue_format});
        const ids=document.sketches.rows.map(item=>item.id);
        let rights=[];
        if(ids.length) rights=(await queryable.query(
          `SELECT DISTINCT ON (media_id) id,media_id,version,status,basis,evidence_ref,
                  approved_at,approved_by,valid_until
             FROM product_media_publication_rights
            WHERE media_id = ANY($1::text[])
            ORDER BY media_id,version DESC,id DESC`,[ids])).rows.map(row=>({
              id:row.id,mediaId:row.media_id,version:row.version,status:row.status,
              basis:row.basis,evidenceRef:row.evidence_ref,
              approvedAt:iso(row.approved_at),approvedBy:row.approved_by,
              validUntil:row.valid_until?iso(row.valid_until):null,
            }));
        return evaluateCanonicalTechPackRenderAdmission(document,rights,evaluatedAt);
      }, { begin: SNAPSHOT_BEGIN });
    },

    // The document is the pack together with the bill of materials, the measurement chart and the
    // operation sequence, assembled by the read model so the four parts are read at one instant and
    // cannot disagree with each other.
    getDocumentForActor(actorId, techPackCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT document.payload,
                  pack.issue_format,
                  pack.payload->'dependencySnapshot' AS dependency_snapshot
             FROM tech_pack_document_workspace AS document
             JOIN tech_packs AS pack
               ON pack.tech_pack_code = document.tech_pack_code
            WHERE document.tech_pack_code = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $2
                   AND membership.organisation_id = document.brand_id
                   AND membership.status = 'active'
                   AND membership.role = ANY($3::text[])
              )`,
          [techPackCode, actorId, READ_ROLES],
        );
        const document = result.rows[0];
        // Existing legacy documents retain their historical contract. An
        // internally issued canonical Pack must NOT silently join today's BOM
        // or legacy-SKU measurement chart into yesterday's factory document.
        // Detect the presence of either canonical marker, not a truthy hash:
        // a missing/empty lineage hash is damaged evidence, not a legacy Pack.
        // The source-section projector alone does not admit factory printing.
        const basis = document?.dependency_snapshot;
        const canonicalFormat = document?.issue_format === 'canonical-v1';
        if (canonicalFormat || (basis && typeof basis === 'object'
          && (Object.hasOwn(basis, 'canonical') || Object.hasOwn(basis, 'frozenSources')
            || Object.hasOwn(basis, 'frozenDocumentContext')))) {
          verifyFrozenCanonicalTechPackSources(basis);
          invariant(false, 'TECH_PACK_CANONICAL_PRINT_NOT_ADMITTED',
            'Frozen Tech Pack sources are verified, but canonical factory print is not yet admitted');
        }
        return document?.payload;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

async function page(queryable, actorId, { limit, afterTechPackCode, filters }) {
  const params = [actorId, READ_ROLES];
  const clauses = [`EXISTS (
    SELECT 1 FROM memberships AS membership
     WHERE membership.user_id = $1
       AND membership.organisation_id = pack.brand_id
       AND membership.status = 'active'
       AND membership.role = ANY($2::text[])
  )`];
  if (filters.brandId) { params.push(filters.brandId); clauses.push(`pack.brand_id = $${params.length}`); }
  if (filters.status) { params.push(filters.status); clauses.push(`pack.status = $${params.length}`); }
  if (filters.sku) { params.push(filters.sku); clauses.push(`pack.sku = $${params.length}`); }
  if (filters.q) {
    params.push(`${escapeLike(filters.q.toLowerCase())}%`);
    clauses.push(`(lower(pack.tech_pack_code) LIKE $${params.length} ESCAPE '\\' OR lower(pack.sku) LIKE $${params.length} ESCAPE '\\' OR lower(COALESCE(pack.supplier_code, '')) LIKE $${params.length} ESCAPE '\\' OR lower(COALESCE(pack.payload->>'title', '')) LIKE $${params.length} ESCAPE '\\')`);
  }
  if (afterTechPackCode) { params.push(afterTechPackCode); clauses.push(`pack.tech_pack_code > $${params.length}`); }
  params.push(limit + 1);
  const result = await queryable.query(
    `SELECT pack.payload, pack.tech_pack_code
       FROM tech_packs AS pack
      WHERE ${clauses.join(' AND ')}
      ORDER BY pack.tech_pack_code ASC
      LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, limit);
  return Object.freeze({ items: Object.freeze(rows.map((row) => row.payload)), hasMore: result.rows.length > limit, ...(result.rows.length > limit ? { nextTechPackCode: rows.at(-1).tech_pack_code } : {}) });
}
function escapeLike(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }

function iso(value) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
