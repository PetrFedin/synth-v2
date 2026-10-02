import { invariant } from '../../core/errors.mjs';
import { ALLOWED_ROLES, capabilitiesForRole, createMembership } from '../access-control/public.mjs';

// Жизненный цикл сотрудника внутри организации: пригласить, сменить роль, отключить, включить.
//
// Это правила, а не хранение. Здесь нет ни базы, ни времени, ни паролей: функция получает
// членство того, кто действует, членство того, над кем действуют, и число активных владельцев, а
// возвращает новое членство или отказывает с кодом. Так каждое правило проверяется без сервера и
// одинаково работает на памяти и на PostgreSQL.
//
// Отключение — это статус, а не удаление: за членством стоят ответственные на моделях, подписи в
// журнале и история событий, и стереть человека значило бы переписать прошлое.

export const MEMBERSHIP_STATUS = Object.freeze({ ACTIVE: 'active', INACTIVE: 'inactive' });

// Ранг нужен для одного вопроса: «понижает ли эта смена роли права». Владелец и администратор
// имеют один и тот же набор способностей, а различаются тем, что владелец — последняя инстанция,
// поэтому сравнивать способности нельзя, а ранг нужен.
const ROLE_RANK = Object.freeze({ owner: 3, admin: 2 });
function rank(role) { return ROLE_RANK[role] ?? 1; }

export function membershipVersion(membership) { return Number.isInteger(membership?.version) ? membership.version : 1; }

export function assertExpectedMembershipVersion(membership, expectedVersion) {
  invariant(Number.isInteger(expectedVersion) && expectedVersion > 0, 'TEAM_EXPECTED_VERSION_INVALID', 'Expected version must be a positive integer');
  invariant(membershipVersion(membership) === expectedVersion, 'TEAM_MEMBERSHIP_CONCURRENCY_CONFLICT', 'Membership changed since it was read', {
    currentVersion: membershipVersion(membership), expectedVersion,
  });
}

function assertRoleForOrganisation(organisationType, role) {
  invariant(ALLOWED_ROLES[organisationType]?.includes(role), 'MEMBERSHIP_ROLE_INVALID', 'Role is not valid for organisation type', { organisationType, role });
}

// Владельца назначает и трогает только владелец. Иначе администратор, у которого по таблице ролей
// те же способности, мог бы сделать владельцем себя — или убрать настоящего.
function assertMayHandleRole(actor, role) {
  invariant(role !== 'owner' || actor.role === 'owner', 'TEAM_OWNER_ROLE_RESERVED', 'Only an owner can grant or take away the owner role', { role });
}

function assertNotSelf(actor, target, code, message) {
  invariant(actor.userId !== target.userId, code, message);
}

/** Новое членство приглашённого. Активно сразу: войти под ним до принятия приглашения нельзя, пока учётная запись не `active`. */
export function inviteMembership({ actor, organisationType, id, organisationId, userId, role, createdAt }) {
  assertRoleForOrganisation(organisationType, role);
  assertMayHandleRole(actor, role);
  return Object.freeze({
    ...createMembership({ id, organisationId, organisationType, userId, role, createdAt }),
    version: 1,
    updatedAt: createdAt,
    updatedBy: actor.userId,
  });
}

/**
 * Смена роли.
 *
 * Самому себе роль можно только **понизить**: иначе администратор, которому владелец не дал бы
 * владельца, получал бы его одним запросом к собственному членству.
 */
export function changeMembershipRole({ actor, target, role, activeOwnerCount, updatedAt }) {
  invariant(target.status === MEMBERSHIP_STATUS.ACTIVE, 'TEAM_MEMBERSHIP_NOT_ACTIVE', 'Only an active membership can change role', { status: target.status });
  assertRoleForOrganisation(target.organisationType, role);
  invariant(role !== target.role, 'TEAM_ROLE_UNCHANGED', 'Member already holds this role', { role });
  assertMayHandleRole(actor, role);
  assertMayHandleRole(actor, target.role);
  if (actor.userId === target.userId) {
    invariant(isDemotion(target.role, role), 'TEAM_SELF_ROLE_ESCALATION', 'A member cannot raise or sideways-change their own role', { from: target.role, to: role });
  }
  if (target.role === 'owner' && role !== 'owner') assertOwnerRemains(activeOwnerCount);
  return Object.freeze({ ...target, role, version: membershipVersion(target) + 1, updatedAt, updatedBy: actor.userId });
}

export function deactivateMembership({ actor, target, activeOwnerCount, updatedAt }) {
  invariant(target.status === MEMBERSHIP_STATUS.ACTIVE, 'TEAM_MEMBERSHIP_NOT_ACTIVE', 'Membership is already disabled', { status: target.status });
  assertNotSelf(actor, target, 'TEAM_SELF_DEACTIVATION', 'A member cannot disable their own membership');
  assertMayHandleRole(actor, target.role);
  if (target.role === 'owner') assertOwnerRemains(activeOwnerCount);
  return Object.freeze({ ...target, status: MEMBERSHIP_STATUS.INACTIVE, version: membershipVersion(target) + 1, updatedAt, updatedBy: actor.userId });
}

export function reactivateMembership({ actor, target, updatedAt }) {
  invariant(target.status === MEMBERSHIP_STATUS.INACTIVE, 'TEAM_MEMBERSHIP_NOT_INACTIVE', 'Only a disabled membership can be enabled again', { status: target.status });
  assertMayHandleRole(actor, target.role);
  return Object.freeze({ ...target, status: MEMBERSHIP_STATUS.ACTIVE, version: membershipVersion(target) + 1, updatedAt, updatedBy: actor.userId });
}

function isDemotion(from, to) {
  if (rank(to) < rank(from)) return true;
  if (rank(to) > rank(from)) return false;
  // Роли одного ранга сравниваются по способностям: переход вбок — не понижение, даже если
  // способностей «почти столько же».
  const before = new Set(capabilitiesForRole(from));
  const after = capabilitiesForRole(to);
  return after.length < before.size && after.every((capability) => before.has(capability));
}

function assertOwnerRemains(activeOwnerCount) {
  invariant(Number.isInteger(activeOwnerCount) && activeOwnerCount > 1, 'TEAM_LAST_OWNER', 'The organisation must keep at least one active owner');
}

/** Может ли действующий вообще распоряжаться этим членством (без смены чего-либо): нужно там, где меняется не само членство, а то, что к нему привязано. */
export function assertMayManageMember({ actor, target }) { assertMayHandleRole(actor, target.role); }
