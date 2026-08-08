BEGIN;

-- Preserve legacy immutable economics rows while making every new v2 execution
-- record explicitly traceable to the immutable commercial order commit.
CREATE UNIQUE INDEX order_commit_snapshots_id_order_unique_idx
  ON order_commit_snapshots (id, order_id);

ALTER TABLE supply_commitment_snapshots
  ADD COLUMN order_commit_snapshot_id TEXT NULL,
  ADD COLUMN lineage_version SMALLINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT supply_commitment_lineage_version_check CHECK (lineage_version IN (1, 2)),
  ADD CONSTRAINT supply_commitment_v2_lineage_required CHECK (
    lineage_version = 1 OR (
      order_commit_snapshot_id IS NOT NULL
      AND COALESCE(payload ->> 'orderCommitSnapshotId', '') = order_commit_snapshot_id
    )
  ),
  ADD CONSTRAINT supply_commitment_order_commit_fk
    FOREIGN KEY (order_commit_snapshot_id, order_id)
    REFERENCES order_commit_snapshots (id, order_id);

CREATE INDEX supply_commitment_order_commit_idx
  ON supply_commitment_snapshots (order_commit_snapshot_id, created_at DESC)
  WHERE order_commit_snapshot_id IS NOT NULL;

ALTER TABLE actual_cost_ledger_entries
  ADD COLUMN order_commit_snapshot_id TEXT NULL,
  ADD COLUMN lineage_version SMALLINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT actual_cost_lineage_version_check CHECK (lineage_version IN (1, 2)),
  ADD CONSTRAINT actual_cost_v2_lineage_required CHECK (
    lineage_version = 1 OR (
      order_commit_snapshot_id IS NOT NULL
      AND COALESCE(payload ->> 'orderCommitSnapshotId', '') = order_commit_snapshot_id
    )
  ),
  ADD CONSTRAINT actual_cost_order_commit_fk
    FOREIGN KEY (order_commit_snapshot_id, order_id)
    REFERENCES order_commit_snapshots (id, order_id);

CREATE INDEX actual_cost_order_commit_idx
  ON actual_cost_ledger_entries (order_commit_snapshot_id, recorded_at, id)
  WHERE order_commit_snapshot_id IS NOT NULL;

ALTER TABLE landed_cost_snapshots
  ADD COLUMN order_commit_snapshot_id TEXT NULL,
  ADD COLUMN lineage_version SMALLINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT landed_cost_lineage_version_check CHECK (lineage_version IN (1, 2)),
  ADD CONSTRAINT landed_cost_v2_lineage_required CHECK (
    lineage_version = 1 OR (
      order_commit_snapshot_id IS NOT NULL
      AND COALESCE(payload ->> 'orderCommitSnapshotId', '') = order_commit_snapshot_id
    )
  ),
  ADD CONSTRAINT landed_cost_order_commit_fk
    FOREIGN KEY (order_commit_snapshot_id, order_id)
    REFERENCES order_commit_snapshots (id, order_id);

CREATE UNIQUE INDEX landed_cost_id_order_commit_unique_idx
  ON landed_cost_snapshots (id, order_commit_snapshot_id);
CREATE INDEX landed_cost_order_commit_idx
  ON landed_cost_snapshots (order_commit_snapshot_id, created_at DESC)
  WHERE order_commit_snapshot_id IS NOT NULL;

ALTER TABLE margin_actualization_snapshots
  ADD COLUMN order_commit_snapshot_id TEXT NULL,
  ADD COLUMN lineage_version SMALLINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT margin_actualization_lineage_version_check CHECK (lineage_version IN (1, 2)),
  ADD CONSTRAINT margin_actualization_v2_lineage_required CHECK (
    lineage_version = 1 OR (
      order_commit_snapshot_id IS NOT NULL
      AND COALESCE(payload ->> 'orderCommitSnapshotId', '') = order_commit_snapshot_id
    )
  ),
  ADD CONSTRAINT margin_actualization_order_commit_fk
    FOREIGN KEY (order_commit_snapshot_id, order_id)
    REFERENCES order_commit_snapshots (id, order_id),
  ADD CONSTRAINT margin_actualization_landed_cost_lineage_fk
    FOREIGN KEY (landed_cost_snapshot_id, order_commit_snapshot_id)
    REFERENCES landed_cost_snapshots (id, order_commit_snapshot_id);

CREATE INDEX margin_actualization_order_commit_idx
  ON margin_actualization_snapshots (order_commit_snapshot_id, created_at DESC)
  WHERE order_commit_snapshot_id IS NOT NULL;

COMMIT;
