import test from 'node:test';
import assert from 'node:assert/strict';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

test('extended OpenAPI exposes commercial publication and order economics without changing the authoritative contract version', () => {
  assert.equal(wholesaleV2ExtendedOpenApi.info.version, '1.17.0');
  for (const path of [
    '/commercial-publications',
    '/commercial-publications/{publicationId}',
    '/commercial-publications/{publicationId}/buyer-catalogs',
    '/buyer-catalog-versions/{buyerCatalogVersionId}',
    '/orders/{orderId}/supply-commitments',
    '/orders/{orderId}/fx-rate-snapshots',
    '/orders/{orderId}/actual-costs',
    '/orders/{orderId}/actual-costs/{actualCostEntryId}/corrections',
    '/orders/{orderId}/landed-cost/actualize',
    '/orders/{orderId}/margin/actualize',
    '/orders/{orderId}/cost-close',
    '/orders/{orderId}/cost-close/adjustments',
    '/margin-actualizations/{marginActualizationId}',
    '/cost-closes/{costCloseSnapshotId}',
  ]) {
    assert.ok(wholesaleV2ExtendedOpenApi.paths[path], `missing OpenAPI path ${path}`);
  }
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.CommercialPublication);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.BuyerCatalogVersion);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.SupplyCommitmentSnapshot);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.OrderFxRateSnapshot);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.ActualCostCorrectionInput);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.ActualCostCorrectionResult);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.LandedCostSnapshot);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.MarginActualizationSnapshot);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.CostCloseSnapshot);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.PostCloseAdjustment);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.PostCloseAdjustmentResult);

  for (const schemaName of ['SupplyCommitmentSnapshot', 'OrderFxRateSnapshot', 'ActualCostLedgerEntry', 'LandedCostSnapshot', 'MarginActualizationSnapshot', 'CostCloseSnapshot', 'PostCloseAdjustment']) {
    const schema = wholesaleV2ExtendedOpenApi.components.schemas[schemaName];
    assert.ok(schema.required.includes('orderCommitSnapshotId'), `${schemaName} must require orderCommitSnapshotId`);
    assert.equal(schema.properties.orderCommitSnapshotId.type, 'string');
  }
  const actualCostInput = wholesaleV2ExtendedOpenApi.components.schemas.ActualCostInput;
  assert.ok(actualCostInput.required.includes('supplyCommitmentSnapshotId'));
  const correctionInput = wholesaleV2ExtendedOpenApi.components.schemas.ActualCostCorrectionInput;
  assert.ok(correctionInput.required.includes('reason'));
  assert.ok(correctionInput.required.includes('supplyCommitmentSnapshotId'));
  const actualCost = wholesaleV2ExtendedOpenApi.components.schemas.ActualCostLedgerEntry;
  for (const field of ['supplyCommitmentSnapshotId', 'entryKind', 'reversalOfEntryId', 'correctionId', 'correctionReason', 'sourceAmount', 'sourceCurrency', 'fxRateSnapshotId']) {
    assert.ok(actualCost.required.includes(field), `ActualCostLedgerEntry must require ${field}`);
  }
  assert.deepEqual(actualCost.properties.entryKind.enum, ['actual', 'reversal']);
  const correctionPath = wholesaleV2ExtendedOpenApi.paths['/orders/{orderId}/actual-costs/{actualCostEntryId}/corrections'].post;
  assert.equal(correctionPath.operationId, 'correctActualCost');
  assert.deepEqual(correctionPath.parameters.slice(0, 2).map((parameter) => parameter.name), ['orderId', 'actualCostEntryId']);
  const landedCost = wholesaleV2ExtendedOpenApi.components.schemas.LandedCostSnapshot;
  assert.ok(landedCost.required.includes('supplyCommitmentSnapshotIds'));
  assert.ok(landedCost.required.includes('supplyLineageComplete'));
  const margin = wholesaleV2ExtendedOpenApi.components.schemas.MarginActualizationSnapshot;
  assert.ok(margin.required.includes('supplyCommitmentSnapshotIds'));
  assert.ok(margin.required.includes('supplyLineageComplete'));
  assert.ok(margin.required.includes('priceListVersionId'));

  const costClose = wholesaleV2ExtendedOpenApi.components.schemas.CostCloseSnapshot;
  for (const field of ['landedCostSnapshotId', 'marginActualizationSnapshotId', 'costEntryIds', 'totalLandedCost', 'contributionMarginAmount', 'closedAt']) {
    assert.ok(costClose.required.includes(field), `CostCloseSnapshot must require ${field}`);
  }
  assert.deepEqual(costClose.properties.status.enum, ['closed']);
  const adjustment = wholesaleV2ExtendedOpenApi.components.schemas.PostCloseAdjustment;
  for (const field of ['costCloseSnapshotId', 'previousAdjustmentId', 'actualCostEntryId', 'priorLandedCostSnapshotId', 'landedCostSnapshotId', 'priorMarginActualizationSnapshotId', 'marginActualizationSnapshotId', 'costDeltaAmount', 'marginDeltaAmount', 'reason']) {
    assert.ok(adjustment.required.includes(field), `PostCloseAdjustment must require ${field}`);
  }
  assert.deepEqual(adjustment.properties.status.enum, ['recorded']);
  assert.equal(wholesaleV2ExtendedOpenApi.paths['/orders/{orderId}/cost-close'].post.operationId, 'closeOrderCost');
  assert.equal(wholesaleV2ExtendedOpenApi.paths['/orders/{orderId}/cost-close/adjustments'].post.operationId, 'recordPostCloseAdjustment');
});
