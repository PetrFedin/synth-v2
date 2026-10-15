# Frozen canonical Tech Pack document composer

Date: 2026-10-15. Stacked after Draft PR #289. Production/public print remains HOLD.

The composer has one input: the stored issued Pack. It combines the already verified frozen BOM, measurement chart and PPS with the already verified issued header, product/supplier display context, operation sequence and sketch evidence. It never queries current catalog, MDM, prices, supplier rows, media rows or object storage.

The output has a deterministic SHA-256 document hash, exact source manifest and explicit blockers. Complete historical evidence may set factoryEvidenceReady=true, but publicPrintAdmitted stays false because public rendering still needs current publication-rights policy, public route/OpenAPI admission and RU/EN browser/PDF qualification.

An internal post-authorisation reader was added for qualification; it is not wired to public HTTP.
