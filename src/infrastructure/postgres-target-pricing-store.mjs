import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresTargetPricingStore({ pool } = {}) {
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
    // Сезон изделия — кампания его коллекции, а не отдельно названный сезон.
    async getCampaignIdForSku(sku) {
      const result = await client.query(
        `SELECT collection.campaign_id FROM catalog_skus AS catalog_sku
           JOIN collections AS collection ON collection.id = catalog_sku.collection_id
          WHERE catalog_sku.sku = $1`,
        [sku],
      );
      return result.rows[0]?.campaign_id;
    },
    async listSeasonRates(brandId, campaignId, fromCurrency, toCurrency) {
      const result = await client.query(
        `SELECT payload FROM season_fx_rates
          WHERE brand_id = $1 AND campaign_id = $2 AND from_currency = $3 AND to_currency = $4
          ORDER BY effective_on DESC`,
        [brandId, campaignId, fromCurrency, toCurrency],
      );
      return result.rows.map((row) => row.payload);
    },
    async insertSeasonRate(value) {
      try {
        await client.query(
          `INSERT INTO season_fx_rates (id,brand_id,campaign_id,from_currency,to_currency,rate,effective_on,source_note,created_at,created_by,payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,$9::timestamptz,$10,$11::jsonb)`,
          [value.id, value.brandId, value.campaignId, value.fromCurrency, value.toCurrency, value.rate, value.effectiveOn, value.sourceNote, value.createdAt, value.createdBy, JSON.stringify(value)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'SEASON_RATE_EXISTS', 'This season already records a rate for that pair on that date', { fromCurrency: value.fromCurrency, toCurrency: value.toCurrency, effectiveOn: value.effectiveOn });
        throw error;
      }
    },
    async getPlanById(planId) {
      const result = await client.query('SELECT payload FROM target_price_plans WHERE id = $1 FOR UPDATE', [planId]);
      return result.rows[0]?.payload;
    },
    async getActivePlanBySku(brandId, sku) {
      const result = await client.query("SELECT payload FROM target_price_plans WHERE brand_id = $1 AND sku = $2 AND status <> 'superseded' FOR SHARE", [brandId, sku]);
      return result.rows[0]?.payload;
    },
    async insertPlan(value) {
      try {
        await client.query(
          `INSERT INTO target_price_plans (id,brand_id,campaign_id,sku,target_rrp_minor,rrp_currency,retail_markup,sourcing_country_code,country_coefficient,category_coefficient,fob_currency,fx_rate,fx_effective_on,status,notes,version,created_at,created_by,updated_at,payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::date,$14,$15,$16,$17::timestamptz,$18,$19::timestamptz,$20::jsonb)`,
          [value.id, value.brandId, value.campaignId, value.sku, value.targetRrpMinor, value.rrpCurrency, value.retailMarkup,
            value.sourcingCountryCode, value.countryCoefficient, value.categoryCoefficient, value.fobCurrency, value.fxRate,
            value.fxEffectiveOn, value.status, value.notes, value.version, value.createdAt, value.createdBy, value.updatedAt, JSON.stringify(value)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'TARGET_PRICE_PLAN_EXISTS', 'This product already has an active target price', { sku: value.sku });
        throw error;
      }
    },
    async savePlan(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Target price version must increment exactly once');
      const result = await client.query(
        'UPDATE target_price_plans SET status = $3, version = $4, updated_at = $5::timestamptz, payload = $6::jsonb WHERE id = $1 AND version = $2',
        [value.id, expectedVersion, value.status, value.version, value.updatedAt, JSON.stringify(value)],
      );
      invariant(result.rowCount === 1, 'TARGET_PRICE_CONCURRENCY_CONFLICT', 'This target price was changed by another operation', { sku: value.sku, expectedVersion });
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
