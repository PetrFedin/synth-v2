import { invariant } from '../../core/errors.mjs';

// Access to the supplier portal. A grant names one person at one supplier, and it is the only reason
// an account outside the brand is shown anything the brand owns.
//
// Two things are deliberately not modelled here. There is no supplier "account" that owns several
// people, because a grant is revoked one person at a time and a factory changes staff more often than
// it changes name. And there is no expiry, because an access that quietly stops working looks exactly
// like a portal that is broken; access ends when someone ends it, and the record says who.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createSupplierPortalGrant({ id, supplier, account, contactName, grantedBy, granterMembership, grantedAt }) {
  invariant(id && supplier?.supplierCode, 'SUPPLIER_PORTAL_IDENTITY_REQUIRED', 'Grant id and supplier are required');
  invariant(supplier.status === 'qualified', 'SUPPLIER_PORTAL_SUPPLIER_NOT_QUALIFIED',
    'Portal access belongs to a qualified supplier', { supplierCode: supplier.supplierCode, status: supplier.status });
  // The account is resolved before this point: a grant names a user id, because that is what every
  // other relation in the platform is keyed by and what the separation rule has to be checked against.
  invariant(account && typeof account.id === 'string' && account.id.trim() && typeof account.email === 'string' && EMAIL.test(account.email.trim()),
    'SUPPLIER_PORTAL_USER_INVALID', 'Portal access needs a person with an account');
  // The granter must belong to the brand that owns the supplier. Deciding who may read a brand's
  // requests is a decision about the brand's own data.
  invariant(granterMembership?.organisationId === supplier.brandId && granterMembership.status === 'active',
    'SUPPLIER_PORTAL_GRANTER_NOT_MEMBER', 'Portal access is granted by an active member of the supplier\'s brand',
    { brandId: supplier.brandId });
  invariant(typeof grantedBy === 'string' && grantedBy.trim(), 'SUPPLIER_PORTAL_ACTOR_REQUIRED', 'Granting actor is required');
  invariant(typeof grantedAt === 'string' && !Number.isNaN(Date.parse(grantedAt)), 'SUPPLIER_PORTAL_TIMESTAMP_INVALID', 'Grant timestamp is invalid');
  const holder = account.id.trim();
  // The person who awards the business cannot also be the person who answers as the supplier. The
  // database enforces this too; stating it here means a caller is told why, not just that it failed.
  invariant(holder !== grantedBy.trim(), 'SUPPLIER_PORTAL_HOLDER_IS_GRANTER',
    'Portal access cannot be granted to yourself', { userId: holder });
  const name = typeof contactName === 'string' ? contactName.trim() : '';
  invariant(name.length <= 160, 'SUPPLIER_PORTAL_CONTACT_INVALID', 'Contact name is too long');
  return Object.freeze({
    id,
    brandId: supplier.brandId,
    supplierCode: supplier.supplierCode,
    userId: holder,
    invitedEmail: account.email.trim().toLowerCase(),
    contactName: name || account.email.trim(),
    status: 'active',
    grantedBy: grantedBy.trim(),
    grantedAt,
    revokedBy: null,
    revokedAt: null,
    version: 1,
  });
}

export function revokeSupplierPortalGrant(grant, { revokedBy, revokedAt }) {
  invariant(grant?.status === 'active', 'SUPPLIER_PORTAL_GRANT_NOT_ACTIVE', 'Only an active grant can be revoked', { status: grant?.status });
  invariant(typeof revokedBy === 'string' && revokedBy.trim(), 'SUPPLIER_PORTAL_ACTOR_REQUIRED', 'Revoking actor is required');
  invariant(typeof revokedAt === 'string' && !Number.isNaN(Date.parse(revokedAt)), 'SUPPLIER_PORTAL_TIMESTAMP_INVALID', 'Revocation timestamp is invalid');
  return Object.freeze({ ...grant, status: 'revoked', revokedBy: revokedBy.trim(), revokedAt, version: grant.version + 1 });
}

// What the portal lets a supplier do with a request, given the state the brand has put it in. The
// portal never invents an action the brand's own screen would not allow.
export function supplierPortalActions(rfq) {
  const status = rfq?.supplierStatus;
  if (status === 'awaiting_quote') return Object.freeze(['quote']);
  if (status === 'quote_submitted') return Object.freeze(['quote']);
  return Object.freeze([]);
}
