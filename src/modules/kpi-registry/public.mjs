import { createHash } from 'node:crypto';

import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

export const KPI_REGISTRY_ROLES = Object.freeze(['CANONICAL', 'SPLIT_CHILD', 'BLOCKED_UMBRELLA', 'ALIAS']);
export const KPI_RELEASE_STATUSES = Object.freeze([
  'DRAFT',
  'DEFINED',
  'MAPPING_PENDING',
  'MAPPED_UNVERIFIED',
  'VALIDATION_PENDING',
  'UAT_PENDING',
  'PRODUCTION_READY',
  'DEPRECATED',
  'BLOCKED_UMBRELLA',
  'ALIAS_NONPUBLISH',
]);
export const KPI_MAPPING_STATUSES = Object.freeze(['PENDING', 'MAPPED_UNVERIFIED', 'VERIFIED', 'DEPRECATED']);
export const KPI_GOAL_FUNCTIONS = Object.freeze(['MAXIMIZE', 'MINIMIZE', 'TARGET_BAND', 'AT_LEAST', 'AT_MOST', 'SIGN_DEPENDENT', 'DIAGNOSTIC']);
export const KPI_DEPENDENCY_TYPES = Object.freeze(['ALIAS_OF', 'SPLIT_FROM', 'COMPONENT_OF', 'DRIVER_OF', 'GUARDRAIL_OF']);

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,79}$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function createKpiDefinitionVersion({
  id,
  scopeType = 'system',
  organisationId = null,
  kpiCode,
  formulaVersion,
  role = 'CANONICAL',
  canonicalNameRu,
  canonicalNameEn,
  domainCode,
  releaseStatus = 'DRAFT',
  businessDefinition,
  businessFormula,
  calculationPrimitive,
  canonicalUom,
  directionality,
  goalFunction,
  grainContract,
  populationContract,
  temporalContract,
  aggregationContract,
  dimensionalContract,
  zeroNullErrorPolicy,
  controlContract,
  publicationContract,
  effectiveFrom,
  effectiveTo = null,
  createdAt,
  createdBy,
} = {}) {
  const normalizedId = requiredId(id, 'KPI_DEFINITION_ID_INVALID');
  invariant(scopeType === 'system' || scopeType === 'organisation', 'KPI_SCOPE_TYPE_INVALID', 'KPI scopeType must be system or organisation');
  if (scopeType === 'system') invariant(organisationId === null || organisationId === undefined, 'KPI_SYSTEM_SCOPE_ORGANISATION_FORBIDDEN', 'System KPI definition cannot carry organisationId');
  if (scopeType === 'organisation') requiredId(organisationId, 'KPI_ORGANISATION_ID_REQUIRED');
  invariant(typeof kpiCode === 'string' && CODE_PATTERN.test(kpiCode), 'KPI_CODE_INVALID', 'KPI code is invalid');
  invariant(typeof formulaVersion === 'string' && VERSION_PATTERN.test(formulaVersion), 'KPI_FORMULA_VERSION_INVALID', 'KPI formula version must use major.minor format');
  invariant(KPI_REGISTRY_ROLES.includes(role), 'KPI_ROLE_INVALID', 'KPI role is invalid', { role });
  invariant(KPI_RELEASE_STATUSES.includes(releaseStatus), 'KPI_RELEASE_STATUS_INVALID', 'KPI release status is invalid', { releaseStatus });
  assertRoleReleaseCompatibility(role, releaseStatus);
  invariant(KPI_GOAL_FUNCTIONS.includes(goalFunction), 'KPI_GOAL_FUNCTION_INVALID', 'KPI goal function is invalid', { goalFunction });

  const from = timestamp(effectiveFrom, 'KPI_EFFECTIVE_FROM_INVALID');
  const to = effectiveTo === null || effectiveTo === undefined ? null : timestamp(effectiveTo, 'KPI_EFFECTIVE_TO_INVALID');
  invariant(to === null || Date.parse(to) > Date.parse(from), 'KPI_EFFECTIVE_WINDOW_INVALID', 'KPI effectiveTo must be after effectiveFrom');
  const created = timestamp(createdAt, 'KPI_CREATED_AT_INVALID');

  const basis = Object.freeze({
    id: normalizedId,
    scopeType,
    organisationId: scopeType === 'organisation' ? requiredId(organisationId, 'KPI_ORGANISATION_ID_REQUIRED') : null,
    kpiCode,
    formulaVersion,
    role,
    canonicalNameRu: requiredText(canonicalNameRu, 2, 240, 'KPI_NAME_RU_INVALID'),
    canonicalNameEn: requiredText(canonicalNameEn, 2, 240, 'KPI_NAME_EN_INVALID'),
    domainCode: requiredText(domainCode, 2, 80, 'KPI_DOMAIN_INVALID'),
    releaseStatus,
    businessDefinition: requiredText(businessDefinition, 5, 4000, 'KPI_BUSINESS_DEFINITION_INVALID'),
    businessFormula: requiredText(businessFormula, 1, 4000, 'KPI_BUSINESS_FORMULA_INVALID'),
    calculationPrimitive: requiredText(calculationPrimitive, 2, 120, 'KPI_CALCULATION_PRIMITIVE_INVALID'),
    canonicalUom: requiredText(canonicalUom, 1, 120, 'KPI_CANONICAL_UOM_INVALID'),
    directionality: requiredText(directionality, 2, 160, 'KPI_DIRECTIONALITY_INVALID'),
    goalFunction,
    grainContract: frozenContract(grainContract, 'KPI_GRAIN_CONTRACT_INVALID'),
    populationContract: frozenContract(populationContract, 'KPI_POPULATION_CONTRACT_INVALID'),
    temporalContract: frozenContract(temporalContract, 'KPI_TEMPORAL_CONTRACT_INVALID'),
    aggregationContract: frozenContract(aggregationContract, 'KPI_AGGREGATION_CONTRACT_INVALID'),
    dimensionalContract: frozenContract(dimensionalContract, 'KPI_DIMENSIONAL_CONTRACT_INVALID'),
    zeroNullErrorPolicy: frozenContract(zeroNullErrorPolicy, 'KPI_ZERO_NULL_ERROR_POLICY_INVALID'),
    controlContract: frozenContract(controlContract, 'KPI_CONTROL_CONTRACT_INVALID'),
    publicationContract: frozenContract(publicationContract, 'KPI_PUBLICATION_CONTRACT_INVALID'),
    effectiveFrom: from,
    effectiveTo: to,
    createdAt: created,
    createdBy: requiredText(createdBy, 1, 160, 'KPI_CREATED_BY_INVALID'),
  });
  return Object.freeze({ ...basis, contentHash: hashBasis(basis) });
}

export function createKpiSourceMappingVersion({
  id,
  definition,
  mappingSetVersion,
  variableName,
  sourceContractId,
  sourceSystem,
  sourceEntity,
  sourcePath,
  datatype,
  primaryOrEventKey = null,
  eventTimestampPath = null,
  uomPath = null,
  currencyPath = null,
  joinContract = {},
  filterContract = {},
  mappingStatus = 'PENDING',
  verifiedAt = null,
  verifiedBy = null,
  createdAt,
  createdBy,
} = {}) {
  invariant(definition?.id && KPI_REGISTRY_ROLES.includes(definition.role), 'KPI_MAPPING_DEFINITION_REQUIRED', 'KPI source mapping requires a governed definition');
  invariant(!['ALIAS', 'BLOCKED_UMBRELLA'].includes(definition.role), 'KPI_MAPPING_NONCALCULABLE_DEFINITION', 'Alias and blocked umbrella definitions cannot own executable source mappings', { role: definition.role });
  invariant(Number.isSafeInteger(mappingSetVersion) && mappingSetVersion > 0, 'KPI_MAPPING_SET_VERSION_INVALID', 'KPI mapping set version must be a positive integer');
  invariant(KPI_MAPPING_STATUSES.includes(mappingStatus), 'KPI_MAPPING_STATUS_INVALID', 'KPI mapping status is invalid', { mappingStatus });

  const verification = normalizeVerification({ mappingStatus, verifiedAt, verifiedBy });
  const basis = Object.freeze({
    id: requiredId(id, 'KPI_MAPPING_ID_INVALID'),
    kpiDefinitionId: definition.id,
    mappingSetVersion,
    variableName: requiredText(variableName, 1, 160, 'KPI_MAPPING_VARIABLE_INVALID'),
    sourceContractId: requiredText(sourceContractId, 2, 160, 'KPI_MAPPING_SOURCE_CONTRACT_INVALID'),
    sourceSystem: requiredText(sourceSystem, 2, 160, 'KPI_MAPPING_SOURCE_SYSTEM_INVALID'),
    sourceEntity: requiredText(sourceEntity, 1, 240, 'KPI_MAPPING_SOURCE_ENTITY_INVALID'),
    sourcePath: requiredText(sourcePath, 1, 500, 'KPI_MAPPING_SOURCE_PATH_INVALID'),
    datatype: requiredText(datatype, 1, 160, 'KPI_MAPPING_DATATYPE_INVALID'),
    primaryOrEventKey: optionalText(primaryOrEventKey, 500, 'KPI_MAPPING_PRIMARY_KEY_INVALID'),
    eventTimestampPath: optionalText(eventTimestampPath, 500, 'KPI_MAPPING_EVENT_TIMESTAMP_INVALID'),
    uomPath: optionalText(uomPath, 500, 'KPI_MAPPING_UOM_PATH_INVALID'),
    currencyPath: optionalText(currencyPath, 500, 'KPI_MAPPING_CURRENCY_PATH_INVALID'),
    joinContract: frozenContract(joinContract, 'KPI_MAPPING_JOIN_CONTRACT_INVALID'),
    filterContract: frozenContract(filterContract, 'KPI_MAPPING_FILTER_CONTRACT_INVALID'),
    mappingStatus,
    verifiedAt: verification.verifiedAt,
    verifiedBy: verification.verifiedBy,
    createdAt: timestamp(createdAt, 'KPI_MAPPING_CREATED_AT_INVALID'),
    createdBy: requiredText(createdBy, 1, 160, 'KPI_MAPPING_CREATED_BY_INVALID'),
  });
  return Object.freeze({ ...basis, contentHash: hashBasis(basis) });
}

export function createKpiDefinitionDependency({
  id,
  sourceDefinition,
  targetDefinition,
  relationType,
  relationContract = {},
  createdAt,
  createdBy,
} = {}) {
  invariant(sourceDefinition?.id && targetDefinition?.id, 'KPI_DEPENDENCY_DEFINITIONS_REQUIRED', 'KPI dependency requires source and target definitions');
  invariant(sourceDefinition.id !== targetDefinition.id, 'KPI_DEPENDENCY_SELF_REFERENCE', 'KPI dependency cannot reference itself');
  invariant(KPI_DEPENDENCY_TYPES.includes(relationType), 'KPI_DEPENDENCY_TYPE_INVALID', 'KPI dependency type is invalid', { relationType });
  if (relationType === 'ALIAS_OF') {
    invariant(sourceDefinition.role === 'ALIAS', 'KPI_ALIAS_DEPENDENCY_SOURCE_INVALID', 'ALIAS_OF source definition must have ALIAS role');
    invariant(['CANONICAL', 'SPLIT_CHILD'].includes(targetDefinition.role), 'KPI_ALIAS_DEPENDENCY_TARGET_INVALID', 'ALIAS_OF target must be a calculable definition');
  }
  if (relationType === 'SPLIT_FROM') {
    invariant(sourceDefinition.role === 'SPLIT_CHILD', 'KPI_SPLIT_DEPENDENCY_SOURCE_INVALID', 'SPLIT_FROM source definition must have SPLIT_CHILD role');
    invariant(targetDefinition.role === 'BLOCKED_UMBRELLA', 'KPI_SPLIT_DEPENDENCY_TARGET_INVALID', 'SPLIT_FROM target must be a blocked umbrella definition');
  }
  const basis = Object.freeze({
    id: requiredId(id, 'KPI_DEPENDENCY_ID_INVALID'),
    sourceDefinitionId: sourceDefinition.id,
    targetDefinitionId: targetDefinition.id,
    relationType,
    relationContract: frozenContract(relationContract, 'KPI_DEPENDENCY_CONTRACT_INVALID'),
    createdAt: timestamp(createdAt, 'KPI_DEPENDENCY_CREATED_AT_INVALID'),
    createdBy: requiredText(createdBy, 1, 160, 'KPI_DEPENDENCY_CREATED_BY_INVALID'),
  });
  return Object.freeze({ ...basis, contentHash: hashBasis(basis) });
}

export function assertKpiDefinitionReadyForProduction({
  definition,
  mappings,
  calculationTestsPassed,
  populationTestsPassed,
  reconciliationPassed,
  ownerUatPassed,
  dataStewardUatPassed,
} = {}) {
  invariant(definition?.id, 'KPI_DEFINITION_REQUIRED', 'KPI definition is required');
  invariant(['CANONICAL', 'SPLIT_CHILD'].includes(definition.role), 'KPI_DEFINITION_NONCALCULABLE', 'Only canonical/split-child KPI can become production-ready', { role: definition.role });
  invariant(Array.isArray(mappings) && mappings.length > 0, 'KPI_VERIFIED_MAPPINGS_REQUIRED', 'Production-ready KPI requires source mappings');
  invariant(mappings.every((mapping) => mapping?.kpiDefinitionId === definition.id && mapping.mappingStatus === 'VERIFIED'), 'KPI_MAPPING_VERIFICATION_INCOMPLETE', 'All KPI mappings must be verified and belong to the definition');
  invariant(calculationTestsPassed === true, 'KPI_CALCULATION_TESTS_INCOMPLETE', 'KPI calculation tests must pass');
  invariant(populationTestsPassed === true, 'KPI_POPULATION_TESTS_INCOMPLETE', 'KPI population/time tests must pass');
  invariant(reconciliationPassed === true, 'KPI_RECONCILIATION_INCOMPLETE', 'KPI reconciliation must pass');
  invariant(ownerUatPassed === true, 'KPI_OWNER_UAT_INCOMPLETE', 'KPI owner UAT must pass');
  invariant(dataStewardUatPassed === true, 'KPI_STEWARD_UAT_INCOMPLETE', 'KPI data-steward UAT must pass');
  return true;
}

function assertRoleReleaseCompatibility(role, releaseStatus) {
  if (role === 'BLOCKED_UMBRELLA') {
    invariant(releaseStatus === 'BLOCKED_UMBRELLA', 'KPI_BLOCKED_RELEASE_STATUS_INVALID', 'Blocked umbrella must use BLOCKED_UMBRELLA release status');
    return;
  }
  if (role === 'ALIAS') {
    invariant(releaseStatus === 'ALIAS_NONPUBLISH', 'KPI_ALIAS_RELEASE_STATUS_INVALID', 'Alias must use ALIAS_NONPUBLISH release status');
    return;
  }
  invariant(!['BLOCKED_UMBRELLA', 'ALIAS_NONPUBLISH'].includes(releaseStatus), 'KPI_CALCULABLE_RELEASE_STATUS_INVALID', 'Calculable definition cannot use blocked/alias release status');
}

function normalizeVerification({ mappingStatus, verifiedAt, verifiedBy }) {
  if (mappingStatus === 'VERIFIED') {
    return Object.freeze({
      verifiedAt: timestamp(verifiedAt, 'KPI_MAPPING_VERIFIED_AT_REQUIRED'),
      verifiedBy: requiredText(verifiedBy, 1, 160, 'KPI_MAPPING_VERIFIED_BY_REQUIRED'),
    });
  }
  invariant(verifiedAt === null || verifiedAt === undefined, 'KPI_MAPPING_UNVERIFIED_AT_FORBIDDEN', 'Unverified mapping cannot carry verifiedAt');
  invariant(verifiedBy === null || verifiedBy === undefined, 'KPI_MAPPING_UNVERIFIED_BY_FORBIDDEN', 'Unverified mapping cannot carry verifiedBy');
  return Object.freeze({ verifiedAt: null, verifiedBy: null });
}

function frozenContract(value, code) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), code, 'KPI contract must be an object');
  return deepFreeze(cloneJson(value));
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    invariant(false, 'KPI_CONTRACT_NOT_SERIALIZABLE', 'KPI contract must be JSON serializable');
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function requiredId(value, code) {
  invariant(typeof value === 'string' && ID_PATTERN.test(value), code, 'Identifier is invalid');
  return value;
}

function requiredText(value, min, max, code) {
  invariant(typeof value === 'string', code, 'Text is required');
  const normalized = value.trim().replace(/\s+/g, ' ');
  invariant(normalized.length >= min && normalized.length <= max && !/[\u0000-\u001f\u007f]/.test(normalized), code, 'Text is invalid');
  return normalized;
}

function optionalText(value, max, code) {
  if (value === null || value === undefined || value === '') return null;
  return requiredText(value, 1, max, code);
}

function timestamp(value, code) {
  invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), code, 'Timestamp is invalid');
  return new Date(value).toISOString();
}

function hashBasis(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
