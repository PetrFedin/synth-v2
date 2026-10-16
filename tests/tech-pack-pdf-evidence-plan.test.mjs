import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../src/core/fingerprints.mjs';
import { completeCanonicalTechPackFixture } from './helpers/canonical-tech-pack-document-fixture.mjs';
import { buildFrozenCanonicalTechPackDocument } from '../src/application/tech-pack-frozen-document.mjs';
import { evaluateCanonicalTechPackRenderAdmission } from '../src/application/tech-pack-public-render-policy.mjs';
import { buildCanonicalTechPackPdfEvidencePlan } from '../src/application/tech-pack-pdf-evidence-plan.mjs';

const evaluatedAt = '2026-10-15T12:00:00.000Z';
const currentRight = (overrides = {}) => ({
  id: 'rights-now', mediaId: 'media-1', version: 2, status: 'cleared',
  basis: 'brand-owned', evidenceRef: 'contract://2',
  approvedAt: '2026-10-15T10:00:00.000Z',
  approvedBy: 'rights-officer', validUntil: null, ...overrides,
});
const digest = value => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
function admitted() {
  const document = buildFrozenCanonicalTechPackDocument(completeCanonicalTechPackFixture());
  const admission = evaluateCanonicalTechPackRenderAdmission(document, [currentRight()], evaluatedAt);
  assert.equal(admission.admitted, true);
  return { document, admission };
}

test('PDF evidence plan is deterministic, immutable and explicitly does not produce or admit PDF', () => {
  const envelope = admitted();
  const before = canonicalJson(envelope);
  const first = buildCanonicalTechPackPdfEvidencePlan(envelope, { locale: 'ru' });
  const again = buildCanonicalTechPackPdfEvidencePlan(envelope, { locale: 'ru' });
  assert.deepEqual(first, again);
  assert.match(first.planHash, /^[a-f0-9]{64}$/);
  const { planHash, ...planBody } = first;
  assert.equal(planHash, digest(planBody));
  assert.equal(first.pdfBytesProduced, false);
  assert.equal(first.publicPrintAdmitted, false);
  assert.ok(first.remainingGates.includes('CURRENT_RIGHTS_RECHECK_AT_EXPORT'));
  assert.ok(first.remainingGates.includes('RU_EN_FONT_BINARY_GLYPH_COVERAGE_VERIFIED'));
  assert.equal(first.documentHash, envelope.document.documentHash);
  assert.equal(first.rightsPolicyHash, envelope.admission.policyHash);
  assert.equal(canonicalJson(envelope), before);
  assert.equal(Object.isFrozen(first.content.bom.lines[0]), true);
});

test('PDF content uses exact issued RU/EN names and size-value IDs, not current MDM labels', () => {
  const envelope = admitted();
  const ru = buildCanonicalTechPackPdfEvidencePlan(envelope, { locale: 'ru' });
  const en = buildCanonicalTechPackPdfEvidencePlan(envelope, { locale: 'en' });
  assert.equal(ru.content.identity.styleName, 'Куртка');
  assert.equal(en.content.identity.styleName, 'Jacket');
  assert.equal(ru.content.identity.colorName, 'Чёрный');
  assert.equal(en.content.identity.colorName, 'Black');
  assert.equal(ru.content.measurements.points[0].label, 'Chest RU');
  assert.equal(en.content.measurements.points[0].label, 'Chest EN');
  assert.deepEqual(ru.content.measurements.points[0].values.map(x => [x.sizeValueId, x.value]),
    [['size-s', 108.25], ['size-m', 112.125]]);
  assert.equal(ru.content.measurements.chartVersion, 2);
  assert.equal(ru.documentHash, en.documentHash);
  assert.notEqual(ru.planHash, en.planHash);
});

test('PDF content keeps exact issued material amounts and sample/operation evidence', () => {
  const result = buildCanonicalTechPackPdfEvidencePlan(admitted(), { locale: 'en' });
  const line = result.content.bom.lines[0];
  assert.equal(line.unitCostSnapshot, 12.3456);
  assert.equal(line.exchangeRate, 0.810005184);
  assert.equal(line.materialCurrency, 'USD');
  assert.equal(line.grossQuantity, 2.1);
  assert.equal(result.content.bom.totalCost, 49);
  assert.equal(result.content.preProductionSample.sampleCode, 'PPS-01');
  assert.equal(result.content.operations.rows[0].label, 'Assembly');
  assert.equal(result.content.operations.totalStandardMinutes, 3.25);
});

test('PDF media plan names only retained content-addressed evidence, not mutable image aliases', () => {
  const plan = buildCanonicalTechPackPdfEvidencePlan(admitted());
  const asset = plan.requiredAssets[0];
  assert.equal(asset.mediaId, 'media-1');
  assert.equal(asset.contentSha256, 'e'.repeat(64));
  assert.equal(asset.retainedStorageVersion, 'v1');
  assert.equal(asset.mimeType, 'image/png');
  assert.equal(asset.issuedRightsVersion, 1);
  assert.equal(asset.currentRightsVersion, 2);
  assert.equal(JSON.stringify(plan).includes('s3://alias/front.png'), false);
  assert.equal(plan.content.images[0].contentSha256, asset.contentSha256);
});

test('current restricted, revoked or stale rights cannot create a PDF plan', () => {
  const document = admitted().document;
  for (const right of [
    currentRight({ status: 'restricted' }),
    currentRight({ status: 'revoked' }),
    currentRight({ version: 0, id: 'rights-zero' }),
  ]) {
    // Invalid source rights may be rejected by policy itself; neither is a PDF admission.
    if (right.version === 0) {
      assert.throws(() => evaluateCanonicalTechPackRenderAdmission(document, [right], evaluatedAt));
      continue;
    }
    const admission = evaluateCanonicalTechPackRenderAdmission(document, [right], evaluatedAt);
    assert.equal(admission.admitted, false);
    assert.throws(() => buildCanonicalTechPackPdfEvidencePlan({ document, admission }),
      { code: 'TECH_PACK_PDF_PLAN_RIGHTS_NOT_ADMITTED' });
  }
});

test('a contradictory or tampered rights-policy hash fails closed', () => {
  const envelope = admitted();
  const altered = JSON.parse(JSON.stringify(envelope.admission));
  altered.decisions[0].currentStatus = 'revoked';
  assert.throws(() => buildCanonicalTechPackPdfEvidencePlan({
    document: envelope.document, admission: altered,
  }), { code: 'TECH_PACK_PDF_PLAN_POLICY_HASH_INVALID' });
  const { policyHash: ignored, ...untrustedBody } = altered;
  altered.policyHash = digest(untrustedBody);
  assert.throws(() => buildCanonicalTechPackPdfEvidencePlan({
    document: envelope.document, admission: altered,
  }), { code: 'TECH_PACK_PDF_PLAN_IMAGE_RIGHTS_INVALID' });
});

test('incomplete issued evidence and mutated frozen document are rejected before content is projected', () => {
  const envelope = admitted();
  const modified = JSON.parse(JSON.stringify(envelope.document));
  modified.bom.totalCost = 1000000;
  assert.throws(() => buildCanonicalTechPackPdfEvidencePlan({
    document: modified, admission: envelope.admission,
  }), { code: 'TECH_PACK_PDF_PLAN_DOCUMENT_TAMPERED' });
  const incomplete = buildFrozenCanonicalTechPackDocument(
    completeCanonicalTechPackFixture({ operations: false }));
  const denied = evaluateCanonicalTechPackRenderAdmission(incomplete, [currentRight()], evaluatedAt);
  assert.throws(() => buildCanonicalTechPackPdfEvidencePlan({
    document: incomplete, admission: denied,
  }), { code: 'TECH_PACK_PDF_PLAN_DOCUMENT_INVALID' });
});

test('an unsupported frozen raster format blocks future embedding without changing issue history', () => {
  const envelope = admitted();
  const document = JSON.parse(JSON.stringify(envelope.document));
  document.sketches.rows[0].retainedAsset.mimeType = 'image/webp';
  const { documentHash, ...body } = document;
  document.documentHash = digest(body);
  const admission = evaluateCanonicalTechPackRenderAdmission(document, [currentRight()], evaluatedAt);
  assert.equal(admission.admitted, true); // Browsing and PDF embedding are distinct gates.
  assert.throws(() => buildCanonicalTechPackPdfEvidencePlan({ document, admission }),
    { code: 'TECH_PACK_PDF_PLAN_IMAGE_ASSET_INVALID' });
});

test('wrong size-value lineage and mismatched policy document hash block the PDF plan', () => {
  const envelope = admitted();
  const patched = JSON.parse(JSON.stringify(envelope.document));
  patched.measurement.points[0].cells[0].sizeValueId = 'size-unrelated';
  const { documentHash, ...body } = patched;
  patched.documentHash = digest(body);
  const admission = evaluateCanonicalTechPackRenderAdmission(patched, [currentRight()], evaluatedAt);
  assert.throws(() => buildCanonicalTechPackPdfEvidencePlan({
    document: patched, admission,
  }), { code: 'TECH_PACK_PDF_PLAN_MATRIX_INVALID' });
  assert.throws(() => buildCanonicalTechPackPdfEvidencePlan({
    document: envelope.document,
    admission: { ...envelope.admission, documentHash: 'f'.repeat(64) },
  }), { code: 'TECH_PACK_PDF_PLAN_RIGHTS_NOT_ADMITTED' });
});

test('unsupported output locale is rejected; no silent guessed translation', () => {
  assert.throws(() => buildCanonicalTechPackPdfEvidencePlan(admitted(), { locale: 'it' }),
    { code: 'TECH_PACK_PDF_PLAN_LOCALE_INVALID' });
});
