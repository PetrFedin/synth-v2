import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresInlineQualityStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getExecutionByCode(executionCode) {
      const result = await client.query('SELECT payload FROM production_executions WHERE execution_code = $1 FOR SHARE', [executionCode]);
      return result.rows[0]?.payload;
    },
    // Каталог целиком, включая выведенные из обращения: the domain distinguishes «нет такого кода»
    // from «этот код выведен», and it can only do that if it is shown both.
    async listDefectTypes(brandId) {
      const result = await client.query('SELECT payload FROM defect_types WHERE brand_id = $1 ORDER BY code', [brandId]);
      return result.rows.map((row) => row.payload);
    },
    async getDefectTypeByCode(brandId, code) {
      const result = await client.query('SELECT payload FROM defect_types WHERE brand_id = $1 AND code = $2 FOR UPDATE', [brandId, code]);
      return result.rows[0]?.payload;
    },
    async insertDefectType(value) {
      try {
        await client.query(
          `INSERT INTO defect_types (id,brand_id,code,severity,origin_stage,name_ru,name_en,status,version,created_at,created_by,updated_at,payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11,$12::timestamptz,$13::jsonb)`,
          [value.id, value.brandId, value.code, value.severity, value.originStage, value.nameRu, value.nameEn, value.status, value.version, value.createdAt, value.createdBy, value.updatedAt, JSON.stringify(value)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'DEFECT_TYPE_ALREADY_REGISTERED', 'This defect code is already in the brand catalogue', { code: value.code });
        throw error;
      }
    },
    async saveDefectType(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Defect type version must increment exactly once');
      const result = await client.query(
        'UPDATE defect_types SET status = $3, version = $4, updated_at = $5::timestamptz, payload = $6::jsonb WHERE id = $1 AND version = $2',
        [value.id, expectedVersion, value.status, value.version, value.updatedAt, JSON.stringify(value)],
      );
      invariant(result.rowCount === 1, 'DEFECT_TYPE_CONCURRENCY_CONFLICT', 'Defect type was changed by another operation', { code: value.code, expectedVersion });
    },
    // Номер проверки на этапе. Taken under a lock on the execution row so two inspectors recording
    // at the same moment cannot both be told they are number three.
    async nextCheckNumber(executionId, milestoneCode) {
      await client.query('SELECT id FROM production_executions WHERE id = $1 FOR UPDATE', [executionId]);
      const result = await client.query(
        'SELECT COALESCE(max(check_number), 0) + 1 AS next FROM inline_quality_checks WHERE execution_id = $1 AND milestone_code = $2',
        [executionId, milestoneCode],
      );
      return Number(result.rows[0].next);
    },
    // Операция технологической последовательности, если проверка её называет.
    async getOperationById(operationId) {
      const result = await client.query(
        `SELECT operation.id, operation.operation_code AS "operationCode", operation.name_ru AS "nameRu",
                operation.stage, sequence.sku
           FROM bol_operations AS operation
           JOIN bol_sequences AS sequence ON sequence.id = operation.sequence_id
          WHERE operation.id = $1 FOR SHARE`,
        [operationId],
      );
      return result.rows[0] ?? null;
    },
    async insertCheck(value) {
      await client.query(
        `INSERT INTO inline_quality_checks (
           id,brand_id,execution_id,execution_code,milestone_code,check_number,checked_quantity,defective_quantity,
           status,disposition,disposition_notes,inspector_name,version,recorded_at,recorded_by,operation_id,payload
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,NULL,$10,$11,$12::timestamptz,$13,$14,$15::jsonb)`,
        [value.id, value.brandId, value.executionId, value.executionCode, value.milestoneCode, value.checkNumber,
          value.checkedQuantity, value.defectiveQuantity, value.status, value.inspectorName, value.version,
          value.recordedAt, value.recordedBy, value.operationId ?? null, JSON.stringify(value)],
      );
      for (const [index, defect] of value.defects.entries()) {
        // The code and the severity written here are overwritten by the catalogue trigger. They are
        // passed anyway so that a mismatch is a refusal in the database rather than a silent
        // correction of something the domain believed.
        await client.query(
          'INSERT INTO inline_quality_defects (id,check_id,defect_type_id,defect_code,severity,quantity,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)',
          [`${value.id}_${index + 1}`, value.id, defect.defectTypeId, defect.defectCode, defect.severity, defect.quantity, JSON.stringify(defect)],
        );
      }
    },
    async getCheckById(checkId) {
      const result = await client.query('SELECT payload FROM inline_quality_checks WHERE id = $1 FOR UPDATE', [checkId]);
      return result.rows[0]?.payload;
    },
    async saveCheck(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Inline check version must increment exactly once');
      const result = await client.query(
        `UPDATE inline_quality_checks
            SET status = $3, disposition = $4, disposition_notes = $5, version = $6,
                dispositioned_at = $7::timestamptz, dispositioned_by = $8, payload = $9::jsonb
          WHERE id = $1 AND version = $2`,
        [value.id, expectedVersion, value.status, value.disposition, value.dispositionNotes, value.version,
          value.dispositionedAt, value.dispositionedBy, JSON.stringify(value)],
      );
      invariant(result.rowCount === 1, 'INLINE_QC_CONCURRENCY_CONFLICT', 'This inline check was changed by another operation', { checkId: value.id, expectedVersion });
    },
    getCommand: (id) => getRegisteredCommand(client, 'catalog', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'catalog', value),
    async appendOutbox(event) {
      try {
        await client.query("INSERT INTO outbox_events (id,event_type,aggregate_id,status,event,published_at) VALUES ($1,$2,$3,'pending',$4::jsonb,NULL)", [event.id, event.type, event.aggregateId, JSON.stringify(event)]);
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'OUTBOX_EVENT_ALREADY_EXISTS', 'Outbox event already exists', { eventId: event.id });
        throw error;
      }
    },
  });
}
