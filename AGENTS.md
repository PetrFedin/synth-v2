# Syntha V2 agent rules

- This repository is the only active Syntha V2 codebase.
- Never modify or import code from frozen legacy Syntha applications.
- Do not introduce Firebase or another external identity provider.
- Cross-module imports go only through `public.mjs`.
- Business mutations require durable command IDs and transactional outbox events.
- Applied SQL migrations are immutable.
- Preserve organisation isolation, server-authoritative pricing and atomic inventory guarantees.
- Run `npm run verify` before publishing.
- Priority: fashion catalog/planning, PLM/BOM/samples, production, QC, logistics, landed cost, analytics and integrations.
