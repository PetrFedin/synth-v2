import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const forms = await readFile(new URL('../public/modules/forms-3.js', import.meta.url), 'utf8');
const omnidata = await readFile(new URL('../public/modules/omnidata-workspace.js', import.meta.url), 'utf8');
const dom = await readFile(new URL('../public/modules/dom-1.js', import.meta.url), 'utf8');

test('Order Builder UI sends fresh versions and exposes safe term revision', () => {
  assert.match(forms, /expectedVersion: order\.version/);
  assert.match(forms, /max: 365/);
  assert.doesNotMatch(forms, /max: 3650/);
  assert.match(forms, /minLength: 3, maxLength: 1000/);
  assert.ok(forms.includes('/terms') && forms.includes("'PATCH'"));
  assert.match(omnidata, /organisationId: orgId, expectedVersion: item\.version/);
  assert.ok(omnidata.includes('/attach') && omnidata.includes('expectedVersion: item.version'));
  assert.match(omnidata, /orderTermsEditForm\(item\)/);
});

test('shared form controls preserve initial select and date values', () => {
  assert.match(dom, /field\.value !== undefined/);
  assert.match(dom, /function dateDef\(name, label, value = ''\)/);
  assert.match(dom, /function selectDef\(name, label, options, format, value\)/);
});
