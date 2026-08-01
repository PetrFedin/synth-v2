import { invariant } from '../../core/errors.mjs';
import { chronologicalRange, requiredText } from '../../core/validation.mjs';

const CAMPAIGN_STATUSES = Object.freeze(['draft', 'open', 'closed']);

export function createCampaign({ id, brandId, name, season, startsAt, endsAt, createdAt }) {
  invariant(id && brandId, 'CAMPAIGN_IDENTITY_REQUIRED', 'Campaign id and brand are required');
  const normalizedName = requiredText(name, { code: 'CAMPAIGN_NAME_REQUIRED', label: 'Campaign name', max: 160 });
  const normalizedSeason = requiredText(season, { code: 'CAMPAIGN_SEASON_REQUIRED', label: 'Campaign season', max: 40 });
  const dates = chronologicalRange(startsAt, endsAt, { code: 'CAMPAIGN_DATES_INVALID', startLabel: 'Campaign start', endLabel: 'campaign end' });
  return Object.freeze({
    id,
    brandId,
    name: normalizedName,
    season: normalizedSeason,
    startsAt: dates.start,
    endsAt: dates.end,
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
