import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresTargetPricingStore } from '../src/infrastructure/postgres-target-pricing-store.mjs';
import { createPostgresTargetPricingReader } from '../src/infrastructure/postgres-target-pricing-reader.mjs';
import { createTargetPricingService, createTargetPricingQueryService } from '../src/application/target-pricing-service.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

// Прежде у сезонных курсов не было чтения списком — только запись через POST и внутреннее чтение
// при составлении плана. Экран не мог показать историю ни своих курсов, ни курса ЦБ рядом с ней.
test('PostgreSQL season FX rate history is readable, and visible only to the roles allowed to manage cost', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let tick = 0;
  const baseTime = Date.parse('2026-09-01T09:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
  const nextId = (prefix) => `${prefix}_${++tick}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });

    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const targetPricingStore = createPostgresTargetPricingStore({ pool });
    const targetPricingReader = createPostgresTargetPricingReader({ pool });

    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const commands = createTargetPricingService({ store: targetPricingStore, clock, nextId });
    const queries = createTargetPricingQueryService({ reader: targetPricingReader });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-cur', type: 'brand', name: 'Currency Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-cur', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('member-finance', 'owner-user', createMembership({ id: 'membership-finance', organisationId: 'brand-cur', organisationType: 'brand', userId: 'finance-user', role: 'finance', createdAt: clock() }));
    await platform.grantMembership('member-sales', 'owner-user', createMembership({ id: 'membership-sales', organisationId: 'brand-cur', organisationType: 'brand', userId: 'sales-user', role: 'sales', createdAt: clock() }));
    const campaign = await platform.createCampaign('campaign-create', 'owner-user', { brandId: 'brand-cur', name: 'SS27', season: 'SS27', startsAt: clock(), endsAt: clock() });

    await commands.recordSeasonRate('rate-usd-1', 'finance-user', { brandId: 'brand-cur', campaignId: campaign.id, fromCurrency: 'USD', toCurrency: 'RUB', rate: 91.0, effectiveOn: '2026-09-01', sourceNote: 'Открытие сезона' });
    await commands.recordSeasonRate('rate-usd-2', 'finance-user', { brandId: 'brand-cur', campaignId: campaign.id, fromCurrency: 'USD', toCurrency: 'RUB', rate: 93.4, effectiveOn: '2026-09-20', sourceNote: 'Коррекция по факту закупки' });
    await commands.recordSeasonRate('rate-eur-1', 'finance-user', { brandId: 'brand-cur', campaignId: campaign.id, fromCurrency: 'EUR', toCurrency: 'RUB', rate: 99.0, effectiveOn: '2026-09-01', sourceNote: null });

    const asOwner = await queries.seasonRatesForActor('owner-user', { brandId: 'brand-cur' });
    assert.equal(asOwner.length, 3);
    const asFinance = await queries.seasonRatesForActor('finance-user', { brandId: 'brand-cur', fromCurrency: 'USD', toCurrency: 'RUB' });
    assert.equal(asFinance.length, 2);
    // Newest first, same as the CBR reference registry — a history reads back to front.
    assert.equal(asFinance[0].effectiveOn, '2026-09-20');
    assert.equal(asFinance[0].rate, 93.4);
    assert.equal(asFinance[1].effectiveOn, '2026-09-01');
    assert.equal(asFinance[1].rate, 91.0);

    // Sales carries no cost-management capability, so it sees nothing — the same gate that already
    // protects the write side (`recordSeasonRate` requires COST_MANAGE) protects reading the history.
    const asSales = await queries.seasonRatesForActor('sales-user', { brandId: 'brand-cur' });
    assert.equal(asSales.length, 0);
  } finally {
    await pool.end();
  }
});
