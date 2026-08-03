import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresMeasurementStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getMeasurementBySku(sku) {
      const result = await pool.query('SELECT payload FROM measurement_charts WHERE sku = $1', [sku]);
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
    async getMeasurementBySku(sku) {
      const result = await client.query('SELECT payload FROM measurement_charts WHERE sku = $1 FOR UPDATE', [sku]);
      return result.rows[0]?.payload;
    },
    async insertMeasurement(chart) {
      try {
        await client.query(
          `INSERT INTO measurement_charts
             (id, sku, brand_id, sku_version, status, unit, base_size_code, version, payload, created_at, updated_at, published_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz, $11::timestamptz, $12::timestamptz)`,
          measurementParameters(chart),
        );
        await insertMatrix(client, chart);
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'MEASUREMENT_ALREADY_EXISTS', 'Measurement chart, size, point or value already exists', { sku: chart.sku });
        throw error;
      }
    },
    async saveMeasurement(chart, expectedVersion) {
      invariant(chart.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      const result = await client.query(
        `UPDATE measurement_charts
            SET sku_version = $4, status = $5, unit = $6, base_size_code = $7,
                version = $8, payload = $9::jsonb, updated_at = $11::timestamptz,
                published_at = $12::timestamptz
          WHERE id = $1 AND sku = $2 AND brand_id = $3 AND version = $13`,
        [...measurementParameters(chart), expectedVersion],
      );
      invariant(result.rowCount === 1, 'MEASUREMENT_CONCURRENCY_CONFLICT', 'Measurement chart concurrency conflict', { sku: chart.sku, expectedVersion });
      await client.query('DELETE FROM measurement_values WHERE chart_id = $1', [chart.id]);
      await client.query('DELETE FROM measurement_points WHERE chart_id = $1', [chart.id]);
      await client.query('DELETE FROM measurement_chart_sizes WHERE chart_id = $1', [chart.id]);
      await insertMatrix(client, chart);
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

function measurementParameters(chart) {
  return [
    chart.id,
    chart.sku,
    chart.brandId,
    chart.skuVersion,
    chart.status,
    chart.unit,
    chart.baseSizeCode,
    chart.version,
    JSON.stringify(chart),
    chart.createdAt,
    chart.updatedAt,
    chart.publishedAt,
  ];
}

async function insertMatrix(client, chart) {
  const sizes = chart.sizes.map((size) => ({ size_code: size.code, label: size.label, position: size.position }));
  await client.query(
    `INSERT INTO measurement_chart_sizes (chart_id, size_code, label, position)
     SELECT $1, size.size_code, size.label, size.position
       FROM jsonb_to_recordset($2::jsonb) AS size(size_code text, label text, position integer)`,
    [chart.id, JSON.stringify(sizes)],
  );

  const points = chart.points.map((point) => ({
    point_code: point.pointCode,
    position: point.position,
    name: point.name,
    description: point.description,
    tolerance_minus: point.toleranceMinus,
    tolerance_plus: point.tolerancePlus,
    base_value: point.baseValue,
    payload: point,
  }));
  await client.query(
    `INSERT INTO measurement_points
       (chart_id, point_code, position, name, description, tolerance_minus, tolerance_plus, base_value, payload)
     SELECT $1, point.point_code, point.position, point.name, point.description,
            point.tolerance_minus, point.tolerance_plus, point.base_value, point.payload
       FROM jsonb_to_recordset($2::jsonb) AS point(
         point_code text, position integer, name text, description text,
         tolerance_minus numeric(20, 4), tolerance_plus numeric(20, 4),
         base_value numeric(20, 4), payload jsonb
       )`,
    [chart.id, JSON.stringify(points)],
  );

  const values = chart.points.flatMap((point) => point.measurements.map((measurement) => ({
    point_code: point.pointCode,
    size_code: measurement.sizeCode,
    value: measurement.value,
    delta_from_previous: measurement.deltaFromPrevious,
  })));
  await client.query(
    `INSERT INTO measurement_values (chart_id, point_code, size_code, value, delta_from_previous)
     SELECT $1, measurement.point_code, measurement.size_code, measurement.value, measurement.delta_from_previous
       FROM jsonb_to_recordset($2::jsonb) AS measurement(
         point_code text, size_code text, value numeric(20, 4), delta_from_previous numeric(20, 4)
       )`,
    [chart.id, JSON.stringify(values)],
  );
}
