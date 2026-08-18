import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const forms = await readFile(new URL('../public/modules/forms-3.js', import.meta.url), 'utf8');
const actions = await readFile(new URL('../public/modules/order-lifecycle-actions.js', import.meta.url), 'utf8');
const legacyViews = await readFile(new URL('../public/modules/views-4.js', import.meta.url), 'utf8');
const dom = await readFile(new URL('../public/modules/dom-1.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('Order Builder UI sends fresh versions and exposes safe term revision', () => {
  assert.match(forms, /expectedVersion: order\.version/);
  assert.match(forms, /max: 365/);
  assert.doesNotMatch(forms, /max: 3650/);
  assert.match(forms, /minLength: 3, maxLength: 1000/);
  assert.ok(actions.includes('/terms') && actions.includes("'PATCH'"));
  assert.match(actions, /orderId: item\.id, organisationId, expectedVersion: item\.version/);
  assert.ok(actions.includes('/attach') && actions.includes('expectedVersion: item.version'));
  assert.match(actions, /orderTermsEditForm\(item\)/);
});

test('commercial cycle actions expose only valid state-machine commands', () => {
  assert.match(actions, /options\?\.scope !== 'od-cycles'/);
  assert.match(actions, /index < STAGES\.indexOf\('showroom'\)/);
  assert.match(actions, /item\.stage === 'order'/);
  assert.match(actions, /item\.order\?\.status === 'attached'/);
  assert.match(actions, /cycleId: item\.id, targetStage/);
  assert.doesNotMatch(actions, /item\.stage === 'confirmation'/);

  assert.match(legacyViews, /item\.stage === 'order'/);
  assert.match(legacyViews, /item\.order\?\.status === 'attached'/);
  assert.match(legacyViews, /cycleId: item\.id, targetStage: STAGES\[index\+1\]/);
  assert.doesNotMatch(legacyViews, /item\.stage === 'confirmation'/);
  assert.match(legacyViews, /orderId: item\.id, organisationId: orgId, expectedVersion: item\.version/);
  assert.match(legacyViews, /\/attach`, \{ expectedVersion: item\.version \}/);
});

test('versioned actions load after Omnidata and before polish', () => {
  const workspace = index.indexOf('/ui/omnidata-workspace.js');
  const lifecycle = index.indexOf('/ui/order-lifecycle-actions.js');
  const polish = index.indexOf('/ui/omnidata-polish.js');
  assert.ok(workspace >= 0 && lifecycle > workspace && polish > lifecycle);
});

test('shared form controls preserve initial select and date values', () => {
  assert.match(dom, /field\.value !== undefined/);
  assert.match(dom, /function dateDef\(name, label, value = ''\)/);
  assert.match(dom, /function selectDef\(name, label, options, format, value\)/);
});
