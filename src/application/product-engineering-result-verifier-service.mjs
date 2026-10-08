import crypto from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';

const AUTHORITIES = Object.freeze({
  material: Object.freeze({
    service: 'materials',
    method: 'getForActor',
    unwrap: value => value,
    identity: value => value?.code,
  }),
  measurement: Object.freeze({
    service: 'measurements',
    method: 'getCanonicalForActor',
    unwrap: value => value,
    identity: value => value?.id,
  }),
  tech_pack: Object.freeze({
    service: 'techPacks',
    method: 'getForActor',
    unwrap: value => value,
    identity: value => value?.techPackCode ?? value?.code,
  }),
  product_readiness: Object.freeze({
    service: 'productReadiness',
    method: 'getReadinessForActor',
    unwrap: value => value,
    identity: value => value?.id,
  }),
  commercial_projection: Object.freeze({
    service: 'productReadiness',
    method: 'getCommercialProjectionForActor',
    unwrap: value => value,
    identity: value => value?.id,
  }),
  commercial_publication: Object.freeze({
    service: 'commercialPublication',
    method: 'getCommercialPublicationForActor',
    unwrap: value => value,
    identity: value => value?.id,
  }),
  cost_close: Object.freeze({
    service: 'orderEconomics',
    method: 'getCostCloseForActor',
    unwrap: value => value?.costClose ?? value,
    identity: value => value?.id,
  }),
  sourcing_rfq: Object.freeze({
    service: 'sourcing',
    method: 'rfqGetForActor',
    unwrap: value => value,
    identity: value => value?.rfqCode ?? value?.code ?? value?.id,
  }),
});

/**
 * Independently verifies a human supplied change-impact result reference against
 * the owning read authority. It never mutates downstream state.
 *
 * @param {any} options
 */
export function createProductEngineeringResultVerifier(options = {}) {
  return Object.freeze({
    supportedAuthorities: Object.freeze(Object.keys(AUTHORITIES)),
    async verify(actorId, reference) {
      invariant(typeof actorId === 'string' && actorId.trim(), 'PRODUCT_ENGINEERING_RESULT_VERIFIER_ACTOR_REQUIRED', 'Result verification requires actor id');
      invariant(reference && typeof reference === 'object' && !Array.isArray(reference), 'PRODUCT_ENGINEERING_CHANGE_IMPACT_RESULT_INVALID', 'Result reference is required');
      const authority = reference.authority;
      const definition = AUTHORITIES[authority];
      invariant(definition, 'PRODUCT_ENGINEERING_RESULT_AUTHORITY_UNSUPPORTED', 'Result authority has no independent verifier', { authority, supportedAuthorities: Object.keys(AUTHORITIES) });
      const service = options[definition.service];
      invariant(service && typeof service[definition.method] === 'function', 'PRODUCT_ENGINEERING_RESULT_VERIFIER_UNAVAILABLE', 'Result authority verifier is unavailable', { authority, service: definition.service, method: definition.method });

      const raw = await service[definition.method](actorId, reference.entityId);
      const canonical = definition.unwrap(raw);
      invariant(canonical && typeof canonical === 'object' && !Array.isArray(canonical), 'PRODUCT_ENGINEERING_RESULT_NOT_FOUND', 'Referenced canonical result was not found', { authority, entityId: reference.entityId });
      const actualEntityId = definition.identity(canonical);
      invariant(actualEntityId === reference.entityId, 'PRODUCT_ENGINEERING_RESULT_IDENTITY_MISMATCH', 'Referenced canonical result identity does not match verifier result', { authority, expectedEntityId: reference.entityId, actualEntityId });

      const actualVersion = canonical.version ?? canonical.versionNo ?? canonical.revision ?? null;
      const actualHash = canonical.contentHash ?? canonical.snapshotHash ?? canonical.hash ?? null;
      if (reference.version !== undefined && reference.version !== null) {
        invariant(actualVersion !== null && String(actualVersion) === String(reference.version), 'PRODUCT_ENGINEERING_RESULT_VERSION_MISMATCH', 'Referenced canonical result version does not match current authority result', { authority, entityId: reference.entityId, expectedVersion: reference.version, actualVersion });
      }
      if (reference.contentHash !== undefined && reference.contentHash !== null) {
        invariant(typeof actualHash === 'string' && actualHash === reference.contentHash, 'PRODUCT_ENGINEERING_RESULT_HASH_MISMATCH', 'Referenced canonical result hash does not match current authority result', { authority, entityId: reference.entityId, expectedContentHash: reference.contentHash, actualContentHash: actualHash });
      }
      invariant(
        reference.version !== undefined || reference.contentHash !== undefined,
        'PRODUCT_ENGINEERING_CHANGE_IMPACT_RESULT_INVALID',
        'Result reference requires an exact version or content hash',
      );

      const observed = Object.freeze({
        authority,
        entityId: actualEntityId,
        version: actualVersion === null ? null : String(actualVersion),
        contentHash: typeof actualHash === 'string' ? actualHash : null,
      });
      const proof = {
        verifier: definition.service + '.' + definition.method,
        authority,
        requested: Object.freeze({
          entityId: reference.entityId,
          version: reference.version === undefined || reference.version === null ? null : String(reference.version),
          contentHash: reference.contentHash ?? null,
        }),
        observed,
      };
      return Object.freeze({ ...proof, verificationHash: sha(proof) });
    },
  });
}

/**
 * Enforces verifier-backed closure for policy-required impacts.
 * @param {any} options
 */
export function createProductEngineeringVerifiedImpactClosureService({ productEngineering, resultVerifier } = {}) {
  invariant(productEngineering && typeof productEngineering.closeChangeImpact === 'function' && typeof productEngineering.getChangeImpactForActor === 'function', 'PRODUCT_ENGINEERING_CHANGE_IMPACT_SERVICE_REQUIRED', 'Product Engineering change impact service is required');
  invariant(resultVerifier && typeof resultVerifier.verify === 'function', 'PRODUCT_ENGINEERING_RESULT_VERIFIER_REQUIRED', 'Product Engineering result verifier is required');

  return Object.freeze({
    async closeChangeImpact(commandId, actorId, impactId, input) {
      const impact = await productEngineering.getChangeImpactForActor(actorId, impactId);
      if (impact.status !== 'pending') {
        return productEngineering.closeChangeImpact(commandId, actorId, impactId, input);
      }
      let verification = null;
      if (input?.disposition === 'resolved' && impact.evidenceStatus === 'policy_required') {
        invariant(input.resultReference, 'PRODUCT_ENGINEERING_CHANGE_IMPACT_RESULT_REQUIRED', 'Policy-required resolution requires a canonical result reference');
        verification = await resultVerifier.verify(actorId, input.resultReference);
      } else if (input?.resultReference) {
        verification = await resultVerifier.verify(actorId, input.resultReference);
      }
      return productEngineering.closeChangeImpact(commandId, actorId, impactId, { ...input, verification });
    },
  });
}

function sha(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}
