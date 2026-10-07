import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGarmentEdge,
  createGarmentGraph,
  createGarmentNode,
  reviewGarmentGraph,
  validateGarmentGraphCompleteness,
} from '../src/modules/product-engineering/garment-ontology.mjs';

const NOW='2026-10-06T13:00:00.000Z';
const analysis={id:'a1',brandId:'b1',styleId:'s1',purpose:'garment_interpretation'};

test('one garment graph can connect visual structure to POM, material and construction semantics',()=>{
  const graph=createGarmentGraph({id:'g1',analysisRun:analysis,schemaVersion:'garment-v1',createdAt:NOW,createdBy:'u'});
  const garment=createGarmentNode({id:'n0',graph,nodeType:'garment',semanticCode:'GARMENT.BLAZER',label:'Blazer',attributes:{silhouette:'tailored'},confidence:.99,findingId:'f0',createdAt:NOW,createdBy:'u'});
  const front=createGarmentNode({id:'n1',graph,nodeType:'panel',semanticCode:'PANEL.FRONT.LEFT',confidence:.95,findingId:'f1',createdAt:NOW,createdBy:'u'});
  const lapel=createGarmentNode({id:'n2',graph,nodeType:'collar',semanticCode:'COLLAR.NOTCH_LAPEL',confidence:.93,findingId:'f2',createdAt:NOW,createdBy:'u'});
  const chest=createGarmentNode({id:'n3',graph,nodeType:'measurement_anchor',semanticCode:'POM.CHEST_WIDTH',confidence:1,findingId:'f3',createdAt:NOW,createdBy:'u'});
  const edges=[
    createGarmentEdge({id:'e1',graph,fromNode:garment,toNode:front,relation:'contains',createdAt:NOW,createdBy:'u'}),
    createGarmentEdge({id:'e2',graph,fromNode:garment,toNode:lapel,relation:'contains',createdAt:NOW,createdBy:'u'}),
    createGarmentEdge({id:'e3',graph,fromNode:front,toNode:chest,relation:'measured_by',createdAt:NOW,createdBy:'u'}),
  ];
  const check=validateGarmentGraphCompleteness({graph,nodes:[garment,front,lapel,chest],edges});
  assert.equal(check.valid,true);
  const reviewed=reviewGarmentGraph(graph,{nodes:[garment,front,lapel,chest],edges,reviewedAt:NOW,reviewedBy:'reviewer'});
  assert.equal(reviewed.status,'reviewed');
  assert.equal(reviewed.nodeCount,4);
  assert.match(reviewed.contentHash,/^[0-9a-f]{64}$/);
});

test('graph fails closed without exactly one garment root',()=>{
  const graph=createGarmentGraph({id:'g2',analysisRun:analysis,schemaVersion:'garment-v1',createdAt:NOW,createdBy:'u'});
  const panel=createGarmentNode({id:'p',graph,nodeType:'panel',confidence:.8,findingId:'f',createdAt:NOW,createdBy:'u'});
  const check=validateGarmentGraphCompleteness({graph,nodes:[panel],edges:[]});
  assert.equal(check.valid,false);
  assert.ok(check.issues.some(x=>x.code==='GARMENT_ROOT_CARDINALITY'&&x.severity==='blocking'));
  assert.throws(()=>reviewGarmentGraph(graph,{nodes:[panel],edges:[],reviewedAt:NOW,reviewedBy:'r'}),e=>e.code==='GARMENT_GRAPH_ROOT_REQUIRED');
});

test('uncertain semantic nodes are expected to retain finding lineage',()=>{
  const graph=createGarmentGraph({id:'g3',analysisRun:analysis,schemaVersion:'garment-v1',createdAt:NOW,createdBy:'u'});
  const garment=createGarmentNode({id:'root',graph,nodeType:'garment',confidence:1,findingId:'f0',createdAt:NOW,createdBy:'u'});
  const pocket=createGarmentNode({id:'pocket',graph,nodeType:'pocket',semanticCode:'POCKET.WELT',confidence:.67,createdAt:NOW,createdBy:'u'});
  const edge=createGarmentEdge({id:'e',graph,fromNode:garment,toNode:pocket,relation:'contains',createdAt:NOW,createdBy:'u'});
  const check=validateGarmentGraphCompleteness({graph,nodes:[garment,pocket],edges:[edge]});
  assert.ok(check.issues.some(x=>x.code==='GARMENT_INFERENCE_WITHOUT_FINDING'));
});
