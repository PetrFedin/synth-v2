import { invariant } from '../core/errors.mjs';

/**
 * Owning-domain verification of a newer, published Material version after an
 * explicit human-reviewed specification correction. No material mutation,
 * generic writer, or inferred approval is possible through this adapter.
 *
 * The orchestration service independently re-reads the exact result via the
 * existing Material result verifier before persisting a successful receipt.
 */
export const MATERIAL_RECOMPUTE_VERIFICATION_OPERATION = 'material:material.verify_published_revision';

/** @param {{materials?:any}} [options] */
export function createMaterialPublishedRevisionRecomputeAdapter({ materials } = {}) {
  invariant(
    materials && typeof materials.getForActor === 'function',
    'PRODUCT_ENGINEERING_MATERIAL_READER_REQUIRED',
    'Material owning read authority is required for recompute verification',
  );

  return async function verifyPublishedRevision(actorId, request) {
    invariant(
      typeof actorId === 'string' && actorId.trim(),
      'PRODUCT_ENGINEERING_RECOMPUTE_ACTOR_REQUIRED',
      'Material recompute verification requires an authorised actor',
    );
    invariant(
      request?.authority === 'material' && request.operation === 'material.verify_published_revision',
      'PRODUCT_ENGINEERING_MATERIAL_OPERATION_INVALID',
      'Material verification accepts only the exact allowlisted operation',
    );
    invariant(
      typeof request.brandId === 'string' && request.brandId.trim(),
      'PRODUCT_ENGINEERING_MATERIAL_BRAND_REQUIRED',
      'An exact plan brand is required for Material recompute verification',
    );

    const stale = request.inputReference;
    invariant(
      stale?.authority === 'material' && typeof stale.entityId === 'string' && stale.entityId.trim(),
      'PRODUCT_ENGINEERING_MATERIAL_STALE_REFERENCE_INVALID',
      'Recompute step must reference an exact stale Material',
    );
    invariant(
      stale.version !== null && stale.version !== undefined
        && /^[1-9][0-9]*$/.test(String(stale.version))
        && Number.isSafeInteger(Number(stale.version)),
      'PRODUCT_ENGINEERING_MATERIAL_STALE_VERSION_REQUIRED',
      'An exact previous Material version is required',
    );
    const oldVersion = Number(stale.version);

    const review = request.prerequisiteSteps?.find((parent) => (
      parent.mode === 'human_review'
      && parent.owningAuthority === 'material'
      && parent.operation === 'material.review_revised_specification'
      && typeof parent.id === 'string' && parent.id.trim()
      && parent.inputReference?.authority === 'material'
      && parent.inputReference.entityId === stale.entityId
      && String(parent.inputReference.version) === String(stale.version)
    ));
    invariant(
      review,
      'PRODUCT_ENGINEERING_MATERIAL_REVIEW_REQUIRED',
      'Material verification requires the exact completed human-review DAG predecessor',
    );

    // The owning authority enforces active membership and applies the role's
    // cost projection; this adapter does not need the purchase price.
    const material = await materials.getForActor(actorId, stale.entityId);
    invariant(
      material?.code === stale.entityId && material.brandId === request.brandId,
      'PRODUCT_ENGINEERING_MATERIAL_IDENTITY_MISMATCH',
      'Material identity/brand must match the immutable recompute plan',
    );
    invariant(
      material.status === 'published' && typeof material.publishedAt === 'string'
        && Number.isFinite(Date.parse(material.publishedAt)),
      'PRODUCT_ENGINEERING_MATERIAL_NOT_PUBLISHED',
      'Material must have a valid published state',
    );
    invariant(
      Number.isSafeInteger(material.version) && material.version > oldVersion,
      'PRODUCT_ENGINEERING_MATERIAL_REVISION_NOT_ADVANCED',
      'Material version must be newer than the exact stale version',
    );

    return Object.freeze({
      resultReference: Object.freeze({
        authority: 'material',
        entityId: material.code,
        version: String(material.version),
      }),
      evidence: Object.freeze([Object.freeze({
        kind: 'material_published_version_verified',
        brandId: material.brandId,
        materialCode: material.code,
        reviewedPredecessorStepId: review.id,
        previousVersion: String(oldVersion),
        currentVersion: String(material.version),
        publishedAt: material.publishedAt,
      })]),
    });
  };
}
