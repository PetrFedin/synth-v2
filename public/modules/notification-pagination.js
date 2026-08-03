(function initializeNotificationPagination(global) {
  'use strict';

  const DEFAULT_PAGE_LIMIT = 100;
  const MAX_PAGE_LIMIT = 200;

  function create({
    request,
    getNotifications,
    setNotifications,
    getUnreadCount,
    setUnreadCount,
    onChange = () => {},
    onError = () => {},
    pageLimit = DEFAULT_PAGE_LIMIT,
  } = {}) {
    if (typeof request !== 'function') throw new TypeError('Notification paging request function is required');
    if (typeof getNotifications !== 'function' || typeof setNotifications !== 'function') throw new TypeError('Notification state accessors are required');
    if (typeof getUnreadCount !== 'function' || typeof setUnreadCount !== 'function') throw new TypeError('Notification count accessors are required');
    if (typeof onChange !== 'function' || typeof onError !== 'function') throw new TypeError('Notification callbacks must be functions');
    if (!Number.isSafeInteger(pageLimit) || pageLimit < 1 || pageLimit > MAX_PAGE_LIMIT) throw new TypeError('Notification page limit must be an integer from 1 to 200');

    let generation = 0;
    let cursor = null;
    let state = 'complete';
    let lastError = null;
    let active;

    function reset(page) {
      abort();
      generation += 1;
      const normalized = normalizePage(page, null, pageLimit);
      setNotifications(normalized.items);
      setUnreadCount(normalized.unreadCount);
      cursor = normalized.nextCursor;
      state = cursor ? 'idle' : 'complete';
      lastError = null;
      onChange(snapshot());
      return snapshot();
    }

    function hasMore() { return Boolean(cursor); }
    function status() { return Object.freeze({ state, error: lastError }); }

    function loadNext() {
      if (active) return active.promise;
      if (!cursor) return Promise.resolve(false);
      const currentCursor = cursor;
      const requestGeneration = generation;
      const controller = new AbortController();
      setStatus('loading', null);
      const promise = request(
        `/v2/notifications/page?limit=${pageLimit}&cursor=${encodeURIComponent(currentCursor)}`,
        { signal: controller.signal },
      ).then(page => {
        if (controller.signal.aborted || requestGeneration !== generation) return false;
        const normalized = normalizePage(page, currentCursor, pageLimit);
        setNotifications(merge(getNotifications(), normalized.items));
        setUnreadCount(normalized.unreadCount);
        cursor = normalized.nextCursor;
        setStatus(cursor ? 'idle' : 'complete', null);
        onChange(Object.freeze({ ...snapshot(), added: normalized.items.length }));
        return true;
      }).catch(error => {
        if (controller.signal.aborted || requestGeneration !== generation || error?.name === 'AbortError') return false;
        lastError = normalizeError(error);
        setStatus('error', lastError);
        onError(lastError);
        return false;
      }).finally(() => {
        if (active?.controller === controller) active = undefined;
      });
      active = Object.freeze({ controller, promise });
      return promise;
    }

    function applyUpdated(notification) {
      const normalized = validateNotification(notification);
      const current = getNotifications();
      const previous = current.find(item => item.id === normalized.id);
      setNotifications(merge(current, [normalized]));
      if (previous?.status !== 'read' && normalized.status === 'read') {
        setUnreadCount(Math.max(0, validUnreadCount(getUnreadCount()) - 1));
      } else if (previous?.status === 'read' && normalized.status !== 'read') {
        setUnreadCount(validUnreadCount(getUnreadCount()) + 1);
      }
      onChange(snapshot());
      return normalized;
    }

    function abort() {
      if (!active) return false;
      active.controller.abort();
      active = undefined;
      if (cursor) setStatus('idle', null);
      return true;
    }

    function snapshot() {
      return Object.freeze({
        hasMore: Boolean(cursor),
        state,
        error: lastError,
        unreadCount: validUnreadCount(getUnreadCount()),
      });
    }

    function setStatus(nextState, error) {
      state = nextState;
      lastError = error;
      onChange(snapshot());
    }

    return Object.freeze({ reset, hasMore, status, loadNext, applyUpdated, abort, snapshot });
  }

  function normalizePage(page, currentCursor, pageLimit) {
    if (!page || typeof page !== 'object' || Array.isArray(page)) throw pagingError('NOTIFICATION_PAGE_INVALID', 'Notification page response is invalid');
    if (!Array.isArray(page.items) || page.items.length > pageLimit) throw pagingError('NOTIFICATION_PAGE_INVALID', 'Notification page items are invalid');
    const nextCursor = page.nextCursor;
    if (nextCursor !== null && (typeof nextCursor !== 'string' || nextCursor.length < 1 || nextCursor.length > 1024)) {
      throw pagingError('NOTIFICATION_PAGE_INVALID', 'Notification page cursor is invalid');
    }
    if (nextCursor && page.items.length === 0) throw pagingError('NOTIFICATION_PAGE_INVALID', 'Notification page cannot continue without records');
    if (currentCursor && nextCursor === currentCursor) throw pagingError('NOTIFICATION_CURSOR_LOOP', 'Notification page cursor did not advance');
    const seen = new Set();
    const items = page.items.map(item => {
      const notification = validateNotification(item);
      if (seen.has(notification.id)) throw pagingError('NOTIFICATION_PAGE_DUPLICATE', 'Notification page contains duplicate records');
      seen.add(notification.id);
      return notification;
    });
    return Object.freeze({
      items: Object.freeze(items),
      nextCursor,
      unreadCount: validUnreadCount(page.unreadCount),
    });
  }

  function validateNotification(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 160) {
      throw pagingError('NOTIFICATION_IDENTITY_INVALID', 'Notification identity is invalid');
    }
    return value;
  }

  function merge(current, incoming) {
    if (!Array.isArray(current)) throw pagingError('NOTIFICATION_STATE_INVALID', 'Notification state is invalid');
    const records = new Map();
    for (const item of current) records.set(validateNotification(item).id, item);
    for (const item of incoming) records.set(validateNotification(item).id, item);
    return Object.freeze([...records.values()]);
  }

  function validUnreadCount(value) {
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 0) throw pagingError('NOTIFICATION_COUNT_INVALID', 'Notification unread count is invalid');
    return count;
  }

  function normalizeError(error) {
    if (error instanceof Error) return error;
    return pagingError('NOTIFICATION_PAGE_FAILED', 'Notification page request failed');
  }

  function pagingError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    return error;
  }

  global.SynthaNotificationPaging = Object.freeze({ create });
})(window);
