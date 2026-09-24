BEGIN;

-- "No grade rule" written two ways is still one fact.
--
-- The projection check compared the column against `payload -> 'gradeSteps'` directly. A point with
-- no rule carries `gradeSteps: null` in its payload, which serialises to a JSON null — and a JSON
-- null is distinct from an SQL NULL, so every ungraded point was refused by its own integrity
-- check. The two spellings of absence mean the same thing and the check now says so.

ALTER TABLE measurement_points DROP CONSTRAINT IF EXISTS measurement_points_grade_steps_projection_check;
ALTER TABLE measurement_points ADD CONSTRAINT measurement_points_grade_steps_projection_check
  CHECK (grade_steps IS NOT DISTINCT FROM NULLIF(payload -> 'gradeSteps', 'null'::jsonb));

COMMIT;
