BEGIN;

CREATE TABLE IF NOT EXISTS measurement_charts (
  id text PRIMARY KEY,
  sku text NOT NULL UNIQUE REFERENCES catalog_skus(sku),
  brand_id text NOT NULL REFERENCES organisations(id),
  sku_version integer NOT NULL CHECK (sku_version > 0),
  status text NOT NULL CHECK (status IN ('draft', 'published')),
  unit text NOT NULL CHECK (unit IN ('cm', 'in')),
  base_size_code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  published_at timestamptz,
  CONSTRAINT measurement_charts_publication_state_check CHECK (
    (status = 'draft' AND published_at IS NULL)
    OR (status = 'published' AND published_at IS NOT NULL)
  ),
  CONSTRAINT measurement_charts_time_order_check CHECK (
    updated_at >= created_at
    AND (published_at IS NULL OR published_at >= created_at)
  )
);

CREATE TABLE IF NOT EXISTS measurement_chart_sizes (
  chart_id text NOT NULL REFERENCES measurement_charts(id) ON DELETE CASCADE,
  size_code text NOT NULL,
  label text NOT NULL,
  position integer NOT NULL CHECK (position > 0 AND position <= 50),
  PRIMARY KEY (chart_id, size_code),
  UNIQUE (chart_id, position)
);

CREATE TABLE IF NOT EXISTS measurement_points (
  chart_id text NOT NULL REFERENCES measurement_charts(id) ON DELETE CASCADE,
  point_code text NOT NULL,
  position integer NOT NULL CHECK (position > 0 AND position <= 300),
  name text NOT NULL,
  description text,
  tolerance_minus numeric(20, 4) NOT NULL CHECK (tolerance_minus >= 0),
  tolerance_plus numeric(20, 4) NOT NULL CHECK (tolerance_plus >= 0),
  base_value numeric(20, 4) CHECK (base_value > 0),
  payload jsonb NOT NULL,
  PRIMARY KEY (chart_id, point_code),
  UNIQUE (chart_id, position)
);

CREATE TABLE IF NOT EXISTS measurement_values (
  chart_id text NOT NULL,
  point_code text NOT NULL,
  size_code text NOT NULL,
  value numeric(20, 4) NOT NULL CHECK (value > 0),
  delta_from_previous numeric(20, 4),
  PRIMARY KEY (chart_id, point_code, size_code),
  FOREIGN KEY (chart_id, point_code) REFERENCES measurement_points(chart_id, point_code) ON DELETE CASCADE,
  FOREIGN KEY (chart_id, size_code) REFERENCES measurement_chart_sizes(chart_id, size_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS measurement_charts_brand_status_sku_idx
  ON measurement_charts (brand_id, status, sku);
CREATE INDEX IF NOT EXISTS measurement_values_size_idx
  ON measurement_values (chart_id, size_code, point_code);

COMMIT;
