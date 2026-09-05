import { invariant } from '../core/errors.mjs';
import { createMembership } from '../modules/access-control/public.mjs';
import { createOrganisation } from '../modules/organisations/public.mjs';

const PRODUCTION_ACCEPTANCE_CREATED_AT = '2026-08-31T00:00:00.000Z';

export const PRODUCTION_ACCEPTANCE_REFERENCES = deepFreeze({
  systemActorId: 'system',
  brand: { id: 'syntha-acceptance-brand', type: 'brand', name: 'Syntha Acceptance Brand' },
  shop: { id: 'syntha-acceptance-shop', type: 'shop', name: 'Syntha Acceptance Retailer' },
  actors: {
    brandOwner: 'syntha-acceptance-brand-owner',
    brandProduction: 'syntha-acceptance-brand-production',
    brandFinance: 'syntha-acceptance-brand-finance',
    shopOwner: 'syntha-acceptance-shop-owner',
    shopBuyer: 'syntha-acceptance-shop-buyer',
  },
});

/**
 * Idempotently installs only the stable organisations and role memberships that a
 * clean-clone production acceptance run needs. It deliberately does not seed any
 * collection, product, ProductSku, publication, buyer selection, order or physical
 * execution data: those records must be created through their production services
 * by the acceptance scenario itself.
 *
 * The bootstrap payload is intentionally time-stable. Command ids are durable
 * idempotency identities, so a retry must present the exact same command payload;
 * sampling the wall clock here would turn a safe replay into COMMAND_ID_CONFLICT.
 */
export async function bootstrapProductionAcceptanceReferences({ platform } = {}) {
  invariant(platform && typeof platform.registerOrganisation === 'function' && typeof platform.grantMembership === 'function', 'PRODUCTION_ACCEPTANCE_PLATFORM_REQUIRED', 'Production platform service is required');

  const refs = PRODUCTION_ACCEPTANCE_REFERENCES;
  const createdAt = PRODUCTION_ACCEPTANCE_CREATED_AT;
  const brand = createOrganisation(refs.brand);
  const shop = createOrganisation(refs.shop);

  const registeredBrand = await platform.registerOrganisation(
    command('register-brand'),
    refs.systemActorId,
    brand,
  );
  const registeredShop = await platform.registerOrganisation(
    command('register-shop'),
    refs.systemActorId,
    shop,
  );

  const brandOwner = createMembership({
    id: 'syntha-acceptance-membership-brand-owner', organisationId: registeredBrand.id,
    organisationType: registeredBrand.type, userId: refs.actors.brandOwner, role: 'owner', createdAt,
  });
  const shopOwner = createMembership({
    id: 'syntha-acceptance-membership-shop-owner', organisationId: registeredShop.id,
    organisationType: registeredShop.type, userId: refs.actors.shopOwner, role: 'owner', createdAt,
  });

  const grantedBrandOwner = await platform.grantMembership(command('grant-brand-owner'), refs.systemActorId, brandOwner);
  const grantedShopOwner = await platform.grantMembership(command('grant-shop-owner'), refs.systemActorId, shopOwner);

  const brandProduction = createMembership({
    id: 'syntha-acceptance-membership-brand-production', organisationId: registeredBrand.id,
    organisationType: registeredBrand.type, userId: refs.actors.brandProduction, role: 'admin', createdAt,
  });
  const brandFinance = createMembership({
    id: 'syntha-acceptance-membership-brand-finance', organisationId: registeredBrand.id,
    organisationType: registeredBrand.type, userId: refs.actors.brandFinance, role: 'finance', createdAt,
  });
  const shopBuyer = createMembership({
    id: 'syntha-acceptance-membership-shop-buyer', organisationId: registeredShop.id,
    organisationType: registeredShop.type, userId: refs.actors.shopBuyer, role: 'buyer', createdAt,
  });

  const grantedBrandProduction = await platform.grantMembership(command('grant-brand-production'), refs.actors.brandOwner, brandProduction);
  const grantedBrandFinance = await platform.grantMembership(command('grant-brand-finance'), refs.actors.brandOwner, brandFinance);
  const grantedShopBuyer = await platform.grantMembership(command('grant-shop-buyer'), refs.actors.shopOwner, shopBuyer);

  return deepFreeze({
    systemActorId: refs.systemActorId,
    brand: registeredBrand,
    shop: registeredShop,
    actors: { ...refs.actors },
    memberships: {
      brandOwner: grantedBrandOwner,
      brandProduction: grantedBrandProduction,
      brandFinance: grantedBrandFinance,
      shopOwner: grantedShopOwner,
      shopBuyer: grantedShopBuyer,
    },
  });
}

function command(name) { return `production-reference:${name}`; }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
