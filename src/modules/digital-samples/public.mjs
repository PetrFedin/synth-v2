import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';
export { calculateDigitalSampleScenario, normalizeScenarioInput, DIGITAL_ECONOMICS_FORMULA, SCENARIO_FIELDS } from './economics.mjs';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
export const DIGITAL_SAMPLE_FORMATS = Object.freeze(['glb', 'gltf', 'obj', 'usd', 'usdz', 'fbx', 'zprj']);
export const DIGITAL_SAMPLE_INPUT_FIELDS = Object.freeze(['titleRu','titleEn','sourceFileName','sourceFormat','declaredSha256','declaredByteLength','note']);
export const DIGITAL_SAMPLE_LIMITS = Object.freeze({ maxDeclaredBytes: 524_288_000, maxPageSize: 100 });

export function digitalSampleId(value) {
  invariant(typeof value === 'string' && SAFE_ID.test(value), 'DIGITAL_SAMPLE_ID_INVALID', 'Invalid identifier');
  return value;
}
export function digitalSampleCommandId(value) {
  digitalSampleId(value);
  invariant(value.length <= 128, 'DIGITAL_SAMPLE_ID_INVALID', 'Command key is too long');
  return value;
}
export function freezeDigitalSample(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freezeDigitalSample(item);
    Object.freeze(value);
  }
  return value;
}
export function digitalSampleHash(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
export function normalizeDigitalSampleInput(input) {
  invariant(input && Object.getPrototypeOf(input) === Object.prototype, 'DIGITAL_SAMPLE_INPUT_INVALID', 'Manifest must be a plain JSON object');
  invariant(Object.keys(input).every(key => DIGITAL_SAMPLE_INPUT_FIELDS.includes(key)), 'DIGITAL_SAMPLE_FIELD_UNKNOWN', 'Unsupported manifest field');
  const titleRu = text(input.titleRu, 1, 160), titleEn = text(input.titleEn, 1, 160);
  const sourceFileName = text(input.sourceFileName, 1, 200);
  invariant(!/[\\/\x00-\x1f\x7f]/.test(sourceFileName) && !['.', '..'].includes(sourceFileName),
    'DIGITAL_SAMPLE_FILENAME_INVALID', 'A source basename is required, not a path');
  invariant(DIGITAL_SAMPLE_FORMATS.includes(input.sourceFormat), 'DIGITAL_SAMPLE_FORMAT_INVALID', 'Unsupported declared source format');
  invariant(sourceFileName.toLowerCase().endsWith('.' + input.sourceFormat), 'DIGITAL_SAMPLE_FORMAT_MISMATCH', 'Filename and format do not match');
  invariant(typeof input.declaredSha256 === 'string' && SHA256.test(input.declaredSha256), 'DIGITAL_SAMPLE_SOURCE_HASH_INVALID', 'Lowercase SHA-256 declaration is required');
  invariant(Number.isSafeInteger(input.declaredByteLength) && input.declaredByteLength >= 1
    && input.declaredByteLength <= DIGITAL_SAMPLE_LIMITS.maxDeclaredBytes, 'DIGITAL_SAMPLE_SIZE_INVALID', 'Declared file size is invalid');
  return Object.freeze({ titleRu, titleEn, sourceFileName, sourceFormat: input.sourceFormat,
    declaredSha256: input.declaredSha256, declaredByteLength: input.declaredByteLength,
    note: input.note === undefined ? '' : text(input.note, 0, 2000) });
}
export function digitalSampleTimestamp(value) {
  invariant(typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)),
    'DIGITAL_SAMPLE_TIME_INVALID', 'Valid server timestamp is required');
  return new Date(value).toISOString();
}
export function assertDigitalSampleLineage(styleVersion, record = null) {
  invariant(styleVersion && typeof styleVersion === 'object', 'DIGITAL_SAMPLE_STYLE_REQUIRED', 'Canonical StyleVersion required');
  for (const key of ['id','styleId','brandId']) digitalSampleId(styleVersion[key]);
  invariant(typeof styleVersion.contentHash === 'string' && SHA256.test(styleVersion.contentHash),
    'DIGITAL_SAMPLE_STYLE_HASH_REQUIRED', 'Canonical StyleVersion content hash required');
  if (record) {
    invariant(record.styleVersionId === styleVersion.id && record.styleId === styleVersion.styleId
      && record.brandId === styleVersion.brandId && record.styleVersionContentHash === styleVersion.contentHash,
      'DIGITAL_SAMPLE_LINEAGE_CONFLICT', 'Record does not match the immutable StyleVersion');
  }
}
export function createDigitalSampleVersion({ id, seriesId, styleVersion, previous = null, input, actorId, createdAt }) {
  digitalSampleId(id); digitalSampleId(seriesId); digitalSampleId(actorId);
  assertDigitalSampleLineage(styleVersion);
  if (previous) {
    assertDigitalSampleLineage(styleVersion, previous);
    invariant(previous.seriesId === seriesId && previous.id !== id && Number.isInteger(previous.revision)
      && previous.revision > 0 && previous.revision < 2_147_483_647,
      'DIGITAL_SAMPLE_REVISION_INVALID', 'Invalid predecessor');
    assertDigitalSampleIntegrity(previous);
  }
  const record = {
    id, seriesId, revision: previous ? previous.revision + 1 : 1, previousVersionId: previous?.id ?? null,
    brandId: styleVersion.brandId, styleId: styleVersion.styleId, styleVersionId: styleVersion.id,
    styleVersionContentHash: styleVersion.contentHash, ...normalizeDigitalSampleInput(input),
    artifactVerification: 'declared_only', reviewStatus: 'not_reviewed', viewable: false, productionReady: false,
    createdBy: actorId, createdAt: digitalSampleTimestamp(createdAt),
  };
  return freezeDigitalSample({ ...record, manifestHash: digitalSampleHash(record) });
}
export function assertDigitalSampleIntegrity(record) {
  invariant(record && typeof record === 'object', 'DIGITAL_SAMPLE_INTEGRITY_CONFLICT', 'Record is missing');
  const { manifestHash, ...body } = record;
  invariant(typeof manifestHash === 'string' && SHA256.test(manifestHash) && digitalSampleHash(body) === manifestHash,
    'DIGITAL_SAMPLE_INTEGRITY_CONFLICT', 'Manifest checksum does not match');
  return record;
}
export function normalizeDigitalSamplePage({ limit = 50, afterId = null } = {}) {
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= DIGITAL_SAMPLE_LIMITS.maxPageSize,
    'DIGITAL_SAMPLE_PAGE_INVALID', 'Page size must be between 1 and 100');
  if (afterId !== null) digitalSampleId(afterId);
  return { limit, afterId };
}
function text(value, min, max) {
  invariant(typeof value === 'string' && value.trim().length >= min && value.trim().length <= max
    && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value), 'DIGITAL_SAMPLE_TEXT_INVALID', 'Invalid text length or characters');
  return value.trim();
}
