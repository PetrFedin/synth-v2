BEGIN;

-- Прослеживаемость: из какого рулона сшита эта партия.
--
-- The platform knew a material — «Recycled ripstop shell 60gsm», its composition, its mill, its unit
-- cost — and it knew how much of it a garment takes, because the bill of materials states the
-- consumption and the waste. What it could not say is **which roll**.
--
-- That gap is not bookkeeping. Two questions depend on it and neither has any other answer:
--
--   * разнооттеночность. Fabric is dyed in batches and batches differ. A garment whose front and
--     sleeve come from two dye lots is a defect that no inspection of the roll would have caught,
--     because each roll was fine on its own. The defect is in the pairing, and only a record of what
--     was issued to what can see a pairing.
--
--   * отзыв. When a mill reports a fault in dye lot X three weeks later, the question is which
--     production orders carry it. Without lots the answer is «all of them, probably», and that is
--     the difference between recalling one lot of garments and recalling a season.
--
-- Two tables and nothing more. A lot is a received batch of one material; an issue is that lot going
-- into one production execution. Everything else is derived:
--
--   * `issued_quantity` on the lot is maintained by trigger from the issues, never asserted beside
--     them, for the same reason the inline defect count is: a total stated separately from what it
--     totals can disagree with itself, and this one decides whether more may be issued.
--
--   * «израсходован» is not a status. A lot is fully issued when its issues reach what was received,
--     and that is a comparison, not a fact to store — a stored copy of it would drift the first time
--     an issue was corrected. The statuses are only the ones somebody actually decides: quarantine
--     on arrival, released after incoming inspection, rejected.
--
-- Материал в карантине в производство не уходит. That is the whole point of quarantine, and it is a
-- rule rather than a convention because the cost of ignoring it is a lot of garments already cut.

CREATE TABLE IF NOT EXISTS material_lots (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  material_code text NOT NULL,
  material_version integer NOT NULL,
  lot_reference text NOT NULL,
  dye_lot text,
  supplier_code text,
  unit text NOT NULL,
  received_quantity numeric(14, 4) NOT NULL,
  issued_quantity numeric(14, 4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'quarantine',
  received_at timestamptz NOT NULL,
  certificate_reference text,
  notes text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT material_lots_reference_check CHECK (lot_reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,63}$'),
  CONSTRAINT material_lots_received_check CHECK (received_quantity > 0),
  CONSTRAINT material_lots_issued_check CHECK (issued_quantity >= 0),
  -- Выдать больше, чем приехало, нельзя. Ровно это правило и делает остаток остатком.
  CONSTRAINT material_lots_issued_fits_check CHECK (issued_quantity <= received_quantity),
  CONSTRAINT material_lots_status_check CHECK (status IN ('quarantine', 'released', 'rejected')),
  CONSTRAINT material_lots_payload_projection_check CHECK (
    payload ->> 'materialCode' = material_code
    AND payload ->> 'lotReference' = lot_reference
    AND payload ->> 'status' = status
    AND payload ->> 'unit' = unit
  ),
  -- Один и тот же номер партии у одного материала — это одна партия, а не две.
  UNIQUE (brand_id, material_code, lot_reference)
);

CREATE INDEX IF NOT EXISTS material_lots_material_idx ON material_lots (brand_id, material_code, status);
CREATE INDEX IF NOT EXISTS material_lots_dye_lot_idx ON material_lots (brand_id, dye_lot) WHERE dye_lot IS NOT NULL;

CREATE TABLE IF NOT EXISTS material_lot_issues (
  id text PRIMARY KEY,
  lot_id text NOT NULL REFERENCES material_lots(id),
  execution_id text NOT NULL REFERENCES production_executions(id),
  execution_code text NOT NULL,
  quantity numeric(14, 4) NOT NULL,
  issued_at timestamptz NOT NULL,
  issued_by text NOT NULL,
  notes text,
  payload jsonb NOT NULL,
  CONSTRAINT material_lot_issues_quantity_check CHECK (quantity > 0),
  CONSTRAINT material_lot_issues_payload_projection_check CHECK (
    payload ->> 'executionCode' = execution_code
    AND (payload ->> 'quantity')::numeric = quantity
  ),
  -- Одна строка на партию материала в одну партию изделий: вторая выдача того же рулона в тот же
  -- заказ — это сложение, а не вторая выдача.
  UNIQUE (lot_id, execution_id)
);

CREATE INDEX IF NOT EXISTS material_lot_issues_execution_idx ON material_lot_issues (execution_id);

-- Выдавать можно только выпущенное из карантина, только своё и только в своё.
CREATE OR REPLACE FUNCTION assert_material_issue_is_allowed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  lot material_lots%ROWTYPE;
  execution_brand text;
BEGIN
  SELECT * INTO lot FROM material_lots WHERE id = NEW.lot_id FOR UPDATE;
  IF lot.id IS NULL THEN
    RAISE EXCEPTION 'MATERIAL_LOT_NOT_FOUND: Material lot % does not exist', NEW.lot_id;
  END IF;
  IF lot.status <> 'released' THEN
    RAISE EXCEPTION 'MATERIAL_LOT_NOT_RELEASED: Lot % is % and cannot go into production', lot.lot_reference, lot.status;
  END IF;

  SELECT brand_id INTO execution_brand FROM production_executions WHERE id = NEW.execution_id;
  IF execution_brand IS DISTINCT FROM lot.brand_id THEN
    RAISE EXCEPTION 'MATERIAL_LOT_FOREIGN_EXECUTION: Lot % belongs to another brand than this production execution', lot.lot_reference;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS material_lot_issues_allowed ON material_lot_issues;
CREATE TRIGGER material_lot_issues_allowed
  BEFORE INSERT OR UPDATE ON material_lot_issues
  FOR EACH ROW EXECUTE FUNCTION assert_material_issue_is_allowed();

-- Выданное считается по выдачам, а не заявляется рядом с ними.
CREATE OR REPLACE FUNCTION recount_material_lot_issued()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target text := COALESCE(NEW.lot_id, OLD.lot_id);
  total numeric(14, 4);
BEGIN
  SELECT COALESCE(sum(quantity), 0) INTO total FROM material_lot_issues WHERE lot_id = target;
  UPDATE material_lots
     SET issued_quantity = total,
         payload = payload || jsonb_build_object('issuedQuantity', total)
   WHERE id = target;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS material_lot_issues_recount ON material_lot_issues;
CREATE TRIGGER material_lot_issues_recount
  AFTER INSERT OR UPDATE OR DELETE ON material_lot_issues
  FOR EACH ROW EXECUTE FUNCTION recount_material_lot_issued();

-- Партию, которая уже в изделиях, отклонить нельзя.
--
-- Rejecting a lot says «this never should have been used». Once it is in garments that statement is
-- no longer a status change — it is a claim against the mill and a decision about goods already cut,
-- and pretending otherwise would quietly detach the record from the clothes.
CREATE OR REPLACE FUNCTION assert_material_lot_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'rejected' AND OLD.status <> 'rejected' AND NEW.issued_quantity > 0 THEN
    RAISE EXCEPTION 'MATERIAL_LOT_ALREADY_IN_PRODUCTION: Lot % is already in garments and cannot be rejected', NEW.lot_reference;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS material_lots_status_gate ON material_lots;
CREATE TRIGGER material_lots_status_gate
  BEFORE UPDATE ON material_lots
  FOR EACH ROW EXECUTE FUNCTION assert_material_lot_status_change();

-- Дефект материала называет рулон.
--
-- The inline check at the materials stage already records what was found; until now it could not say
-- in which roll. A hole and a shade mismatch are exactly the faults that belong to a lot rather than
-- to a lot of garments, and the column is what turns «нашли разнооттеночность» into «разнооттеночность
-- между партиями A и B», which is a sentence somebody can act on.
--
-- Nullable, because most defects are made at a sewing machine and belong to no roll at all.
ALTER TABLE inline_quality_defects ADD COLUMN IF NOT EXISTS material_lot_id text REFERENCES material_lots(id);

COMMENT ON COLUMN material_lots.issued_quantity IS
  'Выдано в производство. Derived from the issues by trigger, never asserted beside them: it decides whether more may be issued.';
COMMENT ON COLUMN material_lots.status IS
  'quarantine — приехало, не проверено; released — прошло входной контроль; rejected — не принято. «Израсходован» статусом не является: это сравнение выданного с полученным.';
COMMENT ON COLUMN inline_quality_defects.material_lot_id IS
  'Рулон, в котором найден дефект, если дефект принадлежит материалу, а не пошиву.';

COMMIT;
