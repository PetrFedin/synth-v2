import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { canonicalJson } from '../src/core/fingerprints.mjs';
import { completeCanonicalTechPackFixture } from './helpers/canonical-tech-pack-document-fixture.mjs';
import { buildFrozenCanonicalTechPackDocument } from '../src/application/tech-pack-frozen-document.mjs';
import { evaluateCanonicalTechPackRenderAdmission } from '../src/application/tech-pack-public-render-policy.mjs';
import { buildCanonicalTechPackPdfEvidencePlan } from '../src/application/tech-pack-pdf-evidence-plan.mjs';
import { verifyCanonicalTechPackRetainedImageBytes } from '../src/application/tech-pack-retained-image-byte-proof.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hashObject = value => sha(Buffer.from(canonicalJson(value), 'utf8'));
const at = '2026-10-15T12:00:00.000Z';
const currentRight = () => ({
  id: 'rights-v2', mediaId: 'media-1', version: 2, status: 'cleared',
  basis: 'brand-owned', evidenceRef: 'contract://2',
  approvedAt: '2026-10-15T10:00:00.000Z',
  approvedBy: 'rights-officer', validUntil: null,
});
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let x = n;
  for (let i = 0; i < 8; i += 1) x = (x & 1) ? (x >>> 1) ^ 0xedb88320 : x >>> 1;
  return x >>> 0;
});
function crc32(bytes) {
  let x = 0xffffffff;
  for (const byte of bytes) x = crcTable[(x ^ byte) & 0xff] ^ (x >>> 8);
  return (x ^ 0xffffffff) >>> 0;
}
function chunk(name, contents) {
  const nameBytes = Buffer.from(name, 'ascii'), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(contents.length);
  crc.writeUInt32BE(crc32(Buffer.concat([nameBytes, contents])));
  return Buffer.concat([size, nameBytes, contents, crc]);
}
function pixelPng(red = 255) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, red, 0, 0, 255]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function fixture(bytes, mime = 'image/png', locale = 'ru') {
  const pack = completeCanonicalTechPackFixture({
    sketchContentHash: sha(bytes), sketchByteSize: bytes.length, sketchMimeType: mime,
  });
  const document = buildFrozenCanonicalTechPackDocument(pack);
  const admission = evaluateCanonicalTechPackRenderAdmission(document, [currentRight()], at);
  assert.equal(admission.admitted, true);
  const plan = buildCanonicalTechPackPdfEvidencePlan({ document, admission }, { locale });
  const asset = plan.requiredAssets[0];
  return { document, admission, plan,
    input: { mediaId: asset.mediaId, storageKey: asset.retainedStorageKey,
      storageVersion: asset.retainedStorageVersion, bytes } };
}
const verify = (plan, inputs) => verifyCanonicalTechPackRetainedImageBytes(plan, inputs);
const editable = plan => JSON.parse(JSON.stringify(plan));
function resign(plan) {
  const { planHash, ...body } = plan;
  plan.planHash = hashObject(body);
  return plan;
}

test('real issued PNG bytes yield reproducible proof, never PDF or export admission', () => {
  const { document, admission, plan, input } = fixture(pixelPng());
  const result = verify(plan, [input]), repeated = verify(plan, [input]);
  assert.deepEqual(result, repeated);
  const { proofHash, ...body } = result;
  assert.equal(proofHash, hashObject(body));
  assert.equal(result.planHash, plan.planHash);
  assert.equal(result.documentHash, document.documentHash);
  assert.equal(result.rightsPolicyHash, admission.policyHash);
  assert.equal(result.assets[0].contentSha256, sha(input.bytes));
  assert.equal(result.assets[0].formatCheck, 'png-crc-and-container');
  assert.equal(result.imageBytesMatchedIssuedHashes, true);
  assert.equal(result.pdfBytesProduced, false);
  assert.equal(result.publicPrintAdmitted, false);
  assert.equal(result.exportAdmitted, false);
  assert.ok(result.remainingGates.includes('CURRENT_RIGHTS_RECHECK_AT_EXPORT'));
  assert.ok(!result.remainingGates.includes('RETAINED_IMAGE_BYTES_AND_HASH_VERIFIED'));
  assert.equal(Object.isFrozen(result.assets[0]), true);
  assert.equal(Object.hasOwn(result.assets[0], 'bytes'), false);
});

test('bilingual content changes plan/proof hash, not exact issued media bytes', () => {
  const b = pixelPng(), ru = fixture(b, 'image/png', 'ru'), en = fixture(b, 'image/png', 'en');
  const a = verify(ru.plan, [ru.input]), c = verify(en.plan, [en.input]);
  assert.equal(a.assets[0].contentSha256, c.assets[0].contentSha256);
  assert.equal(a.documentHash, c.documentHash);
  assert.notEqual(a.planHash, c.planHash);
  assert.notEqual(a.proofHash, c.proofHash);
});

test('same-size changed pixels fail SHA-256, even with a structurally valid image', () => {
  const one = pixelPng(255), two = pixelPng(254);
  const { plan, input } = fixture(one);
  assert.equal(one.length, two.length);
  assert.throws(() => verify(plan, [{ ...input, bytes: two }]),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_ASSET_HASH_MISMATCH' });
});

test('truncated bytes fail before hashing', () => {
  const { plan, input } = fixture(pixelPng());
  assert.throws(() => verify(plan, [{ ...input, bytes: input.bytes.subarray(0, -1) }]),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_ASSET_SIZE_MISMATCH' });
});

test('matching byte hash does not excuse corrupt PNG CRC', () => {
  const bad = pixelPng(); bad[29] ^= 1;
  const { plan, input } = fixture(bad);
  assert.throws(() => verify(plan, [input]),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_ASSET_FORMAT_INVALID' });
});

test('mislabeled JPEG cannot contain PNG bytes even with identical hash and size', () => {
  const { plan, input } = fixture(pixelPng(), 'image/jpeg');
  assert.throws(() => verify(plan, [input]),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_ASSET_FORMAT_INVALID' });
});

test('missing, duplicate, foreign and mis-versioned media fail closed', () => {
  const { plan, input } = fixture(pixelPng());
  assert.throws(() => verify(plan, []),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_ASSET_SET_INVALID' });
  assert.throws(() => verify(plan, [input, input]),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_ASSET_SET_INVALID' });
  assert.throws(() => verify(plan, [{ ...input, mediaId: 'foreign' }]),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_ASSET_MISSING' });
  assert.throws(() => verify(plan, [{ ...input, storageKey: 's3://alias/front.png' }]),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_STORAGE_IDENTITY_MISMATCH' });
  assert.throws(() => verify(plan, [{ ...input, storageVersion: 'v2' }]),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_STORAGE_IDENTITY_MISMATCH' });
  assert.throws(() => verify(plan, [{ ...input, bytes: 'base64data' }]),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_ASSET_BYTES_INVALID' });
});

test('tampered plan fingerprint and forged issued image scope are rejected', () => {
  const { plan, input } = fixture(pixelPng());
  const altered = editable(plan);
  altered.requiredAssets[0].retainedStorageVersion = 'forged';
  assert.throws(() => verify(altered, [input]),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_PLAN_TAMPERED' });
  const contradictory = editable(plan);
  contradictory.content.images[0].mediaId = 'another';
  assert.throws(() => verify(resign(contradictory), [input]),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_ASSET_SCOPE_INVALID' });
});

test('export-time rights gate may not be dropped, even when plan is consistently rehashed', () => {
  const { plan, input } = fixture(pixelPng());
  const weakened = editable(plan);
  weakened.remainingGates = ['RETAINED_IMAGE_BYTES_AND_HASH_VERIFIED'];
  assert.throws(() => verify(resign(weakened), [input]),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_GATE_INVALID' });
});

test('claimed PDF or print admission invalidates the media proof input', () => {
  const { plan, input } = fixture(pixelPng());
  const changed = editable(plan);
  changed.pdfBytesProduced = true;
  assert.throws(() => verify(resign(changed), [input]),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_PLAN_INVALID' });
});

test('oversized asset declaration fails before allocating physical image buffers', () => {
  const { plan, input } = fixture(pixelPng());
  const oversized = editable(plan);
  oversized.requiredAssets[0].expectedByteSize = 50 * 1024 * 1024 + 1;
  assert.throws(() => verify(resign(oversized), [input]),
    { code: 'TECH_PACK_RETAINED_IMAGE_PROOF_ASSET_REQUIREMENT_INVALID' });
});

test('byte verifier has no HTTP, storage, PDF writer or browser dependency', async () => {
  const contents = await (await import('node:fs/promises')).readFile(
    new URL('../src/application/tech-pack-retained-image-byte-proof.mjs', import.meta.url),
    'utf8');
  assert.doesNotMatch(contents, /fetch\s*\(|window\.print\s*\(|createServer\s*\(/);
  assert.doesNotMatch(contents, /writeFile\s*\(|addRoute\s*\(|PDFDocument|puppeteer/);
});
