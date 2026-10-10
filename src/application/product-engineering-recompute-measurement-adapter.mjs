import { invariant } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';

export const REVIEWED_MEASUREMENT_PUBLICATION_OPERATION = 'measurement.publish_reviewed_draft';
export const REVIEWED_MEASUREMENT_PUBLICATION_KEY = `measurement:${REVIEWED_MEASUREMENT_PUBLICATION_OPERATION}`;

const SHA256 = /^[0-9a-f]{64}$/;

/**
 * One exact owning-context adapter: publish a previously prepared canonical
 * measurement draft AFTER a separate authoritative human-review approval.
 *
 * This does not calculate dimensions, import source data or update arbitrary
 * canonical fields. It deliberately cannot run without a trusted approval
 * authority; the B2 runtime does not register it until that authority exists.
 *
 * @param {any} [options]
 */
export function createReviewedMeasurementPublicationAdapter(options = {}) {
  const { measurements, reviewApprovalAuthority } = options;
  invariant(
    typeof measurements?.publishCanonicalMeasurementChart === 'function',
    'RECOMPUTE_MEASUREMENT_OWNER_REQUIRED',
    'Canonical Measurement publication service is required',
  );
  invariant(
    typeof reviewApprovalAuthority?.requireAcceptedForStep === 'function',
    'RECOMPUTE_MEASUREMENT_REVIEW_AUTHORITY_REQUIRED',
    'An authoritative, capability-aware human-review reader is required',
  );

  /** @param {string} actorId @param {any} request */
  return async function publishReviewedMeasurementDraft(actorId, request) {
    invariant(
      typeof actorId === 'string' && actorId.trim(),
      'RECOMPUTE_MEASUREMENT_ACTOR_REQUIRED',
      'Owning-domain publication requires an authenticated actor',
    );
    invariant(
      request?.authority === 'measurement' &&
      request?.operation === REVIEWED_MEASUREMENT_PUBLICATION_OPERATION,
      'RECOMPUTE_MEASUREMENT_OPERATION_INVALID',
      'Only the exact reviewed Measurement draft publication operation is supported',
    );
    invariant(
      typeof request.planId === 'string' && request.planId.trim() &&
      typeof request.stepId === 'string' && request.stepId.trim() &&
      typeof request.planHash === 'string' && SHA256.test(request.planHash),
      'RECOMPUTE_MEASUREMENT_PLAN_INVALID',
      'Exact recompute plan and step identity are required',
    );
    invariant(
      request.idempotencyKey === `recompute:${request.planHash}:${request.stepId}`,
      'RECOMPUTE_MEASUREMENT_COMMAND_ID_INVALID',
      'Canonical command must reuse the exact durable job idempotency key',
    );

    const target = request.inputReference;
    invariant(
      target?.authority === 'measurement' &&
      typeof target.entityId === 'string' && target.entityId.trim() &&
      (typeof target.version === 'string' || typeof target.version === 'number') &&
      /^[1-9][0-9]*$/.test(String(target.version)),
      'RECOMPUTE_MEASUREMENT_TARGET_INVALID',
      'An exact canonical Measurement draft ID and pre-publication version are required',
    );
    const expectedVersion = Number(target.version);
    invariant(
      Number.isSafeInteger(expectedVersion) && expectedVersion < Number.MAX_SAFE_INTEGER,
      'RECOMPUTE_MEASUREMENT_VERSION_INVALID',
      'Measurement expected version must be a safe positive integer',
    );
    // This owner command supports optimistic version checks. Do not silently
    // discard an additional contentHash constraint it cannot enforce.
    invariant(
      target.contentHash === null || target.contentHash === undefined,
      'RECOMPUTE_MEASUREMENT_TARGET_HASH_UNSUPPORTED',
      'Reviewed Measurement publication requires a version-bound, not hash-only, input reference',
    );
    const source = request.sourceReference;
    invariant(
      typeof source?.authority === 'string' && source.authority.trim() &&
      typeof source.entityId === 'string' && source.entityId.trim() &&
      (source.version !== null && source.version !== undefined ||
        typeof source.contentHash === 'string' && SHA256.test(source.contentHash)),
      'RECOMPUTE_MEASUREMENT_SOURCE_INVALID',
      'An exact versioned source dependency is required',
    );

    const targetReference = Object.freeze({
      authority: 'measurement',
      entityId: target.entityId,
      version: String(expectedVersion),
      contentHash: null,
    });
    const sourceReference = Object.freeze({
      authority: source.authority,
      entityId: source.entityId,
      version: source.version == null ? null : String(source.version),
      contentHash: source.contentHash ?? null,
    });
    const reviewRequest = Object.freeze({
      planId: request.planId,
      planHash: request.planHash,
      stepId: request.stepId,
      targetReference,
      sourceReference,
    });

    // The separate review authority must validate reviewer capabilities and
    // durable acceptance receipts. A user-controlled evidence array does not
    // count as approval, even when it says decision='accepted'.
    const approval = await reviewApprovalAuthority.requireAcceptedForStep(actorId, reviewRequest);
    invariant(
      approval?.decision === 'accepted' &&
      approval.planId === request.planId &&
      approval.planHash === request.planHash &&
      approval.stepId === request.stepId &&
      typeof approval.reviewerId === 'string' && approval.reviewerId.trim() &&
      typeof approval.receiptHash === 'string' && SHA256.test(approval.receiptHash) &&
      canonicalJson(approval.targetReference) === canonicalJson(targetReference) &&
      canonicalJson(approval.sourceReference) === canonicalJson(sourceReference),
      'RECOMPUTE_MEASUREMENT_REVIEW_NOT_ADMITTED',
      'An exact capability-approved review receipt is required before Measurement publication',
    );

    // This existing owner command alone performs the mutation. It enforces
    // MEASUREMENT_MANAGE, canonical draft state, MDM integrity and
    // expectedVersion; its command ledger makes crash/retry replay safe.
    const published = await measurements.publishCanonicalMeasurementChart(
      request.idempotencyKey, actorId, target.entityId, { expectedVersion },
    );
    invariant(
      published?.id === target.entityId &&
      published?.status === 'published' &&
      published?.version === expectedVersion + 1,
      'RECOMPUTE_MEASUREMENT_PUBLICATION_RESULT_INVALID',
      'Owning Measurement authority did not return the exact new published version',
    );

    return Object.freeze({
      resultReference: Object.freeze({
        authority: 'measurement',
        entityId: published.id,
        version: published.version,
      }),
      evidence: Object.freeze([
        Object.freeze({
          kind: 'accepted_measurement_review',
          reviewerId: approval.reviewerId,
          reviewReceiptHash: approval.receiptHash,
          planHash: request.planHash,
          stepId: request.stepId,
        }),
        Object.freeze({
          kind: 'canonical_measurement_publication',
          authority: 'measurement',
          entityId: published.id,
          previousVersion: expectedVersion,
          resultingVersion: published.version,
          commandId: request.idempotencyKey,
        }),
      ]),
    });
  };
}
