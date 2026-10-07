import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveTechnicalDrawing,
  completeAnalysis,
  completeModelRun,
  createAnalysisRun,
  createConflict,
  createDrawingObject,
  createEvidence,
  createFinding,
  createModelRun,
  createProposal,
  createTechnicalDrawing,
  resolveConflict,
  resolveProposal,
  startAnalysis,
} from '../src/modules/product-engineering/public.mjs';

const NOW='2026-10-06T10:00:00.000Z';
const style={id:'style-1',brandId:'brand-1'};
const hash='a'.repeat(64);

test('engineering analysis is immutable-evidence staging, not canonical product truth',()=>{
  const queued=createAnalysisRun({id:'analysis-1',style,styleVersionId:'style-version-1',purpose:'garment_interpretation',inputManifest:{assets:['media-1']},requestedAt:NOW,requestedBy:'user-1'});
  assert.equal(queued.status,'queued');
  assert.match(queued.inputHash,/^[0-9a-f]{64}$/);
  const running=startAnalysis(queued,{startedAt:'2026-10-06T10:01:00.000Z'});
  const model=createModelRun({id:'model-1',analysisRun:running,provider:'openai',model:'vision-model',purpose:'garment_interpretation',promptVersion:'v1',schemaVersion:'garment-v1',inputHash:hash,startedAt:'2026-10-06T10:01:10.000Z',createdBy:'user-1'});
  const finishedModel=completeModelRun(model,{outputHash:'b'.repeat(64),usage:{inputTokens:100},costMinor:17,currency:'USD',completedAt:'2026-10-06T10:01:20.000Z'});
  assert.equal(finishedModel.status,'completed');
  const finding=createFinding({id:'finding-1',analysisRun:running,findingType:'closure.type',origin:'ai_inferred',value:{code:'DOUBLE_BREASTED'},confidence:.93,createdAt:'2026-10-06T10:02:00.000Z',createdBy:'user-1'});
  const evidence=createEvidence({id:'evidence-1',analysisRun:running,finding,sourceKind:'product_media',sourceId:'media-1',sourceLocator:{region:{x:.2,y:.1,w:.4,h:.7}},sourceHash:hash,createdAt:'2026-10-06T10:02:01.000Z',createdBy:'user-1'});
  assert.equal(evidence.findingId,finding.id);
  const proposal=createProposal({id:'proposal-1',analysisRun:running,finding,targetAuthority:'product_identity',targetEntityId:'style-version-1',targetField:'technical.closure',proposedValue:{code:'DOUBLE_BREASTED'},confidence:.93,createdAt:'2026-10-06T10:03:00.000Z',createdBy:'user-1'});
  assert.equal(proposal.status,'pending');
  assert.equal(proposal.appliedReference,null);
  const accepted=resolveProposal(proposal,{decision:'accepted',resolvedAt:'2026-10-06T10:04:00.000Z',resolvedBy:'reviewer-1'});
  assert.equal(accepted.status,'accepted');
  assert.equal(accepted.appliedReference,null,'review acceptance is deliberately not canonical application');
  const completed=completeAnalysis(running,{completedAt:'2026-10-06T10:05:00.000Z'});
  assert.equal(completed.status,'completed');
});

test('unknown measurement stays explicit and evidence can carry a no-scale reason',()=>{
  const run=startAnalysis(createAnalysisRun({id:'a',style,purpose:'measurement_assist',inputManifest:{asset:'photo'},requestedAt:NOW,requestedBy:'u'}),{startedAt:NOW});
  const finding=createFinding({id:'f',analysisRun:run,findingType:'measurement.chest_width',origin:'unknown',value:{detected:true,value:null,reason:'NO_SCALE_REFERENCE'},confidence:.96,createdAt:NOW,createdBy:'u'});
  assert.equal(finding.value.value,null);
  assert.equal(finding.value.reason,'NO_SCALE_REFERENCE');
});

test('conflicts preserve competing values until a human resolves them',()=>{
  const run=startAnalysis(createAnalysisRun({id:'a2',style,purpose:'conflict_review',inputManifest:{},requestedAt:NOW,requestedBy:'u'}),{startedAt:NOW});
  const conflict=createConflict({id:'c',analysisRun:run,conflictType:'measurement.value',subject:'CHEST M',candidates:[{source:'canonical',value:55},{source:'supplier_xlsx',value:56},{source:'old_pdf',value:54}],severity:'blocking',createdAt:NOW,createdBy:'u'});
  assert.equal(conflict.status,'open');
  assert.equal(conflict.candidates.length,3);
  const resolved=resolveConflict(conflict,{disposition:'resolved',resolution:{selected:{source:'canonical',value:55}},resolvedAt:NOW,resolvedBy:'reviewer'});
  assert.equal(resolved.status,'resolved');
  assert.equal(resolved.resolution.selected.value,55);
});

test('technical drawing is versionable SVG with machine-readable objects',()=>{
  const drawing=createTechnicalDrawing({id:'drawing-1',style,viewType:'front',versionNo:1,svg:'<svg viewBox="0 0 100 100"><path d="M0 0"/></svg>',createdAt:NOW,createdBy:'u'});
  const object=createDrawingObject({id:'obj-1',drawing,objectType:'measurement_anchor',semanticCode:'POM.CHEST',geometry:{x:.2,y:.4},linkPayload:{measurementPoint:'CHEST_WIDTH'},confidence:.88,createdAt:NOW,createdBy:'u'});
  assert.equal(object.drawingId,drawing.id);
  assert.equal(object.linkPayload.measurementPoint,'CHEST_WIDTH');
  const approved=approveTechnicalDrawing(drawing,{approvedAt:NOW,approvedBy:'reviewer'});
  assert.equal(approved.status,'approved');
  assert.throws(()=>createDrawingObject({id:'obj-2',drawing:approved,objectType:'seam',geometry:{},createdAt:NOW,createdBy:'u'}),error=>error.code==='TECHNICAL_DRAWING_NOT_DRAFT');
});


test('technical drawing rejects active SVG content before persistence',()=>{
  assert.throws(()=>createTechnicalDrawing({
    id:'drawing-unsafe',style,viewType:'front',versionNo:1,
    svg:'<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>',
    createdAt:NOW,createdBy:'u'
  }),error=>error.code==='TECHNICAL_DRAWING_SVG_UNSAFE');
  assert.throws(()=>createTechnicalDrawing({
    id:'drawing-unsafe-2',style,viewType:'front',versionNo:1,
    svg:'<svg viewBox="0 0 10 10"><path onclick="alert(1)" d="M0 0"/></svg>',
    createdAt:NOW,createdBy:'u'
  }),error=>error.code==='TECHNICAL_DRAWING_SVG_UNSAFE');
});

test('technical drawing object can retain exact garment ontology lineage',()=>{
  const drawing=createTechnicalDrawing({
    id:'drawing-linked',style,viewType:'front',versionNo:1,
    svg:'<svg viewBox="0 0 100 100"><path d="M0 0"/></svg>',
    createdAt:NOW,createdBy:'u'
  });
  const object=createDrawingObject({
    id:'obj-linked',drawing,objectType:'measurement_anchor',semanticCode:'POM.CHEST',
    garmentNodeId:'node-chest',geometry:{x1:10,y1:20,x2:90,y2:20},
    createdAt:NOW,createdBy:'u'
  });
  assert.equal(object.garmentNodeId,'node-chest');
});
