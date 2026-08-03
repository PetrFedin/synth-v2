(function initializeWorkspacePagination(global) {
  'use strict';

  const SECTIONS = Object.freeze([
    'memberships', 'organisations', 'relationships', 'invitations', 'campaigns', 'collections',
    'catalogSkus', 'showrooms', 'cycles', 'selections', 'orders', 'deals', 'calendar',
  ]);
  const SECTION_SET = new Set(SECTIONS);
  const DEFAULT_PAGE_LIMIT = 100;
  const MAX_PAGE_LIMIT = 200;
  const DEFAULT_DRAIN_PAGES = 50;
  const MAX_DRAIN_PAGES = 100;

  function create({ request, getWorkspace, setWorkspace, onChange = () => {}, onError = () => {}, pageLimit = DEFAULT_PAGE_LIMIT } = {}) {
    if (typeof request !== 'function') throw new TypeError('Workspace paging request function is required');
    if (typeof getWorkspace !== 'function' || typeof setWorkspace !== 'function') throw new TypeError('Workspace paging state accessors are required');
    if (typeof onChange !== 'function' || typeof onError !== 'function') throw new TypeError('Workspace paging callbacks must be functions');
    if (!Number.isSafeInteger(pageLimit) || pageLimit < 1 || pageLimit > MAX_PAGE_LIMIT) throw new TypeError('Workspace page limit must be an integer from 1 to 200');

    let generation = 0;
    const cursors = new Map();
    const statuses = new Map();
    const active = new Map();

    function reset(workspace) {
      abortAll();
      generation += 1;
      cursors.clear();
      statuses.clear();
      const pageInfo = normalizePageInfo(workspace?.pageInfo);
      for (const section of pageInfo.truncatedSections) {
        const cursor = pageInfo.nextCursors[section];
        if (typeof cursor === 'string' && cursor.length > 0) {
          cursors.set(section, cursor);
          statuses.set(section, Object.freeze({ state: 'idle', error: null }));
        } else {
          statuses.set(section, Object.freeze({ state: 'error', error: pagingError('WORKSPACE_CURSOR_MISSING', 'Workspace continuation cursor is missing') }));
        }
      }
      return snapshot();
    }

    function hasMore(section) {
      validateSection(section);
      return cursors.has(section);
    }

    function status(section) {
      validateSection(section);
      return statuses.get(section) ?? Object.freeze({ state: 'complete', error: null });
    }

    function loadNext(section) {
      validateSection(section);
      if (active.has(section)) return active.get(section).promise;
      const cursor = cursors.get(section);
      if (!cursor) return Promise.resolve(false);

      const requestGeneration = generation;
      const controller = new AbortController();
      setStatus(section, 'loading', null);
      const promise = request(
        `/v2/workspace/${encodeURIComponent(section)}/page?limit=${pageLimit}&cursor=${encodeURIComponent(cursor)}`,
        { signal: controller.signal },
      ).then(page => {
        if (controller.signal.aborted || requestGeneration !== generation) return false;
        const normalized = normalizePage(section, page, cursor, pageLimit);
        const workspace = getWorkspace();
        const merged = mergeWorkspacePage(workspace, section, normalized);
        setWorkspace(merged);
        if (normalized.nextCursor) cursors.set(section, normalized.nextCursor);
        else cursors.delete(section);
        setStatus(section, normalized.nextCursor ? 'idle' : 'complete', null);
        onChange(Object.freeze({ section, added: normalized.items.length, hasMore: Boolean(normalized.nextCursor) }));
        return true;
      }).catch(error => {
        if (controller.signal.aborted || requestGeneration !== generation || error?.name === 'AbortError') return false;
        const normalized = normalizeError(error);
        setStatus(section, 'error', normalized);
        onError(normalized, section);
        return false;
      }).finally(() => {
        const current = active.get(section);
        if (current?.controller === controller) active.delete(section);
      });

      active.set(section, Object.freeze({ controller, promise }));
      return promise;
    }

    async function drain(section, { maxPages = DEFAULT_DRAIN_PAGES } = {}) {
      validateSection(section);
      if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > MAX_DRAIN_PAGES) {
        throw new TypeError('Workspace drain page budget must be an integer from 1 to 100');
      }
      if (status(section).state === 'error' && !cursors.has(section)) return false;
      let pages = 0;
      while (cursors.has(section)) {
        if (pages >= maxPages) {
          const error = pagingError('WORKSPACE_PAGE_BUDGET_EXCEEDED', 'Workspace section exceeded its automatic page budget');
          setStatus(section, 'error', error);
          onError(error, section);
          return false;
        }
        const loaded = await loadNext(section);
        if (!loaded) return !cursors.has(section);
        pages += 1;
      }
      return true;
    }

    function abort(section) {
      validateSection(section);
      const current = active.get(section);
      if (!current) return false;
      current.controller.abort();
      active.delete(section);
      if (cursors.has(section)) setStatus(section, 'idle', null);
      return true;
    }

    function abortAll() {
      for (const current of active.values()) current.controller.abort();
      active.clear();
    }

    function snapshot() {
      return Object.freeze(Object.fromEntries(SECTIONS.map(section => [section, Object.freeze({
        hasMore: cursors.has(section),
        ...status(section),
      })])));
    }

    function setStatus(section, state, error) {
      statuses.set(section, Object.freeze({ state, error }));
      onChange(Object.freeze({ section, state, hasMore: cursors.has(section) }));
    }

    return Object.freeze({ reset, hasMore, status, loadNext, drain, abort, abortAll, snapshot });
  }

  function normalizePageInfo(pageInfo) {
    const truncatedSections = Array.isArray(pageInfo?.truncatedSections)
      ? [...new Set(pageInfo.truncatedSections.filter(section => SECTION_SET.has(section)))]
      : [];
    const nextCursors = pageInfo?.nextCursors && typeof pageInfo.nextCursors === 'object' && !Array.isArray(pageInfo.nextCursors)
      ? pageInfo.nextCursors
      : {};
    return Object.freeze({ truncatedSections: Object.freeze(truncatedSections), nextCursors });
  }

  function normalizePage(section, page, currentCursor, pageLimit) {
    if (!page || typeof page !== 'object' || Array.isArray(page)) throw pagingError('WORKSPACE_PAGE_INVALID', 'Workspace page response is invalid');
    if (!Array.isArray(page.items) || page.items.length > pageLimit) throw pagingError('WORKSPACE_PAGE_INVALID', 'Workspace page items are invalid');
    const nextCursor = page.nextCursor;
    if (nextCursor !== null && (typeof nextCursor !== 'string' || nextCursor.length < 1 || nextCursor.length > 2048)) {
      throw pagingError('WORKSPACE_PAGE_INVALID', 'Workspace page cursor is invalid');
    }
    if (nextCursor && page.items.length === 0) throw pagingError('WORKSPACE_PAGE_INVALID', 'Workspace page cannot continue without records');
    if (nextCursor === currentCursor) throw pagingError('WORKSPACE_CURSOR_LOOP', 'Workspace page cursor did not advance');
    const seen = new Set();
    const items = page.items.map(item => {
      const key = identity(section, item);
      if (seen.has(key)) throw pagingError('WORKSPACE_PAGE_DUPLICATE', 'Workspace page contains duplicate records');
      seen.add(key);
      return item;
    });
    return Object.freeze({ items: Object.freeze(items), nextCursor });
  }

  function mergeWorkspacePage(workspace, section, page) {
    if (!workspace || typeof workspace !== 'object' || !Array.isArray(workspace[section])) {
      throw pagingError('WORKSPACE_STATE_INVALID', 'Workspace state is invalid');
    }
    const records = new Map();
    for (const item of workspace[section]) records.set(identity(section, item), item);
    for (const item of page.items) records.set(identity(section, item), item);

    const currentInfo = normalizePageInfo(workspace.pageInfo);
    const truncated = new Set(currentInfo.truncatedSections);
    const nextCursors = { ...currentInfo.nextCursors };
    if (page.nextCursor) {
      truncated.add(section);
      nextCursors[section] = page.nextCursor;
    } else {
      truncated.delete(section);
      delete nextCursors[section];
    }
    const truncatedSections = [...truncated].sort();
    return Object.freeze({
      ...workspace,
      [section]: Object.freeze([...records.values()]),
      pageInfo: Object.freeze({
        ...(workspace.pageInfo ?? {}),
        hasMore: truncatedSections.length > 0,
        truncatedSections: Object.freeze(truncatedSections),
        nextCursors: Object.freeze(nextCursors),
      }),
    });
  }

  function identity(section, item) {
    const value = section === 'catalogSkus' ? item?.sku : item?.id;
    if (typeof value !== 'string' || value.length < 1 || value.length > 512) {
      throw pagingError('WORKSPACE_RECORD_IDENTITY_INVALID', 'Workspace record identity is invalid');
    }
    return value;
  }

  function validateSection(section) {
    if (!SECTION_SET.has(section)) throw new TypeError(`Unsupported workspace section: ${String(section)}`);
  }

  function normalizeError(error) {
    if (error instanceof Error) return error;
    return pagingError('WORKSPACE_PAGE_FAILED', 'Workspace page request failed');
  }

  function pagingError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    return error;
  }

  global.SynthaWorkspacePaging = Object.freeze({ SECTIONS, create });
})(window);
