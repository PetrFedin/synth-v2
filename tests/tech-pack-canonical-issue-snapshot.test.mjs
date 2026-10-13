import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalTechPackIssueSnapshot } from '../src/application/tech-pack-canonical-issue-snapshot.mjs';

const HASH = 'a'.repeat(64);
function fixture() {
  const techPack = { techPackCode:'TP/2026/001', sku:'SKU-01', brandId:'BRAND-1',
    status:'draft', supplierCode:'SUP-01', skuVersion:3 };
  const catalogSku = { sku:'SKU-01', brandId:'BRAND-1', status:'published', version:3 };
  const sources = {
    productSkuId:'PS-1',
    productSku:{id:'PS-1', skuCode:'SKU-01', brandId:'BRAND-1',
      styleVersionId:'ST-1',colorwayId:'CO-1',sizeValueId:'SZ-1',contentHash:HASH},
    sizeValue:{id:'SZ-1',brandId:'BRAND-1',sizeScaleVersionId:'SCALE-1'},
    bom:{id:'BOM-1',status:'published',version:5,brandId:'BRAND-1',
      sku:'SKU-01',productSkuId:'PS-1',payload:{lines:[1,2]}},
    chart:{id:'CH-1',status:'published',version:6,brandId:'BRAND-1',sku:null,
      styleVersionId:'ST-1',colorwayId:'CO-1',sizeScaleVersionId:'SCALE-1',
      payload:{points:[1]}},
    sample:{sampleCode:'PPS-1',status:'approved',sampleType:'pre-production',
      version:4,productSkuId:'PS-1',sku:'SKU-01',brandId:'BRAND-1',
      supplierCode:'SUP-01',payload:{accepted:true}},
  };
  return {techPack,catalogSku,sources};
}
function verify(data) { return buildCanonicalTechPackIssueSnapshot(data); }
test('canonical issue evidence is immutable and deterministic for identical locked sources', () => {
  const a=fixture(),one=verify(a),two=verify(fixture());
  assert.deepEqual(one,two);
  assert.equal(one.canonical.schemaVersion,1);
  assert.equal(one.canonical.productSkuId,'PS-1');
  assert.equal(one.canonical.sizeScaleVersionId,'SCALE-1');
  assert.match(one.canonical.lineageHash,/^[0-9a-f]{64}$/);
  assert.match(one.canonical.bomContentHash,/^[0-9a-f]{64}$/);
  assert.equal(Object.isFrozen(one),true);
  assert.equal(Object.isFrozen(one.canonical),true);
});
test('any source version, payload or supplier mutation changes evidence or is rejected', () => {
  const a=fixture(),original=verify(a);
  const revised=fixture();
  revised.sources.bom.version=6;
  assert.notEqual(verify(revised).canonical.lineageHash,original.canonical.lineageHash);
  const revisedContent=fixture();
  revisedContent.sources.chart.payload.points.push(2);
  assert.notEqual(verify(revisedContent).canonical.lineageHash,original.canonical.lineageHash);
  const wrongSupplier=fixture();
  wrongSupplier.sources.sample.supplierCode='SUP-OTHER';
  assert.throws(()=>verify(wrongSupplier),{code:'TECH_PACK_CANONICAL_PPS_REQUIRED'});
});
test('missing, legacy-only, cross-brand or mismatched identity fails closed', () => {
  const cases=[
    [x=>{x.sources.productSkuId=null},'TECH_PACK_CANONICAL_PRODUCT_SKU_REQUIRED'],
    [x=>{x.sources.productSku.skuCode='SKU-OTHER'},'TECH_PACK_CANONICAL_IDENTITY_MISMATCH'],
    [x=>{x.sources.productSku.brandId='BRAND-OTHER'},'TECH_PACK_CANONICAL_IDENTITY_MISMATCH'],
    [x=>{x.sources.sizeValue.sizeScaleVersionId=null},'TECH_PACK_CANONICAL_IDENTITY_MISMATCH'],
    [x=>{x.catalogSku.version=4},'TECH_PACK_SKU_SNAPSHOT_STALE'],
    [x=>{x.sources.bom.productSkuId='PS-OTHER'},'TECH_PACK_CANONICAL_BOM_REQUIRED'],
    [x=>{x.sources.bom.status='draft'},'TECH_PACK_CANONICAL_BOM_REQUIRED'],
    [x=>{x.sources.chart.sku='SKU-01'},'TECH_PACK_CANONICAL_MEASUREMENT_REQUIRED'],
    [x=>{x.sources.chart.colorwayId='CO-OTHER'},'TECH_PACK_CANONICAL_MEASUREMENT_REQUIRED'],
    [x=>{x.sources.sample.productSkuId='PS-OTHER'},'TECH_PACK_CANONICAL_PPS_REQUIRED'],
    [x=>{x.sources.sample.status='rejected'},'TECH_PACK_CANONICAL_PPS_REQUIRED'],
  ];
  for(const [mutate,code] of cases) {
    const x=fixture();mutate(x);
    assert.throws(()=>verify(x),{code});
  }
});

test('canonical evidence cannot be silently inferred from a text SKU or the wrong chart version', () => {
  const absent=fixture();
  absent.sources.productSkuId=null;
  assert.throws(()=>verify(absent),{code:'TECH_PACK_CANONICAL_PRODUCT_SKU_REQUIRED'});
  const wrong=fixture();
  wrong.sources.chart.sizeScaleVersionId='ANOTHER-SCALE';
  assert.throws(()=>verify(wrong),{code:'TECH_PACK_CANONICAL_MEASUREMENT_REQUIRED'});
  const wrongPps=fixture();
  wrongPps.sources.sample.supplierCode='ANOTHER-FACTORY';
  assert.throws(()=>verify(wrongPps),{code:'TECH_PACK_CANONICAL_PPS_REQUIRED'});
});
