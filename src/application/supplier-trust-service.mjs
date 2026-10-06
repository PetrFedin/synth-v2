import crypto from 'node:crypto';
import { invariant } from '../core/errors.mjs';

const CHECKPOINT_VERSION = 'supplier-trust-checkpoint-v1';

export function createSupplierTrustService({
  supplierPassport,
  store,
  privateKeyB64,
  issuerId = 'syntha-platform',
  keyId = 'syntha-supplier-trust-v1',
  clock = () => new Date().toISOString(),
} = {}) {
  invariant(supplierPassport?.getPartnerBundleForActor, 'SUPPLIER_TRUST_PASSPORT_REQUIRED', 'Supplier passport service is required');
  invariant(supplierPassport?.getPartnerBundleForSystem, 'SUPPLIER_TRUST_SYSTEM_PROJECTION_REQUIRED', 'Supplier system projection is required');
  invariant(supplierPassport?.assertManageForActor, 'SUPPLIER_TRUST_AUTHORIZATION_REQUIRED', 'Supplier trust authorization is required');
  invariant(store?.get && store?.revoke, 'SUPPLIER_TRUST_STORE_REQUIRED', 'Supplier trust store is required');
  invariant(typeof clock === 'function', 'SUPPLIER_TRUST_CLOCK_REQUIRED', 'Supplier trust clock is required');

  const privateKey = parsePrivateKey(privateKeyB64);
  const publicKey = privateKey ? crypto.createPublicKey(privateKey) : null;

  return Object.freeze({
    publicKeyDocument() {
      invariant(publicKey, 'SUPPLIER_TRUST_ISSUER_NOT_CONFIGURED', 'Supplier trust issuer key is not configured');
      const der = publicKey.export({ format: 'der', type: 'spki' });
      return Object.freeze({
        issuerId,
        keyId,
        alg: 'Ed25519',
        publicKeySpkiB64: Buffer.from(der).toString('base64url'),
        checkpointVersion: CHECKPOINT_VERSION,
      });
    },

    async issueForActor(actorId, supplierCode) {
      invariant(privateKey, 'SUPPLIER_TRUST_ISSUER_NOT_CONFIGURED', 'Supplier trust issuer key is not configured');
      const bundle = await supplierPassport.getPartnerBundleForActor(actorId, supplierCode);
      invariant(bundle.qualification?.state === 'current', 'SUPPLIER_TRUST_QUALIFICATION_NOT_CURRENT', 'Supplier qualification is not current', { supplierCode });
      invariant(Date.parse(bundle.qualification.auditExpiresAt) > Date.parse(clock()), 'SUPPLIER_TRUST_AUDIT_EXPIRED', 'Supplier audit has expired', { supplierCode });

      const payload = Object.freeze({
        checkpointVersion: CHECKPOINT_VERSION,
        issuerId,
        keyId,
        alg: 'Ed25519',
        issuedAt: new Date(clock()).toISOString(),
        supplierCode,
        bundleSha256: bundle.bundleSha256,
        auditExpiresAt: bundle.qualification.auditExpiresAt,
        supplierVersion: bundle.lineage.supplierVersion,
      });
      const signature = crypto.sign(null, canonicalBytes(payload), privateKey).toString('base64url');
      const envelope = { payload, signature };
      return Object.freeze({
        ...envelope,
        checkpointSha256: sha256(envelope),
      });
    },

    async revokeForActor(actorId, envelope, reason) {
      const verified = verifySignatureOnly({ envelope, publicKey, issuerId, keyId });
      invariant(verified.valid, 'SUPPLIER_TRUST_CHECKPOINT_INVALID', 'Checkpoint signature is invalid', { reason: verified.reason });
      await supplierPassport.assertManageForActor(actorId, envelope.payload.supplierCode);
      const normalizedReason = String(reason ?? '').trim();
      invariant(normalizedReason.length >= 3 && normalizedReason.length <= 500, 'SUPPLIER_TRUST_REVOCATION_REASON_INVALID', 'Revocation reason must be 3-500 characters');
      return store.revoke({
        checkpointSha256: envelope.checkpointSha256,
        supplierCode: envelope.payload.supplierCode,
        reason: normalizedReason,
        revokedBy: actorId,
      });
    },

    async verify(envelope) {
      if (!publicKey) return Object.freeze({ status: 'ISSUER_NOT_CONFIGURED', signatureValid: false, current: false, revoked: false });
      const signature = verifySignatureOnly({ envelope, publicKey, issuerId, keyId });
      if (!signature.valid) return Object.freeze({ status: signature.reason === 'envelope_hash_mismatch' ? 'INVALID_ENVELOPE_HASH' : 'INVALID_SIGNATURE', signatureValid: false, current: false, revoked: false, reason: signature.reason });

      const revocation = await store.get(envelope.checkpointSha256);
      if (revocation) return Object.freeze({ status: 'REVOKED', signatureValid: true, current: false, revoked: true, revocation });

      const now = Date.parse(clock());
      if (!(Date.parse(envelope.payload.auditExpiresAt) > now)) {
        return Object.freeze({ status: 'EXPIRED', signatureValid: true, current: false, revoked: false, auditExpiresAt: envelope.payload.auditExpiresAt });
      }

      let currentBundle;
      try {
        currentBundle = await supplierPassport.getPartnerBundleForSystem(envelope.payload.supplierCode);
      } catch {
        return Object.freeze({ status: 'STALE', signatureValid: true, current: false, revoked: false, reason: 'supplier_projection_unavailable' });
      }
      if (currentBundle.bundleSha256 !== envelope.payload.bundleSha256) {
        return Object.freeze({
          status: 'STALE',
          signatureValid: true,
          current: false,
          revoked: false,
          currentBundleSha256: currentBundle.bundleSha256,
        });
      }
      if (currentBundle.qualification?.state !== 'current') {
        return Object.freeze({ status: 'EXPIRED', signatureValid: true, current: false, revoked: false, auditExpiresAt: currentBundle.qualification?.auditExpiresAt ?? null });
      }

      return Object.freeze({
        status: 'VALID',
        signatureValid: true,
        current: true,
        revoked: false,
        checkpointSha256: envelope.checkpointSha256,
        bundleSha256: currentBundle.bundleSha256,
        auditExpiresAt: currentBundle.qualification.auditExpiresAt,
      });
    },
  });
}

function parsePrivateKey(value) {
  if (!value) return null;
  try {
    return crypto.createPrivateKey({
      key: Buffer.from(String(value), 'base64url'),
      format: 'der',
      type: 'pkcs8',
    });
  } catch {
    invariant(false, 'SUPPLIER_TRUST_ISSUER_KEY_INVALID', 'Supplier trust issuer private key is invalid');
  }
}

function verifySignatureOnly({ envelope, publicKey, issuerId, keyId }) {
  try {
    invariant(envelope && typeof envelope === 'object', 'SUPPLIER_TRUST_ENVELOPE_REQUIRED', 'Checkpoint envelope is required');
    const { payload, signature, checkpointSha256 } = envelope;
    if (!payload || payload.checkpointVersion !== CHECKPOINT_VERSION) return { valid: false, reason: 'checkpoint_version_mismatch' };
    if (payload.issuerId !== issuerId || payload.keyId !== keyId || payload.alg !== 'Ed25519') return { valid: false, reason: 'issuer_mismatch' };
    const expected = sha256({ payload, signature });
    if (checkpointSha256 !== expected) return { valid: false, reason: 'envelope_hash_mismatch' };
    const valid = crypto.verify(null, canonicalBytes(payload), publicKey, Buffer.from(String(signature), 'base64url'));
    return { valid, reason: valid ? null : 'invalid_signature' };
  } catch {
    return { valid: false, reason: 'invalid_signature' };
  }
}

function canonicalBytes(value) {
  return Buffer.from(stable(value), 'utf8');
}

function sha256(value) {
  return crypto.createHash('sha256').update(canonicalBytes(value)).digest('hex');
}

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}
