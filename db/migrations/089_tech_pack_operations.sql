BEGIN;

-- The sequence of operations a factory performs to make the garment: the machine each one needs and
-- how long it is expected to take. A tech pack without it tells a factory what to make and not how,
-- and a production planner has nothing to balance a line against.

CREATE TABLE IF NOT EXISTS tech_pack_operations (
  id text PRIMARY KEY,
  tech_pack_code text NOT NULL REFERENCES tech_packs(tech_pack_code),
  brand_id text NOT NULL REFERENCES organisations(id),
  sequence integer NOT NULL CHECK (sequence BETWEEN 1 AND 999),
  operation_code text NOT NULL CHECK (operation_code ~ '^[A-Z0-9][A-Z0-9._-]{1,31}$'),
  name_ru text NOT NULL CHECK (length(trim(name_ru)) BETWEEN 2 AND 200),
  name_en text NOT NULL CHECK (length(trim(name_en)) BETWEEN 2 AND 200),
  equipment text NULL CHECK (equipment IS NULL OR length(trim(equipment)) BETWEEN 1 AND 120),
  machine_class text NOT NULL CHECK (machine_class IN (
    'lockstitch', 'overlock', 'coverstitch', 'blindstitch', 'bartack', 'buttonhole',
    'button_attach', 'fusing', 'pressing', 'cutting', 'manual', 'other'
  )),
  -- Zero is not a measured time, it is a missing one, and it would quietly shorten the sequence the
  -- make cost is derived from.
  standard_minutes numeric(8, 2) NOT NULL CHECK (standard_minutes > 0 AND standard_minutes <= 600),
  notes text NULL CHECK (notes IS NULL OR length(notes) <= 1000),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (tech_pack_code, sequence),
  UNIQUE (tech_pack_code, operation_code)
);

CREATE INDEX IF NOT EXISTS tech_pack_operations_pack_idx
  ON tech_pack_operations (tech_pack_code, sequence);

-- An issued tech pack is what a factory quoted and committed against. Changing its operations
-- afterwards would change the document without changing its revision, so the sequence is closed the
-- moment the pack leaves draft.
CREATE OR REPLACE FUNCTION assert_tech_pack_operations_draft_only() RETURNS trigger AS $$
DECLARE
  pack_status text;
  pack_code text;
BEGIN
  pack_code := COALESCE(NEW.tech_pack_code, OLD.tech_pack_code);
  SELECT status INTO pack_status FROM tech_packs WHERE tech_pack_code = pack_code;
  IF pack_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'TECH_PACK_NOT_DRAFT: operations cannot change once the tech pack is %', COALESCE(pack_status, 'missing')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tech_pack_operations_draft_only ON tech_pack_operations;
CREATE TRIGGER tech_pack_operations_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON tech_pack_operations
  FOR EACH ROW EXECUTE FUNCTION assert_tech_pack_operations_draft_only();

COMMIT;
