import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';
import { normalizeMoney } from '../../core/money.mjs';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_LINES = 10_000;
const LINEAGE_KEYS = Object.freeze([
  'commercialProjectionId',
  'commercialProjectionVersionNo',
  'commercialProjectionContentHash',
  'readinessSnapshotId',
  'styleVersionId',
]);

// New-write guard only. Historical V1 immutable snapshots remain readable
// exactly as persisted and are never upgraded by guessing ProductSku identity.
export function assertCanonicalPublication(publication) {
  invariant(
    publication?.status === 'published'
      && publication.formatVersion === 2
      && SAFE_ID.test(publication.commercialProjectionId ?? '')
      && Number.isInteger(publication.commercialProjectionVersionNo)
      && publication.commercialProjectionVersionNo > 0
      && SHA256.test(publication.commercialProjectionContentHash ?? '')
      && SAFE_ID.test(publication.readinessSnapshotId ?? '')
      && SAFE_ID.test(publication.styleVersionId ?? '')
      && Array.isArray(publication.styles)
      && publication.styles.length > 0,
    'PRICE_LIST_CANONICAL_PUBLICATION_REQUIRED',
    'New buyer pricing requires an exact projection-backed V2 CommercialPublication; legacy commercial snapshots are read-only',
    { publicationId: publication?.id },
  );
  invariant(
    Array.isArray(publication.lines)
      && publication.lines.length > 0
      && publication.lines.length <= MAX_LINES,
    'PRICE_LIST_PRODUCT_LINEAGE_INVALID',
    'Canonical publication requires a bounded non-empty ProductSku line set',
    { publicationId: publication.id },
  );

  const variants = new Map();
  for (const style of publication.styles) {
    invariant(
      SAFE_ID.test(style?.styleId ?? '')
        && style.styleVersionId === publication.styleVersionId
        && Array.isArray(style.colorways)
        && style.colorways.length > 0,
      'PRICE_LIST_PRODUCT_LINEAGE_INVALID',
      'Published Style identity must preserve the exact StyleVersion and Colorway hierarchy',
      { publicationId: publication.id },
    );
    for (const colorway of style.colorways) {
      invariant(
        SAFE_ID.test(colorway?.colorwayId ?? '')
          && Array.isArray(colorway.skus)
          && colorway.skus.length > 0,
        'PRICE_LIST_PRODUCT_LINEAGE_INVALID',
        'Published Colorway identity must contain canonical ProductSku variants',
        { publicationId: publication.id, styleVersionId: style.styleVersionId },
      );
      for (const sku of colorway.skus) {
        invariant(
          SAFE_ID.test(sku?.productSkuId ?? '')
            && !variants.has(sku.productSkuId)
            && SAFE_ID.test(sku.sizeValueId ?? '')
            && sku.size?.id === sku.sizeValueId
            && Number.isInteger(sku.size?.sortOrder)
            && sku.size.sortOrder >= 0,
          'PRICE_LIST_PRODUCT_LINEAGE_INVALID',
          'Published ProductSku must preserve unique exact ProductSku and ordered SizeValue identity',
          { publicationId: publication.id, productSkuId: sku?.productSkuId },
        );
        variants.set(sku.productSkuId, Object.freeze({ style, colorway, sku }));
      }
    }
  }

  const seenLines = new Set();
  for (const line of publication.lines) {
    const variant = variants.get(line?.productSkuId);
    invariant(
      variant
        && !seenLines.has(line.productSkuId)
        && line.sku === variant.sku.skuCode
        && line.styleVersionId === variant.style.styleVersionId
        && line.colorwayId === variant.colorway.colorwayId
        && line.sizeValueId === variant.sku.sizeValueId
        && line.catalogVersion === publication.commercialProjectionVersionNo,
      'PRICE_LIST_PRODUCT_LINEAGE_INVALID',
      'Publication line must match exactly one frozen ProductSku hierarchy row',
      { publicationId: publication.id, productSkuId: line?.productSkuId },
    );
    seenLines.add(line.productSkuId);

    const terms = variant.sku.commercialTerms;
    invariant(
      terms
        && line.currency === publication.currency
        && terms.currency === publication.currency
        && Number.isSafeInteger(line.wholesalePriceMinor)
        && line.wholesalePriceMinor > 0
        && moneyFromMinor(line.wholesalePriceMinor) === line.unitPrice
        && same(line.wholesalePriceMinor, terms.wholesalePriceMinor)
        && same(line.rrpMinor, terms.rrpMinor)
        && same(line.minimumOrderQuantity, terms.minimumOrderQuantity)
        && same(line.deliveryStart, terms.deliveryStart)
        && same(line.deliveryEnd, terms.deliveryEnd)
        && same(line.availability, terms.availability),
      'PRICE_LIST_SOURCE_TERMS_INVALID',
      'Publication price and terms must match the frozen ProductSku projection rather than mutable catalog values',
      { publicationId: publication.id, productSkuId: line.productSkuId },
    );
  }
  invariant(
    seenLines.size === variants.size,
    'PRICE_LIST_PRODUCT_LINEAGE_INVALID',
    'Every frozen ProductSku requires exactly one canonical publication line',
    { publicationId: publication.id, variants: variants.size, lines: seenLines.size },
  );
}

export function assertCanonicalPriceList(publication, priceList) {
  invariant(
    priceList?.status === 'published'
      && priceList.publicationId === publication.id
      && priceList.brandId === publication.brandId
      && priceList.currency === publication.currency
      && LINEAGE_KEYS.every((key) => same(priceList[key], publication[key]))
      && Array.isArray(priceList.lines)
      && priceList.lines.length === publication.lines.length,
    'BUYER_CATALOG_CANONICAL_PRICE_LIST_REQUIRED',
    'Buyer catalog requires the exact published ProductSku price list and projection lineage',
    { publicationId: publication.id, priceListVersionId: priceList?.id },
  );

  const sourceById = new Map(publication.lines.map((line) => [line.productSkuId, line]));
  const seen = new Set();
  for (const line of priceList.lines) {
    const source = sourceById.get(line?.productSkuId);
    invariant(
      source
        && !seen.has(line.productSkuId)
        && same(withoutBuyerPrice(line), withoutBuyerPrice(source))
        && Number.isSafeInteger(line.wholesalePriceMinor)
        && line.wholesalePriceMinor > 0
        && moneyFromMinor(line.wholesalePriceMinor) === line.unitPrice,
      'BUYER_CATALOG_PRICE_LINE_MISMATCH',
      'Buyer price line must preserve exact ProductSku source terms and one consistent server-derived price',
      { publicationId: publication.id, priceListVersionId: priceList.id, productSkuId: line?.productSkuId },
    );
    seen.add(line.productSkuId);
  }

  const expectedStyles = applyBuyerPrices(publication.styles, priceList.lines);
  invariant(
    same(priceList.styles, expectedStyles),
    'BUYER_CATALOG_PRICE_HIERARCHY_MISMATCH',
    'Buyer price hierarchy must be the exact frozen publication decorated by ProductSku-keyed prices',
    { publicationId: publication.id, priceListVersionId: priceList.id },
  );
}

export function applyBuyerPrices(styles, lines) {
  const priceByProductSku = new Map(lines.map((line) => [line.productSkuId, line]));
  return styles.map((style) => ({
    ...structuredClone(style),
    colorways: style.colorways.map((colorway) => ({
      ...structuredClone(colorway),
      skus: colorway.skus.map((sku) => {
        const price = priceByProductSku.get(sku.productSkuId);
        invariant(
          price,
          'PRICE_LIST_STYLE_SKU_MISSING',
          'Published ProductSku is missing from buyer price lines',
          { productSkuId: sku.productSkuId },
        );
        return {
          ...structuredClone(sku),
          buyerUnitPrice: price.unitPrice,
          buyerCurrency: price.currency,
          buyerMinimumOrderQuantity: price.minimumOrderQuantity,
        };
      }),
    })),
  }));
}

function withoutBuyerPrice(line) {
  const { unitPrice, wholesalePriceMinor, ...frozenSource } = line;
  return frozenSource;
}

function moneyFromMinor(value) {
  return normalizeMoney(value / 100, {
    invalidCode: 'PRICE_LIST_OVERRIDE_PRICE_INVALID',
    scaleCode: 'PRICE_LIST_OVERRIDE_PRICE_SCALE_INVALID',
    overflowCode: 'PRICE_LIST_OVERRIDE_PRICE_TOO_LARGE',
    label: 'Buyer wholesale price',
  });
}

function same(left, right) {
  if (left === undefined || right === undefined) return left === right;
  return canonicalJson(left) === canonicalJson(right);
}
