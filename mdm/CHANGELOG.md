# MDM Changelog

All notable master-data catalog changes are recorded here. Applied database migrations remain immutable.

## 0.2.1 - 2026-08-31

- Added the first governed `assortment.category` operational reference entry: `APPAREL` / `Одежда`, exact id `mdm-entry:assortment-category:apparel`, version 1.
- Registered `assortment.category` under the existing `syntha_operational_master` pull-request-governed source.
- Corrected reference validation so mandatory RU fashion size systems and operational units are verified across the complete `mdm/reference` profile rather than incorrectly requiring every modular dataset file to duplicate the whole baseline.
- Added an automated contract test that pins the exact apparel category identity, bilingual labels, governance flags and source registration used by canonical Product Identity readiness.

## 0.2.0 - 2026-08-12

- Rescued the governed MDM semantic core from the stale PR #44 onto the current SYNTH-V2 architecture.
- Renumbered persistence to `050_mdm_reference_core.sql`; the historical `023` migration is not reused or modified.
- Added exact immutable version snapshots for dictionaries and entries, including initial versions.
- Added tenant, hierarchy, cycle, approval and exact-version increment guards.
- Bound historical MDM usage snapshots to an exact persisted entry version.
- Kept MDM change publication on the unified transactional outbox.
- Established a hard formula ownership boundary: the persistent KPI Registry is the only canonical KPI/formula truth; the old MDM metric catalog/schema are intentionally not imported.
- Restored bilingual semantic catalogs, governed product attributes and authoritative-source monitoring metadata.
- Added repository validation and capability-register visibility for the consolidation wave.

## 0.1.0 - 2026-08-05

- Established the initial bilingual MDM repository structure on the historical feature branch.
- Added governed reference-record and attribute schemas.
- Added broad domain inventory for fashion development, sourcing, production, wholesale, CRM, analytics and integrations.
- Added initial product attribute sets.
- Prototyped PostgreSQL MDM persistence, effective dating, approvals, immutable codes, audit versions and transaction snapshots.
- Added source registry, deterministic validation and scheduled source-change detection.
- The historical metric catalog from this version is superseded by the KPI Registry ownership decision and is not part of the rescued canonical MDM core.
