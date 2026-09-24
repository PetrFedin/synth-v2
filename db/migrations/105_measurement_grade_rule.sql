BEGIN;

-- Градация как правило, а не как девяносто шесть набранных чисел.
--
-- A chart of twelve points across eight sizes is ninety-six cells, and today every one of them is
-- typed. That is not merely slow: a hand-typed grid has no rule inside it, so nothing can tell a
-- reader whether 52-54-56 was intended as a uniform two-centimetre grade or whether somebody meant
-- 53 and mistyped. The factory grading the pattern needs the rule; the chart could not state one.
--
-- What is added is the rule and the difference between following it and departing from it:
--
--   * `grade_steps` on a point — the **межразмерная разница**: one signed number per interval
--     between consecutive sizes, in the chart's own unit. Every value except the base size is then
--     derived by walking outward from the base.
--
--   * `source` on a value — `derived` when the rule produced it, `override` when a person put a
--     different number in that cell on purpose. An override is a deliberate exception and the
--     document prints it as one; a factory that cannot see which cells depart from the rule has to
--     re-derive the whole chart to find them.
--
-- Why a step per interval rather than one increment per point, which is how the reference systems
-- model it: Russian grading states the difference between neighbouring sizes, and it is not
-- constant across a range — 44→50 commonly grades at 4 cm in the chest and 50→56 at 6. One number
-- per point cannot say that, and the two-column "Gr.1 / Gr.2" arrangement only says it twice. A
-- step per interval says it exactly, and a uniform grade is the ordinary case of it.
--
-- Both are optional. A chart with no rule behaves exactly as before: every cell typed, every value
-- `derived` only in the sense that nothing contradicts it. Nothing existing has to change.

ALTER TABLE measurement_points ADD COLUMN IF NOT EXISTS grade_steps jsonb;

ALTER TABLE measurement_points DROP CONSTRAINT IF EXISTS measurement_points_grade_steps_shape_check;
ALTER TABLE measurement_points ADD CONSTRAINT measurement_points_grade_steps_shape_check
  CHECK (
    grade_steps IS NULL
    OR (
      jsonb_typeof(grade_steps) = 'array'
      AND jsonb_array_length(grade_steps) BETWEEN 1 AND 63
      -- Every entry is a number. A CHECK may not contain a subquery, so the test is a JSON path
      -- predicate: "does any element fail to be a number?" — and the answer must be no.
      AND NOT jsonb_path_exists(grade_steps, '$[*] ? (@.type() != "number")')
    )
  );

ALTER TABLE measurement_points DROP CONSTRAINT IF EXISTS measurement_points_grade_steps_projection_check;
ALTER TABLE measurement_points ADD CONSTRAINT measurement_points_grade_steps_projection_check
  CHECK (grade_steps IS NOT DISTINCT FROM (payload -> 'gradeSteps'));

ALTER TABLE measurement_values ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'derived';

ALTER TABLE measurement_values DROP CONSTRAINT IF EXISTS measurement_values_source_check;
ALTER TABLE measurement_values ADD CONSTRAINT measurement_values_source_check
  CHECK (source IN ('derived', 'override'));

COMMENT ON COLUMN measurement_points.grade_steps IS
  'Межразмерная разница: one signed number per interval between consecutive chart sizes, in the chart unit. Exactly one fewer entry than there are sizes. NULL means the point is graded by hand.';
COMMENT ON COLUMN measurement_values.source IS
  'derived — produced by walking the grade rule out from the base size; override — a person put a different number in this cell on purpose, and the document prints it as an exception.';

COMMIT;
