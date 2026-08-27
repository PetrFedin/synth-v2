import { invariant } from '../../core/errors.mjs';
import { calculateMoneyTotal, normalizeMoney } from '../../core/money.mjs';
import { assertBuyerCommercialSnapshot } from '../retail-doors/public.mjs';

const INCOTERMS = Object.freeze(['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP']);
const CANCELLATION_REASON_MAX_LENGTH = 1_000;
const POSTGRES_INTEGER_MAXIMUM = 2_147_483_647;
const RICH_LINEAGE_KEYS = Object.freeze(['productSkuId', 'styleId', 'styleVersionId', 'colorwayId', 'sizeValueId', 'sizeCode']);

export function createOrderDraft({ id, selection, currency, terms, buyerCommercialSnapshot = null, createdAt }) {
  invariant(id && selection?.id, 'ORDER_DRAFT_IDENTITY_REQUIRED', 'Order id and selection are required');
  invariant(selection.status === 'submitted', 'SELECTION_NOT_SUBMITTED', 'Order builder requires a submitted selection');
  invariant(/^[A-Z]{3}$/.test(currency), 'ORDER_CURRENCY_INVALID', 'Order currency must be an ISO-4217 code');
  const selectionCurrency = assertSubmittedSelectionCurrency(selection);
  invariant(currency === selectionCurrency, 'ORDER_SELECTION_CURRENCY_MISMATCH', 'Order currency must match the frozen submitted selection currency', {
    orderCurrency: currency,
    selectionCurrency,
    selectionId: selection.id,
  });
  const pinnedCommercialBasis = hasPinnedCommercialBasis(selection);
  invariant(!pinnedCommercialBasis || buyerCommercialSnapshot, 'ORDER_BUYER_COMMERCIAL_SNAPSHOT_REQUIRED', 'Commercial order requires a frozen buyer retail door snapshot');
  invariant(pinnedCommercialBasis || buyerCommercialSnapshot === null, 'ORDER_UNEXPECTED_BUYER_COMMERCIAL_SNAPSHOT', 'Legacy order without a commercial basis cannot attach an unrelated buyer retail door snapshot');
  const frozenBuyerSnapshot = buyerCommercialSnapshot ? freezeBuyerCommercialSnapshot(buyerCommercialSnapshot, selection.shopId) : null;
  const normalizedTerms = validateTerms(terms);
  const lines = Object.freeze(selection.lines.map((line) => Object.freeze({
    sku: line.sku,
    quantity: line.quantity,
    unitPrice: normalizeMoney(line.unitPrice, {
      invalidCode: 'ORDER_LINE_PRICE_INVALID',
      scaleCode: 'ORDER_LINE_PRICE_SCALE_INVALID',
      overflowCode: 'ORDER_LINE_PRICE_TOO_LARGE',
      label: 'Order line unit price',
    }),
    catalogVersion: line.catalogVersion,
    ...copyOptionalLineage(line),
  })));
  const totalAmount = calculateMoneyTotal(lines, {
    priceInvalidCode: 'ORDER_LINE_PRICE_INVALID',
    priceScaleCode: 'ORDER_LINE_PRICE_SCALE_INVALID',
    priceOverflowCode: 'ORDER_LINE_PRICE_TOO_LARGE',
    quantityCode: 'ORDER_LINE_QUANTITY_INVALID',
    totalCode: 'ORDER_TOTAL_INVALID',
    totalOverflowCode: 'ORDER_TOTAL_TOO_LARGE',
  });
  return Object.freeze({
    id,
    selectionId: selection.id,
    cycleId: selection.cycleId,
    brandId: selection.brandId,
    shopId: selection.shopId,
    commercialPublicationId: selection.commercialPublicationId ?? null,
    priceListVersionId: selection.priceListVersionId ?? null,
    buyerCatalogVersionId: selection.buyerCatalogVersionId ?? null,
    commercialBasisHash: selection.commercialBasisHash ?? null,
    accessGrantId: selection.accessGrantId ?? null,
    commercialProjectionId: selection.commercialProjectionId ?? null,
    commercialProjectionVersionNo: selection.commercialProjectionVersionNo ?? null,
    commercialProjectionContentHash: selection.commercialProjectionContentHash ?? null,
    readinessSnapshotId: selection.readinessSnapshotId ?? null,
    styleVersionId: selection.styleVersionId ?? null,
    buyerCommercialSnapshot: frozenBuyerSnapshot,
    retailDoorId: frozenBuyerSnapshot?.retailDoorId ?? null,
    retailDoorVersion: frozenBuyerSnapshot?.retailDoorVersion ?? null,
    orderCommitSnapshotId: null,
    currency: selectionCurrency,
    lines,
    totalAmount,
    terms: normalizedTerms,
    acceptedOrganisationIds: Object.freeze([]),
    status: 'draft',
    cancellationReason: null,
    cancelledAt: null,
    version: 1,
    createdAt,
    updatedAt: createdAt,
  });
}

export function reviseOrderTerms(order, terms, updatedAt, expectedVersion = order?.version) {
  assertExpectedVersion(order, expectedVersion);
  invariant(order.status === 'draft' || order.status === 'ready', 'ORDER_TERMS_NOT_EDITABLE', 'Order terms can no longer be edited');
  const normalizedTerms = validateTerms(terms);
  if (termsEqual(order.terms, normalizedTerms)) return order;
  return Object.freeze({
    ...order,
    terms: normalizedTerms,
    acceptedOrganisationIds: Object.freeze([]),
    status: 'draft',
    version: order.version + 1,
    updatedAt,
  });
}

export function acceptOrderTerms(order, organisationId, updatedAt, expectedVersion = order?.version) {
  assertExpectedVersion(order, expectedVersion);
  invariant(order.status === 'draft' || order.status === 'ready', 'ORDER_TERMS_NOT_ACCEPTABLE', 'Order terms can no longer be accepted');
  invariant(organisationId === order.brandId || organisationId === order.shopId, 'ORDER_PARTY_INVALID', 'Only order parties can accept terms', { organisationId });
  const accepted = new Set(order.acceptedOrganisationIds);
  if (accepted.has(organisationId)) return order;
  accepted.add(organisationId);
  const acceptedOrganisationIds = Object.freeze([...accepted].sort());
  const status = accepted.has(order.brandId) && accepted.has(order.shopId) ? 'ready' : 'draft';
  return Object.freeze({
    ...order,
    acceptedOrganisationIds,
    status,
    version: order.version + 1,
    updatedAt,
  });
}

export function attachReadyOrder(order, updatedAt, expectedVersion = order?.version, orderCommitSnapshotId = null) {
  assertExpectedVersion(order, expectedVersion);
  invariant(order.status === 'ready', 'ORDER_NOT_READY', 'Both Brand and Shop must accept order terms');
  invariant(orderCommitSnapshotId === null || (typeof orderCommitSnapshotId === 'string' && orderCommitSnapshotId.trim().length > 0), 'ORDER_COMMIT_SNAPSHOT_ID_INVALID', 'Order commit snapshot id must be a non-empty string');
  return Object.freeze({
    ...order,
    orderCommitSnapshotId: orderCommitSnapshotId?.trim() ?? null,
    status: 'attached',
    version: order.version + 1,
    updatedAt,
  });
}

export function cancelAttachedOrder(order, reason, cancelledAt, expectedVersion = order?.version) {
  assertExpectedVersion(order, expectedVersion);
  invariant(order.status === 'attached', 'ORDER_NOT_ATTACHED', 'Only an attached order can be cancelled');
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
  invariant(normalizedReason.length >= 3 && normalizedReason.length <= CANCELLATION_REASON_MAX_LENGTH, 'ORDER_CANCELLATION_REASON_REQUIRED', `Cancellation reason must contain 3 to ${CANCELLATION_REASON_MAX_LENGTH} characters`);
  return Object.freeze({
    ...order,
    status: 'cancelled',
    cancellationReason: normalizedReason,
    cancelledAt,
    version: order.version + 1,
    updatedAt: cancelledAt,
  });
}

function assertSubmittedSelectionCurrency(selection) {
  invariant(Array.isArray(selection.lines) && selection.lines.length > 0, 'ORDER_SELECTION_LINES_REQUIRED', 'Submitted selection must contain at least one line');
  const currencies = new Set();
  for (const line of selection.lines) {
    invariant(/^[A-Z]{3}$/.test(line?.currency ?? ''), 'ORDER_SELECTION_CURRENCY_INVALID', 'Every submitted selection line must carry its frozen ISO-4217 currency', {
      selectionId: selection.id,
      sku: line?.sku ?? null,
      currency: line?.currency ?? null,
    });
    currencies.add(line.currency);
  }
  invariant(currencies.size === 1, 'ORDER_SELECTION_CURRENCY_INCONSISTENT', 'Submitted selection lines must use one frozen currency', {
    selectionId: selection.id,
    currencies: [...currencies].sort(),
  });
  return [...currencies][0];
}

function copyOptionalLineage(line) {
  const present = RICH_LINEAGE_KEYS.filter((key) => line[key] !== undefined && line[key] !== null && line[key] !== '');
  if (present.length === 0) return {};
  invariant(present.length === RICH_LINEAGE_KEYS.length, 'ORDER_LINE_LINEAGE_INCOMPLETE', 'Rich order line requires complete Product/Style/Colorway/Size lineage', { sku: line.sku, present });
  invariant(Number.isInteger(line.sizeSortOrder) && line.sizeSortOrder >= 0, 'ORDER_LINE_SIZE_ORDER_INVALID', 'Rich order line requires an ordered size value', { sku: line.sku });
  return {
    productSkuId: line.productSkuId,
    gtin: line.gtin ?? null,
    styleId: line.styleId,
    styleVersionId: line.styleVersionId,
    colorwayId: line.colorwayId,
    sizeValueId: line.sizeValueId,
    sizeCode: line.sizeCode,
    sizeLabelRu: line.sizeLabelRu ?? line.sizeCode,
    sizeLabelEn: line.sizeLabelEn ?? line.sizeCode,
    sizeSortOrder: line.sizeSortOrder,
  };
}

function freezeBuyerCommercialSnapshot(snapshot, shopId) {
  assertBuyerCommercialSnapshot(snapshot, { shopId });
  return Object.freeze({
    organisationId: snapshot.organisationId,
    organisationName: snapshot.organisationName,
    retailDoorId: snapshot.retailDoorId,
    retailDoorVersion: snapshot.retailDoorVersion,
    doorCode: snapshot.doorCode,
    doorName: snapshot.doorName,
    shipToAddress: Object.freeze({ ...snapshot.shipToAddress }),
    billToAddress: Object.freeze({ ...snapshot.billToAddress }),
  });
}

function hasPinnedCommercialBasis(value) {
  return Boolean(value?.buyerCatalogVersionId || value?.commercialPublicationId || value?.priceListVersionId || value?.commercialBasisHash || value?.accessGrantId);
}

function assertExpectedVersion(order, expectedVersion) {
  invariant(
    Number.isInteger(expectedVersion) && expectedVersion >= 1 && expectedVersion <= POSTGRES_INTEGER_MAXIMUM,
    'ORDER_EXPECTED_VERSION_INVALID',
    'Order expectedVersion must be a positive PostgreSQL integer',
    { expectedVersion },
  );
  invariant(
    order && Number.isInteger(order.version) && order.version === expectedVersion,
    'ORDER_CONCURRENCY_CONFLICT',
    'Order was changed by another operation',
    { id: order?.id, expectedVersion, actualVersion: order?.version },
  );
}

function termsEqual(left, right) {
  return Boolean(left)
    && left.incoterm === right.incoterm
    && left.paymentDays === right.paymentDays
    && left.prepaymentPercent === right.prepaymentPercent
    && left.deliveryStart === right.deliveryStart
    && left.deliveryEnd === right.deliveryEnd;
}

function validateTerms(terms) {
  invariant(terms && INCOTERMS.includes(terms.incoterm), 'ORDER_INCOTERM_INVALID', 'Unsupported Incoterm', { incoterm: terms?.incoterm });
  invariant(Number.isInteger(terms.paymentDays) && terms.paymentDays >= 0 && terms.paymentDays <= 365, 'ORDER_PAYMENT_DAYS_INVALID', 'Payment days must be an integer from 0 to 365');
  invariant(Number.isFinite(terms.prepaymentPercent) && terms.prepaymentPercent >= 0 && terms.prepaymentPercent <= 100, 'ORDER_PREPAYMENT_INVALID', 'Prepayment percent must be from 0 to 100');
  const deliveryStart = Date.parse(terms.deliveryStart);
  const deliveryEnd = Date.parse(terms.deliveryEnd);
  invariant(Number.isFinite(deliveryStart) && Number.isFinite(deliveryEnd) && deliveryStart <= deliveryEnd, 'ORDER_DELIVERY_WINDOW_INVALID', 'Delivery start and end must be valid and ordered');
  return Object.freeze({
    incoterm: terms.incoterm,
    paymentDays: terms.paymentDays,
    prepaymentPercent: terms.prepaymentPercent,
    deliveryStart: new Date(deliveryStart).toISOString(),
    deliveryEnd: new Date(deliveryEnd).toISOString(),
  });
}
