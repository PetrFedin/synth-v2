import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductEngineeringProposalApplyService } from '../src/application/product-engineering-proposal-apply-service.mjs';

function acceptedProposal(overrides={}) {
  return Object.freeze({
    id:'proposal-1',
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

test('accepted allowlisted proposal invokes owning canonical service then records applied reference',async()=>{
  let proposal=acceptedProposal();
  const calls=[];
  const productEngineering={
    async prepareProposalApplication(actorId,proposalId,input){
      assert.equal(actorId,'actor-1');
      assert.equal(proposalId,proposal.id);
      assert.equal(input.expectedVersion,2);
      assert.equal(input.applicationCommandId,'apply-1:canonical');
      return {proposal,replay:false};
    },
    async markProposalApplied(commandId,actorId,proposalId,input){
      calls.push({kind:'mark',commandId,actorId,proposalId,input});
      proposal=Object.freeze({...proposal,version:3,appliedReference:Object.freeze({...input,appliedAt:'2026-10-06T18:00:00.000Z'})});
      return proposal;
    },
  };
  const measurements={
    async updateCanonicalMeasurementChart(commandId,actorId,entityId,input){
      calls.push({kind:'canonical',commandId,actorId,entityId,input});
      return Object.freeze({id:entityId,version:8});
    },
  };
  const service=createProductEngineeringProposalApplyService({productEngineering,measurements});
  const result=await service.applyProposal('apply-1','actor-1','proposal-1',{
    expectedProposalVersion:2,
    expectedCanonicalVersion:7,
  });

  assert.equal(result.appliedReference.authority,'measurement');
  assert.equal(result.appliedReference.entityId,'measurement-1');
  assert.equal(result.appliedReference.version,8);
  assert.equal(result.appliedReference.action,'chart');
  assert.equal(result.appliedReference.commandId,'apply-1:canonical');
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0],{
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
  const proposal=acceptedProposal({proposedValue:{expectedVersion:999,weightGsm:310}});
  const productEngineering={
    prepareProposalApplication:async()=>({proposal,replay:false}),
    markProposalApplied:async()=>proposal,
  };
  const materials={amendMaterialSpecification:async()=>{throw new Error('must not execute');}};
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
    prepareProposalApplication:async()=>({proposal,replay:false}),
    markProposalApplied:async()=>proposal,
  };
  const measurements={updateCanonicalMeasurementChart:async()=>{touched=true;}};
  const service=createProductEngineeringProposalApplyService({productEngineering,measurements});
  await assert.rejects(
    ()=>service.applyProposal('apply-3','actor-1','proposal-1',{expectedProposalVersion:2,expectedCanonicalVersion:1}),
    error=>error.code==='PRODUCT_ENGINEERING_APPLY_UNSUPPORTED',
  );
  assert.equal(touched,false);
});

test('same command safely recovers when canonical mutation succeeded before appliedReference was recorded',async()=>{
  let proposal=acceptedProposal({
    targetAuthority:'material',
    targetEntityId:'MAT-001',
    targetField:'specification',
    proposedValue:{weightGsm:310,cuttableWidth:145,cuttableWidthUnit:'cm',countryOfOrigin:'IT',purchaseUnit:'m',conversionFactor:1,materialSubtype:'shell'},
  });
  const canonicalByCommand=new Map();
  let canonicalMutations=0;
  let markAttempts=0;
  const productEngineering={
    async prepareProposalApplication(_actor,_proposalId,input){
      if(proposal.appliedReference){
        assert.equal(proposal.appliedReference.commandId,input.applicationCommandId);
        return {proposal,replay:true};
      }
      return {proposal,replay:false};
    },
    async markProposalApplied(_commandId,_actorId,_proposalId,input){
      markAttempts+=1;
      if(markAttempts===1) throw Object.assign(new Error('simulated crash after canonical commit'),{code:'SIMULATED_CRASH'});
      proposal=Object.freeze({...proposal,version:3,appliedReference:Object.freeze({...input,appliedAt:'2026-10-06T18:00:00.000Z'})});
      return proposal;
    },
  };
  const materials={
    async amendMaterialSpecification(commandId,_actorId,code,input){
      if(canonicalByCommand.has(commandId)) return canonicalByCommand.get(commandId);
      canonicalMutations+=1;
      const result=Object.freeze({code,version:input.expectedVersion+1});
      canonicalByCommand.set(commandId,result);
      return result;
    },
  };
  const service=createProductEngineeringProposalApplyService({productEngineering,materials});

  await assert.rejects(
    ()=>service.applyProposal('apply-crash','actor-1','proposal-1',{expectedProposalVersion:2,expectedCanonicalVersion:5}),
    error=>error.code==='SIMULATED_CRASH',
  );
  const recovered=await service.applyProposal('apply-crash','actor-1','proposal-1',{
    expectedProposalVersion:2,
    expectedCanonicalVersion:5,
  });

  assert.equal(canonicalMutations,1);
  assert.equal(markAttempts,2);
  assert.equal(recovered.appliedReference.commandId,'apply-crash:canonical');
  assert.equal(recovered.appliedReference.version,6);
});
