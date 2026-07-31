# Syntha V2 Architecture

Syntha V2 is an autonomous fashion B2B operating platform owning its backend, web workspace, PostgreSQL schema, authentication, APIs, workflows and tests. It does not depend on the legacy Syntha repository or Firebase.

## Commercial route

`Campaign → Collection → Showroom → Selection → Order Builder → Order → Confirmation → DealSpace`

## Domains

Identity and RBAC; partner CRM; campaigns, collections and showrooms; style/color/size catalog and availability; selection and assortment planning; orders and commercial terms; DealSpace, documents, payments, calendar and notifications; PLM/BOM/samples; production/QC/logistics/landed cost; analytics and integrations.

## Guarantees

Actor identity is server-derived; access is organisation-scoped; catalog price and currency are server-authoritative; order totals use trusted snapshots; reservations and releases are atomic in PostgreSQL; commands are idempotent; events use a transactional outbox; migration checksums and readiness prevent schema drift.
