import { invariant } from '../core/errors.mjs';

/**
 * This B2 adapter cannot change a measurement chart. It is a read-only,
 * owning-domain verification step after an explicit human-reviewed revision.
 * The orchestration service still independently verifies the resulting exact
 * version through its existing result verifier before persisting success.
 */
export const MEASUREMENT_RECOMPUTE_VERIFICATION_OPERATION = 'measurement:measurement.verify_published_revision';

/** @param {{measurements?:any}} [options] */
export function createMeasurementPublishedRevisionRecomputeAdapter({ measurements } = {}) {
  invariant(
    measurements && typeof measurements.getCanonicalForActor === 'function',
    'PRODUCT_ENGINEERING_MEASUREMENT_READER_REQUIRED',
    'Canonical Measurement read authority is required for recompute verification',
  );

  return async function verifyPublishedRevision(actorId, request) {
    invariant(
      typeof actorId === 'string' && actorId.trim(),
      'PRODUCT_ENGINEERING_RECOMPUTE_ACTOR_REQUIRED',
      'Measurement recompute verification requires an authorised actor',
    );
    invariant(
      request?.authority === 'measurement' && request?.operation === 'measurement.verify_published_revision',
      'PRODUCT_ENGINEERING_MEASUREMENT_OPERATION_INVALID',
      'Measurement recompute verification requires its exact allowlisted operation',
    );
    const stale = request.inputReference;
    invariant(
      stale?.authority === 'measurement' && typeof stale.entityId === 'string' && stale.entityId.trim(),
      'PRODUCT_ENGINEERING_MEASUREMENT_STALE_REFERENCE_INVALID',
      'Recompute step must target an exact stale canonical Measurement Chart',
    );
    const oldVersion = Number(stale.version);
    invariant(
      stale.version !== null && stale.version !== undefined && /^[1-9][0-9]*$/.test(String(stale.version))
        && Number.isSafeInteger(oldVersion),
      'PRODUCT_ENGINEERING_MEASUREMENT_STALE_VERSION_REQUIRED',
      'An exact previous Measurement Chart version is required',
    );
    const parentReview = request.prerequisiteSteps?.find(parent => (
      parent.mode === 'human_review'
      && parent.owningAuthority === 'measurement'
      && parent.operation === 'measurement.review_revised_chart'
      && parent.inputReference?.authority === 'measurement'
      && parent.inputReference.entityId === stale.entityId
      && String(parent.inputReference.version) === String(stale.version)
    ));
    invariant(
      parentReview,
      'PRODUCT_ENGINEERING_MEASUREMENT_REVIEW_REQUIRED',
      'An exact completed Measurement human-review predecessor is required',
    );
    const chart = await measurements.getCanonicalForActor(actorId, stale.entityId);
    invariant(
      chart?.id === stale.entityId && chart.sku === null && typeof chart.styleVersionId === 'string'
        && chart.styleVersionId && typeof chart.colorwayId === 'string' && chart.colorwayId
        && typeof chart.sizeScaleVersionId === 'string' && chart.sizeScaleVersionId,
      'PRODUCT_ENGINEERING_MEASUREMENT_CANONICAL_REQUIRED',
      'Referenced Measurement Chart must be canonical Product Identity data',
    );
    invariant(
      chart.status === 'published' && typeof chart.publishedAt === 'string'
        && Number.isFinite(Date.parse(chart.publishedAt)),
      'PRODUCT_ENGINEERING_MEASUREMENT_NOT_PUBLISHED',
      'Only a published canonical Measurement revision can satisfy recompute verification',
    );
    invariant(
      Number.isSafeInteger(chart.version) && chart.version > oldVersion,
      'PRODUCT_ENGINEERING_MEASUREMENT_REVISION_NOT_ADVANCED',
      'The canonical Measurement Chart must be newer than the stale version',
    );
    return Object.freeze({
      resultReference: Object.freeze({
        authority: 'measurement',
        entityId: chart.id,
        version: String(chart.version),
      }),
      evidence: Object.freeze([Object.freeze({
        kind: 'measurement_published_revision_verified',
        chartId: chart.id,
        reviewedPredecessorStepId: parentReview.id,
        previousVersion: String(oldVersion),
        publishedVersion: String(chart.version),
        publishedAt: chart.publishedAt,
      })]),
    });
  };
}
