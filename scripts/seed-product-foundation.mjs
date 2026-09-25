// The product foundation the rest of the demonstration assumes.
//
// `seed-demo.mjs` opens a showroom over a published collection, walks a buyer through it and closes
// an order — but it has never once created the collection, the style behind it or the SKU the order
// is for. That foundation was built by hand, outside any script, straight into a database that
// nobody can hand a colleague or a fresh environment: the seed was never provably from zero. This
// closes that gap the same way the rest of the demonstration is built — through the services a
// customer would use, under the same invariants, idempotently.
//
// It also gives the demonstration something it never had: a real size run. The jacket that used to
// carry a single size "M" now ships as S/M/L, on one size scale created in the correct order from
// the start — a size scale version is immutable once written, so a run that started as one size
// could never be reordered into S, M, L after the fact. Building fresh avoids that trap rather than
// working around it.
const CAMPAIGN_NAME = 'DEMO Aurora Season';
const COLLECTION_NAME = 'Aurora Collection';
const STYLE_CODE = 'SYN.JKT';
const COLORWAY_CODE = 'MIDNIGHT';
const SIZE_SCALE_CODE = 'APPAREL.ALPHA';
const CURRENCY = 'EUR';

// Расход растёт с размером — так и должна выглядеть градуированная ведомость, а не одна цифра на
// все размеры. Цифры условны, но правдоподобны: подкладка расходуется меньше полотна верха.
const SIZE_RUN = Object.freeze([
  { code: 'S', labelRu: 'S', labelEn: 'S', sortOrder: 1, shellMetres: 1.8, liningMetres: 0.9, quantity: 320 },
  { code: 'M', labelRu: 'M', labelEn: 'M', sortOrder: 2, shellMetres: 2.0, liningMetres: 1.0, quantity: 420 },
  { code: 'L', labelRu: 'L', labelEn: 'L', sortOrder: 3, shellMetres: 2.2, liningMetres: 1.1, quantity: 260 },
]);

const SHELL_MATERIAL_CODE = 'FAB-AURORA-SHELL';
const LINING_MATERIAL_CODE = 'FAB-AURORA-LINING';

/**
 * Строит демо-товар с настоящим размерным рядом от кампании до опубликованной ведомости на
 * каждый размер, если его ещё нет. Идемпотентно: каждый шаг сперва смотрит, чего уже есть.
 */
export async function ensureProductFoundation(runtime, pool, brandId, actorId, { note, command }) {
  // A published collection is reused if the brand already has one — this product is meant to join
  // whatever season already exists, not to compete with it for `pickDemoCollection`'s attention.
  // Only a database with none at all (a genuine from-zero run) gets a season built for it here.
  const anchor = await pool.query(
    "SELECT id, campaign_id FROM collections WHERE brand_id = $1 AND status = 'published' ORDER BY id LIMIT 1",
    [brandId],
  );
  const collection = anchor.rowCount
    ? { id: anchor.rows[0].id, campaignId: anchor.rows[0].campaign_id }
    : await ensureCollection(runtime, pool, await ensureCampaign(runtime, pool, brandId, actorId, command), brandId, actorId, command);
  const style = await ensureStyle(runtime, pool, brandId, actorId, command);
  const styleVersion = await ensureStyleVersion(runtime, pool, style, actorId, command);
  const colorway = await ensureColorway(runtime, pool, styleVersion, actorId, command);
  const sizeScale = await ensureSizeScale(runtime, pool, brandId, actorId, command);
  const sizeScaleVersion = await ensureSizeScaleVersion(runtime, pool, sizeScale, actorId, command);
  const sizeValues = await ensureSizeValues(runtime, pool, sizeScaleVersion, actorId, command);
  await ensureMaterials(runtime, pool, brandId, actorId, command);

  let created = 0;
  for (const size of SIZE_RUN) {
    const madeSku = await ensureGradedSku(runtime, pool, {
      brandId, actorId, command, styleVersion, colorway, sizeValue: sizeValues[size.code], collection, size,
    });
    if (madeSku) created += 1;
  }

  if (created === 0) {
    note('product foundation', `${STYLE_CODE} / ${COLORWAY_CODE} already has a published S/M/L run`);
  } else {
    note('product foundation', `${STYLE_CODE} / ${COLORWAY_CODE} — ${created} size(s) built (${SIZE_RUN.map((s) => s.code).join(', ')})`);
  }
  return { collection, styleId: style.id, styleVersionId: styleVersion.id };
}

async function ensureCampaign(runtime, pool, brandId, actorId, command) {
  const existing = await pool.query(
    "SELECT id, version FROM campaigns WHERE brand_id = $1 AND payload ->> 'name' = $2",
    [brandId, CAMPAIGN_NAME],
  );
  if (existing.rowCount) return { id: existing.rows[0].id };
  const created = await runtime.platform.createCampaign(command('foundation-campaign'), actorId, {
    brandId, name: CAMPAIGN_NAME, season: 'SS27',
    startsAt: '2027-01-15T00:00:00.000Z', endsAt: '2027-03-01T00:00:00.000Z',
  });
  await runtime.platform.openCampaign(command('foundation-campaign-open'), actorId, created.id);
  return created;
}

async function ensureCollection(runtime, pool, campaign, brandId, actorId, command) {
  const existing = await pool.query(
    "SELECT id, status FROM collections WHERE campaign_id = $1 AND payload ->> 'name' = $2",
    [campaign.id, COLLECTION_NAME],
  );
  if (existing.rowCount) {
    if (existing.rows[0].status !== 'published') {
      await runtime.platform.publishCollection(command('foundation-collection-publish'), actorId, existing.rows[0].id);
    }
    return { id: existing.rows[0].id, campaignId: campaign.id };
  }
  const created = await runtime.platform.createCollection(command('foundation-collection'), actorId, {
    campaignId: campaign.id, brandId, name: COLLECTION_NAME, currency: CURRENCY,
  });
  await runtime.platform.publishCollection(command('foundation-collection-publish'), actorId, created.id);
  return { id: created.id, campaignId: campaign.id };
}

async function ensureStyle(runtime, pool, brandId, actorId, command) {
  const existing = await pool.query('SELECT id FROM product_styles WHERE brand_id = $1 AND style_code = $2', [brandId, STYLE_CODE]);
  if (existing.rowCount) return { id: existing.rows[0].id, brandId };
  return runtime.productIdentity.createStyle(command('foundation-style'), actorId, { brandId, styleCode: STYLE_CODE });
}

async function ensureStyleVersion(runtime, pool, style, actorId, command) {
  const existing = await pool.query(
    'SELECT id, version_no FROM product_style_versions WHERE style_id = $1 ORDER BY version_no DESC LIMIT 1',
    [style.id],
  );
  if (existing.rowCount) return { id: existing.rows[0].id, brandId: style.brandId };
  return runtime.productIdentity.createStyleVersion(command('foundation-style-version'), actorId, style.id, {
    expectedLatestVersionNo: 0,
    titleRu: 'Aurora Quilted Jacket',
    titleEn: 'Aurora Quilted Jacket',
  });
}

async function ensureColorway(runtime, pool, styleVersion, actorId, command) {
  const existing = await pool.query(
    'SELECT id FROM product_colorways WHERE style_version_id = $1 AND colorway_code = $2',
    [styleVersion.id, COLORWAY_CODE],
  );
  if (existing.rowCount) return { id: existing.rows[0].id, brandId: styleVersion.brandId };
  return runtime.productIdentity.createColorway(command('foundation-colorway'), actorId, styleVersion.id, {
    colorwayCode: COLORWAY_CODE, nameRu: 'Тёмно-синий', nameEn: 'Midnight', swatchHex: '#1B1F3B',
  });
}

async function ensureSizeScale(runtime, pool, brandId, actorId, command) {
  const existing = await pool.query('SELECT id FROM product_size_scales WHERE brand_id = $1 AND scale_code = $2', [brandId, SIZE_SCALE_CODE]);
  if (existing.rowCount) return { id: existing.rows[0].id, brandId };
  return runtime.productIdentity.createSizeScale(command('foundation-size-scale'), actorId, {
    brandId, scaleCode: SIZE_SCALE_CODE, nameRu: 'Буквенная ростовка (S–L)', nameEn: 'Alpha size run (S–L)',
  });
}

async function ensureSizeScaleVersion(runtime, pool, sizeScale, actorId, command) {
  const existing = await pool.query(
    'SELECT id, version_no FROM product_size_scale_versions WHERE size_scale_id = $1 ORDER BY version_no DESC LIMIT 1',
    [sizeScale.id],
  );
  if (existing.rowCount) return { id: existing.rows[0].id, brandId: sizeScale.brandId };
  return runtime.productIdentity.createSizeScaleVersion(command('foundation-size-scale-version'), actorId, sizeScale.id, {
    expectedLatestVersionNo: 0,
  });
}

async function ensureSizeValues(runtime, pool, sizeScaleVersion, actorId, command) {
  const existing = await pool.query(
    'SELECT size_code, id FROM product_size_values WHERE size_scale_version_id = $1',
    [sizeScaleVersion.id],
  );
  const byCode = Object.fromEntries(existing.rows.map((row) => [row.size_code, { id: row.id, brandId: sizeScaleVersion.brandId }]));
  for (const size of SIZE_RUN) {
    if (byCode[size.code]) continue;
    byCode[size.code] = await runtime.productIdentity.createSizeValue(command(`foundation-size-value-${size.code}`), actorId, sizeScaleVersion.id, {
      sizeCode: size.code, labelRu: size.labelRu, labelEn: size.labelEn, sortOrder: size.sortOrder,
    });
  }
  return byCode;
}

async function ensureMaterials(runtime, pool, brandId, actorId, command) {
  await ensureMaterial(runtime, pool, brandId, actorId, command, {
    code: SHELL_MATERIAL_CODE, name: 'Стёганый нейлон 40D', type: 'fabric', unit: 'm',
    supplierName: 'Atmosphere Textiles', supplierReference: 'AUR-SHELL-40D',
    composition: '100% nylon', color: 'Midnight', currency: CURRENCY, unitCost: 9.4,
    minimumOrderQuantity: 100, availableQuantity: 4000,
  });
  await ensureMaterial(runtime, pool, brandId, actorId, command, {
    code: LINING_MATERIAL_CODE, name: 'Тафта, подкладочная', type: 'fabric', unit: 'm',
    supplierName: 'Atmosphere Textiles', supplierReference: 'AUR-LINING-TAF',
    composition: '100% polyester', color: 'Black', currency: CURRENCY, unitCost: 3.1,
    minimumOrderQuantity: 100, availableQuantity: 4000,
  });
}

async function ensureMaterial(runtime, pool, brandId, actorId, command, spec) {
  const existing = await pool.query('SELECT code, status, version FROM materials WHERE code = $1', [spec.code]);
  if (existing.rowCount) {
    if (existing.rows[0].status !== 'published') {
      await runtime.materials.publishMaterial(command(`foundation-material-publish-${spec.code}`), actorId, spec.code, { expectedVersion: existing.rows[0].version });
    }
    return;
  }
  const draft = await runtime.materials.createMaterial(command(`foundation-material-${spec.code}`), actorId, { brandId, ...spec });
  await runtime.materials.publishMaterial(command(`foundation-material-publish-${spec.code}`), actorId, draft.code, { expectedVersion: draft.version });
}

async function ensureGradedSku(runtime, pool, { brandId, actorId, command, styleVersion, colorway, sizeValue, collection, size }) {
  const skuCode = `SYN-JKT-AURORA-MIDNIGHT-${size.code}`;

  const existingProductSku = await pool.query('SELECT id FROM product_skus WHERE sku_code = $1', [skuCode]);
  const productSku = existingProductSku.rowCount
    ? { id: existingProductSku.rows[0].id }
    : await runtime.productIdentity.createSku(command(`foundation-sku-${size.code}`), actorId, {
      styleVersionId: styleVersion.id, colorwayId: colorway.id, sizeValueId: sizeValue.id, skuCode,
    });

  const existingCatalogSku = await pool.query('SELECT sku, status, version FROM catalog_skus WHERE sku = $1', [skuCode]);
  let catalogSku;
  if (existingCatalogSku.rowCount) {
    catalogSku = existingCatalogSku.rows[0];
    if (catalogSku.status !== 'published') {
      catalogSku = await runtime.catalog.publishSku(command(`foundation-catalog-publish-${size.code}`), actorId, skuCode, { expectedVersion: catalogSku.version });
    }
  } else {
    const draft = await runtime.catalog.createSku(command(`foundation-catalog-${size.code}`), actorId, {
      sku: skuCode, collectionId: collection.id, brandId, name: `Aurora Quilted Jacket — ${size.code}`,
      wholesalePrice: 128, currency: CURRENCY, minimumOrderQuantity: 2, availableQuantity: size.quantity,
    });
    catalogSku = await runtime.catalog.publishSku(command(`foundation-catalog-publish-${size.code}`), actorId, draft.sku, { expectedVersion: draft.version });
  }

  const existingLink = await pool.query('SELECT product_sku_id FROM product_catalog_sku_links WHERE product_sku_id = $1', [productSku.id]);
  let madeSomething = !existingProductSku.rowCount;
  if (!existingLink.rowCount) {
    await runtime.productIdentity.linkCatalogSku(command(`foundation-link-${size.code}`), actorId, productSku.id, { catalogSku: skuCode });
    madeSomething = true;
  }

  const existingBom = await pool.query('SELECT id, status, version FROM boms WHERE sku = $1', [skuCode]);
  if (existingBom.rowCount) {
    if (existingBom.rows[0].status !== 'published') {
      await runtime.boms.publishBom(command(`foundation-bom-publish-${size.code}`), actorId, skuCode, { expectedVersion: existingBom.rows[0].version });
      madeSomething = true;
    }
    return madeSomething;
  }

  const bom = await runtime.boms.createBom(command(`foundation-bom-${size.code}`), actorId, {
    sku: skuCode, currency: CURRENCY,
    lines: [
      { lineId: 'SHELL', component: 'Полотно верха', materialCode: SHELL_MATERIAL_CODE, quantity: size.shellMetres, wastePercent: 7, exchangeRate: 1, isMain: true, placement: 'shell' },
      { lineId: 'LINING', component: 'Подкладка', materialCode: LINING_MATERIAL_CODE, quantity: size.liningMetres, wastePercent: 5, exchangeRate: 1, isMain: false, placement: 'lining' },
    ],
    laborCost: 6, overheadCost: 2.5, logisticsCost: 1.5, otherCost: 0,
    notes: `Градуированная ведомость размера ${size.code}.`,
  });
  await runtime.boms.publishBom(command(`foundation-bom-publish-${size.code}`), actorId, bom.sku, { expectedVersion: bom.version });
  return true;
}
