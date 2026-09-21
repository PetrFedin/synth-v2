import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresCuttingStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getMaterialByCode(code) {
      const result = await client.query('SELECT payload FROM materials WHERE code = $1 FOR SHARE', [code]);
      return result.rows[0]?.payload;
    },
    async getExecutionsByCodes(codes) {
      if (!codes.length) return [];
      const result = await client.query('SELECT payload FROM production_executions WHERE execution_code = ANY($1::text[]) FOR SHARE', [codes]);
      return result.rows.map((row) => row.payload);
    },
    // Выдачи в раскраиваемые партии. Рулон, не выданный ни в одну из них, до стола не доходит.
    async listIssuesForExecutions(executionIds) {
      if (!executionIds.length) return [];
      const result = await client.query(
        `SELECT issue.payload FROM material_lot_issues AS issue
          WHERE issue.execution_id = ANY($1::text[])
          ORDER BY issue.issued_at FOR SHARE`,
        [executionIds],
      );
      return result.rows.map((row) => row.payload);
    },
    async getSpreadById(spreadId) {
      const result = await client.query('SELECT payload FROM cutting_spreads WHERE id = $1 FOR UPDATE', [spreadId]);
      return result.rows[0]?.payload;
    },
    async insertSpread(value) {
      try {
        await client.query(
          `INSERT INTO cutting_spreads (id,brand_id,material_code,spread_reference,marker_length,plies,fabric_width,unit,status,laid_at,laid_by,notes,version,created_at,updated_at,payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11,$12,$13,$14::timestamptz,$15::timestamptz,$16::jsonb)`,
          [value.id, value.brandId, value.materialCode, value.spreadReference, value.markerLength, value.plies, value.fabricWidth,
            value.unit, value.status, value.laidAt, value.laidBy, value.notes, value.version, value.createdAt, value.updatedAt, JSON.stringify(value)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'CUTTING_SPREAD_EXISTS', 'This spread reference is already recorded for this brand', { spreadReference: value.spreadReference });
        throw error;
      }
      // Раскладка пишется раньше рулонов: правило «настелено только из выданного сюда» смотрит на
      // партии этого настила, а значит они уже должны быть на месте.
      for (const [index, output] of value.marker.entries()) {
        await client.query(
          `INSERT INTO cutting_spread_outputs (id,spread_id,execution_id,execution_code,sku,garments_per_ply,payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
          [`${value.id}_m${index + 1}`, value.id, output.executionId, output.executionCode, output.sku, output.garmentsPerPly, JSON.stringify(output)],
        );
      }
      for (const [index, lot] of value.lots.entries()) {
        await client.query(
          `INSERT INTO cutting_spread_lots (id,spread_id,lot_id,lot_reference,quantity,payload)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
          [`${value.id}_l${index + 1}`, value.id, lot.lotId, lot.lotReference, lot.quantity, JSON.stringify(lot)],
        );
      }
    },
    async saveSpread(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Spread version must increment exactly once');
      const result = await client.query(
        'UPDATE cutting_spreads SET status = $3, version = $4, updated_at = $5::timestamptz, payload = $6::jsonb WHERE id = $1 AND version = $2',
        [value.id, expectedVersion, value.status, value.version, value.updatedAt, JSON.stringify(value)],
      );
      invariant(result.rowCount === 1, 'CUTTING_CONCURRENCY_CONFLICT', 'This spread was changed by another operation', { spreadReference: value.spreadReference, expectedVersion });
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
