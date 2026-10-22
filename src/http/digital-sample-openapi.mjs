import { DIGITAL_SAMPLE_FORMATS, DIGITAL_SAMPLE_INPUT_FIELDS, SCENARIO_FIELDS } from '../modules/digital-samples/public.mjs';
const id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const text={type:'string',minLength:1,maxLength:160};
const money={type:'string',pattern:'^(0|[1-9][0-9]{0,11})(\\.[0-9]{1,4})?$'};
const signedMoney={type:'string',pattern:'^-?[0-9]+\\.[0-9]{4}$'};
const nullableCount={type:['string','null'],pattern:'^[0-9]+$'};
const props={titleRu:text,titleEn:text,sourceFileName:{type:'string',minLength:1,maxLength:200},sourceFormat:{type:'string',enum:[...DIGITAL_SAMPLE_FORMATS]},declaredSha256:hash,declaredByteLength:{type:'integer',minimum:1,maximum:524288000},note:{type:'string',maxLength:2000}};
const manifest={type:'object',additionalProperties:false,required:DIGITAL_SAMPLE_INPUT_FIELDS.filter(k=>k!=='note'),properties:props};
const lineage={id,brandId:id,styleId:id,styleVersionId:id,styleVersionContentHash:hash,manifestHash:hash,createdAt:{type:'string',format:'date-time'},createdBy:id,productionReady:{const:false}};
const sampleProps={...props,...lineage,seriesId:id,revision:{type:'integer',minimum:1,maximum:2147483647},previousVersionId:{anyOf:[id,{type:'null'}]},artifactVerification:{const:'declared_only'},reviewStatus:{const:'not_reviewed'},viewable:{const:false}};
const sample={type:'object',additionalProperties:false,required:Object.keys(sampleProps),properties:sampleProps};
const scenarioProps={name:text,currency:{type:'string',enum:['EUR','RUB','USD','GBP','CHF','CNY','JPY']},quantity:{type:'integer',minimum:1,maximum:1000000},expectedSoldUnits:{type:'integer',minimum:0,maximum:1000000},minimumOrderQuantity:{type:'integer',minimum:1,maximum:1000000},packSize:{type:'integer',minimum:1,maximum:1000000},unitProductionCost:money,netUnitPrice:money,unitSellingCost:money,fixedDevelopmentCost:money};
const scenarioInput={type:'object',additionalProperties:false,required:[...SCENARIO_FIELDS],properties:scenarioProps};
const resultProps=Object.fromEntries(['plannedRevenue','unitContribution','contributionSalesResult','unsoldStockAtProductionCost','batchInvestment','batchCashResult','fullSellThroughCashResult','reconciliationResidual'].map(k=>[k,signedMoney]));
Object.assign(resultProps,{unsoldUnits:{type:'integer',minimum:0},salesBreakEvenUnits:nullableCount,batchCashBreakEvenUnits:nullableCount,batchCashBreakEvenReachable:{type:'boolean'},breakEvenNetUnitPrice:{anyOf:[signedMoney,{type:'null'}]}});
const calculation={type:'object',additionalProperties:false,required:['formulaVersion','basis','unitOfMeasure','monetaryScale','input','result','blockers','warnings','productionReady','demandVerified'],properties:{formulaVersion:{const:'digital-batch-scenario-v1'},basis:{const:'manual_estimate'},unitOfMeasure:{const:'piece'},monetaryScale:{const:4},input:scenarioInput,result:{type:'object',additionalProperties:false,required:Object.keys(resultProps),properties:resultProps},blockers:{type:'array',items:{enum:['MOQ_NOT_MET','PACK_MULTIPLE_NOT_MET']}},warnings:{type:'array',items:{enum:['NON_POSITIVE_UNIT_CONTRIBUTION','BATCH_CASH_RECOVERY_UNREACHABLE','BATCH_CASH_SHORTFALL']}},productionReady:{const:false},demandVerified:{const:false}}};
const scenarioRecordProps={...lineage,sampleVersionId:id,sampleManifestHash:hash,calculation,inputHash:hash,dataClass:{const:'planning_estimate'}};
const scenario={type:'object',additionalProperties:false,required:Object.keys(scenarioRecordProps),properties:scenarioRecordProps};
const page=items=>({type:'object',required:['items','nextCursor'],additionalProperties:false,properties:{items:{type:'array',items,maxItems:100},nextCursor:{anyOf:[id,{type:'null'}]}}});
const ref=name=>({$ref:`#/components/schemas/${name}`});
function operation(operationId,param,response,{input=null,paged=false}={}) {
  return {operationId,tags:['Digital samples'],security:[{bearerAuth:[]}],
    description:'Authenticated metadata and manual planning estimates only. Not an uploaded/validated asset, demand observation, Actual Cost, or production approval.',
    parameters:[{name:param,in:'path',required:true,schema:id},...(input?[{name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'}}]:[]),...(paged?[{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100,default:50}},{name:'afterId',in:'query',schema:id}]:[])],
    ...(input?{requestBody:{required:true,content:{'application/json':{schema:input}}}}:{}),
    responses:{200:{description:'Versioned result',content:{'application/json':{schema:{type:'object',required:['data','requestId'],additionalProperties:false,properties:{data:response,requestId:{type:'string'}}}}}},
      ...Object.fromEntries([[400,'Invalid transport contract'],[401,'Session required'],[403,'Capability denied'],[404,'Unknown or unavailable context'],[409,'Stale revision or command conflict'],[422,'Invalid declaration or planning input'],[500,'Internal failure'],[503,'Service unavailable']].map(([s,description])=>[s,{description,content:{'application/json':{schema:ref('Error')}}}]))}};
}
export function withDigitalSampleOpenApi(base) {
  const spec=structuredClone(base); spec.components??={}; spec.components.schemas??={}; spec.paths??={};
  Object.assign(spec.components.schemas,{DigitalSampleInput:manifest,DigitalSampleAppend:{...manifest,required:[...manifest.required,'expectedHeadId'],properties:{...props,expectedHeadId:id}},DigitalSampleVersion:sample,DigitalSampleScenarioInput:scenarioInput,DigitalSampleScenario:scenario});
  Object.assign(spec.paths,{
    '/product/style-versions/{styleVersionId}/digital-samples':{get:operation('listDigitalSamples','styleVersionId',page(ref('DigitalSampleVersion')),{paged:true}),post:operation('createDigitalSample','styleVersionId',ref('DigitalSampleVersion'),{input:ref('DigitalSampleInput')})},
    '/digital-sample-series/{seriesId}/versions':{get:operation('listDigitalSampleHistory','seriesId',page(ref('DigitalSampleVersion')),{paged:true}),post:operation('appendDigitalSample','seriesId',ref('DigitalSampleVersion'),{input:ref('DigitalSampleAppend')})},
    '/digital-sample-versions/{versionId}':{get:operation('getDigitalSample','versionId',ref('DigitalSampleVersion'))},
    '/digital-sample-versions/{versionId}/scenarios':{get:operation('listDigitalSampleScenarios','versionId',page(ref('DigitalSampleScenario')),{paged:true}),post:operation('createDigitalSampleScenario','versionId',ref('DigitalSampleScenario'),{input:ref('DigitalSampleScenarioInput')})},
  });
  return spec;
}
