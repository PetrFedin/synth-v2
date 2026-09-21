import { randomBytes } from 'node:crypto';
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
 *
 * @param {{ platform?: any, auth?: any, pool?: any }} [options] `auth` and `pool` are optional: with
 *   both, the bootstrap makes sure every actor it grants a role to exists as an identity first.
 */
export async function bootstrapProductionAcceptanceReferences({ platform, auth, pool } = {}) {
  invariant(platform && typeof platform.registerOrganisation === 'function' && typeof platform.grantMembership === 'function', 'PRODUCTION_ACCEPTANCE_PLATFORM_REQUIRED', 'Production platform service is required');

  const refs = PRODUCTION_ACCEPTANCE_REFERENCES;
  await ensureAcceptanceIdentities({ auth, pool, refs });
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

/**
 * Завести личности приёмочных актёров прежде, чем им выдаются роли.
 *
 * Членство называет человека, который может действовать, — это не приглашение, и во всех
 * настоящих путях учётная запись создаётся раньше членства (см. `bootstrap-counterparty-user`).
 * Приёмочный бутстрап был единственным исключением: он выдавал роли, включая `owner`, пяти
 * идентификаторам, для которых пользователей не существовало. Войти под ними было нельзя, но
 * идентификатор оставался свободным — и тот, кто позже завёл бы пользователя с таким же
 * идентификатором, молча получил бы владельца чужой организации.
 *
 * Актёры, которые **не входят** в систему, заводятся сразу отключёнными: идентификатор занят,
 * членство называет существующую личность, а действовать под ней нельзя — ни вход, ни проверка
 * сессии не пропускают ничего, кроме `active`. Пароль случайный и никуда не возвращается:
 * личность существует, входа у неё нет.
 *
 * Тем, кто входит — владельцы бренда и магазина, — учётные записи создаёт сам приёмочный прогон
 * своими почтой и паролем **до** вызова бутстрапа; здесь они уже найдутся и не трогаются.
 *
 * Без `auth` и `pool` шаг пропускается: таков путь тестов с поддельной платформой, у которой нет
 * ни таблицы пользователей, ни внешнего ключа, который она держит.
 */
async function ensureAcceptanceIdentities({ auth, pool, refs }) {
  if (!auth || typeof auth.bootstrapUser !== 'function') return;
  if (!pool || typeof pool.query !== 'function') return;
  for (const actorId of Object.values(refs.actors)) {
    const existing = await pool.query('SELECT id FROM auth_users WHERE id = $1', [actorId]);
    if (existing.rowCount > 0) continue;
    await auth.bootstrapUser({
      id: actorId,
      // Зарезервированный домен верхнего уровня: почта, на которую заведомо нельзя написать.
      email: `${actorId}@acceptance.invalid`,
      password: randomBytes(32).toString('hex'),
      displayName: 'Syntha Acceptance Actor',
      status: 'disabled',
    });
  }
}

function command(name) { return `production-reference:${name}`; }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
