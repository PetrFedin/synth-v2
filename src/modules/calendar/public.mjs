import { invariant } from '../../core/errors.mjs';

const TYPES = Object.freeze(['buying', 'order', 'deal']);
const VISIBILITIES = Object.freeze(['private', 'shared']);

export function createCalendarMilestone({ id, ownerOrganisationId, cycleId, type, title, startsAt, visibility = 'private' }) {
  invariant(id && ownerOrganisationId && cycleId, 'CALENDAR_LINK_REQUIRED', 'Calendar milestone must be linked to owner and cycle');
  invariant(TYPES.includes(type), 'CALENDAR_TYPE_INVALID', 'Unsupported calendar milestone type', { type });
  invariant(VISIBILITIES.includes(visibility), 'CALENDAR_VISIBILITY_INVALID', 'Invalid calendar visibility');
  return Object.freeze({
    id,
    ownerOrganisationId,
    cycleId,
    type,
    title: requiredText(title, 1, 200, 'CALENDAR_TITLE_INVALID', 'Calendar milestone title'),
    startsAt: requiredTimestamp(startsAt, 'CALENDAR_STARTS_AT_INVALID'),
    visibility,
  });
}

function requiredText(value, min, max, code, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, code, `${label} must contain ${min} to ${max} characters`); return normalized; }
function requiredTimestamp(value, code) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time'); return new Date(parsed).toISOString(); }
