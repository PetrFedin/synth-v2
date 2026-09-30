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

// A reusable named set of milestone lines (docs/backlog-not-yet-integrated.md, раздел H:
// «календарные шаблоны в библиотеках»). Each line names a milestone relative to an anchor date the
// caller supplies when applying the template (`+0d` order confirmed, `+60d` cargo ready, …) rather
// than to a fixed calendar date, since the same template is meant to be reused across orders whose
// anchor dates differ. Applying a template produces ordinary `createCalendarMilestone` values — a
// template is a recipe, not a new kind of milestone.
export function createCalendarMilestoneTemplate({ id, organisationId, name, lines, createdAt, createdBy }) {
  invariant(id && organisationId, 'CALENDAR_TEMPLATE_LINK_REQUIRED', 'Calendar milestone template must belong to an organisation');
  invariant(Array.isArray(lines) && lines.length >= 1 && lines.length <= 50, 'CALENDAR_TEMPLATE_LINES_INVALID', 'Calendar milestone template needs 1 to 50 lines');
  invariant(typeof createdBy === 'string' && createdBy.trim(), 'CALENDAR_TEMPLATE_CREATED_BY_REQUIRED', 'Calendar milestone template creator is required');
  const normalizedLines = lines.map((line, index) => {
    invariant(TYPES.includes(line?.type), 'CALENDAR_TYPE_INVALID', 'Unsupported calendar milestone type', { type: line?.type, index });
    const visibility = line?.visibility ?? 'private';
    invariant(VISIBILITIES.includes(visibility), 'CALENDAR_VISIBILITY_INVALID', 'Invalid calendar visibility', { index });
    invariant(Number.isInteger(line?.offsetDays), 'CALENDAR_TEMPLATE_OFFSET_INVALID', 'Offset days must be an integer', { index });
    return Object.freeze({
      title: requiredText(line?.title, 1, 200, 'CALENDAR_TITLE_INVALID', 'Calendar milestone title'),
      type: line.type,
      offsetDays: line.offsetDays,
      visibility,
    });
  });
  return Object.freeze({
    id,
    organisationId,
    name: requiredText(name, 1, 160, 'CALENDAR_TEMPLATE_NAME_INVALID', 'Calendar milestone template name'),
    lines: Object.freeze(normalizedLines),
    createdAt: requiredTimestamp(createdAt, 'CALENDAR_TEMPLATE_CREATED_AT_INVALID'),
    createdBy,
  });
}
