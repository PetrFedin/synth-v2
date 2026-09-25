import { createHash } from 'node:crypto';

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
//
// And it carries the product all the way to a real CommercialPublication — the canonical PLM→
// commerce handoff (`ProductReadinessSnapshot -> CommercialProductProjectionVersion ->
// CommercialPublication`, AGENTS.md) — instead of stopping at a published BOM. Without that, the
// rest of `seed-demo.mjs` (`ensureBuyerCatalog` onward) has nothing to build a showroom on. The
// route taken is `READY_GOODS`: it is the cheapest honest path to a `ready` snapshot — `bom`,
// `samples` and `tech_pack` are `not_applicable` under it by the domain's own rule, so the BOM built
// above serves the size-line demo and plays no part in the readiness gate, and `sourcing` /
// `purchase_or_production_commitment` / `quality` are satisfied with immutable external evidence
// rather than by also standing up sourcing/production/quality services here.
//
// This campaign/collection is always its own, never an existing one: `assignStyleVersionToCollection`
// only succeeds while the collection is still `draft`, so publishing this product's readiness needs a
// collection this script fully controls the lifecycle of. Its name deliberately does not contain
// "DEMO" so it never wins `pickDemoCollection`'s name-priority ordering over a real demonstration
// collection that already exists — it only becomes *the* collection `seed-demo.mjs` walks when it is
// the only one, i.e. exactly the from-zero case this script exists for.
const CAMPAIGN_NAME = 'Aurora Season';
const COLLECTION_NAME = 'Aurora Collection';
const STYLE_CODE = 'SYN.JKT';
const COLORWAY_CODE = 'MIDNIGHT';
const SIZE_SCALE_CODE = 'APPAREL.ALPHA';
const CURRENCY = 'EUR';

// Well-known governed MDM entries loaded by `npm run bootstrap:mdm-reference` from
// `mdm/reference/russia-fashion-core.json` / `russia-fashion-assortment-core.json` — the same
// entries `src/acceptance/product-readiness-ready-live-acceptance.mjs` pins as
// `READY_PRODUCT_MDM_REFERENCES`, reused here by value rather than by import since this is seed
// code, not acceptance code.
const MDM = Object.freeze({
  category: Object.freeze({ entryId: 'mdm-entry:assortment-category:apparel', version: 1 }),
  measurementUnit: Object.freeze({ entryId: 'mdm-entry:measurement-unit:cm', version: 1 }),
  measurementPoint: Object.freeze({ entryId: 'mdm-entry:measurement-point:chest-circ', version: 1 }),
});
const EVIDENCE_APPROVED_AT = '2027-01-10T00:00:00.000Z';

// Расход растёт с размером — так и должна выглядеть градуированная ведомость, а не одна цифра на
// все размеры. Цифры условны, но правдоподобны: подкладка расходуется меньше полотна верха.
//
// `quantity` (the catalog SKU's own available-to-sell stock) must clear the highest fixed order
// quantity `seed-demo.mjs`'s `ensureSelection` can pick per line (`[180, 640, 240, 420]`, cycled by
// alphabetical SKU order) — the buyer catalogue's flat `commercialPreparation.availability.quantity`
// only caps the *selection*, the physical ProductSku inventory gate at order-commit checks this
// number instead, and a real order for this size run must clear both.
const SIZE_RUN = Object.freeze([
  { code: 'S', labelRu: 'S', labelEn: 'S', sortOrder: 1, shellMetres: 1.8, liningMetres: 0.9, quantity: 900 },
  { code: 'M', labelRu: 'M', labelEn: 'M', sortOrder: 2, shellMetres: 2.0, liningMetres: 1.0, quantity: 900 },
  { code: 'L', labelRu: 'L', labelEn: 'L', sortOrder: 3, shellMetres: 2.2, liningMetres: 1.1, quantity: 900 },
]);

const SHELL_MATERIAL_CODE = 'FAB-AURORA-SHELL';
const LINING_MATERIAL_CODE = 'FAB-AURORA-LINING';

/**
 * Строит демо-товар с настоящим размерным рядом от кампании до опубликованной ведомости на
 * каждый размер, если его ещё нет. Идемпотентно: каждый шаг сперва смотрит, чего уже есть.
 */
export async function ensureProductFoundation(runtime, pool, brandId, actorId, { note, command }) {
  const campaign = await ensureCampaign(runtime, pool, brandId, actorId, command);
  const collection = await ensureCollection(runtime, pool, campaign, brandId, actorId, command);
  const style = await ensureStyle(runtime, pool, brandId, actorId, command);
  const styleVersion = await ensureStyleVersion(runtime, pool, style, actorId, command);
  // Assigning and publishing happens here, right after the style version exists and before any
  // catalog SKU is published — `publishCatalogSku` itself requires the collection to already be
  // published, and assignment can only happen while it is still draft. There is no order that
  // satisfies both constraints except this one.
  await ensureCollectionAssignmentAndPublish(runtime, pool, collection, styleVersion, actorId, command);
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

  const media = await ensureMedia(runtime, pool, styleVersion, colorway, actorId, command);
  await ensureAttributeValue(runtime, pool, styleVersion, actorId, command);
  await ensureMeasurementChart(runtime, pool, styleVersion, colorway, sizeScaleVersion, sizeValues, actorId, command);
  const readiness = await ensureReadiness(runtime, pool, styleVersion, media, actorId, command, note);
  const projection = await ensureCommercialProjection(runtime, pool, readiness, actorId, command);
  const publication = await ensureCommercialPublication(runtime, pool, collection, projection, actorId, command, note);

  return {
    collection, styleId: style.id, styleVersionId: styleVersion.id,
    readinessId: readiness.id, projectionId: projection.id, publicationId: publication.id,
  };
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

// Left in draft here on purpose: `assignStyleVersionToCollection` only succeeds while the collection
// is draft, and that assignment has to happen after the style version exists but before this
// collection can carry a CommercialPublication. `ensureCollectionAssignmentAndPublish` publishes it
// once the assignment is in place.
async function ensureCollection(runtime, pool, campaign, brandId, actorId, command) {
  const existing = await pool.query(
    "SELECT id, status FROM collections WHERE campaign_id = $1 AND payload ->> 'name' = $2",
    [campaign.id, COLLECTION_NAME],
  );
  if (existing.rowCount) return { id: existing.rows[0].id, campaignId: campaign.id };
  const created = await runtime.platform.createCollection(command('foundation-collection'), actorId, {
    campaignId: campaign.id, brandId, name: COLLECTION_NAME, currency: CURRENCY,
  });
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
  // categoryRef is required for readiness's `category` dimension — omitting it (it's optional at
  // the domain layer) would leave this StyleVersion permanently unable to reach `ready`, since
  // StyleVersions are immutable and there is no update path to add it after creation.
  return runtime.productIdentity.createStyleVersion(command('foundation-style-version'), actorId, style.id, {
    expectedLatestVersionNo: 0,
    titleRu: 'Aurora Quilted Jacket',
    titleEn: 'Aurora Quilted Jacket',
    categoryRef: MDM.category,
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

// Readiness's `commercial_media` dimension requires a selected hero image covering every colorway —
// one colorway here, so one hero image tied to it is sufficient coverage.
async function ensureMedia(runtime, pool, styleVersion, colorway, actorId, command) {
  const existing = await pool.query(
    "SELECT id FROM product_media WHERE style_version_id = $1 AND colorway_id = $2 AND media_role = 'hero' AND sort_order = 0",
    [styleVersion.id, colorway.id],
  );
  if (existing.rowCount) return { id: existing.rows[0].id };
  return runtime.productIdentity.addMedia(command('foundation-media'), actorId, styleVersion.id, {
    colorwayId: colorway.id, mediaType: 'image', mediaRole: 'hero',
    uri: 'https://example.invalid/syntha-demo/aurora-quilted-jacket-midnight.jpg', sortOrder: 0,
  });
}

// Readiness's `product_attributes` dimension requires both a governed attribute value in the
// register AND `commercialPreparation.attributeCoverageConfirmed: true` — the confirmation alone is
// not enough, on purpose (ARCHITECTURE.md: the platform used to record "attributes ready" next to
// its own proof that there were none).
async function ensureAttributeValue(runtime, pool, styleVersion, actorId, command) {
  const existing = await pool.query(
    "SELECT 1 FROM product_attribute_values WHERE owner_type = 'style_version' AND owner_id = $1 AND attribute_code = $2",
    [styleVersion.id, 'apparel.fabric_type'],
  );
  if (existing.rowCount) return;
  await runtime.productIdentity.createAttributeValue(command('foundation-attribute'), actorId, {
    ownerType: 'style_version', ownerId: styleVersion.id,
    attributeCode: 'apparel.fabric_type', attributeCatalogVersion: '1.0.0', value: 'Стёганый нейлон 40D',
  });
}

// Measurement coverage is required per Colorway × SizeScaleVersion regardless of development route,
// and must cover every SizeValue actually used by a SKU on that colorway — one chart with S/M/L,
// not one chart per size.
async function ensureMeasurementChart(runtime, pool, styleVersion, colorway, sizeScaleVersion, sizeValues, actorId, command) {
  const existing = await pool.query(
    'SELECT id, status, version FROM measurement_charts WHERE style_version_id = $1 AND colorway_id = $2 AND size_scale_version_id = $3',
    [styleVersion.id, colorway.id, sizeScaleVersion.id],
  );
  if (existing.rowCount) {
    if (existing.rows[0].status === 'published') return;
    await runtime.measurements.publishCanonicalMeasurementChart(command('foundation-measurement-publish'), actorId, existing.rows[0].id, { expectedVersion: existing.rows[0].version });
    return;
  }
  const draft = await runtime.measurements.createCanonicalMeasurementChart(command('foundation-measurement'), actorId, {
    styleVersionId: styleVersion.id, colorwayId: colorway.id, sizeScaleVersionId: sizeScaleVersion.id,
    measurementUnitEntryId: MDM.measurementUnit.entryId,
    baseSizeValueId: sizeValues.M.id,
    sizes: SIZE_RUN.map((size) => ({ sizeValueId: sizeValues[size.code].id })),
    points: [{
      pointEntryId: MDM.measurementPoint.entryId,
      description: 'Обхват груди.',
      toleranceMinus: 1,
      tolerancePlus: 1,
      // Растёт вместе с расходом ткани — тот же принцип градации, что и в ведомости.
      measurements: SIZE_RUN.map((size) => ({ sizeValueId: sizeValues[size.code].id, value: 92 + (size.sortOrder - 1) * 4 })),
    }],
    notes: 'Aurora Quilted Jacket — канонический табель мер.',
  });
  await runtime.measurements.publishCanonicalMeasurementChart(command('foundation-measurement-publish'), actorId, draft.id, { expectedVersion: draft.version });
}

async function ensureCollectionAssignmentAndPublish(runtime, pool, collection, styleVersion, actorId, command) {
  const current = await pool.query('SELECT status FROM collections WHERE id = $1', [collection.id]);
  if (current.rows[0].status === 'published') return;
  const assigned = await pool.query(
    'SELECT 1 FROM collection_style_versions WHERE collection_id = $1 AND style_version_id = $2',
    [collection.id, styleVersion.id],
  );
  if (!assigned.rowCount) {
    await runtime.platform.assignStyleVersionToCollection(command('foundation-collection-assign'), actorId, {
      collectionId: collection.id, styleVersionId: styleVersion.id,
    });
  }
  await runtime.platform.publishCollection(command('foundation-collection-publish'), actorId, collection.id);
}

// `assessReadiness` has no natural-key idempotency of its own — every call mints a new
// ProductReadinessSnapshot row, deduplicated only by commandId, and `command()` mints a fresh one
// every run. Reusing an existing `ready` snapshot here is what keeps a rerun from piling up snapshots.
async function ensureReadiness(runtime, pool, styleVersion, media, actorId, command, note) {
  const existing = await pool.query(
    "SELECT id, readiness_status FROM product_readiness_snapshots WHERE style_version_id = $1 AND readiness_status = 'ready' ORDER BY assessed_at DESC LIMIT 1",
    [styleVersion.id],
  );
  if (existing.rowCount) return { id: existing.rows[0].id };

  const commercialPreparation = {
    titleRu: 'Aurora Quilted Jacket',
    titleEn: 'Aurora Quilted Jacket',
    descriptionRu: 'Стёганая куртка со съёмным капюшоном, утеплитель 120 г/м².',
    descriptionEn: 'Quilted jacket with a detachable hood, 120 gsm synthetic insulation.',
    compositionRu: 'Верх: 100% нейлон. Подкладка: 100% полиэстер.',
    compositionEn: 'Shell: 100% nylon. Lining: 100% polyester.',
    countryOfOrigin: 'TR',
    currency: CURRENCY,
    wholesalePriceMinor: 12800,
    rrpMinor: 25600,
    minimumOrderQuantity: 2,
    deliveryStart: '2027-02-01',
    deliveryEnd: '2027-04-30',
    availability: { mode: 'available_to_sell', quantity: 1000 },
    mediaIds: [media.id],
    attributeCoverageConfirmed: true,
  };
  const externalEvidence = Object.freeze({
    sourcing: evidence('sourcing', actorId),
    purchase_or_production_commitment: evidence('purchase', actorId),
    quality: evidence('quality', actorId),
    compliance: evidence('compliance', actorId),
  });

  const snapshot = await runtime.productReadiness.assessReadiness(command('foundation-readiness'), actorId, styleVersion.id, {
    developmentRoute: 'READY_GOODS', commercialPreparation, externalEvidence,
  });
  if (snapshot.readinessStatus !== 'ready') {
    const blocked = snapshot.dimensions.filter((dimension) => dimension.status === 'blocked').map((dimension) => dimension.code);
    note('product foundation', `readiness blocked on: ${blocked.join(', ')}`);
    throw new Error(`Aurora Quilted Jacket readiness assessment is blocked: ${blocked.join(', ')}`);
  }
  return snapshot;
}

function evidence(dimension, approvedBy) {
  return Object.freeze({
    status: 'ready',
    evidenceId: `foundation-${dimension}`,
    sourceSystem: 'syntha-seed-demo',
    version: `foundation:${dimension}:1`,
    contentHash: createHash('sha256').update(`foundation:${dimension}`).digest('hex'),
    approvedAt: EVIDENCE_APPROVED_AT,
    approvedBy,
  });
}

async function ensureCommercialProjection(runtime, pool, readiness, actorId, command) {
  const existing = await pool.query(
    'SELECT id FROM commercial_product_projection_versions WHERE readiness_snapshot_id = $1',
    [readiness.id],
  );
  if (existing.rowCount) return { id: existing.rows[0].id };
  return runtime.productReadiness.publishCommercialProjection(command('foundation-projection'), actorId, readiness.id, {
    expectedLatestVersionNo: 0,
  });
}

async function ensureCommercialPublication(runtime, pool, collection, projection, actorId, command, note) {
  const existing = await pool.query(
    'SELECT id FROM commercial_publications WHERE collection_id = $1 AND commercial_projection_id = $2',
    [collection.id, projection.id],
  );
  if (existing.rowCount) { note('product foundation', `commercial publication ${existing.rows[0].id} already exists`); return { id: existing.rows[0].id }; }
  const publication = await runtime.commercialPublication.publishCommercialPublication(command('foundation-publication'), actorId, {
    collectionId: collection.id, commercialProjectionId: projection.id,
  });
  note('product foundation', `commercial publication ${publication.id} published for ${collection.id}`);
  return publication;
}
