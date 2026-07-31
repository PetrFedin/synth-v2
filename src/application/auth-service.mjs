import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DomainError, invariant } from '../core/errors.mjs';
import { hashPassword, verifyPassword } from '../auth/passwords.mjs';

const TOKEN_PREFIX = 'swv2_';
const DUMMY_PASSWORD_HASH = 'scrypt-v1$07070707070707070707070707070707$3597377008abf3b7a13ef44d7e9c604e60d15de6abaf3e1d2d78b527e25a1a11394573a933129cdb4e321bf04aeb098dc8ec12fdc1d0ac55dbcd3291894e1417';

export function createAuthService({
  store,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
  randomBytesImpl = randomBytes,
  sessionTtlMs = 12 * 60 * 60 * 1000,
  maxLoginFailures = 5,
  loginWindowMs = 15 * 60 * 1000,
  loginBlockMs = 15 * 60 * 1000,
  revokedSessionRetentionMs = 7 * 24 * 60 * 60 * 1000,
} = {}) {
  invariant(store && typeof store.transaction === 'function', 'AUTH_STORE_REQUIRED', 'Authentication store is required');
  invariant(Number.isInteger(sessionTtlMs) && sessionTtlMs >= 60_000, 'AUTH_SESSION_TTL_INVALID', 'Session TTL must be at least one minute');
  invariant(Number.isInteger(maxLoginFailures) && maxLoginFailures >= 2, 'AUTH_FAILURE_LIMIT_INVALID', 'Login failure limit must be at least two');
  invariant(Number.isInteger(loginWindowMs) && loginWindowMs >= 60_000, 'AUTH_LOGIN_WINDOW_INVALID', 'Login window must be at least one minute');
  invariant(Number.isInteger(loginBlockMs) && loginBlockMs >= 60_000, 'AUTH_LOGIN_BLOCK_INVALID', 'Login block must be at least one minute');

  return Object.freeze({
    async bootstrapUser({ id = nextId('user'), email, password, displayName = '' }) {
      const emailNormalized = normalizeEmail(email);
      const passwordHash = await hashPassword(password, { randomBytesImpl });
      const now = clock();
      const user = Object.freeze({
        id,
        email: email.trim(),
        emailNormalized,
        displayName: String(displayName).trim(),
        passwordHash,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      return store.transaction(async (tx) => {
        invariant(!await tx.getUserByEmail(emailNormalized), 'AUTH_USER_ALREADY_EXISTS', 'User already exists', { email: emailNormalized });
        await tx.insertUser(user);
        return publicUser(user);
      });
    },

    async login({ email, password }) {
      const emailNormalized = normalizeEmail(email);
      const keyHash = hashLoginKey(emailNormalized);
      const outcome = await store.transaction(async (tx) => {
        const now = clock();
        await tx.lockLoginKey?.(keyHash);
        await tx.deleteExpiredSessions?.(now, new Date(Date.parse(now) - revokedSessionRetentionMs).toISOString());
        const throttle = await tx.getLoginThrottle?.(keyHash);
        if (throttle?.blockedUntil && Date.parse(throttle.blockedUntil) > Date.parse(now)) {
          const retryAfterSeconds = Math.max(1, Math.ceil((Date.parse(throttle.blockedUntil) - Date.parse(now)) / 1000));
          await tx.insertLoginAudit?.(audit(nextId('auth-audit'), keyHash, null, 'blocked', now, { retryAfterSeconds }));
          return Object.freeze({ kind: 'blocked', retryAfterSeconds });
        }

        const user = await tx.getUserByEmail(emailNormalized);
        const passwordValid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
        if (!user || user.status !== 'active' || !passwordValid) {
          const nextThrottle = failedThrottle(throttle, keyHash, now, { maxLoginFailures, loginWindowMs, loginBlockMs });
          await tx.saveLoginThrottle?.(nextThrottle);
          const blocked = Boolean(nextThrottle.blockedUntil && Date.parse(nextThrottle.blockedUntil) > Date.parse(now));
          const retryAfterSeconds = blocked ? Math.max(1, Math.ceil((Date.parse(nextThrottle.blockedUntil) - Date.parse(now)) / 1000)) : 0;
          await tx.insertLoginAudit?.(audit(nextId('auth-audit'), keyHash, user?.id ?? null, blocked ? 'blocked' : 'failed', now, blocked ? { retryAfterSeconds } : {}));
          return Object.freeze({ kind: blocked ? 'blocked' : 'invalid', retryAfterSeconds });
        }

        await tx.deleteLoginThrottle?.(keyHash);
        const token = `${TOKEN_PREFIX}${randomBytesImpl(32).toString('base64url')}`;
        const expiresAt = new Date(Date.parse(now) + sessionTtlMs).toISOString();
        const session = Object.freeze({
          id: nextId('session'),
          userId: user.id,
          tokenHash: hashToken(token),
          status: 'active',
          createdAt: now,
          expiresAt,
          revokedAt: null,
        });
        await tx.insertSession(session);
        await tx.insertLoginAudit?.(audit(nextId('auth-audit'), keyHash, user.id, 'succeeded', now));
        return Object.freeze({ kind: 'success', value: Object.freeze({ accessToken: token, tokenType: 'Bearer', expiresAt, user: publicUser(user) }) });
      });

      if (outcome.kind === 'success') return outcome.value;
      if (outcome.kind === 'blocked') throw new DomainError('AUTH_RATE_LIMITED', 'Too many login attempts', { retryAfterSeconds: outcome.retryAfterSeconds });
      throw new DomainError('AUTH_CREDENTIALS_INVALID', 'Email or password is invalid');
    },

    async authenticate(token) {
      if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX) || token.length > 256) return null;
      return store.transaction(async (tx) => {
        const session = await tx.getSessionByTokenHash(hashToken(token));
        if (!session || session.status !== 'active' || Date.parse(session.expiresAt) <= Date.parse(clock())) return null;
        const user = await tx.getUser(session.userId);
        if (!user || user.status !== 'active') return null;
        return Object.freeze({ actorId: user.id, sessionId: session.id, email: user.email, displayName: user.displayName });
      });
    },

    async logout(token) {
      if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) return false;
      return store.transaction(async (tx) => {
        const session = await tx.getSessionByTokenHash(hashToken(token));
        if (!session || session.status !== 'active') return false;
        await tx.saveSession(Object.freeze({ ...session, status: 'revoked', revokedAt: clock() }));
        return true;
      });
    },

    async cleanupSessions() {
      const now = clock();
      return store.transaction((tx) => tx.deleteExpiredSessions?.(now, new Date(Date.parse(now) - revokedSessionRetentionMs).toISOString()) ?? 0);
    },
  });
}

function failedThrottle(current, keyHash, now, { maxLoginFailures, loginWindowMs, loginBlockMs }) {
  const windowExpired = !current || Date.parse(now) - Date.parse(current.windowStartedAt) >= loginWindowMs;
  const failureCount = windowExpired ? 1 : current.failureCount + 1;
  const blockedUntil = failureCount >= maxLoginFailures ? new Date(Date.parse(now) + loginBlockMs).toISOString() : null;
  return Object.freeze({ keyHash, failureCount, windowStartedAt: windowExpired ? now : current.windowStartedAt, blockedUntil, updatedAt: now });
}
function audit(id, keyHash, userId, outcome, occurredAt, metadata = {}) {
  return Object.freeze({ id, keyHash, userId, outcome, occurredAt, metadata: Object.freeze({ ...metadata }) });
}
function normalizeEmail(email) {
  invariant(typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), 'AUTH_EMAIL_INVALID', 'A valid email is required');
  return email.trim().toLowerCase();
}
function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }
function hashLoginKey(emailNormalized) { return createHash('sha256').update(`login:${emailNormalized}`).digest('hex'); }
function publicUser(user) { return Object.freeze({ id: user.id, email: user.email, displayName: user.displayName, status: user.status }); }
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
