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

/** @param {{proposal?: any, context?: any}} [options] */
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
    impacts:rules.map(rule=>{
      const evidence=dependencyEvidence(rule.area,facts);
      return {
        ...rule,
        activeDependencyCount:evidence.count,
        evidence,
      };
    }),
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

function dependencyEvidence(area,facts){
  if(area==='measurements')return observed(facts.measurementCharts);
  if(area==='bom')return observed(facts.boms);
  if(area==='samples')return observed(facts.samples);
  if(area==='tech_pack')return observed(facts.techPacks);
  if(area==='sourcing')return observed(facts.sourcing);
  if(area==='production')return observed(facts.activeProductionOrders);
  if(area==='quality')return observed(facts.qualityInspections);
  if(area==='supplier_acknowledgement')return observed(facts.acknowledgedTechPacks);

  // The current Product Readiness context does not query these authorities directly.
  // Production presence is a useful warning signal for cutting/inline quality, but must
  // remain explicitly derived rather than being mislabeled as an observed row count.
  if(area==='cutting'||area==='inline_quality')return derived(facts.activeProductionOrders,'active_production_orders');

  return Object.freeze({status:'not_available',present:null,count:null,basis:null});
}
function observed(count){return Object.freeze({status:'observed',present:count>0,count,basis:null});}
function derived(count,basis){return Object.freeze({status:'derived',present:count>0,count,basis});}
function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const nested of Object.values(value))deepFreeze(nested);return value;}
