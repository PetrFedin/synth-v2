import { invariant } from '../../core/errors.mjs';

const CAMPAIGN_STATUSES = Object.freeze(['draft', 'open', 'closed']);

export function createCampaign({ id, brandId, name, season, startsAt, endsAt, createdAt }) {
  invariant(id && brandId, 'CAMPAIGN_IDENTITY_REQUIRED', 'Campaign id and brand are required');
  invariant(typeof name === 'string' && name.trim().length > 1, 'CAMPAIGN_NAME_REQUIRED', 'Campaign name is required');
  invariant(typeof season === 'string' && season.trim().length > 1, 'CAMPAIGN_SEASON_REQUIRED', 'Campaign season is required');
  invariant(Date.parse(startsAt) < Date.parse(endsAt), 'CAMPAIGN_DATES_INVALID', 'Campaign start must be before end');
  return Object.freeze({
    id,
    brandId,
    name: name.trim(),
    season: season.trim(),
    startsAt,
    endsAt,
    status: 'draft',
    version: 1,
    createdAt,
    updatedAt: createdAt,
  });
}

export function changeCampaignStatus(campaign, status, updatedAt) {
  invariant(CAMPAIGN_STATUSES.includes(status), 'CAMPAIGN_STATUS_INVALID', 'Unknown campaign status', { status });
  const allowed = campaign.status === 'draft' && status === 'open' || campaign.status === 'open' && status === 'closed';
  invariant(allowed, 'CAMPAIGN_STATUS_TRANSITION_INVALID', 'Campaign status transition is not allowed', {
    from: campaign.status,
    to: status,
  });
  return Object.freeze({ ...campaign, status, version: campaign.version + 1, updatedAt });
}
