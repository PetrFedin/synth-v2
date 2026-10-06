CREATE TABLE IF NOT EXISTS supplier_trust_revocations (
  checkpoint_sha256 text PRIMARY KEY CHECK (checkpoint_sha256 ~ '^[a-f0-9]{64}$'),
  supplier_code text NOT NULL,
  reason text NOT NULL,
  revoked_by text NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_trust_revocations_supplier_idx
  ON supplier_trust_revocations(supplier_code, revoked_at DESC);
