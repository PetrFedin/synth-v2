BEGIN;

CREATE TABLE IF NOT EXISTS boms (
  id text PRIMARY KEY,
  sku text NOT NULL UNIQUE REFERENCES catalog_skus(sku),
  brand_id text NOT NULL REFERENCES organisations(id),
  status text NOT NULL CHECK (status IN ('draft', 'published')),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  material_cost numeric(20, 4) NOT NULL CHECK (material_cost >= 0),
  labor_cost numeric(20, 4) NOT NULL CHECK (labor_cost >= 0),
  overhead_cost numeric(20, 4) NOT NULL CHECK (overhead_cost >= 0),
  logistics_cost numeric(20, 4) NOT NULL CHECK (logistics_cost >= 0),
  other_cost numeric(20, 4) NOT NULL CHECK (other_cost >= 0),
  total_cost numeric(20, 4) NOT NULL CHECK (total_cost > 0),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  CONSTRAINT boms_total_not_below_material CHECK (total_cost >= material_cost)
);

CREATE TABLE IF NOT EXISTS bom_lines (
  bom_id text NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  line_id text NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  component text NOT NULL,
  material_code text NOT NULL REFERENCES materials(code),
  material_version integer NOT NULL CHECK (material_version > 0),
  material_type text NOT NULL CHECK (material_type IN ('fabric', 'trim', 'packaging', 'other')),
  unit text NOT NULL CHECK (unit IN ('m', 'kg', 'pc', 'yd')),
  quantity numeric(20, 4) NOT NULL CHECK (quantity > 0),
  waste_percent numeric(20, 4) NOT NULL CHECK (waste_percent >= 0 AND waste_percent <= 1000),
  gross_quantity numeric(20, 4) NOT NULL CHECK (gross_quantity > 0),
  material_currency char(3) NOT NULL CHECK (material_currency ~ '^[A-Z]{3}$'),
  unit_cost_snapshot numeric(20, 4) NOT NULL CHECK (unit_cost_snapshot > 0),
  exchange_rate numeric(20, 4) NOT NULL CHECK (exchange_rate > 0),
  line_cost numeric(20, 4) NOT NULL CHECK (line_cost >= 0),
  payload jsonb NOT NULL,
  PRIMARY KEY (bom_id, line_id),
  UNIQUE (bom_id, position)
);

CREATE INDEX IF NOT EXISTS boms_brand_status_sku_idx ON boms (brand_id, status, sku);
CREATE INDEX IF NOT EXISTS bom_lines_material_code_idx ON bom_lines (material_code, bom_id);

COMMIT;
