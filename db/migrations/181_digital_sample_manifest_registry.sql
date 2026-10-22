-- STAGED: execute only with the pinned native migration history in an isolated PostgreSQL 17.
-- New records are metadata declarations, never validated 3D files or production approvals.
DO $$
DECLARE existing_expression text;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO existing_expression
    FROM pg_constraint
   WHERE conrelid = 'public.command_registry'::regclass
     AND conname = 'command_registry_scope_check';
  IF existing_expression IS NULL THEN
    RAISE EXCEPTION 'DIGITAL_SAMPLE_COMMAND_SCOPE_BASELINE_REQUIRED';
  END IF;
  ALTER TABLE public.command_registry DROP CONSTRAINT command_registry_scope_check;
  EXECUTE format('ALTER TABLE public.command_registry ADD CONSTRAINT command_registry_scope_check CHECK ((%s) OR scope = %L)', existing_expression, 'digital-samples');
END $$;

CREATE TABLE public.digital_sample_commands (
  id text PRIMARY KEY REFERENCES public.command_registry(id) DEFERRABLE INITIALLY DEFERRED,
  fingerprint text NOT NULL, actor_id text NOT NULL, result jsonb NOT NULL, completed_at timestamptz NOT NULL
);
CREATE TABLE public.digital_sample_series (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  brand_id text NOT NULL,
  style_id text NOT NULL REFERENCES public.product_styles(id),
  style_version_id text NOT NULL REFERENCES public.product_style_versions(id),
  created_at timestamptz NOT NULL, created_by text NOT NULL,
  UNIQUE (id, brand_id, style_id, style_version_id)
);
CREATE TABLE public.digital_sample_versions (
  id text PRIMARY KEY, series_id text NOT NULL, revision integer NOT NULL CHECK (revision > 0),
  previous_version_id text, brand_id text NOT NULL, style_id text NOT NULL, style_version_id text NOT NULL,
  style_version_hash text NOT NULL CHECK (style_version_hash ~ '^[a-f0-9]{64}$'),
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  canonical_manifest text NOT NULL CHECK (octet_length(canonical_manifest) <= 32768),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL, created_by text NOT NULL,
  UNIQUE (series_id, revision), UNIQUE (id, series_id), UNIQUE (id, brand_id, style_id, style_version_id),
  FOREIGN KEY (series_id, brand_id, style_id, style_version_id)
    REFERENCES public.digital_sample_series(id, brand_id, style_id, style_version_id),
  FOREIGN KEY (previous_version_id, series_id) REFERENCES public.digital_sample_versions(id, series_id),
  CHECK ((revision = 1 AND previous_version_id IS NULL) OR (revision > 1 AND previous_version_id IS NOT NULL)),
  CHECK (payload @> '{"artifactVerification":"declared_only","reviewStatus":"not_reviewed","viewable":false,"productionReady":false}'),
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id),
  CHECK ((payload->>'seriesId') IS NOT DISTINCT FROM series_id),
  CHECK ((payload->>'revision') IS NOT DISTINCT FROM revision::text),
  CHECK ((payload->>'previousVersionId') IS NOT DISTINCT FROM previous_version_id),
  CHECK ((payload->>'brandId') IS NOT DISTINCT FROM brand_id),
  CHECK ((payload->>'styleId') IS NOT DISTINCT FROM style_id),
  CHECK ((payload->>'styleVersionId') IS NOT DISTINCT FROM style_version_id),
  CHECK ((payload->>'styleVersionContentHash') IS NOT DISTINCT FROM style_version_hash),
  CHECK ((payload->>'manifestHash') IS NOT DISTINCT FROM manifest_hash),
  CHECK ((payload->>'createdBy') IS NOT DISTINCT FROM created_by),
  CHECK ((payload->>'createdAt')::timestamptz IS NOT DISTINCT FROM created_at),
  CHECK (canonical_manifest::jsonb = payload - 'manifestHash'),
  CHECK (encode(sha256(convert_to(canonical_manifest, 'UTF8')), 'hex') = manifest_hash)
);
CREATE TABLE public.digital_sample_scenarios (
  id text PRIMARY KEY, sample_version_id text NOT NULL, brand_id text NOT NULL, style_id text NOT NULL,
  style_version_id text NOT NULL, manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  canonical_manifest text NOT NULL CHECK (octet_length(canonical_manifest) <= 32768),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL, created_by text NOT NULL,
  FOREIGN KEY (sample_version_id, brand_id, style_id, style_version_id)
    REFERENCES public.digital_sample_versions(id, brand_id, style_id, style_version_id),
  CHECK (payload @> '{"dataClass":"planning_estimate","productionReady":false,"calculation":{"basis":"manual_estimate","formulaVersion":"digital-batch-scenario-v1","productionReady":false,"demandVerified":false}}'),
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id),
  CHECK ((payload->>'sampleVersionId') IS NOT DISTINCT FROM sample_version_id),
  CHECK ((payload->>'brandId') IS NOT DISTINCT FROM brand_id),
  CHECK ((payload->>'styleId') IS NOT DISTINCT FROM style_id),
  CHECK ((payload->>'styleVersionId') IS NOT DISTINCT FROM style_version_id),
  CHECK ((payload->>'manifestHash') IS NOT DISTINCT FROM manifest_hash),
  CHECK ((payload->>'createdBy') IS NOT DISTINCT FROM created_by),
  CHECK ((payload->>'createdAt')::timestamptz IS NOT DISTINCT FROM created_at),
  CHECK (canonical_manifest::jsonb = payload - 'manifestHash'),
  CHECK (encode(sha256(convert_to(canonical_manifest, 'UTF8')), 'hex') = manifest_hash)
);
CREATE INDEX digital_sample_series_style_page ON public.digital_sample_series(style_version_id, id);
CREATE INDEX digital_sample_version_style_page ON public.digital_sample_versions(style_version_id, series_id, revision DESC);
CREATE INDEX digital_sample_scenario_sample_page ON public.digital_sample_scenarios(sample_version_id, id);

CREATE FUNCTION public.digital_sample_series_lineage_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v record;
BEGIN
  SELECT style_id, brand_id INTO v FROM public.product_style_versions WHERE id = NEW.style_version_id FOR SHARE;
  IF NOT FOUND OR v.style_id IS DISTINCT FROM NEW.style_id OR v.brand_id IS DISTINCT FROM NEW.brand_id THEN
    RAISE EXCEPTION 'DIGITAL_SAMPLE_LINEAGE_CONFLICT' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER digital_sample_series_lineage BEFORE INSERT ON public.digital_sample_series
  FOR EACH ROW EXECUTE FUNCTION public.digital_sample_series_lineage_guard();

CREATE FUNCTION public.digital_sample_version_append_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head record; source_hash text;
BEGIN
  PERFORM 1 FROM public.digital_sample_series WHERE id = NEW.series_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DIGITAL_SAMPLE_NOT_FOUND' USING ERRCODE = '23503'; END IF;
  SELECT id, revision INTO head FROM public.digital_sample_versions
    WHERE series_id = NEW.series_id ORDER BY revision DESC LIMIT 1;
  IF NEW.revision IS DISTINCT FROM COALESCE(head.revision, 0) + 1
      OR NEW.previous_version_id IS DISTINCT FROM head.id THEN
    RAISE EXCEPTION 'DIGITAL_SAMPLE_CONCURRENCY_CONFLICT' USING ERRCODE = '40001';
  END IF;
  SELECT content_hash INTO source_hash FROM public.product_style_versions WHERE id = NEW.style_version_id FOR SHARE;
  IF source_hash IS DISTINCT FROM NEW.style_version_hash THEN
    RAISE EXCEPTION 'DIGITAL_SAMPLE_LINEAGE_CONFLICT' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER digital_sample_version_append BEFORE INSERT ON public.digital_sample_versions
  FOR EACH ROW EXECUTE FUNCTION public.digital_sample_version_append_guard();

CREATE FUNCTION public.digital_sample_scenario_lineage_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sample record;
BEGIN
  SELECT manifest_hash, style_version_hash INTO sample FROM public.digital_sample_versions
    WHERE id = NEW.sample_version_id FOR SHARE;
  IF NOT FOUND OR (NEW.payload->>'sampleManifestHash') IS DISTINCT FROM sample.manifest_hash
    OR (NEW.payload->>'styleVersionContentHash') IS DISTINCT FROM sample.style_version_hash THEN
    RAISE EXCEPTION 'DIGITAL_SAMPLE_LINEAGE_CONFLICT' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER digital_sample_scenario_lineage BEFORE INSERT ON public.digital_sample_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.digital_sample_scenario_lineage_guard();

CREATE FUNCTION public.digital_sample_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DIGITAL_SAMPLE_IMMUTABLE' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER digital_sample_series_immutable BEFORE UPDATE OR DELETE ON public.digital_sample_series FOR EACH ROW EXECUTE FUNCTION public.digital_sample_immutable_guard();
CREATE TRIGGER digital_sample_version_immutable BEFORE UPDATE OR DELETE ON public.digital_sample_versions FOR EACH ROW EXECUTE FUNCTION public.digital_sample_immutable_guard();
CREATE TRIGGER digital_sample_scenario_immutable BEFORE UPDATE OR DELETE ON public.digital_sample_scenarios FOR EACH ROW EXECUTE FUNCTION public.digital_sample_immutable_guard();
CREATE TRIGGER digital_sample_command_immutable BEFORE UPDATE OR DELETE ON public.digital_sample_commands FOR EACH ROW EXECUTE FUNCTION public.digital_sample_immutable_guard();

REVOKE ALL ON public.digital_sample_series, public.digital_sample_versions,
  public.digital_sample_scenarios, public.digital_sample_commands FROM PUBLIC;
REVOKE ALL ON FUNCTION public.digital_sample_series_lineage_guard(), public.digital_sample_version_append_guard(),
  public.digital_sample_scenario_lineage_guard(), public.digital_sample_immutable_guard() FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON public.digital_sample_series, public.digital_sample_versions, public.digital_sample_scenarios, public.digital_sample_commands FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
