import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectEngineeringUpload, postgresBlobStorageRef } from '../src/modules/product-engineering/source-upload.mjs';

test('controlled upload hashes server bytes and infers governed source kind',()=>{
  const bytes=new TextEncoder().encode('%PDF-1.7\nhello');
  const inspected=inspectEngineeringUpload({bytes,mediaType:'application/pdf',originalName:'tech-pack.pdf'});
  assert.equal(inspected.kind,'document');
  assert.equal(inspected.sizeBytes,bytes.byteLength);
  assert.match(inspected.contentHash,/^[0-9a-f]{64}$/);
  assert.equal(postgresBlobStorageRef('source-1'),'postgres-blob:source-1');
});

test('controlled upload rejects extension/type spoofing and unsafe file names',()=>{
  const pdf=new TextEncoder().encode('%PDF-1.7\nhello');
  assert.throws(()=>inspectEngineeringUpload({bytes:pdf,mediaType:'application/pdf',originalName:'spec.xlsx'}),e=>e.code==='ENGINEERING_UPLOAD_EXTENSION_MISMATCH');
  assert.throws(()=>inspectEngineeringUpload({bytes:pdf,mediaType:'application/pdf',originalName:'../spec.pdf'}),e=>e.code==='ENGINEERING_UPLOAD_NAME_INVALID');
});

test('controlled upload verifies binary signature instead of trusting Content-Type',()=>{
  const fake=new TextEncoder().encode('not a pdf');
  assert.throws(()=>inspectEngineeringUpload({bytes:fake,mediaType:'application/pdf',originalName:'fake.pdf'}),e=>e.code==='ENGINEERING_UPLOAD_SIGNATURE_MISMATCH');
});
