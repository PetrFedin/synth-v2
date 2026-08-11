import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductIdentityService } from '../src/application/product-identity-service.mjs';

const at = '2026-08-12T12:00:00.000Z';

function harness() {
  const commands = new Map();
  const styles = new Map();
  const styleVersions = [];
  const usages = [];
  const mdm = new Map();
  const memberships = new Map();
  let sequence = 0;
  const tx = {
    getCommand: async (id) => commands.get(id),
    insertCommand: async (value) => commands.set(value.id, value),
    getMembership: async (organisationId, actorId) => memberships.get(`${organisationId}:${actorId}`),
    getStyleByBrandAndCode: async (brandId, styleCode) => [...styles.values()].find((value) => value.brandId === brandId && value.styleCode === styleCode),
    getStyleForUpdate: async (id) => styles.get(id),
    insertStyle: async (value) => styles.set(value.id, value),
    saveStyle: async (value) => styles.set(value.id, value),
    getLatestStyleVersion: async (styleId) => styleVersions.filter((value) => value.styleId === styleId).sort((a, b) => b.versionNo - a.versionNo)[0],
    insertStyleVersion: async (value) => styleVersions.push(value),
    getMdmEntryVersion: async (entryId, version) => mdm.get(`${entryId}:${version}`),
    insertMdmUsageSnapshot: async (value) => usages.push(value),
  };
  const store = { transaction: async (work) => work(tx) };
  const service = createProductIdentityService({ store, clock: () => at, nextId: (prefix) => `${prefix}:${++sequence}` });
  return { service, commands, styles, styleVersions, usages, mdm, memberships };
}

function activeMembership(organisationId, userId, role = 'sales') {
  return Object.freeze({ id: `membership:${organisationId}:${userId}`, organisationId, organisationType: 'brand', userId, role, status: 'active', createdAt: at });
}
function mdmRecord({ entryId, version = 1, currentVersion = version, dictionaryCode = 'assortment.category', tenantId = null, status = 'active', approvalStatus = 'approved' }) {
  return Object.freeze({ entryId, version, currentVersion, dictionaryCode, tenantId, status, approvalStatus, validFrom: null, validTo: null, snapshot: { id: entryId, version, code: entryId.split(':').at(-1) } });
}

test('Product Identity createStyle is command-idempotent and re-authorizes replay', async () => {
  const h = harness();
  h.memberships.set('brand:1:user:1', activeMembership('brand:1', 'user:1'));
  const input = { brandId: 'brand:1', styleCode: 'DRS-001' };
  const first = await h.service.createStyle('cmd:1', 'user:1', input);
  const replay = await h.service.createStyle('cmd:1', 'user:1', input);
  assert.equal(first.id, replay.id);
  assert.equal(h.styles.size, 1);
  assert.equal(h.commands.size, 1);
  await assert.rejects(
    h.service.createStyle('cmd:1', 'user:1', { brandId: 'brand:1', styleCode: 'DRS-002' }),
    (error) => error?.code === 'COMMAND_ID_CONFLICT',
  );
});

test('StyleVersion pins current compatible MDM versions and captures exact immutable usage', async () => {
  const h = harness();
  h.memberships.set('brand:1:user:1', activeMembership('brand:1', 'user:1'));
  const style = await h.service.createStyle('cmd:style', 'user:1', { brandId: 'brand:1', styleCode: 'DRS-001' });
  h.mdm.set('mdm:category:dress:3', mdmRecord({ entryId: 'mdm:category:dress', version: 3, dictionaryCode: 'assortment.category' }));
  h.mdm.set('mdm:type:dress:2', mdmRecord({ entryId: 'mdm:type:dress', version: 2, dictionaryCode: 'assortment.product_type' }));
  const version = await h.service.createStyleVersion('cmd:v1', 'user:1', style.id, {
    expectedLatestVersionNo: 0,
    titleRu: 'Платье миди',
    titleEn: 'Midi dress',
    categoryRef: { entryId: 'mdm:category:dress', version: 3 },
    productTypeRef: { entryId: 'mdm:type:dress', version: 2 },
    technicalPayload: { construction: 'woven' },
  });
  assert.equal(version.versionNo, 1);
  assert.deepEqual(version.categoryRef, { entryId: 'mdm:category:dress', version: 3 });
  assert.equal(h.usages.length, 2);
  assert.deepEqual(h.usages.map((value) => value.fieldPath).sort(), ['categoryRef', 'productTypeRef']);
  assert.deepEqual(h.usages[0].snapshot, h.mdm.get(`${h.usages[0].entryId}:${h.usages[0].entryVersion}`).snapshot);
});

test('new Product Identity facts reject stale, wrong-dictionary and cross-tenant MDM references', async () => {
  const scenarios = [
    ['stale version', mdmRecord({ entryId: 'mdm:category:dress', version: 2, currentVersion: 3 }), 'PRODUCT_MDM_REFERENCE_STALE'],
    ['wrong dictionary', mdmRecord({ entryId: 'mdm:category:dress', version: 2, dictionaryCode: 'colour.colour' }), 'PRODUCT_MDM_DICTIONARY_MISMATCH'],
    ['wrong tenant', mdmRecord({ entryId: 'mdm:category:dress', version: 2, tenantId: 'brand:other' }), 'PRODUCT_MDM_TENANT_MISMATCH'],
  ];
  for (const [label, record, expectedCode] of scenarios) {
    const h = harness();
    h.memberships.set('brand:1:user:1', activeMembership('brand:1', 'user:1'));
    const style = await h.service.createStyle(`cmd:style:${label}`, 'user:1', { brandId: 'brand:1', styleCode: 'DRS-001' });
    h.mdm.set('mdm:category:dress:2', record);
    await assert.rejects(
      h.service.createStyleVersion(`cmd:v1:${label}`, 'user:1', style.id, {
        expectedLatestVersionNo: 0,
        titleRu: 'Платье миди',
        titleEn: 'Midi dress',
        categoryRef: { entryId: 'mdm:category:dress', version: 2 },
      }),
      (error) => error?.code === expectedCode,
      label,
    );
  }
});

test('StyleVersion creation fails closed on stale expected latest version', async () => {
  const h = harness();
  h.memberships.set('brand:1:user:1', activeMembership('brand:1', 'user:1'));
  const style = await h.service.createStyle('cmd:style', 'user:1', { brandId: 'brand:1', styleCode: 'DRS-001' });
  await h.service.createStyleVersion('cmd:v1', 'user:1', style.id, { expectedLatestVersionNo: 0, titleRu: 'Версия один', titleEn: 'Version one' });
  await assert.rejects(
    h.service.createStyleVersion('cmd:v2', 'user:1', style.id, { expectedLatestVersionNo: 0, titleRu: 'Версия два', titleEn: 'Version two' }),
    (error) => error?.code === 'PRODUCT_STYLE_VERSION_CONCURRENCY_CONFLICT',
  );
});

test('buyer membership cannot mutate the technical Product Master', async () => {
  const h = harness();
  h.memberships.set('brand:1:user:buyer', activeMembership('brand:1', 'user:buyer', 'buyer'));
  await assert.rejects(
    h.service.createStyle('cmd:buyer', 'user:buyer', { brandId: 'brand:1', styleCode: 'DRS-001' }),
    (error) => error?.code === 'CAPABILITY_DENIED',
  );
});
