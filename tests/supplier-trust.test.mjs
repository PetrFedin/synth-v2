import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { createSupplierTrustService } from '../src/application/supplier-trust-service.mjs';

function keyB64() {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  return privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url');
}

function fixture({ now = '2026-10-06T12:00:00.000Z', auditExpiresAt = '2026-11-06T12:00:00.000Z' } = {}) {
  const revocations = new Map();
  let currentHash = 'a'.repeat(64);
  const passport = {
    async getPartnerBundleForActor(actorId, supplierCode) {
      assert.equal(actorId, 'actor-1');
      assert.equal(supplierCode, 'SUP-01');
      return bundle(currentHash, now, auditExpiresAt);
    },
    async getPartnerBundleForSystem(supplierCode) {
      assert.equal(supplierCode, 'SUP-01');
      return bundle(currentHash, now, auditExpiresAt);
    },
    async assertManageForActor(actorId, supplierCode) {
      assert.equal(actorId, 'actor-1');
      assert.equal(supplierCode, 'SUP-01');
      return { supplierCode };
    },
  };
  const store = {
    async get(hash) { return revocations.get(hash) ?? null; },
    async revoke(row) {
      const saved = { checkpointSha256: row.checkpointSha256, supplierCode: row.supplierCode, reason: row.reason, revokedBy: row.revokedBy };
      revocations.set(row.checkpointSha256, saved);
      return saved;
    },
  };
  const service = createSupplierTrustService({
    supplierPassport: passport,
    store,
    privateKeyB64: keyB64(),
    issuerId: 'syntha-test',
    keyId: 'supplier-test-key',
    clock: () => now,
  });
  return {
    service,
    setCurrentHash(value) { currentHash = value; },
  };
}

function bundle(hash, asOf, auditExpiresAt) {
  return {
    schemaVersion: 'supplier-passport-partner-bundle-v1',
    generatedAt: asOf,
    supplier: { supplierCode: 'SUP-01' },
    qualification: { state: 'current', auditState: 'current', auditExpiresAt, asOf },
    evidenceDimensions: {},
    evidenceCounters: {},
    lineage: { supplierVersion: 7 },
    disclosureBoundary: {},
    signature: { status: 'unsigned', issuer: null },
    hashScope: 'stable-evidence-v1',
    bundleSha256: hash,
  };
}

test('supplier trust checkpoint validates current bundle and audit', async () => {
  const { service } = fixture();
  const checkpoint = await service.issueForActor('actor-1', 'SUP-01');
  assert.equal(checkpoint.payload.bundleSha256, 'a'.repeat(64));
  assert.equal(checkpoint.payload.alg, 'Ed25519');
  assert.equal(checkpoint.checkpointSha256.length, 64);

  const verified = await service.verify(checkpoint);
  assert.equal(verified.status, 'VALID');
  assert.equal(verified.signatureValid, true);
  assert.equal(verified.current, true);
});

test('supplier trust checkpoint becomes stale when evidence bundle changes', async () => {
  const fx = fixture();
  const checkpoint = await fx.service.issueForActor('actor-1', 'SUP-01');
  fx.setCurrentHash('b'.repeat(64));

  const verified = await fx.service.verify(checkpoint);
  assert.equal(verified.status, 'STALE');
  assert.equal(verified.signatureValid, true);
  assert.equal(verified.current, false);
  assert.equal(verified.currentBundleSha256, 'b'.repeat(64));
});

test('supplier trust checkpoint can be explicitly revoked', async () => {
  const { service } = fixture();
  const checkpoint = await service.issueForActor('actor-1', 'SUP-01');
  const revoked = await service.revokeForActor('actor-1', checkpoint, 'Supplier qualification withdrawn');
  assert.equal(revoked.reason, 'Supplier qualification withdrawn');

  const verified = await service.verify(checkpoint);
  assert.equal(verified.status, 'REVOKED');
  assert.equal(verified.revoked, true);
});

test('supplier trust issuance fails closed when audit is expired', async () => {
  const { service } = fixture({
    now: '2026-10-06T12:00:00.000Z',
    auditExpiresAt: '2026-10-01T12:00:00.000Z',
  });
  await assert.rejects(
    () => service.issueForActor('actor-1', 'SUP-01'),
    (error) => error?.code === 'SUPPLIER_TRUST_QUALIFICATION_NOT_CURRENT' || error?.code === 'SUPPLIER_TRUST_AUDIT_EXPIRED',
  );
});

test('supplier trust service exposes no public key when issuer is not configured', () => {
  const service = createSupplierTrustService({
    supplierPassport: {
      getPartnerBundleForActor() {},
      getPartnerBundleForSystem() {},
      assertManageForActor() {},
    },
    store: { async get() { return null; }, async revoke() {} },
  });
  assert.throws(
    () => service.publicKeyDocument(),
    (error) => error?.code === 'SUPPLIER_TRUST_ISSUER_NOT_CONFIGURED',
  );
});
