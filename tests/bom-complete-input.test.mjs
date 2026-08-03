import assert from 'node:assert/strict';
import test from 'node:test';
import { createBomService } from '../src/application/bom-service.mjs';

function service() {
  return createBomService({
    bomStore: { transaction: async () => { throw new Error('transaction must not start for incomplete input'); } },
  });
}

const complete = {
  sku: 'STYLE-001',
  currency: 'EUR',
  lines: [{ lineId: 'SHELL', component: 'Shell', materialCode: 'FAB-001', quantity: 1, wastePercent: 0 }],
  laborCost: 0,
  overheadCost: 0,
  logisticsCost: 0,
  otherCost: 0,
  notes: null,
};

test('BOM create and update reject incomplete costing snapshots before transaction', async () => {
  const boms = service();
  const missingLabor = { ...complete };
  delete missingLabor.laborCost;
  await assert.rejects(() => boms.createBom('cmd-1', 'user-1', missingLabor), (error) => error?.code === 'BOM_FIELD_REQUIRED' && error.details?.missingFields?.includes('laborCost'));

  const missingWaste = { ...complete, expectedVersion: 1, lines: [{ lineId: 'SHELL', component: 'Shell', materialCode: 'FAB-001', quantity: 1 }] };
  delete missingWaste.sku;
  await assert.rejects(() => boms.updateBom('cmd-2', 'user-1', 'STYLE-001', missingWaste), (error) => error?.code === 'BOM_LINE_FIELD_REQUIRED' && error.details?.missingFields?.includes('wastePercent'));
});
