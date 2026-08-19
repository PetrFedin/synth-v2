BEGIN;

-- Measurement Charts created before Product Identity V2 remain readable as legacy
-- compatibility records. New canonical charts are keyed by immutable Product
-- Identity lineage and governed MDM references instead of catalog_skus.
ALTER TABLE measurement_charts
  DROP CONSTRAINT IF EXISTS measurement_charts_sku_fkey;

ALTER TABLE measurement_charts
  DROP CONSTRAINT IF EXISTS measurement_charts_unit_check;

ALTER TABLE measurement_charts
  ALTER COLUMN sku DROP NOT NULL,
  ALTER COLUMN sku_version DROP NOT NULL;

ALTER TABLE measurement_charts
  ADD COLUMN IF NOT EXISTS style_version_id text NULL,
  ADD COLUMN IF NOT EXISTS colorway_id text NULL,
  ADD COLUMN IF NOT EXISTS size_scale_version_id text NULL,
  ADD COLUMN IF NOT EXISTS measurement_unit_entry_id text NULL,
  ADD COLUMN IF NOT EXISTS measurement_unit_entry_version integer NULL,
  ADD COLUMN IF NOT EXISTS base_size_value_id text NULL;

ALTER TABLE measurement_charts
  ADD CONSTRAINT measurement_charts_style_version_fk
    FOREIGN KEY (style_version_id, brand_id) REFERENCES product_style_versions(id, brand_id),
  ADD CONSTRAINT measurement_charts_colorway_fk
    FOREIGN KEY (colorway_id, style_version_id, brand_id) REFERENCES product_colorways(id, style_version_id, brand_id),
  ADD CONSTRAINT measurement_charts_size_scale_version_fk
    FOREIGN KEY (size_scale_version_id, brand_id) REFERENCES product_size_scale_versions(id, brand_id),
  ADD CONSTRAINT measurement_charts_unit_mdm_fk
    FOREIGN KEY (measurement_unit_entry_id, measurement_unit_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  ADD CONSTRAINT measurement_charts_base_size_value_fk
    FOREIGN KEY (base_size_value_id, brand_id) REFERENCES product_size_values(id, brand_id),
  ADD CONSTRAINT measurement_charts_unit_pair_check CHECK (
    (measurement_unit_entry_id IS NULL AND measurement_unit_entry_version IS NULL)
    OR (measurement_unit_entry_id IS NOT NULL AND measurement_unit_entry_version IS NOT NULL AND measurement_unit_entry_version > 0)
  ),
  ADD CONSTRAINT measurement_charts_identity_kind_check CHECK (
    (
      sku IS NOT NULL
      AND sku_version IS NOT NULL
      AND style_version_id IS NULL
      AND colorway_id IS NULL
      AND size_scale_version_id IS NULL
      AND measurement_unit_entry_id IS NULL
      AND measurement_unit_entry_version IS NULL
      AND base_size_value_id IS NULL
    )
    OR
    (
      sku IS NULL
      AND sku_version IS NULL
      AND style_version_id IS NOT NULL
      AND colorway_id IS NOT NULL
      AND size_scale_version_id IS NOT NULL
      AND measurement_unit_entry_id IS NOT NULL
      AND measurement_unit_entry_version IS NOT NULL
      AND base_size_value_id IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS measurement_charts_canonical_context_uidx
  ON measurement_charts (style_version_id, colorway_id, size_scale_version_id)
  WHERE style_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS measurement_charts_canonical_readiness_idx
  ON measurement_charts (style_version_id, colorway_id, size_scale_version_id, status, version DESC)
  WHERE style_version_id IS NOT NULL;

ALTER TABLE measurement_chart_revisions
  ALTER COLUMN sku DROP NOT NULL,
  ALTER COLUMN sku_version DROP NOT NULL;

ALTER TABLE measurement_chart_revisions
  ADD COLUMN IF NOT EXISTS style_version_id text NULL,
  ADD COLUMN IF NOT EXISTS colorway_id text NULL,
  ADD COLUMN IF NOT EXISTS size_scale_version_id text NULL,
  ADD COLUMN IF NOT EXISTS measurement_unit_entry_id text NULL,
  ADD COLUMN IF NOT EXISTS measurement_unit_entry_version integer NULL,
  ADD COLUMN IF NOT EXISTS base_size_value_id text NULL;

ALTER TABLE measurement_chart_revisions
  ADD CONSTRAINT measurement_chart_revisions_style_version_fk
    FOREIGN KEY (style_version_id, brand_id) REFERENCES product_style_versions(id, brand_id),
  ADD CONSTRAINT measurement_chart_revisions_colorway_fk
    FOREIGN KEY (colorway_id, style_version_id, brand_id) REFERENCES product_colorways(id, style_version_id, brand_id),
  ADD CONSTRAINT measurement_chart_revisions_size_scale_version_fk
    FOREIGN KEY (size_scale_version_id, brand_id) REFERENCES product_size_scale_versions(id, brand_id),
  ADD CONSTRAINT measurement_chart_revisions_unit_mdm_fk
    FOREIGN KEY (measurement_unit_entry_id, measurement_unit_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  ADD CONSTRAINT measurement_chart_revisions_base_size_value_fk
    FOREIGN KEY (base_size_value_id, brand_id) REFERENCES product_size_values(id, brand_id),
  ADD CONSTRAINT measurement_chart_revisions_identity_kind_check CHECK (
    (sku IS NOT NULL AND sku_version IS NOT NULL AND style_version_id IS NULL)
    OR
    (
      sku IS NULL
      AND sku_version IS NULL
      AND style_version_id IS NOT NULL
      AND colorway_id IS NOT NULL
      AND size_scale_version_id IS NOT NULL
      AND measurement_unit_entry_id IS NOT NULL
      AND measurement_unit_entry_version IS NOT NULL
      AND base_size_value_id IS NOT NULL
    )
  );

ALTER TABLE measurement_chart_sizes
  ADD COLUMN IF NOT EXISTS size_value_id text NULL,
  ADD COLUMN IF NOT EXISTS label_ru text NULL,
  ADD COLUMN IF NOT EXISTS label_en text NULL,
  ADD CONSTRAINT measurement_chart_sizes_size_value_fk
    FOREIGN KEY (size_value_id) REFERENCES product_size_values(id);

CREATE UNIQUE INDEX IF NOT EXISTS measurement_chart_sizes_canonical_value_uidx
  ON measurement_chart_sizes (chart_id, size_value_id)
  WHERE size_value_id IS NOT NULL;

ALTER TABLE measurement_points
  ADD COLUMN IF NOT EXISTS point_entry_id text NULL,
  ADD COLUMN IF NOT EXISTS point_entry_version integer NULL,
  ADD COLUMN IF NOT EXISTS name_ru text NULL,
  ADD COLUMN IF NOT EXISTS name_en text NULL,
  ADD CONSTRAINT measurement_points_point_mdm_fk
    FOREIGN KEY (point_entry_id, point_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  ADD CONSTRAINT measurement_points_point_pair_check CHECK (
    (point_entry_id IS NULL AND point_entry_version IS NULL)
    OR (point_entry_id IS NOT NULL AND point_entry_version IS NOT NULL AND point_entry_version > 0)
  );

ALTER TABLE measurement_values
  ADD COLUMN IF NOT EXISTS size_value_id text NULL,
  ADD CONSTRAINT measurement_values_size_value_fk
    FOREIGN KEY (size_value_id) REFERENCES product_size_values(id);

CREATE INDEX IF NOT EXISTS measurement_values_canonical_size_idx
  ON measurement_values (chart_id, size_value_id, point_code)
  WHERE size_value_id IS NOT NULL;

COMMIT;
