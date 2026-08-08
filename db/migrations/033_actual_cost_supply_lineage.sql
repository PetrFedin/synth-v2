BEGIN;

CREATE UNIQUE INDEX supply_commitment_id_commit_unique_idx
  ON supply_commitment_snapshots (id, order_commit_snapshot_id);

ALTER TABLE actual_cost_ledger_entries
  DROP CONSTRAINT actual_cost_lineage_version_check,
  ADD COLUMN supply_commitment_snapshot_id TEXT NULL,
  ADD CONSTRAINT actual_cost_lineage_version_check CHECK (lineage_version IN (1, 2, 3)),
  ADD CONSTRAINT actual_cost_v3_supply_lineage_required CHECK (
    lineage_version IN (1, 2) OR (
      supply_commitment_snapshot_id IS NOT NULL
      AND COALESCE(payload ->> 'supplyCommitmentSnapshotId', '') = supply_commitment_snapshot_id
    )
  ),
  ADD CONSTRAINT actual_cost_supply_commit_fk
    FOREIGN KEY (supply_commitment_snapshot_id, order_commit_snapshot_id)
    REFERENCES supply_commitment_snapshots (id, order_commit_snapshot_id);

CREATE INDEX actual_cost_supply_commit_idx
  ON actual_cost_ledger_entries (supply_commitment_snapshot_id, recorded_at, id)
  WHERE supply_commitment_snapshot_id IS NOT NULL;

COMMIT;
