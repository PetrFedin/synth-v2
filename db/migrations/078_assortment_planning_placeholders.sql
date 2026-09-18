BEGIN;

-- Planning had no object between a campaign and a style: a brand could record what it had built but
-- not what it had set out to build. A Placeholder is that missing slot. It is planned before any
-- style exists and carries only targets -- category, gender, age group, novelty, seasonality, fit,
-- how many colourways, how many units, when it lands, what it must retail for and what it may cost.
-- Styles are then linked to the slot they were developed for, which is what makes plan-versus-fact
-- measurable instead of anecdotal.

CREATE TABLE IF NOT EXISTS product_placeholders (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  campaign_id text NOT NULL REFERENCES campaigns(id),
  placeholder_code text NOT NULL CHECK (placeholder_code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'),
  name_ru text NOT NULL CHECK (length(trim(name_ru)) BETWEEN 2 AND 200),
  name_en text NOT NULL CHECK (length(trim(name_en)) BETWEEN 2 AND 200),
  category_entry_id text NULL,
  category_entry_version integer NULL CHECK (category_entry_version IS NULL OR category_entry_version > 0),
  gender_entry_id text NULL,
  gender_entry_version integer NULL CHECK (gender_entry_version IS NULL OR gender_entry_version > 0),
  age_group_entry_id text NULL,
  age_group_entry_version integer NULL CHECK (age_group_entry_version IS NULL OR age_group_entry_version > 0),
  novelty_entry_id text NULL,
  novelty_entry_version integer NULL CHECK (novelty_entry_version IS NULL OR novelty_entry_version > 0),
  seasonality_entry_id text NULL,
  seasonality_entry_version integer NULL CHECK (seasonality_entry_version IS NULL OR seasonality_entry_version > 0),
  fit_entry_id text NULL,
  fit_entry_version integer NULL CHECK (fit_entry_version IS NULL OR fit_entry_version > 0),
  capsule text NULL CHECK (capsule IS NULL OR length(trim(capsule)) BETWEEN 1 AND 120),
  drop_name text NULL CHECK (drop_name IS NULL OR length(trim(drop_name)) BETWEEN 1 AND 120),
  description text NULL CHECK (description IS NULL OR length(description) <= 2000),
  colourway_count integer NULL CHECK (colourway_count IS NULL OR colourway_count > 0),
  planned_quantity integer NULL CHECK (planned_quantity IS NULL OR planned_quantity > 0),
  launch_at timestamptz NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  recommended_retail_price_minor bigint NULL CHECK (recommended_retail_price_minor IS NULL OR recommended_retail_price_minor >= 0),
  planned_unit_cost_minor bigint NULL CHECK (planned_unit_cost_minor IS NULL OR planned_unit_cost_minor >= 0),
  planned_margin_basis_points integer NULL,
  status text NOT NULL CHECK (status IN ('planned', 'in_development', 'delivered', 'dropped')),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  UNIQUE (brand_id, campaign_id, placeholder_code),
  UNIQUE (id, brand_id),
  CHECK (updated_at >= created_at),
  -- A plan that states a price and a cost states a margin too, and the three must agree. Without
  -- this, a placeholder can claim a margin it does not have and nobody finds out until the season is
  -- costed. The tolerance is one basis point, for integer rounding only.
  CONSTRAINT product_placeholders_margin_consistent CHECK (
    recommended_retail_price_minor IS NULL
    OR planned_unit_cost_minor IS NULL
    OR planned_margin_basis_points IS NULL
    OR (
      recommended_retail_price_minor > 0
      AND planned_unit_cost_minor <= recommended_retail_price_minor
      AND abs(
        planned_margin_basis_points
        - round(((recommended_retail_price_minor - planned_unit_cost_minor)::numeric / recommended_retail_price_minor) * 10000)
      ) <= 1
    )
  ),
  CONSTRAINT product_placeholders_category_version_fk
    FOREIGN KEY (category_entry_id, category_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  CONSTRAINT product_placeholders_gender_version_fk
    FOREIGN KEY (gender_entry_id, gender_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  CONSTRAINT product_placeholders_age_group_version_fk
    FOREIGN KEY (age_group_entry_id, age_group_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  CONSTRAINT product_placeholders_novelty_version_fk
    FOREIGN KEY (novelty_entry_id, novelty_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  CONSTRAINT product_placeholders_seasonality_version_fk
    FOREIGN KEY (seasonality_entry_id, seasonality_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  CONSTRAINT product_placeholders_fit_version_fk
    FOREIGN KEY (fit_entry_id, fit_entry_version) REFERENCES mdm_entry_versions(entry_id, version)
);

CREATE INDEX IF NOT EXISTS product_placeholders_campaign_idx
  ON product_placeholders (campaign_id, status, placeholder_code);
CREATE INDEX IF NOT EXISTS product_placeholders_brand_idx
  ON product_placeholders (brand_id, status);

CREATE TABLE IF NOT EXISTS product_placeholder_style_links (
  id text PRIMARY KEY,
  placeholder_id text NOT NULL,
  style_id text NOT NULL,
  brand_id text NOT NULL REFERENCES organisations(id),
  campaign_id text NOT NULL REFERENCES campaigns(id),
  linked_at timestamptz NOT NULL,
  linked_by text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  -- One slot may be filled by several styles, but a style belongs to one slot: a style developed
  -- against two plans makes both plans unmeasurable.
  UNIQUE (style_id),
  CONSTRAINT product_placeholder_style_links_placeholder_fk
    FOREIGN KEY (placeholder_id, brand_id) REFERENCES product_placeholders(id, brand_id),
  CONSTRAINT product_placeholder_style_links_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE INDEX IF NOT EXISTS product_placeholder_style_links_placeholder_idx
  ON product_placeholder_style_links (placeholder_id);

-- A slot stops being a plan and starts being work the moment the first style is linked to it, and a
-- planned slot that already carries styles would misreport the season. The transition is made here so
-- it cannot be forgotten by a caller.
CREATE OR REPLACE FUNCTION advance_placeholder_on_style_link() RETURNS trigger AS $$
BEGIN
  UPDATE product_placeholders
     SET status = 'in_development',
         version = version + 1,
         updated_at = NEW.linked_at,
         updated_by = NEW.linked_by
   WHERE id = NEW.placeholder_id
     AND status = 'planned';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_placeholder_style_links_advance ON product_placeholder_style_links;
CREATE TRIGGER product_placeholder_style_links_advance
  AFTER INSERT ON product_placeholder_style_links
  FOR EACH ROW EXECUTE FUNCTION advance_placeholder_on_style_link();

COMMIT;
