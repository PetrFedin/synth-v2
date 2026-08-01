# Syntha V2 agent rules

- This repository is the only active Syntha V2 codebase.
- Never modify or import code from frozen legacy Syntha applications.
- Do not introduce an external identity provider; authentication belongs to Syntha V2.
- Cross-module imports go only through `public.mjs`.
- Business mutations require durable command IDs and transactional outbox events.
- Applied SQL migrations are immutable.
- Preserve organisation isolation, server-authoritative pricing and atomic inventory guarantees.
- Russian and English are mandatory interface languages; all new user-facing UI text must use the localization runtime.
- Do not add a visible button or status action without an implemented handler, capability check, API route, application method and automated interaction contract.
- Client validation must mirror domain boundaries but never replace backend validation.
- Transport retries for mutations must reuse the original idempotency key and must not retry domain HTTP errors.
- Destructive actions require explicit confirmation or a reason form.
- Preserve the browser dependency order: localization, shared DOM/API, capabilities and validation load before `app-core.js`; `app-start.js` loads last.
- Run `npm run verify` before publishing.
- Priority: stabilize existing commercial workflows before expanding fashion catalog/planning, PLM/BOM/samples, production, QC, logistics, landed cost, analytics and integrations.
