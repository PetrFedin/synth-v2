import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductIdentityService } from '../src/application/product-identity-service.mjs';

const at = '2026-08-12T12:00:00.000Z';

function harness() {
  const commands = new Map();
  const styles = new Map();
  const styleVersions = [];
  const colorways = new Map();
  const styleReferences = new Map();
  const styleConstructionNodes = new Map();
  const usages = [];
  const mdm = new Map();
  const memberships = new Map();
  let sequence = 0;
  const tx = {
    getCommand: async (id) => commands.get(id),
    insertCommand: async (value) => commands.set(value.id, value),
    getMembership: async (organisationId, actorId) => memberships.get(`${organisationId}:${actorId}`),
    getStyleByBrandAndCode: async (brandId, styleCode) => [...styles.values()].find((value) => value.brandId === brandId && value.styleCode === styleCode),
    getStyle: async (id) => styles.get(id),
    getStyleForUpdate: async (id) => styles.get(id),
    insertStyle: async (value) => styles.set(value.id, value),
    saveStyle: async (value) => styles.set(value.id, value),
    getLatestStyleVersion: async (styleId) => styleVersions.filter((value) => value.styleId === styleId).sort((a, b) => b.versionNo - a.versionNo)[0],
    insertStyleVersion: async (value) => styleVersions.push(value),
    getStyleVersion: async (id) => styleVersions.find((value) => value.id === id),
    getColorwayByCode: async (styleVersionId, colorwayCode) => [...colorways.values()].find((value) => value.styleVersionId === styleVersionId && value.colorwayCode === colorwayCode),
    insertColorway: async (value) => colorways.set(value.id, value),
    insertStyleReference: async (value) => styleReferences.set(value.id, value),
    insertStyleConstructionNode: async (value) => styleConstructionNodes.set(value.id, value),
    getMdmEntryVersion: async (entryId, version) => mdm.get(`${entryId}:${version}`),
    insertMdmUsageSnapshot: async (value) => usages.push(value),
  };
  const store = { transaction: async (work) => work(tx) };
  const service = createProductIdentityService({ store, clock: () => at, nextId: (prefix) => `${prefix}:${++sequence}` });
  return { service, commands, styles, styleVersions, colorways, styleReferences, styleConstructionNodes, usages, mdm, memberships };
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

test('StyleVersion pins current compatible MDM versions, captures exact usage and replays after later MDM changes', async () => {
  const h = harness();
  h.memberships.set('brand:1:user:1', activeMembership('brand:1', 'user:1'));
  const style = await h.service.createStyle('cmd:style', 'user:1', { brandId: 'brand:1', styleCode: 'DRS-001' });
  h.mdm.set('mdm:category:dress:3', mdmRecord({ entryId: 'mdm:category:dress', version: 3, dictionaryCode: 'assortment.category' }));
  h.mdm.set('mdm:type:dress:2', mdmRecord({ entryId: 'mdm:type:dress', version: 2, dictionaryCode: 'assortment.product_type' }));
  const input = {
    expectedLatestVersionNo: 0,
    titleRu: 'Платье миди',
    titleEn: 'Midi dress',
    categoryRef: { entryId: 'mdm:category:dress', version: 3 },
    productTypeRef: { entryId: 'mdm:type:dress', version: 2 },
    technicalPayload: { construction: 'woven' },
  };
  const version = await h.service.createStyleVersion('cmd:v1', 'user:1', style.id, input);
  assert.equal(version.versionNo, 1);
  assert.deepEqual(version.categoryRef, { entryId: 'mdm:category:dress', version: 3 });
  assert.equal(h.usages.length, 2);
  assert.deepEqual(h.usages.map((value) => value.fieldPath).sort(), ['categoryRef', 'productTypeRef']);
  assert.deepEqual(h.usages[0].snapshot, h.mdm.get(`${h.usages[0].entryId}:${h.usages[0].entryVersion}`).snapshot);

  h.mdm.set('mdm:category:dress:3', mdmRecord({ entryId: 'mdm:category:dress', version: 3, currentVersion: 4, dictionaryCode: 'assortment.category' }));
  const replay = await h.service.createStyleVersion('cmd:v1', 'user:1', style.id, input);
  assert.equal(replay.id, version.id);
  assert.equal(h.styleVersions.length, 1);
  assert.equal(h.usages.length, 2);
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

async function styleVersionFixture(h) {
  h.memberships.set('brand:1:user:1', activeMembership('brand:1', 'user:1'));
  const style = await h.service.createStyle('cmd:style', 'user:1', { brandId: 'brand:1', styleCode: 'DRS-001' });
  return h.service.createStyleVersion('cmd:v1', 'user:1', style.id, { expectedLatestVersionNo: 0, titleRu: 'Платье миди', titleEn: 'Midi dress' });
}

test('a colorway batch creates every item atomically in one command', async () => {
  const h = harness();
  const styleVersion = await styleVersionFixture(h);
  const created = await h.service.createColorwaysBatch('cmd:batch', 'user:1', styleVersion.id, {
    items: [
      { colorwayCode: 'BLK', nameRu: 'Чёрный', nameEn: 'Black' },
      { colorwayCode: 'WHT', nameRu: 'Белый', nameEn: 'White' },
      { colorwayCode: 'NVY', nameRu: 'Тёмно-синий', nameEn: 'Navy' },
    ],
  });
  assert.equal(created.length, 3);
  assert.equal(h.colorways.size, 3);
  assert.deepEqual(created.map((value) => value.colorwayCode), ['BLK', 'WHT', 'NVY']);

  // replay is idempotent: no duplicate rows land
  const replay = await h.service.createColorwaysBatch('cmd:batch', 'user:1', styleVersion.id, {
    items: [
      { colorwayCode: 'BLK', nameRu: 'Чёрный', nameEn: 'Black' },
      { colorwayCode: 'WHT', nameRu: 'Белый', nameEn: 'White' },
      { colorwayCode: 'NVY', nameRu: 'Тёмно-синий', nameEn: 'Navy' },
    ],
  });
  assert.deepEqual(replay.map((value) => value.id), created.map((value) => value.id));
  assert.equal(h.colorways.size, 3);
});

test('a colorway batch refuses a duplicate code within the same batch, creating nothing', async () => {
  const h = harness();
  const styleVersion = await styleVersionFixture(h);
  await assert.rejects(
    h.service.createColorwaysBatch('cmd:dupe', 'user:1', styleVersion.id, {
      items: [
        { colorwayCode: 'BLK', nameRu: 'Чёрный', nameEn: 'Black' },
        { colorwayCode: 'BLK', nameRu: 'Чёрный 2', nameEn: 'Black 2' },
      ],
    }),
    (error) => error?.code === 'PRODUCT_COLORWAY_BATCH_CODE_DUPLICATE',
  );
  assert.equal(h.colorways.size, 0);
});

test('a colorway batch refuses a code already taken on the style version, creating nothing', async () => {
  const h = harness();
  const styleVersion = await styleVersionFixture(h);
  await h.service.createColorway('cmd:single', 'user:1', styleVersion.id, { colorwayCode: 'BLK', nameRu: 'Чёрный', nameEn: 'Black' });
  await assert.rejects(
    h.service.createColorwaysBatch('cmd:batch-collide', 'user:1', styleVersion.id, {
      items: [
        { colorwayCode: 'WHT', nameRu: 'Белый', nameEn: 'White' },
        { colorwayCode: 'BLK', nameRu: 'Чёрный ещё раз', nameEn: 'Black again' },
      ],
    }),
    (error) => error?.code === 'PRODUCT_COLORWAY_ALREADY_EXISTS',
  );
  // The first item of the batch must not have landed either — the whole command is one transaction.
  assert.equal(h.colorways.size, 1);
});

test('a colorway batch rejects an empty item list', async () => {
  const h = harness();
  const styleVersion = await styleVersionFixture(h);
  await assert.rejects(
    h.service.createColorwaysBatch('cmd:empty', 'user:1', styleVersion.id, { items: [] }),
    (error) => error?.code === 'PRODUCT_COLORWAY_BATCH_SIZE_INVALID',
  );
});

test('addStyleReference attaches to the style itself and is idempotent by command', async () => {
  const h = harness();
  h.memberships.set('brand:1:user:1', activeMembership('brand:1', 'user:1'));
  const style = await h.service.createStyle('cmd:style', 'user:1', { brandId: 'brand:1', styleCode: 'DRS-001' });
  const reference = await h.service.addStyleReference('cmd:ref', 'user:1', style.id, {
    imageUri: 's3://product-references/DRS-001/past-season.jpg',
    referencedModel: 'SS25 midi dress',
    sortOrder: 0,
  });
  assert.equal(reference.styleId, style.id);
  assert.equal(reference.brandId, 'brand:1');
  assert.equal(reference.season, null);
  assert.equal(h.styleReferences.size, 1);

  const replay = await h.service.addStyleReference('cmd:ref', 'user:1', style.id, {
    imageUri: 's3://product-references/DRS-001/past-season.jpg',
    referencedModel: 'SS25 midi dress',
    sortOrder: 0,
  });
  assert.equal(replay.id, reference.id);
  assert.equal(h.styleReferences.size, 1);
});

test('addStyleReference is denied for a buyer and rejected for an unknown style', async () => {
  const h = harness();
  h.memberships.set('brand:1:user:1', activeMembership('brand:1', 'user:1'));
  h.memberships.set('brand:1:user:buyer', activeMembership('brand:1', 'user:buyer', 'buyer'));
  const style = await h.service.createStyle('cmd:style', 'user:1', { brandId: 'brand:1', styleCode: 'DRS-001' });
  await assert.rejects(
    h.service.addStyleReference('cmd:ref-buyer', 'user:buyer', style.id, { imageUri: 'ok.jpg', sortOrder: 0 }),
    (error) => error?.code === 'CAPABILITY_DENIED',
  );
  await assert.rejects(
    h.service.addStyleReference('cmd:ref-missing', 'user:1', 'style:unknown', { imageUri: 'ok.jpg', sortOrder: 0 }),
    (error) => error?.code === 'PRODUCT_STYLE_NOT_FOUND',
  );
  assert.equal(h.styleReferences.size, 0);
});

test('addStyleReference links to a real Product Style in the same brand, but refuses one from another brand or one that does not exist', async () => {
  const h = harness();
  h.memberships.set('brand:1:user:1', activeMembership('brand:1', 'user:1'));
  h.memberships.set('brand:2:user:2', activeMembership('brand:2', 'user:2'));
  const style = await h.service.createStyle('cmd:style', 'user:1', { brandId: 'brand:1', styleCode: 'DRS-001' });
  const sibling = await h.service.createStyle('cmd:sibling', 'user:1', { brandId: 'brand:1', styleCode: 'DRS-002' });
  const otherBrandStyle = await h.service.createStyle('cmd:other-brand', 'user:2', { brandId: 'brand:2', styleCode: 'DRS-900' });

  const reference = await h.service.addStyleReference('cmd:ref-linked', 'user:1', style.id, {
    imageUri: 'analog.jpg', linkedStyleId: sibling.id, sortOrder: 0,
  });
  assert.equal(reference.linkedStyleId, sibling.id);

  await assert.rejects(
    h.service.addStyleReference('cmd:ref-cross-brand', 'user:1', style.id, { imageUri: 'analog.jpg', linkedStyleId: otherBrandStyle.id, sortOrder: 1 }),
    (error) => error?.code === 'PRODUCT_STYLE_REFERENCE_LINKED_STYLE_NOT_FOUND',
  );
  await assert.rejects(
    h.service.addStyleReference('cmd:ref-unknown', 'user:1', style.id, { imageUri: 'analog.jpg', linkedStyleId: 'style:ghost', sortOrder: 2 }),
    (error) => error?.code === 'PRODUCT_STYLE_REFERENCE_LINKED_STYLE_NOT_FOUND',
  );
  assert.equal(h.styleReferences.size, 1);
});

test('addConstructionNode attaches a governed design.construction_node reference and is idempotent by command', async () => {
  const h = harness();
  h.memberships.set('brand:1:user:1', activeMembership('brand:1', 'user:1'));
  const style = await h.service.createStyle('cmd:style', 'user:1', { brandId: 'brand:1', styleCode: 'DRS-001' });
  h.mdm.set('mdm:construction:collar-set-in:1', mdmRecord({ entryId: 'mdm:construction:collar-set-in', version: 1, dictionaryCode: 'design.construction_node' }));
  const node = await h.service.addConstructionNode('cmd:node', 'user:1', style.id, {
    mdmRef: { entryId: 'mdm:construction:collar-set-in', version: 1 },
    sortOrder: 0,
  });
  assert.equal(node.styleId, style.id);
  assert.equal(node.brandId, 'brand:1');
  assert.deepEqual(node.mdmRef, { entryId: 'mdm:construction:collar-set-in', version: 1 });
  assert.equal(h.styleConstructionNodes.size, 1);
  assert.equal(h.usages.length, 1);
  assert.equal(h.usages[0].fieldPath, 'mdmRef');

  const replay = await h.service.addConstructionNode('cmd:node', 'user:1', style.id, {
    mdmRef: { entryId: 'mdm:construction:collar-set-in', version: 1 },
    sortOrder: 0,
  });
  assert.equal(replay.id, node.id);
  assert.equal(h.styleConstructionNodes.size, 1);
});

test('addConstructionNode is denied for a buyer, rejected for an unknown style, and refuses a reference from the wrong MDM dictionary', async () => {
  const h = harness();
  h.memberships.set('brand:1:user:1', activeMembership('brand:1', 'user:1'));
  h.memberships.set('brand:1:user:buyer', activeMembership('brand:1', 'user:buyer', 'buyer'));
  const style = await h.service.createStyle('cmd:style', 'user:1', { brandId: 'brand:1', styleCode: 'DRS-001' });
  h.mdm.set('mdm:construction:collar-set-in:1', mdmRecord({ entryId: 'mdm:construction:collar-set-in', version: 1, dictionaryCode: 'design.construction_node' }));
  h.mdm.set('mdm:category:dress:1', mdmRecord({ entryId: 'mdm:category:dress', version: 1, dictionaryCode: 'assortment.category' }));
  await assert.rejects(
    h.service.addConstructionNode('cmd:node-buyer', 'user:buyer', style.id, { mdmRef: { entryId: 'mdm:construction:collar-set-in', version: 1 }, sortOrder: 0 }),
    (error) => error?.code === 'CAPABILITY_DENIED',
  );
  await assert.rejects(
    h.service.addConstructionNode('cmd:node-missing', 'user:1', 'style:unknown', { mdmRef: { entryId: 'mdm:construction:collar-set-in', version: 1 }, sortOrder: 0 }),
    (error) => error?.code === 'PRODUCT_STYLE_NOT_FOUND',
  );
  await assert.rejects(
    h.service.addConstructionNode('cmd:node-wrong-dict', 'user:1', style.id, { mdmRef: { entryId: 'mdm:category:dress', version: 1 }, sortOrder: 0 }),
    (error) => error?.code === 'PRODUCT_MDM_DICTIONARY_MISMATCH',
  );
  assert.equal(h.styleConstructionNodes.size, 0);
});
