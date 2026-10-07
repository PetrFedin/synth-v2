import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductEngineeringProposalImpactService } from '../src/application/product-engineering-proposal-impact-service.mjs';

test('proposal impact service resolves exact analysis StyleVersion context',async()=>{
  const proposal={
    id:'proposal-1',analysisRunId:'analysis-1',brandId:'brand-1',styleId:'style-1',
    targetAuthority:'tech_pack',targetEntityId:'TP-1',targetField:'revision',
  };
  const productEngineering={
    async getProposalForActor(actorId,proposalId){
      assert.equal(actorId,'user-1'); assert.equal(proposalId,'proposal-1'); return proposal;
    },
    async getAnalysisWorkspaceForActor(actorId,analysisRunId){
      assert.equal(actorId,'user-1'); assert.equal(analysisRunId,'analysis-1');
      return {analysis:{id:'analysis-1',brandId:'brand-1',styleId:'style-1',styleVersionId:'sv-1'}};
    },
  };
  const readinessSourceReader={
    async loadAssessmentContext(styleVersionId){
      assert.equal(styleVersionId,'sv-1');
      return {
        styleVersion:{id:'sv-1',brandId:'brand-1',styleId:'style-1'},
        measurementEvidence:[],
        technicalEvidence:[{
          productSkuId:'sku-1',
          techPack:{techPackCode:'TP-1',status:'acknowledged'},
          productionOrder:{productionOrderNumber:'PO-1',status:'confirmed'},
          quality:{inspectionCode:'QC-1',status:'released'},
        }],
      };
    },
  };
  const service=createProductEngineeringProposalImpactService({productEngineering,readinessSourceReader});
  const result=await service.getProposalImpactForActor('user-1','proposal-1');
  assert.equal(result.contextStatus,'resolved');
  assert.equal(result.styleVersionId,'sv-1');
  const byArea=new Map(result.impacts.map(row=>[row.area,row]));
  assert.equal(byArea.get('production').activeDependencyCount,1);
  assert.equal(byArea.get('quality').activeDependencyCount,1);
  assert.equal(byArea.get('supplier_acknowledgement').activeDependencyCount,1);
});

test('proposal impact service refuses cross-style readiness context',async()=>{
  const productEngineering={
    getProposalForActor:async()=>({
      id:'proposal-2',analysisRunId:'analysis-2',brandId:'brand-1',styleId:'style-1',
      targetAuthority:'material',targetEntityId:'MAT-1',targetField:'specification',
    }),
    getAnalysisWorkspaceForActor:async()=>({
      analysis:{id:'analysis-2',brandId:'brand-1',styleId:'style-1',styleVersionId:'sv-2'},
    }),
  };
  const readinessSourceReader={
    loadAssessmentContext:async()=>({
      styleVersion:{id:'sv-2',brandId:'brand-1',styleId:'style-other'},
      measurementEvidence:[],technicalEvidence:[],
    }),
  };
  const service=createProductEngineeringProposalImpactService({productEngineering,readinessSourceReader});
  await assert.rejects(
    ()=>service.getProposalImpactForActor('user-1','proposal-2'),
    error=>error.code==='PRODUCT_ENGINEERING_IMPACT_LINEAGE_INVALID',
  );
});

test('proposal impact service does not invent repository facts when analysis has no StyleVersion',async()=>{
  let reads=0;
  const productEngineering={
    getProposalForActor:async()=>({
      id:'proposal-3',analysisRunId:'analysis-3',brandId:'brand-1',styleId:'style-1',
      targetAuthority:'measurement',targetEntityId:'measurement-1',targetField:'chart',
    }),
    getAnalysisWorkspaceForActor:async()=>({
      analysis:{id:'analysis-3',brandId:'brand-1',styleId:'style-1',styleVersionId:null},
    }),
  };
  const readinessSourceReader={loadAssessmentContext:async()=>{reads+=1; return null;}};
  const service=createProductEngineeringProposalImpactService({productEngineering,readinessSourceReader});
  const result=await service.getProposalImpactForActor('user-1','proposal-3');
  assert.equal(reads,0);
  assert.equal(result.contextStatus,'unavailable');
});
