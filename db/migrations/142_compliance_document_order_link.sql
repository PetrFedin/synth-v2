BEGIN;

-- Реестр документов соответствия (миграция 136) сам говорил, чего не хватает: «этой миграцией
-- документ не привязывается ни к заказу, ни к отгрузке». Миграция 137 закрыла отгрузку; заказ
-- оставался открытым тем же самым предложением до этой правки. Декларация/сертификат ЕАЭС нередко
-- выставляется на партию до всякой отгрузки — тогда привязать документ можно только к заказу, и
-- нечем было.
--
-- Ссылка необязательна и заводится только при создании документа, тем же приёмом и в том же
-- неизменяемом наборе колонок, что уже несёт `linked_shipment_notice_snapshot_id`: это часть
-- контекста выставления, а не изменяемый атрибут документа.
ALTER TABLE compliance_documents
  ADD COLUMN linked_order_id text NULL REFERENCES orders (id);

CREATE INDEX compliance_documents_order_idx
  ON compliance_documents (linked_order_id) WHERE linked_order_id IS NOT NULL;

ALTER TABLE compliance_documents
  DROP CONSTRAINT compliance_documents_payload_projection_check;
ALTER TABLE compliance_documents
  ADD CONSTRAINT compliance_documents_payload_projection_check CHECK (
    payload ?& ARRAY['id','organisationId','documentNumber','documentType','issuerLegalEntityId','issuerLegalEntityVersionId','counterpartyLegalEntityId','status','edoStatus','validFrom','validTo','supersedesDocumentId','version','linkedShipmentNoticeSnapshotId','linkedOrderId']
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
    AND (
      (linked_order_id IS NULL AND payload -> 'linkedOrderId' = 'null'::jsonb)
      OR payload ->> 'linkedOrderId' = linked_order_id
    )
  );

-- Ссылка на заказ — часть того же неизменяемого контекста выставления, что уже несёт ссылку на
-- отгрузку: статус меняется, ЭДО-статус меняется, а на какой заказ выставлен документ — нет.
CREATE OR REPLACE FUNCTION enforce_compliance_document_head_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
      OLD.organisation_id, OLD.document_number, OLD.document_type, OLD.issuer_legal_entity_id,
      OLD.issuer_legal_entity_version_id, OLD.counterparty_legal_entity_id, OLD.valid_from, OLD.valid_to,
      OLD.supersedes_document_id, OLD.linked_shipment_notice_snapshot_id, OLD.linked_order_id, OLD.created_at, OLD.created_by
    ) IS DISTINCT FROM ROW(
      NEW.organisation_id, NEW.document_number, NEW.document_type, NEW.issuer_legal_entity_id,
      NEW.issuer_legal_entity_version_id, NEW.counterparty_legal_entity_id, NEW.valid_from, NEW.valid_to,
      NEW.supersedes_document_id, NEW.linked_shipment_notice_snapshot_id, NEW.linked_order_id, NEW.created_at, NEW.created_by
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

COMMENT ON COLUMN compliance_documents.linked_order_id IS
  'Заказ, на который выставлен документ. NULL — законно: декларация/сертификат ЕАЭС нередко выставляется на партию до всякого заказа, а не каждый УПД сопровождает ровно один заказ.';

COMMIT;
