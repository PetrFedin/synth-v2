import { invariant } from '../../core/errors.mjs';
import { parseIsoDateTime } from '../../core/validation.mjs';
import { assertActiveRelationship } from '../counterparty-relationships/public.mjs';

export function showroomInvitationKey(showroomId, shopId) {
  return `${showroomId}:${shopId}`;
}

export function createShowroomInvitation({ id, showroom, shopId, relationship, expiresAt, createdAt }) {
  invariant(id && showroom?.id && shopId, 'SHOWROOM_INVITATION_IDENTITY_REQUIRED', 'Invitation, showroom and shop are required');
  invariant(showroom.status === 'open', 'SHOWROOM_NOT_OPEN', 'Only an open showroom can be shared');
  assertActiveRelationship(relationship, { brandId: showroom.brandId, shopId });
  const created = parseIsoDateTime(createdAt, { code: 'SHOWROOM_INVITATION_TIMESTAMP_INVALID', label: 'Invitation creation time' });
  const expiry = parseIsoDateTime(expiresAt, { code: 'SHOWROOM_INVITATION_EXPIRY_INVALID', label: 'Invitation expiry' });
  invariant(expiry.timestamp > created.timestamp, 'SHOWROOM_INVITATION_EXPIRY_INVALID', 'Invitation expiry must be in the future');
  return Object.freeze({
    id,
    showroomId: showroom.id,
    collectionId: showroom.collectionId,
    brandId: showroom.brandId,
    shopId,
    relationshipId: relationship.id,
    status: 'pending',
    expiresAt: expiry.value,
    version: 1,
    createdAt: created.value,
    updatedAt: created.value,
    acceptedAt: null,
    declinedAt: null,
    revokedAt: null,
  });
}

export function renewShowroomInvitation(invitation, relationship, expiresAt, updatedAt) {
  const updated = parseIsoDateTime(updatedAt, { code: 'SHOWROOM_INVITATION_TIMESTAMP_INVALID', label: 'Invitation update time' });
  const currentExpiry = parseIsoDateTime(invitation.expiresAt, { code: 'SHOWROOM_INVITATION_EXPIRY_INVALID', label: 'Current invitation expiry' });
  const expired = currentExpiry.timestamp <= updated.timestamp;
  invariant(
    ['declined', 'revoked'].includes(invitation.status) || expired,
    'SHOWROOM_INVITATION_NOT_RENEWABLE',
    'Only declined, revoked or expired invitations can be renewed',
    { status: invitation.status },
  );
  assertActiveRelationship(relationship, { brandId: invitation.brandId, shopId: invitation.shopId });
  const expiry = parseIsoDateTime(expiresAt, { code: 'SHOWROOM_INVITATION_EXPIRY_INVALID', label: 'Invitation expiry' });
  invariant(expiry.timestamp > updated.timestamp, 'SHOWROOM_INVITATION_EXPIRY_INVALID', 'Invitation expiry must be in the future');
  return Object.freeze({
    ...invitation,
    relationshipId: relationship.id,
    status: 'pending',
    expiresAt: expiry.value,
    version: invitation.version + 1,
    updatedAt: updated.value,
    acceptedAt: null,
    declinedAt: null,
    revokedAt: null,
  });
}

export function acceptShowroomInvitation(invitation, actorShopId, updatedAt) {
  invariant(invitation.status === 'pending', 'SHOWROOM_INVITATION_NOT_PENDING', 'Only a pending invitation can be accepted');
  invariant(actorShopId === invitation.shopId, 'SHOWROOM_INVITATION_SHOP_MISMATCH', 'Only the invited shop can accept the invitation');
  const updated = parseIsoDateTime(updatedAt, { code: 'SHOWROOM_INVITATION_TIMESTAMP_INVALID', label: 'Invitation acceptance time' });
  const expiry = parseIsoDateTime(invitation.expiresAt, { code: 'SHOWROOM_INVITATION_EXPIRY_INVALID', label: 'Invitation expiry' });
  invariant(expiry.timestamp > updated.timestamp, 'SHOWROOM_INVITATION_EXPIRED', 'Showroom invitation has expired');
  return Object.freeze({
    ...invitation,
    status: 'accepted',
    acceptedAt: updated.value,
    version: invitation.version + 1,
    updatedAt: updated.value,
  });
}

export function declineShowroomInvitation(invitation, actorShopId, updatedAt) {
  invariant(invitation.status === 'pending', 'SHOWROOM_INVITATION_NOT_PENDING', 'Only a pending invitation can be declined');
  invariant(actorShopId === invitation.shopId, 'SHOWROOM_INVITATION_SHOP_MISMATCH', 'Only the invited shop can decline the invitation');
  const updated = parseIsoDateTime(updatedAt, { code: 'SHOWROOM_INVITATION_TIMESTAMP_INVALID', label: 'Invitation decline time' });
  return Object.freeze({
    ...invitation,
    status: 'declined',
    declinedAt: updated.value,
    version: invitation.version + 1,
    updatedAt: updated.value,
  });
}

export function revokeShowroomInvitation(invitation, actorBrandId, updatedAt) {
  invariant(['pending', 'accepted'].includes(invitation.status), 'SHOWROOM_INVITATION_NOT_REVOCABLE', 'Only pending or accepted invitations can be revoked');
  invariant(actorBrandId === invitation.brandId, 'SHOWROOM_INVITATION_BRAND_MISMATCH', 'Only the showroom brand can revoke the invitation');
  const updated = parseIsoDateTime(updatedAt, { code: 'SHOWROOM_INVITATION_TIMESTAMP_INVALID', label: 'Invitation revocation time' });
  return Object.freeze({
    ...invitation,
    status: 'revoked',
    revokedAt: updated.value,
    version: invitation.version + 1,
    updatedAt: updated.value,
  });
}

export function assertAcceptedShowroomAccess(invitation, { showroomId, brandId, shopId, now }) {
  invariant(invitation, 'SHOWROOM_ACCESS_REQUIRED', 'Accepted showroom invitation is required', { showroomId, shopId });
  invariant(
    invitation.showroomId === showroomId && invitation.brandId === brandId && invitation.shopId === shopId,
    'SHOWROOM_INVITATION_TRADE_MISMATCH',
    'Invitation does not match showroom trade parties',
  );
  invariant(invitation.status === 'accepted', 'SHOWROOM_ACCESS_REQUIRED', 'Accepted showroom invitation is required', {
    showroomId,
    shopId,
    status: invitation.status,
  });
  const current = parseIsoDateTime(now, { code: 'SHOWROOM_INVITATION_TIMESTAMP_INVALID', label: 'Current time' });
  const expiry = parseIsoDateTime(invitation.expiresAt, { code: 'SHOWROOM_INVITATION_EXPIRY_INVALID', label: 'Invitation expiry' });
  invariant(expiry.timestamp > current.timestamp, 'SHOWROOM_INVITATION_EXPIRED', 'Showroom invitation has expired');
  return invitation;
}
