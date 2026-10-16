# Syntha V2 — retained image bytes for canonical Tech Pack

Date: 2026-10-16. PR #301 stacked on PR #300 and PR #299.

**Candidate only. No PDF binary, public export or Print button.**

The issued frozen Tech Pack records each ProductMedia sketch's SHA-256, retained storage key/version, MIME and byte length. The new pure application verifier consumes one in-memory Uint8Array/Buffer per exact media ID and a PDF plan produced from the rights-gated issued document.

It compares all source identities, storage version claims, byte counts, cryptographic hashes and file containers. PNG requires valid chunk CRCs and IHDR/IDAT/IEND; JPEG currently checks the envelope signature only. It emits a deterministic proof hash and media metadata **without exporting binary image content**.

The byte supplier is NOT yet a trusted object-store adapter: a claimed storage key or version does not prove where physical bytes originated. Even a successful proof does not decode pixels, license fonts, paginate A4, generate PDF bytes, or recheck current rights at export time. PDF and printing remain HOLD until these independently verified gates are complete. Hashes provide integrity evidence, not digital signatures or authority grants.

Added tests build real PNG bytes, issue a frozen sample Tech Pack from those bytes, admit current publication rights, build a RU/EN evidence plan and then verify exact bytes end to end. Negative tests reject tampering, wrong/duplicated media, wrong storage versions, corrupt PNG CRCs, mislabeled MIME, truncation, weakened export gates and oversized assets.
