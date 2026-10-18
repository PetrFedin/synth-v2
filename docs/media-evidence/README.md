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
