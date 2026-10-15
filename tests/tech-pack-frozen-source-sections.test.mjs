import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../src/core/fingerprints.mjs';
import { buildCanonicalTechPackIssueSnapshot } from '../src/application/tech-pack-canonical-issue-snapshot.mjs';
import { buildFrozenTechPackSourceSections } from '../src/application/tech-pack-frozen-source-sections.mjs';

function fixture() {
  const mdm = (entryId, dictionaryCode, code) => ({entryId, version: 3, dictionaryCode,
    snapshot: {code, translations: {ru: 'Frozen RU', en: 'Frozen EN'}}});
  const bom = {id:'bom-1', version:2, sku:'JACKET-01', brandId:'brand-1', status:'published',
    currency:'EUR', materialCost:21, laborCost:20, overheadCost:5, logisticsCost:2, otherCost:1,
    totalCost:49, lines:[{lineId:'SHELL',position:1,component:'Shell',materialCode:'FAB-01',
      materialVersion:4,materialName:'Original fabric',materialType:'fabric',unit:'m',
      quantity:2,wastePercent:5,grossQuantity:2.1,materialCurrency:'USD',unitCostSnapshot:12.3456,
      exchangeRate:0.8100051840,lineCost:21,placement:'Front and back',isMain:true}]};
  const sizes = [{sizeValueId:'size-s',code:'S',labelRu:'Small RU',labelEn:'Small EN',position:1},
    {sizeValueId:'size-m',code:'M',labelRu:'Medium RU',labelEn:'Medium EN',position:2}];
  const chart = {id:'chart-1',version:2,sku:null,brandId:'brand-1',status:'published',
    styleVersionId:'style-v1',colorwayId:'color-1',sizeScaleVersionId:'scale-v1',
    measurementUnitEntryId:'unit-cm',measurementUnitEntryVersion:3,
    measurementUnit:mdm('unit-cm','measurement.unit','CM'),unit:'CM',baseSizeValueId:'size-m',
    sizes,points:[{pointEntryId:'point-chest',pointEntryVersion:3,
      pointRef:mdm('point-chest','measurement.point','CHEST'),pointCode:'CHEST',position:1,
      nameRu:'Chest RU',nameEn:'Chest EN',description:'Measured flat',toleranceMinus:0,
      tolerancePlus:0.5,measurements:[{sizeValueId:'size-m',sizeCode:'M',value:112.125},
        {sizeValueId:'size-s',sizeCode:'S',value:108.25}]}]};
  const sample = {sampleCode:'PPS-01',version:1,sku:'JACKET-01',brandId:'brand-1',
    supplierCode:'FACTORY-01',status:'approved',sampleType:'pre-production',round:1,
    receipt:{condition:'accepted'},decision:{notes:'Approved original fabric'}};
  return {
    techPack:{status:'draft',sku:'JACKET-01',brandId:'brand-1',skuVersion:2,supplierCode:'FACTORY-01'},
    catalogSku:{sku:'JACKET-01',brandId:'brand-1',status:'published',version:2},
    sources:{productSkuId:'product-1',productSku:{id:'product-1',skuCode:'JACKET-01',brandId:'brand-1',
      styleVersionId:'style-v1',colorwayId:'color-1',sizeValueId:'size-m',contentHash:'a'.repeat(64)},
      sizeValue:{id:'size-m',brandId:'brand-1',sizeScaleVersionId:'scale-v1'},
      bom:{...bom,productSkuId:'product-1',payload:bom},
      chart:{...chart,payload:chart},
      sample:{...sample,productSkuId:'product-1',payload:sample}},
  };
}
const seal = input => buildCanonicalTechPackIssueSnapshot(input);
const project = input => buildFrozenTechPackSourceSections(seal(input));

test('frozen sections preserve exact money, FX, placement, RU/EN labels and ID-keyed matrix', () => {
  const input=fixture(), result=project(input);
  assert.equal(result.bom.lines[0].unitCostSnapshot,12.3456);
  assert.equal(result.bom.lines[0].exchangeRate,0.8100051840);
  assert.equal(result.bom.lines[0].materialCurrency,'USD');
  assert.equal(result.bom.lines[0].lineCost,21);
  assert.equal(result.bom.lines[0].placement,'Front and back');
  assert.equal(result.bom.totalCost,49);
  assert.deepEqual(result.measurement.points[0].cells,
    [{sizeValueId:'size-s',value:108.25},{sizeValueId:'size-m',value:112.125}]);
  assert.equal(result.measurement.points[0].toleranceMinus,0);
  assert.equal(result.measurement.sizes[0].labelRu,'Small RU');
  assert.equal(result.measurement.sizes[0].labelEn,'Small EN');
  assert.equal(result.measurement.points[0].nameRu,'Chest RU');
  assert.equal(result.measurement.points[0].nameEn,'Chest EN');
  assert.deepEqual(result.measurement.measurementUnit,input.sources.chart.payload.measurementUnit);
  assert.deepEqual(result.sample,input.sources.sample.payload);
});

test('two snapshot revisions and JSON reload preserve first source sections without current data', () => {
  const input=fixture(), firstSnapshot=seal(input);
  const before=canonicalJson(buildFrozenTechPackSourceSections(firstSnapshot));
  input.sources.bom.payload.lines[0].materialName='New material';
  input.sources.bom.payload.lines[0].placement='Sleeve only';
  input.sources.chart.payload.points[0].measurements[0].value=114;
  input.sources.chart.payload.sizes[0].labelRu='Revised RU';
  input.sources.sample.payload.decision.notes='Changed after issue';
  for(const source of [input.sources.bom,input.sources.chart,input.sources.sample]) {
    source.version += 1; source.payload.version = source.version;
  }
  const second=project(input);
  const reloaded=JSON.parse(JSON.stringify(firstSnapshot));
  assert.equal(canonicalJson(buildFrozenTechPackSourceSections(reloaded)),before);
  assert.notEqual(second.projectionHash,JSON.parse(before).projectionHash);
  assert.equal(JSON.parse(before).bom.lines[0].materialName,'Original fabric');
  assert.equal(second.bom.lines[0].materialName,'New material');
});

test('section projection is deeply immutable and has a reproducible versioned digest', () => {
  const result=project(fixture());
  assert.throws(()=>{result.measurement.points[0].cells[0].value=1;},TypeError);
  assert.throws(()=>{result.bom.lines[0].placement='Mutated';},TypeError);
  const {projectionHash,...body}=result;
  assert.equal(createHash('sha256').update(canonicalJson(body)).digest('hex'),projectionHash);
  assert.equal(result.schemaVersion,1);
  assert.equal(result.printAdmitted,false);
  assert.deepEqual(result.remainingEvidence,
    ['issued-document-context','operation-sequence','verified-sketch-content']);
});

test('a valid checksum is not sufficient to admit an incomplete legacy-like measurement payload', () => {
  const input=fixture();
  delete input.sources.chart.payload.sizes[0].sizeValueId;
  assert.throws(()=>project(input),{code:'TECH_PACK_FROZEN_DOCUMENT_SIZE_ID_INVALID'});
});

const invalidCases = [
  ['mismatched nested version',i=>i.sources.bom.payload.version=99,'PAYLOAD_IDENTITY'],
  ['different nested brand',i=>i.sources.chart.payload.brandId='other-brand','LINEAGE'],
  ['legacy SKU chart',i=>i.sources.chart.payload.sku='JACKET-01','LINEAGE'],
  ['different style version',i=>i.sources.chart.payload.styleVersionId='style-v2','LINEAGE'],
  ['different colour',i=>i.sources.chart.payload.colorwayId='color-2','LINEAGE'],
  ['different size scale',i=>i.sources.chart.payload.sizeScaleVersionId='scale-v2','LINEAGE'],
  ['empty BOM',i=>i.sources.bom.payload.lines=[],'BOM'],
  ['absent material cost',i=>delete i.sources.bom.payload.materialCost,'BOM_COST'],
  ['unknown cost is not zero',i=>i.sources.bom.payload.lines[0].unitCostSnapshot=null,'BOM_LINE'],
  ['numeric string quantity is not silently coerced',i=>i.sources.bom.payload.lines[0].quantity='2','BOM_LINE'],
  ['missing currency',i=>i.sources.bom.payload.lines[0].materialCurrency='','BOM_LINE'],
  ['duplicate BOM position',i=>i.sources.bom.payload.lines.push({...i.sources.bom.payload.lines[0],lineId:'LINING'}),'BOM_LINE'],
  ['empty points',i=>i.sources.chart.payload.points=[],'MATRIX'],
  ['unknown base size',i=>i.sources.chart.payload.baseSizeValueId='absent','BASE_SIZE'],
  ['duplicate size ID',i=>i.sources.chart.payload.sizes[1].sizeValueId='size-s','SIZE_ID'],
  ['duplicate size code',i=>i.sources.chart.payload.sizes[1].code='S','SIZE_CODE'],
  ['duplicate size position',i=>i.sources.chart.payload.sizes[1].position=1,'SIZE_POSITION'],
  ['missing English label',i=>delete i.sources.chart.payload.sizes[0].labelEn,'SIZE_LABEL'],
  ['missing English point label',i=>delete i.sources.chart.payload.points[0].nameEn,'POINT'],
  ['missing tolerance is not zero',i=>delete i.sources.chart.payload.points[0].toleranceMinus,'POINT'],
  ['missing matrix cell',i=>i.sources.chart.payload.points[0].measurements.pop(),'MATRIX'],
  ['duplicate matrix cell',i=>i.sources.chart.payload.points[0].measurements[1].sizeValueId='size-m','VALUE_ID'],
  ['code-only measurement rejected',i=>delete i.sources.chart.payload.points[0].measurements[0].sizeValueId,'VALUE_ID'],
  ['foreign size with a matching code',i=>i.sources.chart.payload.points[0].measurements[0].sizeValueId='other-size','VALUE'],
  ['mismatched measurement code',i=>i.sources.chart.payload.points[0].measurements[0].sizeCode='S','VALUE'],
  ['zero measurement cannot replace missing data',i=>i.sources.chart.payload.points[0].measurements[0].value=0,'VALUE'],
  ['missing unit MDM snapshot',i=>delete i.sources.chart.payload.measurementUnit,'MDM_REFERENCE'],
  ['changed unit MDM version',i=>i.sources.chart.payload.measurementUnit.version=4,'MDM_REFERENCE'],
  ['changed unit code',i=>i.sources.chart.payload.unit='MM','MDM_REFERENCE'],
  ['wrong point dictionary',i=>i.sources.chart.payload.points[0].pointRef.dictionaryCode='measurement.unit','MDM_REFERENCE'],
  ['changed point version',i=>i.sources.chart.payload.points[0].pointEntryVersion=2,'MDM_REFERENCE'],
];
for (const [name,mutate,suffix] of invalidCases) {
  test('frozen source projection refuses '+name,()=>{
    const input=fixture(); mutate(input);
    assert.throws(()=>project(input),{code:'TECH_PACK_FROZEN_DOCUMENT_'+suffix+'_INVALID'});
  });
}

test('source content mutation after issuance fails checksum before section projection', () => {
  const snapshot=JSON.parse(JSON.stringify(seal(fixture())));
  snapshot.frozenSources.measurement.payload.points[0].measurements[0].value=999;
  assert.throws(()=>buildFrozenTechPackSourceSections(snapshot),
    {code:'TECH_PACK_CANONICAL_FROZEN_EVIDENCE_TAMPERED'});
});

test('missing canonical manifest cannot be reconstructed from frozen payloads', () => {
  const snapshot=JSON.parse(JSON.stringify(seal(fixture())));
  delete snapshot.canonical;
  assert.throws(()=>buildFrozenTechPackSourceSections(snapshot),
    {code:'TECH_PACK_CANONICAL_FROZEN_EVIDENCE_REQUIRED'});
});
