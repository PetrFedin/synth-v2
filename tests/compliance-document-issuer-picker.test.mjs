import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { CAPABILITIES, roleHasCapability } from '../src/modules/access-control/public.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(root, 'public', 'modules', name), 'utf8');
const [capabilitiesSource, documentsSource, legalEntitiesSource] = await Promise.all(['ui-capabilities.js', 'compliance-documents.js', 'legal-entities.js'].map(read));

const ISSUERS = [
  { id: 'legal-entity_1', organisationId: 'org-1', entityCode: 'RU-MAIN', status: 'active', nameRu: 'ООО Синта', nameEn: 'Synta LLC', jurisdiction: 'RU' },
  { id: 'legal-entity_2', organisationId: 'org-1', entityCode: 'EU-OLD', status: 'archived', nameRu: 'Старое', nameEn: null, jurisdiction: 'FOREIGN' },
];

// Песочница экрана: сеть записывается, а ответы выдаются по тому, что сервер ответил бы роли.
function screen(role) {
  const requests = [];
  const forms = [];
  const window = {};
  window.window = window;
  vm.runInContext(capabilitiesSource, vm.createContext({ window, Object, Array, Map, Set }));
  Object.assign(window, {
    Object, Array, String, Promise, encodeURIComponent,
    localText: (ru) => ru,
    state: {
      view: 'other',
      workspace: { memberships: [{ organisationId: 'org-1', role, status: 'active' }], organisations: [{ id: 'org-1', type: 'brand', name: 'Бренд' }] },
    },
    ownOrganisations: () => [{ id: 'org-1', name: 'Бренд' }],
    renderApp() {},
    api: async (url) => {
      requests.push(url);
      const manages = roleHasCapability(role, CAPABILITIES.ORGANISATION_MANAGE);
      if (url.endsWith('/legal-entities')) {
        if (!manages) throw Object.assign(new Error('forbidden'), { forbidden: true });
        return [];
      }
      if (url.endsWith('/legal-entity-issuers')) {
        if (!manages && !roleHasCapability(role, CAPABILITIES.COMPLIANCE_DOCUMENT_MANAGE)) throw Object.assign(new Error('forbidden'), { forbidden: true });
        return ISSUERS;
      }
      if (url.endsWith('/compliance-documents')) return [];
      throw new Error(`unexpected ${url}`);
    },
    selectDef: (id, label, options) => ({ id, label, options }),
    optionalSelectDef: (id, label, options) => ({ id, label, options }),
    textDef: (id, label) => ({ id, label }),
    openForm: (title, defs) => { forms.push(defs); },
  });
  const context = vm.createContext(window);
  vm.runInContext(legalEntitiesSource, context);
  vm.runInContext(documentsSource, context);
  return { window, requests, forms };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('the issuer picker of a finance user is filled from the issuers list, which finance may read', async () => {
  assert.equal(roleHasCapability('finance', CAPABILITIES.ORGANISATION_MANAGE), false);
  assert.equal(roleHasCapability('finance', CAPABILITIES.COMPLIANCE_DOCUMENT_MANAGE), true);
  const { window, requests, forms } = screen('finance');
  window.complianceDocumentRows();
  await settle();
  window.complianceDocumentForm();
  const issuerField = forms[0].find((field) => field.id === 'issuerLegalEntityId');
  assert.deepEqual(issuerField.options.map((option) => option.id), ['legal-entity_1'], 'only active legal entities are offered');
  assert.match(issuerField.options[0].name, /RU-MAIN/);
  assert.match(issuerField.options[0].name, /ООО Синта/);
  assert.ok(requests.some((url) => url === '/v2/organisations/org-1/legal-entity-issuers'));
  assert.ok(!requests.some((url) => url.endsWith('/legal-entities')), 'the full list with requisites is never requested');
});

test('the issuer column names the legal entity from the issuers list, not by a raw id', async () => {
  const { window } = screen('finance');
  window.complianceDocumentRows();
  await settle();
  assert.equal(window.legalEntityLabel('org-1', 'legal-entity_1'), 'RU-MAIN (ООО Синта)');
  assert.equal(window.legalEntityLabel('org-1', 'legal-entity_2'), 'EU-OLD (Старое)', 'an archived issuer is still named in an existing document');
  assert.match(window.legalEntityLabel('org-1', 'legal-entity_zzz999'), /^Юрлицо /);
});

test('an owner uses the same issuers list, and a role without either right does not ask at all', async () => {
  const owner = screen('owner');
  owner.window.complianceDocumentRows();
  await settle();
  assert.ok(!owner.requests.some((url) => url.endsWith('/legal-entities')));
  assert.equal(owner.window.legalEntityLabel('org-1', 'legal-entity_1'), 'RU-MAIN (ООО Синта)');

  for (const role of ['sales', 'production', 'quality', 'viewer']) {
    if (roleHasCapability(role, CAPABILITIES.ORGANISATION_MANAGE) || roleHasCapability(role, CAPABILITIES.COMPLIANCE_DOCUMENT_MANAGE)) continue;
    const reader = screen(role);
    reader.window.complianceDocumentRows();
    await settle();
    assert.ok(!reader.requests.some((url) => url.endsWith('/legal-entity-issuers') || url.endsWith('/legal-entities')), `${role} asks for no legal entities`);
  }
});
