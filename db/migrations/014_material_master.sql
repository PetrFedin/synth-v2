CREATE TABLE IF NOT EXISTS materials (
  code text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  status text NOT NULL CHECK (status IN ('draft', 'published')),
  material_type text NOT NULL CHECK (material_type IN ('fabric', 'trim', 'packaging', 'other')),
  unit text NOT NULL CHECK (unit IN ('m', 'kg', 'pc', 'yd')),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  unit_cost numeric(20, 4) NOT NULL CHECK (unit_cost > 0),
  minimum_order_quantity numeric(20, 4) NOT NULL CHECK (minimum_order_quantity > 0),
  available_quantity numeric(20, 4) NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  reserved_quantity numeric(20, 4) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  CONSTRAINT materials_reserved_not_above_available CHECK (reserved_quantity <= available_quantity)
);

CREATE INDEX IF NOT EXISTS materials_brand_status_code_idx
  ON materials (brand_id, status, code);
CREATE INDEX IF NOT EXISTS materials_brand_type_code_idx
  ON materials (brand_id, material_type, code);
