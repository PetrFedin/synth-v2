-- Migration 065 introduced the canonical ProductSku inventory balance and backfilled it from the
-- legacy catalog availability, so that "an already-existing ProductSku and catalog SKU cannot carry
-- two independent stock counters after this migration".
--
-- That invariant did not survive for rows created afterwards. The trigger that initialises a balance
-- for a new ProductSku sets it to zero, which is correct at that instant: a ProductSku is created
-- before it is linked to a catalog SKU, so there is nothing to copy yet. Nothing reconciled the two
-- once the link was made, so every ProductSku created after 065 kept a permanent zero balance while
-- its catalog SKU advertised its real availability.
--
-- The consequence is not cosmetic. Committing a commercial order reserves against the canonical
-- balance, so with a zero balance the first order can never be committed — and the only route that
-- can post inventory runs through a receipt, which needs a shipment notice, which needs a
-- fulfilment plan, which needs the order commit snapshot that the commit itself would create. The
-- chain closes on itself.
--
-- Reconcile at the moment the two identities become one stock: when the link is inserted.

CREATE OR REPLACE FUNCTION reconcile_product_sku_inventory_on_catalog_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  catalog_available BIGINT;
  catalog_reserved BIGINT;
BEGIN
  SELECT catalog.available_quantity, catalog.reserved_quantity
    INTO catalog_available, catalog_reserved
    FROM catalog_skus AS catalog
   WHERE catalog.sku = NEW.catalog_sku
     AND catalog.brand_id = NEW.brand_id;

  IF catalog_available IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only adopt the catalog figure while the canonical balance is still untouched. A balance that
  -- already carries movements is authoritative and must not be overwritten by a legacy counter.
  UPDATE product_sku_inventory_balances AS balance
     SET available_quantity = catalog_available,
         reserved_quantity = COALESCE(catalog_reserved, 0),
         version = balance.version + 1,
         updated_at = NEW.linked_at,
         updated_by = NEW.linked_by
   WHERE balance.product_sku_id = NEW.product_sku_id
     AND balance.brand_id = NEW.brand_id
     AND balance.available_quantity = 0
     AND balance.reserved_quantity = 0;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_catalog_sku_links_reconcile_inventory ON product_catalog_sku_links;
CREATE TRIGGER product_catalog_sku_links_reconcile_inventory
AFTER INSERT ON product_catalog_sku_links
FOR EACH ROW
EXECUTE FUNCTION reconcile_product_sku_inventory_on_catalog_link();

-- Bring existing links up to the same rule, exactly as 065 did for the rows it found.
UPDATE product_sku_inventory_balances AS balance
   SET available_quantity = catalog.available_quantity,
       reserved_quantity = COALESCE(catalog.reserved_quantity, 0),
       version = balance.version + 1,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = 'migration-076'
  FROM product_catalog_sku_links AS link
  JOIN catalog_skus AS catalog
    ON catalog.sku = link.catalog_sku
   AND catalog.brand_id = link.brand_id
 WHERE balance.product_sku_id = link.product_sku_id
   AND balance.brand_id = link.brand_id
   AND balance.available_quantity = 0
   AND balance.reserved_quantity = 0
   AND catalog.available_quantity > 0;
