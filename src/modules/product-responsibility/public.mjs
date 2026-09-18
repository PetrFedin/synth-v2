import { invariant } from '../../core/errors.mjs';

// Who answers for a style. A fashion product moves through several desks, and every register in the
// industry is read by asking "which of these are mine" -- so responsibility is modelled as its own
// relation, filterable like any other attribute, rather than buried in a free-text field.

export const PRODUCT_ROLES = Object.freeze([
  'designer',
  'product_manager',
  'buyer',
  'fabric_manager',
  'technologist',
]);

const roles = new Set(PRODUCT_ROLES);

export function createProductResponsibility({ id, style, role, userId, membership, assignedAt, assignedBy }) {
  invariant(id && style?.id, 'PRODUCT_RESPONSIBILITY_IDENTITY_REQUIRED', 'Responsibility id and style are required');
  invariant(roles.has(role), 'PRODUCT_RESPONSIBILITY_ROLE_INVALID', 'Unknown product role', { role, allowed: PRODUCT_ROLES });
  invariant(typeof userId === 'string' && userId.trim(), 'PRODUCT_RESPONSIBILITY_USER_REQUIRED', 'A responsibility needs a person');
  // Responsibility for a style cannot be handed to someone outside the brand that owns it: the brand
  // is the unit of access, and a technologist from another company has no standing on this product.
  invariant(membership?.organisationId === style.brandId, 'PRODUCT_RESPONSIBILITY_NOT_A_MEMBER',
    'The assigned person must be a member of the brand that owns the style', { brandId: style.brandId });
  invariant(membership.status === 'active', 'PRODUCT_RESPONSIBILITY_MEMBERSHIP_INACTIVE',
    'The assigned person must have an active membership', { userId });
  invariant(typeof assignedBy === 'string' && assignedBy.trim(), 'PRODUCT_RESPONSIBILITY_ACTOR_REQUIRED', 'Assignment actor is required');
  invariant(typeof assignedAt === 'string' && !Number.isNaN(Date.parse(assignedAt)), 'PRODUCT_RESPONSIBILITY_TIMESTAMP_INVALID', 'Assignment timestamp is invalid');
  return Object.freeze({
    id,
    styleId: style.id,
    brandId: style.brandId,
    role,
    userId: userId.trim(),
    assignedAt,
    assignedBy,
  });
}
