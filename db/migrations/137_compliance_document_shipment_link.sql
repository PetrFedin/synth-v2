BEGIN;

-- Реестр документов соответствия (миграция 136) сам говорил, чего не хватает: «этой миграцией
-- документ не привязывается ни к заказу, ни к отгрузке». Пока привязки нет, УПД существует сам по
-- себе — а он выставляется как раз на конкретную поставку, и без ссылки нельзя ответить, какой
-- документ едет с какой партией.
--
-- Ссылка необязательна и заводится только при создании документа: как и у самого документа, у неё
-- нет «версии содержимого» — это часть контекста выставления (кто эмитент, на какую версию его
-- реквизитов, на какую отгрузку), которая либо есть с рождения документа, либо не появляется вовсе.
-- Поэтому она входит в тот же неизменяемый набор колонок, что `issuer_legal_entity_id`,
-- `counterparty_legal_entity_id` и `supersedes_document_id` — см. `enforce_compliance_document_head_update`.
ALTER TABLE compliance_documents
  ADD COLUMN linked_shipment_notice_snapshot_id text NULL REFERENCES shipment_notice_snapshots (id);

CREATE INDEX compliance_documents_shipment_idx
  ON compliance_documents (linked_shipment_notice_snapshot_id) WHERE linked_shipment_notice_snapshot_id IS NOT NULL;

ALTER TABLE compliance_documents
  DROP CONSTRAINT compliance_documents_payload_projection_check;
ALTER TABLE compliance_documents
  ADD CONSTRAINT compliance_documents_payload_projection_check CHECK (
    payload ?& ARRAY['id','organisationId','documentNumber','documentType','issuerLegalEntityId','issuerLegalEntityVersionId','counterpartyLegalEntityId','status','edoStatus','validFrom','validTo','supersedesDocumentId','version','linkedShipmentNoticeSnapshotId']
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
    AND (
      (linked_shipment_notice_snapshot_id IS NULL AND payload -> 'linkedShipmentNoticeSnapshotId' = 'null'::jsonb)
      OR payload ->> 'linkedShipmentNoticeSnapshotId' = linked_shipment_notice_snapshot_id
    )
  );

-- Ссылка на отгрузку — часть контекста выставления документа, тот же список, что уже защищён
-- (`issuer_legal_entity_id`, `counterparty_legal_entity_id`, `supersedes_document_id`, ...): статус
-- меняется, ЭДО-статус меняется, а на какую отгрузку выставлен документ — нет.
CREATE OR REPLACE FUNCTION enforce_compliance_document_head_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
      OLD.organisation_id, OLD.document_number, OLD.document_type, OLD.issuer_legal_entity_id,
      OLD.issuer_legal_entity_version_id, OLD.counterparty_legal_entity_id, OLD.valid_from, OLD.valid_to,
      OLD.supersedes_document_id, OLD.linked_shipment_notice_snapshot_id, OLD.created_at, OLD.created_by
    ) IS DISTINCT FROM ROW(
      NEW.organisation_id, NEW.document_number, NEW.document_type, NEW.issuer_legal_entity_id,
      NEW.issuer_legal_entity_version_id, NEW.counterparty_legal_entity_id, NEW.valid_from, NEW.valid_to,
      NEW.supersedes_document_id, NEW.linked_shipment_notice_snapshot_id, NEW.created_at, NEW.created_by
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

COMMENT ON COLUMN compliance_documents.linked_shipment_notice_snapshot_id IS
  'Отгрузка, на которую выставлен документ. NULL — законно: не каждый документ соответствия сопровождает конкретную отгрузку (например, декларация/сертификат ЕАЭС может выставляться на партию до отгрузки).';

COMMIT;
