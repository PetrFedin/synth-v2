BEGIN;

-- Приёмочный контроль по плану, а не по мнению инспектора.
--
-- A final-quality run today carries three numbers a person typed when they started it: how many
-- pieces to inspect, how many major defects are tolerated, how many minor. Nothing ties them to the
-- size of the lot and nothing records where they came from, so two inspections of the same product
-- can be judged by different criteria and the record cannot say which criterion either used. That
-- is the one thing an acceptance decision must be able to say.
--
-- Acceptance sampling is a published standard — in Russia ГОСТ Р ИСО 2859-1, which is the adoption
-- of ISO 2859-1 — and it answers exactly this: given the lot size, an inspection level and an
-- accepted quality limit, it fixes the sample size and the acceptance and rejection numbers.
--
-- This table holds such a plan set. It is deliberately **data, not code**:
--
--   * a brand may have adopted a different standard, or agreed a bespoke plan with a particular
--     factory, and both are ordinary. A plan set carries the code of the standard it came from, so
--     an inspection can say «по ГОСТ Р ИСО 2859-1, уровень II, AQL 2.5» and mean it;
--   * the coefficients of a published standard are not something to hard-code from memory into a
--     module that decides whether goods ship. They are loaded, and what loaded them is recorded.
--
-- No standard is seeded here. The demonstration seeds a plan set of its own, plainly labelled as a
-- demonstration one; a brand loads the real table it works to. A lot with no plan covering it is
-- refused at resolution rather than guessed at.
--
-- Four rules live in the database because each of them makes a plan set either usable or nonsense:
--
--   1. acceptance < rejection. A rule where they are equal or inverted decides nothing.
--   2. rejection = acceptance + 1. In single sampling there is no gap between the two: the lot is
--      accepted at Ac defects and rejected at one more. A plan with a gap leaves outcomes undefined.
--   3. the sample cannot exceed the smallest lot the row covers — you cannot inspect eighty pieces
--      out of a lot of fifty.
--   4. ranges of one (brand, standard, level, AQL) may not overlap, or a lot resolves to two
--      different criteria and the answer depends on which row was read first.

CREATE TABLE IF NOT EXISTS aql_sampling_plans (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  standard_code text NOT NULL,
  inspection_level text NOT NULL,
  aql numeric(6, 3) NOT NULL CHECK (aql > 0 AND aql <= 100),
  lot_from integer NOT NULL CHECK (lot_from >= 1),
  lot_to integer NOT NULL,
  sample_size integer NOT NULL CHECK (sample_size >= 1),
  accept_at integer NOT NULL CHECK (accept_at >= 0),
  reject_at integer NOT NULL CHECK (reject_at >= 1),
  source_note text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT aql_sampling_plans_standard_code_check CHECK (standard_code ~ '^[A-Z0-9][A-Z0-9 ._-]{1,63}$'),
  CONSTRAINT aql_sampling_plans_level_check CHECK (inspection_level ~ '^[A-Z0-9-]{1,16}$'),
  CONSTRAINT aql_sampling_plans_lot_range_check CHECK (lot_to >= lot_from),
  CONSTRAINT aql_sampling_plans_decision_check CHECK (reject_at = accept_at + 1),
  CONSTRAINT aql_sampling_plans_sample_fits_lot_check CHECK (sample_size <= lot_from),
  CONSTRAINT aql_sampling_plans_payload_projection_check CHECK (
    payload ->> 'standardCode' = standard_code
    AND payload ->> 'inspectionLevel' = inspection_level
    AND (payload ->> 'sampleSize')::integer = sample_size
    AND (payload ->> 'acceptAt')::integer = accept_at
    AND (payload ->> 'rejectAt')::integer = reject_at
  ),
  UNIQUE (brand_id, standard_code, inspection_level, aql, lot_from)
);

CREATE INDEX IF NOT EXISTS aql_sampling_plans_lookup_idx
  ON aql_sampling_plans (brand_id, standard_code, inspection_level, aql, lot_from, lot_to);

-- Rule 4. An exclusion constraint would say this in one line but needs btree_gist, and this schema
-- deliberately installs no extensions; the invariant is worth more than the brevity.
CREATE OR REPLACE FUNCTION assert_aql_plan_ranges_disjoint()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  clash text;
BEGIN
  SELECT other.id INTO clash
    FROM aql_sampling_plans other
   WHERE other.brand_id = NEW.brand_id
     AND other.standard_code = NEW.standard_code
     AND other.inspection_level = NEW.inspection_level
     AND other.aql = NEW.aql
     AND other.id <> NEW.id
     AND other.lot_from <= NEW.lot_to
     AND other.lot_to >= NEW.lot_from
   LIMIT 1;

  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'AQL_PLAN_RANGE_OVERLAPS: A lot size may resolve to only one sampling plan, and this range overlaps %', clash;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS aql_sampling_plans_disjoint_ranges ON aql_sampling_plans;
CREATE TRIGGER aql_sampling_plans_disjoint_ranges
  BEFORE INSERT OR UPDATE ON aql_sampling_plans
  FOR EACH ROW EXECUTE FUNCTION assert_aql_plan_ranges_disjoint();

COMMENT ON TABLE aql_sampling_plans IS
  'Acceptance sampling plans a brand works to: given a lot size, an inspection level and an AQL, the sample size and the acceptance and rejection numbers. Held as data because the standard a brand has adopted, and any bespoke plan agreed with a factory, are both things the record must be able to name.';
COMMENT ON COLUMN aql_sampling_plans.accept_at IS 'Приёмочное число: the lot is accepted at this many defects or fewer.';
COMMENT ON COLUMN aql_sampling_plans.reject_at IS 'Браковочное число: always acceptance + 1, because single sampling leaves no undecided gap between them.';

COMMIT;
