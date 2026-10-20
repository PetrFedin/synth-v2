import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectMediaTechPack, techPackDocumentRoute, classifyTechPackDocumentRead,
} from '../scripts/live-app-tech-pack-document.mjs';

const legacy = () => ({
  brandId: 'brand-1', techPackCode: 'TP-COAT-01', status: 'acknowledged',
  issueFormat: 'legacy', dependencySnapshot: { bomVersion: 1 },
});
const canonical = () => ({
  ...legacy(), techPackCode: 'TP/COAT-R02', issueFormat: 'canonical-v1',
});
const canonicalResponse = () => ({
  admission: { admitted: true, documentHash: 'a'.repeat(64), policyHash: 'b'.repeat(64) },
  technicalView: {
    purpose: 'canonical-tech-pack-technical-view',
    header: { techPackCode: 'TP/COAT-R02', brandId: 'brand-1' },
    sourceDocumentHash: 'a'.repeat(64), rightsPolicyHash: 'b'.repeat(64),
    bom: { lines: [{}] }, measurement: { sizes: [{}], points: [{}] },
    operations: { rows: [{}] },
  },
});
const legacyResponse = () => ({
  techPackCode: 'TP-COAT-01', materials: [{}], measurementPoints: [{}],
});

test('chooses a real acknowledged canonical identity before a legacy preview', () => {
  const result = selectMediaTechPack([legacy(), canonical()]);
  assert.equal(result.techPackCode, 'TP/COAT-R02');
  assert.equal(selectMediaTechPack([legacy()]).issueFormat, 'legacy');
  assert.equal(selectMediaTechPack([{ ...legacy(), status: 'draft' }]), null);
  assert.throws(() => selectMediaTechPack({}), /LIST_INVALID/);
  assert.throws(() => selectMediaTechPack([{ ...canonical(), brandId: '' }]), /IDENTITY_INVALID/);
});

test('canonical and legacy routes exactly match the UI for slash-safe and slash codes', () => {
  assert.equal(techPackDocumentRoute(canonical()),
    '/v2/tech-packs/by-code/canonical-document?code=TP%2FCOAT-R02');
  assert.equal(techPackDocumentRoute({ ...canonical(), techPackCode: 'TP-COAT-02' }),
    '/v2/tech-packs/TP-COAT-02/canonical-document');
  assert.equal(techPackDocumentRoute(legacy()), '/v2/tech-packs/TP-COAT-01/document');
  assert.throws(() => techPackDocumentRoute({ ...canonical(), issueFormat: 'broken' }), /IDENTITY_INVALID/);
});

test('canonical read requires exact approved, cost-redacted technical envelope', () => {
  assert.deepEqual(classifyTechPackDocumentRead(canonical(), 200, canonicalResponse()), {
    admission: 'admitted', kind: 'canonical', visible: true,
  });
  for (const malformed of [
    { ...canonicalResponse(), admission: { ...canonicalResponse().admission, admitted: false } },
    { ...canonicalResponse(), admission: { ...canonicalResponse().admission, documentHash: 'different' } },
    { ...canonicalResponse(), technicalView: { ...canonicalResponse().technicalView, header: { techPackCode: 'OTHER', brandId: 'brand-1' } } },
    { ...canonicalResponse(), technicalView: { ...canonicalResponse().technicalView, measurement: { sizes: [], points: [] } } },
  ]) {
    assert.throws(() => classifyTechPackDocumentRead(canonical(), 200, malformed), /CONTRACT_INVALID/);
  }
});

test('current rights denial is a blocked read, never an issued-document screenshot', () => {
  assert.deepEqual(classifyTechPackDocumentRead(canonical(), 422, {
    error: { code: 'TECH_PACK_CANONICAL_RENDER_NOT_ADMITTED' },
  }), {
    admission: 'blocked: TECH_PACK_CANONICAL_RENDER_NOT_ADMITTED',
    kind: 'canonical', visible: false,
  });
  assert.throws(() => classifyTechPackDocumentRead(canonical(), 422, {
    error: { code: 'TECH_PACK_CANONICAL_PRINT_NOT_ADMITTED' },
  }), /HTTP_INVALID/);
  assert.throws(() => classifyTechPackDocumentRead(canonical(), 403, {}), /HTTP_INVALID/);
  assert.throws(() => classifyTechPackDocumentRead(canonical(), 200, {}),
    /CONTRACT_INVALID/);
});

test('legacy document stays visibly marked as historical and cannot masquerade as canonical', () => {
  assert.deepEqual(classifyTechPackDocumentRead(legacy(), 200, legacyResponse()), {
    admission: 'legacy-admitted', kind: 'legacy', visible: true,
  });
  assert.throws(() => classifyTechPackDocumentRead(legacy(), 200, canonicalResponse()),
    /LEGACY_DOCUMENT_CONTRACT_INVALID/);
});
