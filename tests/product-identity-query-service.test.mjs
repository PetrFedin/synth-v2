import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductIdentityQueryService } from '../src/application/product-identity-query-service.mjs';

const style = Object.freeze({ id: 'style:1', brandId: 'brand:1', styleCode: 'DRS-001', lifecycleStatus: 'draft', version: 1 });
const sizeScale = Object.freeze({ id: 'scale:1', brandId: 'brand:1', scaleCode: 'WOMENS-INT', status: 'active', version: 2 });

function membership(role) { return Object.freeze({ id: `m:${role}`, organisationId: 'brand:1', organisationType: 'brand', userId: `user:${role}`, role, status: 'active' }); }

function readerFor(role = 'viewer') {
  return {
    getMembership: async () => membership(role),
    getStyle: async (id) => id === style.id ? style : undefined,
    getStyleAggregate: async (_id, versionNo) => ({ style, styleVersion: versionNo === 9 ? null : { id: 'style-version:1', versionNo: 1 }, colorways: [], styleMedia: [], styleAttributes: [], mdmUsage: [] }),
    getSizeScale: async (id) => id === sizeScale.id ? sizeScale : undefined,
    getSizeScaleAggregate: async (_id, versionNo) => ({ sizeScale, sizeScaleVersion: versionNo === 9 ? null : { id: 'scale-version:2', versionNo: 2 }, values: [], mdmUsage: [] }),
  };
}

test('viewer can read technical Product Identity aggregates but buyer cannot', async () => {
  const viewer = createProductIdentityQueryService({ reader: readerFor('viewer') });
  const result = await viewer.getStyleForActor('user:viewer', style.id);
  assert.equal(result.style.id, style.id);
  assert(Object.isFrozen(result));

  const buyer = createProductIdentityQueryService({ reader: readerFor('buyer') });
  await assert.rejects(
    buyer.getStyleForActor('user:buyer', style.id),
    (error) => error?.code === 'CAPABILITY_DENIED',
  );
});

test('explicit missing StyleVersion and SizeScaleVersion fail with 404-class domain codes', async () => {
  const service = createProductIdentityQueryService({ reader: readerFor('viewer') });
  await assert.rejects(
    service.getStyleForActor('user:viewer', style.id, { versionNo: '9' }),
    (error) => error?.code === 'PRODUCT_STYLE_VERSION_NOT_FOUND',
  );
  await assert.rejects(
    service.getSizeScaleForActor('user:viewer', sizeScale.id, { versionNo: 9 }),
    (error) => error?.code === 'PRODUCT_SIZE_SCALE_VERSION_NOT_FOUND',
  );
});

test('versionNo query validation rejects zero, negative and malformed values', async () => {
  const service = createProductIdentityQueryService({ reader: readerFor('viewer') });
  for (const versionNo of ['0', '-1', '1.5', 'abc']) {
    await assert.rejects(
      service.getStyleForActor('user:viewer', style.id, { versionNo }),
      (error) => error?.code === 'PRODUCT_VERSION_FILTER_INVALID',
    );
  }
});
