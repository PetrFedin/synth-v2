import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../src/core/fingerprints.mjs';
import { buildCanonicalTechPackIssueSnapshot, verifyFrozenCanonicalTechPackSources } from '../src/application/tech-pack-canonical-issue-snapshot.mjs';
import { bindIssuedTechPackDocumentContext, readFrozenTechPackDocumentContext } from '../src/application/tech-pack-issued-document-context.mjs';
import { documentSourcesFixture } from './helpers/tech-pack-document-context-fixture.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const pack = { id: 'pack-1', techPackCode: 'TP/2026/001', sku: 'SKU-01', brandId: 'brand-1',
    skuVersion: 2, revision: 1, sourceTechPackCode: null, status: 'draft', version: 1,
    title: 'Issued title', description: 'Issued description', supplierCode: 'FACTORY-01',
    supplierName: 'Issued factory contact', supplierEmail: 'factory@acceptance.invalid',
    constructionNotes: 'Original construction', qualityNotes: 'Original quality',
    packingNotes: 'Original packing', createdAt: '2026-10-13T00:00:00.000Z' };
  const catalog = { sku: pack.sku, brandId: pack.brandId, version: 2, status: 'published' };
  const sources = { productSkuId: 'product-1',
    productSku: { id: 'product-1', brandId: pack.brandId, skuCode: pack.sku,
      styleVersionId: 'style-v1', colorwayId: 'color-1', sizeValueId: 'size-m', contentHash: 'a'.repeat(64) },
    sizeValue: { id: 'size-m', brandId: pack.brandId, sizeScaleVersionId: 'scale-v1' },
    bom: { id: 'bom-1', sku: pack.sku, brandId: pack.brandId, productSkuId: 'product-1',
      status: 'published', version: 1, payload: { material: 'original' } },
    chart: { id: 'chart-1', sku: null, brandId: pack.brandId, styleVersionId: 'style-v1',
      colorwayId: 'color-1', sizeScaleVersionId: 'scale-v1', status: 'published', version: 1, payload: { points: [] } },
    sample: { sampleCode: 'PPS-01', sku: pack.sku, brandId: pack.brandId, productSkuId: 'product-1',
      supplierCode: pack.supplierCode, status: 'approved', sampleType: 'pre-production', version: 1, payload: {} } };
  const snapshot = buildCanonicalTechPackIssueSnapshot({ techPack: pack, catalogSku: catalog, sources });
  const issued = { ...pack, status: 'issued', version: 2, issuedAt: '2026-10-14T00:00:00.000Z',
    issuedBy: 'actor-1', dependencySnapshot: snapshot };
  return { issued, sources, documentSources: documentSourcesFixture(pack, sources) };
}
const bind = f => bindIssuedTechPackDocumentContext(f.issued, f.sources, f.documentSources);

test('issued header, exact product labels, supplier and sorted operations are deeply frozen', () => {
  const f = fixture(), result = bind(f), context = readFrozenTechPackDocumentContext(result);
  assert.equal(context.header.qualityNotes, 'Original quality');
  assert.equal(context.header.issuedTechPackVersion, 2);
  assert.equal(context.product.styleVersion.titleRu, 'Original RU title');
  assert.equal(context.product.colorway.nameEn, 'Original EN colour');
  assert.equal(context.product.sizeValue.labelRu, 'Original RU size');
  assert.equal(context.supplier.name, 'Issued factory contact');
  assert.equal(context.supplier.register.version, 3);
  assert.equal(context.operations.totalStandardMinutes, 3.6);
  assert.deepEqual(context.operations.rows.map(row => row.sequence), [1, 2]);
  assert.equal(context.sketches.state, 'missing');
  assert.deepEqual(context.sketches.issues, []);
  assert.equal(result.issueFormat, 'canonical-v1');
  assert.throws(() => { result.dependencySnapshot.frozenDocumentContext.header.title = 'changed'; }, TypeError);
  assert.throws(() => { context.operations.rows[0].nameRu = 'changed'; }, TypeError);
  assert.notEqual(result.dependencySnapshot.canonical.lineageHash, f.issued.dependencySnapshot.canonical.lineageHash);
  assert.deepEqual(verifyFrozenCanonicalTechPackSources(result.dependencySnapshot), f.issued.dependencySnapshot.frozenSources);
});

test('historical content survives source changes, JSON reload and later lifecycle versions', () => {
  const f = fixture(), result = bind(f), original = canonicalJson(readFrozenTechPackDocumentContext(result));
  f.issued.title = 'Later title'; f.documentSources.product.colorway.nameEn = 'Later colour';
  f.documentSources.supplier.version = 4; f.documentSources.operations[0].standardMinutes = 12;
  const stored = copy(result); stored.status = 'superseded'; stored.version = 3;
  assert.equal(canonicalJson(readFrozenTechPackDocumentContext(stored)), original);
  assert.equal(readFrozenTechPackDocumentContext(bind(f)).header.title, 'Later title');
});

test('empty measured operation set is explicit missing evidence, never zero minutes', () => {
  const f = fixture(); f.documentSources.operations = [];
  const context = readFrozenTechPackDocumentContext(bind(f));
  assert.equal(context.operations.state, 'missing');
  assert.equal(context.operations.totalStandardMinutes, null);
});

test('legacy source-only evidence remains verifiable but cannot invent a document context', () => {
  const f = fixture();
  assert.ok(verifyFrozenCanonicalTechPackSources(f.issued.dependencySnapshot));
  assert.throws(() => readFrozenTechPackDocumentContext(f.issued), { code: 'TECH_PACK_DOCUMENT_CONTEXT_REQUIRED' });
});

for (const [name, mutate, suffix] of [
  ['absent operation read', f => delete f.documentSources.operations, 'OPERATIONS_REQUIRED'],
  ['absent sketch read', f => delete f.documentSources.sketches, 'SKETCH_EVIDENCE_ROWS_INVALID'],
  ['foreign operation', f => { f.documentSources.operations[0].brandId = 'other'; }, 'OPERATIONS_INVALID'],
  ['different pack operation', f => { f.documentSources.operations[0].techPackCode = 'OTHER'; }, 'OPERATIONS_INVALID'],
  ['duplicate operation ID', f => { f.documentSources.operations[0].id = f.documentSources.operations[1].id; }, 'OPERATIONS_INVALID'],
  ['duplicate sequence', f => { f.documentSources.operations[0].sequence = 1; }, 'OPERATIONS_INVALID'],
  ['duplicate code', f => { f.documentSources.operations[0].operationCode = 'OP-01'; }, 'OPERATIONS_INVALID'],
  ['zero time', f => { f.documentSources.operations[0].standardMinutes = 0; }, 'OPERATIONS_INVALID'],
  ['missing time', f => { f.documentSources.operations[0].standardMinutes = null; }, 'OPERATIONS_INVALID'],
  ['string time', f => { f.documentSources.operations[0].standardMinutes = '2.35'; }, 'OPERATIONS_INVALID'],
  ['unknown machine', f => { f.documentSources.operations[0].machineClass = 'unknown'; }, 'OPERATIONS_INVALID'],
  ['missing operation EN', f => { f.documentSources.operations[0].nameEn = ''; }, 'OPERATIONS_INVALID'],
  ['missing canonical style', f => { f.documentSources.product.styleVersion = null; }, 'PRODUCT_INVALID'],
  ['foreign style brand', f => { f.documentSources.product.styleVersion.brandId = 'foreign'; }, 'PRODUCT_INVALID'],
  ['wrong style version', f => { f.documentSources.product.styleVersion.id = 'foreign'; }, 'PRODUCT_INVALID'],
  ['wrong colour', f => { f.documentSources.product.colorway.id = 'foreign'; }, 'PRODUCT_INVALID'],
  ['wrong size', f => { f.documentSources.product.sizeValue.id = 'foreign'; }, 'PRODUCT_INVALID'],
  ['wrong scale', f => { f.documentSources.product.sizeScaleVersion.id = 'foreign'; }, 'PRODUCT_INVALID'],
  ['missing product RU', f => { f.documentSources.product.styleVersion.titleRu = null; }, 'PRODUCT_INVALID'],
  ['missing supplier', f => { f.documentSources.supplier = null; }, 'SUPPLIER_INVALID'],
  ['foreign supplier', f => { f.documentSources.supplier.brandId = 'foreign'; }, 'SUPPLIER_INVALID'],
  ['wrong supplier code', f => { f.documentSources.supplier.supplierCode = 'foreign'; }, 'SUPPLIER_INVALID'],
  ['missing issued contact', f => { f.issued.supplierEmail = null; }, 'SUPPLIER_INVALID'],
  ['missing issue actor', f => { f.issued.issuedBy = null; }, 'HEADER_INVALID'],
  ['missing issue time', f => { f.issued.issuedAt = null; }, 'HEADER_INVALID'],
]) {
  test('context refuses ' + name, () => {
    const f = fixture(); mutate(f);
    assert.throws(() => bind(f), { code: 'TECH_PACK_DOCUMENT_CONTEXT_' + suffix });
  });
}
for (const [name, mutate, code] of [
  ['changed header', s => { s.frozenDocumentContext.header.title = 'changed'; }, 'TAMPERED'],
  ['changed operation', s => { s.frozenDocumentContext.operations.rows[0].standardMinutes = 50; }, 'TAMPERED'],
  ['missing context', s => { delete s.frozenDocumentContext; }, 'REQUIRED'],
  ['missing digest', s => { delete s.canonical.documentContextHash; }, 'REQUIRED'],
  ['null context', s => { s.frozenDocumentContext = null; }, 'REQUIRED'],
]) {
  test('source verifier rejects context damage: ' + name, () => {
    const stored = copy(bind(fixture())); mutate(stored.dependencySnapshot);
    assert.throws(() => verifyFrozenCanonicalTechPackSources(stored.dependencySnapshot),
      { code: 'TECH_PACK_DOCUMENT_CONTEXT_' + code });
  });
}

test('context is bound to the issued Pack rather than reusable on another revision', () => {
  const result = copy(bind(fixture())); result.revision = 2;
  assert.throws(() => readFrozenTechPackDocumentContext(result), { code: 'TECH_PACK_DOCUMENT_CONTEXT_PACK_MISMATCH' });
});
test('bound context cannot be rewritten and its digest is included in lineage', () => {
  const f = fixture(), result = bind(f);
  assert.throws(() => bindIssuedTechPackDocumentContext(result, f.sources, f.documentSources),
    { code: 'TECH_PACK_DOCUMENT_CONTEXT_ALREADY_BOUND' });
  const c = result.dependencySnapshot;
  const digest = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
  assert.equal(digest(c.frozenDocumentContext), c.canonical.documentContextHash);
  const { lineageHash, ...manifest } = c.canonical;
  assert.equal(digest(manifest), lineageHash);
});
test('combined source and context evidence stays within the existing 8 MiB bound', () => {
  const f = fixture(); f.issued.description = 'x'.repeat(8 * 1024 * 1024);
  assert.throws(() => bind(f), { code: 'TECH_PACK_DOCUMENT_CONTEXT_TOO_LARGE' });
});


test('retained sketch plus cleared rights becomes verified evidence', () => {
  const f=fixture();
  f.documentSources.sketches=[{
    id:'media-1',brandId:f.issued.brandId,styleVersionId:f.sources.productSku.styleVersionId,
    colorwayId:f.sources.productSku.colorwayId,mediaType:'image',mediaRole:'design_sketch',
    uri:'s3://mutable-alias/front.png',sortOrder:0,contentHash:'c'.repeat(64),
    payload:{viewLabel:'Front / Перед'},createdAt:'2026-10-13T01:00:00.000Z',createdBy:'designer-1',
    retainedAsset:{mediaId:'media-1',contentHash:'c'.repeat(64),storageKey:'sha256/cc/front.png',
      storageVersion:'v-1',mimeType:'image/png',byteSize:12345,
      retainedAt:'2026-10-13T02:00:00.000Z',retainedBy:'asset-authority'},
    rights:{id:'rights-1',mediaId:'media-1',version:1,status:'cleared',basis:'brand-owned',
      evidenceRef:'contract://rights/1',approvedAt:'2026-10-13T03:00:00.000Z',
      approvedBy:'rights-officer',validUntil:null},
  }];
  const context=readFrozenTechPackDocumentContext(bind(f));
  assert.equal(context.sketches.state,'verified');
  assert.equal(context.sketches.rows[0].retainedAsset.storageVersion,'v-1');
  assert.equal(context.sketches.rows[0].rights.status,'cleared');
});
test('URI or content hash alone remains incomplete sketch evidence', () => {
  const f=fixture();
  f.documentSources.sketches=[{
    id:'media-weak',brandId:f.issued.brandId,styleVersionId:f.sources.productSku.styleVersionId,
    colorwayId:null,mediaType:'image',mediaRole:'technical',
    uri:'https://cdn.example.invalid/technical.png',sortOrder:1,contentHash:'d'.repeat(64),
    payload:{},createdAt:'2026-10-13T01:00:00.000Z',createdBy:'designer-1',
    retainedAsset:null,rights:null,
  }];
  const context=readFrozenTechPackDocumentContext(bind(f));
  assert.equal(context.sketches.state,'incomplete');
  assert.deepEqual(context.sketches.rows[0].issues,
    ['RETAINED_ASSET_MISSING','RIGHTS_DECISION_MISSING']);
});
