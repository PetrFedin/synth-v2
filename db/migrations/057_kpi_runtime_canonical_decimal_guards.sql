BEGIN;

CREATE OR REPLACE FUNCTION kpi_json_decimal_matches_numeric(
  p_payload JSONB,
  p_key TEXT,
  p_numeric NUMERIC,
  p_required BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  value_text TEXT;
BEGIN
  IF NOT (p_payload ? p_key) OR p_payload -> p_key = 'null'::jsonb THEN
    RETURN p_numeric IS NULL AND NOT p_required;
  END IF;

  IF jsonb_typeof(p_payload -> p_key) <> 'string' THEN
    RETURN FALSE;
  END IF;

  value_text := p_payload ->> p_key;

  -- Canonical decimal representation produced by decimal.mjs:
  -- 0, non-zero integer without leading zeroes, or fraction ending in a non-zero digit.
  -- Therefore -0, 0.0, 1.2300 and exponent notation are rejected.
  IF value_text !~ '^(0|-?[1-9][0-9]*|-?(0|[1-9][0-9]*)\.[0-9]{0,11}[1-9])$' THEN
    RETURN FALSE;
  END IF;

  IF p_numeric IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN value_text::NUMERIC(38,12) = p_numeric;
EXCEPTION
  WHEN numeric_value_out_of_range OR invalid_text_representation THEN
    RETURN FALSE;
END;
$$;

COMMIT;
