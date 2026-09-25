BEGIN;

-- Реестр документов соответствия (docs/backlog-not-yet-integrated.md, раздел 3: «Реестр документов
-- соответствия — нет») и первый кирпич российского P0-пласта (раздел 4: «ЭДО / УПД и их статусы»,
-- «документы соответствия ЕАЭС»). Юрлица (миграция 134) уже дают, на чьё имя документ выставлен;
-- этой миграцией к ним добавляется сам документ.
--
-- Три типа в одной таблице, а не три: УПД и декларация/сертификат ЕАЭС расходятся в двух узких местах
-- (у УПД есть статус ЭДО-передачи, у декларации/сертификата — срок действия), а не в форме целиком —
-- обе стороны ссылаются на юрлицо-эмитента и юрлицо-контрагента, обе проходят один и тот же путь
-- «черновик → выставлен → заменён», и заводить общий каркас (нумерация, версия, неизменяемость) дважды
-- значило бы задвоить именно то, что у них общее.
--
-- Форма — как у заказа на материал (миграция 135): изменяемая шапка с `payload jsonb`, замороженным
-- проекцией-чек-констрейнтом, а не отдельная неизменяемая цепочка версий. Версий содержимого документу
-- не нужно: один и тот же документ либо ещё черновик, либо уже выставлен (и тогда его состав
-- заморожен навсегда), либо заменён новым — вместо правки задним числом заводится новый документ со
-- ссылкой на замененный.
--
-- Реестр без потребителя: этой миграцией документ не привязывается ни к заказу, ни к отгрузке — привязка
-- к конкретному заказу/RFQ через `subjectType`/`subjectId` пока не проверяется по внешнему ключу (Route C
-- и коммерческие документы для заказов готовых изделий ещё не построены), только по форме в jsonb.
-- Собственно передача через оператора ЭДО (Диадок/СБИС) — интеграционный каркас, отдельная и большая
-- работа; здесь фиксируется только статус этой передачи, а не сама передача.

ALTER TABLE command_registry
  DROP CONSTRAINT IF EXISTS command_registry_scope_check;
ALTER TABLE command_registry
  ADD CONSTRAINT command_registry_scope_check
  CHECK (scope IN ('wholesale', 'catalog', 'notification', 'product-identity', 'product-readiness', 'legal-entity', 'compliance-document'));

CREATE TABLE compliance_document_commands (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  actor_id text NOT NULL,
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL,
  CONSTRAINT compliance_document_commands_command_registry_fk
    FOREIGN KEY (id) REFERENCES command_registry(id) ON DELETE RESTRICT
);

CREATE INDEX compliance_document_commands_completed_idx
  ON compliance_document_commands (completed_at, id);

CREATE TABLE compliance_documents (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisations(id),
  document_number text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('upd', 'eaeu_declaration_of_conformity', 'eaeu_certificate_of_conformity')),
  issuer_legal_entity_id text NOT NULL,
  issuer_legal_entity_version_id text NOT NULL,
  counterparty_legal_entity_id text NULL REFERENCES legal_entities(id),
  status text NOT NULL CHECK (status IN ('draft', 'issued', 'superseded')),
  edo_status text NULL CHECK (edo_status IN ('sent', 'delivered', 'signed', 'rejected')),
  valid_from date NULL,
  valid_to date NULL,
  supersedes_document_id text NULL REFERENCES compliance_documents(id),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  issued_at timestamptz NULL,
  superseded_at timestamptz NULL,
  UNIQUE (organisation_id, document_number),
  UNIQUE (id, organisation_id),
  CONSTRAINT compliance_documents_issuer_version_fk
    FOREIGN KEY (issuer_legal_entity_version_id, issuer_legal_entity_id, organisation_id)
    REFERENCES legal_entity_versions (id, legal_entity_id, organisation_id),
  CONSTRAINT compliance_documents_not_self_superseding CHECK (supersedes_document_id IS NULL OR supersedes_document_id <> id),
  CONSTRAINT compliance_documents_edo_status_scope_check CHECK (
    edo_status IS NULL OR (document_type = 'upd' AND status IN ('issued', 'superseded'))
  ),
  CONSTRAINT compliance_documents_validity_scope_check CHECK (
    (document_type = 'upd' AND valid_from IS NULL AND valid_to IS NULL)
    OR document_type IN ('eaeu_declaration_of_conformity', 'eaeu_certificate_of_conformity')
  ),
  CONSTRAINT compliance_documents_validity_order_check CHECK (
    valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from
  ),
  CONSTRAINT compliance_documents_payload_projection_check CHECK (
    payload ?& ARRAY['id','organisationId','documentNumber','documentType','issuerLegalEntityId','issuerLegalEntityVersionId','counterpartyLegalEntityId','status','edoStatus','validFrom','validTo','supersedesDocumentId','version']
    AND payload ->> 'id' = id
    AND payload ->> 'organisationId' = organisation_id
    AND payload ->> 'documentNumber' = document_number
    AND payload ->> 'documentType' = document_type
    AND payload ->> 'issuerLegalEntityId' = issuer_legal_entity_id
    AND payload ->> 'issuerLegalEntityVersionId' = issuer_legal_entity_version_id
    AND payload ->> 'status' = status
    AND (payload ->> 'version')::integer = version
    AND (
      (counterparty_legal_entity_id IS NULL AND payload -> 'counterpartyLegalEntityId' = 'null'::jsonb)
      OR payload ->> 'counterpartyLegalEntityId' = counterparty_legal_entity_id
    )
    AND (
      (edo_status IS NULL AND payload -> 'edoStatus' = 'null'::jsonb)
      OR payload ->> 'edoStatus' = edo_status
    )
    AND (
      (valid_from IS NULL AND payload -> 'validFrom' = 'null'::jsonb)
      OR (payload ->> 'validFrom')::date = valid_from
    )
    AND (
      (valid_to IS NULL AND payload -> 'validTo' = 'null'::jsonb)
      OR (payload ->> 'validTo')::date = valid_to
    )
    AND (
      (supersedes_document_id IS NULL AND payload -> 'supersedesDocumentId' = 'null'::jsonb)
      OR payload ->> 'supersedesDocumentId' = supersedes_document_id
    )
  ),
  CONSTRAINT compliance_documents_state_check CHECK (
    (status = 'draft' AND issued_at IS NULL AND superseded_at IS NULL)
    OR (status = 'issued' AND issued_at IS NOT NULL AND superseded_at IS NULL)
    OR (status = 'superseded' AND issued_at IS NOT NULL AND superseded_at IS NOT NULL)
  ),
  CONSTRAINT compliance_documents_time_order_check CHECK (
    updated_at >= created_at
    AND (issued_at IS NULL OR issued_at >= created_at)
    AND (superseded_at IS NULL OR (issued_at IS NOT NULL AND superseded_at >= issued_at))
  )
);

CREATE INDEX compliance_documents_org_status_type_idx
  ON compliance_documents (organisation_id, status, document_type, document_number);
CREATE INDEX compliance_documents_issuer_idx
  ON compliance_documents (issuer_legal_entity_id, document_number);
CREATE INDEX compliance_documents_counterparty_idx
  ON compliance_documents (counterparty_legal_entity_id, document_number)
  WHERE counterparty_legal_entity_id IS NOT NULL;
CREATE INDEX compliance_documents_supersedes_idx
  ON compliance_documents (supersedes_document_id)
  WHERE supersedes_document_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_compliance_document_head_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
      OLD.organisation_id, OLD.document_number, OLD.document_type, OLD.issuer_legal_entity_id,
      OLD.issuer_legal_entity_version_id, OLD.counterparty_legal_entity_id, OLD.valid_from, OLD.valid_to,
      OLD.supersedes_document_id, OLD.created_at, OLD.created_by
    ) IS DISTINCT FROM ROW(
      NEW.organisation_id, NEW.document_number, NEW.document_type, NEW.issuer_legal_entity_id,
      NEW.issuer_legal_entity_version_id, NEW.counterparty_legal_entity_id, NEW.valid_from, NEW.valid_to,
      NEW.supersedes_document_id, NEW.created_at, NEW.created_by
    ) THEN
    RAISE EXCEPTION 'Compliance Document identity and issuance context are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'compliance_documents_identity_immutable';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Compliance Document version must increase exactly by one: old %, new %', OLD.version, NEW.version
      USING ERRCODE = '23514', CONSTRAINT = 'compliance_documents_version_sequence';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS compliance_documents_validate_update ON compliance_documents;
CREATE TRIGGER compliance_documents_validate_update
BEFORE UPDATE ON compliance_documents
FOR EACH ROW EXECUTE FUNCTION enforce_compliance_document_head_update();

CREATE OR REPLACE FUNCTION enforce_compliance_document_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Compliance Document rows are never deleted; supersede instead'
    USING ERRCODE = '23514', CONSTRAINT = 'compliance_documents_no_delete';
END;
$$;

DROP TRIGGER IF EXISTS compliance_documents_no_delete ON compliance_documents;
CREATE TRIGGER compliance_documents_no_delete
BEFORE DELETE ON compliance_documents
FOR EACH ROW EXECUTE FUNCTION enforce_compliance_document_no_delete();

COMMENT ON TABLE compliance_documents IS 'Compliance/commercial document registry (УПД, EAEU declaration/certificate of conformity), issued against a pinned Legal Entity version. Mirrors material_purchase_orders governance shape.';

COMMIT;
