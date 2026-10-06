import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/core/errors.mjs';
import { normalizeHttpError } from '../src/http/error-status.mjs';
import { createAnalysisRun, createModelRun, failModelRun, startAnalysis } from '../src/modules/product-engineering/public.mjs';

test('controlled upload HTTP semantics distinguish size and media type',()=>{
  assert.equal(normalizeHttpError(new DomainError('ENGINEERING_UPLOAD_TOO_LARGE','too large')).status,413);
  assert.equal(normalizeHttpError(new DomainError('ENGINEERING_UPLOAD_TYPE_UNSUPPORTED','unsupported')).status,415);
});

test('failed model attempt does not mutate parent analysis lifecycle',()=>{
  const queued=createAnalysisRun({
    id:'a1',style:{id:'s1',brandId:'b1'},purpose:'garment_interpretation',
    inputManifest:{},requestedAt:'2026-10-06T10:00:00.000Z',requestedBy:'u1',
  });
  const running=startAnalysis(queued,{startedAt:'2026-10-06T10:01:00.000Z'});
  const model=createModelRun({
    id:'m1',analysisRun:running,provider:'p',model:'m',purpose:'garment_interpretation',
    promptVersion:'v1',schemaVersion:'v1',inputHash:'a'.repeat(64),
    startedAt:'2026-10-06T10:01:01.000Z',createdBy:'worker',
  });
  const failed=failModelRun(model,{failureCode:'PROVIDER_BUSY',completedAt:'2026-10-06T10:01:02.000Z'});
  assert.equal(failed.status,'failed');
  assert.equal(failed.failureCode,'PROVIDER_BUSY');
  assert.equal(running.status,'running','durable job policy owns terminal analysis failure');
});
