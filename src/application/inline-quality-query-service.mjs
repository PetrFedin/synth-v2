import { invariant } from '../core/errors.mjs';
import { defectPareto, summarizeInlineChecks } from '../modules/inline-quality/public.mjs';

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,159}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export function createInlineQualityQueryService({ reader } = {}) {
  invariant(reader && typeof reader.defectTypesForActor === 'function' && typeof reader.checksForExecution === 'function', 'INLINE_QC_READER_REQUIRED', 'Inline quality reader is required');
  return Object.freeze({
    async defectTypesForActor(actorId) {
      validateActor(actorId);
      const types = await reader.defectTypesForActor(actorId);
      invariant(Array.isArray(types), 'INLINE_QC_CATALOGUE_INVALID', 'Defect catalogue listing is invalid');
      return Object.freeze(types.map(immutableCopy));
    },
    // Проверки партии вместе с итогом и Парето по ним.
    //
    // The summary and the ranking travel with the list rather than being left to each caller,
    // because a defect rate computed three different ways in three screens is three different
    // numbers with one name.
    async checksForExecution(actorId, executionCode) {
      validateActor(actorId);
      invariant(typeof executionCode === 'string' && CODE_PATTERN.test(executionCode), 'PRODUCTION_EXECUTION_CODE_INVALID', 'Production execution code is invalid');
      const checks = await reader.checksForExecution(actorId, executionCode);
      invariant(Array.isArray(checks), 'INLINE_QC_CHECKS_INVALID', 'Inline check listing is invalid');
      const catalogue = await reader.defectTypesForActor(actorId);
      return Object.freeze({
        items: Object.freeze(checks.map(immutableCopy)),
        summary: summarizeInlineChecks(checks),
        pareto: defectPareto(checks, catalogue),
      });
    },
  });
}

function validateActor(actorId) { invariant(typeof actorId === 'string' && ID_PATTERN.test(actorId), 'ACTOR_ID_INVALID', 'Actor id is invalid'); }
function immutableCopy(value) { return Object.freeze(structuredClone(value)); }
