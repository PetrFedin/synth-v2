import { invariant } from '../../core/errors.mjs';

const POLICY=Object.freeze({
  measurement:Object.freeze({
    chart:Object.freeze([
      impact('measurements','canonical_change','high'),
      impact('samples','review','high'),
      impact('tech_pack','revision','high'),
      impact('product_readiness','reassess','high'),
      impact('commercial_publication','reproject','medium'),
      impact('production','review_if_started','high'),
    ]),
  }),
  material:Object.freeze({
    specification:Object.freeze([
      impact('bom','review','high'),
      impact('cutting','review','high'),
      impact('tech_pack','revision','high'),
      impact('sourcing','review','medium'),
      impact('cost','recalculate','high'),
      impact('product_readiness','reassess','medium'),
      impact('production','review_if_started','high'),
    ]),
  }),
  tech_pack:Object.freeze({
    revision:Object.freeze([
      impact('production','review_if_started','high'),
      impact('quality','review','medium'),
      impact('supplier_acknowledgement','renew','high'),
      impact('product_readiness','reassess','medium'),
    ]),
  }),
  operation_sequence:Object.freeze({
    operations:Object.freeze([
      impact('production','review_if_started','high'),
      impact('inline_quality','review','medium'),
      impact('cost','recalculate','medium'),
      impact('tech_pack','review','medium'),
    ]),
  }),
});

export function evaluateEngineeringProposalImpact({proposal,context=null}={}) {
  invariant(proposal?.id&&proposal?.targetAuthority&&proposal?.targetField,'PRODUCT_ENGINEERING_IMPACT_PROPOSAL_REQUIRED','Engineering proposal is required for impact evaluation');
  const rules=POLICY[proposal.targetAuthority]?.[proposal.targetField]??[];
  const facts=summarizeContext(context);
  return deepFreeze({
    proposalId:proposal.id,
    authority:proposal.targetAuthority,
    action:proposal.targetField,
    targetEntityId:proposal.targetEntityId??null,
    supported:rules.length>0,
    contextStatus:context?'resolved':'unavailable',
    styleVersionId:context?.styleVersion?.id??null,
    impacts:rules.map(rule=>({
      ...rule,
      activeDependencyCount:dependencyCount(rule.area,facts),
      evidence:dependencyEvidence(rule.area,facts),
    })),
    facts,
  });
}

function impact(area,action,severity){return Object.freeze({area,action,severity});}

function summarizeContext(context){
  if(!context)return deepFreeze({
    measurementCharts:0,boms:0,samples:0,techPacks:0,sourcing:0,productionOrders:0,qualityInspections:0,
    activeProductionOrders:0,acknowledgedTechPacks:0,
  });
  const technical=Array.isArray(context.technicalEvidence)?context.technicalEvidence:[];
  const measurement=Array.isArray(context.measurementEvidence)?context.measurementEvidence:[];
  const count=(selector)=>technical.filter(selector).length;
  return deepFreeze({
    measurementCharts:measurement.length,
    boms:count(row=>Boolean(row.bom)),
    samples:count(row=>Boolean(row.sample)),
    techPacks:count(row=>Boolean(row.techPack)),
    sourcing:count(row=>Boolean(row.sourcing)),
    productionOrders:count(row=>Boolean(row.productionOrder)),
    qualityInspections:count(row=>Boolean(row.quality)),
    activeProductionOrders:count(row=>row.productionOrder&& !['cancelled','completed','closed'].includes(row.productionOrder.status)),
    acknowledgedTechPacks:count(row=>row.techPack?.status==='acknowledged'),
  });
}

function dependencyCount(area,facts){
  if(['measurements','product_readiness','commercial_publication','cost','cutting','inline_quality','supplier_acknowledgement'].includes(area)){
    if(area==='measurements')return facts.measurementCharts;
    if(area==='supplier_acknowledgement')return facts.acknowledgedTechPacks;
    if(area==='cutting'||area==='inline_quality')return facts.activeProductionOrders;
    return 0;
  }
  if(area==='bom')return facts.boms;
  if(area==='samples')return facts.samples;
  if(area==='tech_pack')return facts.techPacks;
  if(area==='sourcing')return facts.sourcing;
  if(area==='production')return facts.activeProductionOrders;
  if(area==='quality')return facts.qualityInspections;
  return 0;
}
function dependencyEvidence(area,facts){
  const count=dependencyCount(area,facts);
  return Object.freeze({present:count>0,count});
}
function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const nested of Object.values(value))deepFreeze(nested);return value;}
