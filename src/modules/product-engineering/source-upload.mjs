import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';

export const ENGINEERING_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const ENGINEERING_UPLOAD_TYPES = Object.freeze({
  'application/pdf': Object.freeze({ kind: 'document', extensions: Object.freeze(['pdf']) }),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': Object.freeze({ kind: 'spreadsheet', extensions: Object.freeze(['xlsx']) }),
  'text/csv': Object.freeze({ kind: 'spreadsheet', extensions: Object.freeze(['csv']) }),
  'image/jpeg': Object.freeze({ kind: 'product_media', extensions: Object.freeze(['jpg','jpeg']) }),
  'image/png': Object.freeze({ kind: 'product_media', extensions: Object.freeze(['png']) }),
  'image/webp': Object.freeze({ kind: 'product_media', extensions: Object.freeze(['webp']) }),
  'image/svg+xml': Object.freeze({ kind: 'style_reference', extensions: Object.freeze(['svg']) }),
});

export function inspectEngineeringUpload({ bytes, mediaType, originalName, maxBytes = ENGINEERING_UPLOAD_MAX_BYTES }) {
  invariant(bytes instanceof Uint8Array, 'ENGINEERING_UPLOAD_BYTES_REQUIRED', 'Upload body must be binary bytes');
  invariant(Number.isSafeInteger(maxBytes) && maxBytes >= 1 && maxBytes <= ENGINEERING_UPLOAD_MAX_BYTES, 'ENGINEERING_UPLOAD_LIMIT_INVALID', 'Upload size limit is invalid');
  invariant(bytes.byteLength >= 1, 'ENGINEERING_UPLOAD_EMPTY', 'Uploaded file is empty');
  invariant(bytes.byteLength <= maxBytes, 'ENGINEERING_UPLOAD_TOO_LARGE', 'Uploaded file exceeds Product Engineering limit', { maxBytes });
  const normalizedType = normalizeMediaType(mediaType);
  const policy = ENGINEERING_UPLOAD_TYPES[normalizedType];
  invariant(policy, 'ENGINEERING_UPLOAD_TYPE_UNSUPPORTED', 'Uploaded media type is not supported', { mediaType: normalizedType });
  const name = normalizeFileName(originalName);
  const extension = name.includes('.') ? name.split('.').at(-1).toLowerCase() : '';
  invariant(policy.extensions.includes(extension), 'ENGINEERING_UPLOAD_EXTENSION_MISMATCH', 'File extension does not match declared media type', { extension, mediaType: normalizedType });
  assertMagic(bytes, normalizedType);
  return Object.freeze({
    kind: policy.kind,
    mediaType: normalizedType,
    originalName: name,
    sizeBytes: bytes.byteLength,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
  });
}

export function postgresBlobStorageRef(sourceId) {
  invariant(typeof sourceId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(sourceId), 'ENGINEERING_SOURCE_ID_REQUIRED', 'Source id is invalid');
  return `postgres-blob:${sourceId}`;
}

function normalizeMediaType(value) {
  const raw = typeof value === 'string' ? value.split(';', 1)[0].trim().toLowerCase() : '';
  invariant(raw, 'ENGINEERING_UPLOAD_MEDIA_TYPE_REQUIRED', 'Content-Type is required for Product Engineering upload');
  return raw;
}
function normalizeFileName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  invariant(name.length >= 1 && name.length <= 260, 'ENGINEERING_UPLOAD_NAME_INVALID', 'X-File-Name must contain 1 to 260 characters');
  invariant(!/[\\/\u0000-\u001f\u007f]/u.test(name) && name !== '.' && name !== '..', 'ENGINEERING_UPLOAD_NAME_INVALID', 'X-File-Name contains unsafe characters');
  return name;
}
function assertMagic(bytes, mediaType) {
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  if (mediaType === 'application/pdf') invariant(starts(0x25,0x50,0x44,0x46,0x2d), 'ENGINEERING_UPLOAD_SIGNATURE_MISMATCH', 'PDF signature does not match Content-Type');
  if (mediaType === 'image/png') invariant(starts(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a), 'ENGINEERING_UPLOAD_SIGNATURE_MISMATCH', 'PNG signature does not match Content-Type');
  if (mediaType === 'image/jpeg') invariant(starts(0xff,0xd8,0xff), 'ENGINEERING_UPLOAD_SIGNATURE_MISMATCH', 'JPEG signature does not match Content-Type');
  if (mediaType === 'image/webp') {
    invariant(bytes.byteLength >= 12 && starts(0x52,0x49,0x46,0x46) && bytes[8]===0x57 && bytes[9]===0x45 && bytes[10]===0x42 && bytes[11]===0x50, 'ENGINEERING_UPLOAD_SIGNATURE_MISMATCH', 'WebP signature does not match Content-Type');
  }
  if (mediaType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    invariant(starts(0x50,0x4b,0x03,0x04), 'ENGINEERING_UPLOAD_SIGNATURE_MISMATCH', 'XLSX ZIP signature does not match Content-Type');
  }
  if (mediaType === 'image/svg+xml') {
    const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, Math.min(bytes.byteLength, 4096))).replace(/^\uFEFF/, '').trimStart();
    invariant(/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(head), 'ENGINEERING_UPLOAD_SIGNATURE_MISMATCH', 'SVG markup does not match Content-Type');
  }
  if (mediaType === 'text/csv') {
    invariant(!bytes.slice(0, 4).some((value) => value === 0), 'ENGINEERING_UPLOAD_SIGNATURE_MISMATCH', 'CSV contains binary NUL bytes');
  }
}
