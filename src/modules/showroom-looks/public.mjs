import { invariant } from '../../core/errors.mjs';
import { requiredText } from '../../core/validation.mjs';

// A look: one photograph, one thought, and the pieces it is made of.
//
// This is the difference between a price list and a showroom. A brand does not hand a buyer a table
// of articles and hope; it shows the season the way it wants it read, and the buyer orders from what
// they were shown. Everything here exists to keep that promise honest — most of all the rule that a
// look may only carry pieces the buyer can actually order.

const MAX_PRODUCTS = 24;

export function createShowroomLook({ id, showroom, collection, position, titleRu, titleEn, storyRu, storyEn, imageUri, skus, createdAt, createdBy }) {
  invariant(id && showroom?.id, 'SHOWROOM_LOOK_IDENTITY_REQUIRED', 'Look id and showroom are required');
  invariant(showroom.collectionId === collection?.id, 'SHOWROOM_LOOK_COLLECTION_MISMATCH',
    'A look belongs to the collection its showroom presents', { showroomId: showroom.id });
  invariant(showroom.status !== 'closed', 'SHOWROOM_CLOSED', 'A closed showroom is not composed any further', { showroomId: showroom.id });
  invariant(Number.isInteger(position) && position >= 1 && position <= 500,
    'SHOWROOM_LOOK_POSITION_INVALID', 'A look sits at a position from 1 to 500', { position });
  const nameRu = requiredText(titleRu, { code: 'SHOWROOM_LOOK_TITLE_REQUIRED', label: 'Look title', min: 2, max: 160 });
  const nameEn = requiredText(titleEn, { code: 'SHOWROOM_LOOK_TITLE_REQUIRED', label: 'Look title', min: 2, max: 160 });

  // A look with nothing in it is a photograph, and a buyer cannot order a photograph.
  invariant(Array.isArray(skus) && skus.length >= 1 && skus.length <= MAX_PRODUCTS,
    'SHOWROOM_LOOK_PRODUCTS_INVALID', `A look shows between 1 and ${MAX_PRODUCTS} products`, { count: skus?.length });
  const listed = skus.map((sku) => requiredText(sku, { code: 'SHOWROOM_LOOK_SKU_INVALID', label: 'Look SKU', min: 1, max: 120 }));
  invariant(new Set(listed).size === listed.length, 'SHOWROOM_LOOK_SKU_DUPLICATE', 'A look lists each product once');

  return Object.freeze({
    id,
    showroomId: showroom.id,
    brandId: showroom.brandId,
    collectionId: collection.id,
    position,
    titleRu: nameRu,
    titleEn: nameEn,
    storyRu: optionalStory(storyRu),
    storyEn: optionalStory(storyEn),
    imageUri: optionalUri(imageUri),
    skus: Object.freeze(listed),
    version: 1,
    createdAt,
    createdBy,
    updatedAt: createdAt,
    updatedBy: createdBy,
  });
}

export function updateShowroomLook(look, { position, titleRu, titleEn, storyRu, storyEn, imageUri, skus, updatedAt, updatedBy, expectedVersion }) {
  invariant(look?.id, 'SHOWROOM_LOOK_NOT_FOUND', 'Look is required');
  invariant(look.version === expectedVersion, 'SHOWROOM_LOOK_CONCURRENCY_CONFLICT',
    'The look was changed by someone else', { expectedVersion, actualVersion: look.version });
  const next = createShowroomLook({
    id: look.id,
    showroom: { id: look.showroomId, brandId: look.brandId, collectionId: look.collectionId, status: 'draft' },
    collection: { id: look.collectionId },
    position: position ?? look.position,
    titleRu: titleRu ?? look.titleRu,
    titleEn: titleEn ?? look.titleEn,
    storyRu: storyRu === undefined ? look.storyRu : storyRu,
    storyEn: storyEn === undefined ? look.storyEn : storyEn,
    imageUri: imageUri === undefined ? look.imageUri : imageUri,
    skus: skus ?? [...look.skus],
    createdAt: look.createdAt,
    createdBy: look.createdBy,
  });
  return Object.freeze({ ...next, version: look.version + 1, updatedAt, updatedBy });
}

function optionalStory(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return requiredText(value, { code: 'SHOWROOM_LOOK_STORY_INVALID', label: 'Look story', min: 2, max: 2000 });
}

// An image is a link, because this platform has no file store yet. Saying so in the rule is better
// than pretending: a relative path or a data URI would break the moment the page is printed or the
// link is shared with a factory.
function optionalUri(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const uri = String(value).trim();
  invariant(/^https:\/\/\S{3,1999}$/.test(uri), 'SHOWROOM_LOOK_IMAGE_INVALID',
    'A look image is an https link', { imageUri: uri.slice(0, 80) });
  return uri;
}
