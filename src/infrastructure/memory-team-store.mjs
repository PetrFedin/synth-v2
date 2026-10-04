import { invariant } from '../core/errors.mjs';
import { cloneAuthState, emptyAuthState, memoryAuthView } from './memory-auth-store.mjs';

// Хранилище жизненного цикла сотрудников на памяти.
//
// Учётные записи, сессии и членства живут в **одном** состоянии: отключение сотрудника отзывает
// его сессии в той же транзакции, что и меняет членство, и проверить это можно, только если оба
// видят одни и те же данные. Службе входа тот же объект отдаётся как её хранилище — поэтому
// `authenticate` после отключения видит отозванную сессию так же, как увидел бы PostgreSQL.
export function createMemoryTeamStore({ organisations = [] } = {}) {
  let state = {
    ...emptyAuthState(),
    organisations: new Map(organisations.map((organisation) => [organisation.id, organisation])),
    memberships: new Map(),
    tokens: new Map(),
    tokenHashes: new Map(),
    commands: new Map(),
    outbox: [],
  };
  return Object.freeze({
    async transaction(work) {
      const draft = cloneState(state);
      const result = await work(view(draft));
      state = draft;
      return result;
    },
    snapshot() {
      return Object.freeze({
        users: [...state.users.values()],
        sessions: [...state.sessions.values()],
        memberships: [...state.memberships.values()],
        tokens: [...state.tokens.values()],
        outbox: [...state.outbox],
        commands: [...state.commands.values()],
      });
    },
    // Фикстура: тесты заводят организацию и первого владельца напрямую, как это делает бутстрап.
    seedOrganisation(organisation) { state.organisations.set(organisation.id, organisation); },
    seedMembership(membership) { state.memberships.set(key(membership.organisationId, membership.userId), Object.freeze({ version: 1, ...membership })); },
    seedUser(user) { state.users.set(user.id, Object.freeze(user)); state.emails.set(user.emailNormalized, user.id); },
  });
}

function key(organisationId, userId) { return `${organisationId}:${userId}`; }

function cloneState(state) {
  return {
    ...cloneAuthState(state),
    organisations: new Map(state.organisations),
    memberships: new Map(state.memberships),
    tokens: new Map(state.tokens),
    tokenHashes: new Map(state.tokenHashes),
    commands: new Map(state.commands),
    outbox: [...state.outbox],
  };
}

function view(s) {
  return Object.freeze({
    ...memoryAuthView(s),
    getOrganisation: async (id) => s.organisations.get(id),
    lockOrganisation: async () => undefined,

    getMembership: async (organisationId, userId) => s.memberships.get(key(organisationId, userId)),
    listMembershipsByOrganisation: async (organisationId) => [...s.memberships.values()].filter((item) => item.organisationId === organisationId),
    // Считаются только владельцы, которые могут войти: членство и учётная запись активны.
    countActiveOwners: async (organisationId) => [...s.memberships.values()].filter((item) => item.organisationId === organisationId && item.role === 'owner' && item.status === 'active' && s.users.get(item.userId)?.status === 'active').length,
    countActiveMembershipsForUser: async (userId) => [...s.memberships.values()].filter((item) => item.userId === userId && item.status === 'active').length,
    insertMembership: async (membership) => {
      invariant(!s.memberships.has(key(membership.organisationId, membership.userId)), 'TEAM_MEMBER_ALREADY_EXISTS', 'This person already has a membership in the organisation');
      s.memberships.set(key(membership.organisationId, membership.userId), membership);
    },
    saveMembership: async (membership, expectedVersion) => {
      const current = s.memberships.get(key(membership.organisationId, membership.userId));
      invariant(current && (current.version ?? 1) === expectedVersion && membership.version === expectedVersion + 1, 'TEAM_MEMBERSHIP_CONCURRENCY_CONFLICT', 'Membership changed since it was read', { expectedVersion });
      s.memberships.set(key(membership.organisationId, membership.userId), membership);
    },

    getUserForUpdate: async (id) => s.users.get(id),
    saveUser: async (user) => {
      invariant(s.users.has(user.id), 'AUTH_USER_NOT_FOUND', 'User not found');
      s.users.set(user.id, user);
    },
    revokeSessionsForUser: async (userId, revokedAt) => {
      let revoked = 0;
      for (const [id, session] of s.sessions) {
        if (session.userId === userId && session.status === 'active') { s.sessions.set(id, Object.freeze({ ...session, status: 'revoked', revokedAt })); revoked += 1; }
      }
      return revoked;
    },

    insertCredentialToken: async (token) => {
      s.tokens.set(token.id, token);
      s.tokenHashes.set(token.tokenHash, token.id);
    },
    getCredentialTokenByHash: async (tokenHash) => s.tokens.get(s.tokenHashes.get(tokenHash)),
    consumeCredentialToken: async (token, consumedAt) => {
      const current = s.tokens.get(token.id);
      invariant(current && !current.consumedAt && !current.revokedAt, 'AUTH_INVITE_TOKEN_INVALID', 'Invitation is invalid or expired');
      s.tokens.set(token.id, Object.freeze({ ...current, consumedAt }));
    },
    revokeOpenCredentialTokens: async (userId, organisationId, revokedAt) => {
      let revoked = 0;
      for (const [id, token] of s.tokens) {
        if (token.userId === userId && token.organisationId === organisationId && !token.consumedAt && !token.revokedAt) {
          s.tokens.set(id, Object.freeze({ ...token, revokedAt })); revoked += 1;
        }
      }
      return revoked;
    },
    listOpenCredentialTokens: async (organisationId) => [...s.tokens.values()].filter((token) => token.organisationId === organisationId && !token.consumedAt && !token.revokedAt),

    getCommand: async (id) => s.commands.get(id),
    insertCommand: async (command) => {
      invariant(!s.commands.has(command.id), 'COMMAND_ALREADY_EXISTS', 'Command already exists', { commandId: command.id });
      s.commands.set(command.id, command);
    },
    appendOutbox: async (event) => { s.outbox.push(event); },
  });
}
