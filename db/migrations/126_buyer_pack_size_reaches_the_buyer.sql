BEGIN;

-- Кратность упаковки доезжает до байера.
--
-- Миграция 075 заморозила договор: SKU в прайс-листе равен SKU публикации **плюс ровно три**
-- байерские надстройки — цена, валюта и минимальный заказ. Миграция 108 завела кратность упаковки,
-- и `canonical-source.mjs` стал добавлять четвёртую, `buyerPackSize`, а проверка о ней не узнала.
--
-- С того дня **любая** публикация канонического каталога байера отвергалась базой: сравнение
-- «SKU прайс-листа без трёх надстроек равен SKU публикации» не сходилось на лишнем поле. Наружу это
-- выглядело как `HTTP 500 INTERNAL_ERROR` без единой строки в журнале — и таким пролежало до тех
-- пор, пока отказы не научились называть себя (A5). Приёмочный набор `READY Product … BuyerCatalog`
-- был красным ровно поэтому.
--
-- Правильная сторона — та, что добавляет поле: кратность **обязана** дойти до байера, потому что по
-- ней сетка заказа отказывает в количестве не по коробке, и заморожена она вместе с ценой — байер
-- держится той упаковки, которую ему опубликовали, а не той, на которую бренд потом её сменил.
-- Поэтому исправляется проверка, а не писатель.
--
-- Заодно закрыт пробел, который та же невнимательность оставила: четвёртая надстройка **ни с чем не
-- сверялась**. Три остальные обязаны совпадать со строкой прайс-листа, и теперь обязана и она —
-- иначе байеру можно было бы показать одну упаковку в карточке и другую в строке цены.

CREATE OR REPLACE FUNCTION assert_canonical_commercial_price(publication jsonb, price jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  line jsonb;
  source_line jsonb;
  product_sku_id text;
  minor numeric;
  i integer;
  j integer;
  k integer;
  pub_style jsonb;
  price_style jsonb;
  pub_colorway jsonb;
  price_colorway jsonb;
  pub_sku jsonb;
  price_sku jsonb;
  price_line jsonb;
  seen_variants text[] := ARRAY[]::text[];
BEGIN
  IF publication -> 'formatVersion' IS DISTINCT FROM '2'::jsonb
     OR publication ->> 'status' IS DISTINCT FROM 'published'
     OR COALESCE(publication ->> 'commercialProjectionId', '') = ''
     OR COALESCE(publication ->> 'readinessSnapshotId', '') = ''
     OR COALESCE(publication ->> 'styleVersionId', '') = ''
     OR jsonb_typeof(publication -> 'styles') IS DISTINCT FROM 'array'
     OR jsonb_typeof(publication -> 'lines') IS DISTINCT FROM 'array'
     OR jsonb_array_length(publication -> 'styles') < 1
     OR jsonb_array_length(publication -> 'lines') < 1 THEN
    RAISE EXCEPTION 'PRICE_LIST_CANONICAL_PUBLICATION_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF price ->> 'status' IS DISTINCT FROM 'published'
     OR price ->> 'publicationId' IS DISTINCT FROM publication ->> 'id'
     OR price ->> 'brandId' IS DISTINCT FROM publication ->> 'brandId'
     OR price ->> 'currency' IS DISTINCT FROM publication ->> 'currency'
     OR price -> 'commercialProjectionId' IS DISTINCT FROM publication -> 'commercialProjectionId'
     OR price -> 'commercialProjectionVersionNo' IS DISTINCT FROM publication -> 'commercialProjectionVersionNo'
     OR price -> 'commercialProjectionContentHash' IS DISTINCT FROM publication -> 'commercialProjectionContentHash'
     OR price -> 'readinessSnapshotId' IS DISTINCT FROM publication -> 'readinessSnapshotId'
     OR price -> 'styleVersionId' IS DISTINCT FROM publication -> 'styleVersionId'
     OR jsonb_typeof(price -> 'lines') IS DISTINCT FROM 'array'
     OR jsonb_typeof(price -> 'styles') IS DISTINCT FROM 'array'
     OR jsonb_array_length(price -> 'lines') IS DISTINCT FROM jsonb_array_length(publication -> 'lines')
     OR jsonb_array_length(price -> 'styles') IS DISTINCT FROM jsonb_array_length(publication -> 'styles') THEN
    RAISE EXCEPTION 'BUYER_CATALOG_CANONICAL_PRICE_LIST_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(publication -> 'lines') AS item
     WHERE COALESCE(item ->> 'productSkuId', '') = ''
  ) OR EXISTS (
    SELECT 1
      FROM jsonb_array_elements(publication -> 'lines') AS item
     GROUP BY item ->> 'productSkuId'
    HAVING COUNT(*) <> 1
  ) THEN
    RAISE EXCEPTION 'PRICE_LIST_PRODUCT_LINEAGE_INVALID' USING ERRCODE = '23514';
  END IF;

  FOR line IN SELECT value FROM jsonb_array_elements(price -> 'lines') LOOP
    product_sku_id := line ->> 'productSkuId';
    IF COALESCE(product_sku_id, '') = ''
       OR (SELECT COUNT(*) FROM jsonb_array_elements(price -> 'lines') AS item WHERE item ->> 'productSkuId' = product_sku_id) <> 1 THEN
      RAISE EXCEPTION 'BUYER_CATALOG_PRICE_LINE_MISMATCH' USING ERRCODE = '23514';
    END IF;

    SELECT value INTO source_line
      FROM jsonb_array_elements(publication -> 'lines') AS item
     WHERE item ->> 'productSkuId' = product_sku_id;

    IF source_line IS NULL
       OR (line - 'unitPrice' - 'wholesalePriceMinor') IS DISTINCT FROM (source_line - 'unitPrice' - 'wholesalePriceMinor')
       OR jsonb_typeof(line -> 'wholesalePriceMinor') IS DISTINCT FROM 'number'
       OR jsonb_typeof(line -> 'unitPrice') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'BUYER_CATALOG_PRICE_LINE_MISMATCH' USING ERRCODE = '23514';
    END IF;

    minor := (line ->> 'wholesalePriceMinor')::numeric;
    IF minor <= 0
       OR minor <> trunc(minor)
       OR minor > 90071992547409
       OR (line ->> 'unitPrice')::numeric <> minor / 100 THEN
      RAISE EXCEPTION 'BUYER_CATALOG_PRICE_LINE_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- Exact frozen hierarchy equality except for the buyer price decoration on
  -- each ProductSku. Array order is part of the snapshot contract.
  FOR i IN 0..jsonb_array_length(publication -> 'styles') - 1 LOOP
    pub_style := publication -> 'styles' -> i;
    price_style := price -> 'styles' -> i;
    IF COALESCE(pub_style ->> 'styleId', '') = ''
       OR pub_style ->> 'styleVersionId' IS DISTINCT FROM publication ->> 'styleVersionId'
       OR (price_style - 'colorways') IS DISTINCT FROM (pub_style - 'colorways')
       OR jsonb_typeof(pub_style -> 'colorways') IS DISTINCT FROM 'array'
       OR jsonb_typeof(price_style -> 'colorways') IS DISTINCT FROM 'array'
       OR jsonb_array_length(pub_style -> 'colorways') < 1
       OR jsonb_array_length(price_style -> 'colorways') IS DISTINCT FROM jsonb_array_length(pub_style -> 'colorways') THEN
      RAISE EXCEPTION 'BUYER_CATALOG_PRICE_HIERARCHY_MISMATCH' USING ERRCODE = '23514';
    END IF;

    FOR j IN 0..jsonb_array_length(pub_style -> 'colorways') - 1 LOOP
      pub_colorway := pub_style -> 'colorways' -> j;
      price_colorway := price_style -> 'colorways' -> j;
      IF COALESCE(pub_colorway ->> 'colorwayId', '') = ''
         OR (price_colorway - 'skus') IS DISTINCT FROM (pub_colorway - 'skus')
         OR jsonb_typeof(pub_colorway -> 'skus') IS DISTINCT FROM 'array'
         OR jsonb_typeof(price_colorway -> 'skus') IS DISTINCT FROM 'array'
         OR jsonb_array_length(pub_colorway -> 'skus') < 1
         OR jsonb_array_length(price_colorway -> 'skus') IS DISTINCT FROM jsonb_array_length(pub_colorway -> 'skus') THEN
        RAISE EXCEPTION 'BUYER_CATALOG_PRICE_HIERARCHY_MISMATCH' USING ERRCODE = '23514';
      END IF;

      FOR k IN 0..jsonb_array_length(pub_colorway -> 'skus') - 1 LOOP
        pub_sku := pub_colorway -> 'skus' -> k;
        price_sku := price_colorway -> 'skus' -> k;
        product_sku_id := pub_sku ->> 'productSkuId';
        IF COALESCE(product_sku_id, '') = ''
           OR product_sku_id = ANY(seen_variants)
           OR COALESCE(pub_sku ->> 'sizeValueId', '') = ''
           OR pub_sku ->> 'sizeValueId' IS DISTINCT FROM pub_sku #>> '{size,id}'
           OR (price_sku - 'buyerUnitPrice' - 'buyerCurrency' - 'buyerMinimumOrderQuantity' - 'buyerPackSize') IS DISTINCT FROM pub_sku THEN
          RAISE EXCEPTION 'BUYER_CATALOG_PRICE_HIERARCHY_MISMATCH' USING ERRCODE = '23514';
        END IF;
        seen_variants := array_append(seen_variants, product_sku_id);

        SELECT value INTO source_line
          FROM jsonb_array_elements(publication -> 'lines') AS item
         WHERE item ->> 'productSkuId' = product_sku_id;
        IF source_line IS NULL
           OR source_line ->> 'sku' IS DISTINCT FROM pub_sku ->> 'skuCode'
           OR source_line ->> 'styleVersionId' IS DISTINCT FROM pub_style ->> 'styleVersionId'
           OR source_line ->> 'colorwayId' IS DISTINCT FROM pub_colorway ->> 'colorwayId'
           OR source_line ->> 'sizeValueId' IS DISTINCT FROM pub_sku ->> 'sizeValueId'
           OR source_line -> 'catalogVersion' IS DISTINCT FROM publication -> 'commercialProjectionVersionNo'
           OR source_line ->> 'currency' IS DISTINCT FROM publication ->> 'currency'
           OR source_line -> 'wholesalePriceMinor' IS DISTINCT FROM pub_sku #> '{commercialTerms,wholesalePriceMinor}'
           OR source_line -> 'rrpMinor' IS DISTINCT FROM pub_sku #> '{commercialTerms,rrpMinor}'
           OR source_line -> 'minimumOrderQuantity' IS DISTINCT FROM pub_sku #> '{commercialTerms,minimumOrderQuantity}'
           OR source_line -> 'deliveryStart' IS DISTINCT FROM pub_sku #> '{commercialTerms,deliveryStart}'
           OR source_line -> 'deliveryEnd' IS DISTINCT FROM pub_sku #> '{commercialTerms,deliveryEnd}'
           OR source_line -> 'availability' IS DISTINCT FROM pub_sku #> '{commercialTerms,availability}' THEN
          RAISE EXCEPTION 'PRICE_LIST_PRODUCT_LINEAGE_INVALID' USING ERRCODE = '23514';
        END IF;

        SELECT value INTO price_line
          FROM jsonb_array_elements(price -> 'lines') AS item
         WHERE item ->> 'productSkuId' = product_sku_id;
        IF price_line IS NULL
           OR price_sku -> 'buyerUnitPrice' IS DISTINCT FROM price_line -> 'unitPrice'
           OR price_sku ->> 'buyerCurrency' IS DISTINCT FROM price_line ->> 'currency'
           OR price_sku -> 'buyerMinimumOrderQuantity' IS DISTINCT FROM price_line -> 'minimumOrderQuantity'
           OR price_sku -> 'buyerPackSize' IS DISTINCT FROM price_line -> 'packSize' THEN
          RAISE EXCEPTION 'BUYER_CATALOG_PRICE_HIERARCHY_MISMATCH' USING ERRCODE = '23514';
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF cardinality(seen_variants) IS DISTINCT FROM jsonb_array_length(publication -> 'lines') THEN
    RAISE EXCEPTION 'PRICE_LIST_PRODUCT_LINEAGE_INVALID' USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMIT;
