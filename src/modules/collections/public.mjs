import { invariant } from '../../core/errors.mjs';
import { requiredText } from '../../core/validation.mjs';

export function createCollection({ id, campaign, brandId, name, currency, createdAt }) {
  invariant(id && campaign?.id, 'COLLECTION_IDENTITY_REQUIRED', 'Collection id and campaign are required');
  invariant(campaign.brandId === brandId, 'COLLECTION_BRAND_MISMATCH', 'Collection brand must match campaign brand');
  invariant(campaign.status !== 'closed', 'CAMPAIGN_CLOSED', 'Cannot add collection to a closed campaign');
  const normalizedName = requiredText(name, { code: 'COLLECTION_NAME_REQUIRED', label: 'Collection name', max: 160 });
  invariant(/^[A-Z]{3}$/.test(currency), 'COLLECTION_CURRENCY_INVALID', 'Collection currency must be an ISO-4217 code');
  return Object.freeze({
    id,
    campaignId: campaign.id,
    brandId,
    name: normalizedName,
    currency,
    status: 'draft',
    version: 1,
    createdAt,
    updatedAt: createdAt,
  });
}

export function publishCollection(collection, campaign, updatedAt) {
  invariant(collection.status === 'draft', 'COLLECTION_ALREADY_PUBLISHED', 'Only a draft collection can be published');
  invariant(campaign.id === collection.campaignId, 'COLLECTION_CAMPAIGN_MISMATCH', 'Collection does not belong to campaign');
  invariant(campaign.status === 'open', 'CAMPAIGN_NOT_OPEN', 'Campaign must be open before collection publication');
  return Object.freeze({ ...collection, status: 'published', version: collection.version + 1, updatedAt });
}
