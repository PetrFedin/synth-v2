import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateEngineeringChangeAdmission } from '../src/modules/product-engineering/change-admission.mjs';

const readerSource=await readFile(new URL('../src/infrastructure/postgres-product-engineering-change-gate-reader.mjs',import.meta.url),'utf8');

test('expired waiver is projected back to effective pending admission state',()=>{
  for(const fragment of [
    "impact.status='waived'",
    "receipt.disposition='waived'",
    "receipt.waiver->>'expiresAt' IS NOT NULL",
    "(receipt.waiver->>'expiresAt')::timestamptz <= now()",
    "THEN 'pending'",
  ]) assert.ok(readerSource.includes(fragment),fragment);

  const decision=evaluateEngineeringChangeAdmission({
    operation:'cost_close',
    styleVersionId:'sv-1',
    pendingImpacts:[{
      id:'impact-1',changeCaseId:'case-1',impactKind:'downstream_policy',entityId:'MAT-001',entityVersion:'6',
      area:'cost',requiredAction:'recalculate',severity:'high',evidenceStatus:'policy_required',basis:{},
      status:'pending',storedStatus:'waived',resolutionReceiptId:'receipt-1',waiver:{scope:'one-close',expiresAt:'2026-10-08T10:00:00.000Z'},
    }],
  });
  assert.equal(decision.admitted,false);
  assert.equal(decision.blockerCount,1);
});

test('unexpired waiver is excluded from pending reader result by SQL predicate',()=>{
  assert.ok(readerSource.includes("impact.status = 'pending'"));
  assert.ok(readerSource.includes("impact.status='waived'"));
  assert.ok(readerSource.includes("<= now()"));
  assert.equal(readerSource.includes("> now())\n            )"),false,'future waiver is not selected as an effective pending row');
});
