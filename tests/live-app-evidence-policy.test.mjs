import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLiveAppEvidence } from '../scripts/live-app-evidence-policy.mjs';
const screen = (language, name = language + '.png') => ({
  language, name, overflowPixels: 0, visibleTextLength: 200,
});
const valid = () => ({
  durationSeconds: 26.72, screens: [screen('ru'), screen('en')],
  consoleErrors: [], canonicalDocumentAdmission: 'blocked: TECH_PACK_CANONICAL_PRINT_NOT_ADMITTED',
});
test('blocked print retains visual evidence without claiming a manufacturing document', () => {
  const result = validateLiveAppEvidence(valid());
  assert.equal(result.manufacturingDocumentDemonstrated, false);
  assert.equal(result.productionReady, false);
  assert.ok(result.limitations.includes('CANONICAL_DOCUMENT_NOT_ADMITTED'));
  assert.ok(Object.isFrozen(result.limitations));
});
test('admitted document requires its actual screenshot', () => {
  const input = valid(); input.canonicalDocumentAdmission = 'admitted';
  assert.throws(() => validateLiveAppEvidence(input), /CLAIM_MISMATCH/);
  input.screens.push(screen('ru', '06b-app-tech-pack-issued-document-ru.png'));
  assert.equal(validateLiveAppEvidence(input).manufacturingDocumentDemonstrated, true);
});
test('blocked document cannot carry an issued-document screenshot', () => {
  const input = valid(); input.screens.push(screen('ru', '06b-app-tech-pack-issued-document-ru.png'));
  assert.throws(() => validateLiveAppEvidence(input), /CLAIM_MISMATCH/);
});
test('enforces requested duration including finite values and exact endpoints', () => {
  for (const durationSeconds of [19.99, 30.01, 32, NaN, Infinity, undefined])
    assert.throws(() => validateLiveAppEvidence({ ...valid(), durationSeconds }), /DURATION/);
  for (const durationSeconds of [20, 30])
    assert.equal(validateLiveAppEvidence({ ...valid(), durationSeconds }).visualCaptureAccepted, true);
});
test('browser errors fail closed without echoing private exception content', () => {
  assert.throws(() => validateLiveAppEvidence({ ...valid(), consoleErrors: ['secret token'] }),
    error => error.message === 'MEDIA_BROWSER_ERRORS');
  assert.throws(() => validateLiveAppEvidence({ ...valid(), consoleErrors: undefined }), /BROWSER_ERRORS/);
});
test('all screen overflow measurements are required and bounded', () => {
  for (const overflowPixels of [2, NaN, -1, undefined]) {
    const input = valid(); input.screens[1].overflowPixels = overflowPixels;
    assert.throws(() => validateLiveAppEvidence(input), /OVERFLOW/);
  }
});
test('blank and unknown-language workspaces are rejected', () => {
  const input = valid(); input.screens[0].visibleTextLength = 0;
  assert.throws(() => validateLiveAppEvidence(input), /EMPTY_WORKSPACE/);
  input.screens[0] = screen('xx');
  assert.throws(() => validateLiveAppEvidence(input), /LOCALE_UNVERIFIED/);
});
test('both real locales and nonempty screen list are required', () => {
  assert.throws(() => validateLiveAppEvidence({ ...valid(), screens: [] }), /SCREENS_MISSING/);
  assert.throws(() => validateLiveAppEvidence({ ...valid(), screens: [screen('ru')] }), /BILINGUAL/);
});
test('unknown document admission never becomes accepted media', () => {
  assert.throws(() => validateLiveAppEvidence({ ...valid(), canonicalDocumentAdmission: 'not-checked' }), /ADMISSION_UNVERIFIED/);
});
