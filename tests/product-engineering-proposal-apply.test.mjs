import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductEngineeringProposalApplyService } from '../src/application/product-engineering-proposal-apply-service.mjs';
import { createCanonicalApplicationIntent } from '../src/modules/product-engineering/application-authority.mjs';

const NOW='2026-10-07T17:30:00.000Z';

function acceptedProposal(overrides={}) {
  return Object.freeze({
    id:'proposal-1',
    analysisRunId:'analysis-1',
    findingId:'finding-1',
    brandId:'brand-1',
    styleId:'style-1',
    targetAuthority:'measurement',
    targetEntityId:'measurement-1',
    targetField:'chart',
    proposedValue:Object.freeze({
      measurementUnitEntryId:'unit-cm',
      baseSizeValueId:'size-m',
      sizes:[],
      points:[],
      notes:'AI-reviewed correction',
      schemaImageUri:null,
    }),
    status:'accepted',
    version:2,
    appliedReference:null,
    ...overrides,
  });
}

function intentFor(proposal, overrides={}) {
  return createCanonicalApplicationIntent({
    id:'intent-1',
    proposal,
    actorId:'actor-1',
    applicationCommandId:'apply-1',
    canonicalCommandId:'apply-1:canonical',
    expectedProposalVersion:2,
    expectedCanonicalVersion:7,
    canonicalBefore:{id:'measurement-1',version:7,notes:'old'},
    lineage:{evidenceIds:['evidence-1'],sourceIds:['source-1'],modelRunIds:['model-1']},
    preparedAt:NOW,
    ...overrides,
  });
}

test('accepted allowlisted proposal freezes precondition before canonical command and records immutable receipt reference',async()=>{
  let proposal=acceptedProposal();
  let intent=null;
  const calls=[];
  const productEngineering={
    async prepareProposalApplication(actorId,proposalId,input){
      assert.equal(actorId,'actor-1');
      assert.equal(proposalId,proposal.id);
      assert.equal(input.expectedVersion,2);
      assert.equal(input.applicationCommandId,'apply-1');
      assert.equal(input.canonicalCommandId,'apply-1:canonical');
      return {proposal,applicationIntent:intent,replay:false};
    },
    async getAnalysisWorkspaceForActor(){
      return {modelRuns:[{id:'model-1'}],evidence:[{id:'evidence-1',findingId:'finding-1',sourceId:'source-1'}]};
    },
    async recordProposalApplicationIntent(commandId,actorId,proposalId,input){
      calls.push({kind:'intent',commandId,actorId,proposalId,input});
      intent=createCanonicalApplicationIntent({
        id:'intent-1',proposal,actorId,
        applicationCommandId:input.applicationCommandId,
        canonicalCommandId:input.canonicalCommandId,
        expectedProposalVersion:input.expectedProposalVersion,
        expectedCanonicalVersion:input.expectedCanonicalVersion,
        canonicalBefore:input.canonicalBefore,
        lineage:input.lineage,
        preparedAt:NOW,
      });
      return intent;
    },
    async markProposalApplied(commandId,actorId,proposalId,input){
      calls.push({kind:'mark',commandId,actorId,proposalId,input});
      proposal=Object.freeze({...proposal,version:3,appliedReference:Object.freeze({
        authority:input.authority,entityId:input.entityId,version:input.version,action:input.action,
        commandId:input.commandId,receiptId:input.receipt.id,receiptHash:input.receipt.receiptHash,appliedAt:input.receipt.appliedAt,
      })});
      return proposal;
    },
  };
  const measurements={
    async getCanonicalForActor(actorId,entityId){
      calls.push({kind:'read',actorId,entityId});
      return Object.freeze({id:entityId,version:7,notes:'old'});
    },
    async updateCanonicalMeasurementChart(commandId,actorId,entityId,input){
      calls.push({kind:'canonical',commandId,actorId,entityId,input});
      return Object.freeze({id:entityId,version:8,notes:input.notes});
    },
  };
  const service=createProductEngineeringProposalApplyService({productEngineering,measurements,clock:()=>NOW});
  const result=await service.applyProposal('apply-1','actor-1','proposal-1',{
    expectedProposalVersion:2,
    expectedCanonicalVersion:7,
  });

  assert.equal(result.appliedReference.authority,'measurement');
  assert.equal(result.appliedReference.entityId,'measurement-1');
  assert.equal(result.appliedReference.version,8);
  assert.equal(result.appliedReference.action,'chart');
  assert.equal(result.appliedReference.commandId,'apply-1:canonical');
  assert.match(result.appliedReference.receiptHash,/^[0-9a-f]{64}$/);
  assert.deepEqual(calls.map(row=>row.kind),['read','intent','canonical','mark']);
  assert.equal(calls[1].input.lineage.analysisRunId,'analysis-1');
  assert.deepEqual(calls[1].input.lineage.evidenceIds,['evidence-1']);
  assert.equal(calls[3].input.receipt.expectedCanonicalVersion,7);
  assert.equal(calls[3].input.receipt.resultingCanonicalVersion,8);
  assert.equal(calls[3].input.receipt.preconditionHash,intent.preconditionHash);
  assert.deepEqual(calls[2],{
    kind:'canonical',
    commandId:'apply-1:canonical',
    actorId:'actor-1',
    entityId:'measurement-1',
    input:{
      measurementUnitEntryId:'unit-cm',
      baseSizeValueId:'size-m',
      sizes:[],
      points:[],
      notes:'AI-reviewed correction',
      schemaImageUri:null,
      expectedVersion:7,
    },
  });
});

test('AI proposal cannot override human supplied canonical expected version',async()=>{
  const proposal=acceptedProposal({targetAuthority:'material',targetEntityId:'MAT-001',targetField:'specification',proposedValue:{expectedVersion:999,weightGsm:310}});
  const productEngineering={
    prepareProposalApplication:async()=>({proposal,applicationIntent:null,replay:false}),
    async recordProposalApplicationIntent(_commandId,actorId,_proposalId,input){
      return createCanonicalApplicationIntent({
        id:'intent-2',proposal,actorId,applicationCommandId:input.applicationCommandId,canonicalCommandId:input.canonicalCommandId,
        expectedProposalVersion:input.expectedProposalVersion,expectedCanonicalVersion:input.expectedCanonicalVersion,
        canonicalBefore:input.canonicalBefore,lineage:input.lineage,preparedAt:NOW,
      });
    },
    markProposalApplied:async()=>proposal,
  };
  const materials={getForActor:async()=>({code:'MAT-001',version:4,weightGsm:300}),amendMaterialSpecification:async()=>{throw new Error('must not execute');}};
  const service=createProductEngineeringProposalApplyService({productEngineering,materials});
  await assert.rejects(
    ()=>service.applyProposal('apply-2','actor-1','proposal-1',{expectedProposalVersion:2,expectedCanonicalVersion:4}),
    error=>error.code==='PRODUCT_ENGINEERING_APPLY_VALUE_INVALID',
  );
});

test('unsupported proposal action fails before any canonical mutation',async()=>{
  const proposal=acceptedProposal({targetAuthority:'product_identity',targetField:'technical.category'});
  let touched=false;
  const productEngineering={
    prepareProposalApplication:async()=>({proposal,applicationIntent:null,replay:false}),
    recordProposalApplicationIntent:async()=>{touched=true;},
    markProposalApplied:async()=>proposal,
  };
  const measurements={getCanonicalForActor:async()=>{touched=true;},updateCanonicalMeasurementChart:async()=>{touched=true;}};
  const service=createProductEngineeringProposalApplyService({productEngineering,measurements});
  await assert.rejects(
    ()=>service.applyProposal('apply-3','actor-1','proposal-1',{expectedProposalVersion:2,expectedCanonicalVersion:1}),
    error=>error.code==='PRODUCT_ENGINEERING_APPLY_UNSUPPORTED',
  );
  assert.equal(touched,false);
});

test('same command recovers after canonical commit without rereading a now-advanced precondition',async()=>{
  let proposal=acceptedProposal({
    targetAuthority:'material',
    targetEntityId:'MAT-001',
    targetField:'specification',
    proposedValue:{weightGsm:310,cuttableWidth:145,cuttableWidthUnit:'cm',countryOfOrigin:'IT',purchaseUnit:'m',conversionFactor:1,materialSubtype:'shell'},
  });
  let intent=null;
  const canonicalByCommand=new Map();
  let canonicalMutations=0;
  let canonicalReads=0;
  let markAttempts=0;
  const productEngineering={
    async prepareProposalApplication(_actor,_proposalId,input){
      if(proposal.appliedReference){
        assert.equal(proposal.appliedReference.commandId,input.canonicalCommandId);
        return {proposal,applicationIntent:intent,replay:true};
      }
      return {proposal,applicationIntent:intent,replay:false};
    },
    async recordProposalApplicationIntent(_commandId,actorId,_proposalId,input){
      intent=createCanonicalApplicationIntent({
        id:'intent-crash',proposal,actorId,
        applicationCommandId:input.applicationCommandId,canonicalCommandId:input.canonicalCommandId,
        expectedProposalVersion:input.expectedProposalVersion,expectedCanonicalVersion:input.expectedCanonicalVersion,
        canonicalBefore:input.canonicalBefore,lineage:input.lineage,preparedAt:NOW,
      });
      return intent;
    },
    async markProposalApplied(_commandId,_actorId,_proposalId,input){
      markAttempts+=1;
      if(markAttempts===1) throw Object.assign(new Error('simulated crash after canonical commit'),{code:'SIMULATED_CRASH'});
      proposal=Object.freeze({...proposal,version:3,appliedReference:Object.freeze({
        authority:input.authority,entityId:input.entityId,version:input.version,action:input.action,
        commandId:input.commandId,receiptId:input.receipt.id,receiptHash:input.receipt.receiptHash,appliedAt:input.receipt.appliedAt,
      })});
      return proposal;
    },
  };
  const materials={
    async getForActor(){
      canonicalReads+=1;
      return {code:'MAT-001',version:5,weightGsm:300};
    },
    async amendMaterialSpecification(commandId,_actorId,code,input){
      if(canonicalByCommand.has(commandId)) return canonicalByCommand.get(commandId);
      canonicalMutations+=1;
      const result=Object.freeze({code,version:input.expectedVersion+1,weightGsm:input.weightGsm});
      canonicalByCommand.set(commandId,result);
      return result;
    },
  };
  const service=createProductEngineeringProposalApplyService({productEngineering,materials,clock:()=>NOW});

  await assert.rejects(
    ()=>service.applyProposal('apply-crash','actor-1','proposal-1',{expectedProposalVersion:2,expectedCanonicalVersion:5}),
    error=>error.code==='SIMULATED_CRASH',
  );
  const recovered=await service.applyProposal('apply-crash','actor-1','proposal-1',{
    expectedProposalVersion:2,
    expectedCanonicalVersion:5,
  });

  assert.equal(canonicalReads,1,'retry reuses immutable precondition intent instead of reading canonical v6 as if it were the original precondition');
  assert.equal(canonicalMutations,1);
  assert.equal(markAttempts,2);
  assert.equal(recovered.appliedReference.commandId,'apply-crash:canonical');
  assert.equal(recovered.appliedReference.version,6);
  assert.match(recovered.appliedReference.receiptHash,/^[0-9a-f]{64}$/);
});
