BEGIN;

-- Юридическое лицо — фундамент под российские реквизиты, документы и ЭДО (docs/backlog-not-yet-integrated.md,
-- раздел 3): организация (`organisations`) остаётся стороной сделки, юрлицо — то, кем эта сторона
-- является перед налоговой и банком. Один бренд ведёт торговлю от нескольких юрлиц (разные рынки, разные
-- ставки НДС), один магазин обычно — от одного; связь поэтому «многие юрлица на одну организацию», а не
-- замена самой организации.
--
-- Реквизиты меняются: банк, адрес, подписант. Но документ, уже выставленный на конкретные реквизиты, не
-- должен переехать на новые молча — значит нужна та же форма, что у размерной шкалы бренда (миграция 052):
-- изменяемая шапка (`legal_entities`, код и организация неизменны, версия растёт строго на 1) и неизменяемая
-- цепочка версий (`legal_entity_versions`), на конкретную версию которой будущий документ сможет
-- сослаться навсегда, а не на «текущие реквизиты» без даты.
--
-- Реестр без потребителя: этой миграцией юрлицо ни к чему не привязывается (ни к заказу, ни к документу) —
-- это следующий, отдельный слайс. Здесь оно должно только существовать и годами держать точную историю.

ALTER TABLE command_registry
  DROP CONSTRAINT IF EXISTS command_registry_scope_check;
ALTER TABLE command_registry
  ADD CONSTRAINT command_registry_scope_check
  CHECK (scope IN ('wholesale', 'catalog', 'notification', 'product-identity', 'product-readiness', 'legal-entity'));

CREATE TABLE legal_entity_commands (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  actor_id text NOT NULL,
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL,
  CONSTRAINT legal_entity_commands_command_registry_fk
    FOREIGN KEY (id) REFERENCES command_registry(id) ON DELETE RESTRICT
);

CREATE INDEX legal_entity_commands_completed_idx
  ON legal_entity_commands (completed_at, id);

CREATE TABLE legal_entities (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisations(id),
  entity_code text NOT NULL CHECK (entity_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  status text NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  UNIQUE (organisation_id, entity_code),
  UNIQUE (id, organisation_id),
  CONSTRAINT legal_entities_time_order_check CHECK (updated_at >= created_at)
);

CREATE INDEX legal_entities_org_status_idx
  ON legal_entities (organisation_id, status, entity_code);

CREATE TABLE legal_entity_versions (
  id text PRIMARY KEY,
  legal_entity_id text NOT NULL,
  organisation_id text NOT NULL,
  version_no integer NOT NULL CHECK (version_no > 0),
  -- Два непересекающихся набора обязательных полей живут в одном jsonb, а не в двух таблицах: юрлицо не
  -- меняет юрисдикцию версией, и хранить общий каркас (наименования, версии, неизменяемость) дважды ради
  -- разных наборов полей значило бы задвоить как раз то, что у РФ- и зарубежного юрлица общее.
  jurisdiction text NOT NULL CHECK (jurisdiction IN ('RU', 'FOREIGN')),
  name_ru text NOT NULL CHECK (length(trim(name_ru)) BETWEEN 2 AND 320),
  name_en text NOT NULL CHECK (length(trim(name_en)) BETWEEN 2 AND 320),
  requisites jsonb NOT NULL CHECK (jsonb_typeof(requisites) = 'object'),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  source_legal_entity_version_id text NULL REFERENCES legal_entity_versions(id),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (legal_entity_id, version_no),
  UNIQUE (id, legal_entity_id, organisation_id),
  CONSTRAINT legal_entity_versions_entity_fk
    FOREIGN KEY (legal_entity_id, organisation_id) REFERENCES legal_entities(id, organisation_id),
  CHECK (source_legal_entity_version_id IS NULL OR source_legal_entity_version_id <> id)
);

CREATE INDEX legal_entity_versions_entity_idx
  ON legal_entity_versions (legal_entity_id, version_no DESC);

CREATE OR REPLACE FUNCTION legal_entity_prevent_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Legal Entity version rows are immutable; create a new version instead';
END
$$;

DROP TRIGGER IF EXISTS legal_entity_versions_no_update ON legal_entity_versions;
CREATE TRIGGER legal_entity_versions_no_update
BEFORE UPDATE ON legal_entity_versions
FOR EACH ROW EXECUTE FUNCTION legal_entity_prevent_snapshot_mutation();

DROP TRIGGER IF EXISTS legal_entity_versions_no_delete ON legal_entity_versions;
CREATE TRIGGER legal_entity_versions_no_delete
BEFORE DELETE ON legal_entity_versions
FOR EACH ROW EXECUTE FUNCTION legal_entity_prevent_snapshot_mutation();

CREATE OR REPLACE FUNCTION legal_entity_validate_head_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organisation_id <> OLD.organisation_id OR NEW.entity_code <> OLD.entity_code THEN
    RAISE EXCEPTION 'Legal Entity organisation and code are immutable';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Legal Entity version must increase exactly by one: old %, new %', OLD.version, NEW.version;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS legal_entities_validate_update ON legal_entities;
CREATE TRIGGER legal_entities_validate_update
BEFORE UPDATE ON legal_entities
FOR EACH ROW EXECUTE FUNCTION legal_entity_validate_head_update();

DROP TRIGGER IF EXISTS legal_entities_no_delete ON legal_entities;
CREATE TRIGGER legal_entities_no_delete
BEFORE DELETE ON legal_entities
FOR EACH ROW EXECUTE FUNCTION legal_entity_prevent_snapshot_mutation();

CREATE OR REPLACE FUNCTION legal_entity_validate_version_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_record record;
BEGIN
  IF NEW.source_legal_entity_version_id IS NULL THEN
    IF NEW.version_no <> 1 THEN
      RAISE EXCEPTION 'A Legal Entity Version without a source must be version 1';
    END IF;
    RETURN NEW;
  END IF;

  SELECT legal_entity_id, organisation_id, version_no
    INTO source_record
    FROM legal_entity_versions
   WHERE id = NEW.source_legal_entity_version_id;

  IF NOT FOUND
     OR source_record.legal_entity_id <> NEW.legal_entity_id
     OR source_record.organisation_id <> NEW.organisation_id
     OR source_record.version_no + 1 <> NEW.version_no THEN
    RAISE EXCEPTION 'Legal Entity Version source must be the immediately preceding version of the same Legal Entity and organisation';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS legal_entity_versions_validate_source ON legal_entity_versions;
CREATE TRIGGER legal_entity_versions_validate_source
BEFORE INSERT ON legal_entity_versions
FOR EACH ROW EXECUTE FUNCTION legal_entity_validate_version_source();

COMMENT ON TABLE legal_entities IS 'Legal Entity identity and lifecycle head, scoped to one organisation. Requisites live in the immutable version chain.';
COMMENT ON TABLE legal_entity_versions IS 'Immutable Legal Entity requisites snapshot. Future documents/orders must pin the exact version used, never "current".';

COMMIT;
