import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const CONSTRUCTION_NODE_DICTIONARY = 'mdm-dictionary:design-construction-node';

export function createPostgresOperationSequenceStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getCatalogSkuByCode(sku) {
      const result = await client.query('SELECT payload FROM catalog_skus WHERE sku = $1 FOR SHARE', [sku]);
      return result.rows[0]?.payload;
    },
    // Технологические узлы берутся из справочника МДМ, а не из своего списка: второй перечень узлов
    // разошёлся бы с первым, и по узлам перестало бы что-либо складываться.
    async listConstructionNodes() {
      const result = await client.query('SELECT code FROM mdm_entries WHERE dictionary_id = $1 ORDER BY code', [CONSTRUCTION_NODE_DICTIONARY]);
      return result.rows.map((row) => row.code);
    },
    async getSequenceById(sequenceId) {
      const result = await client.query('SELECT payload FROM bol_sequences WHERE id = $1 FOR UPDATE', [sequenceId]);
      return result.rows[0]?.payload;
    },
    async getTemplateByCode(brandId, templateCode) {
      const result = await client.query("SELECT payload FROM bol_sequences WHERE brand_id = $1 AND template_code = $2 AND kind = 'template' FOR SHARE", [brandId, templateCode]);
      return result.rows[0]?.payload;
    },
    async getProductSequenceBySku(brandId, sku) {
      const result = await client.query("SELECT payload FROM bol_sequences WHERE brand_id = $1 AND sku = $2 AND kind = 'product' AND status <> 'retired' FOR SHARE", [brandId, sku]);
      return result.rows[0]?.payload;
    },
    async insertSequence(value) {
      try {
        await client.query(
          `INSERT INTO bol_sequences (id,brand_id,kind,template_code,category,sku,name_ru,name_en,status,source_template_code,notes,version,created_at,created_by,updated_at,payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz,$14,$15::timestamptz,$16::jsonb)`,
          [value.id, value.brandId, value.kind, value.templateCode, value.category, value.sku, value.nameRu, value.nameEn,
            value.status, value.sourceTemplateCode, value.notes, value.version, value.createdAt, value.createdBy, value.updatedAt, JSON.stringify(value)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'BOL_SEQUENCE_EXISTS', 'This sequence already exists', { templateCode: value.templateCode, sku: value.sku });
        throw error;
      }
      await writeOperations(client, value);
    },
    async saveSequence(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Sequence version must increment exactly once');
      const result = await client.query(
        'UPDATE bol_sequences SET status = $3, notes = $4, version = $5, updated_at = $6::timestamptz, payload = $7::jsonb WHERE id = $1 AND version = $2',
        [value.id, expectedVersion, value.status, value.notes, value.version, value.updatedAt, JSON.stringify(value)],
      );
      invariant(result.rowCount === 1, 'BOL_CONCURRENCY_CONFLICT', 'This operation sequence was changed by another operation', { sequenceId: value.id, expectedVersion });
      // Перечень операций переписывается целиком: порядок — это содержание, и точечная правка
      // строк оставила бы дыру в нумерации, которую отложенный триггер всё равно не пропустит.
      await client.query('DELETE FROM bol_operations WHERE sequence_id = $1', [value.id]);
      await writeOperations(client, value);
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

async function writeOperations(client, value) {
  for (const operation of value.operations) {
    await client.query(
      `INSERT INTO bol_operations (id,sequence_id,position,operation_code,name_ru,name_en,stage,construction_node,standard_minutes,equipment,notes,payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
      [`${value.id}_op${operation.position}`, value.id, operation.position, operation.operationCode, operation.nameRu, operation.nameEn,
        operation.stage, operation.constructionNode, operation.standardMinutes, operation.equipment, operation.notes, JSON.stringify(operation)],
    );
  }
}
