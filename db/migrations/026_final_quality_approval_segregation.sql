BEGIN;

CREATE OR REPLACE FUNCTION enforce_quality_approval_segregation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run jsonb;
BEGIN
  IF jsonb_typeof(NEW.payload -> 'runs') <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR run IN SELECT value FROM jsonb_array_elements(NEW.payload -> 'runs') LOOP
    IF run ->> 'status' = 'reviewed'
       AND (
         run ->> 'reviewedBy' = run ->> 'inspectorId'
         OR run ->> 'reviewedBy' = run ->> 'completedBy'
       ) THEN
      RAISE EXCEPTION 'Final Quality reviewer must be independent from the inspector and completer'
        USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_approval_segregation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM quality_inspections AS inspection
      CROSS JOIN LATERAL jsonb_array_elements(inspection.payload -> 'runs') AS run
     WHERE run ->> 'status' = 'reviewed'
       AND (
         run ->> 'reviewedBy' = run ->> 'inspectorId'
         OR run ->> 'reviewedBy' = run ->> 'completedBy'
       )
  ) THEN
    RAISE EXCEPTION 'Existing Final Quality history violates approval segregation'
      USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_approval_segregation';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS quality_inspections_approval_segregation_gate ON quality_inspections;
CREATE TRIGGER quality_inspections_approval_segregation_gate
BEFORE INSERT OR UPDATE ON quality_inspections
FOR EACH ROW EXECUTE FUNCTION enforce_quality_approval_segregation();

COMMIT;
