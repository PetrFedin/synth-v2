import assert from 'node:assert/strict';
import test from 'node:test';
import { assertBomManage, assertBomRead } from '../src/application/bom-access.mjs';

test('BOM access guards separate management and finance read access', () => {
  assert.doesNotThrow(() => assertBomManage({ role: 'owner', status: 'active', organisationId: 'brand-1' }));
  assert.doesNotThrow(() => assertBomRead({ role: 'finance', status: 'active', organisationId: 'brand-1' }));
  assert.throws(() => assertBomManage({ role: 'finance', status: 'active', organisationId: 'brand-1' }), { code: 'CAPABILITY_DENIED' });
  assert.throws(() => assertBomRead({ role: 'sales', status: 'active', organisationId: 'brand-1' }), { code: 'CAPABILITY_DENIED' });
});
