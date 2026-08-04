(function installMeasurementCatalogSync() {
  'use strict';

  const sync = window.SynthaMeasurementCatalogSync || (window.SynthaMeasurementCatalogSync = {
    actorKey: '',
    active: false,
    status: 'idle',
    error: '',
    generation: 0,
  });

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }

  async function fetchAllCatalogSkus(request = api) {
    const items = new Map();
    const seenCursors = new Set();
    let cursor = null;
    let pageCount = 0;
    do {
      pageCount += 1;
      if (pageCount > 500) throw new Error('MEASUREMENT_CATALOG_PAGE_LIMIT_EXCEEDED');
      const query = new URLSearchParams({ limit: '200' });
      if (cursor) query.set('cursor', cursor);
      const page = await request(`/v2/catalog/skus?${query.toString()}`);
      if (!page || !Array.isArray(page.items)) throw new Error('MEASUREMENT_CATALOG_PAGE_INVALID');
      for (const sku of page.items) {
        if (!sku || typeof sku.sku !== 'string' || !sku.sku) throw new Error('MEASUREMENT_CATALOG_SKU_INVALID');
        items.set(sku.sku, sku);
      }
      const nextCursor = page.nextCursor || null;
      if (nextCursor && seenCursors.has(nextCursor)) throw new Error('MEASUREMENT_CATALOG_CURSOR_CYCLE');
      if (nextCursor) seenCursors.add(nextCursor);
      cursor = nextCursor;
    } while (cursor);
    return Object.freeze([...items.values()]);
  }

  function actorKey() {
    return String(state.user?.actorId || state.user?.id || state.user?.email || 'anonymous');
  }

  function resetForActor(key) {
    sync.actorKey = key;
    sync.active = false;
    sync.status = 'idle';
    sync.error = '';
    sync.generation += 1;
  }

  function start() {
    if (sync.status === 'loading') return;
    sync.status = 'loading';
    sync.error = '';
    const generation = ++sync.generation;
    void fetchAllCatalogSkus().then((catalogSkus) => {
      if (generation !== sync.generation) return;
      state.workspace = { ...state.workspace, catalogSkus };
      sync.status = 'ready';
      renderApp();
    }).catch((error) => {
      if (generation !== sync.generation) return;
      sync.status = 'error';
      sync.error = error?.message || 'MEASUREMENT_CATALOG_LOAD_FAILED';
      renderApp();
    });
  }

  function loadingView() {
    const section = document.createElement('section');
    section.className = 'measurement-page';
    const card = document.createElement('div');
    card.className = 'measurement-sync-state';
    const title = document.createElement('h1');
    title.textContent = text('Загрузка полного каталога SKU', 'Loading the complete SKU catalog');
    const message = document.createElement('p');
    message.textContent = text('Размерные таблицы будут рассчитаны только после загрузки всех cursor-страниц каталога.', 'Measurement readiness is calculated only after every Catalog cursor page is loaded.');
    card.append(title, message);
    section.append(card);
    return section;
  }

  function errorView() {
    const section = document.createElement('section');
    section.className = 'measurement-page';
    const card = document.createElement('div');
    card.className = 'measurement-sync-state measurement-sync-error';
    const title = document.createElement('h1');
    title.textContent = text('Каталог SKU загружен не полностью', 'The SKU catalog is incomplete');
    const message = document.createElement('p');
    message.textContent = `${text('Расчёт готовности заблокирован:', 'Readiness calculation is blocked:')} ${sync.error}`;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'primary';
    retry.textContent = text('Повторить загрузку', 'Retry');
    retry.addEventListener('click', () => { sync.status = 'idle'; start(); renderApp(); });
    card.append(title, message, retry);
    section.append(card);
    return section;
  }

  const previousRenderView = renderView;
  renderView = (...args) => {
    const key = actorKey();
    if (sync.actorKey !== key) resetForActor(key);
    if (state.view !== 'measurements') {
      sync.active = false;
      return previousRenderView(...args);
    }
    if (!sync.active) {
      sync.active = true;
      sync.status = 'idle';
      sync.error = '';
      sync.generation += 1;
    }
    if (sync.status === 'idle') start();
    if (sync.status === 'error') return errorView();
    if (sync.status !== 'ready') return loadingView();
    return previousRenderView(...args);
  };

  Object.defineProperty(sync, 'fetchAllCatalogSkus', { value: fetchAllCatalogSkus, enumerable: true });
})();
