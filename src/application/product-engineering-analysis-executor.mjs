import { invariant } from '../core/errors.mjs';
import { createModelControlPlane } from '../modules/product-engineering/model-control.mjs';
import { validateEngineeringModelOutput } from '../modules/product-engineering/model-output-schema.mjs';
import {
  completeAnalysis, completeModelRun, createConflict, createEvidence, createFinding, createModelRun, createProposal, failModelRun, startAnalysis,
} from '../modules/product-engineering/public.mjs';
import {
  createGarmentEdge, createGarmentGraph, createGarmentNode, reviewGarmentGraph, validateGarmentGraphCompleteness,
} from '../modules/product-engineering/garment-ontology.mjs';

/**
 * @param {{
 *   engineeringStore?: any,
 *   controlStore?: any,
 *   providers?: Record<string, any>,
 *   clock?: () => string,
 *   nextId?: (prefix: string) => string
 * }} [options]
 */
export function createProductEngineeringAnalysisExecutor(options={}) {
  const {engineeringStore,controlStore,providers,clock=()=>new Date().toISOString(),nextId}=options;
  invariant(engineeringStore&&controlStore&&providers&&typeof nextId==='function','ENGINEERING_ANALYSIS_EXECUTOR_REQUIRED','Analysis executor dependencies are required');

  return async function executeAnalysis(job) {
    const current=await engineeringStore.getAnalysisRun(job.analysisRunId);
    invariant(current,'PRODUCT_ENGINEERING_ANALYSIS_NOT_FOUND','Engineering analysis not found',{analysisRunId:job.analysisRunId});
    if(current.status==='completed') return {analysisRunId:current.id,status:'completed',skipped:true};
    invariant(['queued','running'].includes(current.status),'PRODUCT_ENGINEERING_ANALYSIS_NOT_ACTIVE','Engineering analysis is not active');

    const contract=current.inputManifest?.modelContract;
    invariant(contract&&typeof contract.promptVersion==='string'&&typeof contract.schemaVersion==='string','ENGINEERING_MODEL_CONTRACT_REQUIRED','Analysis input manifest requires modelContract');
    const sourceIds=Array.isArray(current.inputManifest?.sourceIds)?current.inputManifest.sourceIds:[];
    invariant(sourceIds.length>=1,'ENGINEERING_ANALYSIS_SOURCES_REQUIRED','Analysis requires at least one governed source');

    const sources=[];
    for(const sourceId of sourceIds){
      const source=await engineeringStore.getSource(sourceId);
      invariant(source&&source.styleId===current.styleId,'ENGINEERING_ANALYSIS_SOURCE_INVALID','Analysis source is not available for this style',{sourceId});
      invariant(source.status==='admitted'&&source.parseStatus==='completed','ENGINEERING_ANALYSIS_SOURCE_NOT_READY','Analysis source must be admitted and parsed',{sourceId,status:source.status,parseStatus:source.parseStatus});
      sources.push(Object.freeze({source,fragments:await engineeringStore.getSourceFragments(sourceId)}));
    }

    const config=await controlStore.load({brandId:current.brandId,purpose:current.purpose,at:now()});
    invariant(config.policy,'AI_MODEL_POLICY_NOT_FOUND','No active model route policy exists',{purpose:current.purpose});
    const plane=createModelControlPlane({providers,qualifications:config.qualifications,policies:[config.policy],clock});
    const eligible=plane.describeRoute({purpose:current.purpose,promptVersion:contract.promptVersion,schemaVersion:contract.schemaVersion,at:now()});
    invariant(eligible.length>=1,'AI_MODEL_NO_QUALIFIED_ROUTE','No active qualified model route is available');

    let running=current;
    if(current.status==='queued'){
      await engineeringStore.transaction(async tx=>{
        const exact=await tx.getAnalysisRunForUpdate(current.id);
        if(exact.status==='queued'){
          running=startAnalysis(exact,{startedAt:now()});
          await tx.updateAnalysisRun(running,exact.version);
        } else running=exact;
      });
    }

    const modelRun=createModelRun({
      id:nextId('engineering-model-run'),analysisRun:running,provider:eligible[0].provider,model:eligible[0].model,
      purpose:running.purpose,promptVersion:contract.promptVersion,schemaVersion:contract.schemaVersion,
      inputHash:running.inputHash,startedAt:now(),createdBy:'product-engineering-worker',
    });
    await engineeringStore.transaction(tx=>tx.insertModelRun(modelRun));

    try{
      const output=await plane.execute({
        purpose:running.purpose,promptVersion:contract.promptVersion,schemaVersion:contract.schemaVersion,
        input:{analysis:{id:running.id,purpose:running.purpose,inputManifest:running.inputManifest},sources},
        inputHash:running.inputHash,requestId:job.id,
      });
      validateEngineeringModelOutput({
        schemaVersion: contract.schemaVersion,
        output: output.output,
        sourceIds,
        sources,
      });
      const completedRun=completeModelRun(modelRun,{
        outputHash:output.outputHash,usage:output.usage,costMinor:null,currency:null,completedAt:now(),
      });
      await engineeringStore.transaction(async tx=>{
        await tx.updateModelRun(completedRun);
        const findings=[];
        for(const raw of output.output.findings??[]){
          const finding=createFinding({
            id:nextId('engineering-finding'),analysisRun:running,findingType:raw.findingType,
            origin:raw.origin??'ai_inferred',value:raw.value,confidence:raw.confidence??null,createdAt:now(),createdBy:'product-engineering-worker',
          });
          await tx.insertFinding(finding);
          findings.push(finding);
          for(const evidenceRaw of raw.evidence??[]){
            const source=sources.find(entry=>entry.source.id===evidenceRaw.sourceId)?.source;
            invariant(source,'ENGINEERING_MODEL_EVIDENCE_SOURCE_INVALID','Model evidence references a source outside the analysis',{sourceId:evidenceRaw.sourceId});
            const evidence=createEvidence({
              id:nextId('engineering-evidence'),analysisRun:running,finding,sourceKind:source.kind,sourceId:source.id,
              sourceLocator:evidenceRaw.sourceLocator??{},sourceHash:source.contentHash,excerpt:evidenceRaw.excerpt??null,
              createdAt:now(),createdBy:'product-engineering-worker',
            });
            await tx.insertEvidence(evidence);
          }
        }
        for(const raw of output.output.proposals??[]){
          const finding=raw.findingIndex===undefined?null:(findings[raw.findingIndex]??null);
          const proposal=createProposal({
            id:nextId('engineering-proposal'),analysisRun:running,finding,
            targetAuthority:raw.targetAuthority,targetEntityId:raw.targetEntityId??null,targetField:raw.targetField,
            proposedValue:raw.proposedValue,confidence:raw.confidence??null,rationale:raw.rationale??null,
            createdAt:now(),createdBy:'product-engineering-worker',
          });
          await tx.insertProposal(proposal);
        }
        for(const raw of output.output.conflicts??[]){
          const conflict=createConflict({
            id:nextId('engineering-conflict'),analysisRun:running,conflictType:raw.conflictType,subject:raw.subject,
            candidates:raw.candidates,severity:raw.severity,createdAt:now(),createdBy:'product-engineering-worker',
          });
          await tx.insertConflict(conflict);
        }
        if(output.output.garmentGraph){
          await persistGraph(tx,running,output.output.garmentGraph,findings);
        }
        const exact=await tx.getAnalysisRunForUpdate(running.id);
        const done=completeAnalysis(exact,{completedAt:now()});
        await tx.updateAnalysisRun(done,exact.version);
      });
      return {analysisRunId:running.id,status:'completed',provider:output.provider,model:output.model,outputHash:output.outputHash};
    }catch(error){
      await engineeringStore.transaction(async tx=>{
        const exactModel=await tx.getModelRunForUpdate(modelRun.id);
        if(exactModel?.status==='started'){
          await tx.updateModelRun(failModelRun(exactModel,{failureCode:errorCode(error),completedAt:now()}));
        }
      });
      throw error;
    }
  };

  async function persistGraph(tx,analysis,raw,findings){
    const graph=createGarmentGraph({id:nextId('garment-graph'),analysisRun:analysis,schemaVersion:raw.schemaVersion??'garment-v1',createdAt:now(),createdBy:'product-engineering-worker'});
    await tx.insertGarmentGraph(graph);
    const nodes=[]; const byKey=new Map();
    for(const input of raw.nodes??[]){
      const finding=input.findingIndex===undefined?null:(findings[input.findingIndex]??null);
      const node=createGarmentNode({
        id:nextId('garment-node'),graph,nodeType:input.nodeType,semanticCode:input.semanticCode??null,label:input.label??null,
        attributes:input.attributes??{},confidence:input.confidence??null,findingId:finding?.id??null,createdAt:now(),createdBy:'product-engineering-worker',
      });
      nodes.push(node);byKey.set(input.key,node);await tx.insertGarmentNode(node);
    }
    const edges=[];
    for(const input of raw.edges??[]){
      const from=byKey.get(input.from);const to=byKey.get(input.to);
      invariant(from&&to,'GARMENT_EDGE_NODE_NOT_FOUND','Garment graph edge references unknown node',{from:input.from,to:input.to});
      const edge=createGarmentEdge({id:nextId('garment-edge'),graph,fromNode:from,toNode:to,relation:input.relation,attributes:input.attributes??{},confidence:input.confidence??null,createdAt:now(),createdBy:'product-engineering-worker'});
      edges.push(edge);await tx.insertGarmentEdge(edge);
    }
    const check=validateGarmentGraphCompleteness({graph,nodes,edges});
    invariant(check.valid,'GARMENT_GRAPH_MODEL_OUTPUT_INVALID','Generated garment graph has blocking integrity issues',{issues:check.issues});
    const reviewed=reviewGarmentGraph(graph,{nodes,edges,reviewedAt:now(),reviewedBy:'product-engineering-worker'});
    await tx.reviewGarmentGraph(reviewed,graph.version);
  }

  function now(){const value=clock();invariant(typeof value==='string'&&Number.isFinite(Date.parse(value)),'ENGINEERING_ANALYSIS_CLOCK_INVALID','Analysis executor clock is invalid');return new Date(value).toISOString();}
}
function errorCode(error){return error&&typeof error==='object'&&typeof error.code==='string'?error.code:'ENGINEERING_MODEL_EXECUTION_FAILED';}
function safeMessage(error){const value=error&&typeof error==='object'&&typeof error.message==='string'?error.message:'Model execution failed';return value.slice(0,2000);}
