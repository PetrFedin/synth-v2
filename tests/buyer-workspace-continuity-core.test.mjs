import assert from 'node:assert/strict';
import test from 'node:test';

await import('../public/modules/buyer-workspace-continuity-core.js');
const continuity = globalThis.SynthaBuyerWorkspaceContinuity;

function selection(overrides = {}) {
  return {
    id: 'selection:1', status: 'draft', retailDoorId: 'door:pinned', retailDoorVersion: 4,
    buyerCommercialSnapshot: { doorCode: 'MSK-01', doorName: 'Петровка', shipToAddress: { city: 'Москва' } },
    ...overrides,
  };
}

test('journey exposes five buyer-facing stages without internal module names', () => {
  const state = continuity.buildBuyerJourneyState({ catalog: { id: 'catalog:1' } }, 'ru');
  assert.deepEqual(state.stages.map(stage => stage.label), ['Каталог', 'Точка продаж', 'Подбор', 'Заказ', 'Сделка']);
  assert.equal(state.stages.some(stage => /module|cycle|aggregate|модул|цикл/i.test(stage.label)), false);
});

test('journey labels are bilingual and deterministic', () => {
  const state = continuity.buildBuyerJourneyState({ catalog: { id: 'catalog:1' } }, 'en');
  assert.deepEqual(state.stages.map(stage => stage.label), ['Catalog', 'Retail Door', 'Selection', 'Order', 'Deal']);
});

test('pinned Selection Retail Door always wins over mutable current door', () => {
  const state = continuity.buildBuyerJourneyState({
    catalog: { id: 'catalog:1' },
    retailDoor: { id: 'door:mutable', code: 'SPB-02', name: 'Невский', shipToAddress: { city: 'Санкт-Петербург' } },
    selection: selection(),
  }, 'ru');
  assert.equal(state.retailDoor.id, 'door:pinned');
  assert.equal(state.retailDoor.version, 4);
  assert.equal(state.retailDoorPinned, true);
  assert.equal(state.stages.find(stage => stage.code === 'retail-door').state, 'complete');
  assert.match(state.stages.find(stage => stage.code === 'retail-door').detail, /Москва/);
});

test('selection, order and deal advance as one continuous journey', () => {
  const state = continuity.buildBuyerJourneyState({
    catalog: { id: 'catalog:1' },
    selection: selection({ status: 'submitted' }),
    orders: [{ id: 'order:1', selectionId: 'selection:1', status: 'attached' }],
    cycle: { id: 'cycle:1', stage: 'deal-space' },
  }, 'ru');
  assert.deepEqual(state.stages.map(stage => stage.state), ['complete', 'complete', 'complete', 'complete', 'complete']);
  assert.equal(state.order.id, 'order:1');
});

test('mutable Retail Door is only active before Selection freezes it', () => {
  const state = continuity.buildBuyerJourneyState({
    catalog: { id: 'catalog:1' },
    retailDoor: { id: 'door:1', code: 'EKB-01', name: 'Центр', shipToAddress: { city: 'Екатеринбург' } },
  }, 'ru');
  const door = state.stages.find(stage => stage.code === 'retail-door');
  assert.equal(door.state, 'active');
  assert.equal(state.retailDoorPinned, false);
});
