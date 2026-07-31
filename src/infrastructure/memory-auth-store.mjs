import { invariant } from '../core/errors.mjs';

export function createMemoryAuthStore() {
  let state = { users: new Map(), emails: new Map(), sessions: new Map(), sessionHashes: new Map(), throttles: new Map(), audits: new Map() };
  return Object.freeze({
    async transaction(work) {
      const draft = clone(state);
      const result = await work(view(draft));
      state = draft;
      return result;
    },
    snapshot() { return { users: [...state.users.values()], sessions: [...state.sessions.values()], throttles: [...state.throttles.values()], audits: [...state.audits.values()] }; },
  });
}
function clone(s) { return { users:new Map(s.users), emails:new Map(s.emails), sessions:new Map(s.sessions), sessionHashes:new Map(s.sessionHashes), throttles:new Map(s.throttles), audits:new Map(s.audits) }; }
function view(s) { return Object.freeze({
  getUser: async (id)=>s.users.get(id),
  getUserByEmail: async (email)=>s.users.get(s.emails.get(email)),
  insertUser: async (u)=>{ invariant(!s.users.has(u.id) && !s.emails.has(u.emailNormalized),'AUTH_USER_ALREADY_EXISTS','User already exists'); s.users.set(u.id,u); s.emails.set(u.emailNormalized,u.id); },
  getSessionByTokenHash: async (hash)=>s.sessions.get(s.sessionHashes.get(hash)),
  insertSession: async (session)=>{ invariant(!s.sessions.has(session.id) && !s.sessionHashes.has(session.tokenHash),'AUTH_SESSION_ALREADY_EXISTS','Session already exists'); s.sessions.set(session.id,session); s.sessionHashes.set(session.tokenHash,session.id); },
  saveSession: async (session)=>{ invariant(s.sessions.has(session.id),'AUTH_SESSION_NOT_FOUND','Session not found'); s.sessions.set(session.id,session); },
  lockLoginKey: async ()=>undefined,
  getLoginThrottle: async (keyHash)=>s.throttles.get(keyHash),
  saveLoginThrottle: async (throttle)=>{ s.throttles.set(throttle.keyHash, throttle); },
  deleteLoginThrottle: async (keyHash)=>{ s.throttles.delete(keyHash); },
  insertLoginAudit: async (entry)=>{ invariant(!s.audits.has(entry.id),'AUTH_AUDIT_ALREADY_EXISTS','Authentication audit entry already exists'); s.audits.set(entry.id,entry); },
  deleteExpiredSessions: async (now, revokedBefore)=>{
    let deleted=0;
    for (const [id,session] of s.sessions) {
      const expired=Date.parse(session.expiresAt)<=Date.parse(now);
      const staleRevoked=session.status==='revoked' && session.revokedAt && Date.parse(session.revokedAt)<=Date.parse(revokedBefore);
      if (expired || staleRevoked) { s.sessions.delete(id); s.sessionHashes.delete(session.tokenHash); deleted+=1; }
    }
    return deleted;
  },
}); }
