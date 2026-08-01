import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { CAPABILITIES, ROLE_CAPABILITIES, roleHasCapability } from '../src/modules/access-control/public.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public', 'modules', 'ui-capabilities.js'), 'utf8');

function loadBrowserMatrix() {
  const window = {};
  window.window = window;
  vm.runInContext(source, vm.createContext({ window, Object, Array, Map, Set }));
  return window.SynthaUiCapabilities;
}

test('browser mutation capability matrix matches backend roles', () => {
  const browser = loadBrowserMatrix();
  const mutationCapabilities = Object.values(browser.CAPABILITIES);
  for (const role of Object.keys(ROLE_CAPABILITIES)) {
    const workspace = {
      memberships: [{ organisationId: 'org-1', role, status: 'active' }],
      organisations: [{ id: 'org-1', type: role === 'buyer' ? 'shop' : 'brand' }],
    };
    for (const capability of mutationCapabilities) {
      assert.equal(
        browser.hasForOrganisation(workspace, 'org-1', capability),
        roleHasCapability(role, capability),
        `${role} mismatch for ${capability}`,
      );
    }
  }
});

test('inactive memberships and unrelated organisations grant no UI actions', () => {
  const browser = loadBrowserMatrix();
  const workspace = {
    memberships: [{ organisationId: 'org-1', role: 'owner', status: 'inactive' }],
    organisations: [{ id: 'org-1', type: 'brand' }, { id: 'org-2', type: 'shop' }],
  };
  assert.equal(browser.hasAny(workspace, CAPABILITIES.CAMPAIGN_MANAGE), false);
  assert.equal(browser.hasForOrganisation(workspace, 'org-1', CAPABILITIES.CAMPAIGN_MANAGE), false);
  assert.equal(browser.hasForTrade(workspace, 'org-1', 'org-2', CAPABILITIES.ORDER_WRITE), false);
});

test('organisation type filtering returns only actionable memberships', () => {
  const browser = loadBrowserMatrix();
  const workspace = {
    memberships: [
      { organisationId: 'brand-1', role: 'sales', status: 'active' },
      { organisationId: 'shop-1', role: 'buyer', status: 'active' },
      { organisationId: 'brand-view', role: 'viewer', status: 'active' },
    ],
    organisations: [
      { id: 'brand-1', type: 'brand' },
      { id: 'shop-1', type: 'shop' },
      { id: 'brand-view', type: 'brand' },
    ],
  };
  assert.deepEqual(Array.from(browser.organisationIds(workspace, CAPABILITIES.CATALOG_MANAGE, 'brand')), ['brand-1']);
  assert.deepEqual(Array.from(browser.organisationIds(workspace, CAPABILITIES.SELECTION_WRITE, 'shop')), ['shop-1']);
});
