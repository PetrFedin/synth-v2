import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductEngineeringAnalysisExecutor } from '../src/application/product-engineering-analysis-executor.mjs';
import { createAnalysisRun } from '../src/modules/product-engineering/public.mjs';

const NOW='2026-10-06T16:00:00.000Z';
const HASH='a'.repeat(64);
const style={id:'style-1',brandId:'brand-1'};

test('qualified analysis executor persists evidence, review work and garment graph without canonical writes',async()=>{
  let sequence=0;
  let analysis=createAnalysisRun({
    id:'analysis-1',style,purpose:'garment_interpretation',
    inputManifest:{
      sourceIds:['source-1'],
      autoExecute:true,
      modelContract:{promptVersion:'garment-interpretation-v1',schemaVersion:'garment-ontology-v1'},
    },
    requestedAt:NOW,requestedBy:'user-1',
  });
  const source={
    id:'source-1',brandId:'brand-1',styleId:'style-1',kind:'product_media',
    mediaType:'image/png',contentHash:HASH,status:'admitted',parseStatus:'completed',
  };
  const fragments=[{id:'fragment-1',sourceId:'source-1',kind:'metadata',locator:{key:'image'},content:{width:1200,height:1600}}];
  const persisted={modelRuns:[],findings:[],evidence:[],proposals:[],conflicts:[],graphs:[],nodes:[],edges:[]};

  const engineeringStore={
    async getAnalysisRun(id){return id===analysis.id?analysis:undefined;},
    async getSource(id){return id===source.id?source:undefined;},
    async getSourceFragments(id){return id===source.id?fragments:[];},
    async transaction(work){
      const tx={
        async getAnalysisRunForUpdate(id){return id===analysis.id?analysis:undefined;},
        async updateAnalysisRun(next,expectedVersion){assert.equal(analysis.version,expectedVersion);analysis=next;},
        async insertModelRun(row){persisted.modelRuns.push(row);},
        async updateModelRun(row){persisted.modelRuns[persisted.modelRuns.length-1]=row;},
        async insertFinding(row){persisted.findings.push(row);},
        async insertEvidence(row){persisted.evidence.push(row);},
        async insertProposal(row){persisted.proposals.push(row);},
        async insertConflict(row){persisted.conflicts.push(row);},
        async insertGarmentGraph(row){persisted.graphs.push(row);},
        async insertGarmentNode(row){persisted.nodes.push(row);},
        async insertGarmentEdge(row){persisted.edges.push(row);},
        async reviewGarmentGraph(row){persisted.graphs[persisted.graphs.length-1]=row;},
      };
      return work(tx);
    },
  };

  const controlStore={
    async load(){
      return {
        policy:{
          purpose:'garment_interpretation',
          candidates:[{provider:'qualified-gateway',model:'fashion-vision-1',priority:0}],
          maxAttempts:1,timeoutMs:5000,circuitFailureThreshold:3,circuitCooldownMs:60000,
        },
        qualifications:[{
          id:'qualification-1',provider:'qualified-gateway',model:'fashion-vision-1',
          purpose:'garment_interpretation',promptVersion:'garment-interpretation-v1',
          schemaVersion:'garment-ontology-v1',benchmarkHash:'b'.repeat(64),
          metrics:{componentF1:.96,unknownRecall:.98},qualifiedAt:NOW,qualifiedBy:'qa',
          expiresAt:null,status:'qualified',
        }],
      };
    },
  };

  const providers={
    'qualified-gateway':{
      async execute(request){
        assert.equal(request.qualificationId,'qualification-1');
        assert.equal(request.input.sources[0].source.id,'source-1');
        return {
          output:{
            findings:[{
              findingType:'garment.category',origin:'ai_inferred',value:{code:'BLAZER'},confidence:.97,
              evidence:[{sourceId:'source-1',sourceLocator:{region:{x:.05,y:.03,w:.9,h:.94}},excerpt:'garment silhouette'}],
            }],
            proposals:[{
              findingIndex:0,targetAuthority:'product_identity',targetEntityId:'style-1',
              targetField:'technical.category',proposedValue:{code:'BLAZER'},confidence:.97,
              rationale:'Reference evidence supports blazer classification',
            }],
            conflicts:[{
              conflictType:'construction.visibility',subject:'front closure',
              candidates:[{value:'DOUBLE_BREASTED',sourceId:'source-1'},{value:'UNKNOWN',source:'canonical'}],
              severity:'warning',
            }],
            garmentGraph:{
              schemaVersion:'garment-ontology-v1',
              nodes:[
                {key:'root',nodeType:'garment',semanticCode:'GARMENT.BLAZER',label:'Blazer',findingIndex:0,confidence:.97},
                {key:'front',nodeType:'panel',semanticCode:'PANEL.FRONT',label:'Front panel',findingIndex:0,confidence:.91},
              ],
              edges:[{from:'root',to:'front',relation:'contains',confidence:.99}],
            },
          },
          usage:{inputTokens:500,outputTokens:180},
        };
      },
    },
  };

  const executor=createProductEngineeringAnalysisExecutor({
    engineeringStore,controlStore,providers,clock:()=>NOW,
    nextId:(prefix)=>prefix+'-'+(++sequence),
  });
  const result=await executor({id:'job-1',analysisRunId:'analysis-1'});

  assert.equal(result.status,'completed');
  assert.equal(analysis.status,'completed');
  assert.equal(persisted.modelRuns.length,1);
  assert.equal(persisted.modelRuns[0].status,'completed');
  assert.equal(persisted.findings.length,1);
  assert.equal(persisted.evidence.length,1);
  assert.equal(persisted.evidence[0].sourceHash,HASH);
  assert.equal(persisted.proposals.length,1);
  assert.equal(persisted.proposals[0].status,'pending');
  assert.equal(persisted.proposals[0].appliedReference,null);
  assert.equal(persisted.conflicts.length,1);
  assert.equal(persisted.conflicts[0].status,'open');
  assert.equal(persisted.graphs.length,1);
  assert.equal(persisted.graphs[0].status,'reviewed');
  assert.equal(persisted.nodes.length,2);
  assert.equal(persisted.edges.length,1);
});

test('analysis executor fails closed when qualification does not match prompt/schema',async()=>{
  const analysis=createAnalysisRun({
    id:'analysis-2',style,purpose:'garment_interpretation',
    inputManifest:{
      sourceIds:['source-2'],autoExecute:true,
      modelContract:{promptVersion:'garment-interpretation-v2',schemaVersion:'garment-ontology-v1'},
    },
    requestedAt:NOW,requestedBy:'user-1',
  });
  const source={id:'source-2',brandId:'brand-1',styleId:'style-1',kind:'product_media',contentHash:HASH,status:'admitted',parseStatus:'completed'};
  const store={
    getAnalysisRun:async()=>analysis,
    getSource:async()=>source,
    getSourceFragments:async()=>[],
    transaction:async(work)=>work({
      getAnalysisRunForUpdate:async()=>analysis,
      updateAnalysisRun:async()=>{},
      insertModelRun:async()=>{},
    }),
  };
  const controlStore={load:async()=>({
    policy:{purpose:'garment_interpretation',candidates:[{provider:'p',model:'m',priority:0}],maxAttempts:1,timeoutMs:1000,circuitFailureThreshold:3,circuitCooldownMs:1000},
    qualifications:[{id:'q',provider:'p',model:'m',purpose:'garment_interpretation',promptVersion:'garment-interpretation-v1',schemaVersion:'garment-ontology-v1',benchmarkHash:'b'.repeat(64),metrics:{f1:.9},qualifiedAt:NOW,qualifiedBy:'qa',expiresAt:null,status:'qualified'}],
  })};
  const executor=createProductEngineeringAnalysisExecutor({engineeringStore:store,controlStore,providers:{p:{execute:async()=>({output:{}})}},clock:()=>NOW,nextId:(p)=>p+'-1'});
  await assert.rejects(()=>executor({id:'job-2',analysisRunId:'analysis-2'}),error=>error.code==='AI_MODEL_NO_QUALIFIED_ROUTE');
});
