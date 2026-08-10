import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

import { CAPABILITIES, ROLE_CAPABILITIES } from '../src/modules/access-control/public.mjs';

const source = await readFile(new URL('../public/modules/ui-capabilities.js', import.meta.url), 'utf8');
const window = {};
vm.runInNewContext(source, { window }, { filename: 'public/modules/ui-capabilities.js' });
const ui = window.SynthaUiCapabilities;

test('UI capability constants stay exactly aligned with backend access control', () => {
  assert.ok(ui);
  assert.deepEqual(
    Object.entries(ui.CAPABILITIES).sort(([left], [right]) => left.localeCompare(right)),
    Object.entries(CAPABILITIES).sort(([left], [right]) => left.localeCompare(right)),
  );
});

test('UI role capability decisions stay exactly aligned with backend access control', () => {
  for (const [role, backendCapabilities] of Object.entries(ROLE_CAPABILITIES)) {
    const workspace = {
      memberships: [{
        id: `membership-${role}`,
        organisationId: 'organisation-1',
        userId: 'actor-1',
        status: 'active',
        role,
      }],
      organisations: [{ id: 'organisation-1', type: 'brand' }],
    };
    const backendSet = new Set(backendCapabilities);

    for (const capability of Object.values(CAPABILITIES)) {
      assert.equal(
        ui.hasForOrganisation(workspace, 'organisation-1', capability),
        backendSet.has(capability),
        `Role ${role} diverges for ${capability}`,
      );
    }
  }
});

test('inactive UI memberships never grant backend capabilities', () => {
  const workspace = {
    memberships: [{ organisationId: 'organisation-1', status: 'inactive', role: 'owner' }],
    organisations: [{ id: 'organisation-1', type: 'brand' }],
  };

  for (const capability of Object.values(CAPABILITIES)) {
    assert.equal(ui.hasForOrganisation(workspace, 'organisation-1', capability), false);
  }
});