(function installLinesheetMatrixCore(global) {
  'use strict';

  function list(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : structuredClone(value); }
  function copyList(value) { return list(value).map(item => copy(item)); }
  function text(value) { return String(value ?? '').trim(); }

  function fail(code, message, details = {}) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    error.details = Object.freeze({ ...details });
    throw error;
  }

  function isRichBuyerCatalog(catalog) {
    return Boolean(catalog && catalog.status === 'published' && Array.isArray(catalog.styles) && catalog.styles.length > 0);
  }

  function availableToSellQuantity(availability) {
    if (!availability || availability.mode !== 'available_to_sell') return null;
    const quantity = Number(availability.quantity);
    return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
  }

  function positiveInteger(value) {
    if (value === '' || value === null || value === undefined) return null;
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized === '') return null;
    const number = Number(normalized);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }

  function quantityEntries(quantities) {
    if (!quantities || typeof quantities !== 'object' || Array.isArray(quantities)) return Object.freeze([]);
    return Object.freeze(Object.entries(quantities)
      .map(([sku, quantity]) => Object.freeze({ sku: text(sku), quantity: positiveInteger(quantity) }))
      .filter(entry => entry.sku && entry.quantity !== null)
      .sort((left, right) => left.sku.localeCompare(right.sku)));
  }

  function buildStyleMatrices(catalog) {
    if (!isRichBuyerCatalog(catalog)) return Object.freeze([]);
    const currency = text(catalog.currency);
    if (!currency) fail('BUYER_MATRIX_CURRENCY_REQUIRED', 'Buyer catalog currency is required', { buyerCatalogVersionId: catalog.id });
    const priceBySku = exactPriceLines(catalog);
    const styles = list(catalog.styles).map(style => buildStyleMatrix(style, priceBySku, currency, catalog));
    return Object.freeze(styles);
  }

  function exactPriceLines(catalog) {
    const bySku = new Map();
    for (const line of list(catalog.lines)) {
      const sku = text(line?.sku);
      if (!sku) fail('BUYER_MATRIX_PRICE_SKU_REQUIRED', 'Buyer catalog price line SKU is required', { buyerCatalogVersionId: catalog.id });
      if (bySku.has(sku)) fail('BUYER_MATRIX_PRICE_DUPLICATE', 'Buyer catalog contains duplicate price lines', { buyerCatalogVersionId: catalog.id, sku });
      bySku.set(sku, line);
    }
    return bySku;
  }

  function buildStyleMatrix(style, priceBySku, currency, catalog) {
    const styleId = text(style?.styleId);
    const styleVersionId = text(style?.styleVersionId);
    if (!styleId || !styleVersionId) fail('BUYER_MATRIX_STYLE_IDENTITY_REQUIRED', 'Rich buyer style identity is incomplete', { buyerCatalogVersionId: catalog.id });
    const colorways = list(style.colorways);
    if (!colorways.length) fail('BUYER_MATRIX_COLORWAYS_REQUIRED', 'Rich buyer style requires at least one colorway', { styleId });

    const sizesByKey = new Map();
    const rows = colorways.map(colorway => buildColorwayRow({ styleId, styleVersionId, colorway, priceBySku, sizesByKey, currency, catalog }));
    const sizes = [...sizesByKey.values()].sort(compareSizes);
    rows.sort((left, right) => left.code.localeCompare(right.code) || left.id.localeCompare(right.id));

    return deepFreeze({
      styleId,
      styleCode: text(style.styleCode) || styleId,
      styleVersionId,
      styleVersionNo: style.styleVersionNo ?? null,
      titleRu: text(style.titleRu),
      titleEn: text(style.titleEn),
      descriptionRu: text(style.descriptionRu),
      descriptionEn: text(style.descriptionEn),
      compositionRu: text(style.compositionRu),
      compositionEn: text(style.compositionEn),
      countryOfOrigin: text(style.countryOfOrigin),
      media: copyList(style.media),
      commercialTerms: copy(style.commercialTerms ?? null),
      sizes,
      rows,
    });
  }

  function buildColorwayRow({ styleId, styleVersionId, colorway, priceBySku, sizesByKey, currency, catalog }) {
    const colorwayId = text(colorway?.colorwayId);
    const code = text(colorway?.colorwayCode);
    if (!colorwayId || !code) fail('BUYER_MATRIX_COLORWAY_IDENTITY_REQUIRED', 'Rich buyer colorway identity is incomplete', { styleId });
    const cells = new Map();
    const skus = list(colorway.skus);
    if (!skus.length) fail('BUYER_MATRIX_COLORWAY_SKUS_REQUIRED', 'Buyer colorway requires at least one SKU', { styleId, colorwayId });

    for (const sku of skus) {
      const cell = matrixCell({ styleId, styleVersionId, colorwayId, sku, priceBySku, currency, catalog });
      const existingSize = sizesByKey.get(cell.size.key);
      if (existingSize) assertSameSize(existingSize, cell.size, styleId);
      else sizesByKey.set(cell.size.key, cell.size);
      if (cells.has(cell.size.key)) fail('BUYER_MATRIX_CELL_DUPLICATE', 'Colorway contains more than one SKU for the same size', {
        styleId, colorwayId, sizeKey: cell.size.key, firstSku: cells.get(cell.size.key).sku, duplicateSku: cell.sku,
      });
      cells.set(cell.size.key, cell);
    }

    return deepFreeze({
      id: colorwayId,
      code,
      nameRu: text(colorway.nameRu),
      nameEn: text(colorway.nameEn),
      colorRef: copy(colorway.colorRef ?? null),
      swatchHex: text(colorway.swatchHex) || null,
      media: copyList(colorway.media),
      attributes: copyList(colorway.attributes),
      cells: Object.fromEntries([...cells.entries()]),
    });
  }

  function matrixCell({ styleId, styleVersionId, colorwayId, sku, priceBySku, currency, catalog }) {
    const productSkuId = text(sku?.productSkuId);
    const skuCode = text(sku?.skuCode);
    const sizeValueId = text(sku?.sizeValueId || sku?.size?.id);
    const size = normalizeSize(sku?.size, sizeValueId, skuCode);
    if (!productSkuId || !skuCode || !sizeValueId) fail('BUYER_MATRIX_PRODUCT_SKU_IDENTITY_REQUIRED', 'Rich buyer SKU identity is incomplete', { styleId, colorwayId, sku: skuCode || null });

    const line = priceBySku.get(skuCode);
    if (!line) fail('BUYER_MATRIX_PRICE_LINE_MISSING', 'Rich buyer SKU is missing its frozen buyer price line', { buyerCatalogVersionId: catalog.id, sku: skuCode });
    assertOptionalIdentity(line.productSkuId, productSkuId, 'productSkuId', skuCode);
    assertOptionalIdentity(line.styleVersionId, styleVersionId, 'styleVersionId', skuCode);
    assertOptionalIdentity(line.colorwayId, colorwayId, 'colorwayId', skuCode);
    assertOptionalIdentity(line.sizeValueId, sizeValueId, 'sizeValueId', skuCode);

    const lineCurrency = text(line.currency || currency);
    if (lineCurrency !== currency) fail('BUYER_MATRIX_CURRENCY_MISMATCH', 'Buyer price line currency does not match buyer catalog', { sku: skuCode, expected: currency, actual: lineCurrency });
    const minimumOrderQuantity = Number(line.minimumOrderQuantity);
    if (!Number.isSafeInteger(minimumOrderQuantity) || minimumOrderQuantity < 1) fail('BUYER_MATRIX_MOQ_INVALID', 'Buyer price line MOQ must be a positive integer', { sku: skuCode });
    const catalogVersion = Number(line.catalogVersion);
    if (!Number.isSafeInteger(catalogVersion) || catalogVersion < 1) fail('BUYER_MATRIX_CATALOG_VERSION_INVALID', 'Buyer price line catalog version must be a positive integer', { sku: skuCode });

    if (sku.buyerCurrency !== undefined && text(sku.buyerCurrency) !== lineCurrency) fail('BUYER_MATRIX_BUYER_PRICE_MISMATCH', 'Rich SKU buyer currency does not match frozen price line', { sku: skuCode });
    if (sku.buyerUnitPrice !== undefined && String(sku.buyerUnitPrice) !== String(line.unitPrice)) fail('BUYER_MATRIX_BUYER_PRICE_MISMATCH', 'Rich SKU buyer price does not match frozen price line', { sku: skuCode });
    if (sku.buyerMinimumOrderQuantity !== undefined && Number(sku.buyerMinimumOrderQuantity) !== minimumOrderQuantity) fail('BUYER_MATRIX_BUYER_PRICE_MISMATCH', 'Rich SKU buyer MOQ does not match frozen price line', { sku: skuCode });

    const availability = copy(line.availability ?? sku.commercialTerms?.availability ?? null);
    return deepFreeze({
      sku: skuCode,
      productSkuId,
      gtin: sku.gtin ?? null,
      styleId,
      styleVersionId,
      colorwayId,
      sizeValueId,
      size,
      unitPrice: line.unitPrice,
      currency: lineCurrency,
      catalogVersion,
      minimumOrderQuantity,
      availability,
      availableToSell: availableToSellQuantity(availability),
    });
  }

  function normalizeSize(raw, sizeValueId, skuCode) {
    const id = text(raw?.id || sizeValueId);
    const code = text(raw?.code);
    const sortOrder = Number(raw?.sortOrder);
    if (!id || !code) fail('BUYER_MATRIX_SIZE_IDENTITY_REQUIRED', 'Buyer SKU size identity is incomplete', { sku: skuCode });
    if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) fail('BUYER_MATRIX_SIZE_ORDER_INVALID', 'Buyer SKU size sort order must be a non-negative integer', { sku: skuCode, sizeValueId: id });
    return deepFreeze({
      key: id,
      id,
      code,
      labelRu: text(raw?.labelRu) || code,
      labelEn: text(raw?.labelEn) || code,
      sortOrder,
    });
  }

  function assertSameSize(left, right, styleId) {
    for (const field of ['id', 'code', 'labelRu', 'labelEn', 'sortOrder']) {
      if (left[field] !== right[field]) fail('BUYER_MATRIX_SIZE_CONFLICT', 'The same size identity has conflicting frozen attributes', {
        styleId, sizeValueId: left.id, field, left: left[field], right: right[field],
      });
    }
  }

  function assertOptionalIdentity(actual, expected, field, sku) {
    if (actual === undefined || actual === null || actual === '') return;
    if (text(actual) !== expected) fail('BUYER_MATRIX_LINEAGE_MISMATCH', 'Frozen price line lineage does not match rich buyer hierarchy', { sku, field, expected, actual });
  }

  function compareSizes(left, right) {
    return left.sortOrder - right.sortOrder || left.code.localeCompare(right.code) || left.id.localeCompare(right.id);
  }

  function matrixCellsBySku(matrices) {
    const cells = new Map();
    for (const style of list(matrices)) {
      for (const row of list(style?.rows)) {
        for (const cell of Object.values(row?.cells ?? {})) {
          if (!cell?.sku) continue;
          if (cells.has(cell.sku)) fail('BUYER_MATRIX_SKU_DUPLICATE', 'Buyer order matrix contains duplicate SKU cells', { sku: cell.sku });
          cells.set(cell.sku, cell);
        }
      }
    }
    return cells;
  }

  function validateRequestedQuantity(cell, quantity) {
    const normalized = positiveInteger(quantity);
    if (normalized === null) fail('BUYER_MATRIX_QUANTITY_INVALID', 'Buyer matrix quantity must be a positive integer', { sku: cell?.sku, quantity });
    if (normalized < cell.minimumOrderQuantity) fail('BUYER_MATRIX_MOQ_NOT_MET', 'Buyer matrix quantity is below the frozen buyer MOQ', { sku: cell.sku, quantity: normalized, minimumOrderQuantity: cell.minimumOrderQuantity });
    if (cell.availableToSell !== null && normalized > cell.availableToSell) fail('BUYER_MATRIX_AVAILABILITY_EXCEEDED', 'Buyer matrix quantity exceeds frozen available-to-sell', { sku: cell.sku, quantity: normalized, availableToSell: cell.availableToSell });
    return normalized;
  }

  function selectionMatrixRequest(selectionId, matrices, quantities) {
    const id = text(selectionId);
    if (!id) fail('BUYER_MATRIX_SELECTION_ID_REQUIRED', 'Selection id is required for matrix replacement');
    const cells = matrixCellsBySku(matrices);
    const lines = quantityEntries(quantities).map(entry => {
      const cell = cells.get(entry.sku);
      if (!cell) fail('BUYER_MATRIX_SKU_UNKNOWN', 'Quantity refers to a SKU outside the rendered immutable buyer matrix', { sku: entry.sku });
      return Object.freeze({ sku: entry.sku, quantity: validateRequestedQuantity(cell, entry.quantity) });
    });
    return deepFreeze({
      method: 'PUT',
      path: `/v2/selections/${encodeURIComponent(id)}/matrix`,
      body: { selectionId: id, lines },
    });
  }

  function createSelectionRequest(cycleId, showroomId) {
    const normalizedCycleId = text(cycleId);
    const normalizedShowroomId = text(showroomId);
    if (!normalizedCycleId || !normalizedShowroomId) fail('BUYER_MATRIX_SELECTION_CONTEXT_REQUIRED', 'Cycle and showroom are required to create a buyer selection');
    return deepFreeze({ method: 'POST', path: '/v2/selections', body: { cycleId: normalizedCycleId, showroomId: normalizedShowroomId } });
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
    return value;
  }

  global.SynthaLinesheetMatrix = Object.freeze({
    isRichBuyerCatalog,
    buildStyleMatrices,
    availableToSellQuantity,
    positiveInteger,
    quantityEntries,
    matrixCellsBySku,
    validateRequestedQuantity,
    selectionMatrixRequest,
    createSelectionRequest,
  });
})(typeof window === 'undefined' ? globalThis : window);
