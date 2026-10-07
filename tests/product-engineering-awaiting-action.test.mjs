import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitingActionType, rolesForAwaitingAction } from '../src/modules/awaiting-action/public.mjs';
import { CAPABILITIES, ROLE_CAPABILITIES } from '../src/modules/access-control/public.mjs';

test('AI technical review is a first-class Awaiting Action with its own capability',()=>{
  const entry=awaitingActionType('technical-review');
  assert.equal(entry.capability,CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
  assert.equal(entry.view,'styles');
  assert.equal(entry.target.tab,'engineering');
  const roles=[...rolesForAwaitingAction('technical-review')].sort();
  assert.deepEqual(roles,['admin','owner','production','sales']);
  for(const role of roles) assert.ok(ROLE_CAPABILITIES[role].includes(CAPABILITIES.PRODUCT_ENGINEERING_MANAGE));
  assert.ok(ROLE_CAPABILITIES.quality.includes(CAPABILITIES.PRODUCT_ENGINEERING_READ));
  assert.ok(!ROLE_CAPABILITIES.quality.includes(CAPABILITIES.PRODUCT_ENGINEERING_MANAGE));
  assert.ok(!ROLE_CAPABILITIES.viewer.includes(CAPABILITIES.PRODUCT_ENGINEERING_READ));
});
