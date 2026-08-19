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
    async getCanonicalMeasurement(styleVersionId, colorwayId, sizeScaleVersionId) {
      const result = await pool.query(
        `SELECT payload
           FROM measurement_charts
          WHERE style_version_id = $1
            AND colorway_id = $2
            AND size_scale_version_id = $3`,
        [styleVersionId, colorwayId, sizeScaleVersionId],
      );
      return result.rows[0]?.payload;
    },
    async getMeasurementById(id) {
      const result = await pool.query('SELECT payload FROM measurement_charts WHERE id = $1', [id]);
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
    async getStyleVersion(id) {
      const result = await client.query(
        `SELECT id, style_id, brand_id, version_no, content_hash
           FROM product_style_versions
          WHERE id = $1
          FOR SHARE`,
        [id],
      );
      return result.rows[0] ? mapStyleVersion(result.rows[0]) : undefined;
    },
    async getColorway(id) {
      const result = await client.query(
        `SELECT id, style_version_id, brand_id, colorway_code, name_ru, name_en
           FROM product_colorways
          WHERE id = $1
          FOR SHARE`,
        [id],
      );
      return result.rows[0] ? mapColorway(result.rows[0]) : undefined;
    },
    async getSizeScaleVersion(id) {
      const result = await client.query(
        `SELECT id, size_scale_id, brand_id, version_no, size_system_entry_id, size_system_entry_version, content_hash
           FROM product_size_scale_versions
          WHERE id = $1
          FOR SHARE`,
        [id],
      );
      return result.rows[0] ? mapSizeScaleVersion(result.rows[0]) : undefined;
    },
    async getSizeValuesForScaleVersion(sizeScaleVersionId) {
      const result = await client.query(
        `SELECT id, size_scale_version_id, brand_id, size_code, label_ru, label_en, sort_order,
                size_entry_id, size_entry_version
           FROM product_size_values
          WHERE size_scale_version_id = $1
          ORDER BY sort_order, id
          FOR SHARE`,
        [sizeScaleVersionId],
      );
      return Object.freeze(result.rows.map(mapSizeValue));
    },
    async getCurrentMdmEntry(entryId) {
      const result = await client.query(
        `SELECT version.entry_id,
                version.version,
                version.snapshot,
                entry.tenant_id,
                entry.status,
                entry.approval_status,
                entry.valid_from,
                entry.valid_to,
                entry.version AS current_version,
                dictionary.code AS dictionary_code
           FROM mdm_entries AS entry
           JOIN mdm_dictionaries AS dictionary ON dictionary.id = entry.dictionary_id
           JOIN mdm_entry_versions AS version
             ON version.entry_id = entry.id
            AND version.version = entry.version
          WHERE entry.id = $1
          FOR SHARE OF entry`,
        [entryId],
      );
      return result.rows[0] ? mapMdmReference(result.rows[0]) : undefined;
    },
    async getMeasurementBySku(sku) {
      const result = await client.query('SELECT payload FROM measurement_charts WHERE sku = $1 FOR UPDATE', [sku]);
      return result.rows[0]?.payload;
    },
    async getCanonicalMeasurement(styleVersionId, colorwayId, sizeScaleVersionId) {
      const result = await client.query(
        `SELECT payload
           FROM measurement_charts
          WHERE style_version_id = $1
            AND colorway_id = $2
            AND size_scale_version_id = $3
          FOR UPDATE`,
        [styleVersionId, colorwayId, sizeScaleVersionId],
      );
      return result.rows[0]?.payload;
    },
    async getMeasurementById(id) {
      const result = await client.query('SELECT payload FROM measurement_charts WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0]?.payload;
    },
    async insertMeasurement(chart) {
      try {
        await client.query(
          `INSERT INTO measurement_charts
             (id, sku, brand_id, sku_version, status, unit, base_size_code, version, payload, created_at, updated_at, published_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz, $11::timestamptz, $12::timestamptz)`,
          measurementInsertParameters(chart),
        );
        await insertMatrix(client, chart);
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'MEASUREMENT_ALREADY_EXISTS', 'Measurement chart, size, point or value already exists', { sku: chart.sku });
        throw error;
      }
    },
    async insertCanonicalMeasurement(chart) {
      try {
        await client.query(
          `INSERT INTO measurement_charts
             (id, sku, brand_id, sku_version, status, unit, base_size_code, version, payload, created_at, updated_at, published_at,
              style_version_id, colorway_id, size_scale_version_id, measurement_unit_entry_id, measurement_unit_entry_version, base_size_value_id)
           VALUES ($1, NULL, $2, NULL, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, $9::timestamptz, $10::timestamptz,
                   $11, $12, $13, $14, $15, $16)`,
          [
            chart.id,
            chart.brandId,
            chart.status,
            chart.unit,
            chart.baseSizeCode,
            chart.version,
            JSON.stringify(chart),
            chart.createdAt,
            chart.updatedAt,
            chart.publishedAt,
            chart.styleVersionId,
            chart.colorwayId,
            chart.sizeScaleVersionId,
            chart.measurementUnitEntryId,
            chart.measurementUnitEntryVersion,
            chart.baseSizeValueId,
          ],
        );
        await insertMatrix(client, chart);
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'MEASUREMENT_ALREADY_EXISTS', 'Canonical Measurement Chart already exists for this Product Identity context', {
          styleVersionId: chart.styleVersionId,
          colorwayId: chart.colorwayId,
          sizeScaleVersionId: chart.sizeScaleVersionId,
        });
        throw error;
      }
    },
    async archiveMeasurementRevision(chart, archivedAt) {
      invariant(chart?.status === 'published' && chart.publishedAt, 'MEASUREMENT_NOT_PUBLISHED', 'Only a published measurement chart can be archived');
      try {
        await client.query(
          `INSERT INTO measurement_chart_revisions
             (chart_id, revision_version, sku, brand_id, sku_version, payload, published_at, archived_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $8::timestamptz)`,
          [chart.id, chart.version, chart.sku, chart.brandId, chart.skuVersion, JSON.stringify(chart), chart.publishedAt, archivedAt],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'MEASUREMENT_REVISION_ALREADY_ARCHIVED', 'Published measurement chart revision is already archived', { sku: chart.sku, version: chart.version });
        throw error;
      }
    },
    async archiveCanonicalMeasurementRevision(chart, archivedAt) {
      invariant(chart?.status === 'published' && chart.publishedAt && chart.styleVersionId, 'MEASUREMENT_NOT_PUBLISHED', 'Only a published canonical Measurement Chart can be archived');
      try {
        await client.query(
          `INSERT INTO measurement_chart_revisions
             (chart_id, revision_version, sku, brand_id, sku_version, payload, published_at, archived_at,
              style_version_id, colorway_id, size_scale_version_id, measurement_unit_entry_id, measurement_unit_entry_version, base_size_value_id)
           VALUES ($1, $2, NULL, $3, NULL, $4::jsonb, $5::timestamptz, $6::timestamptz,
                   $7, $8, $9, $10, $11, $12)`,
          [
            chart.id,
            chart.version,
            chart.brandId,
            JSON.stringify(chart),
            chart.publishedAt,
            archivedAt,
            chart.styleVersionId,
            chart.colorwayId,
            chart.sizeScaleVersionId,
            chart.measurementUnitEntryId,
            chart.measurementUnitEntryVersion,
            chart.baseSizeValueId,
          ],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'MEASUREMENT_REVISION_ALREADY_ARCHIVED', 'Published canonical Measurement Chart revision is already archived', { chartId: chart.id, version: chart.version });
        throw error;
      }
    },
    async saveMeasurement(chart, expectedVersion) {
      invariant(chart.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      const result = await client.query(
        `UPDATE measurement_charts
            SET sku_version = $4, status = $5, unit = $6, base_size_code = $7,
                version = $8, payload = $9::jsonb, updated_at = $10::timestamptz,
                published_at = $11::timestamptz
          WHERE id = $1 AND sku = $2 AND brand_id = $3 AND version = $12`,
        measurementUpdateParameters(chart, expectedVersion),
      );
      invariant(result.rowCount === 1, 'MEASUREMENT_CONCURRENCY_CONFLICT', 'Measurement chart concurrency conflict', { sku: chart.sku, expectedVersion });
      await replaceMatrix(client, chart);
    },
    async saveCanonicalMeasurement(chart, expectedVersion) {
      invariant(chart.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Canonical Measurement Chart version must increment exactly once');
      const result = await client.query(
        `UPDATE measurement_charts
            SET status = $5,
                unit = $6,
                base_size_code = $7,
                measurement_unit_entry_id = $8,
                measurement_unit_entry_version = $9,
                base_size_value_id = $10,
                version = $11,
                payload = $12::jsonb,
                updated_at = $13::timestamptz,
                published_at = $14::timestamptz
          WHERE id = $1
            AND style_version_id = $2
            AND colorway_id = $3
            AND size_scale_version_id = $4
            AND version = $15`,
        [
          chart.id,
          chart.styleVersionId,
          chart.colorwayId,
          chart.sizeScaleVersionId,
          chart.status,
          chart.unit,
          chart.baseSizeCode,
          chart.measurementUnitEntryId,
          chart.measurementUnitEntryVersion,
          chart.baseSizeValueId,
          chart.version,
          JSON.stringify(chart),
          chart.updatedAt,
          chart.publishedAt,
          expectedVersion,
        ],
      );
      invariant(result.rowCount === 1, 'MEASUREMENT_CONCURRENCY_CONFLICT', 'Canonical Measurement Chart concurrency conflict', { chartId: chart.id, expectedVersion });
      await replaceMatrix(client, chart);
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

function measurementInsertParameters(chart) { return [chart.id, chart.sku, chart.brandId, chart.skuVersion, chart.status, chart.unit, chart.baseSizeCode, chart.version, JSON.stringify(chart), chart.createdAt, chart.updatedAt, chart.publishedAt]; }
function measurementUpdateParameters(chart, expectedVersion) { return [chart.id, chart.sku, chart.brandId, chart.skuVersion, chart.status, chart.unit, chart.baseSizeCode, chart.version, JSON.stringify(chart), chart.updatedAt, chart.publishedAt, expectedVersion]; }

async function replaceMatrix(client, chart) {
  await client.query('DELETE FROM measurement_values WHERE chart_id = $1', [chart.id]);
  await client.query('DELETE FROM measurement_points WHERE chart_id = $1', [chart.id]);
  await client.query('DELETE FROM measurement_chart_sizes WHERE chart_id = $1', [chart.id]);
  await insertMatrix(client, chart);
}

async function insertMatrix(client, chart) {
  if (chart.styleVersionId) return insertCanonicalMatrix(client, chart);
  const sizes = chart.sizes.map((size) => ({ size_code: size.code, label: size.label, position: size.position }));
  await client.query(
    `INSERT INTO measurement_chart_sizes (chart_id, size_code, label, position)
     SELECT $1, size.size_code, size.label, size.position
       FROM jsonb_to_recordset($2::jsonb) AS size(size_code text, label text, position integer)`,
    [chart.id, JSON.stringify(sizes)],
  );
  const points = chart.points.map((point) => ({ point_code: point.pointCode, position: point.position, name: point.name, description: point.description, tolerance_minus: point.toleranceMinus, tolerance_plus: point.tolerancePlus, base_value: point.baseValue, payload: point }));
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
  const values = chart.points.flatMap((point) => point.measurements.map((measurement) => ({ point_code: point.pointCode, size_code: measurement.sizeCode, value: measurement.value, delta_from_previous: measurement.deltaFromPrevious })));
  await client.query(
    `INSERT INTO measurement_values (chart_id, point_code, size_code, value, delta_from_previous)
     SELECT $1, measurement.point_code, measurement.size_code, measurement.value, measurement.delta_from_previous
       FROM jsonb_to_recordset($2::jsonb) AS measurement(
         point_code text, size_code text, value numeric(20, 4), delta_from_previous numeric(20, 4)
       )`,
    [chart.id, JSON.stringify(values)],
  );
}

async function insertCanonicalMatrix(client, chart) {
  const sizes = chart.sizes.map((size) => ({
    size_code: size.code,
    size_value_id: size.sizeValueId,
    label: size.labelRu,
    label_ru: size.labelRu,
    label_en: size.labelEn,
    position: size.position,
  }));
  await client.query(
    `INSERT INTO measurement_chart_sizes (chart_id, size_code, size_value_id, label, label_ru, label_en, position)
     SELECT $1, size.size_code, size.size_value_id, size.label, size.label_ru, size.label_en, size.position
       FROM jsonb_to_recordset($2::jsonb) AS size(
         size_code text, size_value_id text, label text, label_ru text, label_en text, position integer
       )`,
    [chart.id, JSON.stringify(sizes)],
  );

  const points = chart.points.map((point) => ({
    point_code: point.pointCode,
    point_entry_id: point.pointEntryId,
    point_entry_version: point.pointEntryVersion,
    position: point.position,
    name: point.nameRu,
    name_ru: point.nameRu,
    name_en: point.nameEn,
    description: point.description,
    tolerance_minus: point.toleranceMinus,
    tolerance_plus: point.tolerancePlus,
    base_value: point.baseValue,
    payload: point,
  }));
  await client.query(
    `INSERT INTO measurement_points
       (chart_id, point_code, point_entry_id, point_entry_version, position, name, name_ru, name_en, description,
        tolerance_minus, tolerance_plus, base_value, payload)
     SELECT $1, point.point_code, point.point_entry_id, point.point_entry_version, point.position,
            point.name, point.name_ru, point.name_en, point.description,
            point.tolerance_minus, point.tolerance_plus, point.base_value, point.payload
       FROM jsonb_to_recordset($2::jsonb) AS point(
         point_code text, point_entry_id text, point_entry_version integer, position integer,
         name text, name_ru text, name_en text, description text,
         tolerance_minus numeric(20, 4), tolerance_plus numeric(20, 4),
         base_value numeric(20, 4), payload jsonb
       )`,
    [chart.id, JSON.stringify(points)],
  );

  const values = chart.points.flatMap((point) => point.measurements.map((measurement) => ({
    point_code: point.pointCode,
    size_code: measurement.sizeCode,
    size_value_id: measurement.sizeValueId,
    value: measurement.value,
    delta_from_previous: measurement.deltaFromPrevious,
  })));
  await client.query(
    `INSERT INTO measurement_values (chart_id, point_code, size_code, size_value_id, value, delta_from_previous)
     SELECT $1, measurement.point_code, measurement.size_code, measurement.size_value_id, measurement.value, measurement.delta_from_previous
       FROM jsonb_to_recordset($2::jsonb) AS measurement(
         point_code text, size_code text, size_value_id text, value numeric(20, 4), delta_from_previous numeric(20, 4)
       )`,
    [chart.id, JSON.stringify(values)],
  );
}

function mapStyleVersion(row) {
  return Object.freeze({ id: row.id, styleId: row.style_id, brandId: row.brand_id, versionNo: row.version_no, contentHash: row.content_hash });
}
function mapColorway(row) {
  return Object.freeze({ id: row.id, styleVersionId: row.style_version_id, brandId: row.brand_id, colorwayCode: row.colorway_code, nameRu: row.name_ru, nameEn: row.name_en });
}
function mapSizeScaleVersion(row) {
  return Object.freeze({
    id: row.id,
    sizeScaleId: row.size_scale_id,
    brandId: row.brand_id,
    versionNo: row.version_no,
    sizeSystemRef: row.size_system_entry_id ? Object.freeze({ entryId: row.size_system_entry_id, version: row.size_system_entry_version }) : null,
    contentHash: row.content_hash,
  });
}
function mapSizeValue(row) {
  return Object.freeze({
    id: row.id,
    sizeScaleVersionId: row.size_scale_version_id,
    brandId: row.brand_id,
    sizeCode: row.size_code,
    labelRu: row.label_ru,
    labelEn: row.label_en,
    sortOrder: row.sort_order,
    sizeRef: row.size_entry_id ? Object.freeze({ entryId: row.size_entry_id, version: row.size_entry_version }) : null,
  });
}
function mapMdmReference(row) {
  return Object.freeze({
    entryId: row.entry_id,
    version: row.version,
    currentVersion: row.current_version,
    dictionaryCode: row.dictionary_code,
    tenantId: row.tenant_id,
    status: row.status,
    approvalStatus: row.approval_status,
    validFrom: iso(row.valid_from),
    validTo: iso(row.valid_to),
    snapshot: row.snapshot,
  });
}
function iso(value) { if (value === null || value === undefined) return null; return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
