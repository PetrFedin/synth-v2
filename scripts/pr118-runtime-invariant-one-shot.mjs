import fs from 'node:fs';

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${path}: expected patch anchor not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${path}: patch anchor is not unique`);
  fs.writeFileSync(path, source.replace(before, after));
}

const persistedMdmSnapshotBefore = `    snapshot: {
      id: entryId,
      code,
      name_ru: nameRu,
      name_en: nameEn,
      description_ru: \`${'${nameRu}'}: метод измерения\`,
      description_en: \`${'${nameEn}'}: measurement method\`,
      attributes,
    },`;
const persistedMdmSnapshotAfter = `    snapshot: {
      id: entryId,
      code,
      translations: { ru: nameRu, en: nameEn },
      attributes: {
        ...attributes,
        descriptionRu: \`${'${nameRu}'}: метод измерения\`,
        descriptionEn: \`${'${nameEn}'}: measurement method\`,
      },
    },`;
replaceOnce('tests/canonical-measurement-domain.test.mjs', persistedMdmSnapshotBefore, persistedMdmSnapshotAfter);
replaceOnce('tests/canonical-measurement-service.test.mjs', persistedMdmSnapshotBefore, persistedMdmSnapshotAfter);
replaceOnce(
  'tests/canonical-measurement-domain.test.mjs',
  `  source.pointEntries[0].snapshot.name_ru = 'Изменённое имя';\n  assert.equal(chart.measurementUnit.snapshot.code, 'CM');\n  assert.equal(chart.points[0].pointRef.snapshot.name_ru, 'Обхват груди');`,
  `  source.pointEntries[0].snapshot.translations.ru = 'Изменённое имя';\n  assert.equal(chart.measurementUnit.snapshot.code, 'CM');\n  assert.equal(chart.points[0].pointRef.snapshot.translations.ru, 'Обхват груди');`,
);

const readyPath = 'src/acceptance/product-readiness-ready-live-acceptance.mjs';
replaceOnce(
  readyPath,
  `            sku.brand_id AS sku_brand_id,\n            media.id AS media_id,`,
  `            sku.brand_id AS sku_brand_id,\n            inventory_balance.product_sku_id AS inventory_product_sku_id,\n            inventory_balance.brand_id AS inventory_brand_id,\n            inventory_balance.available_quantity AS inventory_available_quantity,\n            inventory_balance.reserved_quantity AS inventory_reserved_quantity,\n            inventory_balance.version AS inventory_balance_version,\n            media.id AS media_id,`,
);
replaceOnce(
  readyPath,
  `       JOIN product_skus AS sku ON sku.style_version_id = version.id AND sku.colorway_id = colorway.id\n       JOIN product_size_values AS size_value ON size_value.id = sku.size_value_id`,
  `       JOIN product_skus AS sku ON sku.style_version_id = version.id AND sku.colorway_id = colorway.id\n       JOIN product_sku_inventory_balances AS inventory_balance\n         ON inventory_balance.product_sku_id = sku.id\n        AND inventory_balance.brand_id = sku.brand_id\n       JOIN product_size_values AS size_value ON size_value.id = sku.size_value_id`,
);
replaceOnce(
  readyPath,
  `    row.sku_brand_id,\n    row.media_brand_id,`,
  `    row.sku_brand_id,\n    row.inventory_brand_id,\n    row.media_brand_id,`,
);
replaceOnce(
  readyPath,
  `    && row.sku_size_value_id === sizeValueId\n    && row.media_id === mediaId`,
  `    && row.sku_size_value_id === sizeValueId\n    && row.inventory_product_sku_id === skuId\n    && row.media_id === mediaId`,
);
replaceOnce(
  readyPath,
  `  if (row.measurement_status !== 'published' || Number(row.measurement_version) !== measurementChartVersion || !row.measurement_published_at) {`,
  `  if (Number(row.inventory_available_quantity) !== 0\n      || Number(row.inventory_reserved_quantity) !== 0\n      || Number(row.inventory_balance_version) !== 1) {\n    throw new Error('READY ProductSku canonical inventory identity must be zero-initialized at version 1');\n  }\n  if (row.measurement_status !== 'published' || Number(row.measurement_version) !== measurementChartVersion || !row.measurement_published_at) {`,
);
replaceOnce(
  readyPath,
  `    measurementPointRef: Object.freeze({ ...mdm.measurementPoint }),\n  });`,
  `    measurementPointRef: Object.freeze({ ...mdm.measurementPoint }),\n    inventoryBalance: Object.freeze({\n      productSkuId: row.inventory_product_sku_id,\n      brandId: row.inventory_brand_id,\n      availableQuantity: Number(row.inventory_available_quantity),\n      reservedQuantity: Number(row.inventory_reserved_quantity),\n      version: Number(row.inventory_balance_version),\n    }),\n  });`,
);
replaceOnce(
  readyPath,
  `  const after = await snapshotAcceptanceIsolation(pool, references.brand.id);\n  assertDownstreamIsolationUnchanged(before, after);`,
  `  const after = await snapshotAcceptanceIsolation(pool, references.brand.id);\n  assertReadyProductInventoryIsolationDelta(before, after);`,
);
replaceOnce(
  readyPath,
  `    isolation: Object.freeze({ before, after, unchanged: true }),`,
  `    isolation: Object.freeze({ before, after, inventoryBalanceIdentityDelta: 1, downstreamUnchanged: true }),`,
);
replaceOnce(
  readyPath,
  `function assertDownstreamIsolationUnchanged(before, after) {\n  const keys = Object.keys(before ?? {});\n  if (!keys.length || keys.length !== Object.keys(after ?? {}).length) throw new Error('Acceptance isolation snapshot shape changed');\n  const changed = keys.filter((key) => String(before[key]) !== String(after[key]));\n  if (changed.length) {\n    const error = new Error(\`READY Product Readiness acceptance changed downstream/warehouse/economic state: \${changed.join(', ')}\`);\n    error.code = 'ACCEPTANCE_ISOLATION_CHANGED';\n    error.details = Object.freeze(Object.fromEntries(changed.map((key) => [key, Object.freeze({ before: before[key], after: after[key] })])));\n    throw error;\n  }\n}`,
  `export function assertReadyProductInventoryIsolationDelta(before, after) {\n  const keys = Object.keys(before ?? {});\n  if (!keys.length || keys.length !== Object.keys(after ?? {}).length || !keys.includes('inventory_balance_rows')) {\n    throw new Error('Acceptance isolation snapshot shape changed');\n  }\n  let beforeBalanceRows;\n  let afterBalanceRows;\n  try {\n    beforeBalanceRows = BigInt(String(before.inventory_balance_rows));\n    afterBalanceRows = BigInt(String(after.inventory_balance_rows));\n  } catch {\n    throw new Error('READY Product Readiness inventory balance counter is invalid');\n  }\n  const changed = keys.filter((key) => key !== 'inventory_balance_rows' && String(before[key]) !== String(after[key]));\n  const balanceIdentityDeltaValid = afterBalanceRows === beforeBalanceRows + 1n;\n  if (!balanceIdentityDeltaValid || changed.length) {\n    const changedKeys = [...(!balanceIdentityDeltaValid ? ['inventory_balance_rows'] : []), ...changed];\n    const error = new Error(\`READY Product Readiness acceptance changed state outside the single zero ProductSku inventory identity: \${changedKeys.join(', ')}\`);\n    error.code = 'ACCEPTANCE_ISOLATION_CHANGED';\n    error.details = Object.freeze(Object.fromEntries(changedKeys.map((key) => [key, Object.freeze({ before: before[key], after: after[key] })])));\n    throw error;\n  }\n  return true;\n}`,
);

const readyTestPath = 'tests/product-readiness-ready-live-acceptance.test.mjs';
replaceOnce(
  readyTestPath,
  `  assertReadyProductReadinessPersistence,\n  runReadyProductReadinessLiveAcceptance,`,
  `  assertReadyProductReadinessPersistence,\n  assertReadyProductInventoryIsolationDelta,\n  runReadyProductReadinessLiveAcceptance,`,
);
replaceOnce(
  readyTestPath,
  `  assert.deepEqual(persisted.measurementPointRef, READY_PRODUCT_MDM_REFERENCES.measurementPoint);`,
  `  assert.deepEqual(persisted.measurementPointRef, READY_PRODUCT_MDM_REFERENCES.measurementPoint);\n  assert.deepEqual(persisted.inventoryBalance, {\n    productSkuId: IDS.skuId,\n    brandId,\n    availableQuantity: 0,\n    reservedQuantity: 0,\n    version: 1,\n  });`,
);
replaceOnce(
  readyTestPath,
  `test('positive Product Identity to Readiness acceptance creates governed category and canonical measurements only through public idempotent API', async () => {`,
  `test('READY isolation permits exactly one zero ProductSku inventory identity and no stock/movement/downstream mutation', () => {\n  const before = isolationSnapshot();\n  const after = { ...before, inventory_balance_rows: '1' };\n  assert.equal(assertReadyProductInventoryIsolationDelta(before, after), true);\n\n  assert.throws(\n    () => assertReadyProductInventoryIsolationDelta(before, { ...after, inventory_balance_rows: '2' }),\n    (error) => error?.code === 'ACCEPTANCE_ISOLATION_CHANGED' && error?.details?.inventory_balance_rows?.after === '2',\n  );\n  assert.throws(\n    () => assertReadyProductInventoryIsolationDelta(before, { ...after, inventory_available_quantity: '1' }),\n    (error) => error?.code === 'ACCEPTANCE_ISOLATION_CHANGED' && error?.details?.inventory_available_quantity?.after === '1',\n  );\n  assert.throws(\n    () => assertReadyProductInventoryIsolationDelta(before, { ...after, warehouse_ledger_rows: '1' }),\n    (error) => error?.code === 'ACCEPTANCE_ISOLATION_CHANGED' && error?.details?.warehouse_ledger_rows?.after === '1',\n  );\n  assert.throws(\n    () => assertReadyProductInventoryIsolationDelta(before, { ...after, commercial_publication_rows: '1' }),\n    (error) => error?.code === 'ACCEPTANCE_ISOLATION_CHANGED' && error?.details?.commercial_publication_rows?.after === '1',\n  );\n});\n\ntest('positive Product Identity to Readiness acceptance creates governed category and canonical measurements only through public idempotent API', async () => {`,
);
replaceOnce(
  readyTestPath,
  `  const snapshot = isolationSnapshot();\n  const pool = {\n    query: async (sql) => {\n      if (sql.includes('category_usage.entry_id AS category_usage_entry_id')) return { rows: [readyPersistenceRow(brandId)] };\n      return { rows: [{ ...snapshot }] };\n    },\n  };`,
  `  const snapshot = isolationSnapshot();\n  let isolationReads = 0;\n  const pool = {\n    query: async (sql) => {\n      if (sql.includes('category_usage.entry_id AS category_usage_entry_id')) return { rows: [readyPersistenceRow(brandId)] };\n      isolationReads += 1;\n      return { rows: [{ ...snapshot, inventory_balance_rows: isolationReads === 1 ? '0' : '1' }] };\n    },\n  };`,
);
replaceOnce(
  readyTestPath,
  `  assert.equal(result.persistence.verified, true);\n  assert.equal(result.isolation.unchanged, true);`,
  `  assert.equal(result.persistence.verified, true);\n  assert.equal(result.isolation.inventoryBalanceIdentityDelta, 1);\n  assert.equal(result.isolation.downstreamUnchanged, true);`,
);
replaceOnce(
  readyTestPath,
  `    sku_brand_id: brandId,\n    media_id: IDS.mediaId,`,
  `    sku_brand_id: brandId,\n    inventory_product_sku_id: IDS.skuId,\n    inventory_brand_id: brandId,\n    inventory_available_quantity: 0,\n    inventory_reserved_quantity: 0,\n    inventory_balance_version: 1,\n    media_id: IDS.mediaId,`,
);

const architecturePath = 'ARCHITECTURE.md';
replaceOnce(
  architecturePath,
  `### 3.5 Inventory\n\nInventory truth is centralized around location/balance/reservation/allocation/movement. ATS is derived centrally from canonical balance semantics. Mutation paths require idempotency, locking and reconciliation; a buyer/order screen must not maintain a second stock balance.`,
  `### 3.5 Inventory\n\nInventory truth is centralized around location/balance/reservation/allocation/movement. ATS is derived centrally from canonical balance semantics. Mutation paths require idempotency, locking and reconciliation; a buyer/order screen must not maintain a second stock balance. Migration 065 deliberately materializes exactly one canonical \\`product_sku_inventory_balances\\` identity row when a new ProductSku is inserted, keyed by that ProductSku and same brand with \\`available_quantity=0\\`, \\`reserved_quantity=0\\` and \\`version=1\\`. Creating this zero balance identity is ProductSku→Inventory identity registration, not an inventory movement, receipt, reservation, allocation or stock increase; movement-ledger and quantity deltas must remain unchanged until a real inventory business event occurs.`,
);
replaceOnce(
  architecturePath,
  `A ProductSku must never be replaced by a plain textual SKU string in canonical physical lineage.`,
  `A ProductSku must never be replaced by a plain textual SKU string in canonical physical lineage. PostgreSQL migration 065 also creates that ProductSku's single zero-initialized canonical InventoryBalance identity at insert time; this does not create a second inventory truth and does not itself represent warehouse stock or movement.`,
);
replaceOnce(
  architecturePath,
  `Before/after isolation counters require no changes to CommercialPublication, PriceListVersion, BuyerCatalogVersion, Selection/Order, ProductSku inventory, warehouse movement, SupplyCommitment or ActualCost state.`,
  `Before/after isolation requires exactly one intentional inventory identity delta caused by ProductSku registration: \\`inventory_balance_rows +1\\` for the exact new ProductSku, whose persisted balance must be same-brand, \\`available=0\\`, \\`reserved=0\\`, \\`version=1\\`. Aggregate inventory quantities and the inventory movement ledger must remain unchanged, as must CommercialPublication, PriceListVersion, BuyerCatalogVersion, Selection/Order, SupplyCommitment and ActualCost state. Any second balance row, non-zero quantity, movement-ledger delta or downstream commercial/economic mutation fails the READY acceptance.`,
);
replaceOnce(
  architecturePath,
  `Both require downstream commercial/warehouse/economic isolation. Repository tests validate both harnesses and failure semantics;`,
  `Scenario A retains strict downstream commercial/warehouse/economic isolation. Scenario B additionally proves the intentional ProductSku registration effect from migration 065: exactly one same-brand zero balance identity is materialized while quantities, movement ledger and downstream commercial/economic facts remain unchanged. Repository tests validate both harnesses and failure semantics;`,
);
replaceOnce(
  architecturePath,
  `| ProductSku | exact StyleVersion + Colorway + SizeValue |`,
  `| ProductSku | exact StyleVersion + Colorway + SizeValue; insert materializes one same-brand canonical zero InventoryBalance identity (available=0, reserved=0, version=1) without creating a movement or stock fact |`,
);
replaceOnce(
  architecturePath,
  `Regression guards: \\`measurement-runtime-mdm-snapshot.test.mjs\\` and \\`production-reference-bootstrap-replay.test.mjs\\`. | 2.6, 5.2, 6.1–6.6, 15–17, 19–20, 22 | IMPLEMENTED harness/runtime fixes/tests;`,
  `Regression guards include \\`measurement-runtime-mdm-snapshot.test.mjs\\`, \\`production-reference-bootstrap-replay.test.mjs\\`, normalized Measurement domain/service fixtures that use the exact persisted MDM snapshot shape, and READY isolation proof that migration 065 may add exactly one zero ProductSku InventoryBalance identity but no quantity/movement/downstream fact. | 2.6, 3.5, 5.1–5.2, 6.1–6.6, 15–17, 19–20, 22 | IMPLEMENTED harness/runtime fixes/tests;`,
);

console.log('PR #118 runtime invariant patch applied.');
