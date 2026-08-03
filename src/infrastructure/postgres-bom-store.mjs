import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresBomStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getBomBySku(sku) {
      const result = await pool.query('SELECT payload FROM boms WHERE sku = $1', [sku]);
      return result.rows[0]?.payload;
    },
  });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getSku(sku) {
      const result = await client.query('SELECT payload FROM catalog_skus WHERE sku = $1 FOR SHARE', [sku]);
      return result.rows[0]?.payload;
    },
    async getMaterials(codes) {
      if (!codes.length) return [];
      const result = await client.query(
        'SELECT payload FROM materials WHERE code = ANY($1::text[]) ORDER BY code FOR SHARE',
        [codes],
      );
      return result.rows.map((row) => row.payload);
    },
    async getBomBySku(sku) {
      const result = await client.query('SELECT payload FROM boms WHERE sku = $1 FOR UPDATE', [sku]);
      return result.rows[0]?.payload;
    },
    async insertBom(bom) {
      try {
        await client.query(
          `INSERT INTO boms
             (id, sku, brand_id, status, currency, material_cost, labor_cost, overhead_cost, logistics_cost, other_cost, total_cost, version, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
          bomParameters(bom),
        );
        await insertBomLines(client, bom);
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'BOM_ALREADY_EXISTS', 'BOM or BOM line already exists', { sku: bom.sku });
        throw error;
      }
    },
    async saveBom(bom, expectedVersion) {
      invariant(bom.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      const result = await client.query(
        `UPDATE boms
            SET status = $4,
                currency = $5,
                material_cost = $6,
                labor_cost = $7,
                overhead_cost = $8,
                logistics_cost = $9,
                other_cost = $10,
                total_cost = $11,
                version = $12,
                payload = $13::jsonb
          WHERE id = $1 AND sku = $2 AND brand_id = $3 AND version = $14`,
        [...bomParameters(bom), expectedVersion],
      );
      invariant(result.rowCount === 1, 'BOM_CONCURRENCY_CONFLICT', 'BOM concurrency conflict', { sku: bom.sku, expectedVersion });
      await client.query('DELETE FROM bom_lines WHERE bom_id = $1', [bom.id]);
      await insertBomLines(client, bom);
    },
    getCommand: (id) => getRegisteredCommand(client, 'catalog', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'catalog', value),
    async appendOutbox(event) {
      try {
        await client.query(
          `INSERT INTO outbox_events (id, event_type, aggregate_id, status, event, published_at)
           VALUES ($1, $2, $3, 'pending', $4::jsonb, NULL)`,
          [event.id, event.type, event.aggregateId, JSON.stringify(event)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'OUTBOX_EVENT_ALREADY_EXISTS', 'Outbox event already exists', { eventId: event.id });
        throw error;
      }
    },
  });
}

function bomParameters(bom) {
  return [
    bom.id,
    bom.sku,
    bom.brandId,
    bom.status,
    bom.currency,
    bom.materialCost,
    bom.laborCost,
    bom.overheadCost,
    bom.logisticsCost,
    bom.otherCost,
    bom.totalCost,
    bom.version,
    JSON.stringify(bom),
  ];
}

async function insertBomLines(client, bom) {
  const records = bom.lines.map((line) => ({
    line_id: line.lineId,
    position: line.position,
    component: line.component,
    material_code: line.materialCode,
    material_version: line.materialVersion,
    material_type: line.materialType,
    unit: line.unit,
    quantity: line.quantity,
    waste_percent: line.wastePercent,
    gross_quantity: line.grossQuantity,
    material_currency: line.materialCurrency,
    unit_cost_snapshot: line.unitCostSnapshot,
    exchange_rate: line.exchangeRate,
    line_cost: line.lineCost,
    payload: line,
  }));
  await client.query(
    `INSERT INTO bom_lines
       (bom_id, line_id, position, component, material_code, material_version, material_type, unit,
        quantity, waste_percent, gross_quantity, material_currency, unit_cost_snapshot, exchange_rate, line_cost, payload)
     SELECT $1, line.line_id, line.position, line.component, line.material_code, line.material_version,
            line.material_type, line.unit, line.quantity, line.waste_percent, line.gross_quantity,
            line.material_currency, line.unit_cost_snapshot, line.exchange_rate, line.line_cost, line.payload
       FROM jsonb_to_recordset($2::jsonb) AS line(
         line_id text,
         position integer,
         component text,
         material_code text,
         material_version integer,
         material_type text,
         unit text,
         quantity numeric(20, 4),
         waste_percent numeric(20, 4),
         gross_quantity numeric(20, 4),
         material_currency char(3),
         unit_cost_snapshot numeric(20, 4),
         exchange_rate numeric(20, 4),
         line_cost numeric(20, 4),
         payload jsonb
       )`,
    [bom.id, JSON.stringify(records)],
  );
}
