import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';
import { decodePathParameter } from './transport-contract.mjs';

const EMPTY_BODY = bodyContract();
const CAMPAIGN_BODY = bodyContract(['brandId', 'name', 'season', 'startsAt', 'endsAt']);
const COLLECTION_BODY = bodyContract(['campaignId', 'brandId', 'name', 'currency']);
const CATALOG_SKU_BODY = bodyContract(['sku', 'collectionId', 'brandId', 'name', 'wholesalePrice', 'currency', 'minimumOrderQuantity', 'availableQuantity']);
const CATALOG_SKU_UPDATE_BODY = bodyContract(['expectedVersion', 'name', 'wholesalePrice', 'minimumOrderQuantity', 'availableQuantity']);
const CATALOG_SKU_PUBLISH_BODY = bodyContract(['expectedVersion']);
const MATERIAL_FIELDS = ['name', 'type', 'unit', 'supplierName', 'supplierReference', 'composition', 'color', 'currency', 'unitCost', 'minimumOrderQuantity', 'availableQuantity'];
const MATERIAL_BODY = bodyContract(['code', 'brandId', ...MATERIAL_FIELDS]);
const MATERIAL_UPDATE_BODY = bodyContract(['expectedVersion', ...MATERIAL_FIELDS]);
const MATERIAL_PUBLISH_BODY = bodyContract(['expectedVersion']);
const BOM_EDITABLE_FIELDS = ['currency', 'lines', 'laborCost', 'overheadCost', 'logisticsCost', 'otherCost', 'notes'];
const BOM_LINE_FIELDS = ['lineId', 'component', 'materialCode', 'quantity', 'wastePercent', 'exchangeRate'];
const BOM_BODY = bodyContract(['sku', ...BOM_EDITABLE_FIELDS], {}, { lines: BOM_LINE_FIELDS });
const BOM_UPDATE_BODY = bodyContract(['expectedVersion', ...BOM_EDITABLE_FIELDS], {}, { lines: BOM_LINE_FIELDS });
const BOM_PUBLISH_BODY = bodyContract(['expectedVersion']);
const MEASUREMENT_EDITABLE_FIELDS = ['unit', 'baseSizeCode', 'sizes', 'points', 'notes'];
const MEASUREMENT_SIZE_FIELDS = ['code', 'label'];
const MEASUREMENT_POINT_FIELDS = ['pointCode', 'name', 'description', 'toleranceMinus', 'tolerancePlus', 'measurements'];
const MEASUREMENT_VALUE_FIELDS = ['sizeCode', 'value'];
const MEASUREMENT_BODY = measurementBody(bodyContract(['sku', ...MEASUREMENT_EDITABLE_FIELDS], {}, { sizes: MEASUREMENT_SIZE_FIELDS, points: MEASUREMENT_POINT_FIELDS }));
const MEASUREMENT_UPDATE_BODY = measurementBody(bodyContract(['expectedVersion', ...MEASUREMENT_EDITABLE_FIELDS], {}, { sizes: MEASUREMENT_SIZE_FIELDS, points: MEASUREMENT_POINT_FIELDS }));
const MEASUREMENT_PUBLISH_BODY = bodyContract(['expectedVersion']);
const SHOWROOM_BODY = bodyContract(['collectionId', 'brandId', 'name', 'opensAt', 'closesAt']);
const RELATIONSHIP_BODY = bodyContract(['brandId', 'shopId']);
const INVITATION_BODY = bodyContract(['showroomId', 'shopId', 'expiresAt']);
const CYCLE_BODY = bodyContract(['brandId', 'shopId', 'campaignId', 'collectionId']);
const CYCLE_ADVANCE_BODY = bodyContract(['cycleId', 'targetStage']);
const SELECTION_BODY = bodyContract(['cycleId', 'showroomId']);
const SELECTION_LINE_BODY = bodyContract(['selectionId', 'sku', 'quantity', 'note', 'unitPrice', 'currency', 'catalogVersion']);
const ORDER_TERMS_FIELDS = ['incoterm', 'paymentDays', 'prepaymentPercent', 'deliveryStart', 'deliveryEnd'];
const ORDER_BODY = bodyContract(['selectionId', 'terms'], { terms: ORDER_TERMS_FIELDS });
const ORDER_TERMS_UPDATE_BODY = bodyContract(['expectedVersion', 'terms'], { terms: ORDER_TERMS_FIELDS });
const ORDER_ACCEPT_BODY = bodyContract(['orderId', 'organisationId', 'expectedVersion']);
const ORDER_VERSION_BODY = bodyContract(['expectedVersion']);
const ORDER_CANCEL_BODY = bodyContract(['orderId', 'reason', 'expectedVersion']);

export function createWholesaleRoutes({ platform, catalog, materials, boms, measurements, partners, collaboration, orders, notifications, workspace }) {
  invariant(platform && partners && collaboration && orders && notifications && workspace, 'HTTP_SERVICES_REQUIRED', 'All V2 application services are required');
  const catalogService = catalog ?? unavailableCatalog();
  const materialService = materials ?? unavailableMaterials();
  const bomService = boms ?? unavailableBoms();
  const measurementService = measurements ?? unavailableMeasurements();
  return [
    mutate('POST', /^\/v2\/campaigns$/, CAMPAIGN_BODY, ({ commandId, actorId, body }) => platform.createCampaign(commandId, actorId, body)),
    mutate('POST', /^\/v2\/campaigns\/([^/]+)\/open$/, EMPTY_BODY, ({ commandId, actorId, params }) => platform.openCampaign(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/collections$/, COLLECTION_BODY, ({ commandId, actorId, body }) => platform.createCollection(commandId, actorId, body)),
    mutate('POST', /^\/v2\/collections\/([^/]+)\/publish$/, EMPTY_BODY, ({ commandId, actorId, params }) => platform.publishCollection(commandId, actorId, params[0])),
    read('GET', /^\/v2\/catalog\/skus$/, ['limit', 'cursor', 'q', 'status', 'brandId', 'collectionId'], ({ actorId, query }) => catalogService.pageForActor(actorId, query)),
    read('GET', /^\/v2\/catalog\/skus\/([^/]+)$/, [], ({ actorId, params }) => catalogService.getForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/catalog\/skus$/, CATALOG_SKU_BODY, ({ commandId, actorId, body }) => catalogService.createSku(commandId, actorId, body)),
    mutate('PATCH', /^\/v2\/catalog\/skus\/([^/]+)$/, CATALOG_SKU_UPDATE_BODY, ({ commandId, actorId, params, body }) => catalogService.updateSku(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/catalog\/skus\/([^/]+)\/publish$/, CATALOG_SKU_PUBLISH_BODY, ({ commandId, actorId, params, body }) => catalogService.publishSku(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/materials$/, ['limit', 'cursor', 'q', 'status', 'type', 'brandId'], ({ actorId, query }) => materialService.pageForActor(actorId, query)),
    read('GET', /^\/v2\/materials\/([^/]+)$/, [], ({ actorId, params }) => materialService.getForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/materials$/, MATERIAL_BODY, ({ commandId, actorId, body }) => materialService.createMaterial(commandId, actorId, body)),
    mutate('PATCH', /^\/v2\/materials\/([^/]+)$/, MATERIAL_UPDATE_BODY, ({ commandId, actorId, params, body }) => materialService.updateMaterial(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/materials\/([^/]+)\/publish$/, MATERIAL_PUBLISH_BODY, ({ commandId, actorId, params, body }) => materialService.publishMaterial(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/boms$/, ['limit', 'cursor', 'q', 'status', 'brandId'], ({ actorId, query }) => bomService.pageForActor(actorId, query)),
    read('GET', /^\/v2\/boms\/([^/]+)$/, [], ({ actorId, params }) => bomService.getForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/boms$/, BOM_BODY, ({ commandId, actorId, body }) => bomService.createBom(commandId, actorId, body)),
    mutate('PATCH', /^\/v2\/boms\/([^/]+)$/, BOM_UPDATE_BODY, ({ commandId, actorId, params, body }) => bomService.updateBom(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/boms\/([^/]+)\/publish$/, BOM_PUBLISH_BODY, ({ commandId, actorId, params, body }) => bomService.publishBom(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/measurements$/, ['limit', 'cursor', 'q', 'status', 'unit', 'brandId'], ({ actorId, query }) => measurementService.pageForActor(actorId, query)),
    read('GET', /^\/v2\/measurements\/([^/]+)$/, [], ({ actorId, params }) => measurementService.getForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/measurements$/, MEASUREMENT_BODY, ({ commandId, actorId, body }) => measurementService.createMeasurementChart(commandId, actorId, body)),
    mutate('PATCH', /^\/v2\/measurements\/([^/]+)$/, MEASUREMENT_UPDATE_BODY, ({ commandId, actorId, params, body }) => measurementService.updateMeasurementChart(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/measurements\/([^/]+)\/publish$/, MEASUREMENT_PUBLISH_BODY, ({ commandId, actorId, params, body }) => measurementService.publishMeasurementChart(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/showrooms$/, SHOWROOM_BODY, ({ commandId, actorId, body }) => collaboration.createShowroom(commandId, actorId, body)),
    mutate('POST', /^\/v2\/showrooms\/([^/]+)\/open$/, EMPTY_BODY, ({ commandId, actorId, params }) => collaboration.openShowroom(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/relationships$/, RELATIONSHIP_BODY, ({ commandId, actorId, body }) => partners.requestRelationship(commandId, actorId, body)),
    mutate('POST', /^\/v2\/relationships\/([^/]+)\/accept$/, EMPTY_BODY, ({ commandId, actorId, params }) => partners.acceptRelationship(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/relationships\/([^/]+)\/reject$/, EMPTY_BODY, ({ commandId, actorId, params }) => partners.rejectRelationship(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/relationships\/([^/]+)\/revoke$/, EMPTY_BODY, ({ commandId, actorId, params }) => partners.revokeRelationship(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/showrooms\/([^/]+)\/invitations$/, INVITATION_BODY, ({ commandId, actorId, params, body }) => {
      sameId(body.showroomId, params[0], 'showroomId');
      return partners.inviteShopToShowroom(commandId, actorId, { ...body, showroomId: params[0] });
    }),
    mutate('POST', /^\/v2\/invitations\/([^/]+)\/accept$/, EMPTY_BODY, ({ commandId, actorId, params }) => partners.acceptShowroomInvitation(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/invitations\/([^/]+)\/decline$/, EMPTY_BODY, ({ commandId, actorId, params }) => partners.declineShowroomInvitation(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/invitations\/([^/]+)\/revoke$/, EMPTY_BODY, ({ commandId, actorId, params }) => partners.revokeShowroomInvitation(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/cycles$/, CYCLE_BODY, ({ commandId, actorId, body }) => platform.startCycle(commandId, actorId, body)),
    mutate('POST', /^\/v2\/cycles\/([^/]+)\/advance$/, CYCLE_ADVANCE_BODY, ({ commandId, actorId, params, body }) => {
      sameId(body.cycleId, params[0], 'cycleId');
      return platform.advanceCycle(commandId, actorId, params[0], body.targetStage);
    }),
    mutate('POST', /^\/v2\/cycles\/([^/]+)\/confirm$/, EMPTY_BODY, ({ commandId, actorId, params }) => platform.confirmAndOpenDeal(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/selections$/, SELECTION_BODY, ({ commandId, actorId, body }) => collaboration.createSelection(commandId, actorId, body)),
    mutate('PUT', /^\/v2\/selections\/([^/]+)\/lines\/([^/]+)$/, SELECTION_LINE_BODY, ({ commandId, actorId, params, body }) => {
      const sku = params[1]; sameId(body.selectionId, params[0], 'selectionId'); sameId(body.sku, sku, 'sku');
      return collaboration.upsertSelectionLine(commandId, actorId, params[0], { ...body, sku });
    }),
    mutate('POST', /^\/v2\/selections\/([^/]+)\/submit$/, EMPTY_BODY, ({ commandId, actorId, params }) => collaboration.submitSelection(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/orders$/, ORDER_BODY, ({ commandId, actorId, body }) => orders.createOrderDraft(commandId, actorId, body)),
    mutate('PATCH', /^\/v2\/orders\/([^/]+)\/terms$/, ORDER_TERMS_UPDATE_BODY, ({ commandId, actorId, params, body }) => orders.reviseTerms(commandId, actorId, { orderId: params[0], expectedVersion: body.expectedVersion, terms: body.terms })),
    mutate('POST', /^\/v2\/orders\/([^/]+)\/accept$/, ORDER_ACCEPT_BODY, ({ commandId, actorId, params, body }) => { sameId(body.orderId, params[0], 'orderId'); return orders.acceptTerms(commandId, actorId, { ...body, orderId: params[0] }); }),
    mutate('POST', /^\/v2\/orders\/([^/]+)\/attach$/, ORDER_VERSION_BODY, ({ commandId, actorId, params, body }) => orders.attachOrderToCycle(commandId, actorId, { orderId: params[0], expectedVersion: body.expectedVersion })),
    mutate('POST', /^\/v2\/orders\/([^/]+)\/cancel$/, ORDER_CANCEL_BODY, ({ commandId, actorId, params, body }) => { sameId(body.orderId, params[0], 'orderId'); return orders.cancelOrder(commandId, actorId, { orderId: params[0], reason: body.reason, expectedVersion: body.expectedVersion }); }),
    read('GET', /^\/v2\/workspace\/([^/]+)\/page$/, ['limit', 'cursor'], ({ actorId, params, query }) => workspace.pageForActor(actorId, { section: params[0], limit: query.limit, cursor: query.cursor })),
    read('GET', /^\/v2\/workspace$/, ['limit'], ({ actorId, query }) => workspace.loadForActor(actorId, { limit: query.limit })),
    read('GET', /^\/v2\/notifications\/page$/, ['limit', 'cursor'], ({ actorId, query }) => notifications.pageForActor(actorId, { limit: query.limit, cursor: query.cursor })),
    read('GET', /^\/v2\/notifications$/, ['limit'], ({ actorId, query }) => notifications.listForActor(actorId, { limit: query.limit })),
    mutate('POST', /^\/v2\/notifications\/([^/]+)\/read$/, EMPTY_BODY, ({ commandId, actorId, params }) => notifications.markRead(commandId, actorId, params[0])),
  ];
}

export function matchWholesaleRoute(routes, method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.pattern);
    if (match) return { ...route, params: match.slice(1).map(decodePathParameter) };
  }
  return null;
}
function mutate(method, pattern, contract, execute) {
  return { method, pattern, mutation: true, execute(context) {
    assertQueryContract(context.query ?? {}, []);
    if (typeof contract === 'function') contract(context.body); else assertBodyContract(context.body, contract);
    return execute(context);
  } };
}
function read(method, pattern, queryFields, execute) {
  return { method, pattern, mutation: false, async execute(context) { assertQueryContract(context.query ?? {}, queryFields); return execute(context); } };
}
function measurementBody(contract) {
  const valueContract = bodyContract(MEASUREMENT_VALUE_FIELDS);
  return (body) => {
    assertBodyContract(body, contract);
    if (!Array.isArray(body.points)) return body;
    body.points.forEach((point, pointIndex) => {
      if (point.measurements === undefined) return;
      invariant(Array.isArray(point.measurements), 'HTTP_BODY_FIELD_INVALID', `points[${pointIndex}].measurements must be a JSON array`, { field: 'points.measurements', pointIndex });
      point.measurements.forEach((measurement, valueIndex) => {
        try { assertBodyContract(measurement, valueContract); }
        catch (error) {
          if (error?.details && typeof error.details === 'object') error.details = { ...error.details, pointIndex, valueIndex };
          throw error;
        }
      });
    });
    return body;
  };
}
function sameId(bodyValue, routeValue, field) { invariant(bodyValue === undefined || bodyValue === routeValue, 'HTTP_IDENTIFIER_MISMATCH', 'Body identifier does not match route identifier', { field, routeValue, bodyValue }); }
function unavailableCatalog() { const fail = () => invariant(false, 'CATALOG_SERVICE_REQUIRED', 'Catalog service is required'); return Object.freeze({ createSku: fail, updateSku: fail, publishSku: fail, pageForActor: fail, getForActor: fail }); }
function unavailableMaterials() { const fail = () => invariant(false, 'MATERIAL_SERVICE_REQUIRED', 'Material service is required'); return Object.freeze({ createMaterial: fail, updateMaterial: fail, publishMaterial: fail, pageForActor: fail, getForActor: fail }); }
function unavailableBoms() { const fail = () => invariant(false, 'BOM_SERVICE_REQUIRED', 'BOM service is required'); return Object.freeze({ createBom: fail, updateBom: fail, publishBom: fail, pageForActor: fail, getForActor: fail }); }
function unavailableMeasurements() { const fail = () => invariant(false, 'MEASUREMENT_SERVICE_REQUIRED', 'Measurement chart service is required'); return Object.freeze({ createMeasurementChart: fail, updateMeasurementChart: fail, publishMeasurementChart: fail, pageForActor: fail, getForActor: fail }); }
