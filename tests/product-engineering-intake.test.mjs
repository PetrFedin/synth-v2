import test from 'node:test';
import assert from 'node:assert/strict';
import {
  admitEngineeringSource,
  completeSourceParsing,
  createEngineeringFragment,
  createEngineeringSource,
  recordSourceScan,
  rejectEngineeringSource,
} from '../src/modules/product-engineering/intake.mjs';

const NOW='2026-10-06T12:30:00.000Z';
const HASH='a'.repeat(64);

test('uploaded document is unusable until hash and security admission exist',()=>{
  assert.throws(()=>createEngineeringSource({
    id:'s0',brandId:'b',styleId:'style',kind:'document',ingestMode:'upload',mediaType:'application/pdf',
    storageRef:'object://bucket/file.pdf',createdAt:NOW,createdBy:'u'
  }),e=>e.code==='ENGINEERING_SOURCE_UPLOAD_HASH_REQUIRED');

  const pending=createEngineeringSource({
    id:'s1',brandId:'b',styleId:'style',kind:'document',ingestMode:'upload',mediaType:'application/pdf',
    originalName:'tech-pack.pdf',sizeBytes:1024,contentHash:HASH,storageRef:'object://bucket/file.pdf',
    createdAt:NOW,createdBy:'u'
  });
  assert.equal(pending.status,'pending');
  assert.equal(pending.scanStatus,'pending');
  assert.throws(()=>admitEngineeringSource(pending,{admittedAt:NOW,admittedBy:'u',policyVersion:'intake-v1'}),e=>e.code==='ENGINEERING_SOURCE_SCAN_REQUIRED');

  const clean=recordSourceScan(pending,{status:'clean',scannedAt:NOW,engine:'scanner-v1'});
  const admitted=admitEngineeringSource(clean,{admittedAt:NOW,admittedBy:'reviewer',policyVersion:'intake-v1'});
  assert.equal(admitted.status,'admitted');
  assert.equal(admitted.parseStatus,'pending');
});

test('infected source is quarantined rather than parsed',()=>{
  const pending=createEngineeringSource({
    id:'s2',brandId:'b',styleId:'style',kind:'spreadsheet',ingestMode:'upload',
    mediaType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    contentHash:HASH,storageRef:'object://bucket/spec.xlsx',createdAt:NOW,createdBy:'u'
  });
  const infected=recordSourceScan(pending,{status:'infected',scannedAt:NOW,engine:'scanner-v1'});
  const quarantined=rejectEngineeringSource(infected,{code:'MALWARE_DETECTED',message:'Security scanner rejected source',rejectedAt:NOW,rejectedBy:'system',quarantine:true});
  assert.equal(quarantined.status,'quarantined');
});

test('fragments preserve exact page, cell and normalized image provenance',()=>{
  const admitted=admitEngineeringSource(recordSourceScan(createEngineeringSource({
    id:'s3',brandId:'b',styleId:'style',kind:'document',ingestMode:'upload',mediaType:'application/pdf',
    contentHash:HASH,storageRef:'object://bucket/spec.pdf',createdAt:NOW,createdBy:'u'
  }),{status:'clean',scannedAt:NOW}),{admittedAt:NOW,admittedBy:'system',policyVersion:'v1'});

  const page=createEngineeringFragment({id:'f1',source:admitted,kind:'document_page',locator:{page:4},content:{text:'BOM'},createdAt:NOW,createdBy:'parser'});
  assert.equal(page.locator.page,4);
  assert.match(page.contentHash,/^[0-9a-f]{64}$/);

  const region=createEngineeringFragment({id:'f2',source:admitted,kind:'image_region',locator:{page:2,region:{x:.1,y:.2,w:.3,h:.4}},content:{feature:'lapel'},createdAt:NOW,createdBy:'vision'});
  assert.equal(region.locator.region.w,.3);

  const spreadsheet=admitEngineeringSource(recordSourceScan(createEngineeringSource({
    id:'s4',brandId:'b',styleId:'style',kind:'spreadsheet',ingestMode:'upload',
    mediaType:'text/csv',contentHash:'b'.repeat(64),storageRef:'object://bucket/spec.csv',createdAt:NOW,createdBy:'u'
  }),{status:'clean',scannedAt:NOW}),{admittedAt:NOW,admittedBy:'system',policyVersion:'v1'});
  const cells=createEngineeringFragment({id:'f3',source:spreadsheet,kind:'cell_range',locator:{sheet:'Measurements',range:'B2:F18'},content:{rows:17},createdAt:NOW,createdBy:'parser'});
  assert.equal(cells.locator.range,'B2:F18');
});

test('parser completion records parser version and fragment count',()=>{
  const admitted=admitEngineeringSource(recordSourceScan(createEngineeringSource({
    id:'s5',brandId:'b',styleId:'style',kind:'document',ingestMode:'upload',mediaType:'application/pdf',
    contentHash:HASH,storageRef:'object://bucket/spec.pdf',createdAt:NOW,createdBy:'u'
  }),{status:'clean',scannedAt:NOW}),{admittedAt:NOW,admittedBy:'system',policyVersion:'v1'});
  const done=completeSourceParsing(admitted,{completedAt:NOW,parser:'pdf-structure',parserVersion:'3.2.1',fragmentCount:18});
  assert.equal(done.parseStatus,'completed');
  assert.equal(done.metadata.parse.fragmentCount,18);
});
