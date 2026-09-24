import { invariant } from '../core/errors.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9:_.-]{2,127}$/;

/** @param {{ reader?: any, catalogVersion?: string }} [options] */
export function createCategoryAttributeQueryService({ reader, catalogVersion = '0.1.0' } = {}) {
  invariant(reader && typeof reader.forActor === 'function', 'CATEGORY_ATTRIBUTE_READER_REQUIRED', 'Category attribute reader is required');
  return Object.freeze({
    async forActor(actorId, styleVersionId) {
      invariant(typeof actorId === 'string' && actorId.trim(), 'CATEGORY_ATTRIBUTE_ACTOR_REQUIRED', 'Actor is required');
      invariant(ID.test(styleVersionId ?? ''), 'PRODUCT_STYLE_VERSION_ID_INVALID', 'Style version id is invalid', { styleVersionId });
      const found = await reader.forActor(actorId, styleVersionId);
      // A style with no category has no expected field set, and that is a different answer from
      // "you may not look": both come back as an empty catalogue on purpose, so the screen cannot be
      // used to discover which styles exist.
      if (!found) return Object.freeze({ productFamily: null, catalogVersion, items: Object.freeze([]) });
      return Object.freeze({
        productFamily: found.productFamily,
        // The version a value must be written against, published beside the fields so a form cannot
        // guess it and cannot drift from the catalogue it was built from.
        catalogVersion,
        items: Object.freeze(found.attributes),
      });
    },
  });
}
