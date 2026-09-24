BEGIN;

-- Кратность упаковки.
--
-- Wholesale goods do not ship as loose units. A style leaves the factory in boxes — a короб of six,
-- of twelve, of twenty-four — and an order for fourteen of something packed in sixes is not an
-- order, it is a conversation. JOOR's order-writing map (§64.2) asks for pack feedback in the cell
-- where the quantity is typed, and we could not give it: the frozen buyer price line carried a
-- minimum and an availability and nothing about how the goods are packed.
--
-- It starts here, on the catalogue SKU, because that is where the minimum already starts. Everything
-- downstream — the commercial publication, the price list version, the buyer catalogue version, the
-- order grid — carries what this row says, frozen at publication, so a buyer is held to the pack the
-- brand published to them and not to whatever the brand changed it to afterwards.
--
-- One rule is enforced here rather than left to be discovered by a buyer who cannot satisfy it:
--
--   **the minimum order quantity must itself be a multiple of the pack size.**
--
-- A minimum of twelve with a pack of five is not two rules, it is a contradiction: the smallest
-- orderable quantity at or above twelve is fifteen, so the stated minimum is a number nobody can
-- order. The brand finds out at the moment they set it, not the buyer at the moment they are refused.
--
-- The column is optional. A SKU with no pack size is sold by the unit, which is what every existing
-- row means today, so nothing already published has to change.

ALTER TABLE catalog_skus ADD COLUMN IF NOT EXISTS pack_size integer;

ALTER TABLE catalog_skus DROP CONSTRAINT IF EXISTS catalog_skus_pack_size_positive_check;
ALTER TABLE catalog_skus ADD CONSTRAINT catalog_skus_pack_size_positive_check
  CHECK (pack_size IS NULL OR pack_size >= 1);

ALTER TABLE catalog_skus DROP CONSTRAINT IF EXISTS catalog_skus_pack_size_divides_moq_check;
ALTER TABLE catalog_skus ADD CONSTRAINT catalog_skus_pack_size_divides_moq_check
  CHECK (pack_size IS NULL OR minimum_order_quantity % pack_size = 0);

ALTER TABLE catalog_skus DROP CONSTRAINT IF EXISTS catalog_skus_pack_size_projection_check;
ALTER TABLE catalog_skus ADD CONSTRAINT catalog_skus_pack_size_projection_check
  CHECK (pack_size IS NOT DISTINCT FROM NULLIF(payload -> 'packSize', 'null'::jsonb)::integer);

COMMENT ON COLUMN catalog_skus.pack_size IS
  'Кратность упаковки: the number of units in one box. An ordered quantity must be a multiple of it, and the minimum order quantity must itself be one, so the two rules cannot contradict. NULL means the SKU is sold by the unit.';

COMMIT;
