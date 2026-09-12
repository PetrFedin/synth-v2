BEGIN;

-- PUB-005 continuation. Migration 075 cut fresh commercial publication outputs
-- over to immutable projection-backed ProductSku truth. This migration closes
-- the next write seam: fresh Selection -> Order -> OrderCommit facts must keep
-- that exact BuyerCatalogVersion lineage. Historical legacy rows remain readable;
-- legacy rows are not rewritten and may stay legacy, but they cannot mint a new
-- canonical Order or OrderCommit.

CREATE FUNCTION assert_canonical_buyer_catalog_reference(buyer_catalog_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  buyer buyer_catalog_versions%ROWTYPE;
  price price_list_versions%ROWTYPE;
  publication commercial_publications%ROWTYPE;
BEGIN
  IF COALESCE(buyer_catalog_id, '') = '' THEN
    RAISE EXCEPTION 'CANONICAL_BUYER_CATALOG_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO buyer
    FROM buyer_catalog_versions
   WHERE id = buyer_catalog_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANONICAL_BUYER_CATALOG_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO price
    FROM price_list_versions
   WHERE id = buyer.price_list_version_id
   FOR SHARE;
  SELECT * INTO publication
    FROM commercial_publications
   WHERE id = buyer.publication_id
   FOR SHARE;

  IF price.id IS NULL OR publication.id IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_BUYER_CATALOG_REQUIRED' USING ERRCODE = '23514';
  END IF;

  PERFORM assert_canonical_commercial_price(publication.payload, price.payload);

  IF buyer.payload ->> 'status' IS DISTINCT FROM 'published'
     OR buyer.payload ->> 'id' IS DISTINCT FROM buyer.id
     OR buyer.payload ->> 'publicationId' IS DISTINCT FROM publication.id
     OR buyer.payload ->> 'priceListVersionId' IS DISTINCT FROM price.id
     OR buyer.payload ->> 'brandId' IS DISTINCT FROM buyer.brand_id
     OR buyer.payload ->> 'shopId' IS DISTINCT FROM buyer.shop_id
     OR buyer.payload ->> 'showroomId' IS DISTINCT FROM buyer.showroom_id
     OR buyer.payload ->> 'accessGrantId' IS DISTINCT FROM buyer.access_grant_id
     OR buyer.payload ->> 'collectionId' IS DISTINCT FROM publication.collection_id
     OR buyer.payload ->> 'currency' IS DISTINCT FROM trim(buyer.currency)
     OR buyer.payload ->> 'contentHash' IS DISTINCT FROM buyer.content_hash
     OR buyer.payload -> 'commercialProjectionId' IS DISTINCT FROM price.payload -> 'commercialProjectionId'
     OR buyer.payload -> 'commercialProjectionVersionNo' IS DISTINCT FROM price.payload -> 'commercialProjectionVersionNo'
     OR buyer.payload -> 'commercialProjectionContentHash' IS DISTINCT FROM price.payload -> 'commercialProjectionContentHash'
     OR buyer.payload -> 'readinessSnapshotId' IS DISTINCT FROM price.payload -> 'readinessSnapshotId'
     OR buyer.payload -> 'styleVersionId' IS DISTINCT FROM price.payload -> 'styleVersionId'
     OR buyer.payload -> 'lines' IS DISTINCT FROM price.payload -> 'lines'
     OR buyer.payload -> 'styles' IS DISTINCT FROM price.payload -> 'styles' THEN
    RAISE EXCEPTION 'CANONICAL_BUYER_CATALOG_REQUIRED' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION assert_canonical_selection_lines(selection_payload jsonb, buyer_catalog_payload jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  line jsonb;
  price_line jsonb;
  style_snapshot jsonb;
  colorway_snapshot jsonb;
  sku_snapshot jsonb;
  product_sku_id text;
  price_count integer;
  variant_count integer;
  quantity numeric;
  minimum_quantity numeric;
  available_quantity numeric;
BEGIN
  IF jsonb_typeof(selection_payload -> 'lines') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'SELECTION_CANONICAL_LINES_INVALID' USING ERRCODE = '23514';
  END IF;
  IF selection_payload ->> 'status' = 'submitted'
     AND jsonb_array_length(selection_payload -> 'lines') < 1 THEN
    RAISE EXCEPTION 'SELECTION_CANONICAL_LINES_INVALID' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(selection_payload -> 'lines') AS item
     WHERE COALESCE(item ->> 'productSkuId', '') = ''
  ) OR EXISTS (
    SELECT 1
      FROM jsonb_array_elements(selection_payload -> 'lines') AS item
     GROUP BY item ->> 'productSkuId'
    HAVING COUNT(*) <> 1
  ) THEN
    RAISE EXCEPTION 'SELECTION_CANONICAL_PRODUCT_SKU_INVALID' USING ERRCODE = '23514';
  END IF;

  FOR line IN SELECT value FROM jsonb_array_elements(selection_payload -> 'lines') LOOP
    product_sku_id := line ->> 'productSkuId';

    SELECT COUNT(*) INTO price_count
      FROM jsonb_array_elements(buyer_catalog_payload -> 'lines') AS item
     WHERE item ->> 'productSkuId' = product_sku_id;
    IF price_count <> 1 THEN
      RAISE EXCEPTION 'SELECTION_CANONICAL_LINE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    SELECT value INTO price_line
      FROM jsonb_array_elements(buyer_catalog_payload -> 'lines') AS item
     WHERE item ->> 'productSkuId' = product_sku_id;

    SELECT COUNT(*) INTO variant_count
      FROM jsonb_array_elements(buyer_catalog_payload -> 'styles') AS style_item
      CROSS JOIN LATERAL jsonb_array_elements(style_item.value -> 'colorways') AS colorway_item
      CROSS JOIN LATERAL jsonb_array_elements(colorway_item.value -> 'skus') AS sku_item
     WHERE sku_item.value ->> 'productSkuId' = product_sku_id;
    IF variant_count <> 1 THEN
      RAISE EXCEPTION 'SELECTION_CANONICAL_LINE_MISMATCH' USING ERRCODE = '23514';
    END IF;

    SELECT style_item.value, colorway_item.value, sku_item.value
      INTO style_snapshot, colorway_snapshot, sku_snapshot
      FROM jsonb_array_elements(buyer_catalog_payload -> 'styles') AS style_item
      CROSS JOIN LATERAL jsonb_array_elements(style_item.value -> 'colorways') AS colorway_item
      CROSS JOIN LATERAL jsonb_array_elements(colorway_item.value -> 'skus') AS sku_item
     WHERE sku_item.value ->> 'productSkuId' = product_sku_id
     LIMIT 1;

    IF line ->> 'sku' IS DISTINCT FROM price_line ->> 'sku'
       OR line ->> 'productSkuId' IS DISTINCT FROM price_line ->> 'productSkuId'
       OR line ->> 'styleId' IS DISTINCT FROM style_snapshot ->> 'styleId'
       OR line ->> 'styleVersionId' IS DISTINCT FROM style_snapshot ->> 'styleVersionId'
       OR line ->> 'styleVersionId' IS DISTINCT FROM price_line ->> 'styleVersionId'
       OR line ->> 'colorwayId' IS DISTINCT FROM colorway_snapshot ->> 'colorwayId'
       OR line ->> 'colorwayId' IS DISTINCT FROM price_line ->> 'colorwayId'
       OR line ->> 'sizeValueId' IS DISTINCT FROM sku_snapshot ->> 'sizeValueId'
       OR line ->> 'sizeValueId' IS DISTINCT FROM price_line ->> 'sizeValueId'
       OR line ->> 'sizeCode' IS DISTINCT FROM sku_snapshot #>> '{size,code}'
       OR line ->> 'sizeLabelRu' IS DISTINCT FROM COALESCE(sku_snapshot #>> '{size,labelRu}', sku_snapshot #>> '{size,code}')
       OR line ->> 'sizeLabelEn' IS DISTINCT FROM COALESCE(sku_snapshot #>> '{size,labelEn}', sku_snapshot #>> '{size,code}')
       OR line -> 'sizeSortOrder' IS DISTINCT FROM sku_snapshot #> '{size,sortOrder}'
       OR COALESCE(line -> 'gtin', 'null'::jsonb) IS DISTINCT FROM COALESCE(sku_snapshot -> 'gtin', 'null'::jsonb)
       OR line -> 'unitPrice' IS DISTINCT FROM price_line -> 'unitPrice'
       OR line ->> 'currency' IS DISTINCT FROM price_line ->> 'currency'
       OR line -> 'catalogVersion' IS DISTINCT FROM price_line -> 'catalogVersion' THEN
      RAISE EXCEPTION 'SELECTION_CANONICAL_LINE_MISMATCH' USING ERRCODE = '23514';
    END IF;

    IF COALESCE(line ->> 'quantity', '') !~ '^[1-9][0-9]*$'
       OR COALESCE(price_line ->> 'minimumOrderQuantity', '') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'SELECTION_CANONICAL_QUANTITY_INVALID' USING ERRCODE = '23514';
    END IF;
    quantity := (line ->> 'quantity')::numeric;
    minimum_quantity := (price_line ->> 'minimumOrderQuantity')::numeric;
    IF quantity < minimum_quantity THEN
      RAISE EXCEPTION 'SELECTION_CANONICAL_QUANTITY_INVALID' USING ERRCODE = '23514';
    END IF;
    IF price_line #>> '{availability,mode}' = 'available_to_sell' THEN
      IF COALESCE(price_line #>> '{availability,quantity}', '') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'SELECTION_CANONICAL_QUANTITY_INVALID' USING ERRCODE = '23514';
      END IF;
      available_quantity := (price_line #>> '{availability,quantity}')::numeric;
      IF quantity > available_quantity THEN
        RAISE EXCEPTION 'SELECTION_CANONICAL_QUANTITY_INVALID' USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION assert_canonical_order_lines(order_payload jsonb, selection_payload jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  order_line jsonb;
  selection_line jsonb;
  product_sku_id text;
  matches integer;
  total numeric := 0;
BEGIN
  IF jsonb_typeof(order_payload -> 'lines') IS DISTINCT FROM 'array'
     OR jsonb_typeof(selection_payload -> 'lines') IS DISTINCT FROM 'array'
     OR jsonb_array_length(order_payload -> 'lines') IS DISTINCT FROM jsonb_array_length(selection_payload -> 'lines')
     OR jsonb_array_length(order_payload -> 'lines') < 1 THEN
    RAISE EXCEPTION 'ORDER_CANONICAL_LINES_INVALID' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(order_payload -> 'lines') AS item
     WHERE COALESCE(item ->> 'productSkuId', '') = ''
  ) OR EXISTS (
    SELECT 1
      FROM jsonb_array_elements(order_payload -> 'lines') AS item
     GROUP BY item ->> 'productSkuId'
    HAVING COUNT(*) <> 1
  ) THEN
    RAISE EXCEPTION 'ORDER_CANONICAL_PRODUCT_SKU_INVALID' USING ERRCODE = '23514';
  END IF;

  FOR order_line IN SELECT value FROM jsonb_array_elements(order_payload -> 'lines') LOOP
    product_sku_id := order_line ->> 'productSkuId';
    SELECT COUNT(*) INTO matches
      FROM jsonb_array_elements(selection_payload -> 'lines') AS item
     WHERE item ->> 'productSkuId' = product_sku_id;
    IF matches <> 1 THEN
      RAISE EXCEPTION 'ORDER_CANONICAL_LINE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    SELECT value INTO selection_line
      FROM jsonb_array_elements(selection_payload -> 'lines') AS item
     WHERE item ->> 'productSkuId' = product_sku_id;

    IF jsonb_build_object(
         'sku', order_line -> 'sku',
         'productSkuId', order_line -> 'productSkuId',
         'gtin', COALESCE(order_line -> 'gtin', 'null'::jsonb),
         'styleId', order_line -> 'styleId',
         'styleVersionId', order_line -> 'styleVersionId',
         'colorwayId', order_line -> 'colorwayId',
         'sizeValueId', order_line -> 'sizeValueId',
         'sizeCode', order_line -> 'sizeCode',
         'sizeLabelRu', order_line -> 'sizeLabelRu',
         'sizeLabelEn', order_line -> 'sizeLabelEn',
         'sizeSortOrder', order_line -> 'sizeSortOrder',
         'quantity', order_line -> 'quantity',
         'unitPrice', order_line -> 'unitPrice',
         'catalogVersion', order_line -> 'catalogVersion'
       ) IS DISTINCT FROM jsonb_build_object(
         'sku', selection_line -> 'sku',
         'productSkuId', selection_line -> 'productSkuId',
         'gtin', COALESCE(selection_line -> 'gtin', 'null'::jsonb),
         'styleId', selection_line -> 'styleId',
         'styleVersionId', selection_line -> 'styleVersionId',
         'colorwayId', selection_line -> 'colorwayId',
         'sizeValueId', selection_line -> 'sizeValueId',
         'sizeCode', selection_line -> 'sizeCode',
         'sizeLabelRu', selection_line -> 'sizeLabelRu',
         'sizeLabelEn', selection_line -> 'sizeLabelEn',
         'sizeSortOrder', selection_line -> 'sizeSortOrder',
         'quantity', selection_line -> 'quantity',
         'unitPrice', selection_line -> 'unitPrice',
         'catalogVersion', selection_line -> 'catalogVersion'
       ) THEN
      RAISE EXCEPTION 'ORDER_CANONICAL_LINE_MISMATCH' USING ERRCODE = '23514';
    END IF;

    IF COALESCE(order_line ->> 'quantity', '') !~ '^[1-9][0-9]*$'
       OR jsonb_typeof(order_line -> 'unitPrice') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'ORDER_CANONICAL_LINE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    total := total + ((order_line ->> 'quantity')::numeric * (order_line ->> 'unitPrice')::numeric);
  END LOOP;

  IF jsonb_typeof(order_payload -> 'totalAmount') IS DISTINCT FROM 'number'
     OR (order_payload ->> 'totalAmount')::numeric IS DISTINCT FROM total THEN
    RAISE EXCEPTION 'ORDER_CANONICAL_TOTAL_MISMATCH' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION assert_canonical_commit_lines(commit_payload jsonb, order_payload jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  commit_line jsonb;
  order_line jsonb;
  product_sku_id text;
  matches integer;
BEGIN
  IF jsonb_typeof(commit_payload -> 'lines') IS DISTINCT FROM 'array'
     OR jsonb_typeof(order_payload -> 'lines') IS DISTINCT FROM 'array'
     OR jsonb_array_length(commit_payload -> 'lines') IS DISTINCT FROM jsonb_array_length(order_payload -> 'lines')
     OR jsonb_array_length(commit_payload -> 'lines') < 1 THEN
    RAISE EXCEPTION 'ORDER_COMMIT_CANONICAL_LINES_INVALID' USING ERRCODE = '23514';
  END IF;

  FOR commit_line IN SELECT value FROM jsonb_array_elements(commit_payload -> 'lines') LOOP
    product_sku_id := commit_line ->> 'productSkuId';
    IF COALESCE(product_sku_id, '') = '' THEN
      RAISE EXCEPTION 'ORDER_COMMIT_CANONICAL_LINE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    SELECT COUNT(*) INTO matches
      FROM jsonb_array_elements(order_payload -> 'lines') AS item
     WHERE item ->> 'productSkuId' = product_sku_id;
    IF matches <> 1 THEN
      RAISE EXCEPTION 'ORDER_COMMIT_CANONICAL_LINE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    SELECT value INTO order_line
      FROM jsonb_array_elements(order_payload -> 'lines') AS item
     WHERE item ->> 'productSkuId' = product_sku_id;

    IF jsonb_build_object(
         'sku', commit_line -> 'sku',
         'productSkuId', commit_line -> 'productSkuId',
         'gtin', COALESCE(commit_line -> 'gtin', 'null'::jsonb),
         'styleId', commit_line -> 'styleId',
         'styleVersionId', commit_line -> 'styleVersionId',
         'colorwayId', commit_line -> 'colorwayId',
         'sizeValueId', commit_line -> 'sizeValueId',
         'sizeCode', commit_line -> 'sizeCode',
         'sizeLabelRu', commit_line -> 'sizeLabelRu',
         'sizeLabelEn', commit_line -> 'sizeLabelEn',
         'sizeSortOrder', commit_line -> 'sizeSortOrder',
         'quantity', commit_line -> 'quantity',
         'unitPrice', commit_line -> 'unitPrice',
         'catalogVersion', commit_line -> 'catalogVersion'
       ) IS DISTINCT FROM jsonb_build_object(
         'sku', order_line -> 'sku',
         'productSkuId', order_line -> 'productSkuId',
         'gtin', COALESCE(order_line -> 'gtin', 'null'::jsonb),
         'styleId', order_line -> 'styleId',
         'styleVersionId', order_line -> 'styleVersionId',
         'colorwayId', order_line -> 'colorwayId',
         'sizeValueId', order_line -> 'sizeValueId',
         'sizeCode', order_line -> 'sizeCode',
         'sizeLabelRu', order_line -> 'sizeLabelRu',
         'sizeLabelEn', order_line -> 'sizeLabelEn',
         'sizeSortOrder', order_line -> 'sizeSortOrder',
         'quantity', order_line -> 'quantity',
         'unitPrice', order_line -> 'unitPrice',
         'catalogVersion', order_line -> 'catalogVersion'
       ) THEN
      RAISE EXCEPTION 'ORDER_COMMIT_CANONICAL_LINE_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION validate_canonical_selection_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  buyer buyer_catalog_versions%ROWTYPE;
  buyer_catalog_id text;
BEGIN
  buyer_catalog_id := NEW.payload ->> 'buyerCatalogVersionId';

  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.payload ->> 'buyerCatalogVersionId', '') = ''
     AND COALESCE(buyer_catalog_id, '') = '' THEN
    RETURN NEW;
  END IF;

  PERFORM assert_canonical_buyer_catalog_reference(buyer_catalog_id);
  SELECT * INTO buyer FROM buyer_catalog_versions WHERE id = buyer_catalog_id FOR SHARE;

  IF NEW.payload ->> 'id' IS DISTINCT FROM NEW.id
     OR NEW.payload ->> 'cycleId' IS DISTINCT FROM NEW.cycle_id
     OR NEW.payload ->> 'showroomId' IS DISTINCT FROM NEW.showroom_id
     OR NEW.payload ->> 'collectionId' IS DISTINCT FROM NEW.collection_id
     OR NEW.payload ->> 'brandId' IS DISTINCT FROM NEW.brand_id
     OR NEW.payload ->> 'shopId' IS DISTINCT FROM NEW.shop_id
     OR NEW.payload ->> 'status' IS DISTINCT FROM NEW.status
     OR NEW.payload ->> 'commercialPublicationId' IS DISTINCT FROM buyer.publication_id
     OR NEW.payload ->> 'priceListVersionId' IS DISTINCT FROM buyer.price_list_version_id
     OR NEW.payload ->> 'buyerCatalogVersionId' IS DISTINCT FROM buyer.id
     OR NEW.payload ->> 'commercialBasisHash' IS DISTINCT FROM buyer.content_hash
     OR NEW.payload ->> 'accessGrantId' IS DISTINCT FROM buyer.access_grant_id
     OR NEW.payload ->> 'commercialProjectionId' IS DISTINCT FROM buyer.payload ->> 'commercialProjectionId'
     OR NEW.payload -> 'commercialProjectionVersionNo' IS DISTINCT FROM buyer.payload -> 'commercialProjectionVersionNo'
     OR NEW.payload ->> 'commercialProjectionContentHash' IS DISTINCT FROM buyer.payload ->> 'commercialProjectionContentHash'
     OR NEW.payload ->> 'readinessSnapshotId' IS DISTINCT FROM buyer.payload ->> 'readinessSnapshotId'
     OR NEW.payload ->> 'styleVersionId' IS DISTINCT FROM buyer.payload ->> 'styleVersionId'
     OR NEW.collection_id IS DISTINCT FROM buyer.payload ->> 'collectionId'
     OR NEW.brand_id IS DISTINCT FROM buyer.brand_id
     OR NEW.shop_id IS DISTINCT FROM buyer.shop_id
     OR NEW.showroom_id IS DISTINCT FROM buyer.showroom_id
     OR COALESCE(NEW.payload ->> 'retailDoorId', '') = ''
     OR COALESCE(NEW.payload ->> 'retailDoorVersion', '') !~ '^[1-9][0-9]*$'
     OR NEW.payload #>> '{buyerCommercialSnapshot,retailDoorId}' IS DISTINCT FROM NEW.payload ->> 'retailDoorId'
     OR NEW.payload #>> '{buyerCommercialSnapshot,retailDoorVersion}' IS DISTINCT FROM NEW.payload ->> 'retailDoorVersion'
     OR NEW.payload #>> '{buyerCommercialSnapshot,organisationId}' IS DISTINCT FROM NEW.shop_id THEN
    RAISE EXCEPTION 'SELECTION_CANONICAL_BASIS_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.payload ->> 'buyerCatalogVersionId', '') <> ''
     AND jsonb_build_object(
       'commercialPublicationId', NEW.payload -> 'commercialPublicationId',
       'priceListVersionId', NEW.payload -> 'priceListVersionId',
       'buyerCatalogVersionId', NEW.payload -> 'buyerCatalogVersionId',
       'commercialBasisHash', NEW.payload -> 'commercialBasisHash',
       'accessGrantId', NEW.payload -> 'accessGrantId',
       'commercialProjectionId', NEW.payload -> 'commercialProjectionId',
       'commercialProjectionVersionNo', NEW.payload -> 'commercialProjectionVersionNo',
       'commercialProjectionContentHash', NEW.payload -> 'commercialProjectionContentHash',
       'readinessSnapshotId', NEW.payload -> 'readinessSnapshotId',
       'styleVersionId', NEW.payload -> 'styleVersionId',
       'retailDoorId', NEW.payload -> 'retailDoorId',
       'retailDoorVersion', NEW.payload -> 'retailDoorVersion',
       'buyerCommercialSnapshot', NEW.payload -> 'buyerCommercialSnapshot'
     ) IS DISTINCT FROM jsonb_build_object(
       'commercialPublicationId', OLD.payload -> 'commercialPublicationId',
       'priceListVersionId', OLD.payload -> 'priceListVersionId',
       'buyerCatalogVersionId', OLD.payload -> 'buyerCatalogVersionId',
       'commercialBasisHash', OLD.payload -> 'commercialBasisHash',
       'accessGrantId', OLD.payload -> 'accessGrantId',
       'commercialProjectionId', OLD.payload -> 'commercialProjectionId',
       'commercialProjectionVersionNo', OLD.payload -> 'commercialProjectionVersionNo',
       'commercialProjectionContentHash', OLD.payload -> 'commercialProjectionContentHash',
       'readinessSnapshotId', OLD.payload -> 'readinessSnapshotId',
       'styleVersionId', OLD.payload -> 'styleVersionId',
       'retailDoorId', OLD.payload -> 'retailDoorId',
       'retailDoorVersion', OLD.payload -> 'retailDoorVersion',
       'buyerCommercialSnapshot', OLD.payload -> 'buyerCommercialSnapshot'
     ) THEN
    RAISE EXCEPTION 'SELECTION_CANONICAL_BASIS_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  PERFORM assert_canonical_selection_lines(NEW.payload, buyer.payload);
  RETURN NEW;
END;
$$;

CREATE FUNCTION validate_canonical_order_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  selection selections%ROWTYPE;
  buyer buyer_catalog_versions%ROWTYPE;
  buyer_catalog_id text;
BEGIN
  buyer_catalog_id := NEW.payload ->> 'buyerCatalogVersionId';

  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.payload ->> 'buyerCatalogVersionId', '') = ''
     AND COALESCE(buyer_catalog_id, '') = '' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO selection FROM selections WHERE id = NEW.selection_id FOR SHARE;
  IF selection.id IS NULL
     OR selection.status IS DISTINCT FROM 'submitted'
     OR COALESCE(selection.payload ->> 'buyerCatalogVersionId', '') = '' THEN
    RAISE EXCEPTION 'ORDER_CANONICAL_SELECTION_REQUIRED' USING ERRCODE = '23514';
  END IF;

  PERFORM assert_canonical_buyer_catalog_reference(selection.payload ->> 'buyerCatalogVersionId');
  SELECT * INTO buyer
    FROM buyer_catalog_versions
   WHERE id = selection.payload ->> 'buyerCatalogVersionId'
   FOR SHARE;
  PERFORM assert_canonical_selection_lines(selection.payload, buyer.payload);

  IF NEW.payload ->> 'id' IS DISTINCT FROM NEW.id
     OR NEW.payload ->> 'selectionId' IS DISTINCT FROM NEW.selection_id
     OR NEW.payload ->> 'cycleId' IS DISTINCT FROM NEW.cycle_id
     OR NEW.payload ->> 'brandId' IS DISTINCT FROM NEW.brand_id
     OR NEW.payload ->> 'shopId' IS DISTINCT FROM NEW.shop_id
     OR NEW.payload ->> 'status' IS DISTINCT FROM NEW.status
     OR NEW.payload ->> 'currency' IS DISTINCT FROM trim(NEW.currency)
     OR NEW.payload ->> 'commercialPublicationId' IS DISTINCT FROM selection.payload ->> 'commercialPublicationId'
     OR NEW.payload ->> 'priceListVersionId' IS DISTINCT FROM selection.payload ->> 'priceListVersionId'
     OR NEW.payload ->> 'buyerCatalogVersionId' IS DISTINCT FROM selection.payload ->> 'buyerCatalogVersionId'
     OR NEW.payload ->> 'commercialBasisHash' IS DISTINCT FROM selection.payload ->> 'commercialBasisHash'
     OR NEW.payload ->> 'accessGrantId' IS DISTINCT FROM selection.payload ->> 'accessGrantId'
     OR NEW.payload -> 'commercialProjectionId' IS DISTINCT FROM selection.payload -> 'commercialProjectionId'
     OR NEW.payload -> 'commercialProjectionVersionNo' IS DISTINCT FROM selection.payload -> 'commercialProjectionVersionNo'
     OR NEW.payload -> 'commercialProjectionContentHash' IS DISTINCT FROM selection.payload -> 'commercialProjectionContentHash'
     OR NEW.payload -> 'readinessSnapshotId' IS DISTINCT FROM selection.payload -> 'readinessSnapshotId'
     OR NEW.payload -> 'styleVersionId' IS DISTINCT FROM selection.payload -> 'styleVersionId'
     OR NEW.payload -> 'retailDoorId' IS DISTINCT FROM selection.payload -> 'retailDoorId'
     OR NEW.payload -> 'retailDoorVersion' IS DISTINCT FROM selection.payload -> 'retailDoorVersion'
     OR NEW.payload -> 'buyerCommercialSnapshot' IS DISTINCT FROM selection.payload -> 'buyerCommercialSnapshot'
     OR trim(NEW.currency) IS DISTINCT FROM trim(buyer.currency) THEN
    RAISE EXCEPTION 'ORDER_CANONICAL_BASIS_MISMATCH' USING ERRCODE = '23514';
  END IF;

  PERFORM assert_canonical_order_lines(NEW.payload, selection.payload);
  IF NEW.total_amount IS DISTINCT FROM (NEW.payload ->> 'totalAmount')::numeric THEN
    RAISE EXCEPTION 'ORDER_CANONICAL_TOTAL_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION validate_canonical_order_commit_new_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  order_row orders%ROWTYPE;
  selection selections%ROWTYPE;
  buyer buyer_catalog_versions%ROWTYPE;
BEGIN
  SELECT * INTO order_row FROM orders WHERE id = NEW.order_id FOR SHARE;
  IF order_row.id IS NULL OR COALESCE(order_row.payload ->> 'buyerCatalogVersionId', '') = '' THEN
    RAISE EXCEPTION 'ORDER_COMMIT_CANONICAL_ORDER_REQUIRED' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO selection FROM selections WHERE id = order_row.selection_id FOR SHARE;
  IF selection.id IS NULL OR COALESCE(selection.payload ->> 'buyerCatalogVersionId', '') = '' THEN
    RAISE EXCEPTION 'ORDER_COMMIT_CANONICAL_SELECTION_REQUIRED' USING ERRCODE = '23514';
  END IF;

  PERFORM assert_canonical_buyer_catalog_reference(order_row.payload ->> 'buyerCatalogVersionId');
  SELECT * INTO buyer
    FROM buyer_catalog_versions
   WHERE id = order_row.payload ->> 'buyerCatalogVersionId'
   FOR SHARE;
  PERFORM assert_canonical_selection_lines(selection.payload, buyer.payload);
  PERFORM assert_canonical_order_lines(order_row.payload, selection.payload);

  IF order_row.status IS DISTINCT FROM 'ready'
     OR NEW.order_version IS DISTINCT FROM order_row.version + 1
     OR NEW.payload ->> 'id' IS DISTINCT FROM NEW.id
     OR NEW.payload ->> 'orderId' IS DISTINCT FROM NEW.order_id
     OR NEW.payload -> 'orderVersion' IS DISTINCT FROM to_jsonb(NEW.order_version)
     OR NEW.payload ->> 'selectionId' IS DISTINCT FROM order_row.selection_id
     OR NEW.payload ->> 'cycleId' IS DISTINCT FROM order_row.cycle_id
     OR NEW.payload ->> 'brandId' IS DISTINCT FROM NEW.brand_id
     OR NEW.payload ->> 'shopId' IS DISTINCT FROM NEW.shop_id
     OR NEW.payload ->> 'status' IS DISTINCT FROM 'committed'
     OR NEW.payload ->> 'currency' IS DISTINCT FROM trim(NEW.currency)
     OR NEW.payload ->> 'contentHash' IS DISTINCT FROM NEW.content_hash
     OR NEW.payload ->> 'commercialPublicationId' IS DISTINCT FROM order_row.payload ->> 'commercialPublicationId'
     OR NEW.payload ->> 'priceListVersionId' IS DISTINCT FROM order_row.payload ->> 'priceListVersionId'
     OR NEW.payload ->> 'buyerCatalogVersionId' IS DISTINCT FROM order_row.payload ->> 'buyerCatalogVersionId'
     OR NEW.payload ->> 'commercialBasisHash' IS DISTINCT FROM order_row.payload ->> 'commercialBasisHash'
     OR NEW.payload ->> 'accessGrantId' IS DISTINCT FROM order_row.payload ->> 'accessGrantId'
     OR NEW.payload -> 'commercialProjectionId' IS DISTINCT FROM order_row.payload -> 'commercialProjectionId'
     OR NEW.payload -> 'commercialProjectionVersionNo' IS DISTINCT FROM order_row.payload -> 'commercialProjectionVersionNo'
     OR NEW.payload -> 'commercialProjectionContentHash' IS DISTINCT FROM order_row.payload -> 'commercialProjectionContentHash'
     OR NEW.payload -> 'readinessSnapshotId' IS DISTINCT FROM order_row.payload -> 'readinessSnapshotId'
     OR NEW.payload -> 'styleVersionId' IS DISTINCT FROM order_row.payload -> 'styleVersionId'
     OR NEW.payload -> 'retailDoorId' IS DISTINCT FROM order_row.payload -> 'retailDoorId'
     OR NEW.payload -> 'retailDoorVersion' IS DISTINCT FROM order_row.payload -> 'retailDoorVersion'
     OR NEW.payload -> 'buyerCommercialSnapshot' IS DISTINCT FROM order_row.payload -> 'buyerCommercialSnapshot'
     OR NEW.payload -> 'terms' IS DISTINCT FROM order_row.payload -> 'terms'
     OR NEW.payload -> 'acceptedOrganisationIds' IS DISTINCT FROM order_row.payload -> 'acceptedOrganisationIds'
     OR NEW.payload -> 'totalAmount' IS DISTINCT FROM order_row.payload -> 'totalAmount'
     OR NEW.brand_id IS DISTINCT FROM order_row.brand_id
     OR NEW.shop_id IS DISTINCT FROM order_row.shop_id
     OR trim(NEW.currency) IS DISTINCT FROM trim(order_row.currency) THEN
    RAISE EXCEPTION 'ORDER_COMMIT_CANONICAL_BASIS_MISMATCH' USING ERRCODE = '23514';
  END IF;

  PERFORM assert_canonical_commit_lines(NEW.payload, order_row.payload);
  RETURN NEW;
END;
$$;

CREATE TRIGGER selections_000_canonical_new_write
BEFORE INSERT ON selections
FOR EACH ROW EXECUTE FUNCTION validate_canonical_selection_write();

CREATE TRIGGER selections_010_canonical_update
BEFORE UPDATE OF payload, status ON selections
FOR EACH ROW EXECUTE FUNCTION validate_canonical_selection_write();

CREATE TRIGGER orders_000_canonical_new_write
BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION validate_canonical_order_write();

CREATE TRIGGER orders_010_canonical_update
BEFORE UPDATE OF payload, status, currency, total_amount, order_commit_snapshot_id ON orders
FOR EACH ROW EXECUTE FUNCTION validate_canonical_order_write();

CREATE TRIGGER order_commit_000_canonical_new_write
BEFORE INSERT ON order_commit_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_canonical_order_commit_new_write();

COMMENT ON FUNCTION assert_canonical_buyer_catalog_reference(text) IS
  'PUB-005: downstream new writes may reference only projection-backed V2 BuyerCatalogVersion truth validated against its immutable Publication/PriceList snapshots.';
COMMENT ON FUNCTION assert_canonical_selection_lines(jsonb, jsonb) IS
  'PUB-005: canonical Selection lines are keyed by ProductSku and must exactly match the pinned BuyerCatalogVersion hierarchy, price, MOQ and frozen availability.';
COMMENT ON FUNCTION assert_canonical_order_lines(jsonb, jsonb) IS
  'PUB-005: canonical Order economics are copied from submitted ProductSku Selection lines without live catalog re-resolution.';
COMMENT ON FUNCTION assert_canonical_commit_lines(jsonb, jsonb) IS
  'PUB-005: immutable OrderCommit line identity/economics must equal the ready Order by ProductSku, even when display SKU text collides.';

COMMIT;