import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';
import { postgresAuthView, userFromRow } from './postgres-auth-store.mjs';

// Жизненный цикл сотрудников на PostgreSQL.
//
// Членство, учётная запись, сессии, токены приглашения, журнал команд и очередь событий меняются
// **одной транзакцией**. Отдельные хранилища для входа и для членств этого не позволили бы:
// отключение, у которого отозвались сессии, но не сменился статус (или наоборот), оставило бы либо
// человека с рабочим входом, либо членство, которое нельзя вернуть.
//
// Команды пишутся в общий журнал `wholesale`: это та же прикладная область, что и выдача членства
// платформой, и отдельная область потребовала бы менять общий реестр команд, который правят все.
/** @param {{ pool?: any }} [options] */
export function createPostgresTeamStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    ...postgresAuthView(client),

    async getOrganisation(id) {
      const result = await client.query('SELECT payload FROM organisations WHERE id = $1', [id]);
      return result.rows[0]?.payload;
    },
    // Все изменения состава одной организации идут по очереди: без этого два владельца, одновременно
    // разжалующие друг друга, оба видели бы «ещё один владелец остаётся».
    async lockOrganisation(id) {
      await client.query('SELECT 1 FROM organisations WHERE id = $1 FOR NO KEY UPDATE', [id]);
    },

    async getMembership(organisationId, userId, { forUpdate = true } = {}) {
      const result = await client.query(`${MEMBERSHIP_SELECT} WHERE organisation_id = $1 AND user_id = $2${forUpdate ? ' FOR UPDATE' : ''}`, [organisationId, userId]);
      return result.rows[0] ? membershipFromRow(result.rows[0]) : undefined;
    },
    async listMembershipsByOrganisation(organisationId) {
      const result = await client.query(`${MEMBERSHIP_SELECT} WHERE organisation_id = $1 ORDER BY user_id`, [organisationId]);
      return result.rows.map(membershipFromRow);
    },
    async countActiveOwners(organisationId) {
      const result = await client.query(`SELECT count(*)::int AS count FROM memberships WHERE organisation_id = $1 AND role = 'owner' AND status = 'active'`, [organisationId]);
      return result.rows[0].count;
    },
    async countActiveMembershipsForUser(userId) {
      const result = await client.query(`SELECT count(*)::int AS count FROM memberships WHERE user_id = $1 AND status = 'active'`, [userId]);
      return result.rows[0].count;
    },
    async insertMembership(value) {
      try {
        await client.query(
          `INSERT INTO memberships (id, organisation_id, user_id, organisation_type, role, status, version, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          [value.id, value.organisationId, value.userId, value.organisationType, value.role, value.status, value.version, JSON.stringify(value)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'TEAM_MEMBER_ALREADY_EXISTS', 'This person already has a membership in the organisation');
        throw error;
      }
    },
    async saveMembership(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Membership version must increment exactly once');
      const result = await client.query(
        `UPDATE memberships
            SET role = $3, status = $4, version = $5, payload = $6::jsonb
          WHERE organisation_id = $1 AND user_id = $2 AND version = $7`,
        [value.organisationId, value.userId, value.role, value.status, value.version, JSON.stringify(value), expectedVersion],
      );
      invariant(result.rowCount === 1, 'TEAM_MEMBERSHIP_CONCURRENCY_CONFLICT', 'Membership changed since it was read', { expectedVersion });
    },

    async saveUser(user) {
      const result = await client.query(
        `UPDATE auth_users SET display_name = $2, password_hash = $3, status = $4, updated_at = $5 WHERE id = $1`,
        [user.id, user.displayName, user.passwordHash, user.status, user.updatedAt],
      );
      invariant(result.rowCount === 1, 'AUTH_USER_NOT_FOUND', 'User not found', { userId: user.id });
    },
    async getUserForUpdate(id) {
      const result = await client.query('SELECT * FROM auth_users WHERE id = $1 FOR UPDATE', [id]);
      return userFromRow(result.rows[0]);
    },
    async revokeSessionsForUser(userId, revokedAt) {
      const result = await client.query(
        `UPDATE auth_sessions SET status = 'revoked', revoked_at = $2 WHERE user_id = $1 AND status = 'active'`,
        [userId, revokedAt],
      );
      return result.rowCount;
    },

    async insertCredentialToken(token) {
      await client.query(
        `INSERT INTO auth_credential_tokens
           (id, user_id, organisation_id, purpose, token_hash, created_by, created_at, expires_at, consumed_at, revoked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [token.id, token.userId, token.organisationId, token.purpose, token.tokenHash, token.createdBy, token.createdAt, token.expiresAt, token.consumedAt, token.revokedAt],
      );
    },
    async getCredentialTokenByHash(tokenHash) {
      const result = await client.query('SELECT * FROM auth_credential_tokens WHERE token_hash = $1', [tokenHash]);
      return tokenFromRow(result.rows[0]);
    },
    // Погашение — условное обновление, а не «прочитал, проверил, записал»: два одновременных
    // принятия одного токена не должны оба решить, что он ещё свободен.
    async consumeCredentialToken(token, consumedAt) {
      const result = await client.query(
        'UPDATE auth_credential_tokens SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL AND revoked_at IS NULL',
        [token.id, consumedAt],
      );
      invariant(result.rowCount === 1, 'AUTH_INVITE_TOKEN_INVALID', 'Invitation is invalid or expired');
    },
    async revokeOpenCredentialTokens(userId, organisationId, revokedAt) {
      const result = await client.query(
        `UPDATE auth_credential_tokens SET revoked_at = $3
          WHERE user_id = $1 AND organisation_id = $2 AND consumed_at IS NULL AND revoked_at IS NULL`,
        [userId, organisationId, revokedAt],
      );
      return result.rowCount;
    },
    async listOpenCredentialTokens(organisationId) {
      const result = await client.query(
        `SELECT * FROM auth_credential_tokens WHERE organisation_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL`,
        [organisationId],
      );
      return result.rows.map(tokenFromRow);
    },

    getCommand: (id) => getRegisteredCommand(client, 'wholesale', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'wholesale', value),
    async appendOutbox(event) {
      try {
        await client.query(
          `INSERT INTO outbox_events (id, event_type, aggregate_id, status, event, published_at)
           VALUES ($1, $2, $3, 'pending', $4::jsonb, NULL)`,
          [event.id, event.type, event.aggregateId, JSON.stringify(event)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'OUTBOX_EVENT_ALREADY_EXISTS', 'Outbox event already exists', { eventId: event.id });
        throw error;
      }
    },
  });
}

const MEMBERSHIP_SELECT = 'SELECT payload, role, status, version FROM memberships';

// Столбцы — источник истины для роли, статуса и версии: по ним ищут читатели и на них стоит
// триггер последнего владельца. Payload несёт остальное и читается теми, кто проверяет права.
function membershipFromRow(row) {
  return Object.freeze({ ...row.payload, role: row.role, status: row.status, version: row.version });
}
function tokenFromRow(row) {
  if (!row) return undefined;
  return Object.freeze({
    id: row.id,
    userId: row.user_id,
    organisationId: row.organisation_id,
    purpose: row.purpose,
    tokenHash: row.token_hash.trim(),
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    consumedAt: row.consumed_at ? iso(row.consumed_at) : null,
    revokedAt: row.revoked_at ? iso(row.revoked_at) : null,
  });
}
function iso(value) { return value?.toISOString?.() ?? value; }
