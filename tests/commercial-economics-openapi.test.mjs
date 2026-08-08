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
    '/orders/{orderId}/landed-cost/actualize',
    '/orders/{orderId}/margin/actualize',
    '/margin-actualizations/{marginActualizationId}',
  ]) {
    assert.ok(wholesaleV2ExtendedOpenApi.paths[path], `missing OpenAPI path ${path}`);
  }
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.CommercialPublication);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.BuyerCatalogVersion);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.SupplyCommitmentSnapshot);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.OrderFxRateSnapshot);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.LandedCostSnapshot);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.MarginActualizationSnapshot);

  for (const schemaName of ['SupplyCommitmentSnapshot', 'OrderFxRateSnapshot', 'ActualCostLedgerEntry', 'LandedCostSnapshot', 'MarginActualizationSnapshot']) {
    const schema = wholesaleV2ExtendedOpenApi.components.schemas[schemaName];
    assert.ok(schema.required.includes('orderCommitSnapshotId'), `${schemaName} must require orderCommitSnapshotId`);
    assert.equal(schema.properties.orderCommitSnapshotId.type, 'string');
  }
  const actualCost = wholesaleV2ExtendedOpenApi.components.schemas.ActualCostLedgerEntry;
  assert.ok(actualCost.required.includes('sourceAmount'));
  assert.ok(actualCost.required.includes('sourceCurrency'));
  assert.ok(actualCost.required.includes('fxRateSnapshotId'));
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.MarginActualizationSnapshot.required.includes('priceListVersionId'));
});
