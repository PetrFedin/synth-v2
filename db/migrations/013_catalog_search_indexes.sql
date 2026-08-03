-- syntha:migration-mode=online
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_search_sku_prefix_idx
  ON catalog_skus (
    sku text_pattern_ops
  );
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_search_name_prefix_idx
  ON catalog_skus (
    (lower(payload->>'name')) text_pattern_ops,
    sku ASC
  );
