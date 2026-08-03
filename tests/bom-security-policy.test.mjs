import assert from 'node:assert/strict';
import test from 'node:test';
import { BOM_SECURITY_POLICY } from '../src/application/bom-security-note.mjs';
import { roleHasCapability, CAPABILITIES } from '../src/modules/access-control/public.mjs';

test('BOM cost policy grants management only to owner/admin and read access to finance', () => {
  assert.deepEqual([...BOM_SECURITY_POLICY.manageRoles], ['owner', 'admin']);
  assert.deepEqual([...BOM_SECURITY_POLICY.readRoles], ['owner', 'admin', 'finance']);
  assert.equal(roleHasCapability('owner', CAPABILITIES.BOM_MANAGE), true);
  assert.equal(roleHasCapability('admin', CAPABILITIES.BOM_MANAGE), true);
  assert.equal(roleHasCapability('finance', CAPABILITIES.BOM_READ), true);
  assert.equal(roleHasCapability('sales', CAPABILITIES.BOM_READ), false);
  assert.equal(roleHasCapability('finance', CAPABILITIES.BOM_MANAGE), false);
});
