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
  assertShowroomWindowNotElapsed(showroom, updatedAt);
  invariant(collection.id === showroom.collectionId, 'SHOWROOM_COLLECTION_MISMATCH', 'Showroom does not belong to collection');
  invariant(collection.status === 'published', 'COLLECTION_NOT_PUBLISHED', 'Showroom requires a published collection');
  return Object.freeze({ ...showroom, status: 'open', version: showroom.version + 1, updatedAt });
}

export function closeShowroom(showroom, updatedAt) {
  invariant(showroom.status === 'open', 'SHOWROOM_NOT_OPEN', 'Only an open showroom can be closed');
  return Object.freeze({ ...showroom, status: 'closed', closedAt: updatedAt, version: showroom.version + 1, updatedAt });
}

// Окно показа (opensAt..closesAt) — часть договора, а не подпись под названием. Статус `open`
// выставляет бренд руками, окно же говорит, когда магазину можно в нём что-то делать: до начала
// подборку не начать, после конца — не начать и не зафиксировать заказ, даже если бренд забыл
// нажать «Закрыть». Дата без времени в `closesAt` значит «весь этот день включительно» (UTC), иначе
// показ, закрывающийся «5 октября», закрылся бы в полночь на его начале.
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function showroomWindowState(showroom, now) {
  const current = Date.parse(now);
  invariant(Number.isFinite(current), 'SHOWROOM_WINDOW_CLOCK_INVALID', 'Current time must be a valid ISO date-time');
  const opensAt = typeof showroom?.opensAt === 'string' ? Date.parse(showroom.opensAt) : Number.NaN;
  const closesRaw = typeof showroom?.closesAt === 'string' ? showroom.closesAt.trim() : '';
  const closesAt = closesRaw ? Date.parse(closesRaw) + (DATE_ONLY.test(closesRaw) ? DAY_MS : 0) : Number.NaN;
  if (Number.isFinite(opensAt) && current < opensAt) return 'upcoming';
  if (Number.isFinite(closesAt) && current >= closesAt) return 'elapsed';
  return 'running';
}

export function assertShowroomWindowRunning(showroom, now) {
  const state = showroomWindowState(showroom, now);
  invariant(state !== 'upcoming', 'SHOWROOM_WINDOW_NOT_STARTED', 'Showroom window has not started yet', { showroomId: showroom?.id, opensAt: showroom?.opensAt });
  invariant(state !== 'elapsed', 'SHOWROOM_WINDOW_ELAPSED', 'Showroom window has already ended', { showroomId: showroom?.id, closesAt: showroom?.closesAt });
}

export function assertShowroomWindowNotElapsed(showroom, now) {
  invariant(showroomWindowState(showroom, now) !== 'elapsed', 'SHOWROOM_WINDOW_ELAPSED', 'Showroom window has already ended', { showroomId: showroom?.id, closesAt: showroom?.closesAt });
}
