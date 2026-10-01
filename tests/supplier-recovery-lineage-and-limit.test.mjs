import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostgresSupplierRecoveryStore } from '../src/infrastructure/postgres-supplier-recovery-store.mjs';
import { assertRecoveryWithinRecordedCost } from '../src/modules/receipt-claims/supplier-recovery.mjs';

test('M-02: the recovery ledger INSERT writes order_line_no and product_sku_id next to sku', async () => {
  const statements = [];
  const client = { query: async (sql, params) => { statements.push({ sql, params }); return { rows: [], rowCount: 1 }; }, release: () => {} };
  const store = createPostgresSupplierRecoveryStore({ pool: { connect: async () => client, query: async () => ({ rows: [] }) } });
  const value = {
    id: 'cost-1', orderId: 'o1', orderCommitSnapshotId: 'oc1', supplyCommitmentSnapshotId: 'sc1', fulfillmentPlanSnapshotId: 'fp1',
    shipmentNoticeSnapshotId: 'sn1', receiptSnapshotId: 'r1', receiptDiscrepancySnapshotId: 'd1', brandId: 'b1', shopId: 's1',
    entryKind: 'actual', reversalOfEntryId: null, correctionId: null, correctionReason: null, costType: 'quality',
    sourceAmount: -10, sourceCurrency: 'EUR', fxRateSnapshotId: null, amount: -10, currency: 'EUR',
    orderLineNo: 3, productSkuId: 'psku-3', sku: 'SKU-3', sourceRef: 'CN-1', occurredAt: '2026-08-11T10:00:00.000Z', recordedAt: '2026-08-11T10:00:00.000Z',
  };
  await store.transaction((tx) => tx.insertPhysicalActualCostEntry(value));
  const insert = statements.find((entry) => /INSERT INTO actual_cost_ledger_entries/.test(entry.sql));
  assert.ok(insert, 'the ledger INSERT ran');
  const columns = insert.sql.slice(insert.sql.indexOf('(') + 1, insert.sql.indexOf(')')).split(',').map((name) => name.trim()).filter(Boolean);
  const bind = (name) => insert.params[columns.indexOf(name) - (columns.indexOf(name) > columns.indexOf('lineage_version') ? 1 : 0) - (columns.indexOf(name) > columns.indexOf('physical_lineage_version') ? 1 : 0)];
  assert.ok(columns.includes('order_line_no') && columns.includes('product_sku_id'), 'both lineage columns are inserted');
  assert.equal(bind('order_line_no'), 3);
  assert.equal(bind('product_sku_id'), 'psku-3');
  assert.equal(bind('sku'), 'SKU-3');
  assert.equal((insert.sql.match(/\$\d+/g) ?? []).length, insert.params.length);
});

test('M-02: a supplier recovery cannot exceed the cost already recorded for the order commit', () => {
  const entries = [
    { orderCommitSnapshotId: 'oc1', amount: 60 },
    { orderCommitSnapshotId: 'oc1', amount: -10 },
    { orderCommitSnapshotId: 'other', amount: 1000 },
  ];
  assert.equal(assertRecoveryWithinRecordedCost({ entries, orderCommitSnapshotId: 'oc1', recoveryAmount: 50 }), 50);
  assert.throws(() => assertRecoveryWithinRecordedCost({ entries, orderCommitSnapshotId: 'oc1', recoveryAmount: 50.0001 }), (error) => error?.code === 'SUPPLIER_RECOVERY_EXCEEDS_RECORDED_COST');
  assert.throws(() => assertRecoveryWithinRecordedCost({ entries: [], orderCommitSnapshotId: 'oc1', recoveryAmount: 1 }), (error) => error?.code === 'SUPPLIER_RECOVERY_EXCEEDS_RECORDED_COST');
  assert.throws(() => assertRecoveryWithinRecordedCost({ entries, orderCommitSnapshotId: 'oc1', recoveryAmount: 0 }), (error) => error?.code === 'SUPPLIER_RECOVERY_AMOUNT_INVALID');
});
