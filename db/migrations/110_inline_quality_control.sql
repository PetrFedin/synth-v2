BEGIN;

-- Пооперационный контроль: дефект ловится там, где он сделан.
--
-- Production runs through six ordered milestones and every one of them is completed with a free-text
-- note. Then, at the very end, Final Quality inspects a sample and the lot either passes or goes
-- back. Everything in between is invisible: a fault introduced at cutting is discovered after
-- packing, when the whole lot already carries it and the only remedy left is to rework all of it.
--
-- Two things are added, and they are deliberately two:
--
--   1. `defect_types` — a brand's catalogue of faults. Today a defect code is free text. Two
--      inspectors writing SEAM-OPEN and OPEN-SEAM produce two faults that can never be counted
--      together, so no supplier scorecard, no Pareto and no corrective action can ever be built on
--      them. A catalogue is the thing that makes counting possible, and nothing else does.
--
--   2. `inline_quality_checks` — a check performed AT a milestone, against that catalogue.
--
-- The checks hang on the milestones that already exist. Production execution owns the stages, in
-- order, with sequence enforced; inventing a parallel list of operations here would give the project
-- two answers to "what stage is this lot at" and guarantee they drift apart.
--
-- What makes this a control rather than a diary: **a milestone whose check found defects cannot be
-- completed until those defects have been dispositioned.** Without that rule an inline check is a
-- note somebody wrote while known-defective work moved on to the next operation.
--
-- Severity belongs to the catalogue, not to the occurrence. The registered fault carries its
-- severity and the line copies it at the moment of recording, so the same code can never be major in
-- one check and minor in the next — which is exactly how free text behaved. The copy is kept rather
-- than joined so that correcting a type's severity later does not silently rewrite what past
-- inspections decided; history keeps the severity that was in force when it was recorded.

CREATE TABLE IF NOT EXISTS defect_types (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  code text NOT NULL,
  severity text NOT NULL,
  origin_stage text,
  name_ru text NOT NULL,
  name_en text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT defect_types_code_check CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,63}$'),
  CONSTRAINT defect_types_severity_check CHECK (severity IN ('critical', 'major', 'minor')),
  CONSTRAINT defect_types_status_check CHECK (status IN ('active', 'retired')),
  -- The stage a fault ORIGINATES at, which is not always the stage it is found at. It is what turns
  -- a list of defects into a statement about where the work goes wrong. The codes are the production
  -- milestones; `tests/inline-quality.test.mjs` holds this list against the domain's own so the two
  -- cannot drift.
  CONSTRAINT defect_types_origin_stage_check CHECK (
    origin_stage IS NULL OR origin_stage IN ('materials-ready','cutting-complete','assembly-complete','finishing-complete','packing-complete','ready-for-qc')
  ),
  CONSTRAINT defect_types_name_ru_check CHECK (char_length(name_ru) BETWEEN 2 AND 160),
  CONSTRAINT defect_types_name_en_check CHECK (char_length(name_en) BETWEEN 2 AND 160),
  CONSTRAINT defect_types_payload_projection_check CHECK (
    payload ->> 'code' = code
    AND payload ->> 'severity' = severity
    AND payload ->> 'status' = status
    AND (payload ->> 'version')::integer = version
  ),
  UNIQUE (brand_id, code)
);

COMMENT ON TABLE defect_types IS
  'Каталог дефектов бренда. A fault is counted only if it is named the same way every time; free-text codes cannot be aggregated, so no scorecard or corrective action can be built on them.';
COMMENT ON COLUMN defect_types.origin_stage IS
  'Этап, на котором дефект возникает (не обязательно тот, на котором найден). Production milestone code, or NULL when the fault has no single origin.';
COMMENT ON COLUMN defect_types.status IS
  'active — may be recorded against; retired — kept so that past records stay readable, but not offered for new ones. Types are retired, never deleted.';

CREATE TABLE IF NOT EXISTS inline_quality_checks (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  execution_id text NOT NULL REFERENCES production_executions(id),
  execution_code text NOT NULL,
  milestone_code text NOT NULL,
  check_number integer NOT NULL,
  checked_quantity integer NOT NULL,
  defective_quantity integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  disposition text,
  disposition_notes text,
  inspector_name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  recorded_at timestamptz NOT NULL,
  recorded_by text NOT NULL,
  dispositioned_at timestamptz,
  dispositioned_by text,
  payload jsonb NOT NULL,
  CONSTRAINT inline_quality_checks_milestone_check CHECK (
    milestone_code IN ('materials-ready','cutting-complete','assembly-complete','finishing-complete','packing-complete','ready-for-qc')
  ),
  CONSTRAINT inline_quality_checks_checked_positive_check CHECK (checked_quantity >= 1),
  -- Нельзя найти двадцать дефектных изделий, проверив десять.
  CONSTRAINT inline_quality_checks_defective_fits_check CHECK (defective_quantity BETWEEN 0 AND checked_quantity),
  CONSTRAINT inline_quality_checks_status_check CHECK (status IN ('open', 'closed')),
  CONSTRAINT inline_quality_checks_disposition_check CHECK (disposition IS NULL OR disposition IN ('rework', 'scrap', 'accepted')),
  -- A check is open exactly while it has found defects that nobody has decided about. Nothing else
  -- is an open check, and nothing that found defects and was decided stays open.
  CONSTRAINT inline_quality_checks_open_check CHECK ((status = 'open') = (defective_quantity > 0 AND disposition IS NULL)),
  -- Дефектов нет — и решать нечего.
  CONSTRAINT inline_quality_checks_disposition_needs_defects_check CHECK (disposition IS NULL OR defective_quantity > 0),
  -- Принять известный брак можно, но только объяснив почему.
  CONSTRAINT inline_quality_checks_accepted_needs_reason_check CHECK (
    disposition IS DISTINCT FROM 'accepted' OR char_length(coalesce(disposition_notes, '')) >= 10
  ),
  CONSTRAINT inline_quality_checks_dispositioned_pair_check CHECK ((disposition IS NULL) = (dispositioned_at IS NULL) AND (dispositioned_at IS NULL) = (dispositioned_by IS NULL)),
  CONSTRAINT inline_quality_checks_payload_projection_check CHECK (
    payload ->> 'executionCode' = execution_code
    AND payload ->> 'milestoneCode' = milestone_code
    AND (payload ->> 'checkNumber')::integer = check_number
    AND (payload ->> 'checkedQuantity')::integer = checked_quantity
    AND payload ->> 'status' = status
  ),
  UNIQUE (execution_id, milestone_code, check_number)
);

CREATE INDEX IF NOT EXISTS inline_quality_checks_open_idx
  ON inline_quality_checks (execution_id, milestone_code) WHERE status = 'open';

COMMENT ON TABLE inline_quality_checks IS
  'Пооперационный контроль партии на конкретной вехе производства. An open check — defects found, nothing decided — blocks completion of its milestone, which is what makes it a control rather than a log.';

CREATE TABLE IF NOT EXISTS inline_quality_defects (
  id text PRIMARY KEY,
  check_id text NOT NULL REFERENCES inline_quality_checks(id) ON DELETE CASCADE,
  defect_type_id text NOT NULL REFERENCES defect_types(id),
  defect_code text NOT NULL,
  severity text NOT NULL,
  quantity integer NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT inline_quality_defects_quantity_check CHECK (quantity >= 1),
  CONSTRAINT inline_quality_defects_severity_check CHECK (severity IN ('critical', 'major', 'minor')),
  CONSTRAINT inline_quality_defects_payload_projection_check CHECK (
    payload ->> 'defectCode' = defect_code
    AND payload ->> 'severity' = severity
    AND (payload ->> 'quantity')::integer = quantity
  ),
  -- Два вхождения одного типа в одной проверке — это ошибка сложения, а не две находки.
  UNIQUE (check_id, defect_type_id)
);

-- Severity and code are copied from the catalogue rather than taken from the caller, so a line can
-- never claim a severity the registered fault does not have. A retired type is not recorded against:
-- retiring it is how a brand says "stop using this one", and it must mean that.
CREATE OR REPLACE FUNCTION assert_inline_defect_matches_catalogue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  registered defect_types%ROWTYPE;
  owning_brand text;
BEGIN
  SELECT * INTO registered FROM defect_types WHERE id = NEW.defect_type_id;
  IF registered.id IS NULL THEN
    RAISE EXCEPTION 'INLINE_QC_DEFECT_TYPE_NOT_FOUND: Defect type % is not registered', NEW.defect_type_id;
  END IF;
  IF registered.status <> 'active' THEN
    RAISE EXCEPTION 'INLINE_QC_DEFECT_TYPE_RETIRED: Defect type % is retired and cannot be recorded against', registered.code;
  END IF;

  SELECT brand_id INTO owning_brand FROM inline_quality_checks WHERE id = NEW.check_id;
  IF owning_brand IS DISTINCT FROM registered.brand_id THEN
    RAISE EXCEPTION 'INLINE_QC_DEFECT_TYPE_FOREIGN: Defect type % belongs to another brand', registered.code;
  END IF;

  NEW.defect_code := registered.code;
  NEW.severity := registered.severity;
  NEW.payload := NEW.payload || jsonb_build_object('defectCode', registered.code, 'severity', registered.severity);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS inline_quality_defects_match_catalogue ON inline_quality_defects;
CREATE TRIGGER inline_quality_defects_match_catalogue
  BEFORE INSERT OR UPDATE ON inline_quality_defects
  FOR EACH ROW EXECUTE FUNCTION assert_inline_defect_matches_catalogue();

-- The defective count is DERIVED from the lines, never asserted beside them. A total that is stated
-- separately from what it totals is a number that can disagree with itself, and this one decides
-- whether a milestone may be completed.
CREATE OR REPLACE FUNCTION recount_inline_quality_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target text := COALESCE(NEW.check_id, OLD.check_id);
  total integer;
BEGIN
  SELECT COALESCE(sum(quantity), 0) INTO total FROM inline_quality_defects WHERE check_id = target;
  UPDATE inline_quality_checks
     SET defective_quantity = total,
         status = CASE WHEN total > 0 AND disposition IS NULL THEN 'open' ELSE 'closed' END,
         payload = payload || jsonb_build_object('defectiveQuantity', total, 'status', CASE WHEN total > 0 AND disposition IS NULL THEN 'open' ELSE 'closed' END)
   WHERE id = target;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS inline_quality_defects_recount ON inline_quality_defects;
CREATE TRIGGER inline_quality_defects_recount
  AFTER INSERT OR UPDATE OR DELETE ON inline_quality_defects
  FOR EACH ROW EXECUTE FUNCTION recount_inline_quality_check();

-- Веха не закрывается, пока найденный на ней брак не разобран.
--
-- This is the rule that makes inline control a control. It lives in the database as well as the
-- domain because it crosses two aggregates: the execution owns the milestone, the check owns the
-- defects, and a rule enforced only in the module that happens to be writing is a rule that the
-- other writer does not obey.
CREATE OR REPLACE FUNCTION assert_milestones_have_no_open_checks()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  blocking text;
BEGIN
  SELECT check_row.milestone_code INTO blocking
    FROM inline_quality_checks AS check_row
   WHERE check_row.execution_id = NEW.id
     AND check_row.status = 'open'
     AND EXISTS (
       SELECT 1
         FROM jsonb_array_elements(NEW.payload -> 'milestones') AS fresh
        WHERE fresh ->> 'code' = check_row.milestone_code
          AND fresh ->> 'status' = 'completed'
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(OLD.payload -> 'milestones') AS prior
             WHERE prior ->> 'code' = check_row.milestone_code
               AND prior ->> 'status' = 'completed'
          )
     )
   LIMIT 1;

  IF blocking IS NOT NULL THEN
    RAISE EXCEPTION 'PRODUCTION_MILESTONE_HAS_OPEN_INLINE_CHECK: Milestone % has an inline check whose defects nobody has decided about', blocking;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS production_executions_inline_check_gate ON production_executions;
CREATE TRIGGER production_executions_inline_check_gate
  BEFORE UPDATE ON production_executions
  FOR EACH ROW EXECUTE FUNCTION assert_milestones_have_no_open_checks();

COMMIT;
