# SYNTH-V2 Commercial & Execution Spine

Canonical immutable lineage:

`PLM/ProductRevision -> CommercialPublication -> PriceListVersion -> BuyerCatalogVersion -> Buyer Selection -> OrderCommitSnapshot -> SupplyCommitmentSnapshot -> ActualCostLedgerEntry -> LandedCostSnapshot -> MarginActualizationSnapshot`

Operational rules:

- Buyer-visible price, MOQ and catalog version come from the published BuyerCatalogVersion, never from mutable PLM fields.
- Live inventory is a dynamic overlay and is reserved against immutable OrderCommit lines.
- Supply commitments reference the exact OrderCommitSnapshot.
- Actual costs reference both the exact OrderCommitSnapshot and SupplyCommitmentSnapshot.
- Cross-currency costs preserve source money and reference an immutable FX snapshot.
- Cost corrections are append-only: exact reversal of the original entry plus a replacement entry in the same transaction.
- Landed cost is derived from immutable ledger entries; margin is derived from committed revenue and a specific landed-cost snapshot.
- PostgreSQL integrity gates independently verify supply, FX, actual cost, landed cost and margin lineage.
