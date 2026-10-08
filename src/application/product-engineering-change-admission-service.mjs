import { invariant } from '../core/errors.mjs';
import { assertEngineeringChangeAdmission, evaluateEngineeringChangeAdmission } from '../modules/product-engineering/change-admission.mjs';

/** @param {{reader?:any}} [options] */
export function createProductEngineeringChangeAdmissionService({ reader } = {}) {
  invariant(reader && typeof reader.listPendingImpactsForStyleVersion === 'function', 'PRODUCT_ENGINEERING_CHANGE_GATE_READER_REQUIRED', 'Change-impact admission reader is required');
  return Object.freeze({
    async evaluate(styleVersionId, operation) {
      const pendingImpacts = await reader.listPendingImpactsForStyleVersion(styleVersionId);
      return evaluateEngineeringChangeAdmission({ operation, styleVersionId, pendingImpacts });
    },
    async assertAdmitted(styleVersionId, operation) {
      const pendingImpacts = await reader.listPendingImpactsForStyleVersion(styleVersionId);
      return assertEngineeringChangeAdmission(evaluateEngineeringChangeAdmission({ operation, styleVersionId, pendingImpacts }));
    },
  });
}
