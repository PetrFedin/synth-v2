import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresMaterialStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getMaterial(code) {
      const result = await pool.query('SELECT payload FROM materials WHERE code = $1', [code]);
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
    async getMaterial(code) {
      const result = await client.query('SELECT payload FROM materials WHERE code = $1 FOR UPDATE', [code]);
      return result.rows[0]?.payload;
    },
    async insertMaterial(value) {
      try {
        await client.query(
          `INSERT INTO materials
             (code, brand_id, status, material_type, unit, currency, unit_cost, minimum_order_quantity, available_quantity, reserved_quantity, version, payload,
              weight_gsm, cuttable_width, cuttable_width_unit, country_of_origin, purchase_unit, conversion_factor, material_subtype)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17, $18, $19)`,
          [value.code, value.brandId, value.status, value.type, value.unit, value.currency, value.unitCost, value.minimumOrderQuantity, value.availableQuantity, value.reservedQuantity, value.version, JSON.stringify(value),
            ...specificationColumns(value)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'MATERIAL_ALREADY_EXISTS', 'Material already exists', { code: value.code });
        throw error;
      }
    },
    async saveMaterial(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      const result = await client.query(
        `UPDATE materials
            SET status = $2, material_type = $3, unit = $4, currency = $5, unit_cost = $6,
                minimum_order_quantity = $7, available_quantity = $8, reserved_quantity = $9,
                version = $10, payload = $11::jsonb,
                weight_gsm = $13, cuttable_width = $14, cuttable_width_unit = $15,
                country_of_origin = $16, purchase_unit = $17, conversion_factor = $18, material_subtype = $19
          WHERE code = $1 AND version = $12`,
        [value.code, value.status, value.type, value.unit, value.currency, value.unitCost, value.minimumOrderQuantity, value.availableQuantity, value.reservedQuantity, value.version, JSON.stringify(value), expectedVersion,
          ...specificationColumns(value)],
      );
      invariant(result.rowCount === 1, 'MATERIAL_CONCURRENCY_CONFLICT', 'Material concurrency conflict', { code: value.code, expectedVersion });
    },
    // Волокна разрешаются по governed-справочнику: код без записи в нём — это не волокно, а опечатка.
    async resolveFibres(codes) {
      const wanted = [...new Set((Array.isArray(codes) ? codes : [])
        .map((code) => String(code ?? '').trim().toUpperCase())
        .filter(Boolean))];
      if (wanted.length === 0) return new Map();
      const result = await client.query(
        `SELECT entry.code, entry.id, entry.version
           FROM mdm_entries AS entry
           JOIN mdm_dictionaries AS dictionary ON dictionary.id = entry.dictionary_id
          WHERE dictionary.code = 'material.fibre' AND entry.code = ANY($1::text[])`,
        [wanted],
      );
      const found = new Map(result.rows.map((row) => [row.code, Object.freeze({ entryId: row.id, version: Number(row.version) })]));
      for (const code of wanted) {
        invariant(found.has(code), 'MATERIAL_FIBRE_NOT_FOUND', 'This fibre is not in the governed fibre dictionary', { fibreCode: code });
      }
      return found;
    },

    // Состав заменяется целиком в одной транзакции: отложенная проверка суммы смотрит на состояние
    // в конце, поэтому промежуточная пустота законна, а промежуточная неполная сумма — нет.
    async replaceMaterialComposition(material, lines, { at, actorId, nextId }) {
      await client.query('DELETE FROM material_compositions WHERE material_code = $1', [material.code]);
      for (const line of lines) {
        await client.query(
          `INSERT INTO material_compositions
             (id, material_code, brand_id, fibre_entry_id, fibre_entry_version, fibre_code, percentage, position, created_at, created_by, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10,$11::jsonb)`,
          [nextId('material-composition'), material.code, material.brandId, line.fibreRef.entryId, line.fibreRef.version,
            line.fibreCode, line.percentage, line.position, at, actorId,
            JSON.stringify({ fibreCode: line.fibreCode, percentage: line.percentage, position: line.position })],
        );
      }
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

// Измеримые свойства выносятся в собственные столбцы, а не остаются только в payload: по ширине
// раскроя отказывает триггер настила, а условие, которое умеет читать только приложение, не
// защищает от записи мимо него.
function specificationColumns(value) {
  const specification = value.specification ?? null;
  return [
    specification?.weightGsm ?? null,
    specification?.cuttableWidth ?? null,
    specification?.cuttableWidthUnit ?? null,
    specification?.countryOfOrigin ?? null,
    specification?.purchaseUnit ?? null,
    specification?.conversionFactor ?? null,
    specification?.materialSubtype ?? null,
  ];
}
