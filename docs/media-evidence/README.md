# Syntha: verified media captures for the personal portfolio

Source: https://syntha-v2-preview-petr.netlify.app
Netlify last inspected deployed id 6ac9731cad3673b96c9cabd8, published
2026-10-09. This deploy is a static preview and has no source Git SHA
reported by Netlify. It cannot prove the current PLM/PR #304 interface.

Workflow live-preview-media-evidence.yml captures authentic unedited RU/EN
desktop (1280x720), mobile (390x844) and a 20-30-second browser MP4.
Every artifact has a JSON manifest with URLs, times, SHA-256 file hashes,
rendered content hashes, viewport overflow results and browser errors.
No logins, fabrication or substitution of images with mockup frames.

A new GitHub Actions artifact is preserved for 90 days after a PR change
to the capture scripts, manual workflow dispatch or a scheduled Monday
run after the workflow is integrated into the default branch.
The 90-day artifacts are NOT permanent storage: save reviewed originals
to a versioned portfolio CDN at portfolio-media/syntha/YYYY-MM-DD/deploy-id
and retain manifest hashes. Never overwrite earlier captures.

Private interactive PLM captures must be performed separately on an
authorized staging app with disposable test accounts and a verified deployed
source SHA. Do not capture real supplier finances or client information.
CI success for the static preview must never imply that the authenticated
PostgreSQL modules or Production/Quality role checks were exercised.

## 2026-10-18: authenticated Syntha V2 application screenshots and short video

An independent GitHub Actions workflow (.github/workflows/live-plm-screen-evidence.yml)
provisions ephemeral PostgreSQL 17, bootstraps a disposable brand owner,
and seeds a fashion season through existing domain services.
It starts the real Node server from the checked-out Git SHA and logs in over
the actual /v2/auth/login API before opening the recording browser.

All demo passwords are random per run and masked. The seeding script prints
private test credentials, so its logs are redirected locally and are NEVER
included in public uploaded artifacts.

scripts/capture-live-app.mjs records actual RU overview, catalog, showrooms,
partners and real English toggle if present, plus mobile views, a 20-30s
MP4 and raw WebM. The manifest records the source commit, timestamps,
content and media SHA-256, client errors and explicitly non-production provenance.

This is executable CI-staging UI, not the older Netlify PERSONAL LANDING,
a customer deployment, or an audited production release. Review all
images for privacy, clipping, loading errors and claimed functionality before
publication. Capture runs are retained as GitHub Actions artifacts for 90
days only. Permanent portfolio CDN archiving is a separate open task.
Weekly schedule only activates after integration into default branch.
