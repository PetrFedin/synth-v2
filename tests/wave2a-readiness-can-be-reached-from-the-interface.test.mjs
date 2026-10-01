import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { EXTERNAL_EVIDENCE_CAPABILITIES } from '../src/application/product-readiness-service.mjs';
import { CAPABILITIES } from '../src/modules/access-control/public.mjs';

// P-01: из интерфейса модель нельзя было довести до «готова». Соответствие требуется на каждом
// маршруте, а форма оценки внешних подтверждений не спрашивала — и тот, чья роль вправе их
// подтверждать, не мог этого сделать нигде, кроме скрипта.

const source = await readFile(path.join(process.cwd(), 'public/modules/product-readiness-assessment.js'), 'utf8');
const CAPS = {
  PRODUCT_MANAGE: 'product.manage', SOURCING_AWARD: 'sourcing.award', PRODUCTION_ORDER_CONFIRM: 'production-order.confirm',
  MATERIAL_PURCHASE_MANAGE: 'material-purchase.manage', QUALITY_APPROVE: 'quality.approve',
  PRODUCT_CERTIFICATION_MANAGE: 'product-certification.manage', COMPLIANCE_DOCUMENT_MANAGE: 'compliance-document.manage',
};

function harness({ held }) {
  const calls = { forms: [], mutations: [] };
  const w = { Object, Map, Set, String, Array, Number, Math, Promise, RegExp, Error, queueMicrotask, setTimeout, encodeURIComponent, JSON, Date, TextEncoder, Uint8Array, crypto: globalThis.crypto };
  w.window = w;
  w.odText = (ru) => ru;
  w.state = { workspace: {}, user: { actorId: 'user-7' } };
  w.toast = () => {};
  w.textDef = (name, label, value) => ({ name, label, value, kind: 'text' });
  w.numberDef = (name, label, value) => ({ name, label, value, kind: 'number' });
  w.dateDef = (name, label, value) => ({ name, label, value, kind: 'date' });
  w.selectDef = (name, label, options, _format, value) => ({ name, label, options, value, kind: 'select' });
  w.actionButton = (label, fn) => ({ kind: 'button', label, fn });
  w.openForm = (title, fields, submit) => { calls.forms.push({ title, fields, submit }); };
  w.mutate = async (p, body) => { calls.mutations.push({ path: p, body }); return {}; };
  w.api = async (p) => (p.startsWith('/v2/product/styles/') ? { styleMedia: [{ id: 'media-1', mediaType: 'image', mediaRole: 'hero' }], colorways: [] } : (p.startsWith('/v2/product/pack-ratio') ? [] : {}));
  w.SynthaUiValidation = {
    number: (value, _l, { integer } = {}) => (integer ? Number.parseInt(value, 10) : Number(value)),
    requiredText: (value) => String(value).trim(),
    currency: (value) => String(value).toUpperCase(),
    dateRange: () => ({}),
  };
  w.SynthaUiCapabilities = { CAPABILITIES: CAPS, hasForOrganisation: (_workspace, _brand, capability) => held.includes(capability) };
  vm.runInContext(source, vm.createContext(w));
  return { module: w.SynthaProductReadinessAssessment, calls };
}

const product = Object.freeze({ id: 'style-1', styleVersionId: 'style-version-1', brandId: 'brand-1', titleRu: 'Куртка', titleEn: 'Jacket' });
const base = { developmentRoute: 'OWN_DEVELOPMENT', titleRu: 'ab', titleEn: 'ab', descriptionRu: 'ab', descriptionEn: 'ab', compositionRu: 'ab', compositionEn: 'ab', countryOfOrigin: 'TR', currency: 'EUR', wholesalePrice: '1', rrp: '2', minimumOrderQuantity: '1', deliveryStart: '2027-01-01', deliveryEnd: '2027-02-01', availabilityMode: 'preorder', availabilityQuantity: '0', attributeCoverageConfirmed: 'yes' };

test('a person whose role may confirm compliance sees the confirmation fields; a person who may only assess does not', async () => {
  const owner = harness({ held: Object.values(CAPS) });
  await owner.module.assessForm(product);
  const names = owner.calls.forms[0].fields.map((f) => f.name);
  assert.ok(names.includes('evidence_compliance') && names.includes('evidenceRef_compliance'));

  const seller = harness({ held: [CAPS.PRODUCT_MANAGE] });
  await seller.module.assessForm(product);
  assert.equal(seller.calls.forms[0].fields.some((f) => f.name.startsWith('evidence')), false);
});

test('confirming compliance sends a signed attestation the service can verify', async () => {
  const { module, calls } = harness({ held: Object.values(CAPS) });
  await module.assessForm(product);
  await calls.forms[0].submit({ ...base, evidence_compliance: 'yes', evidenceRef_compliance: 'ЕАЭС N RU Д-TR.123' });
  const evidence = calls.mutations[0].body.externalEvidence.compliance;
  assert.equal(evidence.status, 'ready');
  assert.equal(evidence.sourceSystem, 'syntha-attestation');
  assert.equal(evidence.approvedBy, 'user-7');
  assert.equal(evidence.version, 'ЕАЭС N RU Д-TR.123');
  assert.match(evidence.contentHash, /^[0-9a-f]{64}$/);
  assert.match(evidence.evidenceId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/);
  assert.ok(Math.abs(Date.now() - Date.parse(evidence.approvedAt)) < 60_000, 'the form stamps the time itself');
  assert.equal(Object.keys(calls.mutations[0].body.externalEvidence).length, 1);
});

test('without a confirmation nothing external is sent', async () => {
  const { module, calls } = harness({ held: Object.values(CAPS) });
  await module.assessForm(product);
  await calls.forms[0].submit({ ...base, evidence_compliance: 'no' });
  assert.equal(calls.mutations[0].body.externalEvidence, undefined);
});

test('a confirmation needs the document it rests on', async () => {
  const { module, calls } = harness({ held: Object.values(CAPS) });
  await module.assessForm(product);
  await assert.rejects(() => calls.forms[0].submit({ ...base, evidence_compliance: 'yes', evidenceRef_compliance: ' ' }), (e) => e.code === 'EVIDENCE_REFERENCE_REQUIRED');
  assert.equal(calls.mutations.length, 0);
});

test('a dimension the platform establishes itself on the chosen route cannot be confirmed by hand', async () => {
  const { module, calls } = harness({ held: Object.values(CAPS) });
  await module.assessForm(product);
  await assert.rejects(() => calls.forms[0].submit({ ...base, evidence_quality: 'yes', evidenceRef_quality: 'QC-1' }), (e) => e.code === 'EVIDENCE_NOT_ALLOWED_FOR_ROUTE');
  await calls.forms[0].submit({ ...base, developmentRoute: 'READY_GOODS', evidence_quality: 'yes', evidenceRef_quality: 'QC-1' });
  assert.deepEqual(Object.keys(calls.mutations[0].body.externalEvidence), ['quality']);
});

test('the form offers exactly the dimensions and roles the service accepts, so no button always answers with a refusal', () => {
  const { module } = harness({ held: [] });
  const serverByCode = Object.fromEntries(Object.entries(EXTERNAL_EVIDENCE_CAPABILITIES).map(([code, caps]) => [code, [...caps].sort()]));
  const clientByCode = Object.fromEntries(module.evidenceDimensions.map((d) => [d.code, d.capabilities.map((name) => CAPABILITIES[name]).sort()]));
  assert.deepEqual(JSON.parse(JSON.stringify(clientByCode)), serverByCode);
});
