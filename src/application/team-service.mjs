import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { DomainError, invariant, requireEntity } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { hashPassword } from '../auth/passwords.mjs';
import { normalizeEmail } from './auth-service.mjs';
import { ALLOWED_ROLES, CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  assertExpectedMembershipVersion,
  assertMayManageMember,
  changeMembershipRole,
  deactivateMembership,
  inviteMembership,
  reactivateMembership,
} from '../modules/team-membership/public.mjs';

const INVITE_PREFIX = 'swv2i_';
const INVITE_TOKEN_BYTES = 32;
const INVITE_TOKEN_PATTERN = /^swv2i_[A-Za-z0-9_-]{43}$/;
// Заглушка вместо хеша пароля у приглашённого, который его ещё не задал. Проверка пароля отвергает
// всё, что не похоже на настоящий хеш, а вход пускает только `active`, так что под такой записью
// не войти двумя независимыми способами.
const NO_PASSWORD_YET = 'invited-no-password-yet';
const DISPLAY_NAME_MAX = 160;

/**
 * Сотрудники организации: пригласить, сменить роль, отключить, включить, принять приглашение.
 *
 * Всё, что меняет состав, идёт одной транзакцией хранилища вместе с журналом команд и очередью
 * событий: статус членства, статус учётной записи, отзыв сессий и событие аудита либо есть вместе,
 * либо нет совсем.
 * @param {Record<string, any>} [options]
 */
export function createTeamService({
  store,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
  randomBytesImpl = randomBytes,
  inviteTtlMs = 72 * 60 * 60 * 1000,
} = {}) {
  invariant(store && typeof store.transaction === 'function', 'TEAM_STORE_REQUIRED', 'Team store is required');
  invariant(Number.isInteger(inviteTtlMs) && inviteTtlMs >= 60_000, 'TEAM_INVITE_TTL_INVALID', 'Invitation lifetime must be at least one minute');

  function execute(commandId, actorId, operation, input, prepare, action) {
    invariant(typeof commandId === 'string' && commandId.trim(), 'COMMAND_ID_REQUIRED', 'Every team mutation requires commandId');
    invariant(typeof actorId === 'string' && actorId.trim(), 'TEAM_ACTOR_REQUIRED', 'Actor id is required');
    // В отпечаток идёт хеш тела, а не само тело: там email приглашаемого, а журнал команд живёт дольше нужного.
    const fingerprint = `${operation}:${actorId}:${createHash('sha256').update(canonicalJson(input ?? {})).digest('hex')}`;
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const context = await prepare(tx);
      if (previous) return { ...previous.result, __replayed: true };
      const result = await action(tx, context);
      // В журнал команд уходит результат **без секрета**: токен приглашения показывается один раз и
      // нигде не хранится открытым, в том числе в ответе, который повторяется по ключу идемпотентности.
      const { secret, ...stored } = result;
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result: stored, completedAt: now() }));
      return result;
    }).then(present);
  }

  // Ответ отдаёт токен, если он есть; повтор по тому же ключу отдаёт то же без токена.
  function present(result) {
    const { secret, __replayed, ...visible } = result;
    if (!secret) return Object.freeze(visible);
    return Object.freeze({ ...visible, invite: Object.freeze({ ...visible.invite, token: secret.token }) });
  }

  function now() {
    const value = clock();
    invariant(typeof value === 'string' && !Number.isNaN(Date.parse(value)), 'TEAM_CLOCK_INVALID', 'Clock must return an ISO-compatible timestamp');
    return new Date(Date.parse(value)).toISOString();
  }

  async function authorize(tx, organisationId, actorId, { lock = true } = {}) {
    invariant(typeof organisationId === 'string' && organisationId, 'TEAM_ORGANISATION_REQUIRED', 'Organisation id is required');
    if (lock) await tx.lockOrganisation(organisationId);
    const membership = await tx.getMembership(organisationId, actorId, { forUpdate: lock });
    assertCapability(membership, CAPABILITIES.MEMBERSHIP_MANAGE);
    return membership;
  }

  async function loadTarget(tx, organisationId, userId) {
    invariant(typeof userId === 'string' && userId, 'TEAM_USER_REQUIRED', 'User id is required');
    return requireEntity(await tx.getMembership(organisationId, userId), 'TEAM_MEMBER_NOT_FOUND', { organisationId, userId });
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({ id: nextId('event'), type, aggregateId, occurredAt: now(), payload, metadata: { commandId, actorId } }));
  }

  async function issueInvite(tx, { userId, organisationId, actorId }) {
    await tx.revokeOpenCredentialTokens(userId, organisationId, now());
    const token = `${INVITE_PREFIX}${randomBuffer(randomBytesImpl, INVITE_TOKEN_BYTES).toString('base64url')}`;
    invariant(INVITE_TOKEN_PATTERN.test(token), 'AUTH_RANDOM_SOURCE_INVALID', 'Secure random byte generator produced an invalid invitation token');
    const createdAt = now();
    const expiresAt = new Date(Date.parse(createdAt) + inviteTtlMs).toISOString();
    await tx.insertCredentialToken(Object.freeze({
      id: nextId('credential-token'), userId, organisationId, purpose: 'invite', tokenHash: hashToken(token),
      createdBy: actorId, createdAt, expiresAt, consumedAt: null, revokedAt: null,
    }));
    return Object.freeze({ token, expiresAt });
  }

  return Object.freeze({
    /**
     * Пригласить человека в организацию с ролью.
     *
     * Если учётной записи с таким email нет, она создаётся без пароля (`invited`) и выдаётся
     * одноразовый токен: человек задаёт пароль сам. Если запись уже есть и активна, ей добавляется
     * членство — токен не нужен.
     */
    invite(commandId, actorId, organisationId, input) {
      return execute(commandId, actorId, `invite:${organisationId}`, input,
        (tx) => authorize(tx, organisationId, actorId),
        async (tx, actor) => {
          const emailNormalized = normalizeEmail(input?.email);
          const displayName = normaliseDisplayName(input?.displayName);
          const organisation = requireEntity(await tx.getOrganisation(organisationId), 'ORG_NOT_FOUND', { organisationId });
          const createdAt = now();
          let user = await tx.getUserByEmail(emailNormalized);
          let accountCreated = false;
          if (user) {
            invariant(!await tx.getMembership(organisationId, user.id), 'TEAM_MEMBER_ALREADY_EXISTS', 'This person already has a membership in the organisation', { organisationId });
            // Чужую запись в ожидании приглашения брать нельзя: токен задал бы пароль тому, кто
            // пригласил, а не тому, кого пригласили. Отключённую — тоже: её отключили не ради этой организации.
            invariant(user.status === 'active', 'TEAM_ACCOUNT_NOT_ACTIVE', 'This account cannot be invited right now');
          } else {
            user = Object.freeze({
              id: nextId('user'), email: input.email.trim(), emailNormalized, displayName, passwordHash: NO_PASSWORD_YET,
              status: 'invited', createdAt, updatedAt: createdAt,
            });
            await tx.insertUser(user);
            accountCreated = true;
          }
          invariant(!await tx.getMembership(organisationId, user.id), 'TEAM_MEMBER_ALREADY_EXISTS', 'This person already has a membership in the organisation', { organisationId });
          const membership = inviteMembership({
            actor, organisationType: organisation.type, id: nextId('membership'), organisationId, userId: user.id, role: input?.role, createdAt,
          });
          await tx.insertMembership(membership);
          const issued = accountCreated ? await issueInvite(tx, { userId: user.id, organisationId, actorId }) : null;
          await append(tx, 'membership.invited', membership.id, { organisationId, userId: user.id, role: membership.role, version: membership.version, accountCreated }, commandId, actorId);
          return Object.freeze({
            member: memberView(membership, user, issued?.expiresAt ?? null),
            invite: Object.freeze({ issued: Boolean(issued), expiresAt: issued?.expiresAt ?? null }),
            ...(issued ? { secret: { token: issued.token } } : {}),
          });
        });
    },

    changeRole(commandId, actorId, organisationId, userId, input) {
      return execute(commandId, actorId, `changeRole:${organisationId}:${userId}`, input,
        (tx) => authorize(tx, organisationId, actorId),
        async (tx, actor) => {
          const target = await loadTarget(tx, organisationId, userId);
          assertExpectedMembershipVersion(target, input?.expectedVersion);
          const next = changeMembershipRole({ actor, target, role: input?.role, activeOwnerCount: await tx.countActiveOwners(organisationId), updatedAt: now() });
          await tx.saveMembership(next, input.expectedVersion);
          await append(tx, 'membership.role-changed', next.id, { organisationId, userId, previousRole: target.role, role: next.role, version: next.version }, commandId, actorId);
          return Object.freeze({ member: memberView(next, await tx.getUser(userId), null), invite: Object.freeze({ issued: false, expiresAt: null }) });
        });
    },

    /**
     * Отключить: членство становится `inactive`, ничего не удаляется.
     *
     * Если других действующих членств у человека нет, отзываются все его сессии и отключается сама
     * учётная запись — иначе он продолжал бы работать с уже выданным токеном. Если члество ещё есть,
     * сессии остаются: они нужны для другой организации, а права в этой проверяются по статусу членства
     * при каждом запросе.
     */
    deactivate(commandId, actorId, organisationId, userId, input) {
      return execute(commandId, actorId, `deactivate:${organisationId}:${userId}`, input,
        (tx) => authorize(tx, organisationId, actorId),
        async (tx, actor) => {
          const target = await loadTarget(tx, organisationId, userId);
          assertExpectedMembershipVersion(target, input?.expectedVersion);
          const at = now();
          const next = deactivateMembership({ actor, target, activeOwnerCount: await tx.countActiveOwners(organisationId), updatedAt: at });
          await tx.saveMembership(next, input.expectedVersion);
          await tx.revokeOpenCredentialTokens(userId, organisationId, at);
          let sessionsRevoked = 0;
          let accountDisabled = false;
          let user = await tx.getUserForUpdate(userId);
          if (await tx.countActiveMembershipsForUser(userId) === 0) {
            sessionsRevoked = await tx.revokeSessionsForUser(userId, at);
            if (user?.status === 'active') {
              user = Object.freeze({ ...user, status: 'disabled', updatedAt: at });
              await tx.saveUser(user);
              accountDisabled = true;
            }
          }
          await append(tx, 'membership.deactivated', next.id, { organisationId, userId, role: next.role, version: next.version, sessionsRevoked, accountDisabled }, commandId, actorId);
          return Object.freeze({ member: memberView(next, user, null), invite: Object.freeze({ issued: false, expiresAt: null }) });
        });
    },

    /** Включить обратно. Роль возвращается прежняя; изменить её можно отдельным действием. */
    reactivate(commandId, actorId, organisationId, userId, input) {
      return execute(commandId, actorId, `reactivate:${organisationId}:${userId}`, input,
        (tx) => authorize(tx, organisationId, actorId),
        async (tx, actor) => {
          const target = await loadTarget(tx, organisationId, userId);
          assertExpectedMembershipVersion(target, input?.expectedVersion);
          const at = now();
          const next = reactivateMembership({ actor, target, updatedAt: at });
          await tx.saveMembership(next, input.expectedVersion);
          let user = await tx.getUserForUpdate(userId);
          let accountEnabled = false;
          let issued = null;
          if (user?.status === 'disabled') {
            user = Object.freeze({ ...user, status: 'active', updatedAt: at });
            await tx.saveUser(user);
            accountEnabled = true;
          } else if (user?.status === 'invited') {
            // Человек так и не задал пароль: прежний токен отозван при отключении, нужен новый.
            issued = await issueInvite(tx, { userId, organisationId, actorId });
          }
          await append(tx, 'membership.reactivated', next.id, { organisationId, userId, role: next.role, version: next.version, accountEnabled }, commandId, actorId);
          return Object.freeze({
            member: memberView(next, user, issued?.expiresAt ?? null),
            invite: Object.freeze({ issued: Boolean(issued), expiresAt: issued?.expiresAt ?? null }),
            ...(issued ? { secret: { token: issued.token } } : {}),
          });
        });
    },

    /** Новый токен тому, кто потерял приглашение. Прежние токены перестают действовать. */
    reissueInvite(commandId, actorId, organisationId, userId, input) {
      return execute(commandId, actorId, `reissueInvite:${organisationId}:${userId}`, input,
        (tx) => authorize(tx, organisationId, actorId),
        async (tx, actor) => {
          const target = await loadTarget(tx, organisationId, userId);
          assertExpectedMembershipVersion(target, input?.expectedVersion);
          assertMayManageMember({ actor, target });
          const user = await tx.getUserForUpdate(userId);
          invariant(target.status === 'active' && user?.status === 'invited', 'TEAM_INVITE_NOT_PENDING', 'This member has no pending invitation');
          const issued = await issueInvite(tx, { userId, organisationId, actorId });
          await append(tx, 'membership.invite-reissued', target.id, { organisationId, userId, version: target.version }, commandId, actorId);
          return Object.freeze({
            member: memberView(target, user, issued.expiresAt),
            invite: Object.freeze({ issued: true, expiresAt: issued.expiresAt }),
            secret: { token: issued.token },
          });
        });
    },

    /**
     * Принять приглашение: задать пароль по одноразовому токену. Анонимная операция — человек ещё не
     * может войти. Любая причина отказа (нет токена, просрочен, уже использован, отозван, членство
     * отключено) отвечает одним и тем же кодом, чтобы токен нельзя было «ощупывать».
     */
    async acceptInvite(/** @type {{ token?: any, password?: any }} */ { token, password } = {}) {
      invariant(typeof token === 'string' && INVITE_TOKEN_PATTERN.test(token), 'AUTH_INVITE_TOKEN_INVALID', 'Invitation is invalid or expired');
      // Пароль хешируется до транзакции: scrypt долгий, а держать ради него блокировки незачем.
      const passwordHash = await hashPassword(password, { randomBytesImpl });
      return store.transaction(async (tx) => {
        const at = now();
        const stored = await tx.getCredentialTokenByHash(hashToken(token));
        const usable = stored && stored.purpose === 'invite' && !stored.consumedAt && !stored.revokedAt && Date.parse(stored.expiresAt) > Date.parse(at);
        invariant(usable, 'AUTH_INVITE_TOKEN_INVALID', 'Invitation is invalid or expired');
        const membership = await tx.getMembership(stored.organisationId, stored.userId);
        const user = await tx.getUserForUpdate(stored.userId);
        invariant(membership?.status === 'active' && user?.status === 'invited', 'AUTH_INVITE_TOKEN_INVALID', 'Invitation is invalid or expired');
        await tx.saveUser(Object.freeze({ ...user, passwordHash, status: 'active', updatedAt: at }));
        await tx.consumeCredentialToken(stored, at);
        await tx.appendOutbox(domainEvent({
          id: nextId('event'), type: 'membership.invite-accepted', aggregateId: membership.id, occurredAt: at,
          payload: { organisationId: membership.organisationId, userId: user.id, role: membership.role }, metadata: { actorId: user.id },
        }));
        return Object.freeze({ userId: user.id, email: user.email, organisationId: membership.organisationId });
      });
    },

    /** Состав организации со всеми статусами — для того, кто им управляет. */
    async listForActor(actorId, organisationId) {
      invariant(typeof actorId === 'string' && actorId.trim(), 'TEAM_ACTOR_REQUIRED', 'Actor id is required');
      return store.transaction(async (tx) => {
        const actor = await authorize(tx, organisationId, actorId, { lock: false });
        const organisation = requireEntity(await tx.getOrganisation(organisationId), 'ORG_NOT_FOUND', { organisationId });
        const expiries = new Map((await tx.listOpenCredentialTokens(organisationId)).map((token) => [token.userId, token.expiresAt]));
        const members = [];
        for (const membership of await tx.listMembershipsByOrganisation(organisationId)) {
          members.push(memberView(membership, await tx.getUser(membership.userId), expiries.get(membership.userId) ?? null));
        }
        members.sort((left, right) => String(left.displayName || left.email || left.userId).localeCompare(String(right.displayName || right.email || right.userId)));
        return Object.freeze({
          items: Object.freeze(members),
          actor: Object.freeze({ userId: actor.userId, role: actor.role }),
          assignableRoles: Object.freeze(ALLOWED_ROLES[organisation.type].filter((role) => role !== 'owner' || actor.role === 'owner')),
        });
      });
    },
  });
}

function memberView(membership, user, inviteExpiresAt) {
  return Object.freeze({
    membershipId: membership.id,
    userId: membership.userId,
    role: membership.role,
    status: membership.status,
    version: Number.isInteger(membership.version) ? membership.version : 1,
    displayName: user?.displayName || null,
    email: user?.email ?? null,
    accountStatus: user?.status ?? null,
    invitePending: user?.status === 'invited',
    inviteExpiresAt: user?.status === 'invited' ? inviteExpiresAt : null,
    updatedAt: membership.updatedAt ?? membership.createdAt ?? null,
  });
}

function normaliseDisplayName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  invariant(name.length <= DISPLAY_NAME_MAX, 'TEAM_DISPLAY_NAME_INVALID', `Display name must not exceed ${DISPLAY_NAME_MAX} characters`);
  return name;
}

function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }

function randomBuffer(randomBytesImpl, length) {
  let value;
  try { value = randomBytesImpl(length); }
  catch { throw new DomainError('AUTH_RANDOM_SOURCE_INVALID', 'Secure random byte generator failed'); }
  invariant(value instanceof Uint8Array && value.byteLength === length, 'AUTH_RANDOM_SOURCE_INVALID', `Secure random byte generator must return exactly ${length} bytes`);
  return Buffer.from(value);
}

function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
