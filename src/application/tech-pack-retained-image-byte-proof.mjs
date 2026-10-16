import { createHash } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';

const HASH = /^[a-f0-9]{64}$/;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const PROVED_GATE = 'RETAINED_IMAGE_BYTES_AND_HASH_VERIFIED';
const RIGHTS_GATE = 'CURRENT_RIGHTS_RECHECK_AT_EXPORT';

/**
 * Verify exact in-memory media bytes against an immutable PDF evidence plan.
 * No storage adapter, network lookup, public API, PDF creation or export grant.
 * The future caller must fetch bytes from a trusted scoped storage adapter;
 * a matching storage-key claim alone is NOT object-store provenance.
 *
 * Each record: {mediaId, storageKey, storageVersion, bytes: Uint8Array}.
 */
export function verifyCanonicalTechPackRetainedImageBytes(plan, supplied) {
  validatePlan(plan);
  const assets = plan.requiredAssets;
  check(Array.isArray(supplied) && supplied.length === assets.length,
    'ASSET_SET_INVALID', 'Exactly one byte input is required for every frozen image');
  const inputs = new Map();
  for (const entry of supplied) {
    check(entry && typeof entry === 'object' && !Array.isArray(entry)
      && typeof entry.mediaId === 'string' && entry.mediaId.length > 0,
    'ASSET_INPUT_INVALID', 'Every byte input must identify its media');
    check(!inputs.has(entry.mediaId), 'ASSET_DUPLICATE',
      'Duplicate supplied media identity is prohibited');
    inputs.set(entry.mediaId, entry);
  }

  let totalVerifiedBytes = 0;
  const verifiedAssets = assets.map(asset => {
    const input = inputs.get(asset.mediaId);
    check(input, 'ASSET_MISSING', 'Every issued media asset requires exact retained bytes');
    check(input.storageKey === asset.retainedStorageKey
      && input.storageVersion === asset.retainedStorageVersion,
    'STORAGE_IDENTITY_MISMATCH', 'Retained storage key/version claim differs from frozen evidence');
    check(input.bytes instanceof Uint8Array,
      'ASSET_BYTES_INVALID', 'Retained bytes must be Uint8Array or Buffer, never a URL or base64 text');
    check(input.bytes.byteLength === asset.expectedByteSize,
      'ASSET_SIZE_MISMATCH', 'Physical image byte count disagrees with frozen evidence');
    totalVerifiedBytes += input.bytes.byteLength;
    check(totalVerifiedBytes <= MAX_TOTAL_BYTES, 'ASSET_BUDGET_EXCEEDED',
      'Combined verified media must not exceed 100 MiB');
    // Copy the view so the hash and container check see the same immutable moment.
    const bytes = Buffer.from(input.bytes);
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    check(actualHash === asset.contentSha256, 'ASSET_HASH_MISMATCH',
      'Physical bytes do not match the frozen issued SHA-256');
    check(containerMatches(bytes, asset.mimeType), 'ASSET_FORMAT_INVALID',
      'The bytes fail the retained image container check');
    return {
      mediaId: asset.mediaId, mediaRole: asset.mediaRole,
      storageKey: asset.retainedStorageKey, storageVersion: asset.retainedStorageVersion,
      contentSha256: actualHash, mimeType: asset.mimeType,
      verifiedByteSize: bytes.length,
      issuedRightsVersion: asset.issuedRightsVersion,
      currentRightsVersionAtPlan: asset.currentRightsVersion,
      formatCheck: asset.mimeType === 'image/png' ? 'png-crc-and-container' : 'jpeg-signature-only',
    };
  });
  const proof = {
    schemaVersion: 1,
    purpose: 'canonical-tech-pack-retained-image-byte-proof',
    planHash: plan.planHash, documentHash: plan.documentHash,
    rightsPolicyHash: plan.rightsPolicyHash, locale: plan.locale,
    imageCount: verifiedAssets.length, totalVerifiedBytes,
    assets: verifiedAssets, imageBytesMatchedIssuedHashes: true,
    pdfBytesProduced: false, publicPrintAdmitted: false, exportAdmitted: false,
    remainingGates: plan.remainingGates.filter(item => item !== PROVED_GATE),
  };
  return freeze(JSON.parse(canonicalJson({ ...proof, proofHash: hashObject(proof) })));
}

function validatePlan(plan) {
  check(plan?.schemaVersion === 1 && plan.purpose === 'canonical-tech-pack-pdf-evidence-plan'
    && plan.source === 'issued-canonical-snapshot-only'
    && plan.profile === 'A4-portrait-tech-pack-v1'
    && (plan.locale === 'ru' || plan.locale === 'en')
    && plan.pdfBytesProduced === false && plan.publicPrintAdmitted === false
    && HASH.test(plan.planHash ?? '') && HASH.test(plan.documentHash ?? '')
    && HASH.test(plan.rightsPolicyHash ?? ''),
  'PLAN_INVALID', 'An unprinted canonical PDF evidence plan is required');
  const { planHash, ...body } = plan;
  check(hashObject(body) === planHash, 'PLAN_TAMPERED',
    'The PDF plan body does not match its integrity digest');
  check(plan.content?.evidence?.documentHash === plan.documentHash
    && plan.content.evidence.rightsPolicyHash === plan.rightsPolicyHash,
  'PLAN_SCOPE_INVALID', 'Frozen document and rights hashes must match plan content');
  check(Array.isArray(plan.remainingGates) && plan.remainingGates.includes(PROVED_GATE)
    && plan.remainingGates.includes(RIGHTS_GATE)
    && new Set(plan.remainingGates).size === plan.remainingGates.length,
  'GATE_INVALID', 'Export-time rights and media-byte gates cannot be bypassed');
  const assets = plan.requiredAssets, images = plan.content?.images;
  check(Array.isArray(assets) && assets.length >= 1 && assets.length <= 100
    && Array.isArray(images) && images.length === assets.length,
  'ASSET_SET_INVALID', 'The frozen media set must be complete and bounded');
  const ids = new Set();
  let expectedTotal = 0;
  for (let i = 0; i < assets.length; i += 1) {
    const asset = assets[i], image = images[i];
    check(asset && typeof asset.mediaId === 'string' && asset.mediaId.length > 0
      && !ids.has(asset.mediaId) && HASH.test(asset.contentSha256 ?? '')
      && ['image/png', 'image/jpeg'].includes(asset.mimeType)
      && typeof asset.retainedStorageKey === 'string' && asset.retainedStorageKey.length > 0
      && typeof asset.retainedStorageVersion === 'string' && asset.retainedStorageVersion.length > 0
      && Number.isSafeInteger(asset.expectedByteSize)
      && asset.expectedByteSize > 0 && asset.expectedByteSize <= MAX_IMAGE_BYTES
      && Number.isSafeInteger(asset.issuedRightsVersion) && asset.issuedRightsVersion > 0
      && Number.isSafeInteger(asset.currentRightsVersion)
      && asset.currentRightsVersion >= asset.issuedRightsVersion,
    'ASSET_REQUIREMENT_INVALID', 'Retained media needs exact bounded immutable metadata');
    check(image?.mediaId === asset.mediaId && image.contentSha256 === asset.contentSha256
      && image.mediaRole === asset.mediaRole,
    'ASSET_SCOPE_INVALID', 'Rendered sketch set must match exact retained media identities/order');
    ids.add(asset.mediaId);
    expectedTotal += asset.expectedByteSize;
    check(expectedTotal <= MAX_TOTAL_BYTES, 'ASSET_BUDGET_EXCEEDED',
      'Declared image size budget exceeds 100 MiB');
  }
}
function containerMatches(bytes, mime) {
  return mime === 'image/png' ? checkPng(bytes)
    : mime === 'image/jpeg' ? checkJpegEnvelope(bytes) : false;
}
function checkPng(bytes) {
  if (bytes.length < 57 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
  let offset = 8, seenHeader = false, seenData = false, seenEnd = false, chunks = 0;
  while (offset < bytes.length && ++chunks <= 8192) {
    if (offset + 12 > bytes.length) return false;
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return false;
    const name = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(name)
      || bytes.readUInt32BE(end - 4) !== crc32(bytes.subarray(offset + 4, end - 4))) return false;
    if (!seenHeader) {
      if (name !== 'IHDR' || length !== 13) return false;
      const width = bytes.readUInt32BE(offset + 8), height = bytes.readUInt32BE(offset + 12);
      const depth = bytes[offset + 16], color = bytes[offset + 17];
      const allowed = { 0: [1, 2, 4, 8, 16], 2: [8, 16],
        3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!width || !height || width > 20000 || height > 20000
        || width * height > 100000000 || !allowed[color]?.includes(depth)
        || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0
        || ![0, 1].includes(bytes[offset + 20])) return false;
      seenHeader = true;
    } else if (name === 'IHDR') return false;
    if (name === 'IDAT') seenData = true;
    if (name === 'IEND') {
      if (length !== 0 || !seenData || end !== bytes.length) return false;
      seenEnd = true;
    }
    offset = end;
    if (seenEnd) break;
  }
  // This checks PNG container/chunk CRC, not decompressed pixels or visual output.
  return seenHeader && seenData && seenEnd && offset === bytes.length;
}
function checkJpegEnvelope(bytes) {
  // A JPEG signature check is NOT proof that any renderer can decode this file.
  return bytes.length >= 8 && bytes[0] === 0xff && bytes[1] === 0xd8
    && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff
    && bytes[bytes.length - 1] === 0xd9;
}
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let x = n;
  for (let i = 0; i < 8; i += 1) x = (x & 1) ? (x >>> 1) ^ 0xedb88320 : x >>> 1;
  return x >>> 0;
});
function crc32(bytes) {
  let x = 0xffffffff;
  for (const byte of bytes) x = CRC_TABLE[(x ^ byte) & 0xff] ^ (x >>> 8);
  return (x ^ 0xffffffff) >>> 0;
}
function hashObject(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
function check(ok, suffix, message) {
  invariant(ok, 'TECH_PACK_RETAINED_IMAGE_PROOF_' + suffix, message);
}
function freeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
