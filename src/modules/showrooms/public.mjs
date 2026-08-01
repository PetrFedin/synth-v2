import { invariant } from '../../core/errors.mjs';
import { chronologicalRange, requiredText } from '../../core/validation.mjs';

export function createShowroom({ id, collection, brandId, name, opensAt, closesAt, createdAt }) {
  invariant(id && collection?.id, 'SHOWROOM_IDENTITY_REQUIRED', 'Showroom id and collection are required');
  invariant(collection.brandId === brandId, 'SHOWROOM_BRAND_MISMATCH', 'Showroom brand must match collection brand');
  invariant(collection.status === 'published', 'COLLECTION_NOT_PUBLISHED', 'Showroom requires a published collection');
  const normalizedName = requiredText(name, { code: 'SHOWROOM_NAME_REQUIRED', label: 'Showroom name', max: 160 });
  const dates = chronologicalRange(opensAt, closesAt, { code: 'SHOWROOM_DATES_INVALID', startLabel: 'Showroom open date', endLabel: 'showroom close date' });
  return Object.freeze({
    id,
    collectionId: collection.id,
    campaignId: collection.campaignId,
    brandId,
    name: normalizedName,
    opensAt: dates.start,
    closesAt: dates.end,
    status: 'draft',
    version: 1,
    createdAt,
    updatedAt: createdAt,
  });
}

export function openShowroom(showroom, collection, updatedAt) {
  invariant(showroom.status === 'draft', 'SHOWROOM_NOT_DRAFT', 'Only a draft showroom can be opened');
  invariant(collection.id === showroom.collectionId, 'SHOWROOM_COLLECTION_MISMATCH', 'Showroom does not belong to collection');
  invariant(collection.status === 'published', 'COLLECTION_NOT_PUBLISHED', 'Showroom requires a published collection');
  return Object.freeze({ ...showroom, status: 'open', version: showroom.version + 1, updatedAt });
}

export function closeShowroom(showroom, updatedAt) {
  invariant(showroom.status === 'open', 'SHOWROOM_NOT_OPEN', 'Only an open showroom can be closed');
  return Object.freeze({ ...showroom, status: 'closed', version: showroom.version + 1, updatedAt });
}
