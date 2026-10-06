import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEngineeringModelOutput } from '../src/modules/product-engineering/model-output-schema.mjs';

const SOURCES=['source-1'];

test('engineering-findings-v1 accepts bounded evidence-first findings and proposals',()=>{
  const output={
    findings:[{
      findingType:'measurement.point',
      origin:'document_extracted',
      value:{pointCode:'CHEST'},
      confidence:.96,
      evidence:[{sourceId:'source-1',sourceLocator:{sheet:'Measurements',range:'B2:B2'},excerpt:'Chest'}],
    }],
    proposals:[{
      findingIndex:0,
      targetAuthority:'measurement',
      targetField:'points.CHEST',
      proposedValue:{pointCode:'CHEST'},
      confidence:.96,
      rationale:'Authoritative measurement sheet.',
    }],
    conflicts:[],
  };
  assert.equal(validateEngineeringModelOutput({schemaVersion:'engineering-findings-v1',output,sourceIds:SOURCES}),output);
});

test('garment-ontology-v1 requires exact graph contract and one garment root',()=>{
  const output={
    findings:[{findingType:'garment.category',origin:'ai_inferred',value:{code:'BLAZER'},confidence:.9,evidence:[{sourceId:'source-1',sourceLocator:{page:1}}]}],
    proposals:[],
    conflicts:[],
    garmentGraph:{
      schemaVersion:'garment-ontology-v1',
      nodes:[
        {key:'root',nodeType:'garment',semanticCode:'GARMENT.BLAZER',findingIndex:0,confidence:.9},
        {key:'front',nodeType:'panel',semanticCode:'PANEL.FRONT',findingIndex:0,confidence:.8},
      ],
      edges:[{from:'root',to:'front',relation:'contains',confidence:.9}],
    },
  };
  assert.equal(validateEngineeringModelOutput({schemaVersion:'garment-ontology-v1',output,sourceIds:SOURCES}),output);
});

test('model schema rejects unsupported fields instead of silently accepting provider drift',()=>{
  assert.throws(()=>validateEngineeringModelOutput({
    schemaVersion:'engineering-findings-v1',
    sourceIds:SOURCES,
    output:{findings:[],proposals:[],conflicts:[],providerDebug:{secret:'not-persisted'}},
  }),error=>error.code==='ENGINEERING_MODEL_SCHEMA_VIOLATION');
});

test('model schema rejects evidence outside the analysis source manifest',()=>{
  assert.throws(()=>validateEngineeringModelOutput({
    schemaVersion:'engineering-findings-v1',
    sourceIds:SOURCES,
    output:{
      findings:[{findingType:'garment.category',origin:'ai_inferred',value:{code:'BLAZER'},evidence:[{sourceId:'source-other',sourceLocator:{page:1}}]}],
      proposals:[],conflicts:[],
    },
  }),error=>error.code==='ENGINEERING_MODEL_EVIDENCE_SOURCE_INVALID');
});

test('model schema rejects proposal finding indexes outside the exact findings array',()=>{
  assert.throws(()=>validateEngineeringModelOutput({
    schemaVersion:'engineering-findings-v1',
    sourceIds:SOURCES,
    output:{findings:[],proposals:[{findingIndex:0,targetAuthority:'product_identity',targetField:'technical.category',proposedValue:{code:'BLAZER'}}],conflicts:[]},
  }),error=>error.code==='ENGINEERING_MODEL_PROPOSAL_INVALID');
});

test('findings-only schema cannot smuggle a garment graph',()=>{
  assert.throws(()=>validateEngineeringModelOutput({
    schemaVersion:'engineering-findings-v1',
    sourceIds:SOURCES,
    output:{findings:[],proposals:[],conflicts:[],garmentGraph:{schemaVersion:'engineering-findings-v1',nodes:[],edges:[]}},
  }),error=>error.code==='ENGINEERING_MODEL_SCHEMA_VIOLATION');
});

test('garment schema rejects unknown relations before persistence',()=>{
  assert.throws(()=>validateEngineeringModelOutput({
    schemaVersion:'garment-ontology-v1',
    sourceIds:SOURCES,
    output:{
      findings:[],proposals:[],conflicts:[],
      garmentGraph:{
        schemaVersion:'garment-ontology-v1',
        nodes:[{key:'root',nodeType:'garment'},{key:'front',nodeType:'panel'}],
        edges:[{from:'root',to:'front',relation:'invented_relation'}],
      },
    },
  }),error=>error.code==='ENGINEERING_MODEL_GRAPH_INVALID');
});


test('model evidence cannot cite a PDF page absent from parsed fragments',()=>{
  assert.throws(()=>validateEngineeringModelOutput({
    schemaVersion:'engineering-findings-v1',
    sources:[{
      source:{id:'pdf-1',mediaType:'application/pdf'},
      fragments:[{kind:'document_page',locator:{page:1}}],
    }],
    output:{
      findings:[{findingType:'garment.category',origin:'document_extracted',value:{code:'BLAZER'},evidence:[{sourceId:'pdf-1',sourceLocator:{page:999}}]}],
      proposals:[],conflicts:[],
    },
  }),error=>error.code==='ENGINEERING_MODEL_EVIDENCE_LOCATOR_INVALID');
});

test('model evidence cannot invent a spreadsheet range outside parsed fragments',()=>{
  assert.throws(()=>validateEngineeringModelOutput({
    schemaVersion:'engineering-findings-v1',
    sources:[{
      source:{id:'sheet-1',mediaType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
      fragments:[{kind:'cell_range',locator:{sheet:'Measurements',range:'A1:B20'}}],
    }],
    output:{
      findings:[{findingType:'measurement.point',origin:'document_extracted',value:{pointCode:'CHEST'},evidence:[{sourceId:'sheet-1',sourceLocator:{sheet:'Measurements',range:'Z99:Z99'}}]}],
      proposals:[],conflicts:[],
    },
  }),error=>error.code==='ENGINEERING_MODEL_EVIDENCE_LOCATOR_INVALID');
});


test('spreadsheet evidence may cite a verified subrange inside parsed used range',()=>{
  const output={
    findings:[{
      findingType:'measurement.point',origin:'document_extracted',value:{pointCode:'CHEST'},
      evidence:[{sourceId:'sheet-contained',sourceLocator:{sheet:'Measurements',range:'B12:B12'}}],
    }],
    proposals:[],conflicts:[],
  };
  assert.equal(validateEngineeringModelOutput({
    schemaVersion:'engineering-findings-v1',
    sources:[{
      source:{id:'sheet-contained',mediaType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
      fragments:[{kind:'cell_range',locator:{sheet:'Measurements',range:'A1:H40'}}],
    }],
    output,
  }),output);
});
