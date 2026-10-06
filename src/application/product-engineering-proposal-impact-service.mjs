import { invariant } from '../core/errors.mjs';
import { evaluateEngineeringProposalImpact } from '../modules/product-engineering/proposal-impact.mjs';

/**
 * Read-only deterministic impact projection for an accepted or pending Product Engineering proposal.
 * It never mutates canonical PLM state and never asks an AI model to decide downstream impact.
 *
 * @param {{
 *   productEngineering?: any,
 *   readinessSourceReader?: any
 * }} [options]
 */
export function createProductEngineeringProposalImpactService(options={}) {
  const {productEngineering,readinessSourceReader}=options;
  invariant(
    productEngineering
      && typeof productEngineering.getProposalForActor==='function'
      && typeof productEngineering.getAnalysisWorkspaceForActor==='function',
    'PRODUCT_ENGINEERING_IMPACT_SERVICE_REQUIRED',
    'Product Engineering proposal impact dependencies are required',
  );
  invariant(
    readinessSourceReader && typeof readinessSourceReader.loadAssessmentContext==='function',
    'PRODUCT_ENGINEERING_IMPACT_READER_REQUIRED',
    'Product readiness source reader is required for proposal impact',
  );

  return Object.freeze({
    async getProposalImpactForActor(actorId,proposalId) {
      const proposal=await productEngineering.getProposalForActor(actorId,proposalId);
      const workspace=await productEngineering.getAnalysisWorkspaceForActor(actorId,proposal.analysisRunId);
      invariant(
        workspace?.analysis?.id===proposal.analysisRunId
          && workspace.analysis.styleId===proposal.styleId
          && workspace.analysis.brandId===proposal.brandId,
        'PRODUCT_ENGINEERING_IMPACT_LINEAGE_INVALID',
        'Proposal analysis lineage is inconsistent',
        {proposalId,analysisRunId:proposal.analysisRunId},
      );

      const styleVersionId=workspace.analysis.styleVersionId??null;
      if(styleVersionId===null) {
        return evaluateEngineeringProposalImpact({proposal,context:null});
      }

      const context=await readinessSourceReader.loadAssessmentContext(styleVersionId);
      invariant(context?.styleVersion?.id===styleVersionId,'PRODUCT_ENGINEERING_IMPACT_STYLE_VERSION_NOT_FOUND','Exact StyleVersion context is not available for impact evaluation',{proposalId,styleVersionId});
      invariant(
        context.styleVersion.brandId===proposal.brandId
          && context.styleVersion.styleId===proposal.styleId,
        'PRODUCT_ENGINEERING_IMPACT_LINEAGE_INVALID',
        'Impact context belongs to another Product Style or brand',
        {proposalId,styleVersionId},
      );
      return evaluateEngineeringProposalImpact({proposal,context});
    },
  });
}
