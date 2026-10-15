# Public Tech Pack Issue canonical runtime cutover

Date: 2026-10-15. Stacked on exact ProductSku linkage PR #294.

The HTTP contract is intentionally unchanged: both slash-safe and path-addressed POST issue routes still call the public service method `issueTechPack(commandId, actorId, code, {expectedVersion})`.

The supported PostgreSQL runtime now binds that method to `createCanonicalTechPackIssueService.issueCanonicalTechPack`. Therefore a public issue request executes the SERIALIZABLE source-locked canonical path instead of the legacy mutable-SKU issue implementation.

The real PostgreSQL two-revision acceptance now issues R1 and R2 exclusively through `runtime.techPacks.issueTechPack`; it no longer constructs the internal canonical issuer directly.

Legacy `createTechPackService.issueTechPack` is retained temporarily as compatibility/domain history but is not the supported PostgreSQL runtime authority after this cutover candidate.

Remaining before public document release: dedicated HTTP-level canonical issue acceptance, real retained-sketch/current-rights revocation PostgreSQL proof, canonical document endpoint, RU/EN browser/PDF acceptance and protected-main integration.
