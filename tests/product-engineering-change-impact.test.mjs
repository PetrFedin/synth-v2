import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acknowledgeEngineeringChangeCase,
  createEngineeringChangeCase,
  createEngineeringSourceRevision,
  evaluateSourceRevisionImpact,
} from '../src/modules/product-engineering/change-impact.mjs';

const OLD_HASH='a'.repeat(64);
const NEW_HASH='b'.repeat(64);
const NOW='2026-10-08T10:00:00.000Z';

function source(id,hash,overrides={}) {
  return Object.freeze({
    id,brandId:'brand-1',styleId:'style-1',status:'admitted',parseStatus:'completed',contentHash:hash,
    ...overrides,
  });
}

test('source revision is immutable evidence between two admitted parsed byte identities',()=>{
  const revision=createEngineeringSourceRevision({
    id:'revision-1',
    superseded:source('source-old',OLD_HASH),
    replacement:source('source-new',NEW_HASH),
    reason:'Factory issued corrected specification.',
    createdAt:NOW,
    createdBy:'actor-1',
  });
  assert.equal(revision.supersededSourceId,'source-old');
  assert.equal(revision.replacementSourceId,'source-new');
  assert.equal(revision.supersededContentHash,OLD_HASH);
  assert.equal(revision.replacementContentHash,NEW_HASH);
  assert.equal(Object.isFrozen(revision),true);
});

test('source revision refuses same bytes, foreign style and unparsed replacement',()=>{
  assert.throws(()=>createEngineeringSourceRevision({
    id:'revision-x',superseded:source('old',OLD_HASH),replacement:source('new',OLD_HASH),reason:'x',createdAt:NOW,createdBy:'actor-1',
  }),error=>error.code==='PRODUCT_ENGINEERING_SOURCE_REVISION_IDENTICAL');
  assert.throws(()=>createEngineeringSourceRevision({
    id:'revision-x',superseded:source('old',OLD_HASH),replacement:source('new',NEW_HASH,{styleId:'style-2'}),reason:'x',createdAt:NOW,createdBy:'actor-1',
  }),error=>error.code==='PRODUCT_ENGINEERING_SOURCE_REVISION_SCOPE_MISMATCH');
  assert.throws(()=>createEngineeringSourceRevision({
    id:'revision-x',superseded:source('old',OLD_HASH),replacement:source('new',NEW_HASH,{parseStatus:'pending'}),reason:'x',createdAt:NOW,createdBy:'actor-1',
  }),error=>error.code==='PRODUCT_ENGINEERING_SOURCE_REVISION_NOT_PARSED');
});

test('version-aware propagation keeps observed lineage separate from downstream policy requirements',()=>{
  const revision=createEngineeringSourceRevision({
    id:'revision-1',superseded:source('source-old',OLD_HASH),replacement:source('source-new',NEW_HASH),
    reason:'Corrected technical specification.',createdAt:NOW,createdBy:'actor-1',
  });
  const evaluation=evaluateSourceRevisionImpact({
    revision,
    lineage:{
      analyses:[{id:'analysis-1',version:3}],
      evidence:[{id:'evidence-1',findingId:'finding-1'}],
      findings:[{id:'finding-1',contentHash:'c'.repeat(64),supersededById:null}],
      proposals:[{id:'proposal-1',version:2,status:'accepted',targetAuthority:'material',targetField:'specification',targetEntityId:'MAT-001'}],
      garmentNodes:[{id:'node-1',graphId:'graph-1',nodeType:'material_role',findingId:'finding-1'}],
      technicalFlats:[{id:'flat-object-1',drawingId:'drawing-1',drawingVersionNo:4,objectType:'panel',garmentNodeId:'node-1'}],
      receipts:[{
        id:'receipt-1',proposalId:'proposal-1',targetAuthority:'material',targetEntityId:'MAT-001',targetAction:'specification',
        resultingCanonicalVersion:6,receiptHash:'d'.repeat(64),
      }],
    },
  });

  assert.match(evaluation.impactHash,/^[0-9a-f]{64}$/);
  assert.equal(evaluation.snapshot.exactDependencyCounts.evidence,1);
  assert.equal(evaluation.snapshot.exactDependencyCounts.canonicalReceipts,1);

  const canonical=evaluation.impacts.find(row=>row.impactKind==='canonical_target'&&row.entityId==='MAT-001');
  assert.equal(canonical.evidenceStatus,'observed');
  assert.equal(canonical.entityVersion,'6');
  assert.equal(canonical.requiredAction,'re-review');

  const cost=evaluation.impacts.find(row=>row.impactKind==='downstream_policy'&&row.area==='cost');
  assert.equal(cost.evidenceStatus,'policy_required');
  assert.equal(cost.requiredAction,'recalculate');
  assert.equal(cost.severity,'high');

  const production=evaluation.impacts.find(row=>row.impactKind==='downstream_policy'&&row.area==='production');
  assert.equal(production.evidenceStatus,'policy_required');
  assert.equal(production.requiredAction,'review_if_started');

  assert.equal(evaluation.impacts.some(row=>row.area==='cost'&&row.evidenceStatus==='observed'),false);
  assert.equal(evaluation.impacts.some(row=>row.impactKind==='technical_flat'&&row.entityVersion==='4'),true);
});

test('change case acknowledgement is explicit optimistic workflow state, not automatic resolution',()=>{
  const revision=createEngineeringSourceRevision({
    id:'revision-1',superseded:source('source-old',OLD_HASH),replacement:source('source-new',NEW_HASH),
    reason:'Corrected technical specification.',createdAt:NOW,createdBy:'actor-1',
  });
  const evaluation=evaluateSourceRevisionImpact({revision,lineage:{}});
  const changeCase=createEngineeringChangeCase({
    id:'case-1',revision,evaluation,createdAt:NOW,createdBy:'actor-1',
  });
  const acknowledged=acknowledgeEngineeringChangeCase(changeCase,{
    note:'Engineering team accepted the re-review workload.',
    acknowledgedAt:'2026-10-08T10:01:00.000Z',
    acknowledgedBy:'actor-2',
  });
  assert.equal(acknowledged.status,'acknowledged');
  assert.equal(acknowledged.version,2);
  assert.equal(acknowledged.resolvedAt,null);
});
