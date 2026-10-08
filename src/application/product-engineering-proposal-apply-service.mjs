import { invariant } from '../core/errors.mjs';
import { applicationLineage, createCanonicalApplicationReceipt } from '../modules/product-engineering/application-authority.mjs';

const APPLY_MATRIX=Object.freeze({
  measurement:Object.freeze({
    chart:Object.freeze({service:'measurements',method:'updateCanonicalMeasurementChart',readMethod:'getCanonicalForActor'}),
  }),
  material:Object.freeze({
    specification:Object.freeze({service:'materials',method:'amendMaterialSpecification',readMethod:'getForActor'}),
  }),
  tech_pack:Object.freeze({
    revision:Object.freeze({service:'techPacks',method:'createRevision',readMethod:'getForActor'}),
  }),
  operation_sequence:Object.freeze({
    operations:Object.freeze({service:'operationSequences',method:'replaceOperations',readMethod:'operationSequenceByIdForActor'}),
  }),
});

/**
 * @param {{
 *   productEngineering?:any,
 *   measurements?:any,
 *   materials?:any,
 *   techPacks?:any,
 *   operationSequences?:any,
 *   clock?:()=>string
 * }} options
 */
export function createProductEngineeringProposalApplyService(options={}) {
  const {productEngineering,clock=()=>new Date().toISOString()}=options;
  invariant(productEngineering
    && typeof productEngineering.prepareProposalApplication==='function'
    && typeof productEngineering.recordProposalApplicationIntent==='function'
    && typeof productEngineering.markProposalApplied==='function',
  'PRODUCT_ENGINEERING_APPLY_SERVICE_REQUIRED','Product Engineering apply dependencies are required');

  return Object.freeze({
    async applyProposal(commandId,actorId,proposalId,input){
      assertApplyInput(commandId,actorId,proposalId,input);
      const canonicalId=canonicalCommandId(commandId);
      const prepared=await productEngineering.prepareProposalApplication(actorId,proposalId,{
        expectedVersion:input.expectedProposalVersion,
        applicationCommandId:commandId,
        canonicalCommandId:canonicalId,
      });
      if(prepared.replay)return prepared.proposal;
      const proposal=prepared.proposal;
      const action=resolveAction(proposal);
      invariant(action,'PRODUCT_ENGINEERING_APPLY_UNSUPPORTED','Engineering proposal cannot be applied automatically through an unsupported canonical action',{
        proposalId,
        authority:proposal.targetAuthority,
        targetField:proposal.targetField,
      });
      const service=options[action.service];
      invariant(service&&typeof service[action.method]==='function','PRODUCT_ENGINEERING_APPLY_TARGET_SERVICE_REQUIRED','Canonical target service is not available',{
        authority:proposal.targetAuthority,
        targetField:proposal.targetField,
      });

      let intent=prepared.applicationIntent??null;
      if(!intent){
        invariant(typeof service[action.readMethod]==='function','PRODUCT_ENGINEERING_APPLY_TARGET_READER_REQUIRED','Canonical target must be readable before application',{
          authority:proposal.targetAuthority,
          targetField:proposal.targetField,
        });
        const canonicalBefore=await service[action.readMethod](actorId,proposal.targetEntityId);
        const workspace=typeof productEngineering.getAnalysisWorkspaceForActor==='function'
          ? await productEngineering.getAnalysisWorkspaceForActor(actorId,proposal.analysisRunId)
          : null;
        intent=await productEngineering.recordProposalApplicationIntent(commandId+':intent',actorId,proposalId,{
          applicationCommandId:commandId,
          canonicalCommandId:canonicalId,
          expectedProposalVersion:input.expectedProposalVersion,
          expectedCanonicalVersion:input.expectedCanonicalVersion,
          canonicalBefore,
          lineage:applicationLineage(proposal,workspace),
        });
      }else{
        invariant(intent.canonicalCommandId===canonicalId,'PRODUCT_ENGINEERING_APPLICATION_INTENT_MISMATCH','Prepared application intent belongs to another canonical command',{proposalId});
        invariant(intent.expectedCanonicalVersion===input.expectedCanonicalVersion,'PRODUCT_ENGINEERING_APPLICATION_INTENT_MISMATCH','Prepared application intent expects another canonical version',{proposalId});
      }

      const payload=canonicalPayload(proposal,intent.expectedCanonicalVersion);
      const result=await service[action.method](canonicalId,actorId,proposal.targetEntityId,payload);
      const entityId=result?.id??result?.code??result?.techPackCode??result?.sequenceId??proposal.targetEntityId;
      const version=Number.isInteger(result?.version)?result.version:null;
      invariant(Number.isInteger(version)&&version>=1,'PRODUCT_ENGINEERING_CANONICAL_RESULT_VERSION_REQUIRED','Canonical command must return the resulting canonical version',{proposalId,authority:proposal.targetAuthority});
      const receipt=createCanonicalApplicationReceipt({
        id:intent.id+':receipt',
        intent,
        canonicalResult:result,
        appliedAt:clock(),
      });

      return productEngineering.markProposalApplied(commandId,actorId,proposalId,{
        expectedVersion:proposal.version,
        authority:proposal.targetAuthority,
        entityId,
        version,
        action:proposal.targetField,
        commandId:canonicalId,
        receipt,
      });
    },

    describeProposal(proposal){
      const action=resolveAction(proposal);
      return Object.freeze({
        supported:Boolean(action),
        authority:proposal?.targetAuthority??null,
        targetField:proposal?.targetField??null,
        targetEntityId:proposal?.targetEntityId??null,
        canonicalService:action?.service??null,
        canonicalMethod:action?.method??null,
        canonicalReadMethod:action?.readMethod??null,
      });
    },
  });
}

function resolveAction(proposal){
  return APPLY_MATRIX[proposal?.targetAuthority]?.[proposal?.targetField]??null;
}

function canonicalPayload(proposal,expectedCanonicalVersion){
  invariant(Number.isInteger(expectedCanonicalVersion)&&expectedCanonicalVersion>=1,'PRODUCT_ENGINEERING_CANONICAL_EXPECTED_VERSION_INVALID','Expected canonical version must be a positive integer');
  const proposed=proposal.proposedValue;
  invariant(proposed&&typeof proposed==='object'&&!Array.isArray(proposed),'PRODUCT_ENGINEERING_APPLY_VALUE_INVALID','Canonical apply proposal value must be an object');
  const value=structuredClone(proposed);
  invariant(!Object.hasOwn(value,'expectedVersion'),'PRODUCT_ENGINEERING_APPLY_VALUE_INVALID','Proposal value cannot supply canonical expectedVersion');
  return Object.freeze({...value,expectedVersion:expectedCanonicalVersion});
}

function canonicalCommandId(commandId){
  return `${commandId}:canonical`;
}

function assertApplyInput(commandId,actorId,proposalId,input){
  invariant(typeof commandId==='string'&&commandId.trim(),'COMMAND_ID_REQUIRED','Every proposal application requires commandId');
  invariant(typeof actorId==='string'&&actorId.trim(),'PRODUCT_ENGINEERING_ACTOR_REQUIRED','Actor id is required');
  invariant(typeof proposalId==='string'&&proposalId.trim(),'PRODUCT_ENGINEERING_PROPOSAL_ID_REQUIRED','Proposal id is required');
  invariant(input&&typeof input==='object'&&!Array.isArray(input),'PRODUCT_ENGINEERING_PROPOSAL_APPLY_INVALID','Proposal apply input is invalid');
  invariant(Number.isInteger(input.expectedProposalVersion)&&input.expectedProposalVersion>=1,'PRODUCT_ENGINEERING_PROPOSAL_EXPECTED_VERSION_INVALID','Expected proposal version must be a positive integer');
  invariant(Number.isInteger(input.expectedCanonicalVersion)&&input.expectedCanonicalVersion>=1,'PRODUCT_ENGINEERING_CANONICAL_EXPECTED_VERSION_INVALID','Expected canonical version must be a positive integer');
}
