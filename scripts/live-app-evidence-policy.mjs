// Acceptance for recordings of the real isolated PLM runtime, never production.
export function validateLiveAppEvidence({ durationSeconds, screens, consoleErrors, canonicalDocumentAdmission }) {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 20 || durationSeconds > 30)
    throw new Error('MEDIA_DURATION_OUTSIDE_20_30_SECONDS');
  if (!Array.isArray(consoleErrors) || consoleErrors.length)
    throw new Error('MEDIA_BROWSER_ERRORS');
  if (!Array.isArray(screens) || screens.length === 0)
    throw new Error('MEDIA_SCREENS_MISSING');
  for (const screen of screens) {
    if (!Number.isFinite(screen.overflowPixels) || screen.overflowPixels < 0 || screen.overflowPixels > 1)
      throw new Error('MEDIA_HORIZONTAL_OVERFLOW');
    if (!Number.isFinite(screen.visibleTextLength) || screen.visibleTextLength < 60)
      throw new Error('MEDIA_EMPTY_WORKSPACE');
    if (!['ru', 'en'].includes(screen.language))
      throw new Error('MEDIA_LOCALE_UNVERIFIED');
  }
  if (!['ru', 'en'].every(language => screens.some(screen => screen.language === language)))
    throw new Error('MEDIA_BILINGUAL_EVIDENCE_MISSING');
  const admitted = canonicalDocumentAdmission === 'admitted';
  if (!admitted && canonicalDocumentAdmission !== 'blocked: TECH_PACK_CANONICAL_PRINT_NOT_ADMITTED')
    throw new Error('MEDIA_DOCUMENT_ADMISSION_UNVERIFIED');
  const documentScreens = screens.filter(screen => screen.name === '06b-app-tech-pack-issued-document-ru.png');
  if (admitted !== (documentScreens.length === 1))
    throw new Error('MEDIA_DOCUMENT_CLAIM_MISMATCH');
  return Object.freeze({
    visualCaptureAccepted: true,
    manufacturingDocumentDemonstrated: admitted,
    productionReady: false,
    limitations: Object.freeze(admitted ? ['ISOLATED_DEMO_ONLY'] :
      ['ISOLATED_DEMO_ONLY', 'CANONICAL_DOCUMENT_NOT_ADMITTED']),
  });
}
