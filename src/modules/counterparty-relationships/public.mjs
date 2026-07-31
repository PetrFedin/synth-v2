import { invariant } from '../../core/errors.mjs';

export function relationshipKey(brandId, shopId) {
  return `${brandId}:${shopId}`;
}

export function createCounterpartyRelationship({ id, brandId, shopId, requestedByOrganisationId, createdAt }) {
  invariant(id && brandId && shopId, 'RELATIONSHIP_IDENTITY_REQUIRED', 'Relationship id, brand and shop are required');
  invariant(brandId !== shopId, 'RELATIONSHIP_PARTIES_MUST_DIFFER', 'Relationship parties must differ');
  invariant(
    requestedByOrganisationId === brandId || requestedByOrganisationId === shopId,
    'RELATIONSHIP_REQUESTER_INVALID',
    'Relationship requester must be one of the trade organisations',
  );
  return Object.freeze({
    id,
    brandId,
    shopId,
    requestedByOrganisationId,
    respondedByOrganisationId: null,
    status: 'pending',
    version: 1,
    createdAt,
    updatedAt: createdAt,
    acceptedAt: null,
    rejectedAt: null,
    revokedAt: null,
  });
}

export function renewCounterpartyRelationship(relationship, requestedByOrganisationId, updatedAt) {
  invariant(['rejected', 'revoked'].includes(relationship.status), 'RELATIONSHIP_NOT_RENEWABLE', 'Only rejected or revoked relationships can be requested again', {
    status: relationship.status,
  });
  invariant(
    requestedByOrganisationId === relationship.brandId || requestedByOrganisationId === relationship.shopId,
    'RELATIONSHIP_REQUESTER_INVALID',
    'Relationship requester must be one of the trade organisations',
  );
  return Object.freeze({
    ...relationship,
    requestedByOrganisationId,
    respondedByOrganisationId: null,
    status: 'pending',
    version: relationship.version + 1,
    updatedAt,
    acceptedAt: null,
    rejectedAt: null,
    revokedAt: null,
  });
}

export function acceptCounterpartyRelationship(relationship, actorOrganisationId, updatedAt) {
  assertPendingResponseActor(relationship, actorOrganisationId);
  return Object.freeze({
    ...relationship,
    status: 'active',
    respondedByOrganisationId: actorOrganisationId,
    acceptedAt: updatedAt,
    version: relationship.version + 1,
    updatedAt,
  });
}

export function rejectCounterpartyRelationship(relationship, actorOrganisationId, updatedAt) {
  assertPendingResponseActor(relationship, actorOrganisationId);
  return Object.freeze({
    ...relationship,
    status: 'rejected',
    respondedByOrganisationId: actorOrganisationId,
    rejectedAt: updatedAt,
    version: relationship.version + 1,
    updatedAt,
  });
}

export function revokeCounterpartyRelationship(relationship, actorOrganisationId, updatedAt) {
  invariant(relationship.status === 'active', 'RELATIONSHIP_NOT_ACTIVE', 'Only an active relationship can be revoked');
  invariant(
    actorOrganisationId === relationship.brandId || actorOrganisationId === relationship.shopId,
    'RELATIONSHIP_ACTOR_INVALID',
    'Relationship actor must be one of the trade organisations',
  );
  return Object.freeze({
    ...relationship,
    status: 'revoked',
    respondedByOrganisationId: actorOrganisationId,
    revokedAt: updatedAt,
    version: relationship.version + 1,
    updatedAt,
  });
}

export function assertActiveRelationship(relationship, { brandId, shopId }) {
  invariant(relationship, 'ACTIVE_RELATIONSHIP_REQUIRED', 'An active counterparty relationship is required', { brandId, shopId });
  invariant(
    relationship.brandId === brandId && relationship.shopId === shopId,
    'RELATIONSHIP_TRADE_MISMATCH',
    'Relationship does not match trade parties',
  );
  invariant(relationship.status === 'active', 'ACTIVE_RELATIONSHIP_REQUIRED', 'An active counterparty relationship is required', {
    brandId,
    shopId,
    status: relationship.status,
  });
  return relationship;
}

function assertPendingResponseActor(relationship, actorOrganisationId) {
  invariant(relationship.status === 'pending', 'RELATIONSHIP_NOT_PENDING', 'Only a pending relationship can be answered');
  invariant(actorOrganisationId !== relationship.requestedByOrganisationId, 'RELATIONSHIP_SELF_RESPONSE_FORBIDDEN', 'Requester cannot answer its own relationship request');
  invariant(
    actorOrganisationId === relationship.brandId || actorOrganisationId === relationship.shopId,
    'RELATIONSHIP_ACTOR_INVALID',
    'Relationship actor must be one of the trade organisations',
  );
}
