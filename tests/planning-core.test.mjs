import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/modules/planning-core.js', import.meta.url), 'utf8');
const context = vm.createContext({ console, Date, Object, Array, Set, Math, String, Number, globalThis: {} });
context.globalThis = context;
vm.runInContext(source, context, { filename: 'planning-core.js' });
const core = context.SynthaPlanningCore;

const now = new Date('2026-08-03T00:00:00.000Z');

function workspace(overrides = {}) {
  return {
    campaigns: [], collections: [], catalogSkus: [], showrooms: [], cycles: [], selections: [], orders: [],
    ...overrides,
  };
}

test('calculates 100% readiness from complete source-backed campaign data', () => {
  const data = workspace({
    campaigns: [{ id: 'c1', brandId: 'b1', name: 'FW27', status: 'open', startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-12-01T00:00:00Z' }],
    collections: [{ id: 'col1', campaignId: 'c1', status: 'published' }],
    catalogSkus: [{ sku: 'sku1', collectionId: 'col1', status: 'published' }],
    showrooms: [{ id: 's1', collectionId: 'col1', status: 'open' }],
    cycles: [{ id: 'cy1', campaignId: 'c1', collectionId: 'col1', status: 'showroom' }],
  });
  const result = core.buildPortfolio(data, now);
  assert.equal(result.campaigns[0].readiness, 100);
  assert.equal(result.campaigns[0].risks.length, 0);
  assert.equal(result.summary.averageReadiness, 100);
});

test('flags blockers without inventing collections, SKU or linesheets', () => {
  const data = workspace({
    campaigns: [{ id: 'c1', brandId: 'b1', name: 'Empty', status: 'draft' }],
  });
  const result = core.buildPortfolio(data, now);
  assert.equal(result.campaigns[0].readiness, 0);
  assert.deepEqual(
    Array.from(result.campaigns[0].risks, (risk) => risk.code),
    ['NO_ASSORTMENT', 'NO_COLLECTIONS', 'INVALID_OR_MISSING_TIMELINE', 'NO_LINE_SHEET', 'NO_COMMERCIAL_EXECUTION'],
  );
  assert.equal(result.campaigns[0].counts.collections, 0);
  assert.equal(result.campaigns[0].counts.skus, 0);
});

test('prioritises critical and overdue campaigns before healthier campaigns', () => {
  const data = workspace({
    campaigns: [
      { id: 'healthy', name: 'Healthy', status: 'open', startsAt: '2026-09-01', endsAt: '2026-12-01' },
      { id: 'late', name: 'Late', status: 'open', startsAt: '2026-01-01', endsAt: '2026-02-01' },
    ],
    collections: [
      { id: 'hc', campaignId: 'healthy', status: 'published' },
      { id: 'lc', campaignId: 'late', status: 'published' },
    ],
    catalogSkus: [
      { sku: 'h', collectionId: 'hc', status: 'published' },
      { sku: 'l', collectionId: 'lc', status: 'published' },
    ],
    showrooms: [
      { id: 'hs', collectionId: 'hc', status: 'open' },
      { id: 'ls', collectionId: 'lc', status: 'open' },
    ],
    cycles: [
      { id: 'hy', campaignId: 'healthy', status: 'showroom' },
      { id: 'ly', campaignId: 'late', status: 'showroom' },
    ],
  });
  const result = core.buildPortfolio(data, now);
  assert.equal(result.campaigns[0].campaign.id, 'late');
  assert.equal(result.campaigns[0].overdue, true);
  assert.equal(result.summary.overdueCampaigns, 1);
});

test('traces commercial execution through showroom selection into order', () => {
  const data = workspace({
    campaigns: [{ id: 'c1', brandId: 'b1', name: 'SS27', status: 'open', startsAt: '2026-09-01', endsAt: '2026-12-01' }],
    collections: [{ id: 'col1', campaignId: 'c1', status: 'published' }],
    catalogSkus: [{ sku: 'sku1', collectionId: 'col1', status: 'published' }],
    showrooms: [{ id: 'show1', collectionId: 'col1', status: 'open' }],
    selections: [{ id: 'sel1', showroomId: 'show1', status: 'submitted' }],
    orders: [{ id: 'ord1', selectionId: 'sel1', status: 'ready' }],
  });
  const result = core.buildPortfolio(data, now).campaigns[0];
  assert.equal(result.counts.selections, 1);
  assert.equal(result.counts.orders, 1);
  assert.equal(result.gateScores.commercialExecution, 15);
  assert.equal(result.readiness, 100);
});

test('returns stable zero summary for an empty workspace', () => {
  const result = core.buildPortfolio({}, now);
  assert.deepEqual({ ...result.summary }, {
    total: 0,
    active: 0,
    averageReadiness: 0,
    criticalCampaigns: 0,
    overdueCampaigns: 0,
    upcoming30Days: 0,
    riskCount: 0,
  });
});
