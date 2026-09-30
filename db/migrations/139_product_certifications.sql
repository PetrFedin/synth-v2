BEGIN;

-- Сертификация как раздел продукта (docs/backlog-not-yet-integrated.md, раздел 3: «сертификация как
-- раздел продукта» — не построено). `product_styles.lifecycle_status` уже несёт стадию
-- `compliance_ready`, но ни одной строки данных, отвечающей на вопрос «чем именно подтверждена эта
-- готовность», не существовало нигде — ни в домене, ни в схеме.
--
-- Форма — та же изменяемая шапка с замороженным составом и путём «черновик → выставлен → заменён»,
-- что уже несёт `compliance_documents` (миграция 136): у сертификата нет «версии содержимого», есть
-- либо ещё не подтверждённый черновик, либо навсегда выставленный сертификат, либо сертификат,
-- замененный новым при продлении. Но это НЕ тот же самый документ повторно: `compliance_documents`
-- выставляется юрлицом на юрлицо-контрагента (торговый/налоговый документ), а сертификат продукта —
-- заключение внешнего органа по стандарту (OEKO-TEX, GOTS, GRS и т. п.) о конкретном стиле бренда;
-- ни юрлица-эмитента, ни контрагента, ни статуса ЭДО тут нет вовсе. Заводить общую с
-- compliance_documents таблицу означало бы смешать два разных предмета ради формального сходства.
--
-- Стандарт (`certification_type`) — свободный текст, а не перечисление и не MDM-справочник: в отличие
-- от цвета (`mdm-dictionary:colour-colour`), управляемого словаря стандартов сертификации в проекте
-- нет и заводить его ради одной таблицы было бы преждевременно — тем же приёмом, что уже принят для
-- свободного поля состава материала (раздел 7 бэклога).
CREATE TABLE product_certification_commands (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  actor_id text NOT NULL,
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL,
  CONSTRAINT product_certification_commands_command_registry_fk
    FOREIGN KEY (id) REFERENCES command_registry(id) ON DELETE RESTRICT
);

CREATE INDEX product_certification_commands_completed_idx
  ON product_certification_commands (completed_at, id);

ALTER TABLE command_registry
  DROP CONSTRAINT IF EXISTS command_registry_scope_check;
ALTER TABLE command_registry
  ADD CONSTRAINT command_registry_scope_check
  CHECK (scope IN ('wholesale', 'catalog', 'notification', 'product-identity', 'product-readiness', 'legal-entity', 'material-sourcing', 'compliance-document', 'product-certification'));

CREATE TABLE product_certifications (
  id text PRIMARY KEY,
  style_id text NOT NULL,
  brand_id text NOT NULL,
  certification_type text NOT NULL CHECK (length(trim(certification_type)) BETWEEN 2 AND 200),
  certificate_number text NOT NULL CHECK (length(trim(certificate_number)) BETWEEN 1 AND 120),
  issuing_body text NOT NULL CHECK (length(trim(issuing_body)) BETWEEN 2 AND 200),
  status text NOT NULL CHECK (status IN ('draft', 'issued', 'superseded')),
  valid_from date NULL,
  valid_to date NULL,
  supersedes_certification_id text NULL REFERENCES product_certifications(id),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  issued_at timestamptz NULL,
  superseded_at timestamptz NULL,
  UNIQUE (style_id, certificate_number),
  UNIQUE (id, brand_id),
  CONSTRAINT product_certifications_style_brand_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles (id, brand_id),
  CONSTRAINT product_certifications_not_self_superseding CHECK (supersedes_certification_id IS NULL OR supersedes_certification_id <> id),
  CONSTRAINT product_certifications_validity_order_check CHECK (
    valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from
  ),
  CONSTRAINT product_certifications_payload_projection_check CHECK (
    payload ?& ARRAY['id','styleId','brandId','certificationType','certificateNumber','issuingBody','status','validFrom','validTo','supersedesCertificationId','version']
    AND payload ->> 'id' = id
    AND payload ->> 'styleId' = style_id
    AND payload ->> 'brandId' = brand_id
    AND payload ->> 'certificationType' = certification_type
    AND payload ->> 'certificateNumber' = certificate_number
    AND payload ->> 'issuingBody' = issuing_body
    AND payload ->> 'status' = status
    AND (payload ->> 'version')::integer = version
    AND (
      (valid_from IS NULL AND payload -> 'validFrom' = 'null'::jsonb)
      OR (payload ->> 'validFrom')::date = valid_from
    )
    AND (
      (valid_to IS NULL AND payload -> 'validTo' = 'null'::jsonb)
      OR (payload ->> 'validTo')::date = valid_to
    )
    AND (
      (supersedes_certification_id IS NULL AND payload -> 'supersedesCertificationId' = 'null'::jsonb)
      OR payload ->> 'supersedesCertificationId' = supersedes_certification_id
    )
  ),
  CONSTRAINT product_certifications_state_check CHECK (
    (status = 'draft' AND issued_at IS NULL AND superseded_at IS NULL)
    OR (status = 'issued' AND issued_at IS NOT NULL AND superseded_at IS NULL)
    OR (status = 'superseded' AND issued_at IS NOT NULL AND superseded_at IS NOT NULL)
  ),
  CONSTRAINT product_certifications_time_order_check CHECK (
    updated_at >= created_at
    AND (issued_at IS NULL OR issued_at >= created_at)
    AND (superseded_at IS NULL OR (issued_at IS NOT NULL AND superseded_at >= issued_at))
  )
);

CREATE INDEX product_certifications_style_status_idx
  ON product_certifications (style_id, status, certification_type);
CREATE INDEX product_certifications_supersedes_idx
  ON product_certifications (supersedes_certification_id)
  WHERE supersedes_certification_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_product_certification_head_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
      OLD.style_id, OLD.brand_id, OLD.certification_type, OLD.certificate_number, OLD.issuing_body,
      OLD.valid_from, OLD.valid_to, OLD.supersedes_certification_id, OLD.created_at, OLD.created_by
    ) IS DISTINCT FROM ROW(
      NEW.style_id, NEW.brand_id, NEW.certification_type, NEW.certificate_number, NEW.issuing_body,
      NEW.valid_from, NEW.valid_to, NEW.supersedes_certification_id, NEW.created_at, NEW.created_by
    ) THEN
    RAISE EXCEPTION 'Product Certification identity and issuance context are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'product_certifications_identity_immutable';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Product Certification version must increase exactly by one: old %, new %', OLD.version, NEW.version
      USING ERRCODE = '23514', CONSTRAINT = 'product_certifications_version_sequence';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_certifications_validate_update ON product_certifications;
CREATE TRIGGER product_certifications_validate_update
BEFORE UPDATE ON product_certifications
FOR EACH ROW EXECUTE FUNCTION enforce_product_certification_head_update();

CREATE OR REPLACE FUNCTION enforce_product_certification_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Product Certification rows are never deleted; supersede instead'
    USING ERRCODE = '23514', CONSTRAINT = 'product_certifications_no_delete';
END;
$$;

DROP TRIGGER IF EXISTS product_certifications_no_delete ON product_certifications;
CREATE TRIGGER product_certifications_no_delete
BEFORE DELETE ON product_certifications
FOR EACH ROW EXECUTE FUNCTION enforce_product_certification_no_delete();

COMMENT ON TABLE product_certifications IS 'Product-level compliance certification registry (OEKO-TEX, GOTS, GRS, etc.), issued against a style. Mirrors compliance_documents governance shape, but scoped to the product rather than a trading legal entity.';

COMMIT;
