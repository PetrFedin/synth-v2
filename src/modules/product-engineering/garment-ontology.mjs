import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

export const GARMENT_NODE_TYPES=Object.freeze([
  'garment','component','panel','seam','stitch','closure','pocket','collar','cuff','trim',
  'material_role','measurement_anchor','construction_node','operation_candidate',
]);
export const GARMENT_EDGE_TYPES=Object.freeze([
  'contains','part_of','connects_to','located_on','constructed_by','stitched_by',
  'measured_by','materialized_by','operation_candidate','supports',
]);

export function createGarmentGraph({id,analysisRun,schemaVersion,createdAt,createdBy}) {
  invariant(analysisRun?.id&&analysisRun?.brandId&&analysisRun?.styleId,'GARMENT_GRAPH_ANALYSIS_REQUIRED','Garment graph requires an analysis run');
  invariant(analysisRun.purpose==='garment_interpretation'||analysisRun.purpose==='technical_flat'||analysisRun.purpose==='construction_assist','GARMENT_GRAPH_PURPOSE_INVALID','Analysis purpose cannot create garment graph',{purpose:analysisRun.purpose});
  return deepFreeze({
    id:required(id,'GARMENT_GRAPH_ID_REQUIRED'),
    analysisRunId:analysisRun.id,brandId:analysisRun.brandId,styleId:analysisRun.styleId,
    schemaVersion:token(schemaVersion,'GARMENT_GRAPH_SCHEMA_INVALID'),
    status:'draft',contentHash:null,nodeCount:0,edgeCount:0,
    createdAt:time(createdAt,'GARMENT_GRAPH_TIME_INVALID'),createdBy:actor(createdBy),
    reviewedAt:null,reviewedBy:null,version:1,
  });
}

export function createGarmentNode({id,graph,nodeType,semanticCode=null,label=null,attributes={},confidence=null,findingId=null,createdAt,createdBy}) {
  invariant(graph?.status==='draft','GARMENT_GRAPH_NOT_DRAFT','Garment graph nodes can change only while graph is draft');
  invariant(GARMENT_NODE_TYPES.includes(nodeType),'GARMENT_NODE_TYPE_INVALID','Garment node type is invalid',{nodeType});
  if(semanticCode!==null) token(semanticCode,'GARMENT_NODE_SEMANTIC_CODE_INVALID');
  if(label!==null) text(label,1,240,'GARMENT_NODE_LABEL_INVALID');
  object(attributes,'GARMENT_NODE_ATTRIBUTES_INVALID','Garment node attributes must be an object');
  return deepFreeze({
    id:required(id,'GARMENT_NODE_ID_REQUIRED'),graphId:graph.id,brandId:graph.brandId,styleId:graph.styleId,
    nodeType,semanticCode,label,attributes:structuredClone(attributes),confidence:probability(confidence),
    findingId:findingId===null?null:required(findingId,'GARMENT_NODE_FINDING_ID_INVALID'),
    createdAt:time(createdAt,'GARMENT_GRAPH_TIME_INVALID'),createdBy:actor(createdBy),
  });
}

export function createGarmentEdge({id,graph,fromNode,toNode,relation,attributes={},confidence=null,createdAt,createdBy}) {
  invariant(graph?.status==='draft','GARMENT_GRAPH_NOT_DRAFT','Garment graph edges can change only while graph is draft');
  invariant(fromNode?.graphId===graph.id&&toNode?.graphId===graph.id,'GARMENT_EDGE_GRAPH_MISMATCH','Garment edge nodes must belong to the same graph');
  invariant(fromNode.id!==toNode.id,'GARMENT_EDGE_SELF_REFERENCE','Garment edge cannot reference the same node');
  invariant(GARMENT_EDGE_TYPES.includes(relation),'GARMENT_EDGE_RELATION_INVALID','Garment edge relation is invalid',{relation});
  object(attributes,'GARMENT_EDGE_ATTRIBUTES_INVALID','Garment edge attributes must be an object');
  return deepFreeze({
    id:required(id,'GARMENT_EDGE_ID_REQUIRED'),graphId:graph.id,brandId:graph.brandId,styleId:graph.styleId,
    fromNodeId:fromNode.id,toNodeId:toNode.id,relation,attributes:structuredClone(attributes),
    confidence:probability(confidence),createdAt:time(createdAt,'GARMENT_GRAPH_TIME_INVALID'),createdBy:actor(createdBy),
  });
}

export function reviewGarmentGraph(graph,{nodes,edges,reviewedAt,reviewedBy}) {
  invariant(graph?.status==='draft','GARMENT_GRAPH_NOT_DRAFT','Only draft garment graph can be reviewed');
  invariant(Array.isArray(nodes)&&nodes.length>=1,'GARMENT_GRAPH_NODES_REQUIRED','Garment graph requires at least one node');
  invariant(Array.isArray(edges),'GARMENT_GRAPH_EDGES_INVALID','Garment graph edges must be an array');
  const nodeIds=new Set(nodes.map(node=>node.id));
  invariant(nodeIds.size===nodes.length,'GARMENT_GRAPH_NODE_DUPLICATE','Garment graph node ids must be unique');
  invariant(nodes.every(node=>node.graphId===graph.id),'GARMENT_GRAPH_NODE_MISMATCH','Every node must belong to graph');
  invariant(edges.every(edge=>edge.graphId===graph.id&&nodeIds.has(edge.fromNodeId)&&nodeIds.has(edge.toNodeId)),'GARMENT_GRAPH_EDGE_MISMATCH','Every edge must reference nodes in graph');
  invariant(nodes.some(node=>node.nodeType==='garment'),'GARMENT_GRAPH_ROOT_REQUIRED','Garment graph requires a garment root node');
  const canonical=canonicalJson({
    schemaVersion:graph.schemaVersion,
    nodes:nodes.map(normalizeNode).sort(byId),
    edges:edges.map(normalizeEdge).sort(byId),
  });
  return deepFreeze({
    ...graph,status:'reviewed',contentHash:createHash('sha256').update(canonical).digest('hex'),
    nodeCount:nodes.length,edgeCount:edges.length,reviewedAt:time(reviewedAt,'GARMENT_GRAPH_TIME_INVALID'),
    reviewedBy:actor(reviewedBy),version:graph.version+1,
  });
}

export function validateGarmentGraphCompleteness({graph,nodes,edges}) {
  invariant(graph?.id,'GARMENT_GRAPH_REQUIRED','Garment graph is required');
  invariant(Array.isArray(nodes)&&Array.isArray(edges),'GARMENT_GRAPH_CONTENT_REQUIRED','Garment graph nodes and edges are required');
  const issues=[];
  const roots=nodes.filter(node=>node.nodeType==='garment');
  if(roots.length!==1) issues.push(issue('blocking','GARMENT_ROOT_CARDINALITY',{actual:roots.length}));
  const orphanIds=new Set(nodes.map(node=>node.id));
  for(const edge of edges){orphanIds.delete(edge.toNodeId);}
  for(const root of roots){orphanIds.delete(root.id);}
  if(orphanIds.size) issues.push(issue('warning','GARMENT_ORPHAN_NODES',{nodeIds:[...orphanIds].sort()}));
  const inferredWithoutFinding=nodes.filter(node=>typeof node.confidence==='number'&&node.confidence<1&&node.findingId===null);
  if(inferredWithoutFinding.length) issues.push(issue('warning','GARMENT_INFERENCE_WITHOUT_FINDING',{nodeIds:inferredWithoutFinding.map(x=>x.id).sort()}));
  const duplicateSemantic=duplicates(nodes.filter(x=>x.semanticCode).map(x=>`${x.nodeType}|${x.semanticCode}`));
  if(duplicateSemantic.length) issues.push(issue('info','GARMENT_DUPLICATE_SEMANTIC_CODES',{keys:duplicateSemantic}));
  return deepFreeze({valid:!issues.some(x=>x.severity==='blocking'),issues});
}

function normalizeNode(node){return {id:node.id,nodeType:node.nodeType,semanticCode:node.semanticCode,label:node.label,attributes:node.attributes,confidence:node.confidence,findingId:node.findingId};}
function normalizeEdge(edge){return {id:edge.id,fromNodeId:edge.fromNodeId,toNodeId:edge.toNodeId,relation:edge.relation,attributes:edge.attributes,confidence:edge.confidence};}
function byId(a,b){return a.id.localeCompare(b.id);}
function issue(severity,code,details){return Object.freeze({severity,code,details:deepFreeze(details)});}
function duplicates(values){const seen=new Set(),dup=new Set();for(const value of values){if(seen.has(value))dup.add(value);seen.add(value);}return [...dup].sort();}
function probability(value){if(value===null||value===undefined)return null;invariant(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1,'GARMENT_GRAPH_CONFIDENCE_INVALID','Confidence must be between 0 and 1');return Math.round(value*10000)/10000;}
function required(value,code){invariant(typeof value==='string'&&value.trim()&&value.length<=160,code,'Identifier is required');return value;}
function token(value,code){invariant(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value),code,'Token is invalid');return value;}
function actor(value){return required(value,'GARMENT_GRAPH_ACTOR_INVALID');}
function text(value,min,max,code){invariant(typeof value==='string'&&value.trim().length>=min&&value.trim().length<=max,code,'Text length is invalid');return value.trim();}
function object(value,code,message){invariant(value&&typeof value==='object'&&!Array.isArray(value),code,message);try{canonicalJson(value);}catch{invariant(false,code,message);}return value;}
function time(value,code){invariant(typeof value==='string'&&Number.isFinite(Date.parse(value)),code,'Timestamp is invalid');return new Date(value).toISOString();}
function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const nested of Object.values(value))deepFreeze(nested);return value;}
