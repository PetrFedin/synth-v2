BEGIN;

CREATE TABLE IF NOT EXISTS organisations (
  id text PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('brand', 'shop')),
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id text NOT NULL UNIQUE,
  organisation_id text NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  organisation_type text NOT NULL CHECK (organisation_type IN ('brand', 'shop')),
  role text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (organisation_id, user_id)
);

CREATE TABLE IF NOT EXISTS counterparty_relationships (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  shop_id text NOT NULL REFERENCES organisations(id),
  status text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  UNIQUE (brand_id, shop_id),
  CHECK (brand_id <> shop_id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  status text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS collections (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id),
  brand_id text NOT NULL REFERENCES organisations(id),
  status text NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS showrooms (
  id text PRIMARY KEY,
  collection_id text NOT NULL REFERENCES collections(id),
  brand_id text NOT NULL REFERENCES organisations(id),
  status text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS showroom_invitations (
  id text PRIMARY KEY,
  showroom_id text NOT NULL REFERENCES showrooms(id) ON DELETE CASCADE,
  relationship_id text NOT NULL REFERENCES counterparty_relationships(id),
  brand_id text NOT NULL REFERENCES organisations(id),
  shop_id text NOT NULL REFERENCES organisations(id),
  status text NOT NULL,
  expires_at timestamptz NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  UNIQUE (showroom_id, shop_id)
);

CREATE TABLE IF NOT EXISTS commercial_cycles (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  shop_id text NOT NULL REFERENCES organisations(id),
  campaign_id text NOT NULL REFERENCES campaigns(id),
  collection_id text NOT NULL REFERENCES collections(id),
  stage text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS selections (
  id text PRIMARY KEY,
  cycle_id text NOT NULL UNIQUE REFERENCES commercial_cycles(id) ON DELETE CASCADE,
  showroom_id text NOT NULL REFERENCES showrooms(id),
  collection_id text NOT NULL REFERENCES collections(id),
  brand_id text NOT NULL REFERENCES organisations(id),
  shop_id text NOT NULL REFERENCES organisations(id),
  status text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  selection_id text NOT NULL UNIQUE REFERENCES selections(id),
  cycle_id text NOT NULL UNIQUE REFERENCES commercial_cycles(id),
  brand_id text NOT NULL REFERENCES organisations(id),
  shop_id text NOT NULL REFERENCES organisations(id),
  status text NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total_amount numeric(20, 4) NOT NULL CHECK (total_amount > 0),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
  id text PRIMARY KEY,
  cycle_id text NOT NULL UNIQUE REFERENCES commercial_cycles(id),
  order_id text NOT NULL UNIQUE REFERENCES orders(id),
  brand_id text NOT NULL REFERENCES organisations(id),
  shop_id text NOT NULL REFERENCES organisations(id),
  status text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_milestones (
  id text PRIMARY KEY,
  owner_organisation_id text NOT NULL REFERENCES organisations(id),
  cycle_id text NOT NULL REFERENCES commercial_cycles(id),
  type text NOT NULL,
  starts_at timestamptz NOT NULL,
  visibility text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS commands (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  actor_id text NOT NULL,
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  aggregate_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'published')),
  event jsonb NOT NULL,
  published_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  source_event_id text NOT NULL,
  recipient_organisation_id text NOT NULL REFERENCES organisations(id),
  type text NOT NULL,
  status text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_projections (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_commands (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  actor_id text NOT NULL,
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS memberships_user_status_idx ON memberships (user_id, status);
CREATE INDEX IF NOT EXISTS relationships_status_trade_idx ON counterparty_relationships (status, brand_id, shop_id);
CREATE INDEX IF NOT EXISTS invitations_shop_status_expiry_idx ON showroom_invitations (shop_id, status, expires_at);
CREATE INDEX IF NOT EXISTS campaigns_brand_status_idx ON campaigns (brand_id, status);
CREATE INDEX IF NOT EXISTS collections_campaign_status_idx ON collections (campaign_id, status);
CREATE INDEX IF NOT EXISTS showrooms_collection_status_idx ON showrooms (collection_id, status);
CREATE INDEX IF NOT EXISTS cycles_trade_stage_idx ON commercial_cycles (brand_id, shop_id, stage);
CREATE INDEX IF NOT EXISTS selections_shop_status_idx ON selections (shop_id, status);
CREATE INDEX IF NOT EXISTS orders_trade_status_idx ON orders (brand_id, shop_id, status);
CREATE INDEX IF NOT EXISTS calendar_owner_starts_idx ON calendar_milestones (owner_organisation_id, starts_at);
CREATE INDEX IF NOT EXISTS outbox_status_idx ON outbox_events (status, id);
CREATE INDEX IF NOT EXISTS notifications_recipient_status_idx ON notifications (recipient_organisation_id, status);

COMMIT;
