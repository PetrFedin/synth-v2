import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/modules/planning-core.js', import.meta.url), 'utf8');
const context = vm.createContext({ console, Object, Array, Math, String, Number, Date, Set, globalThis: {} });
context.globalThis = context;
vm.runInContext(source, context, { filename: 'planning-core.js' });
const core = context.SynthaPlanningCore;
const now = new Date('2026-08-03T12:00:00.000Z');

function completeWorkspace() {
  return {
    campaigns: [{ id: 'campaign-1', brandId: 'brand-1', name: 'SS27', status: 'open', startsAt: '2026-08-10T00:00:00.000Z', endsAt: '2026-09-30T00:00:00.000Z' }],
    collections: [{ id: 'collection-1', campaignId: 'campaign-1', status: 'published' }],
    catalogSkus: [{ sku: 'STYLE-001', collectionId: 'collection-1', status: 'published' }],
    showrooms: [{ id: 'showroom-1', collectionId: 'collection-1', status: 'open' }],
    cycles: [{ id: 'cycle-1', campaignId: 'campaign-1', collectionId: 'collection-1', status: 'negotiation' }],
    selections: [{ id: 'selection-1', showroomId: 'showroom-1' }],
    orders: [{ id: 'order-1', selectionId: 'selection-1', status: 'ready' }],
  };
}

test('computes complete campaign readiness from authoritative relationships', () => {
  const result = core.buildPortfolio(completeWorkspace(), now);
  assert.equal(result.campaigns[0].readiness, 100);
  assert.equal(result.campaigns[0].counts.orders, 1);
  assert.equal(result.campaigns[0].risks.length, 0);
});

test('attributes orders through showroom selection relationship', () => {
  const workspace = completeWorkspace();
  delete workspace.orders[0].campaignId;
  delete workspace.orders[0].collectionId;
  delete workspace.orders[0].showroomId;
  assert.equal(core.assessCampaign(workspace, workspace.campaigns[0], now).counts.orders, 1);
});

test('prioritizes overdue and structurally blocked campaigns', () => {
  const workspace = completeWorkspace();
  workspace.campaigns.push({ id: 'campaign-2', brandId: 'brand-1', name: 'Overdue', status: 'open', startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-02-01T00:00:00.000Z' });
  const result = core.buildPortfolio(workspace, now);
  assert.equal(result.campaigns[0].campaign.id, 'campaign-2');
  assert.equal(result.campaigns[0].highestRisk, 'critical');
  assert.equal(result.summary.overdueCampaigns, 1);
});

test('returns stable empty summary without fabricated schedule data', () => {
  assert.deepEqual({ ...core.buildPortfolio({}, now).summary }, { total: 0, active: 0, averageReadiness: 0, criticalCampaigns: 0, overdueCampaigns: 0, upcoming30Days: 0, riskCount: 0 });
});
