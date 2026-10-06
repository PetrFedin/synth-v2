import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEngineeringProposalImpact } from '../src/modules/product-engineering/proposal-impact.mjs';

function proposal(overrides={}) {
  return Object.freeze({
    id:'proposal-1',
    analysisRunId:'analysis-1',
    brandId:'brand-1',
    styleId:'style-1',
    targetAuthority:'material',
    targetEntityId:'MAT-001',
    targetField:'specification',
    ...overrides,
  });
}

test('material specification impact is deterministic and reflects active downstream facts',()=>{
  const context={
    styleVersion:{id:'sv-1',styleId:'style-1',brandId:'brand-1'},
    measurementEvidence:[{id:'m1'}],
    technicalEvidence:[
      {
        productSkuId:'sku-1',
        bom:{id:'bom-1',status:'published',version:2},
        sample:{sampleCode:'S1',status:'approved'},
        techPack:{techPackCode:'TP1',status:'acknowledged'},
        sourcing:{rfqCode:'RFQ1',status:'allocated'},
        productionOrder:{productionOrderNumber:'PO1',status:'confirmed'},
        quality:{inspectionCode:'QC1',status:'released'},
      },
      {
        productSkuId:'sku-2',
        bom:{id:'bom-2',status:'draft',version:1},
        sample:null,
        techPack:null,
        sourcing:null,
        productionOrder:{productionOrderNumber:'PO2',status:'completed'},
        quality:null,
      },
    ],
  };
  const result=evaluateEngineeringProposalImpact({proposal:proposal(),context});
  assert.equal(result.supported,true);
  assert.equal(result.contextStatus,'resolved');
  assert.equal(result.styleVersionId,'sv-1');
  assert.deepEqual(result.facts,{
    measurementCharts:1,
    boms:2,
    samples:1,
    techPacks:1,
    sourcing:1,
    productionOrders:2,
    qualityInspections:1,
    activeProductionOrders:1,
    acknowledgedTechPacks:1,
  });
  const byArea=new Map(result.impacts.map(row=>[row.area,row]));
  assert.equal(byArea.get('bom').activeDependencyCount,2);
  assert.equal(byArea.get('tech_pack').activeDependencyCount,1);
  assert.equal(byArea.get('sourcing').activeDependencyCount,1);
  assert.equal(byArea.get('production').activeDependencyCount,1);
  assert.equal(byArea.get('cost').action,'recalculate');
  assert.equal(byArea.get('cost').activeDependencyCount,null);
  assert.equal(byArea.get('cost').evidence.status,'not_available');
  assert.equal(byArea.get('cutting').evidence.status,'derived');
  assert.equal(byArea.get('cutting').evidence.basis,'active_production_orders');
  assert.equal(byArea.get('production').severity,'high');
  assert.equal(byArea.get('production').evidence.status,'observed');
});

test('impact preview stays explicit when exact StyleVersion context is unavailable',()=>{
  const result=evaluateEngineeringProposalImpact({
    proposal:proposal({targetAuthority:'measurement',targetEntityId:'measurement-1',targetField:'chart'}),
    context:null,
  });
  assert.equal(result.supported,true);
  assert.equal(result.contextStatus,'unavailable');
  assert.equal(result.styleVersionId,null);
  assert.equal(result.impacts.some(row=>row.area==='samples'&&row.action==='review'),true);
  assert.equal(result.impacts.find(row=>row.area==='samples').activeDependencyCount,0);
  assert.equal(result.impacts.find(row=>row.area==='samples').evidence.status,'observed');
  assert.equal(result.impacts.find(row=>row.area==='commercial_publication').activeDependencyCount,null);
  assert.equal(result.impacts.find(row=>row.area==='commercial_publication').evidence.status,'not_available');
});

test('unsupported proposal action has no invented downstream impact policy',()=>{
  const result=evaluateEngineeringProposalImpact({
    proposal:proposal({targetAuthority:'product_identity',targetField:'technical.category'}),
    context:null,
  });
  assert.equal(result.supported,false);
  assert.deepEqual(result.impacts,[]);
});
