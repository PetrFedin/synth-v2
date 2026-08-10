BEGIN;

CREATE UNIQUE INDEX supplier_claim_recovery_source_identity_unique_idx
  ON supplier_claim_recovery_snapshots (
    claim_resolution_snapshot_id,
    supplier_code,
    (payload ->> 'sourceRef')
  );

COMMIT;
