BEGIN;

ALTER TABLE product_engineering_change_impact_receipts
  ADD COLUMN result_verification jsonb NULL
  CHECK (result_verification IS NULL OR jsonb_typeof(result_verification) = 'object');

ALTER TABLE product_engineering_change_impact_receipts
  ADD CONSTRAINT product_engineering_change_impact_receipt_verification_check
  CHECK (
    (disposition = 'waived' AND result_verification IS NULL)
    OR
    (disposition = 'resolved')
  );

COMMENT ON COLUMN product_engineering_change_impact_receipts.result_verification IS
  'Independent read-authority proof for a claimed canonical result reference. Policy-required resolved impacts must carry this proof at application level before persistence.';

COMMIT;
