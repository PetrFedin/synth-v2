import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresSupplierPaymentStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getProductionOrderByNumber(productionOrderNumber) {
      const result = await client.query('SELECT payload FROM production_orders WHERE production_order_number = $1 FOR SHARE', [productionOrderNumber]);
      return result.rows[0]?.payload;
    },
    async getSupplierByCode(brandId, supplierCode) {
      const result = await client.query('SELECT payload FROM suppliers WHERE brand_id = $1 AND supplier_code = $2 FOR SHARE', [brandId, supplierCode]);
      return result.rows[0]?.payload;
    },
    // Самый ранний допуск к отгрузке по заказу. A lot re-inspected and released twice is released
    // once as far as money is concerned: the term runs from when the goods were first cleared.
    async getEarliestShipmentRelease(productionOrderNumber) {
      const result = await client.query(
        'SELECT released_at AS "releasedAt", release_code AS "releaseCode" FROM quality_shipment_releases WHERE production_order_number = $1 ORDER BY released_at LIMIT 1',
        [productionOrderNumber],
      );
      const row = result.rows[0];
      return row ? { releasedAt: new Date(row.releasedAt).toISOString(), releaseCode: row.releaseCode } : null;
    },
    async getScheduleByOrderNumber(productionOrderNumber) {
      const result = await client.query('SELECT payload FROM payment_schedules WHERE production_order_number = $1 FOR UPDATE', [productionOrderNumber]);
      return result.rows[0]?.payload;
    },
    async insertSchedule(value) {
      try {
        await client.query(
          `INSERT INTO payment_schedules (id,brand_id,production_order_number,supplier_code,currency,total_amount_minor,payment_terms_days,version,created_at,created_by,updated_at,payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10,$11::timestamptz,$12::jsonb)`,
          [value.id, value.brandId, value.productionOrderNumber, value.supplierCode, value.currency, value.totalAmountMinor, value.paymentTermsDays, value.version, value.createdAt, value.createdBy, value.updatedAt, JSON.stringify(value)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'PAYMENT_SCHEDULE_EXISTS', 'This production order already has a payment schedule', { productionOrderNumber: value.productionOrderNumber });
        throw error;
      }
      await insertMilestones(client, value);
    },
    async saveSchedule(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Payment schedule version must increment exactly once');
      const result = await client.query(
        'UPDATE payment_schedules SET version = $3, updated_at = $4::timestamptz, payload = $5::jsonb WHERE id = $1 AND version = $2',
        [value.id, expectedVersion, value.version, value.updatedAt, JSON.stringify(value)],
      );
      invariant(result.rowCount === 1, 'PAYMENT_CONCURRENCY_CONFLICT', 'This payment schedule was changed by another operation', { productionOrderNumber: value.productionOrderNumber, expectedVersion });
      // Каждая веха пишется своей строкой: правило «нельзя заплатить раньше события» стоит триггером
      // на строке, и обновление payload целиком его бы не потревожило.
      for (const milestone of value.milestones) {
        await client.query(
          `UPDATE payment_milestones SET paid_at = $3::timestamptz, paid_by = $4, payment_reference = $5, payload = $6::jsonb
            WHERE schedule_id = $1 AND sequence = $2`,
          [value.id, milestone.sequence, milestone.paidAt, milestone.paidBy, milestone.paymentReference, JSON.stringify(milestone)],
        );
      }
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

async function insertMilestones(client, value) {
  for (const milestone of value.milestones) {
    await client.query(
      `INSERT INTO payment_milestones (id,schedule_id,sequence,trigger_event,share_basis_points,amount_minor,label_ru,label_en,payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [`${value.id}_${milestone.sequence}`, value.id, milestone.sequence, milestone.triggerEvent, milestone.shareBasisPoints, milestone.amountMinor, milestone.labelRu, milestone.labelEn, JSON.stringify(milestone)],
    );
  }
}
