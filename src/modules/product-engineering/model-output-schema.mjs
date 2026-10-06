import { invariant } from '../../core/errors.mjs';
import {
  CONFLICT_SEVERITIES,
  FINDING_ORIGINS,
  PROPOSAL_AUTHORITIES,
} from './public.mjs';
import { GARMENT_EDGE_TYPES, GARMENT_NODE_TYPES } from './garment-ontology.mjs';

const FINDING_TYPE=/^[a-z][a-z0-9_.-]{2,127}$/;
const TARGET_FIELD=/^[a-z][a-z0-9_.-]{1,159}$/;
const TOKEN=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const MAX_FINDINGS=500;
const MAX_PROPOSALS=500;
const MAX_CONFLICTS=250;
const MAX_EVIDENCE_PER_FINDING=100;
const MAX_GRAPH_NODES=1000;
const MAX_GRAPH_EDGES=5000;

export const ENGINEERING_OUTPUT_SCHEMAS=Object.freeze([
  'engineering-findings-v1',
  'garment-ontology-v1',
]);

export function validateEngineeringModelOutput({schemaVersion,output,sourceIds=[]}={}) {
  invariant(ENGINEERING_OUTPUT_SCHEMAS.includes(schemaVersion),'ENGINEERING_MODEL_SCHEMA_UNSUPPORTED','Engineering model output schema is not supported',{schemaVersion});
  object(output,'ENGINEERING_MODEL_OUTPUT_INVALID','Model output must be an object');
  exactFields(output,['findings','proposals','conflicts','garmentGraph'],'model output');

  const findings=array(output.findings??[],'ENGINEERING_MODEL_FINDINGS_INVALID','findings',MAX_FINDINGS);
  const proposals=array(output.proposals??[],'ENGINEERING_MODEL_PROPOSALS_INVALID','proposals',MAX_PROPOSALS);
  const conflicts=array(output.conflicts??[],'ENGINEERING_MODEL_CONFLICTS_INVALID','conflicts',MAX_CONFLICTS);
  const sourceSet=new Set(sourceIds);

  findings.forEach((finding,index)=>validateFinding(finding,index,sourceSet));
  proposals.forEach((proposal,index)=>validateProposal(proposal,index,findings.length));
  conflicts.forEach((conflict,index)=>validateConflict(conflict,index));

  if(schemaVersion==='engineering-findings-v1'){
    invariant(output.garmentGraph===undefined,'ENGINEERING_MODEL_SCHEMA_VIOLATION','engineering-findings-v1 does not allow garmentGraph');
  }else{
    invariant(output.garmentGraph!==undefined,'ENGINEERING_MODEL_SCHEMA_VIOLATION','garment-ontology-v1 requires garmentGraph');
    validateGraph(output.garmentGraph,findings.length,schemaVersion);
  }

  return output;
}

function validateFinding(value,index,sourceSet){
  object(value,'ENGINEERING_MODEL_FINDING_INVALID',`findings[${index}] must be an object`);
  exactFields(value,['findingType','origin','value','confidence','evidence'],`findings[${index}]`);
  invariant(typeof value.findingType==='string'&&FINDING_TYPE.test(value.findingType),'ENGINEERING_MODEL_FINDING_INVALID','findingType is invalid',{index});
  invariant(value.origin===undefined||FINDING_ORIGINS.includes(value.origin),'ENGINEERING_MODEL_FINDING_INVALID','finding origin is invalid',{index});
  invariant(Object.hasOwn(value,'value'),'ENGINEERING_MODEL_FINDING_INVALID','finding value is required',{index});
  json(value.value,'ENGINEERING_MODEL_FINDING_INVALID','finding value must be JSON-serializable',{index});
  confidence(value.confidence,`findings[${index}].confidence`);
  const evidence=array(value.evidence??[],'ENGINEERING_MODEL_EVIDENCE_INVALID',`findings[${index}].evidence`,MAX_EVIDENCE_PER_FINDING);
  evidence.forEach((item,evidenceIndex)=>{
    object(item,'ENGINEERING_MODEL_EVIDENCE_INVALID','evidence must be an object',{index,evidenceIndex});
    exactFields(item,['sourceId','sourceLocator','excerpt'],`findings[${index}].evidence[${evidenceIndex}]`);
    token(item.sourceId,'ENGINEERING_MODEL_EVIDENCE_INVALID','evidence sourceId is invalid',{index,evidenceIndex});
    invariant(sourceSet.has(item.sourceId),'ENGINEERING_MODEL_EVIDENCE_SOURCE_INVALID','Model evidence references a source outside the analysis',{sourceId:item.sourceId,index,evidenceIndex});
    if(item.sourceLocator!==undefined) object(item.sourceLocator,'ENGINEERING_MODEL_EVIDENCE_INVALID','sourceLocator must be an object',{index,evidenceIndex});
    if(item.sourceLocator!==undefined) json(item.sourceLocator,'ENGINEERING_MODEL_EVIDENCE_INVALID','sourceLocator must be JSON-serializable',{index,evidenceIndex});
    if(item.excerpt!==undefined&&item.excerpt!==null) boundedText(item.excerpt,1,4000,'ENGINEERING_MODEL_EVIDENCE_INVALID','evidence excerpt is invalid',{index,evidenceIndex});
  });
}

function validateProposal(value,index,findingCount){
  object(value,'ENGINEERING_MODEL_PROPOSAL_INVALID',`proposals[${index}] must be an object`);
  exactFields(value,['findingIndex','targetAuthority','targetEntityId','targetField','proposedValue','confidence','rationale'],`proposals[${index}]`);
  if(value.findingIndex!==undefined) invariant(Number.isInteger(value.findingIndex)&&value.findingIndex>=0&&value.findingIndex<findingCount,'ENGINEERING_MODEL_PROPOSAL_INVALID','proposal findingIndex is outside findings array',{index,findingIndex:value.findingIndex,findingCount});
  invariant(PROPOSAL_AUTHORITIES.includes(value.targetAuthority),'ENGINEERING_MODEL_PROPOSAL_INVALID','proposal targetAuthority is invalid',{index});
  if(value.targetEntityId!==undefined&&value.targetEntityId!==null) token(value.targetEntityId,'ENGINEERING_MODEL_PROPOSAL_INVALID','proposal targetEntityId is invalid',{index});
  invariant(typeof value.targetField==='string'&&TARGET_FIELD.test(value.targetField),'ENGINEERING_MODEL_PROPOSAL_INVALID','proposal targetField is invalid',{index});
  invariant(Object.hasOwn(value,'proposedValue'),'ENGINEERING_MODEL_PROPOSAL_INVALID','proposal proposedValue is required',{index});
  json(value.proposedValue,'ENGINEERING_MODEL_PROPOSAL_INVALID','proposal proposedValue must be JSON-serializable',{index});
  confidence(value.confidence,`proposals[${index}].confidence`);
  if(value.rationale!==undefined&&value.rationale!==null) boundedText(value.rationale,1,4000,'ENGINEERING_MODEL_PROPOSAL_INVALID','proposal rationale is invalid',{index});
}

function validateConflict(value,index){
  object(value,'ENGINEERING_MODEL_CONFLICT_INVALID',`conflicts[${index}] must be an object`);
  exactFields(value,['conflictType','subject','candidates','severity'],`conflicts[${index}]`);
  invariant(typeof value.conflictType==='string'&&FINDING_TYPE.test(value.conflictType),'ENGINEERING_MODEL_CONFLICT_INVALID','conflictType is invalid',{index});
  boundedText(value.subject,1,240,'ENGINEERING_MODEL_CONFLICT_INVALID','conflict subject is invalid',{index});
  const candidates=array(value.candidates,'ENGINEERING_MODEL_CONFLICT_INVALID',`conflicts[${index}].candidates`,100);
  invariant(candidates.length>=2,'ENGINEERING_MODEL_CONFLICT_INVALID','conflict requires at least two candidates',{index});
  candidates.forEach((candidate,candidateIndex)=>json(candidate,'ENGINEERING_MODEL_CONFLICT_INVALID','conflict candidate must be JSON-serializable',{index,candidateIndex}));
  invariant(CONFLICT_SEVERITIES.includes(value.severity),'ENGINEERING_MODEL_CONFLICT_INVALID','conflict severity is invalid',{index});
}

function validateGraph(value,findingCount,schemaVersion){
  object(value,'ENGINEERING_MODEL_GRAPH_INVALID','garmentGraph must be an object');
  exactFields(value,['schemaVersion','nodes','edges'],'garmentGraph');
  invariant(value.schemaVersion===schemaVersion,'ENGINEERING_MODEL_GRAPH_INVALID','garmentGraph schemaVersion must match model contract',{expected:schemaVersion,actual:value.schemaVersion});
  const nodes=array(value.nodes,'ENGINEERING_MODEL_GRAPH_INVALID','garmentGraph.nodes',MAX_GRAPH_NODES);
  const edges=array(value.edges,'ENGINEERING_MODEL_GRAPH_INVALID','garmentGraph.edges',MAX_GRAPH_EDGES);
  invariant(nodes.length>=1,'ENGINEERING_MODEL_GRAPH_INVALID','garmentGraph requires at least one node');
  const keys=new Set();
  nodes.forEach((node,index)=>{
    object(node,'ENGINEERING_MODEL_GRAPH_INVALID',`garmentGraph.nodes[${index}] must be an object`);
    exactFields(node,['key','nodeType','semanticCode','label','attributes','confidence','findingIndex'],`garmentGraph.nodes[${index}]`);
    token(node.key,'ENGINEERING_MODEL_GRAPH_INVALID','garment node key is invalid',{index});
    invariant(!keys.has(node.key),'ENGINEERING_MODEL_GRAPH_INVALID','garment node keys must be unique',{key:node.key,index});
    keys.add(node.key);
    invariant(GARMENT_NODE_TYPES.includes(node.nodeType),'ENGINEERING_MODEL_GRAPH_INVALID','garment node type is invalid',{index,nodeType:node.nodeType});
    if(node.semanticCode!==undefined&&node.semanticCode!==null) token(node.semanticCode,'ENGINEERING_MODEL_GRAPH_INVALID','garment semanticCode is invalid',{index});
    if(node.label!==undefined&&node.label!==null) boundedText(node.label,1,240,'ENGINEERING_MODEL_GRAPH_INVALID','garment node label is invalid',{index});
    if(node.attributes!==undefined){object(node.attributes,'ENGINEERING_MODEL_GRAPH_INVALID','garment node attributes must be an object',{index});json(node.attributes,'ENGINEERING_MODEL_GRAPH_INVALID','garment node attributes must be JSON-serializable',{index});}
    confidence(node.confidence,`garmentGraph.nodes[${index}].confidence`);
    if(node.findingIndex!==undefined) invariant(Number.isInteger(node.findingIndex)&&node.findingIndex>=0&&node.findingIndex<findingCount,'ENGINEERING_MODEL_GRAPH_INVALID','garment node findingIndex is outside findings array',{index,findingIndex:node.findingIndex,findingCount});
  });
  invariant(nodes.filter(node=>node.nodeType==='garment').length===1,'ENGINEERING_MODEL_GRAPH_INVALID','garmentGraph requires exactly one garment root');
  edges.forEach((edge,index)=>{
    object(edge,'ENGINEERING_MODEL_GRAPH_INVALID',`garmentGraph.edges[${index}] must be an object`);
    exactFields(edge,['from','to','relation','attributes','confidence'],`garmentGraph.edges[${index}]`);
    token(edge.from,'ENGINEERING_MODEL_GRAPH_INVALID','garment edge from is invalid',{index});
    token(edge.to,'ENGINEERING_MODEL_GRAPH_INVALID','garment edge to is invalid',{index});
    invariant(edge.from!==edge.to,'ENGINEERING_MODEL_GRAPH_INVALID','garment edge cannot self-reference',{index});
    invariant(keys.has(edge.from)&&keys.has(edge.to),'ENGINEERING_MODEL_GRAPH_INVALID','garment edge references an unknown node',{index,from:edge.from,to:edge.to});
    invariant(GARMENT_EDGE_TYPES.includes(edge.relation),'ENGINEERING_MODEL_GRAPH_INVALID','garment edge relation is invalid',{index,relation:edge.relation});
    if(edge.attributes!==undefined){object(edge.attributes,'ENGINEERING_MODEL_GRAPH_INVALID','garment edge attributes must be an object',{index});json(edge.attributes,'ENGINEERING_MODEL_GRAPH_INVALID','garment edge attributes must be JSON-serializable',{index});}
    confidence(edge.confidence,`garmentGraph.edges[${index}].confidence`);
  });
}

function exactFields(value,allowed,label){
  const set=new Set(allowed);
  const unknown=Object.keys(value).filter(key=>!set.has(key)).sort();
  invariant(unknown.length===0,'ENGINEERING_MODEL_SCHEMA_VIOLATION',`${label} contains unsupported fields`,{label,unknownFields:unknown,allowedFields:[...allowed].sort()});
}
function array(value,code,label,max){
  invariant(Array.isArray(value),code,`${label} must be an array`);
  invariant(value.length<=max,'ENGINEERING_MODEL_RESOURCE_LIMIT',`${label} exceeds model output limit`,{label,max});
  return value;
}
function object(value,code,message,details={}){invariant(value&&typeof value==='object'&&!Array.isArray(value),code,message,details);}
function token(value,code,message,details={}){invariant(typeof value==='string'&&TOKEN.test(value),code,message,details);}
function boundedText(value,min,max,code,message,details={}){invariant(typeof value==='string'&&value.trim().length>=min&&value.trim().length<=max,code,message,details);}
function confidence(value,label){invariant(value===undefined||value===null||(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1),'ENGINEERING_MODEL_CONFIDENCE_INVALID',`${label} must be between 0 and 1`);}
function json(value,code,message,details={}){try{JSON.stringify(value);}catch{invariant(false,code,message,details);}}
