import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closeEngineeringChangeImpact,
  createEngineeringChangeImpactReceipt,
  resolveEngineeringChangeCase,
} from '../src/modules/product-engineering/change-impact.mjs';

const NOW='2026-10-08T13:40:00.000Z';

function impact(overrides={}) {
  return Object.freeze({
    id:'impact-1',changeCaseId:'case-1',impactKind:'downstream_policy',entityId:'MAT-001',entityVersion:'6',
    area:'cost',requiredAction:'recalculate',severity:'high',evidenceStatus:'policy_required',basis:Object.freeze({receiptId:'application-receipt-1'}),
    status:'pending',createdAt:'2026-10-08T13:00:00.000Z',createdBy:'actor-0',version:1,...overrides,
  });
}

test('resolved impact produces immutable proof without waiver semantics',()=>{
  const current=impact();
  const receipt=createEngineeringChangeImpactReceipt({
    id:'receipt-1',impact:current,disposition:'resolved',reason:'Cost authority recalculated from corrected material specification.',
    evidence:[{kind:'canonical_receipt',id:'cost-close-2',hash:'a'.repeat(64)}],
    resultReference:{authority:'cost',entityId:'order-1',version:9,receiptId:'cost-close-2'},
    createdAt:NOW,createdBy:'actor-1',
  });
  const next=closeEngineeringChangeImpact(current,receipt);
  assert.equal(receipt.disposition,'resolved');
  assert.equal(receipt.waiver,null);
  assert.equal(receipt.previousImpactVersion,1);
  assert.equal(receipt.resultingImpactVersion,2);
  assert.match(receipt.receiptHash,/^[0-9a-f]{64}$/);
  assert.equal(next.status,'resolved');
  assert.equal(next.version,2);
});

test('waiver is an explicit governed exception and cannot pretend canonical correction',()=>{
  const current=impact({id:'impact-2'});
  const receipt=createEngineeringChangeImpactReceipt({
    id:'receipt-2',impact:current,disposition:'waived',reason:'Temporary shipment exception approved by engineering lead.',
    evidence:[{kind:'approval',id:'approval-77'}],
    waiver:{scope:'single-production-release',expiresAt:'2026-10-15T00:00:00.000Z',reviewAt:'2026-10-12T00:00:00.000Z'},
    createdAt:NOW,createdBy:'actor-2',
  });
  assert.equal(receipt.resultReference,null);
  assert.equal(receipt.waiver.scope,'single-production-release');
  assert.equal(closeEngineeringChangeImpact(current,receipt).status,'waived');
  assert.throws(()=>createEngineeringChangeImpactReceipt({
    id:'bad',impact:current,disposition:'waived',reason:'bad',evidence:[{kind:'approval'}],
    resultReference:{authority:'production',entityId:'po-1',version:4},waiver:{scope:'x'},createdAt:NOW,createdBy:'actor-2',
  }),error=>error.code==='PRODUCT_ENGINEERING_CHANGE_IMPACT_WAIVER_RESULT_INVALID');
});

test('closing impact requires evidence and exact pending version',()=>{
  const current=impact({evidenceStatus:'observed'});
  assert.throws(()=>createEngineeringChangeImpactReceipt({
    id:'receipt-x',impact:current,disposition:'resolved',reason:'done',evidence:[],createdAt:NOW,createdBy:'actor-1',
  }),error=>error.code==='PRODUCT_ENGINEERING_CHANGE_IMPACT_EVIDENCE_REQUIRED');
  const receipt=createEngineeringChangeImpactReceipt({
    id:'receipt-ok',impact:current,disposition:'resolved',reason:'done',evidence:[{kind:'review'}],createdAt:NOW,createdBy:'actor-1',
  });
  assert.throws(()=>closeEngineeringChangeImpact({...current,version:2},receipt),error=>error.code==='PRODUCT_ENGINEERING_CHANGE_IMPACT_CONCURRENCY_CONFLICT');
});

test('change case resolves only after impact workflow says no pending impacts remain',()=>{
  const changeCase=Object.freeze({
    id:'case-1',status:'acknowledged',version:2,resolvedAt:null,resolvedBy:null,
  });
  const resolved=resolveEngineeringChangeCase(changeCase,{resolvedAt:NOW,resolvedBy:'actor-3'});
  assert.equal(resolved.status,'resolved');
  assert.equal(resolved.version,3);
  assert.equal(resolved.resolvedBy,'actor-3');
});
