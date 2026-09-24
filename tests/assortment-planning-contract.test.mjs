import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  createPlaceholderStyleLink,
  createProductPlaceholder,
  plannedMarginBasisPoints,
  transitionProductPlaceholder,
} from '../src/modules/assortment-planning/public.mjs';

const campaign = Object.freeze({ id: 'campaign-1', brandId: 'brand-1', status: 'open' });
const base = Object.freeze({
  id: 'placeholder-1',
  campaign,
  brandId: 'brand-1',
  placeholderCode: 'PH-FW27-01',
  nameRu: 'Шуба женская',
  nameEn: 'Women fur coat',
  currency: 'EUR',
  createdAt: '2026-09-18T10:00:00.000Z',
  createdBy: 'actor-1',
});

test('a placeholder derives its planned margin from the price and the cost it states', () => {
  const placeholder = createProductPlaceholder({
    ...base, recommendedRetailPriceMinor: 5800000, plannedUnitCostMinor: 1740000,
  });
  assert.equal(placeholder.plannedMarginBasisPoints, 7000);
  assert.equal(placeholder.status, 'planned');
  assert.equal(placeholder.version, 1);

  // A slot may be planned before anyone knows the economics; the margin is then simply absent rather
  // than a zero that would read as a real figure.
  const early = createProductPlaceholder({ ...base, id: 'placeholder-2' });
  assert.equal(early.plannedMarginBasisPoints, null);
  assert.equal(plannedMarginBasisPoints(null, 1000), null);
});

test('a placeholder cannot plan a cost above the price it plans to sell at', () => {
  assert.throws(
    () => createProductPlaceholder({ ...base, recommendedRetailPriceMinor: 1000, plannedUnitCostMinor: 2000 }),
    (error) => error.code === 'PLACEHOLDER_MARGIN_NEGATIVE',
  );
});

test('a placeholder cannot be planned into a closed campaign', () => {
  assert.throws(
    () => createProductPlaceholder({ ...base, campaign: { ...campaign, status: 'closed' } }),
    (error) => error.code === 'CAMPAIGN_CLOSED',
  );
});

test('placeholder status follows the planning lifecycle and respects the expected version', () => {
  const placeholder = createProductPlaceholder(base);
  const started = transitionProductPlaceholder(placeholder, 'in_development', {
    updatedAt: '2026-09-18T11:00:00.000Z', updatedBy: 'actor-1', expectedVersion: 1,
  });
  assert.equal(started.status, 'in_development');
  assert.equal(started.version, 2);

  // planned -> delivered would skip the work the slot is meant to track.
  assert.throws(
    () => transitionProductPlaceholder(placeholder, 'delivered', {
      updatedAt: '2026-09-18T11:00:00.000Z', updatedBy: 'actor-1', expectedVersion: 1,
    }),
    (error) => error.code === 'PLACEHOLDER_STATUS_TRANSITION_INVALID',
  );

  assert.throws(
    () => transitionProductPlaceholder(started, 'delivered', {
      updatedAt: '2026-09-18T12:00:00.000Z', updatedBy: 'actor-1', expectedVersion: 1,
    }),
    (error) => error.code === 'PLACEHOLDER_VERSION_CONFLICT',
  );
});

test('a style is linked to the slot it was developed for, and never to a dropped one', () => {
  const placeholder = createProductPlaceholder(base);
  const style = Object.freeze({ id: 'style-1', brandId: 'brand-1' });
  const link = createPlaceholderStyleLink({
    id: 'link-1', placeholder, style, linkedAt: '2026-09-18T11:00:00.000Z', linkedBy: 'actor-1',
  });
  assert.equal(link.styleId, 'style-1');
  assert.equal(link.campaignId, 'campaign-1');

  assert.throws(
    () => createPlaceholderStyleLink({
      id: 'link-2', placeholder, style: { id: 'style-2', brandId: 'brand-2' },
      linkedAt: '2026-09-18T11:00:00.000Z', linkedBy: 'actor-1',
    }),
    (error) => error.code === 'PLACEHOLDER_STYLE_BRAND_MISMATCH',
  );

  assert.throws(
    () => createPlaceholderStyleLink({
      id: 'link-3', placeholder: { ...placeholder, status: 'dropped' }, style,
      linkedAt: '2026-09-18T11:00:00.000Z', linkedBy: 'actor-1',
    }),
    (error) => error.code === 'PLACEHOLDER_DROPPED',
  );
});

const readMigration = (name) => readFile(fileURLToPath(new URL(`../db/migrations/${name}`, import.meta.url)), 'utf8');

test('migration 078 keeps the planned margin honest and advances a slot when work starts', async () => {
  const sql = await readMigration('078_assortment_planning_placeholders.sql');

  // The margin is re-derived by the database, so a row cannot claim a margin it does not have even if
  // it is written by something other than the domain module.
  assert.match(sql, /CONSTRAINT product_placeholders_margin_consistent CHECK/);
  assert.match(sql, /planned_unit_cost_minor <= recommended_retail_price_minor/);

  // A style belongs to one slot: two plans claiming the same style make both unmeasurable.
  assert.match(sql, /UNIQUE \(style_id\)/);

  assert.match(sql, /advance_placeholder_on_style_link/);
  assert.match(sql, /AFTER INSERT ON product_placeholder_style_links/);
  assert.match(sql, /AND status = 'planned'/);

  assert.doesNotMatch(sql, /DROP\s+TABLE\s+(?!IF EXISTS product_placeholder)/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM/i);
});

test('migration 079 reads the plan against the fact and refuses to mix currencies', async () => {
  const sql = await readMigration('079_assortment_plan_workspace.sql');
  assert.match(sql, /CREATE OR REPLACE VIEW assortment_plan_workspace/);
  assert.match(sql, /'linkedStyleCount'/);
  assert.match(sql, /'actualUnitCostMinor'/);
  assert.match(sql, /'actualMarginBasisPoints'/);

  // Comparing a plan in one currency with a cost in another is not a variance, it is a mistake.
  assert.match(sql, /bom\.currency = placeholder\.currency/);
  assert.match(sql, /bom\.status = 'published'/);
});
