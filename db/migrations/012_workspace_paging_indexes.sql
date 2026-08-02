-- syntha:migration-mode=online
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_memberships_idx
  ON memberships (
    user_id,
    status,
    (payload->>'organisationId') ASC NULLS LAST,
    (payload->>'userId') ASC NULLS LAST,
    id ASC
  ) INCLUDE (organisation_id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_organisations_idx
  ON organisations (
    (payload->>'type') ASC NULLS LAST,
    (payload->>'name') ASC NULLS LAST,
    id ASC
  );
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_relationships_brand_idx
  ON counterparty_relationships (
    brand_id,
    (payload->>'updatedAt') DESC NULLS LAST,
    (payload->>'createdAt') DESC NULLS LAST,
    id ASC
  ) INCLUDE (shop_id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_relationships_shop_idx
  ON counterparty_relationships (
    shop_id,
    (payload->>'updatedAt') DESC NULLS LAST,
    (payload->>'createdAt') DESC NULLS LAST,
    id ASC
  ) INCLUDE (brand_id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_invitations_brand_idx
  ON showroom_invitations (
    brand_id,
    (payload->>'updatedAt') DESC NULLS LAST,
    (payload->>'createdAt') DESC NULLS LAST,
    id ASC
  ) INCLUDE (shop_id, showroom_id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_invitations_shop_idx
  ON showroom_invitations (
    shop_id,
    (payload->>'updatedAt') DESC NULLS LAST,
    (payload->>'createdAt') DESC NULLS LAST,
    id ASC
  ) INCLUDE (brand_id, showroom_id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_campaigns_brand_idx
  ON campaigns (
    brand_id,
    (payload->>'startsAt') DESC NULLS LAST,
    (payload->>'name') ASC NULLS LAST,
    id ASC
  );
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_collections_brand_idx
  ON collections (
    brand_id,
    (payload->>'name') ASC NULLS LAST,
    id ASC
  );
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_catalog_brand_idx
  ON catalog_skus (
    brand_id,
    sku ASC
  );
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_catalog_collection_idx
  ON catalog_skus (
    collection_id,
    sku ASC
  ) WHERE status = 'published';
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_showrooms_brand_idx
  ON showrooms (
    brand_id,
    (payload->>'opensAt') DESC NULLS LAST,
    (payload->>'name') ASC NULLS LAST,
    id ASC
  ) INCLUDE (collection_id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_cycles_brand_idx
  ON commercial_cycles (
    brand_id,
    (payload->>'updatedAt') DESC NULLS LAST,
    (payload->>'createdAt') DESC NULLS LAST,
    id ASC
  ) INCLUDE (shop_id, campaign_id, collection_id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_cycles_shop_idx
  ON commercial_cycles (
    shop_id,
    (payload->>'updatedAt') DESC NULLS LAST,
    (payload->>'createdAt') DESC NULLS LAST,
    id ASC
  ) INCLUDE (brand_id, campaign_id, collection_id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_selections_brand_idx
  ON selections (
    brand_id,
    (payload->>'updatedAt') DESC NULLS LAST,
    (payload->>'createdAt') DESC NULLS LAST,
    id ASC
  ) INCLUDE (shop_id, showroom_id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_selections_shop_idx
  ON selections (
    shop_id,
    (payload->>'updatedAt') DESC NULLS LAST,
    (payload->>'createdAt') DESC NULLS LAST,
    id ASC
  ) INCLUDE (brand_id, showroom_id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_orders_brand_idx
  ON orders (
    brand_id,
    (payload->>'updatedAt') DESC NULLS LAST,
    (payload->>'createdAt') DESC NULLS LAST,
    id ASC
  ) INCLUDE (shop_id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_orders_shop_idx
  ON orders (
    shop_id,
    (payload->>'updatedAt') DESC NULLS LAST,
    (payload->>'createdAt') DESC NULLS LAST,
    id ASC
  ) INCLUDE (brand_id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_deals_brand_idx
  ON deals (
    brand_id,
    (payload->>'updatedAt') DESC NULLS LAST,
    (payload->>'createdAt') DESC NULLS LAST,
    id ASC
  ) INCLUDE (shop_id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_deals_shop_idx
  ON deals (
    shop_id,
    (payload->>'updatedAt') DESC NULLS LAST,
    (payload->>'createdAt') DESC NULLS LAST,
    id ASC
  ) INCLUDE (brand_id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_calendar_owner_idx
  ON calendar_milestones (
    owner_organisation_id,
    (payload->>'startsAt') ASC NULLS LAST,
    id ASC
  );
